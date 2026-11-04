import { MAX_GAL_DEPTH } from './gal-mode.js';

/**
 * Determines initial day/night mode from the device clock.
 * Daytime: 06:00 - 17:59 ('day')
 * Evening/Night: 18:00 - 05:59 ('night')
 */
export function getInitialDayNightMode(now = new Date()) {
  const hour = now.getHours();
  return hour >= 6 && hour < 18 ? 'day' : 'night';
}

/**
 * Resolves the target stop ID for a tappable given the current day/night mode.
 * Returns null for sceneryOnlyInV1 tappables or in-place action tappables.
 */
export function resolveTappableTarget(tappable, mode) {
  if (!tappable || tappable.sceneryOnlyInV1 || tappable.action) {
    return null;
  }
  if (tappable.targetByMode && typeof tappable.targetByMode === 'object') {
    return tappable.targetByMode[mode] || null;
  }
  return tappable.targetStopId || null;
}

/**
 * Resolves the palette colour for a stop given the current day/night mode.
 */
export function getStopPaletteColor(stop, mode) {
  if (!stop) return '#2b1d12';
  if (stop.paletteColorByMode && stop.paletteColorByMode[mode]) {
    return stop.paletteColorByMode[mode];
  }
  return stop.paletteColor;
}

/**
 * Creates the single shared navigation stack and mode state machine.
 * Shared as the single source of truth across Back, House, and Trail.
 */
export function createAppState(world, options = {}) {
  if (!world || !world.stops || !world.rootId || !world.stops[world.rootId]) {
    throw new Error('createAppState requires a valid world object with rootId.');
  }

  const rootId = world.rootId;
  const storage = options.storage || null;
  const galMode = options.galMode || null;
  const listeners = new Set();

  let stack = [rootId];
  let mode =
    options.initialMode === 'day' || options.initialMode === 'night'
      ? options.initialMode
      : getInitialDayNightMode(options.now || new Date());

  if (storage) {
    storage.markVisited(rootId);
  }

  function getStack() {
    return stack.slice();
  }

  function getDepth() {
    return stack.length - 1;
  }

  function getCurrentStopId() {
    return stack[stack.length - 1];
  }

  function getCurrentStop() {
    return world.stops[getCurrentStopId()] || null;
  }

  function getParentStopId() {
    return stack.length > 1 ? stack[stack.length - 2] : null;
  }

  function getMode() {
    return mode;
  }

  function setMode(nextMode) {
    if (nextMode !== 'day' && nextMode !== 'night') return mode;
    if (nextMode === mode) return mode;
    mode = nextMode;
    notify({ type: 'mode-change', mode, stopId: getCurrentStopId(), stack: getStack() });
    return mode;
  }

  function toggleDayNight() {
    return setMode(mode === 'day' ? 'night' : 'day');
  }

  /**
   * Zooms into a child stop and pushes onto the single navigation stack.
   */
  function zoomTo(targetStopId) {
    const targetStop = world.stops[targetStopId];
    if (!targetStop) {
      return { navigated: false, reason: 'missing-stop' };
    }

    const currentStop = getCurrentStop();
    const isGal = galMode ? galMode.isEnabled() : false;
    if (isGal && currentStop && currentStop.level >= MAX_GAL_DEPTH) {
      return {
        navigated: false,
        cappedByGalMode: true,
        stopId: getCurrentStopId(),
        level: currentStop.level
      };
    }

    const previousStopId = getCurrentStopId();
    stack.push(targetStopId);
    if (storage) {
      storage.markVisited(targetStopId);
    }

    const event = {
      type: 'zoom-in',
      fromStopId: previousStopId,
      stopId: targetStopId,
      depth: getDepth(),
      stack: getStack()
    };
    notify(event);
    return { navigated: true, ...event };
  }

  /**
   * Unwinds the navigation stack to an ancestor index (0 = Room for House button,
   * 0 <= index < depth for Trail thumbnails).
   */
  function jumpToStackIndex(targetIndex) {
    if (
      typeof targetIndex !== 'number' ||
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= stack.length - 1
    ) {
      return {
        navigated: false,
        delta: 0,
        stopId: getCurrentStopId(),
        depth: getDepth(),
        stack: getStack()
      };
    }

    const previousStopId = getCurrentStopId();
    const previousDepth = getDepth();
    const delta = previousDepth - targetIndex;
    stack = stack.slice(0, targetIndex + 1);
    const targetStopId = getCurrentStopId();

    const event = {
      type: targetIndex === 0 ? 'house' : 'trail',
      fromStopId: previousStopId,
      stopId: targetStopId,
      depth: getDepth(),
      delta,
      stack: getStack()
    };
    notify(event);
    return { navigated: true, ...event };
  }

  /**
   * Pops one level from the stack (used by browser Back when depth > 0).
   * At the Room (depth === 0), stays at Room.
   */
  function popOneLevel() {
    if (stack.length <= 1) {
      return {
        popped: false,
        atRoot: true,
        stopId: rootId,
        depth: 0,
        stack: getStack()
      };
    }

    const previousStopId = getCurrentStopId();
    stack.pop();
    const stopId = getCurrentStopId();
    const event = {
      type: 'back',
      fromStopId: previousStopId,
      stopId,
      depth: getDepth(),
      stack: getStack()
    };
    notify(event);
    return { popped: true, atRoot: false, ...event };
  }

  /**
   * Synchronizes the stack directly to a validated path (e.g. when popstate unwinds).
   */
  function syncStack(nextStack, eventType = 'history-sync') {
    if (!Array.isArray(nextStack) || nextStack.length === 0 || nextStack[0] !== rootId) {
      return false;
    }
    for (const id of nextStack) {
      if (!world.stops[id]) return false;
    }
    const previousStopId = getCurrentStopId();
    stack = nextStack.slice();
    const stopId = getCurrentStopId();
    notify({
      type: eventType,
      fromStopId: previousStopId,
      stopId,
      depth: getDepth(),
      stack: getStack()
    });
    return true;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function notify(event) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  return {
    getStack,
    getDepth,
    getCurrentStopId,
    getCurrentStop,
    getParentStopId,
    getMode,
    setMode,
    toggleDayNight,
    zoomTo,
    jumpToStackIndex,
    popOneLevel,
    syncStack,
    subscribe
  };
}
