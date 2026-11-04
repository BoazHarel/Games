import { getFittedStageDimensions } from './validator.js';
import { getStopPaletteColor } from './state.js';

/**
 * Computes the physical minimum tap target diameter in CSS pixels (~2 cm / 140 device px
 * on the Lenovo Tab One 8.7" 1340x800 screen, with a hard floor of >= 64 CSS px).
 */
export function getMinTapCssPx(config = {}, dpr = 1) {
  const minDevicePx = typeof config.minTapDevicePx === 'number' ? config.minTapDevicePx : 140;
  const minCssFloor = typeof config.minTapCssPxFloor === 'number' ? config.minTapCssPxFloor : 64;
  const safeDpr = typeof dpr === 'number' && dpr > 0 ? dpr : 1;
  return Math.max(minCssFloor, Math.round(minDevicePx / safeDpr));
}

/**
 * Returns a live snapshot of viewport and fullscreen diagnostics for Parent Settings.
 */
export function getViewportDiagnostics(win = typeof window !== 'undefined' ? window : null, config = {}) {
  if (!win) {
    return {
      innerWidth: 0,
      innerHeight: 0,
      visualViewportWidth: 0,
      visualViewportHeight: 0,
      devicePixelRatio: 1,
      fullscreen: false,
      fittedStageWidth: 0,
      fittedStageHeight: 0,
      minTapCssPx: getMinTapCssPx(config, 1)
    };
  }

  const innerWidth = win.innerWidth || 0;
  const innerHeight = win.innerHeight || 0;
  const vvWidth = Math.round(win.visualViewport?.width || innerWidth);
  const vvHeight = Math.round(win.visualViewport?.height || innerHeight);
  const dpr = Number((win.devicePixelRatio || 1).toFixed(2));
  const doc = win.document;
  const fullscreen = Boolean(doc?.fullscreenElement);
  const fitted = getFittedStageDimensions(
    vvWidth,
    vvHeight,
    config.canvasWidth || 1600,
    config.canvasHeight || 900
  );

  return {
    innerWidth,
    innerHeight,
    visualViewportWidth: vvWidth,
    visualViewportHeight: vvHeight,
    devicePixelRatio: dpr,
    fullscreen,
    fittedStageWidth: Math.round(fitted.width),
    fittedStageHeight: Math.round(fitted.height),
    minTapCssPx: getMinTapCssPx(config, dpr)
  };
}

/**
 * Initializes the kid-proofed `visualViewport` layout manager and opportunistic fullscreen handler.
 */
export function initViewport(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const doc = options.document || (win ? win.document : null);
  const shellEl = options.shellEl || doc?.getElementById('viewport-shell');
  const stageEl = options.stageEl || doc?.getElementById('stage');
  const config = options.config || {};
  const listeners = new Set();

  let fullscreenAttempted = false;

  const preventDefaultHandler = (e) => {
    e.preventDefault();
  };

  const preventMultiTouchZoom = (e) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault();
    }
  };

  function updateLayout() {
    if (!win || !stageEl) return;
    const vvWidth = win.visualViewport?.width || win.innerWidth || 1340;
    const vvHeight = win.visualViewport?.height || win.innerHeight || 800;

    if (shellEl) {
      shellEl.style.width = `${Math.round(vvWidth)}px`;
      shellEl.style.height = `${Math.round(vvHeight)}px`;
    }

    const fitted = getFittedStageDimensions(
      vvWidth,
      vvHeight,
      config.canvasWidth || 1600,
      config.canvasHeight || 900
    );

    stageEl.style.width = `${Math.floor(fitted.width)}px`;
    stageEl.style.height = `${Math.floor(fitted.height)}px`;

    const diag = getViewportDiagnostics(win, config);
    for (const listener of listeners) {
      listener(diag);
    }
  }

  function applyPaletteColor(stop, mode) {
    if (!doc) return;
    const color = getStopPaletteColor(stop, mode);
    if (doc.body) {
      doc.body.style.backgroundColor = color;
    }
    if (shellEl) {
      shellEl.style.backgroundColor = color;
    }
    if (stageEl) {
      stageEl.style.backgroundColor = color;
    }
  }

  function attemptOpportunisticFullscreen() {
    if (fullscreenAttempted || !doc) return;
    fullscreenAttempted = true;
    try {
      if (!doc.fullscreenElement && typeof doc.documentElement?.requestFullscreen === 'function') {
        const promise = doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {
            // Silently stay windowed if blocked by Family Link or browser gesture policy
          });
        }
      }
    } catch {
      // Silently stay windowed
    }
  }

  if (win && doc) {
    win.addEventListener('contextmenu', preventDefaultHandler, { passive: false });
    win.addEventListener('dragstart', preventDefaultHandler, { passive: false });
    doc.addEventListener('selectstart', preventDefaultHandler, { passive: false });
    doc.addEventListener('touchstart', preventMultiTouchZoom, { passive: false });
    doc.addEventListener('touchmove', preventMultiTouchZoom, { passive: false });

    win.addEventListener('resize', updateLayout);
    doc.addEventListener('fullscreenchange', updateLayout);
    if (win.visualViewport) {
      win.visualViewport.addEventListener('resize', updateLayout);
      win.visualViewport.addEventListener('scroll', updateLayout);
    }

    if (stageEl) {
      stageEl.addEventListener('pointerdown', attemptOpportunisticFullscreen, { once: true });
    }

    updateLayout();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy() {
    if (!win || !doc) return;
    win.removeEventListener('contextmenu', preventDefaultHandler);
    win.removeEventListener('dragstart', preventDefaultHandler);
    doc.removeEventListener('selectstart', preventDefaultHandler);
    doc.removeEventListener('touchstart', preventMultiTouchZoom);
    doc.removeEventListener('touchmove', preventMultiTouchZoom);
    win.removeEventListener('resize', updateLayout);
    doc.removeEventListener('fullscreenchange', updateLayout);
    if (win.visualViewport) {
      win.visualViewport.removeEventListener('resize', updateLayout);
      win.visualViewport.removeEventListener('scroll', updateLayout);
    }
  }

  return {
    updateLayout,
    applyPaletteColor,
    attemptOpportunisticFullscreen,
    getDiagnostics: () => getViewportDiagnostics(win, config),
    subscribe,
    destroy
  };
}
