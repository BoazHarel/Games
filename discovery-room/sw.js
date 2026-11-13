const CACHE_PREFIX = 'discovery-room-';

// A real picture cache is exactly `discovery-room-<8 hex content hash>`. Helper caches
// (`-lru-metadata`, `-staging-*`, `-capacity-verify`) are never the live cache, never migrated
// into it, and never deleted as outdated versions. Mirrors `isVersionedCacheName` in src/offline.js.
function isVersionedCacheName(name) {
  return typeof name === 'string' && /^discovery-room-[0-9a-f]{8}$/.test(name);
}
const DEFAULT_CAPACITY_TARGET_BYTES = 32 * 1024 * 1024; // 32 MB offline cache cap (ADR 0004 / Issue #78)

const APP_SHELL_ASSETS = [
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

let activeCacheName = null;
let activeContentHash = null;

function getScopeUrl() {
  if (self.registration && self.registration.scope) {
    return new URL(self.registration.scope);
  }
  return new URL('./', self.location.href);
}

function normalizeRelativeAssetPath(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (trimmed === './') return './';
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('../') || trimmed.includes('/../')) {
    throw new Error(`Invalid relative asset path: "${trimmed}"`);
  }
  return trimmed.startsWith('./') ? trimmed : `./${trimmed}`;
}

function isRequestWithinScope(requestUrl, scopeUrl) {
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

function resolveScopedUrl(relPath, scopeUrl) {
  const normalizedRel = normalizeRelativeAssetPath(relPath);
  const resolved = new URL(normalizedRel, scopeUrl);
  if (!isRequestWithinScope(resolved, scopeUrl)) {
    throw new Error(`Resolved URL "${resolved.href}" escaped scope "${scopeUrl.href}"`);
  }
  return resolved.href;
}

function getStopAllAssetUrls(stop) {
  if (!stop || typeof stop !== 'object') return [];
  const urls = new Set();
  if (stop.image && typeof stop.image === 'object') {
    if (stop.image.background) urls.add(normalizeRelativeAssetPath(stop.image.background));
    if (stop.image.thumbnail) urls.add(normalizeRelativeAssetPath(stop.image.thumbnail));
    if (stop.image.backgroundByMode && typeof stop.image.backgroundByMode === 'object') {
      for (const modeUrl of Object.values(stop.image.backgroundByMode)) {
        if (modeUrl) urls.add(normalizeRelativeAssetPath(modeUrl));
      }
    }
  }
  if (Array.isArray(stop.tappables)) {
    for (const tap of stop.tappables) {
      if (!tap || typeof tap !== 'object') continue;
      if (tap.layerImage) urls.add(normalizeRelativeAssetPath(tap.layerImage));
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

function computeManifestAndHash(world) {
  const normalizedShell = APP_SHELL_ASSETS.map((p) => normalizeRelativeAssetPath(p));
  const allAssetSet = new Set(normalizedShell);
  const coreSceneSet = new Set();
  const rootId = world.rootId || 'room';
  const rootStop = world.stops?.[rootId];
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

  const stopIds = Object.keys(world.stops || {}).sort();

  const stopSignatures = stopIds.map((id) => {
    const s = world.stops[id];
    const stopUrls = getStopAllAssetUrls(s);
    for (const u of stopUrls) {
      allAssetSet.add(u);
      if (startStopIds.has(id)) {
        coreSceneSet.add(u);
      }
    }
    return `${id}:${s.branch || 'root'}:${s.level}:${stopUrls.join(',')}`;
  });

  const canonicalPayload = JSON.stringify({
    schemaVersion: world.schemaVersion ?? 1,
    contentVersion: world.contentVersion ?? 'v1',
    rootId: world.rootId ?? 'room',
    shellAssets: normalizedShell,
    stopSignatures
  });

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
  const contentHash = `${hex1.slice(0, 4)}${hex2.slice(0, 4)}`;
  const cacheName = `${CACHE_PREFIX}${contentHash}`;

  const coreSceneAssets = [...coreSceneSet].sort();
  const precacheAssets = [...new Set([...normalizedShell, ...coreSceneSet])].sort();

  return {
    contentHash,
    cacheName,
    coreSceneAssets,
    precacheAssets,
    allAssets: [...allAssetSet].sort()
  };
}

async function resolveActiveCacheName() {
  if (activeCacheName) return activeCacheName;
  const keys = await self.caches.keys();
  const drKeys = keys.filter(isVersionedCacheName);
  if (drKeys.length > 0) {
    activeCacheName = drKeys[drKeys.length - 1];
    activeContentHash = activeCacheName.slice(CACHE_PREFIX.length);
    return activeCacheName;
  }
  return null;
}

const LRU_CACHE_NAME = 'discovery-room-lru-metadata';
const LRU_ENTRY_URL = 'https://discovery-room.internal/lru-state.json';

let inMemoryLru = null;
let lruDirty = false;

async function getLruMap() {
  if (inMemoryLru) return inMemoryLru;
  try {
    const c = await self.caches.open(LRU_CACHE_NAME);
    const res = await c.match(LRU_ENTRY_URL);
    if (res) {
      inMemoryLru = await res.json();
      return inMemoryLru;
    }
  } catch {
    // Ignore cache read error
  }
  inMemoryLru = {};
  return inMemoryLru;
}

function recordLruAccess(url) {
  if (!url) return;
  if (!inMemoryLru) inMemoryLru = {};
  inMemoryLru[url] = Date.now();
  lruDirty = true;
}

async function persistLruMap() {
  if (!lruDirty || !inMemoryLru) return;
  try {
    const c = await self.caches.open(LRU_CACHE_NAME);
    await c.put(
      LRU_ENTRY_URL,
      new Response(JSON.stringify(inMemoryLru), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    lruDirty = false;
  } catch {
    // Ignore cache write error
  }
}

/**
 * Evicts oldest non-pinned cache entries when total cache size exceeds `maxBytes` (32 MB cap).
 * Pinned assets (shell, Room, and initial hubs including Our town) are NEVER evicted.
 * Unpinned entries are sorted by LRU access timestamp and tree level so deep unvisited leaves
 * are pruned first while visited branch pictures and near hubs are kept.
 */
async function evictIfOverCapacity(
  cache,
  pinnedScopedUrls,
  maxBytes = DEFAULT_CAPACITY_TARGET_BYTES,
  worldData = null
) {
  const requests = await cache.keys();
  const pinnedSet = new Set(pinnedScopedUrls);
  const lruMap = await getLruMap();
  const entries = [];
  let totalBytes = 0;

  const urlToLevel = new Map();
  if (worldData && worldData.stops) {
    for (const stop of Object.values(worldData.stops)) {
      const urls = getStopAllAssetUrls(stop);
      const lvl = typeof stop.level === 'number' ? stop.level : 99;
      for (const u of urls) {
        urlToLevel.set(u, Math.min(urlToLevel.get(u) ?? 99, lvl));
      }
    }
  }

  for (const req of requests) {
    const reqUrl = typeof req === 'string' ? req : req.url;
    if (reqUrl === LRU_ENTRY_URL) continue;

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

  // Evict unpinned entries with oldest access time (or highest level/depth when equal) first!
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
    delete lruMap[entry.url];
    lruDirty = true;
    evictedCount++;
    evictedBytes += entry.byteSize;
    totalBytes -= entry.byteSize;
  }

  await persistLruMap();
  return { evictedCount, evictedBytes, totalBytes };
}

/**
 * Atomic install:
 * Fetches `./data/world.json`, computes the deterministic versioned cache name
 * (`discovery-room-<contentHash>`), and precaches ONLY the core set (shell + Room +
 * immediate Room children = ~2.225 MiB, well under the 32 MB cap) before activating.
 *
 * Uses an isolated staging cache (`discovery-room-staging-...`) during installation so
 * a network interruption or failed install NEVER wipes or deletes the tablet's live cache.
 * If any core asset fails to fetch, rolls back ONLY the staging cache.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const scopeUrl = getScopeUrl();
      const worldUrl = resolveScopedUrl('./data/world.json', scopeUrl);
      const worldRes = await fetch(worldUrl, { cache: 'no-cache' });
      if (!worldRes.ok) {
        throw new Error(`SW install failed to fetch world.json (${worldRes.status})`);
      }
      const world = await worldRes.json();
      const { contentHash, cacheName, precacheAssets } = computeManifestAndHash(world);

      const scopedUrls = [...new Set(precacheAssets.map((u) => resolveScopedUrl(u, scopeUrl)))];
      const fetchedEntries = [];
      const stagingCacheName = `discovery-room-staging-${contentHash}-${Date.now()}`;

      try {
        for (const fullUrl of scopedUrls) {
          const response = await fetch(fullUrl, { cache: 'no-cache' });
          if (!response || !response.ok) {
            throw new Error(`SW install failed to pre-cache ${fullUrl}`);
          }
          fetchedEntries.push({ url: fullUrl, response: response.clone() });
        }

        const stagingCache = await self.caches.open(stagingCacheName);
        for (const entry of fetchedEntries) {
          await stagingCache.put(entry.url, entry.response);
        }

        // Also map "./index.html" to the scope root "./" so offline navigations to "./" resolve
        const indexUrl = resolveScopedUrl('./index.html', scopeUrl);
        const rootUrl = resolveScopedUrl('./', scopeUrl);
        const indexMatch = await stagingCache.match(indexUrl);
        if (indexMatch) {
          await stagingCache.put(rootUrl, indexMatch.clone());
        }

        activeCacheName = cacheName;
        activeContentHash = contentHash;
        await self.skipWaiting();
      } catch (err) {
        // Rollback ONLY the staging cache. Live active cache is NEVER deleted!
        try {
          await self.caches.delete(stagingCacheName);
        } catch {
          // Ignore staging rollback error
        }
        throw err;
      }
    })()
  );
});

/**
 * Atomic activate:
 * Commits fresh entries from staging caches into `currentCache`.
 * Migrates saved branch pictures from previous `discovery-room-*` caches so updates
 * never delete places a child has explored.
 * Revalidates migrated pictures in background if online to refresh any repainted art.
 * Strictly ignores sibling game caches on `BoazHarel/Games`.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const currentCache = await resolveActiveCacheName();
      if (!currentCache) {
        await self.clients.claim();
        return;
      }

      const allKeys = await self.caches.keys();
      const targetCache = await self.caches.open(currentCache);

      // 1. Commit all entries from staging caches into targetCache
      const stagingKeys = allKeys.filter((k) => k.startsWith('discovery-room-staging-'));
      for (const sKey of stagingKeys) {
        try {
          const sCache = await self.caches.open(sKey);
          const sRequests = await sCache.keys();
          for (const req of sRequests) {
            const res = await sCache.match(req);
            if (res) {
              await targetCache.put(req, res);
            }
          }
          await self.caches.delete(sKey);
        } catch {
          // Ignore staging cleanup error
        }
      }

      // 2. Migrate saved branch pictures from previous discovery-room-* caches
      const oldKeys = allKeys.filter(
        (k) => isVersionedCacheName(k) && k !== currentCache
      );

      const migratedUrls = [];
      for (const oldKey of oldKeys) {
        try {
          const oldCache = await self.caches.open(oldKey);
          const oldRequests = await oldCache.keys();
          for (const req of oldRequests) {
            const reqUrl = typeof req === 'string' ? req : req.url;
            const existing = await targetCache.match(reqUrl);
            if (!existing) {
              const oldRes = await oldCache.match(reqUrl);
              if (oldRes) {
                await targetCache.put(reqUrl, oldRes);
                migratedUrls.push(reqUrl);
              }
            }
          }
          await self.caches.delete(oldKey);
        } catch {
          // Ignore old cache cleanup error
        }
      }

      // 3. Background revalidation of carried-over branch pictures if online (refreshes repainted art)
      if (migratedUrls.length > 0) {
        for (const url of migratedUrls) {
          fetch(url, { cache: 'no-cache' })
            .then(async (freshRes) => {
              if (freshRes && freshRes.ok) {
                const c = await self.caches.open(currentCache);
                await c.put(url, freshRes);
              }
            })
            .catch(() => {});
        }
      }

      // 4. Ensure total cache size stays within the 32 MB cap
      try {
        const scopeUrl = getScopeUrl();
        const worldUrl = resolveScopedUrl('./data/world.json', scopeUrl);
        const cachedWorldRes = await targetCache.match(worldUrl);
        let pinnedUrls = APP_SHELL_ASSETS.map((u) => resolveScopedUrl(u, scopeUrl));
        pinnedUrls.push(resolveScopedUrl('./', scopeUrl));
        let worldData = null;
        if (cachedWorldRes) {
          try {
            worldData = await cachedWorldRes.clone().json();
            const m = computeManifestAndHash(worldData);
            pinnedUrls = [
              ...new Set([
                ...pinnedUrls,
                ...m.precacheAssets.map((u) => resolveScopedUrl(u, scopeUrl))
              ])
            ];
          } catch {
            // Ignore manifest parse error
          }
        }
        await evictIfOverCapacity(targetCache, pinnedUrls, DEFAULT_CAPACITY_TARGET_BYTES, worldData);
      } catch {
        // Ignore eviction error
      }

      await self.clients.claim();
    })()
  );
});

/**
 * Scoped fetch handler:
 * Intercepts ONLY GET requests within `self.registration.scope` (`/Games/discovery-room/`).
 * Never intercepts requests to sibling game folders or parent directories.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const scopeUrl = getScopeUrl();
  const reqUrl = new URL(request.url);
  if (!isRequestWithinScope(reqUrl, scopeUrl)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cacheName = await resolveActiveCacheName();
      const normalizedUrl = new URL(reqUrl.href);
      normalizedUrl.hash = '';
      normalizedUrl.search = '';

      if (cacheName) {
        const cache = await self.caches.open(cacheName);
        const cached = await cache.match(normalizedUrl.href);
        if (cached) {
          // Stale-while-revalidate for media when online: instant rendering + background cache refresh for repainted pictures
          const isMedia =
            request.destination === 'image' ||
            /\.(webp|png|jpe?g|svg|gif|avif)$/i.test(normalizedUrl.pathname);
          if (isMedia) {
            recordLruAccess(normalizedUrl.href);
            persistLruMap().catch(() => {});
            fetch(request, { cache: 'no-cache' })
              .then(async (freshRes) => {
                if (freshRes && freshRes.ok) {
                  const c = await self.caches.open(cacheName);
                  await c.put(normalizedUrl.href, freshRes);
                }
              })
              .catch(() => {});
          }
          return cached;
        }

        if (request.mode === 'navigate' || normalizedUrl.pathname === scopeUrl.pathname) {
          const indexUrl = resolveScopedUrl('./index.html', scopeUrl);
          const indexCached = await cache.match(indexUrl);
          if (indexCached) {
            return indexCached;
          }
        }
      }

      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok && cacheName) {
          const cache = await self.caches.open(cacheName);
          await cache.put(normalizedUrl.href, networkResponse.clone());
          recordLruAccess(normalizedUrl.href);
          persistLruMap().catch(() => {});
        }
        return networkResponse;
      } catch (fetchErr) {
        // Graceful offline fallback: when device is offline and resource is not in cache
        if (cacheName) {
          const cache = await self.caches.open(cacheName);
          if (request.mode === 'navigate' || normalizedUrl.pathname === scopeUrl.pathname) {
            const indexUrl = resolveScopedUrl('./index.html', scopeUrl);
            const indexCached = await cache.match(indexUrl);
            if (indexCached) {
              return indexCached;
            }
          }
        }

        const isImage =
          request.destination === 'image' ||
          /\.(webp|png|jpe?g|svg|gif|avif)$/i.test(normalizedUrl.pathname);

        if (isImage) {
          return new Response(
            `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <rect width="1600" height="900" fill="#202531"/>
  <rect x="560" y="270" width="480" height="360" rx="32" fill="#2b3242" stroke="#4a5568" stroke-width="4"/>
  <g fill="none" stroke="#a0aec0" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(680, 350)">
    <rect x="0" y="0" width="240" height="170" rx="20" stroke="#718096" stroke-width="5"/>
    <circle cx="65" cy="55" r="18" fill="#4a5568" stroke="#a0aec0"/>
    <path d="M25 140 L95 80 L155 130 L185 105 L215 135" stroke="#a0aec0"/>
  </g>
  <path d="M740 330 C740 305 760 285 785 285 C795 265 820 260 840 275 C855 265 880 270 885 290 C905 295 915 315 905 335 Z" fill="#3b4458" stroke="#718096" stroke-width="4" stroke-linejoin="round"/>
</svg>`,
            {
              status: 200,
              headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'no-store'
              }
            }
          );
        }

        throw fetchErr;
      }
    })()
  );
});

/**
 * Message handler supporting on-demand lazy branch caching (`CACHE_BRANCH`) and status queries.
 */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  const replyPort = event.ports && event.ports[0] ? event.ports[0] : null;

  if (data.type === 'CACHE_BRANCH') {
    event.waitUntil(
      (async () => {
        try {
          const scopeUrl = getScopeUrl();
          const targetCacheName =
            isVersionedCacheName(data.cacheName)
              ? data.cacheName
              : await resolveActiveCacheName();

          if (!targetCacheName) {
            if (replyPort) replyPort.postMessage({ ok: false, error: 'no-active-cache' });
            return;
          }

          const cache = await self.caches.open(targetCacheName);
          const urls = Array.isArray(data.urls) ? data.urls : [];
          let newlyCached = 0;
          let refreshed = 0;

          for (const relUrl of urls) {
            const fullUrl = resolveScopedUrl(relUrl, scopeUrl);
            const existing = await cache.match(fullUrl);
            try {
              const res = await fetch(fullUrl, { cache: 'no-cache' });
              if (res && res.ok) {
                await cache.put(fullUrl, res.clone());
                recordLruAccess(fullUrl);
                if (existing) {
                  refreshed++;
                } else {
                  newlyCached++;
                }
              } else if (!existing) {
                throw new Error(`Failed to cache branch asset ${fullUrl}`);
              }
            } catch (fetchErr) {
              if (!existing) {
                throw fetchErr;
              }
              // If asset already exists and network is unavailable (offline), keep existing cached asset
            }
          }
          await persistLruMap();

          let evictionReport = { evictedCount: 0, evictedBytes: 0 };
          if (newlyCached > 0 || refreshed > 0) {
            // Keep shell + core Room/hub precache assets pinned
            let pinnedUrls = APP_SHELL_ASSETS.map((u) => resolveScopedUrl(u, scopeUrl));
            pinnedUrls.push(resolveScopedUrl('./', scopeUrl));
            let worldData = null;
            try {
              const worldUrl = resolveScopedUrl('./data/world.json', scopeUrl);
              const cachedWorldRes = await cache.match(worldUrl);
              if (cachedWorldRes) {
                worldData = await cachedWorldRes.clone().json();
                const m = computeManifestAndHash(worldData);
                pinnedUrls = [
                  ...new Set([
                    ...pinnedUrls,
                    ...m.precacheAssets.map((u) => resolveScopedUrl(u, scopeUrl))
                  ])
                ];
              }
            } catch {
              // Ignore manifest parse errors; fallback pinnedUrls retains shell assets
            }
            evictionReport = await evictIfOverCapacity(
              cache,
              pinnedUrls,
              DEFAULT_CAPACITY_TARGET_BYTES,
              worldData
            );
          }

          if (replyPort) {
            replyPort.postMessage({
              ok: true,
              branchId: data.branchId,
              cacheName: targetCacheName,
              newlyCached,
              refreshed,
              evictedCount: evictionReport.evictedCount
            });
          }
        } catch (err) {
          if (replyPort) {
            replyPort.postMessage({ ok: false, error: err.message });
          }
        }
      })()
    );
  } else if (data.type === 'TRIM_CACHE') {
    event.waitUntil(
      (async () => {
        try {
          const scopeUrl = getScopeUrl();
          const targetCacheName = isVersionedCacheName(data.cacheName)
            ? data.cacheName
            : await resolveActiveCacheName();
          if (!targetCacheName) {
            throw new Error('No active cache for trim.');
          }
          const cache = await self.caches.open(targetCacheName);
          const worldUrl = resolveScopedUrl('./data/world.json', scopeUrl);
          const cachedWorldRes = await cache.match(worldUrl);
          let pinnedUrls = APP_SHELL_ASSETS.map((u) => resolveScopedUrl(u, scopeUrl));
          pinnedUrls.push(resolveScopedUrl('./', scopeUrl));
          let worldData = null;
          if (cachedWorldRes) {
            try {
              worldData = await cachedWorldRes.clone().json();
              const m = computeManifestAndHash(worldData);
              pinnedUrls = [
                ...new Set([
                  ...pinnedUrls,
                  ...m.precacheAssets.map((u) => resolveScopedUrl(u, scopeUrl))
                ])
              ];
            } catch {
              // Ignore parse error
            }
          }
          const report = await evictIfOverCapacity(
            cache,
            pinnedUrls,
            DEFAULT_CAPACITY_TARGET_BYTES,
            worldData
          );
          if (replyPort) {
            replyPort.postMessage({ ok: true, report });
          }
        } catch (err) {
          if (replyPort) {
            replyPort.postMessage({ ok: false, error: err.message });
          }
        }
      })()
    );
  } else if (data.type === 'GET_SW_STATUS') {
    event.waitUntil(
      (async () => {
        const cacheName = await resolveActiveCacheName();
        if (replyPort) {
          replyPort.postMessage({
            ok: true,
            activeCacheName: cacheName,
            contentHash: activeContentHash,
            scope: getScopeUrl().href
          });
        }
      })()
    );
  }
});
