/**
 * Navigation chrome & Parent UI controller (Issues #14 E2-4 & #15 E2-5):
 * - Top thumbnail Trail bar (pulsing gently at branch ends and at L2 in Gal mode)
 * - Bottom-left House button (single tap home; 3-second hold opens Parent Settings)
 * - Bottom-right `?` slide-up Parent Cue Card (stop name, Daniel question, Gal line)
 * - Parent Settings modal (Gal mode toggle, Viewport & Storage Diagnostics readout,
 *   Question Jar + JSON export/import, and parent-only photo credits)
 */
export function initUiChrome(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const world = options.world;
  const appState = options.appState;
  const galMode = options.galMode;
  const storage = options.storage;
  const viewport = options.viewport;
  const camera = options.camera;
  const offline = options.offline || null;
  const onTrailSelect = options.onTrailSelect;
  const onHouseTap = options.onHouseTap;
  const onQuestionJarChange = options.onQuestionJarChange;
  const holdDurationMs =
    typeof options.holdDurationMs === 'number' ? options.holdDurationMs : 3000;

  if (!doc) return null;

  const trailBarEl = doc.getElementById('trail-bar');
  const houseBtn = doc.getElementById('house-btn');
  const cueCardBtn = doc.getElementById('cue-card-btn');
  const cueCardEl = doc.getElementById('cue-card');
  const cueCloseBtn = doc.getElementById('cue-close-btn');
  const cueStopNameEl = doc.getElementById('cue-stop-name');
  const cueDanielEl = doc.getElementById('cue-daniel-question');
  const cueGalRowEl = doc.getElementById('cue-gal-row');
  const cueGalEl = doc.getElementById('cue-gal-line');
  const cueNoteEl = doc.getElementById('cue-parent-note');

  const settingsModalEl = doc.getElementById('settings-modal');
  const settingsCloseBtn = doc.getElementById('settings-close-btn');
  const galToggleInput = doc.getElementById('gal-mode-toggle');
  const diagReadoutEl = doc.getElementById('diagnostics-readout');

  const jarInputEl = doc.getElementById('question-jar-input');
  const jarAddBtn = doc.getElementById('question-jar-add-btn');
  const jarListEl = doc.getElementById('question-jar-list');
  const jarJsonEl = doc.getElementById('question-jar-json');
  const jarExportBtn = doc.getElementById('question-jar-export-btn');
  const jarImportBtn = doc.getElementById('question-jar-import-btn');
  const jarStatusEl = doc.getElementById('question-jar-status');
  const creditsListEl = doc.getElementById('photo-credits-list');
  const verifyCacheBtn = doc.getElementById('verify-cache-btn');
  const cacheVerifyStatusEl = doc.getElementById('cache-verify-status');

  let cueCardOpen = false;
  let settingsOpen = false;
  let holdTimer = null;
  let holdTriggered = false;
  let pointerDownActive = false;

  function renderTrailBar() {
    if (!trailBarEl || !appState || !world) return;
    const stack = appState.getStack();
    const currentStop = appState.getCurrentStop();
    const shouldPulse = galMode ? galMode.shouldPulseTrail(currentStop) : Boolean(currentStop?.end);

    trailBarEl.dataset.depth = String(stack.length - 1);
    trailBarEl.dataset.pulsing = String(shouldPulse);
    trailBarEl.innerHTML = '';

    for (let i = 0; i < stack.length; i++) {
      const stopId = stack[i];
      const stop = world.stops[stopId];
      if (!stop) continue;

      const isCurrent = i === stack.length - 1;
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'trail-item';
      if (isCurrent) {
        btn.classList.add('is-current');
      } else if (shouldPulse) {
        btn.classList.add('is-pulsing');
      }

      btn.dataset.trailIndex = String(i);
      btn.dataset.stopId = stop.id;
      btn.setAttribute('aria-label', stop.name);
      btn.draggable = false;

      if (stop.image?.thumbnail) {
        const img = doc.createElement('img');
        img.className = 'trail-thumb-img';
        img.src = stop.image.thumbnail;
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        btn.appendChild(img);
      }

      if (!isCurrent) {
        btn.addEventListener('pointerup', (e) => {
          e.stopPropagation();
          if (camera && camera.isLocked()) return;
          if (typeof onTrailSelect === 'function') {
            onTrailSelect(i);
          }
        });
      }

      trailBarEl.appendChild(btn);
    }
  }

  function renderCueCard() {
    if (!cueCardEl || !appState) return;
    const stop = appState.getCurrentStop();
    if (!stop) return;

    const isGal = galMode ? galMode.isEnabled() : false;
    cueCardEl.dataset.open = String(cueCardOpen);
    cueCardEl.setAttribute('aria-hidden', String(!cueCardOpen));

    if (cueStopNameEl) {
      cueStopNameEl.textContent = stop.name;
    }
    if (cueDanielEl) {
      cueDanielEl.textContent = stop.parentQuestion || '';
    }
    if (cueGalEl) {
      cueGalEl.textContent = stop.galLine || '';
    }
    if (cueGalRowEl) {
      cueGalRowEl.dataset.galHighlighted = String(isGal);
      cueGalRowEl.classList.toggle('is-gal-highlighted', isGal);
    }
    if (cueNoteEl) {
      if (stop.parentNote) {
        cueNoteEl.textContent = stop.parentNote;
        cueNoteEl.hidden = false;
      } else {
        cueNoteEl.textContent = '';
        cueNoteEl.hidden = true;
      }
    }
  }

  function setCueCardOpen(nextOpen) {
    cueCardOpen = Boolean(nextOpen);
    if (cueCardBtn) {
      cueCardBtn.setAttribute('aria-expanded', String(cueCardOpen));
    }
    renderCueCard();
  }

  async function renderDiagnostics() {
    if (!diagReadoutEl) return;
    const vpDiag = viewport ? viewport.getDiagnostics() : {};
    const stDiag = storage
      ? await storage.getStorageDiagnostics()
      : { persisted: false, usageBytes: 0, quotaBytes: 0 };
    const offDiag = offline
      ? offline.getDiagnostics()
      : {
          cacheName: 'n/a',
          swScope: 'n/a',
          swState: 'n/a',
          cachedBranches: []
        };

    const usageKB = Math.round((stDiag.usageBytes || 0) / 1024);
    const quotaMB = Math.round((stDiag.quotaBytes || 0) / (1024 * 1024));
    const branchesText =
      Array.isArray(offDiag.cachedBranches) && offDiag.cachedBranches.length > 0
        ? offDiag.cachedBranches.join(', ')
        : 'none';

    diagReadoutEl.innerHTML = `
      <div class="diag-grid">
        <div><span>innerWidth x innerHeight:</span> <strong data-diag="inner-size">${vpDiag.innerWidth}x${vpDiag.innerHeight}</strong></div>
        <div><span>visualViewport:</span> <strong data-diag="visual-viewport">${vpDiag.visualViewportWidth}x${vpDiag.visualViewportHeight}</strong></div>
        <div><span>visualViewport.height:</span> <strong data-diag="visual-viewport-height">${vpDiag.visualViewportHeight}</strong></div>
        <div><span>devicePixelRatio:</span> <strong data-diag="dpr">${vpDiag.devicePixelRatio}</strong></div>
        <div><span>Fitted 16:9 stage:</span> <strong data-diag="fitted-stage">${vpDiag.fittedStageWidth}x${vpDiag.fittedStageHeight}</strong></div>
        <div><span>Min tap target (CSS px):</span> <strong data-diag="min-tap-css">${vpDiag.minTapCssPx}px</strong></div>
        <div><span>Fullscreen active:</span> <strong data-diag="fullscreen">${vpDiag.fullscreen ? 'yes' : 'no'}</strong></div>
        <div><span>Persistent storage:</span> <strong data-diag="persisted">${stDiag.persisted ? 'granted' : 'not granted'} (${usageKB} KB / ${quotaMB} MB)</strong></div>
        <div><span>SW scope:</span> <strong data-diag="sw-scope">${offDiag.swScope} (${offDiag.swState})</strong></div>
        <div><span>Versioned cache:</span> <strong data-diag="sw-cache">${offDiag.cacheName}</strong></div>
        <div><span>Cached branches:</span> <strong data-diag="cached-branches">${branchesText}</strong></div>
      </div>
    `;
  }

  function renderQuestionJarList() {
    if (!jarListEl || !storage) return;
    const questions = storage.getQuestions();
    jarListEl.innerHTML = '';

    for (const q of questions) {
      const li = doc.createElement('li');
      li.className = 'jar-question-item';
      li.dataset.questionId = q.id;

      const dot = doc.createElement('span');
      dot.className = 'jar-marble-dot';
      dot.style.backgroundColor = q.color;

      const textSpan = doc.createElement('span');
      textSpan.className = 'jar-question-text';
      textSpan.textContent = q.text;

      const delBtn = doc.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'jar-delete-btn';
      delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', () => {
        storage.removeQuestion(q.id);
        renderQuestionJarList();
        if (typeof onQuestionJarChange === 'function') {
          onQuestionJarChange();
        }
      });

      li.appendChild(dot);
      li.appendChild(textSpan);
      li.appendChild(delBtn);
      jarListEl.appendChild(li);
    }
  }

  function renderPhotoCredits() {
    if (!creditsListEl || !world) return;
    creditsListEl.innerHTML = '';
    const photoStops = Object.values(world.stops).filter((s) => s && s.isRealPhoto && s.credits);
    for (const stop of photoStops) {
      const li = doc.createElement('li');
      li.className = 'credit-item';
      li.dataset.creditStopId = stop.id;
      li.textContent = `${stop.name}: ${stop.credits.source} — ${stop.credits.attribution}${
        stop.credits.license ? ` (${stop.credits.license})` : ''
      }`;
      creditsListEl.appendChild(li);
    }
  }

  function openSettings() {
    settingsOpen = true;
    if (settingsModalEl) {
      settingsModalEl.dataset.open = 'true';
      settingsModalEl.setAttribute('aria-hidden', 'false');
    }
    if (galToggleInput && galMode) {
      galToggleInput.checked = galMode.isEnabled();
    }
    renderQuestionJarList();
    renderPhotoCredits();
    renderDiagnostics();
  }

  function closeSettings() {
    settingsOpen = false;
    if (settingsModalEl) {
      settingsModalEl.dataset.open = 'false';
      settingsModalEl.setAttribute('aria-hidden', 'true');
    }
  }

  function clearHoldTimer() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (houseBtn) {
      houseBtn.dataset.holding = 'false';
    }
  }

  // Wire House button: single tap -> Home; 3-second hold -> Parent Settings (contextmenu suppressed)
  if (houseBtn) {
    houseBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    houseBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      pointerDownActive = true;
      holdTriggered = false;
      clearHoldTimer();
      houseBtn.dataset.holding = 'true';

      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!pointerDownActive) return;
        holdTriggered = true;
        houseBtn.dataset.holding = 'false';
        openSettings();
      }, holdDurationMs);
    });

    houseBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      const wasDown = pointerDownActive;
      const wasHold = holdTriggered;
      pointerDownActive = false;
      holdTriggered = false;
      clearHoldTimer();

      if (!wasDown || wasHold) {
        return;
      }
      if (camera && camera.isLocked()) {
        return;
      }
      if (typeof onHouseTap === 'function') {
        onHouseTap();
      }
    });

    const cancelHold = () => {
      pointerDownActive = false;
      clearHoldTimer();
    };
    houseBtn.addEventListener('pointercancel', cancelHold);
    houseBtn.addEventListener('pointerleave', cancelHold);
  }

  // Wire Parent '?' cue card
  if (cueCardBtn) {
    cueCardBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      setCueCardOpen(!cueCardOpen);
    });
  }
  if (cueCloseBtn) {
    cueCloseBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      setCueCardOpen(false);
    });
  }

  // Wire Parent Settings modal controls
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSettings();
    });
  }

  if (galToggleInput && galMode) {
    galToggleInput.addEventListener('change', () => {
      const enabled = galMode.setEnabled(galToggleInput.checked);
      // If Gal mode is enabled while deeper than L2, unwind to L2
      if (enabled && appState && appState.getDepth() > 2 && typeof onTrailSelect === 'function') {
        onTrailSelect(2);
      }
      refresh();
      if (typeof onQuestionJarChange === 'function') {
        onQuestionJarChange();
      }
    });
  }

  if (jarAddBtn && jarInputEl && storage) {
    jarAddBtn.addEventListener('click', () => {
      const added = storage.addQuestion(jarInputEl.value);
      if (added) {
        jarInputEl.value = '';
        if (jarStatusEl) jarStatusEl.textContent = 'Added question marble to the jar.';
        renderQuestionJarList();
        if (typeof onQuestionJarChange === 'function') {
          onQuestionJarChange();
        }
      }
    });
  }

  if (jarExportBtn && jarJsonEl && storage) {
    jarExportBtn.addEventListener('click', () => {
      const exported = storage.exportQuestionsJson();
      jarJsonEl.value = exported;
      if (jarStatusEl) jarStatusEl.textContent = 'Exported Question Jar JSON.';
    });
  }

  if (jarImportBtn && jarJsonEl && storage) {
    jarImportBtn.addEventListener('click', () => {
      try {
        const imported = storage.importQuestionsJson(jarJsonEl.value);
        if (jarStatusEl) {
          jarStatusEl.textContent = `Imported ${imported.length} question(s).`;
        }
        renderQuestionJarList();
        if (typeof onQuestionJarChange === 'function') {
          onQuestionJarChange();
        }
      } catch (err) {
        if (jarStatusEl) {
          jarStatusEl.textContent = `Import error: ${err.message}`;
        }
      }
    });
  }

  if (verifyCacheBtn && offline) {
    verifyCacheBtn.addEventListener('click', async () => {
      if (cacheVerifyStatusEl) {
        cacheVerifyStatusEl.textContent = 'Verifying 32 MB cache capacity...';
      }
      try {
        const report = await offline.verifyCacheCapacity();
        if (cacheVerifyStatusEl) {
          cacheVerifyStatusEl.textContent = report.passed
            ? `Verified ${report.verifiedMB} MB (${report.entryCount} entries, ${report.evictedCount} evicted).`
            : `Failed: ${report.evictedCount} evicted (${report.verifiedMB} MB).`;
        }
        await renderDiagnostics();
      } catch (err) {
        if (cacheVerifyStatusEl) {
          cacheVerifyStatusEl.textContent = `Verification error: ${err.message}`;
        }
      }
    });
  }

  if (viewport) {
    viewport.subscribe(() => {
      if (settingsOpen) {
        renderDiagnostics();
      }
    });
  }

  function refresh() {
    renderTrailBar();
    renderCueCard();
    if (settingsOpen) {
      renderDiagnostics();
    }
  }

  refresh();

  return {
    refresh,
    openSettings,
    closeSettings,
    setCueCardOpen,
    isSettingsOpen: () => settingsOpen,
    isCueCardOpen: () => cueCardOpen
  };
}
