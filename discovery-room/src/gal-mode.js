const GAL_MODE_STORAGE_KEY = 'discovery-room:gal-mode';

export const MAX_GAL_DEPTH = 2;
export const MAX_GAL_BREATHING_BELOW_ROOM = 4;
export const GAL_HIT_EXPANSION_FACTOR = 1.2;

function getDefaultLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore
  }
  return null;
}

/**
 * Determines which active tappable IDs should breathe on a given stop.
 * - Unbuilt-branch scenery tappables (`sceneryOnlyInV1: true`) never breathe.
 * - Leaf stops (`end: true`) have 0 tappables.
 * - In Gal mode, stops below the Room (`level >= 1`) cap breathing objects to at most 4,
 *   prioritized by ascending `galPriority`.
 */
export function getBreathingTappableIds(stop, galModeEnabled = false) {
  if (!stop || stop.end || !Array.isArray(stop.tappables)) {
    return new Set();
  }
  const active = stop.tappables.filter((t) => t && !t.sceneryOnlyInV1);
  if (!galModeEnabled || stop.level === 0) {
    return new Set(active.map((t) => t.id));
  }

  const sorted = active.slice().sort((a, b) => {
    const pa = typeof a.galPriority === 'number' ? a.galPriority : 999;
    const pb = typeof b.galPriority === 'number' ? b.galPriority : 999;
    return pa - pb;
  });

  return new Set(sorted.slice(0, MAX_GAL_BREATHING_BELOW_ROOM).map((t) => t.id));
}

/**
 * Creates a Gal mode controller persisted in localStorage.
 */
export function createGalMode(options = {}) {
  const localStore = options.localStorage !== undefined ? options.localStorage : getDefaultLocalStorage();
  const listeners = new Set();

  let enabled = Boolean(options.initialEnabled);
  if (options.initialEnabled === undefined && localStore) {
    try {
      enabled = localStore.getItem(GAL_MODE_STORAGE_KEY) === 'true';
    } catch {
      enabled = false;
    }
  }

  function isEnabled() {
    return enabled;
  }

  function setEnabled(next) {
    const normalized = Boolean(next);
    if (normalized === enabled) return enabled;
    enabled = normalized;
    if (localStore) {
      try {
        localStore.setItem(GAL_MODE_STORAGE_KEY, String(enabled));
      } catch {
        // Ignore
      }
    }
    for (const listener of listeners) {
      listener(enabled);
    }
    return enabled;
  }

  function toggle() {
    return setEnabled(!enabled);
  }

  function canZoomFromLevel(level) {
    if (!enabled) return true;
    return level < MAX_GAL_DEPTH;
  }

  function shouldPulseTrail(stop) {
    if (!stop) return false;
    if (stop.end) return true;
    if (enabled && stop.level >= MAX_GAL_DEPTH) return true;
    return false;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    isEnabled,
    setEnabled,
    toggle,
    canZoomFromLevel,
    shouldPulseTrail,
    subscribe
  };
}
