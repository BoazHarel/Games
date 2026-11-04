import { getBreathingTappableIds } from './gal-mode.js';
import { resolveTappableTarget, getStopPaletteColor } from './state.js';

/**
 * Collects all image asset URLs required to display `stop` in `mode`.
 */
export function getStopAssetUrls(stop, mode = 'night') {
  if (!stop) return [];
  const urls = [];
  if (stop.image) {
    const bg = stop.image.backgroundByMode?.[mode] || stop.image.background;
    if (bg) urls.push(bg);
    if (stop.image.thumbnail) urls.push(stop.image.thumbnail);
  }
  if (Array.isArray(stop.tappables)) {
    for (const tap of stop.tappables) {
      if (!tap) continue;
      const layerUrl = tap.layerImageByMode?.[mode] || tap.layerImage;
      if (layerUrl) urls.push(layerUrl);
    }
  }
  return [...new Set(urls)];
}

function defaultCreateImage() {
  if (typeof Image !== 'undefined') {
    return new Image();
  }
  // Fallback for Node test environments when no custom factory is supplied
  return {
    src: '',
    decoding: 'async',
    decode() {
      return Promise.resolve();
    }
  };
}

/**
 * Decoded image memory pool enforcing ADR 0003:
 * - A scene fades in only after all of its layers resolve `img.decode()`.
 * - Retains at most `currentStopId + parentStopId + preloaded immediate child stops` in memory.
 * - Explicitly releases (`img.src = ''`) all scenes outside that neighborhood.
 */
export function createDecodedScenePool(world, options = {}) {
  const createImage = options.createImage || defaultCreateImage;
  const pool = new Map(); // Map<stopId, { mode: string, images: Map<url, HTMLImageElement>, promise: Promise }>
  const evictedUrlsLog = [];

  async function decodeUrl(url) {
    const img = createImage();
    img.decoding = 'async';
    img.draggable = false;
    img.src = url;
    if (typeof img.decode === 'function') {
      try {
        await img.decode();
      } catch {
        // If browser decode rejects on an already-cached synthetic stub, still allow element
      }
    }
    return img;
  }

  /**
   * Decodes and caches all layer images for `stopId` in `mode`.
   */
  async function ensureDecoded(stopId, mode = 'night') {
    const stop = world.stops[stopId];
    if (!stop) return null;

    const existing = pool.get(stopId);
    if (existing && existing.mode === mode && existing.promise) {
      await existing.promise;
      return existing;
    }

    // If mode changed for an existing stop (e.g., Room day <-> night), release superseded URLs
    const nextUrls = getStopAssetUrls(stop, mode);
    const nextUrlSet = new Set(nextUrls);
    const imagesMap = new Map();

    if (existing && existing.images) {
      for (const [oldUrl, oldImg] of existing.images.entries()) {
        if (nextUrlSet.has(oldUrl)) {
          imagesMap.set(oldUrl, oldImg);
        } else {
          oldImg.src = '';
          evictedUrlsLog.push({ stopId, url: oldUrl });
        }
      }
    }

    const entry = {
      stopId,
      mode,
      images: imagesMap,
      decodedAt: 0,
      promise: null
    };
    pool.set(stopId, entry);

    entry.promise = (async () => {
      const decodePromises = [];
      for (const url of nextUrls) {
        if (!imagesMap.has(url)) {
          decodePromises.push(
            decodeUrl(url).then((img) => {
              imagesMap.set(url, img);
            })
          );
        }
      }
      await Promise.all(decodePromises);
      entry.decodedAt = Date.now();
      return entry;
    })();

    await entry.promise;
    return entry;
  }

  /**
   * Computes the allowed retained stop IDs (`current + parent + immediate children`),
   * evicts all other stops (`img.src = ''`), and triggers preloading for immediate children.
   */
  async function updateNeighborhood(currentStopId, parentStopId = null, mode = 'night') {
    const currentStop = world.stops[currentStopId];
    if (!currentStop) return;

    const allowedStopIds = new Set([currentStopId]);
    if (parentStopId && world.stops[parentStopId]) {
      allowedStopIds.add(parentStopId);
    }
    if (Array.isArray(currentStop.children)) {
      for (const childId of currentStop.children) {
        if (world.stops[childId]) {
          allowedStopIds.add(childId);
        }
      }
    }

    // Evict every stop outside { current, parent, ...children }
    for (const [stopId, entry] of pool.entries()) {
      if (!allowedStopIds.has(stopId)) {
        for (const [url, img] of entry.images.entries()) {
          img.src = '';
          evictedUrlsLog.push({ stopId, url });
        }
        entry.images.clear();
        pool.delete(stopId);
      }
    }

    // Ensure current stop is decoded immediately
    await ensureDecoded(currentStopId, mode);

    // Ensure parent and immediate children are decoded in the pool
    const preloadPromises = [];
    if (parentStopId && world.stops[parentStopId]) {
      preloadPromises.push(ensureDecoded(parentStopId, mode));
    }
    if (Array.isArray(currentStop.children)) {
      for (const childId of currentStop.children) {
        if (world.stops[childId]) {
          preloadPromises.push(ensureDecoded(childId, mode));
        }
      }
    }
    await Promise.all(preloadPromises);
  }

  function getRetainedStopIds() {
    return [...pool.keys()];
  }

  function getDecodedEntry(stopId) {
    return pool.get(stopId) || null;
  }

  function getEvictedUrlsLog() {
    return evictedUrlsLog.slice();
  }

  return {
    ensureDecoded,
    updateNeighborhood,
    getRetainedStopIds,
    getDecodedEntry,
    getEvictedUrlsLog
  };
}

/**
 * Renders Discovery Room scenes into `#stage` / `#scene-layers`, gated on `img.decode()`
 * and backed by `DecodedScenePool`.
 */
export function createSceneRenderer(world, options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const stageEl = options.stageEl || doc?.getElementById('stage');
  const layersEl = options.layersEl || doc?.getElementById('scene-layers');
  const titleEl = options.titleEl || doc?.getElementById('stop-title');
  const storage = options.storage || null;
  const galMode = options.galMode || null;
  const viewport = options.viewport || null;
  const decodedPool = options.decodedPool || createDecodedScenePool(world, options);

  const showPlaceholderLabels =
    options.showPlaceholderLabels !== undefined
      ? Boolean(options.showPlaceholderLabels)
      : String(world.contentVersion || '').includes('placeholder');

  async function prepareStop(stopId, mode = 'night') {
    return decodedPool.ensureDecoded(stopId, mode);
  }

  /**
   * Renders `stopId` into the stage DOM only after all its layers have finished `img.decode()`.
   */
  async function renderStop(stopId, renderOptions = {}) {
    const stop = world.stops[stopId];
    if (!stop || !doc || !stageEl || !layersEl) return null;

    const mode = renderOptions.mode || 'night';
    const parentStopId = renderOptions.parentStopId || null;

    // 1. Wait for all layers of the target stop to finish img.decode() before touching DOM
    const decodedEntry = await decodedPool.ensureDecoded(stopId, mode);

    // 2. Apply stop palette colour to stage and surrounding viewport margins
    if (viewport) {
      viewport.applyPaletteColor(stop, mode);
    } else {
      const bgColor = getStopPaletteColor(stop, mode);
      if (doc.body) doc.body.style.backgroundColor = bgColor;
      stageEl.style.backgroundColor = bgColor;
    }

    const galEnabled = galMode ? galMode.isEnabled() : false;
    stageEl.dataset.stopId = stop.id;
    stageEl.dataset.level = String(stop.level);
    stageEl.dataset.mode = mode;
    stageEl.dataset.end = String(Boolean(stop.end));
    stageEl.dataset.realPhoto = String(Boolean(stop.isRealPhoto));
    stageEl.dataset.galMode = String(galEnabled);
    stageEl.dataset.decodedReady = 'true';

    if (titleEl) {
      titleEl.textContent = stop.name;
    }

    layersEl.innerHTML = '';

    // 3. Render decoded background plate
    const bgUrl = stop.image?.backgroundByMode?.[mode] || stop.image?.background;
    if (bgUrl) {
      const bgImg = doc.createElement('img');
      bgImg.className = 'scene-bg-image';
      bgImg.src = bgUrl;
      bgImg.alt = '';
      bgImg.draggable = false;
      bgImg.decoding = 'async';
      layersEl.appendChild(bgImg);
    }

    // 4. Determine which tappables breathe (3..6 normal, <= 4 below Room in Gal mode, 0 for scenery/leaf)
    const breathingIds = getBreathingTappableIds(stop, galEnabled);
    const questions = storage ? storage.getQuestions() : [];

    for (const tap of stop.tappables) {
      const el = doc.createElement('div');
      const isScenery = Boolean(tap.sceneryOnlyInV1);
      const isBreathing = breathingIds.has(tap.id);
      const targetId = resolveTappableTarget(tap, mode);
      const targetStop = targetId ? world.stops[targetId] : null;
      const isVisited = Boolean(targetId && storage && storage.isVisited(targetId));

      el.className = 'tappable-layer';
      if (isBreathing) {
        el.classList.add('is-breathing');
      }
      if (isScenery) {
        el.classList.add('is-scenery');
      }
      if (tap.action) {
        el.classList.add('is-action');
      }

      el.dataset.tappableId = tap.id;
      el.dataset.scenery = String(isScenery);
      el.dataset.breathing = String(isBreathing);
      if (targetId) {
        el.dataset.targetStopId = targetId;
      }
      if (tap.action) {
        el.dataset.action = tap.action;
      }
      if (tap.moment) {
        el.dataset.moment = tap.moment;
      }

      el.style.left = `${tap.bounds.x}%`;
      el.style.top = `${tap.bounds.y}%`;
      el.style.width = `${tap.bounds.w}%`;
      el.style.height = `${tap.bounds.h}%`;

      // Inner visual wrapper carries the GPU-composited 3s breathing transform
      // so the outer .tappable-layer bounding box stays stationary for hit-testing & Playwright stability
      const visualEl = doc.createElement('div');
      visualEl.className = 'tappable-visual';
      if (isBreathing) {
        visualEl.classList.add('is-breathing');
      }

      // Cutout image layer (already decoded in pool)
      const cutoutUrl = tap.layerImageByMode?.[mode] || tap.layerImage;
      if (cutoutUrl) {
        const cutImg = doc.createElement('img');
        cutImg.className = 'tappable-cutout';
        cutImg.src = cutoutUrl;
        cutImg.alt = '';
        cutImg.draggable = false;
        cutImg.decoding = 'async';
        visualEl.appendChild(cutImg);
      }

      // Placeholder tappable name badge so a person can tell placeholder objects apart
      if (showPlaceholderLabels) {
        const labelText = tap.label || targetStop?.name || tap.id;
        const labelEl = doc.createElement('span');
        labelEl.className = 'tappable-label';
        labelEl.textContent = labelText;
        visualEl.appendChild(labelEl);
      }

      el.appendChild(visualEl);

      // Soft session-visited dot ("we went here")
      if (isVisited && !isScenery) {
        const dotEl = doc.createElement('span');
        dotEl.className = 'visited-dot';
        dotEl.dataset.visitedFor = targetId;
        dotEl.setAttribute('aria-hidden', 'true');
        el.appendChild(dotEl);
      }

      // Question Jar marbles on the Room desk
      if (stop.id === 'room' && tap.id === 'tap-desk') {
        const jarEl = doc.createElement('div');
        jarEl.id = 'question-jar';
        jarEl.className = 'question-jar';
        jarEl.dataset.marbleCount = String(questions.length);
        for (const q of questions) {
          const marbleEl = doc.createElement('span');
          marbleEl.className = 'jar-marble';
          marbleEl.style.backgroundColor = q.color;
          marbleEl.title = q.text;
          jarEl.appendChild(marbleEl);
        }
        el.appendChild(jarEl);
      }

      layersEl.appendChild(el);
    }

    // 5. Update decoded neighborhood pool (retains current + parent + immediate children; evicts others)
    await decodedPool.updateNeighborhood(stopId, parentStopId, mode);

    return decodedEntry;
  }

  return {
    prepareStop,
    renderStop,
    getDecodedPool: () => decodedPool,
    getRetainedStopIds: () => decodedPool.getRetainedStopIds()
  };
}
