/**
 * Coordinates the browser History API with `src/state.js` so Back, House, and Trail
 * share one navigation stack as the single source of truth.
 *
 * Rules (ADR 0003):
 * 1. On app init at Room (L0), place a root sentinel entry (`{ sentinel: true, depth: -1 }`)
 *    and push `{ stopId: "room", depth: 0, stack: ["room"] }` above it.
 * 2. Zooming into a child pushes one history entry (`history.pushState`).
 * 3. House and Trail jumps unwind browser history by `history.go(-delta)` (and `replaceState`)
 *    rather than pushing a new entry on top — so pressing Android Back after House or Trail
 *    never flies down into a previously visited deeper level.
 * 4. At the Room (depth === 0), pressing Back hits the sentinel entry in `popstate` and
 *    immediately re-pushes `{ stopId: "room", depth: 0, stack: ["room"] }` so Back never exits.
 */
export function createHistoryController(appState, options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const hist = options.history || (win ? win.history : null);
  const onBackNavigate = options.onBackNavigate || null;
  const onSentinelTrap = options.onSentinelTrap || null;

  let pendingProgrammaticUnwind = null;
  let sentinelTrapCount = 0;

  function buildSentinelEntry() {
    return {
      discoveryRoom: true,
      sentinel: true,
      stopId: 'room',
      depth: -1,
      stack: ['room']
    };
  }

  function buildActiveEntry(stack = appState.getStack()) {
    return {
      discoveryRoom: true,
      sentinel: false,
      stopId: stack[stack.length - 1],
      depth: stack.length - 1,
      stack: stack.slice()
    };
  }

  function init() {
    if (!hist) return;
    const rootStack = appState.getStack();
    hist.replaceState(buildSentinelEntry(), '');
    hist.pushState(buildActiveEntry(rootStack), '');
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('popstate', handlePopState);
    }
  }

  function pushCurrentState() {
    if (!hist) return;
    hist.pushState(buildActiveEntry(appState.getStack()), '');
  }

  /**
   * Unwinds the shared stack and browser history to `targetIndex` (0 for House,
   * ancestor index for Trail).
   */
  function unwindToIndex(targetIndex) {
    const result = appState.jumpToStackIndex(targetIndex);
    if (!result.navigated || result.delta <= 0) {
      return result;
    }

    if (hist) {
      pendingProgrammaticUnwind = {
        targetStopId: result.stopId,
        targetDepth: result.depth,
        targetStack: result.stack.slice()
      };
      if (typeof hist.go === 'function') {
        hist.go(-result.delta);
      } else if (typeof hist.replaceState === 'function') {
        hist.replaceState(buildActiveEntry(result.stack), '');
        pendingProgrammaticUnwind = null;
      }
    }

    return result;
  }

  function unwindToHouse() {
    return unwindToIndex(0);
  }

  function handlePopState(event) {
    const stateObj = event?.state || null;

    // 1. Handle completion of a programmatic House / Trail history.go(-delta) unwind
    if (pendingProgrammaticUnwind) {
      const unwind = pendingProgrammaticUnwind;
      pendingProgrammaticUnwind = null;
      if (stateObj && stateObj.sentinel) {
        // Guard if history.go overshot into sentinel
        if (hist && typeof hist.pushState === 'function') {
          hist.pushState(buildActiveEntry(unwind.targetStack), '');
        }
      } else if (hist && typeof hist.replaceState === 'function') {
        hist.replaceState(buildActiveEntry(unwind.targetStack), '');
      }
      return;
    }

    // 2. Root sentinel trap at L0 Room: Back button hit the sentinel entry below Room
    if (!stateObj || stateObj.sentinel === true || stateObj.depth < 0) {
      sentinelTrapCount++;
      if (appState.getDepth() > 0) {
        appState.syncStack(['room'], 'back-to-root');
      }
      if (hist && typeof hist.pushState === 'function') {
        hist.pushState(buildActiveEntry(['room']), '');
      }
      if (typeof onSentinelTrap === 'function') {
        onSentinelTrap({ sentinelTrapCount, stopId: 'room' });
      }
      return;
    }

    // 3. User pressed Back while at depth > 0
    if (Array.isArray(stateObj.stack) && stateObj.stack.length >= 1) {
      const prevStopId = appState.getCurrentStopId();
      const prevDepth = appState.getDepth();
      // Never allow Back to fly *down* into a deeper level than current depth
      if (stateObj.stack.length - 1 < prevDepth) {
        appState.syncStack(stateObj.stack, 'back');
        if (typeof onBackNavigate === 'function') {
          onBackNavigate({
            fromStopId: prevStopId,
            stopId: appState.getCurrentStopId(),
            depth: appState.getDepth(),
            stack: appState.getStack()
          });
        }
      } else {
        // If browser forward/stale entry was somehow triggered, clamp to current stack
        if (hist && typeof hist.replaceState === 'function') {
          hist.replaceState(buildActiveEntry(appState.getStack()), '');
        }
      }
      return;
    }

    // Fallback: pop one level
    if (appState.getDepth() > 0) {
      const prevStopId = appState.getCurrentStopId();
      const res = appState.popOneLevel();
      if (typeof onBackNavigate === 'function') {
        onBackNavigate({
          fromStopId: prevStopId,
          stopId: res.stopId,
          depth: res.depth,
          stack: res.stack
        });
      }
    } else if (hist && typeof hist.pushState === 'function') {
      sentinelTrapCount++;
      hist.pushState(buildActiveEntry(['room']), '');
    }
  }

  function destroy() {
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener('popstate', handlePopState);
    }
  }

  function getSentinelTrapCount() {
    return sentinelTrapCount;
  }

  return {
    init,
    pushCurrentState,
    unwindToIndex,
    unwindToHouse,
    handlePopState,
    getSentinelTrapCount,
    destroy
  };
}
