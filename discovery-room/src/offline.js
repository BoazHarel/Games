export const CACHE_PREFIX = 'discovery-room-';
export const CAPACITY_VERIFY_CACHE = 'discovery-room-capacity-verify';

/**
 * A real picture cache is named exactly `discovery-room-<8 hex content hash>` (see
 * `getCacheName`). Every other `discovery-room-*` cache (`-lru-metadata`, `-staging-*`,
 * `-capacity-verify`, ...) is a helper and must NEVER be treated as the live picture cache,
 * migrated into it, or deleted as an "old version".
 */
export function isVersionedCacheName(name) {
  return typeof name === 'string' && /^discovery-room-[0-9a-f]{8}$/.test(name);
}
export const DEFAULT_CAPACITY_TARGET_BYTES = 32 * 1024 * 1024; // 32 MB (~10 MB v1 + ~22 MB v2+ backlog)

export const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/main.css',
  './data/world.json',
  './src/main.js',
  './src/data-loader.js',
  './src/validator.js',
  './src/state.js',
  './src/history.js',
  './src/viewport.js',
  './src/scene-renderer.js',
  './src/camera.js',
  './src/hit-testing.js',
  './src/ui-chrome.js',
  './src/gal-mode.js',
  './src/storage.js',
  './src/offline.js',
  './assets/icons/icon-192.webp',
  './assets/icons/icon-512.webp'
];

/**
 * Normalizes an asset path to a subfolder-safe relative URL (`./...`).
 * Rejects root-relative (`/foo`) or parent-traversal (`../foo`) paths.
 */
export function normalizeRelativeAssetPath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error(`Invalid empty asset path: ${String(rawPath)}`);
  }
  const trimmed = rawPath.trim();
  if (trimmed === './') return './';
  if (trimmed.startsWith('/') || trimmed.startsWith('../') || trimmed.includes('/../')) {
    throw new Error(`Asset path must stay within "./" subfolder scope: "${trimmed}"`);
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    throw new Error(`Asset path must be relative, got absolute URL: "${trimmed}"`);
  }
  return trimmed.startsWith('./') ? trimmed : `./${trimmed}`;
}

/**
 * Collects all image assets referenced by a single stop across both day and night modes.
 */
export function getStopAllAssetUrls(stop) {
  if (!stop || typeof stop !== 'object') return [];
  const urls = new Set();

  if (stop.image && typeof stop.image === 'object') {
    if (stop.image.background) {
      urls.add(normalizeRelativeAssetPath(stop.image.background));
    }
    if (stop.image.thumbnail) {
      urls.add(normalizeRelativeAssetPath(stop.image.thumbnail));
    }
    if (stop.image.backgroundByMode && typeof stop.image.backgroundByMode === 'object') {
      for (const modeUrl of Object.values(stop.image.backgroundByMode)) {
        if (modeUrl) urls.add(normalizeRelativeAssetPath(modeUrl));
      }
    }
  }

  if (Array.isArray(stop.tappables)) {
    for (const tap of stop.tappables) {
      if (!tap || typeof tap !== 'object') continue;
      if (tap.layerImage) {
        urls.add(normalizeRelativeAssetPath(tap.layerImage));
      }
      if (tap.layerImageByMode && typeof tap.layerImageByMode === 'object') {
        for (const modeUrl of Object.values(tap.layerImageByMode)) {
          if (modeUrl) urls.add(normalizeRelativeAssetPath(modeUrl));
        }
      }
    }
  }

  if (Array.isArray(stop.moreFriends)) {
    for (const friend of stop.moreFriends) {
      if (friend?.layerImage) {
        urls.add(normalizeRelativeAssetPath(friend.layerImage));
      }
    }
  }

  return [...urls].sort();
}

/**
 * Builds the deterministic asset manifest from `world.json` and `shellAssets`.
 * Groups scene assets by branch (`root`, `B`, `A`, `C`, `D`, `G`, etc.) for lazy per-branch caching.
 */
export function buildAssetManifest(world, shellAssets = APP_SHELL_ASSETS) {
  if (!world || typeof world !== 'object' || !world.stops) {
    throw new Error('buildAssetManifest requires a valid world object.');
  }

  const normalizedShell = shellAssets.map((p) => normalizeRelativeAssetPath(p));
  const branchMap = new Map();
  const coreSceneSet = new Set();
  const allAssetSet = new Set(normalizedShell);

  const rootId = world.rootId || 'room';
  const rootStop = world.stops[rootId];
  const startStopIds = new Set([rootId]);
  if (Array.isArray(rootStop?.children)) {
    for (const id of rootStop.children) {
      startStopIds.add(id);
    }
  }
  // Include street pass-through targets (e.g. g-our-town) so initial hubs are pinned and precached
  const streetStop = world.stops?.['b-street'];
  if (Array.isArray(streetStop?.children)) {
    for (const id of streetStop.children) {
      startStopIds.add(id);
    }
  }

  const stopIds = Object.keys(world.stops).sort();
  for (const stopId of stopIds) {
    const stop = world.stops[stopId];
    if (!stop) continue;
    const branchId = stop.branch || 'root';
    if (!branchMap.has(branchId)) {
      branchMap.set(branchId, new Set());
    }
    const branchSet = branchMap.get(branchId);
    const stopUrls = getStopAllAssetUrls(stop);

    for (const url of stopUrls) {
      branchSet.add(url);
      allAssetSet.add(url);
      if (startStopIds.has(stopId)) {
        coreSceneSet.add(url);
      }
    }
  }

  const branchAssets = {};
  for (const [branchId, set] of [...branchMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    branchAssets[branchId] = [...set].sort();
  }

  const coreSceneAssets = [...coreSceneSet].sort();
  const precacheAssets = [...new Set([...normalizedShell, ...coreSceneAssets])];
  const allAssets = [...allAssetSet].sort();

  return {
    shellAssets: normalizedShell,
    coreSceneAssets,
    precacheAssets,
    branchAssets,
    allAssets
  };
}

/**
 * Computes a deterministic 8-hex-character content hash derived from `world.json`
 * (`schemaVersion`, `contentVersion`, stops) and the sorted assets manifest.
 */
export function computeContentHash(world, shellAssets = APP_SHELL_ASSETS) {
  const manifest = buildAssetManifest(world, shellAssets);
  const stopSignatures = Object.keys(world.stops)
    .sort()
    .map((id) => {
      const s = world.stops[id];
      return `${id}:${s.branch || 'root'}:${s.level}:${getStopAllAssetUrls(s).join(',')}`;
    });

  const canonicalPayload = JSON.stringify({
    schemaVersion: world.schemaVersion ?? 1,
    contentVersion: world.contentVersion ?? 'v1',
    rootId: world.rootId ?? 'room',
    shellAssets: manifest.shellAssets,
    stopSignatures
  });

  // Dual 32-bit FNV-1a hash producing 8 deterministic lowercase hex characters
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonicalPayload.length; i++) {
    const code = canonicalPayload.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code ^ (i & 0xff);
    h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1.slice(0, 4)}${hex2.slice(0, 4)}`;
}

/**
 * Returns the versioned Cache Storage name (`discovery-room-<contentHash>`) for `world`.
 */
export function getCacheName(world, shellAssets = APP_SHELL_ASSETS) {
  const hash = computeContentHash(world, shellAssets);
  return `${CACHE_PREFIX}${hash}`;
}

/**
 * Checks whether a request URL is strictly inside the Service Worker's subfolder scope.
 * Never matches sibling folders (e.g., `/Games/other-game/`) or parent paths (`/Games/`).
 */
export function isRequestWithinScope(requestUrl, scopeUrl) {
  try {
    const req = requestUrl instanceof URL ? requestUrl : new URL(String(requestUrl));
    const scope = scopeUrl instanceof URL ? scopeUrl : new URL(String(scopeUrl));
    if (req.origin !== scope.origin) return false;
    const normalizedScopePath = scope.pathname.endsWith('/')
      ? scope.pathname
      : `${scope.pathname}/`;
    return req.pathname.startsWith(normalizedScopePath);
  } catch {
    return false;
  }
}

/**
 * Resolves a relative asset path (`./...`) against the Service Worker's registration scope URL
 * and verifies that the resolved URL does not escape the scope directory.
 */
export function resolveScopedUrl(relPath, baseScopeUrl) {
  const normalizedRel = normalizeRelativeAssetPath(relPath);
  const scope = baseScopeUrl instanceof URL ? baseScopeUrl : new URL(String(baseScopeUrl));
  const resolved = new URL(normalizedRel, scope);
  if (!isRequestWithinScope(resolved, scope)) {
    throw new Error(`Resolved URL "${resolved.href}" escaped scope "${scope.href}"`);
  }
  return resolved.href;
}

/**
 * Atomically fetches and caches a complete list of assets into `cacheName`.
 * Uses a staging cache so a failed install NEVER wipes or deletes an existing active cache.
 * If ANY asset fails to fetch or returns `!response.ok`, deletes ONLY the staging cache
 * and throws so an incomplete update never activates.
 */
export async function populateVersionedCacheAtomically(
  cachesApi,
  fetchFn,
  cacheName,
  assetUrls,
  baseScopeUrl
) {
  if (typeof cacheName !== 'string' || !cacheName.startsWith(CACHE_PREFIX)) {
    throw new Error(`Cache name must start with "${CACHE_PREFIX}", got "${String(cacheName)}"`);
  }

  const uniqueUrls = [...new Set(assetUrls.map((u) => resolveScopedUrl(u, baseScopeUrl)))];
  const stagingCacheName = `${cacheName}-staging-${Date.now()}`;

  // 1. Fetch and validate ALL responses into the staging cache
  const fetchedEntries = [];
  try {
    for (const fullUrl of uniqueUrls) {
      const response = await fetchFn(fullUrl, { cache: 'no-cache' });
      if (!response || !response.ok) {
        const status = response ? response.status : 'network-error';
        throw new Error(`Failed to pre-cache "${fullUrl}" (status: ${status})`);
      }
      fetchedEntries.push({
        url: fullUrl,
        response: typeof response.clone === 'function' ? response.clone() : response
      });
    }

    // 2. Open staging cache and write all verified responses
    const stagingCache = await cachesApi.open(stagingCacheName);
    for (const entry of fetchedEntries) {
      await stagingCache.put(entry.url, entry.response);
    }

    // 3. Atomically commit verified responses to target cache
    const targetCache = await cachesApi.open(cacheName);
    for (const entry of fetchedEntries) {
      await targetCache.put(entry.url, entry.response);
    }

    // 4. Clean up staging cache
    try {
      await cachesApi.delete(stagingCacheName);
    } catch {
      // Ignore cleanup error
    }

    return {
      cacheName,
      cachedCount: fetchedEntries.length,
      urls: uniqueUrls
    };
  } catch (err) {
    // Rollback ONLY the staging cache. Existing live cache is NEVER deleted!
    try {
      await cachesApi.delete(stagingCacheName);
    } catch {
      // Ignore rollback cleanup errors
    }
    throw err;
  }
}

/**
 * Deletes outdated `discovery-room-*` caches ONLY after verifying that `activeCacheName`
 * exists in Cache Storage.
 * Migrates previously saved branch pictures from the old cache into `activeCacheName`
 * so an update never deletes pictures a child has already explored.
 * Strictly ignores any cache not prefixed with `discovery-room-` so sibling games on
 * `BoazHarel/Games` are never affected.
 */
export async function cleanupOutdatedDiscoveryRoomCaches(cachesApi, activeCacheName) {
  if (typeof activeCacheName !== 'string' || !activeCacheName.startsWith(CACHE_PREFIX)) {
    throw new Error(`Invalid activeCacheName: "${String(activeCacheName)}"`);
  }

  const allKeys = await cachesApi.keys();
  if (!allKeys.includes(activeCacheName)) {
    throw new Error(
      `Refusing to delete old caches because active cache "${activeCacheName}" does not exist.`
    );
  }

  const activeCache = await cachesApi.open(activeCacheName);
  const deleted = [];
  const preserved = [];

  for (const key of allKeys) {
    if (isVersionedCacheName(key) && key !== activeCacheName) {
      // Migrate saved branch pictures from old cache into activeCache before deleting
      try {
        const oldCache = await cachesApi.open(key);
        const oldRequests = await oldCache.keys();
        for (const req of oldRequests) {
          const reqUrl = typeof req === 'string' ? req : req.url;
          const alreadyInActive = await activeCache.match(reqUrl);
          if (!alreadyInActive) {
            const oldRes = await oldCache.match(reqUrl);
            if (oldRes) {
              await activeCache.put(reqUrl, oldRes);
            }
          }
        }
      } catch {
        // Ignore individual migration errors
      }

      await cachesApi.delete(key);
      deleted.push(key);
    } else if (key.includes('-staging-')) {
      // Clean up orphaned staging caches if any
      await cachesApi.delete(key);
      deleted.push(key);
    } else {
      preserved.push(key);
    }
  }

  return { deleted, preserved };
}

/**
 * Lazily caches missing assets for a branch into `cacheName` (strictly scoped to `baseScopeUrl`),
 * and refreshes repainted pictures in cache when visited while online.
 */
export async function cacheBranchAssets(
  cachesApi,
  fetchFn,
  cacheName,
  branchUrls,
  baseScopeUrl,
  options = {}
) {
  const { refresh = true } = options;
  if (typeof cacheName !== 'string' || !cacheName.startsWith(CACHE_PREFIX)) {
    throw new Error(`Cache name must start with "${CACHE_PREFIX}"`);
  }

  const cache = await cachesApi.open(cacheName);
  const resolvedUrls = [...new Set(branchUrls.map((u) => resolveScopedUrl(u, baseScopeUrl)))];
  let newlyCachedCount = 0;
  let refreshedCount = 0;

  for (const fullUrl of resolvedUrls) {
    const existing = await cache.match(fullUrl);
    if (existing && !refresh) {
      continue;
    }

    try {
      const response = await fetchFn(fullUrl, { cache: 'no-cache' });
      if (response && response.ok) {
        await cache.put(
          fullUrl,
          typeof response.clone === 'function' ? response.clone() : response
        );
        if (existing) {
          refreshedCount++;
        } else {
          newlyCachedCount++;
        }
      } else if (!existing) {
        throw new Error(`Failed to lazy-cache branch asset "${fullUrl}"`);
      }
    } catch (err) {
      if (!existing) {
        throw err;
      }
      // If asset already exists and network is unavailable (offline), keep existing cached asset
    }
  }

  return {
    cacheName,
    totalBranchUrls: resolvedUrls.length,
    newlyCachedCount,
    refreshedCount
  };
}

/**
 * Evicts oldest non-pinned cache entries when total cache size exceeds `maxBytes` (default 32 MB).
 * Pinned assets (shell + Room + immediate Room children) are NEVER evicted.
 */
export async function evictCacheEntriesExceedingCap(
  cachesApi,
  cacheName,
  maxBytes = DEFAULT_CAPACITY_TARGET_BYTES,
  pinnedUrls = [],
  options = {}
) {
  if (!cachesApi || typeof cacheName !== 'string') {
    return { evictedCount: 0, evictedBytes: 0, totalBytes: 0 };
  }

  const cache = await cachesApi.open(cacheName);
  const requests = await cache.keys();
  const pinnedSet = new Set(
    pinnedUrls.map((u) => (typeof u === 'string' ? u : u.url))
  );

  const lruMap = options.lruMap || {};
  const urlToLevel = new Map();
  if (options.world && options.world.stops) {
    for (const stop of Object.values(options.world.stops)) {
      const urls = getStopAllAssetUrls(stop);
      const lvl = typeof stop.level === 'number' ? stop.level : 99;
      for (const u of urls) {
        urlToLevel.set(u, Math.min(urlToLevel.get(u) ?? 99, lvl));
      }
    }
  }

  const entries = [];
  let totalBytes = 0;

  for (const req of requests) {
    const res = await cache.match(req);
    if (!res) continue;
    let byteSize = 0;
    const cl = res.headers?.get?.('content-length');
    if (cl) {
      byteSize = parseInt(cl, 10);
    }
    if (!byteSize || Number.isNaN(byteSize)) {
      try {
        const buf = await res.clone().arrayBuffer();
        byteSize = buf.byteLength;
      } catch {
        byteSize = 150 * 1024;
      }
    }
    totalBytes += byteSize;
    const reqUrl = typeof req === 'string' ? req : req.url;

    let lastAccessed = lruMap[reqUrl] || 0;
    if (!lastAccessed) {
      const dateHdr = res.headers?.get?.('date') || res.headers?.get?.('x-last-accessed');
      if (dateHdr) {
        const parsed = Date.parse(dateHdr);
        if (!Number.isNaN(parsed)) lastAccessed = parsed;
      }
    }

    let level = 99;
    for (const [relPath, lvl] of urlToLevel.entries()) {
      if (reqUrl.endsWith(relPath.slice(2))) {
        level = lvl;
        break;
      }
    }

    entries.push({
      request: req,
      url: reqUrl,
      byteSize,
      lastAccessed,
      level,
      isPinned: pinnedSet.has(reqUrl)
    });
  }

  if (totalBytes <= maxBytes) {
    return { evictedCount: 0, evictedBytes: 0, totalBytes };
  }

  const targetBudget = Math.floor(maxBytes * 0.9);
  let evictedCount = 0;
  let evictedBytes = 0;

  // Evict unpinned oldest accessed (or deepest leaves when equal) first!
  entries.sort((a, b) => {
    if (a.lastAccessed !== b.lastAccessed) {
      return a.lastAccessed - b.lastAccessed;
    }
    return b.level - a.level;
  });

  for (const entry of entries) {
    if (totalBytes <= targetBudget) break;
    if (entry.isPinned) continue;

    await cache.delete(entry.request);
    evictedCount++;
    evictedBytes += entry.byteSize;
    totalBytes -= entry.byteSize;
  }

  return { evictedCount, evictedBytes, totalBytes };
}

/**
 * Verifies ~32 MB total cache capacity (~10 MB v1 + ~22 MB v2+ backlog art) in Cache Storage
 * without browser eviction, then cleans up its temporary verification cache.
 */
export async function verifyCacheCapacity(options = {}) {
  const cachesApi =
    options.cachesApi || (typeof caches !== 'undefined' ? caches : null);
  const navigatorObj =
    options.navigatorObj || (typeof navigator !== 'undefined' ? navigator : null);
  const baseScopeUrl =
    options.baseScopeUrl ||
    (typeof window !== 'undefined' && window.location
      ? new URL('./', window.location.href).href
      : 'https://boazharel.github.io/Games/discovery-room/');

  const targetBytes =
    typeof options.targetBytes === 'number' && options.targetBytes > 0
      ? options.targetBytes
      : DEFAULT_CAPACITY_TARGET_BYTES;
  const chunkBytes =
    typeof options.chunkBytes === 'number' && options.chunkBytes > 0
      ? options.chunkBytes
      : 512 * 1024; // 512 KB per simulated branch chunk (64 chunks = 32 MB)
  const keepCache = Boolean(options.keepCache);

  if (!cachesApi) {
    throw new Error('Cache Storage API is not available in this environment.');
  }

  const entryCount = Math.ceil(targetBytes / chunkBytes);
  const cache = await cachesApi.open(CAPACITY_VERIFY_CACHE);
  const writtenUrls = [];
  let writtenBytes = 0;

  try {
    // Write deterministic binary chunks into the scoped verification cache
    const payload = new Uint8Array(chunkBytes);
    for (let i = 0; i < payload.length; i += 4096) {
      payload[i] = (i >> 12) & 0xff;
    }

    for (let idx = 0; idx < entryCount; idx++) {
      const remaining = targetBytes - writtenBytes;
      const sliceLen = Math.min(chunkBytes, remaining);
      const bodyBytes = sliceLen === chunkBytes ? payload : payload.subarray(0, sliceLen);
      const url = resolveScopedUrl(
        `./__capacity-verify__/branch-${String(idx).padStart(3, '0')}.webp`,
        baseScopeUrl
      );

      // Mark chunk index on first byte so we can verify integrity on readback
      const copy = new Uint8Array(bodyBytes);
      if (copy.length > 0) copy[0] = idx & 0xff;

      const response = new Response(copy, {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': String(copy.byteLength)
        }
      });
      await cache.put(url, response);
      writtenUrls.push({ url, expectedBytes: copy.byteLength, marker: idx & 0xff });
      writtenBytes += copy.byteLength;
    }

    // Measure peak storage usage while all ~32 MB are in Cache Storage
    let usageBytesAtPeak = 0;
    let quotaBytes = 0;
    try {
      if (navigatorObj?.storage?.estimate) {
        const est = await navigatorObj.storage.estimate();
        usageBytesAtPeak = est?.usage ?? 0;
        quotaBytes = est?.quota ?? 0;
      }
    } catch {
      // Ignore estimate errors
    }

    // Read back every single entry to verify 0 evictions
    let verifiedBytes = 0;
    let evictedCount = 0;
    for (const item of writtenUrls) {
      const match = await cache.match(item.url);
      if (!match) {
        evictedCount++;
        continue;
      }
      const buf = await match.arrayBuffer();
      const view = new Uint8Array(buf);
      if (
        buf.byteLength !== item.expectedBytes ||
        (view.length > 0 && view[0] !== item.marker)
      ) {
        evictedCount++;
        continue;
      }
      verifiedBytes += buf.byteLength;
    }

    const passed = evictedCount === 0 && verifiedBytes >= targetBytes;
    return {
      passed,
      targetBytes,
      verifiedBytes,
      verifiedMB: Number((verifiedBytes / (1024 * 1024)).toFixed(2)),
      entryCount,
      evictedCount,
      usageBytesAtPeak,
      quotaBytes,
      cleanedUp: !keepCache
    };
  } finally {
    if (!keepCache) {
      try {
        await cachesApi.delete(CAPACITY_VERIFY_CACHE);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Initializes the runtime Offline & PWA manager:
 * - Requests persistent storage (`navigator.storage.persist()`)
 * - Registers `./sw.js` with `{ scope: './' }`
 * - Lazily caches branches on demand into `discovery-room-<contentHash>`
 * - Exposes diagnostics and the ~32 MB Lenovo Tab One cache capacity verification harness
 */
export function initOfflineManager(options = {}) {
  const world = options.world;
  const storage = options.storage || null;
  const nav =
    options.navigator || (typeof navigator !== 'undefined' ? navigator : null);
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const cachesApi =
    options.caches || (typeof caches !== 'undefined' ? caches : null);
  const fetchFn =
    options.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);

  const manifest = buildAssetManifest(world);
  const contentHash = computeContentHash(world);
  const cacheName = getCacheName(world);
  const baseScopeUrl = win?.location
    ? new URL('./', win.location.href).href
    : 'https://boazharel.github.io/Games/discovery-room/';

  const cachedBranches = new Set();
  const branchInFlight = new Map();
  let swScope = baseScopeUrl;
  let swState = 'unsupported';
  let lastCapacityReport = null;

  async function sendMessageToSw(payload, timeoutMs = 4000) {
    if (!nav?.serviceWorker) return null;
    try {
      const reg = await nav.serviceWorker.ready;
      const targetSw = reg?.active || nav.serviceWorker.controller;
      if (!targetSw) return null;

      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        if (typeof MessageChannel !== 'undefined') {
          const channel = new MessageChannel();
          channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data || null);
          };
          targetSw.postMessage(payload, [channel.port2]);
        } else {
          targetSw.postMessage(payload);
          clearTimeout(timer);
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }

  /**
   * Lazily caches all assets for `branchId` (e.g. 'root', 'B', 'A', 'C', 'D', 'G').
   */
  async function cacheBranch(branchId) {
    if (!branchId || !manifest.branchAssets[branchId]) {
      return { branchId, cached: false, reason: 'unknown-branch' };
    }
    if (branchInFlight.has(branchId)) {
      return branchInFlight.get(branchId);
    }

    const promise = (async () => {
      const urls = manifest.branchAssets[branchId];
      let cachedViaSw = false;

      // 1. Ask Service Worker to cache the branch if active
      const swReply = await sendMessageToSw({
        type: 'CACHE_BRANCH',
        branchId,
        cacheName,
        urls
      });
      if (swReply && swReply.ok) {
        cachedViaSw = true;
      }

      // 2. Also ensure branch assets exist in Cache Storage directly as fallback
      if (!cachedViaSw && cachesApi && fetchFn) {
        await cacheBranchAssets(cachesApi, fetchFn, cacheName, urls, baseScopeUrl);
      }

      // 3. Enforce 32 MB cache cap with pinned core assets
      if (cachesApi) {
        const pinnedUrls = [
          ...manifest.precacheAssets.map((u) => resolveScopedUrl(u, baseScopeUrl)),
          resolveScopedUrl('./', baseScopeUrl)
        ];
        await evictCacheEntriesExceedingCap(
          cachesApi,
          cacheName,
          DEFAULT_CAPACITY_TARGET_BYTES,
          pinnedUrls
        );
      }

      cachedBranches.add(branchId);
      return {
        branchId,
        cached: true,
        cacheName,
        urlCount: urls.length
      };
    })();

    branchInFlight.set(branchId, promise);
    try {
      return await promise;
    } finally {
      branchInFlight.delete(branchId);
    }
  }

  /**
   * Lazily caches all branches associated with a stop and its immediate children.
   * At the Room root (L0), immediate hubs are already in the core install set (manifest.precacheAssets);
   * deeper expansion branches are cached lazily when visited.
   */
  async function cacheNeighborhoodBranches(stopId) {
    const stop = world?.stops?.[stopId];
    if (!stop) return;
    const rootId = world?.rootId || 'room';
    const branchesToCache = new Set([stop.branch || 'root']);
    if (stopId !== rootId && Array.isArray(stop.children)) {
      for (const childId of stop.children) {
        const child = world.stops[childId];
        if (child?.branch) {
          branchesToCache.add(child.branch);
        }
      }
    }
    await Promise.all([...branchesToCache].map((b) => cacheBranch(b).catch(() => null)));
  }

  /**
   * Caches every branch currently present in `world.json`.
   */
  async function cacheAllBranches() {
    const branchIds = Object.keys(manifest.branchAssets);
    await Promise.all(branchIds.map((b) => cacheBranch(b)));
    return [...cachedBranches].sort();
  }

  // Kick off persistent storage request + SW registration + initial branch caching
  const readyPromise = (async () => {
    if (storage && typeof storage.requestPersistentStorage === 'function') {
      await storage.requestPersistentStorage();
    } else if (nav?.storage?.persist) {
      try {
        await nav.storage.persist();
      } catch {
        // Ignore
      }
    }

    if (nav?.serviceWorker?.register) {
      try {
        swState = 'registering';
        const reg = await nav.serviceWorker.register('./sw.js', { scope: './' });
        swScope = reg.scope || baseScopeUrl;
        await nav.serviceWorker.ready;
        swState = 'activated';
      } catch {
        swState = 'error';
      }
    }

    // Pre-cache core set (shell + Room + immediate Room children)
    try {
      if (cachesApi && fetchFn) {
        await cacheBranchAssets(
          cachesApi,
          fetchFn,
          cacheName,
          manifest.precacheAssets,
          baseScopeUrl
        );
      }
      cachedBranches.add('root');
    } catch {
      // Offline reload may already have all assets cached; mark cached branches from Cache Storage
      if (cachesApi) {
        try {
          const cache = await cachesApi.open(cacheName);
          for (const [bId, urls] of Object.entries(manifest.branchAssets)) {
            if (urls.length === 0) continue;
            const firstMatch = await cache.match(resolveScopedUrl(urls[0], baseScopeUrl));
            if (firstMatch) cachedBranches.add(bId);
          }
        } catch {
          // Ignore
        }
      }
    }

    return {
      cacheName,
      contentHash,
      swScope,
      swState,
      cachedBranches: [...cachedBranches].sort()
    };
  })();

  async function runCapacityVerification(verifyOpts = {}) {
    const report = await verifyCacheCapacity({
      cachesApi,
      navigatorObj: nav,
      baseScopeUrl,
      ...verifyOpts
    });
    lastCapacityReport = report;
    return report;
  }

  function getDiagnostics() {
    return {
      cacheName,
      contentHash,
      swScope,
      swState,
      cachedBranches: [...cachedBranches].sort(),
      lastCapacityReport
    };
  }

  return {
    cacheName,
    contentHash,
    manifest,
    cacheBranch,
    cacheNeighborhoodBranches,
    cacheAllBranches,
    verifyCacheCapacity: runCapacityVerification,
    evictCacheEntriesExceedingCap: (maxBytes, pinnedUrls) =>
      evictCacheEntriesExceedingCap(cachesApi, cacheName, maxBytes, pinnedUrls),
    getDiagnostics,
    waitUntilReady: () => readyPromise
  };
}
