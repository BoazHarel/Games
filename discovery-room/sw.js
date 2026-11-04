const CACHE_PREFIX = 'discovery-room-';
const CAPACITY_VERIFY_CACHE = 'discovery-room-capacity-verify';

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
  return [...urls].sort();
}

function computeManifestAndHash(world) {
  const normalizedShell = APP_SHELL_ASSETS.map((p) => normalizeRelativeAssetPath(p));
  const allAssetSet = new Set(normalizedShell);
  const stopIds = Object.keys(world.stops || {}).sort();

  const stopSignatures = stopIds.map((id) => {
    const s = world.stops[id];
    const stopUrls = getStopAllAssetUrls(s);
    for (const u of stopUrls) {
      allAssetSet.add(u);
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

  return {
    contentHash,
    cacheName,
    allAssets: [...allAssetSet].sort()
  };
}

async function resolveActiveCacheName() {
  if (activeCacheName) return activeCacheName;
  const keys = await self.caches.keys();
  const drKeys = keys.filter(
    (k) => k.startsWith(CACHE_PREFIX) && k !== CAPACITY_VERIFY_CACHE
  );
  if (drKeys.length > 0) {
    activeCacheName = drKeys[drKeys.length - 1];
    activeContentHash = activeCacheName.slice(CACHE_PREFIX.length);
    return activeCacheName;
  }
  return null;
}

/**
 * Atomic install:
 * Fetches `./data/world.json`, computes the deterministic versioned cache name
 * (`discovery-room-<contentHash>`), and fetches + caches the complete asset set before activating.
 * If any asset fails to fetch, rolls back the partial cache and aborts installation.
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
      const { contentHash, cacheName, allAssets } = computeManifestAndHash(world);

      const scopedUrls = [...new Set(allAssets.map((u) => resolveScopedUrl(u, scopeUrl)))];
      const fetchedEntries = [];

      try {
        for (const fullUrl of scopedUrls) {
          const response = await fetch(fullUrl, { cache: 'no-cache' });
          if (!response || !response.ok) {
            throw new Error(`SW install failed to pre-cache ${fullUrl}`);
          }
          fetchedEntries.push({ url: fullUrl, response: response.clone() });
        }

        const cache = await self.caches.open(cacheName);
        for (const entry of fetchedEntries) {
          await cache.put(entry.url, entry.response);
        }

        // Also map "./index.html" to the scope root "./" so offline navigations to "./" resolve
        const indexUrl = resolveScopedUrl('./index.html', scopeUrl);
        const rootUrl = resolveScopedUrl('./', scopeUrl);
        const indexMatch = await cache.match(indexUrl);
        if (indexMatch) {
          await cache.put(rootUrl, indexMatch.clone());
        }

        activeCacheName = cacheName;
        activeContentHash = contentHash;
        await self.skipWaiting();
      } catch (err) {
        await self.caches.delete(cacheName);
        throw err;
      }
    })()
  );
});

/**
 * Atomic activate:
 * Deletes outdated `discovery-room-*` caches ONLY after the new versioned cache is complete.
 * Strictly ignores any cache not starting with `discovery-room-` so sibling games on
 * `BoazHarel/Games` are never touched.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const currentCache = await resolveActiveCacheName();
      if (currentCache) {
        const allKeys = await self.caches.keys();
        if (allKeys.includes(currentCache)) {
          for (const key of allKeys) {
            if (
              key.startsWith(CACHE_PREFIX) &&
              key !== currentCache &&
              key !== CAPACITY_VERIFY_CACHE
            ) {
              await self.caches.delete(key);
            }
          }
        }
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

      const networkResponse = await fetch(request);
      if (networkResponse && networkResponse.ok && cacheName) {
        const cache = await self.caches.open(cacheName);
        await cache.put(normalizedUrl.href, networkResponse.clone());
      }
      return networkResponse;
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
            typeof data.cacheName === 'string' && data.cacheName.startsWith(CACHE_PREFIX)
              ? data.cacheName
              : await resolveActiveCacheName();

          if (!targetCacheName) {
            if (replyPort) replyPort.postMessage({ ok: false, error: 'no-active-cache' });
            return;
          }

          const cache = await self.caches.open(targetCacheName);
          const urls = Array.isArray(data.urls) ? data.urls : [];
          let newlyCached = 0;

          for (const relUrl of urls) {
            const fullUrl = resolveScopedUrl(relUrl, scopeUrl);
            const existing = await cache.match(fullUrl);
            if (!existing) {
              const res = await fetch(fullUrl);
              if (!res || !res.ok) {
                throw new Error(`Failed to cache branch asset ${fullUrl}`);
              }
              await cache.put(fullUrl, res.clone());
              newlyCached++;
            }
          }

          if (replyPort) {
            replyPort.postMessage({
              ok: true,
              branchId: data.branchId,
              cacheName: targetCacheName,
              newlyCached
            });
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
