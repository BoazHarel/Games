export const CACHE_PREFIX = 'discovery-room-';
export const CAPACITY_VERIFY_CACHE = 'discovery-room-capacity-verify';
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
  const immediateChildIds = new Set(Array.isArray(rootStop?.children) ? rootStop.children : []);

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
      if (stopId === rootId || immediateChildIds.has(stopId)) {
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
 * If ANY asset fails to fetch or returns `!response.ok`, deletes the incomplete `cacheName`
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

  // 1. Fetch and validate ALL responses before committing the cache activation
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

    // 2. Open the versioned cache and write all verified responses
    const cache = await cachesApi.open(cacheName);
    for (const entry of fetchedEntries) {
      await cache.put(entry.url, entry.response);
    }

    return {
      cacheName,
      cachedCount: fetchedEntries.length,
      urls: uniqueUrls
    };
  } catch (err) {
    // Rollback incomplete versioned cache so old cache stays active
    try {
      await cachesApi.delete(cacheName);
    } catch {
      // Ignore rollback cleanup errors
    }
    throw err;
  }
}

/**
 * Deletes outdated `discovery-room-*` caches ONLY after verifying that `activeCacheName`
 * exists in Cache Storage. Strictly ignores any cache not prefixed with `discovery-room-`
 * so sibling games on `BoazHarel/Games` are never affected.
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

  const deleted = [];
  const preserved = [];

  for (const key of allKeys) {
    if (
      key.startsWith(CACHE_PREFIX) &&
      key !== activeCacheName &&
      key !== CAPACITY_VERIFY_CACHE
    ) {
      await cachesApi.delete(key);
      deleted.push(key);
    } else {
      preserved.push(key);
    }
  }

  return { deleted, preserved };
}

/**
 * Lazily caches any missing assets for a branch into `cacheName` (strictly scoped to `baseScopeUrl`).
 */
export async function cacheBranchAssets(
  cachesApi,
  fetchFn,
  cacheName,
  branchUrls,
  baseScopeUrl
) {
  if (typeof cacheName !== 'string' || !cacheName.startsWith(CACHE_PREFIX)) {
    throw new Error(`Cache name must start with "${CACHE_PREFIX}"`);
  }

  const cache = await cachesApi.open(cacheName);
  const resolvedUrls = [...new Set(branchUrls.map((u) => resolveScopedUrl(u, baseScopeUrl)))];
  let newlyCachedCount = 0;

  for (const fullUrl of resolvedUrls) {
    const existing = await cache.match(fullUrl);
    if (existing) continue;

    const response = await fetchFn(fullUrl);
    if (!response || !response.ok) {
      throw new Error(`Failed to lazy-cache branch asset "${fullUrl}"`);
    }
    await cache.put(
      fullUrl,
      typeof response.clone === 'function' ? response.clone() : response
    );
    newlyCachedCount++;
  }

  return {
    cacheName,
    totalBranchUrls: resolvedUrls.length,
    newlyCachedCount
  };
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
   */
  async function cacheNeighborhoodBranches(stopId) {
    const stop = world?.stops?.[stopId];
    if (!stop) return;
    const branchesToCache = new Set([stop.branch || 'root']);
    if (Array.isArray(stop.children)) {
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

    // Pre-cache shell + all v1 branches in background so first visit is 100% offline-ready
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
      await cacheAllBranches();
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
    getDiagnostics,
    waitUntilReady: () => readyPromise
  };
}
