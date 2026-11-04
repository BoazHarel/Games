import { polygonCentroid } from './hit-testing.js';

function waitMs(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Manages the 600 ms eased camera fly-in, zoom-out, visual micro-moments,
 * and input lock (`isTransitioning`) so rapid tapping never skips a level.
 *
 * Strictly animates `transform` and `opacity` only (ADR 0001 / 0003).
 */
export function createCamera(options = {}) {
  const stageEl = options.stageEl || null;
  const layersEl = options.layersEl || null;
  const sceneRenderer = options.sceneRenderer;
  const flyInDurationMs =
    typeof options.flyInDurationMs === 'number' ? options.flyInDurationMs : 600;
  const microMomentLeadMs =
    typeof options.microMomentLeadMs === 'number' ? options.microMomentLeadMs : 90;

  let isTransitioning = false;

  function setLocked(locked) {
    isTransitioning = Boolean(locked);
    if (stageEl) {
      stageEl.dataset.transitioning = String(isTransitioning);
    }
  }

  function isLocked() {
    return isTransitioning;
  }

  /**
   * Triggers a brief visual micro-moment (`transform` / `opacity` only) on a tapped layer.
   */
  function playMicroMoment(tappableId, momentName) {
    if (!layersEl || !tappableId) return null;
    const layerEl = layersEl.querySelector(`[data-tappable-id="${tappableId}"]`);
    if (!layerEl) return null;
    layerEl.classList.remove('is-playing-moment');
    layerEl.dataset.activeMoment = momentName || 'pulse';
    // Force reflow to restart CSS transform/opacity keyframe if re-tapped
    void layerEl.offsetWidth;
    layerEl.classList.add('is-playing-moment');
    return layerEl;
  }

  /**
   * Plays a micro-moment in place (e.g. when Gal mode caps depth at L2) without navigating.
   */
  async function playCappedMicroMoment(tappable) {
    if (isTransitioning || !tappable) return;
    playMicroMoment(tappable.id, tappable.moment);
  }

  /**
   * Runs the 600 ms input-locked camera fly-in into `targetStopId`, fading in the child scene
   * only after all its layers complete `img.decode()`.
   */
  async function flyInToChild({ tappable, targetStopId, parentStopId, mode }) {
    if (isTransitioning) {
      return { transitioned: false, reason: 'locked' };
    }
    setLocked(true);

    try {
      if (tappable) {
        playMicroMoment(tappable.id, tappable.moment);
      }

      // Start decoding the child scene layers immediately in parallel with the fly-in
      const decodePromise = sceneRenderer.prepareStop(targetStopId, mode);

      if (microMomentLeadMs > 0) {
        await waitMs(microMomentLeadMs);
      }

      const [cxPct, cyPct] =
        tappable && Array.isArray(tappable.outlinePolygon)
          ? polygonCentroid(tappable.outlinePolygon)
          : [50, 50];

      const txPct = (50 - cxPct) * 1.15;
      const tyPct = (50 - cyPct) * 1.15;

      if (layersEl) {
        layersEl.style.transition = `transform ${flyInDurationMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${flyInDurationMs}ms ease-out`;
        layersEl.style.transform = `translate3d(${txPct.toFixed(2)}%, ${tyPct.toFixed(2)}%, 0) scale(2.15)`;
        layersEl.style.opacity = '0.08';
      }

      const remainingFlyMs = Math.max(0, flyInDurationMs - microMomentLeadMs);
      await Promise.all([waitMs(remainingFlyMs), decodePromise]);

      // Swap and fade in child scene now that img.decode() is guaranteed complete
      if (layersEl) {
        layersEl.style.transition = 'none';
        layersEl.style.transform = 'translate3d(0, 0, 0) scale(0.96)';
        layersEl.style.opacity = '0';
      }

      await sceneRenderer.renderStop(targetStopId, { mode, parentStopId });

      if (layersEl) {
        void layersEl.offsetWidth;
        layersEl.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
        layersEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
        layersEl.style.opacity = '1';
      }

      return { transitioned: true, stopId: targetStopId };
    } finally {
      setLocked(false);
    }
  }

  /**
   * Smoothly flies back out to an ancestor or Room stop (Trail tap, House tap, or Android Back).
   */
  async function flyOutToStop({ targetStopId, parentStopId, mode }) {
    if (isTransitioning) {
      return { transitioned: false, reason: 'locked' };
    }
    setLocked(true);

    try {
      const decodePromise = sceneRenderer.prepareStop(targetStopId, mode);
      const outDurationMs = Math.min(260, Math.round(flyInDurationMs * 0.45));

      if (layersEl) {
        layersEl.style.transition = `transform ${outDurationMs}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${outDurationMs}ms ease-out`;
        layersEl.style.transform = 'translate3d(0, 0, 0) scale(0.88)';
        layersEl.style.opacity = '0';
      }

      await Promise.all([waitMs(outDurationMs), decodePromise]);

      if (layersEl) {
        layersEl.style.transition = 'none';
        layersEl.style.transform = 'translate3d(0, 0, 0) scale(1.04)';
        layersEl.style.opacity = '0';
      }

      await sceneRenderer.renderStop(targetStopId, { mode, parentStopId });

      if (layersEl) {
        void layersEl.offsetWidth;
        layersEl.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
        layersEl.style.transform = 'translate3d(0, 0, 0) scale(1)';
        layersEl.style.opacity = '1';
      }

      return { transitioned: true, stopId: targetStopId };
    } finally {
      setLocked(false);
    }
  }

  /**
   * Flips day/night mode in place on the Room light switch (`action: "toggleDayNight"`),
   * waiting for `img.decode()` on the opposite mode's layers before swapping.
   */
  async function flipModeInPlace({ tappable, stopId, parentStopId, nextMode }) {
    if (isTransitioning) {
      return { transitioned: false, reason: 'locked' };
    }
    setLocked(true);

    try {
      if (tappable) {
        playMicroMoment(tappable.id, tappable.moment || 'switch-click');
      }
      await sceneRenderer.prepareStop(stopId, nextMode);
      await sceneRenderer.renderStop(stopId, { mode: nextMode, parentStopId });
      return { transitioned: true, mode: nextMode };
    } finally {
      setLocked(false);
    }
  }

  return {
    isLocked,
    playMicroMoment,
    playCappedMicroMoment,
    flyInToChild,
    flyOutToStop,
    flipModeInPlace
  };
}
