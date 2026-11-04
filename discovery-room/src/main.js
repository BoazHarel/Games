import { loadWorld } from './data-loader.js';
import { createStorage } from './storage.js';
import { createGalMode } from './gal-mode.js';
import { createAppState, resolveTappableTarget } from './state.js';
import { createHistoryController } from './history.js';
import { initViewport } from './viewport.js';
import { createSceneRenderer } from './scene-renderer.js';
import { createCamera } from './camera.js';
import { clientPointToStagePct, polygonCentroid, resolveTapHit } from './hit-testing.js';
import { initUiChrome } from './ui-chrome.js';

async function initApp() {
  const stageEl = document.getElementById('stage');
  const layersEl = document.getElementById('scene-layers');
  const titleEl = document.getElementById('stop-title');
  const shellEl = document.getElementById('viewport-shell');

  const world = await loadWorld('data/world.json');
  const storage = createStorage();
  const galMode = createGalMode();
  const appState = createAppState(world, { storage, galMode });

  const viewport = initViewport({
    shellEl,
    stageEl,
    config: world.config
  });

  const sceneRenderer = createSceneRenderer(world, {
    stageEl,
    layersEl,
    titleEl,
    storage,
    galMode,
    viewport
  });

  const camera = createCamera({
    stageEl,
    layersEl,
    sceneRenderer,
    flyInDurationMs: world.config?.flyInDurationMs ?? 600
  });

  let uiChrome = null;

  const historyController = createHistoryController(appState, {
    onBackNavigate: async ({ stopId }) => {
      if (uiChrome) uiChrome.refresh();
      await camera.flyOutToStop({
        targetStopId: stopId,
        parentStopId: appState.getParentStopId(),
        mode: appState.getMode()
      });
      if (uiChrome) uiChrome.refresh();
    },
    onSentinelTrap: () => {
      if (uiChrome) uiChrome.refresh();
    }
  });

  historyController.init();

  uiChrome = initUiChrome({
    world,
    appState,
    galMode,
    storage,
    viewport,
    camera,
    onTrailSelect: async (targetIndex) => {
      if (camera.isLocked()) return;
      const res = historyController.unwindToIndex(targetIndex);
      if (!res.navigated) return;
      uiChrome.refresh();
      await camera.flyOutToStop({
        targetStopId: res.stopId,
        parentStopId: appState.getParentStopId(),
        mode: appState.getMode()
      });
      uiChrome.refresh();
    },
    onHouseTap: async () => {
      if (camera.isLocked()) return;
      if (appState.getDepth() === 0) return;
      const res = historyController.unwindToHouse();
      if (!res.navigated) return;
      uiChrome.refresh();
      await camera.flyOutToStop({
        targetStopId: res.stopId,
        parentStopId: null,
        mode: appState.getMode()
      });
      uiChrome.refresh();
    },
    onQuestionJarChange: async () => {
      await sceneRenderer.renderStop(appState.getCurrentStopId(), {
        mode: appState.getMode(),
        parentStopId: appState.getParentStopId()
      });
    }
  });

  // Handle taps on the scene stage using physical polygon hit testing + overlap rule
  layersEl.addEventListener('pointerup', async (e) => {
    if (camera.isLocked()) return;
    if (uiChrome && uiChrome.isSettingsOpen()) return;

    const currentStop = appState.getCurrentStop();
    if (!currentStop || currentStop.end) return;

    const stageRect = stageEl.getBoundingClientRect();
    let pointPct = clientPointToStagePct(e.clientX, e.clientY, stageRect);

    // Fallback when synthetic test events dispatch `pointerup` with clientX=0, clientY=0 directly on a layer
    if ((!pointPct || (e.clientX === 0 && e.clientY === 0)) && e.target) {
      const layerEl = e.target.closest?.('[data-tappable-id]');
      if (layerEl) {
        const tapId = layerEl.dataset.tappableId;
        const tapObj = currentStop.tappables.find((t) => t.id === tapId);
        if (tapObj && Array.isArray(tapObj.outlinePolygon)) {
          pointPct = polygonCentroid(tapObj.outlinePolygon);
        }
      }
    }

    if (!pointPct) return;

    const diag = viewport.getDiagnostics();
    const hit = resolveTapHit(pointPct, currentStop.tappables, {
      canvasWidth: world.config?.canvasWidth || 1600,
      canvasHeight: world.config?.canvasHeight || 900,
      fittedStageWidth: diag.fittedStageWidth,
      fittedStageHeight: diag.fittedStageHeight,
      devicePixelRatio: diag.devicePixelRatio,
      galMode: galMode.isEnabled(),
      config: world.config
    });

    if (!hit || !hit.tappable) return;
    const tappable = hit.tappable;

    // 1. In-place action tappable (e.g. Room light switch)
    if (tappable.action === 'toggleDayNight') {
      const nextMode = appState.toggleDayNight();
      await camera.flipModeInPlace({
        tappable,
        stopId: appState.getCurrentStopId(),
        parentStopId: appState.getParentStopId(),
        nextMode
      });
      uiChrome.refresh();
      return;
    }

    // 2. Mode-dependent or direct child navigation tappable
    const targetStopId = resolveTappableTarget(tappable, appState.getMode());
    if (!targetStopId || !world.stops[targetStopId]) return;

    const zoomResult = appState.zoomTo(targetStopId);
    if (zoomResult.cappedByGalMode) {
      await camera.playCappedMicroMoment(tappable);
      uiChrome.refresh();
      return;
    }

    if (zoomResult.navigated) {
      historyController.pushCurrentState();
      uiChrome.refresh();
      await camera.flyInToChild({
        tappable,
        targetStopId,
        parentStopId: appState.getParentStopId(),
        mode: appState.getMode()
      });
      uiChrome.refresh();
    }
  });

  // Expose runtime inspection handle for Playwright smoke & memory pool tests
  window.__DISCOVERY_ROOM__ = {
    world,
    appState,
    historyController,
    storage,
    galMode,
    viewport,
    sceneRenderer,
    camera,
    uiChrome
  };

  await sceneRenderer.renderStop(appState.getCurrentStopId(), {
    mode: appState.getMode(),
    parentStopId: appState.getParentStopId()
  });
  uiChrome.refresh();
}

initApp().catch((err) => {
  console.error('[Discovery Room] Initialization failed:', err);
});
