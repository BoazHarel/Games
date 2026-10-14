/* Roxy's Big Clean: screens, input, sound, and the render loop. */
(function () {
  var RX = globalThis.RX, A = RX.Art;
  var $ = function (id) { return document.getElementById(id); };
  var TAU = Math.PI * 2;

  // ---------- saved stuff ----------
  var SAVE_KEY = 'roxy.v1';
  function defaults() { return { look: { color: 'white', hat: 'party', face: 'happy', trail: 'sparkles' }, levels: {}, audio: 2 }; }
  var save = (function () {
    try { var s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s) { var d = defaults(); d.look = Object.assign(d.look, s.look); d.levels = s.levels || {}; d.audio = s.audio != null ? s.audio : 2; return d; } } catch (e) { }
    return defaults();
  })();
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }
  function totalStars() { var n = 0; for (var k in save.levels) n += save.levels[k].stars || 0; return n; }
  function unlocked(i) { return i === 0 || !!(save.levels[RX.LEVELS[i - 1].id] || {}).stars || !!(save.levels[RX.LEVELS[i].id] || {}).stars; }
  function fmt(t) { t = Math.max(0, Math.floor(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }

  // ---------- sound (all synthesized) ----------
  var Snd = (function () {
    var ac = null, master = null, noiseBuf = null;
    function ensure() {
      if (!ac) {
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          master = ac.createGain(); master.gain.value = 0.45; master.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
          var d = noiseBuf.getChannelData(0);
          for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        } catch (e) { ac = null; }
      }
      if (ac && ac.state === 'suspended') ac.resume();
    }
    function on() { return ac && save.audio > 0; }
    function tone(f, d, o) {
      if (!on()) return;
      o = o || {};
      var t = ac.currentTime + (o.delay || 0);
      var osc = ac.createOscillator(), g = ac.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(f, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, f * o.slide), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.25, t + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + d + 0.05);
    }
    function noise(d, o) {
      if (!on()) return;
      o = o || {};
      var t = ac.currentTime + (o.delay || 0);
      var src = ac.createBufferSource(); src.buffer = noiseBuf;
      var f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
      f.frequency.setValueAtTime(o.freq || 1500, t);
      if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + d);
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t, Math.random() * 0.5); src.stop(t + d + 0.05);
    }
    var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
    var note = function (n) { return 523.25 * Math.pow(2, PENTA[n % PENTA.length] / 12 + Math.floor(n / PENTA.length)); };
    return {
      ensure: ensure, tone: tone, noise: noise,
      click: function () { tone(660, 0.07, { type: 'triangle', vol: 0.18 }); tone(990, 0.06, { type: 'triangle', vol: 0.12, delay: 0.04 }); },
      suck: function (n) { noise(0.08, { freq: 3000, q: 2, vol: 0.06 }); tone(note(Math.min(n, 12)), 0.12, { type: 'triangle', vol: 0.15, slide: 1.3 }); },
      mop: function (n) { noise(0.2, { freq: 600, sweep: 2400, q: 3, vol: 0.12 }); tone(note(Math.min(n, 12)) / 2, 0.15, { type: 'sine', vol: 0.12, slide: 1.5 }); },
      uhoh: function () { tone(520, 0.18, { type: 'square', vol: 0.08 }); tone(390, 0.28, { type: 'square', vol: 0.08, delay: 0.2 }); },
      beep: function () { tone(880, 0.08, { type: 'square', vol: 0.05 }); tone(880, 0.08, { type: 'square', vol: 0.05, delay: 0.14 }); },
      boing: function () { tone(220, 0.35, { type: 'sine', vol: 0.25, slide: 4 }); tone(1320, 0.2, { type: 'triangle', vol: 0.1, delay: 0.15 }); },
      room: function () { [0, 4, 7, 12].forEach(function (s, i) { tone(523.25 * Math.pow(2, s / 12), 0.25, { type: 'triangle', vol: 0.18, delay: i * 0.09 }); }); },
      fanfare: function () {
        [[0, 0], [4, 0.12], [7, 0.24], [12, 0.36], [7, 0.5], [12, 0.62], [16, 0.74], [19, 0.86]].forEach(function (p) { tone(523.25 * Math.pow(2, p[0] / 12), 0.3, { type: 'triangle', vol: 0.2, delay: p[1] }); });
        tone(1046.5, 0.8, { type: 'sine', vol: 0.12, delay: 0.98 });
      },
      star: function (i) { tone(784 * Math.pow(2, i * 4 / 12), 0.3, { type: 'triangle', vol: 0.2 }); tone(1568 * Math.pow(2, i * 4 / 12), 0.2, { type: 'sine', vol: 0.08, delay: 0.05 }); },
      turbo: function () { noise(0.6, { freq: 300, sweep: 4000, q: 1.5, vol: 0.2 }); tone(220, 0.5, { type: 'sawtooth', vol: 0.06, slide: 3 }); },
      whee: function () { tone(500, 0.4, { type: 'sine', vol: 0.2, slide: 2.2 }); tone(750, 0.3, { type: 'triangle', vol: 0.08, slide: 2, delay: 0.1 }); },
      meow: function () { tone(700, 0.35, { type: 'sawtooth', vol: 0.05, slide: 0.6 }); tone(900, 0.25, { type: 'sine', vol: 0.1, slide: 0.55 }); },
      roar: function () { noise(0.5, { freq: 400, sweep: 900, q: 2, vol: 0.25 }); tone(160, 0.4, { type: 'sawtooth', vol: 0.06, slide: 1.4 }); },
      pick: function () { tone(1046, 0.08, { type: 'triangle', vol: 0.12 }); tone(1318, 0.1, { type: 'triangle', vol: 0.12, delay: 0.06 }); },
      nope: function () { tone(300, 0.15, { type: 'triangle', vol: 0.14 }); tone(250, 0.18, { type: 'triangle', vol: 0.14, delay: 0.12 }); },
      dock: function () { [12, 7, 4, 0].forEach(function (s, i) { tone(523.25 * Math.pow(2, s / 12), 0.2, { type: 'sine', vol: 0.12, delay: i * 0.08 }); }); }
    };
  })();

  // ---------- Roxy talks ----------
  var voice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    var vs = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
    var pref = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira', 'Karen', 'Moira', 'Tessa'];
    for (var i = 0; i < pref.length; i++) { var m = vs.find(function (v) { return v.name.indexOf(pref[i]) >= 0; }); if (m) { voice = m; return; } }
    voice = vs[0] || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function say(text, opts) {
    opts = opts || {};
    if (game && opts.bubble !== false) game.bubble = { text: opts.short || text, t: 2.6 };
    if (save.audio < 2 || !window.speechSynthesis) return;
    try {
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        if (!opts.force) return;
        speechSynthesis.cancel();
      }
      var u = new SpeechSynthesisUtterance(text);
      u.pitch = 1.55; u.rate = 1.05; u.volume = 0.95;
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (e) { }
  }
  function hush() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { } }

  // ---------- world view ----------
  var cv = $('world'), ctx = cv.getContext('2d');
  var view = { dpr: 1, T: 0, ox: 0, oy: 0, L: null, floor: null, sprites: null, builtT: 0 };
  var mode = 'title';
  var game = null;   // the house being cleaned (or the title demo)

  function setMode(m) {
    mode = m;
    ['title', 'levels', 'garage'].forEach(function (id) { $(id).classList.toggle('on', id === m); });
    document.body.classList.toggle('playing', m === 'play');
    $('btnSound2').parentNode.style.display = m === 'title' ? '' : 'none';
    if (m !== 'play') { $('hand').classList.remove('on'); $('banner').classList.remove('on'); }
    layout();
  }

  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(vw * view.dpr); cv.height = Math.round(vh * view.dpr);
    var land = vw >= vh;
    document.body.classList.toggle('land', land);
    document.body.classList.toggle('port', !land);
    $('turnHint').style.display = (mode === 'play' && !land && vw < 560) ? 'flex' : 'none';
    if (!game) return;
    var L = game.L, area;
    if (mode === 'play') {
      var hudH = 64;
      if (land) {
        var dw = Math.round(Math.max(96, Math.min(140, vw * 0.12)));
        document.body.style.setProperty('--dockW', dw + 'px');
        area = { x: 0, y: hudH, w: vw - dw, h: vh - hudH };
      } else {
        var dh = Math.round(Math.max(96, Math.min(130, vh * 0.12)));
        document.body.style.setProperty('--dockH', dh + 'px');
        area = { x: 0, y: hudH, w: vw, h: vh - hudH - dh };
      }
      var cssT = Math.min((area.w - 12) / L.W, (area.h - 10) / (L.H + 0.5));
      view.T = Math.max(8, Math.floor(cssT * view.dpr));
    } else {
      area = { x: 0, y: 0, w: vw, h: vh };
      view.T = Math.ceil(Math.max(vw / L.W, vh / (L.H - 1)) * view.dpr);
    }
    view.ox = Math.round((area.x + area.w / 2) * view.dpr - L.W * view.T / 2);
    view.oy = Math.round((area.y + area.h / 2) * view.dpr - L.H * view.T / 2 + view.T * 0.25);
    if (view.L !== L || view.builtT !== view.T) {
      view.L = L; view.builtT = view.T;
      view.floor = A.renderFloor(L, view.T);
      view.sprites = A.buildSprites(L, view.T);
    }
    if (mode === 'play') placeHand();
  }
  window.addEventListener('resize', function () { clearTimeout(layout.t); layout.t = setTimeout(layout, 80); });

  // ---------- starting a house ----------
  var parCache = {};
  function levelDef(i, tall) { return tall ? RX.transposeDef(RX.LEVELS[i]) : RX.LEVELS[i]; }
  function getPar(i, tall) {
    var id = RX.LEVELS[i].id + (tall ? '/t' : '');
    if (!parCache[id]) parCache[id] = RX.computePar(RX.buildLevel(levelDef(i, tall)));
    return parCache[id];
  }

  function newGame(i, demo) {
    // wide houses get turned on their side for tall screens
    var tall = !demo && window.innerHeight > window.innerWidth * 1.15;
    var L = RX.buildLevel(levelDef(i, tall));
    var S = RX.createSim(L, { noToys: !!demo });
    var g = {
      i: i, L: L, S: S, demo: !!demo, par: demo ? null : getPar(i, tall),
      fx: [], flying: [], bubble: null, acc: 0, t: 0, combo: 0, comboT: 0,
      dust: A.renderDust(L), last: { x: S.roxy.x, y: S.roxy.y }, trailAt: 0,
      fading: {}, flag: null, pet: null, stuckBeep: 0, wonAt: 0, starsLost: 0, firstStuck: true,
      brush: 0
    };
    g.dustCtx = g.dust.getContext('2d');
    if (L.def.pet && !demo) {
      var c = L.rooms[0].cells[Math.floor(L.rooms[0].cells.length / 2)];
      g.pet = { kind: L.def.pet, x: (c % L.W) + 0.5, y: ((c / L.W) | 0) + 0.5, a: 0, mode: 'sit', t: 3, path: [], cool: 8, speed: 1 };
    }
    if (demo) RX.setStrategy(S, 'zigzag');
    return g;
  }

  function startLevel(i) {
    hush();
    game = newGame(i, false);
    setMode('play');
    buildRoomChips();
    setStratButtons();
    $('banner').textContent = 'How should Roxy clean?';
    $('banner').classList.add('on');
    $('win').classList.remove('on');
    placeHand();
    setTimeout(function () { if (game && !game.S.started && mode === 'play') say("Hi! I'm Roxy! How should I clean?", { short: 'How should I clean?' }); }, 500);
  }

  function startDemo() {
    game = newGame(1, true);
    layout();
  }

  // ---------- HUD ----------
  function buildRoomChips() {
    var box = $('rooms');
    box.innerHTML = '';
    game.L.rooms.forEach(function (r, k) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.innerHTML = r.icon + '<span class="pc"><i></i></span>';
      b.title = r.name;
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); Snd.ensure(); tapRoom(k); });
      box.appendChild(b);
    });
  }

  var hudCache = {};
  function setText(el, key, val) { if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; } }
  function updateHud() {
    if (!game || game.demo || mode !== 'play') return;
    var S = game.S, par = game.par;
    setText($('timer'), 'timer', fmt(S.cleanTime != null ? S.cleanTime : S.time));
    var t = S.cleanTime != null ? S.cleanTime : S.time;
    var lost = t > par.two ? 2 : t > par.three ? 1 : 0;
    if (lost !== game.starsLost) {
      game.starsLost = lost;
      var spans = document.querySelectorAll('#starRow .st span');
      spans.forEach(function (s, i) { s.classList.toggle('off', i >= 3 - lost); });
      if (lost > 0) Snd.nope();
    }
    var frac = t < par.three ? 1 - t / par.three : t < par.two ? 1 - (t - par.three) / (par.two - par.three) : 0;
    var fill = $('parFill');
    var w = Math.round(frac * 100) + '%';
    if (hudCache.par !== w) { hudCache.par = w; fill.style.width = w; fill.style.background = lost === 0 ? 'linear-gradient(90deg,#f6c623,#ffdf6b)' : 'linear-gradient(90deg,#b8c2cc,#dde3e8)'; }
    var chips = $('rooms').children;
    for (var k = 0; k < chips.length; k++) {
      var cl = 'chip' + (S.roomLeft[k] === 0 ? ' clean' : '') + (S.focus === k && S.started && S.roomLeft[k] > 0 ? ' focus' : '') + (S.requested === k ? ' req' : '');
      if (chips[k].className !== cl) chips[k].className = cl;
      var pct = S.roomTotal[k] ? Math.round((1 - S.roomLeft[k] / S.roomTotal[k]) * 100) + '%' : '100%';
      var bar = chips[k].lastChild.firstChild;
      if (bar.style.width !== pct) bar.style.width = pct;
    }
    var tb = $('turbo');
    var p = S.turbo > 0 ? S.turbo / RX.SIM.TURBO_TIME : S.turboCd > 0 ? 1 - S.turboCd / RX.SIM.TURBO_CD : 1;
    tb.style.setProperty('--p', p.toFixed(3));
    var ready = S.started && S.turbo === 0 && S.turboCd === 0 && S.phase === 'clean';
    if (tb.classList.contains('ready') !== ready) tb.classList.toggle('ready', ready);
  }

  function setStratButtons() {
    document.querySelectorAll('.strat[data-s]').forEach(function (b) { b.classList.toggle('on', !!game && game.S.strategy === b.dataset.s); });
  }

  function placeHand() {
    var hand = $('hand');
    if (!game || game.demo || mode !== 'play' || game.S.started) { hand.classList.remove('on'); return; }
    var btns = document.querySelectorAll('.strat[data-s]');
    var b = btns[Math.floor(Date.now() / 1400) % btns.length].getBoundingClientRect();
    hand.style.left = (b.left + b.width * 0.35) + 'px';
    hand.style.top = (b.top + b.height * 0.45) + 'px';
    hand.classList.add('on');
  }
  setInterval(function () { if (mode === 'play') placeHand(); }, 1400);

  // ---------- player actions ----------
  var STRAT_LINES = {
    zigzag: ['Zig-zag! Back and forth!', 'Zig-zag!'], snail: ['Round and round like a snail!', 'Snail spiral!'],
    bouncy: ['Boing boing! Bouncy time!', 'Boing!'], sniffy: ['Sniff sniff! I smell crumbs!', 'Sniff sniff!']
  };
  document.querySelectorAll('.strat[data-s]').forEach(function (b) {
    b.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      Snd.ensure();
      if (!game || game.demo) return;
      var S = game.S;
      if (S.phase === 'home' || S.phase === 'done') return;
      var s = b.dataset.s, was = S.strategy;
      RX.setStrategy(S, s);
      Snd.click();
      setStratButtons();
      $('banner').classList.remove('on');
      placeHand();
      if (was !== s) say(STRAT_LINES[s][0], { short: STRAT_LINES[s][1], force: true });
      b.classList.add('press'); setTimeout(function () { b.classList.remove('press'); }, 120);
    });
  });
  $('turbo').addEventListener('pointerdown', function (e) {
    e.preventDefault();
    Snd.ensure();
    if (!game || game.demo) return;
    if (RX.turbo(game.S)) {
      Snd.turbo();
      say('Turbo!', { force: true });
      burst(game.S.roxy.x, game.S.roxy.y, 'puff', 10, 0.12, 1.5);
    } else Snd.nope();
  });

  function roomName(k) { return game.L.rooms[k].name; }

  function tapRoom(k) {
    var S = game.S;
    if (S.phase === 'home' || S.phase === 'done') return;
    var r = game.L.rooms[k];
    if (S.roomLeft[k] === 0) {
      Snd.nope();
      say('The ' + r.name.toLowerCase() + ' is already clean!', { short: 'Already clean! ✨', force: true });
      burst(r.label.x, r.label.y, 'sparkle', 10, 0.15, 1.2);
      return;
    }
    var wasStarted = S.started;
    if (RX.requestRoom(S, k)) {
      Snd.pick();
      game.flag = { room: k, t: 0 };
      if (!wasStarted) { setStratButtons(); $('banner').classList.remove('on'); placeHand(); }
      say('Okay! Going to the ' + r.name.toLowerCase() + '!', { short: r.icon + ' Okay!', force: true });
    }
  }

  function tidyToy(toy) {
    var S = game.S, wasStuck = S.stuck === toy;
    RX.removeToy(S, toy);
    Snd.boing();
    // fly into the nearest toy box / basket / chest
    var box = null, bd = 1e9;
    game.L.furniture.forEach(function (f) {
      if (f.t !== 'toybox' && f.t !== 'basket' && f.t !== 'chest') return;
      var d = Math.hypot(f.x + f.w / 2 - toy.x, f.y + f.h / 2 - toy.y);
      if (d < bd) { bd = d; box = f; }
    });
    var tx = box ? box.x + box.w / 2 : toy.x, ty = box ? box.y + box.h / 2 - 0.4 : toy.y - 3;
    game.flying.push({ kind: 'toy', toy: toy, x0: toy.x, y0: toy.y, x1: tx, y1: ty, t: 0, dur: box ? 0.8 : 0.6, gone: !box });
    burst(toy.x, toy.y, 'star', 8, 0.12, 1.6);
    if (wasStuck) say('Thank you! Back to work!', { short: 'Thank you! 💖', force: true });
    else say('Tidy up! Good job!', { short: 'Tidy! 👍' });
  }

  cv.addEventListener('pointerdown', function (e) {
    Snd.ensure();
    if (mode !== 'play' || !game || game.demo) return;
    e.preventDefault();
    var tx = (e.clientX * view.dpr - view.ox) / view.T, ty = (e.clientY * view.dpr - view.oy) / view.T;
    var S = game.S, L = game.L;
    // toys first: they are what kids most need to tap
    var best = null, bd = 0.8;
    S.toys.forEach(function (t) { if (!t.alive) return; var d = Math.hypot(t.x - tx, t.y - ty); if (d < bd) { bd = d; best = t; } });
    if (best) { tidyToy(best); return; }
    var r = S.roxy;
    if (Math.hypot(r.x - tx, r.y + 0.15 - ty) < 0.75) {
      if (RX.spin(S)) {
        Snd.whee();
        burst(r.x, r.y - 0.3, 'heart', 6, 0.12, 1.2);
        say(['Wheee!', 'Hee hee! That tickles!', 'Weee!', 'I love you too!'][Math.floor(Math.random() * 4)], { force: true });
      }
      return;
    }
    var p = game.pet;
    if (p && Math.hypot(p.x - tx, p.y - ty) < 0.65) {
      if (p.kind === 'dragon') { Snd.roar(); burst(p.x + Math.cos(p.a) * 0.4, p.y + Math.sin(p.a) * 0.4, 'puff', 8, 0.1, 1); }
      else Snd.meow();
      burst(p.x, p.y - 0.3, 'heart', 4, 0.1, 1);
      return;
    }
    var cx = Math.floor(tx), cy = Math.floor(ty);
    if (cx < 0 || cy < 0 || cx >= L.W || cy >= L.H) return;
    var k = L.room[cy * L.W + cx];
    if (k >= 0) tapRoom(k);
  });

  // ---------- events from the sim ----------
  var TOY_NAMES = { sock: 'a sock', teddy: 'a teddy bear', car: 'a toy car', dino: 'a dinosaur', ball: 'a ball', bucket: 'a sand bucket', duck: 'a rubber duck', knight: 'a knight', horse: 'a toy horse' };
  function handleEvents() {
    var S = game.S, ev;
    while ((ev = S.events.shift())) {
      if (game.demo) continue;
      switch (ev.t) {
        case 'start':
          say("Let's clean!", { short: "Let's clean! 🧹" });
          break;
        case 'suck':
          if (game.comboT <= 0) game.combo = 0;
          game.combo++; game.comboT = 1.2;
          Snd.suck(game.combo);
          game.flying.push({ kind: 'dirt', d: ev.d, t: 0, dur: 0.22 });
          break;
        case 'mop':
          if (game.comboT <= 0) game.combo = 0;
          game.combo++; game.comboT = 1.2;
          Snd.mop(game.combo);
          burst(ev.d.x, ev.d.y, 'drop', 8, 0.06, 1.6);
          break;
        case 'roomClean':
          var r = game.L.rooms[ev.room];
          game.fading[ev.room] = 0.6;
          Snd.room();
          burst(r.label.x, r.label.y, 'sparkle', 16, 0.16, 2.2);
          game.fx.push({ kind: 'text', text: r.icon + ' Clean!', x: r.label.x, y: r.label.y - 0.3, vx: 0, vy: -0.5, life: 1.8, max: 1.8, size: 0.55, color: '#fff' });
          if (game.flag && game.flag.room === ev.room) game.flag = null;
          if (S.dirtLeft > 0) say('The ' + r.name.toLowerCase() + ' is sparkly clean!', { short: r.icon + ' Sparkly!', force: true });
          break;
        case 'allClean':
          Snd.fanfare();
          confetti(S.roxy.x, S.roxy.y, 40);
          game.flag = null;
          say('All clean! Going home!', { short: 'All clean! 🏠', force: true });
          break;
        case 'docked':
          Snd.dock();
          game.wonAt = game.t + 1.0;
          break;
        case 'stuck':
          Snd.uhoh();
          game.stuckBeep = 2.5;
          say('Uh oh! I am stuck on ' + (TOY_NAMES[ev.toy.kind] || 'a toy') + '! Help me!', { short: 'Help! I\'m stuck!', force: true });
          break;
        case 'focus':
          if (S.requested !== ev.room && S.started && S.dirtLeft > 0 && game.t > 1 && S.roomLeft[ev.room] < S.roomTotal[ev.room] + 1) {
            say('Next: the ' + roomName(ev.room).toLowerCase() + '!', { short: game.L.rooms[ev.room].icon + ' Next!' });
          }
          break;
      }
    }
  }

  // ---------- particles ----------
  function burst(x, y, kind, n, size, speed, color) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = (0.3 + Math.random()) * (speed || 1);
      game.fx.push({ kind: kind, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, life: 0.6 + Math.random() * 0.5, max: 1.1, size: size * (0.7 + Math.random() * 0.6), color: color || null, rot: Math.random() * TAU, g: kind === 'drop' ? 3 : 0 });
    }
  }
  var CONF = ['#C91A09', '#0055BF', '#F2CD37', '#4B9F4A', '#FE8A18', '#F785B1', '#36AEBF', '#ffffff'];
  function confetti(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 2 + Math.random() * 4;
      game.fx.push({ kind: 'brick', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 6, life: 1.6 + Math.random(), max: 2.6, size: 0.1 + Math.random() * 0.06, color: CONF[i % CONF.length], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10 });
    }
  }
  var RAINBOW = ['#ff4b4b', '#ff9f1c', '#ffd23f', '#5fd35f', '#3fa7ff', '#9b6bff'];
  function emitTrail() {
    var S = game.S, r = S.roxy, kind = save.look.trail;
    if (S.moved - game.trailAt < 0.16) return;
    game.trailAt = S.moved;
    var bx = r.x - Math.cos(r.a) * 0.42, by = r.y - Math.sin(r.a) * 0.42;
    var side = (Math.random() - 0.5) * 0.4, px = bx - Math.sin(r.a) * side, py = by + Math.cos(r.a) * side;
    var p = { x: px, y: py, vx: 0, vy: -0.25, life: 1, max: 1, size: 0.08, rot: Math.random() * TAU };
    switch (kind) {
      case 'none': return;
      case 'bubbles': p.kind = 'bubble'; p.size = 0.05 + Math.random() * 0.06; p.life = p.max = 1.3; p.vx = (Math.random() - 0.5) * 0.3; break;
      case 'sparkles': p.kind = 'sparkle'; p.color = ['#FFE066', '#ffffff', '#FF9AD5', '#7FE8FF'][Math.floor(Math.random() * 4)]; p.size = 0.07 + Math.random() * 0.06; p.life = p.max = 0.8; break;
      case 'hearts': p.kind = 'heart'; p.color = Math.random() < 0.5 ? '#FF6FA8' : '#ff4b6e'; p.size = 0.07 + Math.random() * 0.04; break;
      case 'stars': p.kind = 'star'; p.color = Math.random() < 0.7 ? '#FFD23F' : '#ffffff'; p.size = 0.08 + Math.random() * 0.04; break;
      case 'notes': p.kind = 'note'; p.color = ['#8E4FC9', '#0055BF', '#C91A09'][Math.floor(Math.random() * 3)]; p.size = 0.09; p.life = p.max = 1.2; p.vx = Math.sin(game.t * 3) * 0.3; break;
      case 'rainbow':
        for (var i = 0; i < 6; i++) {
          var o = (i - 2.5) * 0.07;
          game.fx.push({ kind: 'rainbow', x: bx - Math.sin(r.a) * o, y: by + Math.cos(r.a) * o, vx: 0, vy: 0, life: 1.1, max: 1.1, size: 0.05, color: RAINBOW[i] });
        }
        game.trailAt -= 0.08;
        return;
    }
    game.fx.push(p);
  }

  function updateFx(dt) {
    var fx = game.fx;
    for (var i = fx.length - 1; i >= 0; i--) {
      var p = fx[i];
      p.life -= dt;
      if (p.life <= 0) { fx.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.kind !== 'rainbow' && p.kind !== 'text' && !p.g) { p.vx *= 0.96; p.vy *= 0.96; }
    }
    for (var j = game.flying.length - 1; j >= 0; j--) {
      var f = game.flying[j];
      f.t += dt;
      if (f.t >= f.dur) {
        game.flying.splice(j, 1);
        if (f.kind === 'toy') burst(f.x1, f.y1, 'puff', 6, 0.08, 1);
      }
    }
    if (fx.length > 600) fx.splice(0, fx.length - 600);
  }

  // ---------- the cat / baby dragon ----------
  function updatePet(dt) {
    var p = game.pet, S = game.S, L = game.L;
    if (!p) return;
    var r = S.roxy;
    p.cool -= dt;
    if (p.mode === 'ride') {
      p.x = r.x; p.y = r.y - 0.05; p.a = r.a;
      p.t -= dt;
      if (p.t <= 0 || S.stuck || S.phase === 'done') hopOff(p);
      return;
    }
    var dr = Math.hypot(p.x - r.x, p.y - r.y);
    if (S.started && dr < 1.0 && p.mode !== 'flee' && !S.stuck && S.spin <= 0) {
      if (p.mode === 'sit' && p.cool <= 0 && Math.random() < 0.5) {
        p.mode = 'ride'; p.t = 6 + Math.random() * 5; p.cool = 25;
        p.kind === 'dragon' ? Snd.roar() : Snd.meow();
        say(p.kind === 'dragon' ? 'Hee hee! A dragon is riding me!' : 'Hee hee! Kitty is riding me!', { short: p.kind === 'dragon' ? '🐉 Wheee!' : '🐱 Wheee!' });
        return;
      }
      runTo(p, randomCellAway(p, 3), 2.6, 'flee');
    }
    if (p.mode === 'walk' || p.mode === 'flee') {
      if (!p.path.length) { p.mode = 'sit'; p.t = 3 + Math.random() * 5; return; }
      var tgt = p.path[0], dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy), step = p.speed * dt;
      p.a = Math.atan2(dy, dx);
      if (d <= step) { p.x = tgt.x; p.y = tgt.y; p.path.shift(); }
      else { p.x += dx / d * step; p.y += dy / d * step; }
    } else {
      p.t -= dt;
      if (p.t <= 0) runTo(p, randomCellAway(p, 0), 0.9, 'walk');
    }
    function randomCellAway(pp, minD) {
      for (var k = 0; k < 30; k++) {
        var c = Math.floor(Math.random() * L.W * L.H);
        if (!L.passable[c] || c === L.dock.cell) continue;
        var x = c % L.W + 0.5, y = ((c / L.W) | 0) + 0.5;
        var dd = Math.hypot(x - pp.x, y - pp.y);
        if (dd >= minD && dd < 8 && Math.hypot(x - r.x, y - r.y) > 2) return c;
      }
      return -1;
    }
  }
  function runTo(p, c, speed, m) {
    var L = game.L;
    if (c < 0) return;
    var start = Math.floor(p.y) * L.W + Math.floor(p.x);
    var path = L.passable[start] ? RX.findPath(L, start, function (x) { return x === c; }) : null;
    if (!path) return;
    p.path = path.map(function (q) { return { x: q % L.W + 0.5, y: ((q / L.W) | 0) + 0.5 }; });
    p.speed = speed; p.mode = m;
  }
  function hopOff(p) {
    var L = game.L, cx = Math.floor(p.x), cy = Math.floor(p.y);
    var opts = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (var i = 0; i < opts.length; i++) {
      var c = (cy + opts[i][1]) * L.W + cx + opts[i][0];
      if (L.passable[c]) { p.mode = 'flee'; p.speed = 2; p.path = [{ x: (c % L.W) + 0.5, y: ((c / L.W) | 0) + 0.5 }]; return; }
    }
    p.mode = 'sit'; p.t = 2;
  }

  // ---------- drawing ----------
  function eraseDust() {
    var S = game.S, r = S.roxy, R = A.DUST_RES, dc = game.dustCtx;
    if (!S.started && !game.demo) { game.last.x = r.x; game.last.y = r.y; return; }
    dc.globalCompositeOperation = 'destination-out';
    dc.strokeStyle = 'rgba(0,0,0,1)'; dc.lineCap = 'round'; dc.lineWidth = R * 0.95;
    dc.beginPath(); dc.moveTo(game.last.x * R, game.last.y * R); dc.lineTo(r.x * R + 0.01, r.y * R); dc.stroke();
    var L = game.L;
    for (var k in game.fading) {
      var left = game.fading[k];
      if (left <= 0) { delete game.fading[k]; continue; }
      game.fading[k] = left - 1 / 60;
      dc.fillStyle = 'rgba(0,0,0,0.12)';
      for (var i = 0; i < L.W * L.H; i++) if (L.room[i] === +k && L.type[i] === 2) dc.fillRect((i % L.W) * R, ((i / L.W) | 0) * R, R, R);
    }
    dc.globalCompositeOperation = 'source-over';
    game.last.x = r.x; game.last.y = r.y;
  }

  function render() {
    var T = view.T, L = game.L, S = game.S, t = game.t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (mode !== 'play') {
      ctx.fillStyle = L.def.outside === 'moat' ? '#3C7FC0' : '#78B65F';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.setTransform(1, 0, 0, 1, view.ox, view.oy);
    // baseplate shadow
    if (mode === 'play') {
      ctx.fillStyle = 'rgba(30,50,90,0.25)';
      A.rr(ctx, T * 0.15, T * 0.3, L.W * T, L.H * T, T * 0.3); ctx.fill();
    }
    ctx.drawImage(view.floor, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(game.dust, 0, 0, L.W * T, L.H * T);

    // flag/room highlight
    if (game.flag) {
      game.flag.t += 1 / 60;
      var fr = L.rooms[game.flag.room];
      ctx.fillStyle = 'rgba(255,240,120,' + (0.12 + 0.08 * Math.sin(t * 5)) + ')';
      fr.cells.forEach(function (c) { ctx.fillRect((c % L.W) * T, ((c / L.W) | 0) * T, T, T); });
    }

    // dirt lying on the floor
    for (var i = 0; i < S.dirt.length; i++) {
      var d = S.dirt[i];
      if (d.alive) A.drawDirt(ctx, d, d.x * T, d.y * T, T, t);
    }

    // everything that stands up, back to front
    var r = S.roxy;
    var list = view.sprites.slice();
    var mood = S.stuck ? 'stuck' : (S.phase === 'done' || S.phase === 'home' || S.spin > 0) ? 'happy' : null;
    if (S.phase === 'done') mood = 'done';
    var roxyItem = { key: r.y + 0.45, roxy: true };
    list.push(roxyItem);
    S.toys.forEach(function (toy) { if (toy.alive) list.push({ key: toy.y + 0.3, toy: toy }); });
    var p = game.pet;
    if (p && p.mode !== 'ride') list.push({ key: p.y + 0.25, pet: p });
    list.sort(function (a, b) { return a.key - b.key; });
    for (var j = 0; j < list.length; j++) {
      var it = list[j];
      if (it.img) ctx.drawImage(it.img, it.dx, it.dy);
      else if (it.roxy) {
        var wig = S.stuck ? Math.sin(t * 30) * 0.06 : 0;
        A.drawRoxy(ctx, (r.x + wig) * T, r.y * T, T * 0.45, save.look, { a: r.a, t: t, brush: game.brush, mood: mood, mop: S.mopping, turbo: S.turbo > 0 });
        if (p && p.mode === 'ride') A.drawPet(ctx, p.kind, r.x * T, (r.y - 0.42) * T, r.a, T * 0.9, t, 'ride');
      } else if (it.toy) {
        var w = it.toy === S.stuck ? Math.sin(t * 25) * 0.15 : 0;
        A.drawToy(ctx, it.toy, it.toy.x * T, it.toy.y * T, T, t, w);
      } else if (it.pet) {
        A.drawPet(ctx, it.pet.kind, it.pet.x * T, it.pet.y * T - (it.pet.kind === 'dragon' ? T * 0.15 : 0), it.pet.a, T * 0.9, t, it.pet.mode);
      }
    }

    // stuff flying into Roxy / toy box
    game.flying.forEach(function (f) {
      var k = f.t / f.dur;
      if (f.kind === 'dirt') {
        var e = k * k;
        var x = f.d.x + (r.x - f.d.x) * e, y = f.d.y + (r.y - 0.12 - f.d.y) * e;
        ctx.save(); ctx.translate(x * T, y * T); ctx.scale(1 - k * 0.8, 1 - k * 0.8); ctx.translate(-x * T, -y * T);
        A.drawDirt(ctx, f.d, x * T, y * T, T, t);
        ctx.restore();
      } else if (f.kind === 'toy') {
        var ex = f.x0 + (f.x1 - f.x0) * k, ey = f.y0 + (f.y1 - f.y0) * k - Math.sin(k * Math.PI) * 1.6;
        ctx.save(); ctx.translate(ex * T, ey * T); var sc = f.gone ? 1 - k : 1 - k * 0.4; ctx.scale(sc, sc); ctx.rotate(k * 6);
        A.drawToy(ctx, f.toy, 0, 0, T, t, 0);
        ctx.restore();
      }
    });

    // room badges + requested flag
    if (mode === 'play') {
      L.rooms.forEach(function (rm, k) {
        var clean = S.roomLeft[k] === 0;
        var bx = rm.label.x * T, by = rm.label.y * T, rad = T * 0.3;
        var near = Math.hypot(r.x - rm.label.x, r.y - rm.label.y) < 1.2;
        ctx.globalAlpha = near ? 0.35 : clean ? 0.95 : 0.8;
        ctx.fillStyle = clean ? '#3fb83a' : 'rgba(255,255,255,0.92)';
        A.circle(ctx, bx, by, rad); ctx.fill();
        ctx.font = Math.round(T * 0.34) + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (clean) { ctx.fillStyle = '#fff'; ctx.font = '700 ' + Math.round(T * 0.4) + 'px Fredoka, sans-serif'; ctx.fillText('✓', bx, by + T * 0.02); }
        else ctx.fillText(rm.icon, bx, by + T * 0.02);
        ctx.globalAlpha = 1;
      });
      if (game.flag) {
        var fl = L.rooms[game.flag.room].label, fx = fl.x * T + T * 0.22, fy = fl.y * T - T * 0.05;
        ctx.fillStyle = '#5b4a3a'; ctx.fillRect(fx - 1, fy - T * 0.9, Math.max(2, T * 0.05), T * 0.9);
        A.stud(ctx, fx, fy, T * 0.1, '#6C6E68');
        ctx.fillStyle = '#C91A09';
        ctx.beginPath(); ctx.moveTo(fx, fy - T * 0.9);
        for (var q = 0; q <= 6; q++) ctx.lineTo(fx + q * T * 0.07, fy - T * 0.9 + Math.sin(t * 8 + q) * T * 0.03);
        for (var q2 = 6; q2 >= 0; q2--) ctx.lineTo(fx + q2 * T * 0.07, fy - T * 0.58 + Math.sin(t * 8 + q2) * T * 0.03);
        ctx.closePath(); ctx.fill();
      }
    }

    // particles
    for (var n = 0; n < game.fx.length; n++) A.drawParticle(ctx, game.fx[n], T);

    // "help!" pointer at the toy Roxy is stuck on
    if (S.stuck && mode === 'play') {
      var st = S.stuck, bob = Math.sin(t * 7) * T * 0.12;
      ctx.font = Math.round(T * 0.8) + 'px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👆', st.x * T + T * 0.1, st.y * T + T * 0.75 + bob);
      ctx.strokeStyle = 'rgba(255,230,80,' + (0.6 + 0.4 * Math.sin(t * 8)) + ')';
      ctx.lineWidth = T * 0.07;
      A.circle(ctx, st.x * T, st.y * T, T * 0.45); ctx.stroke();
    }

    // speech bubble
    if (game.bubble && mode === 'play') {
      var b = game.bubble;
      var fs = Math.max(13, Math.round(T * 0.38));
      ctx.font = '700 ' + fs + 'px Fredoka, system-ui, sans-serif';
      var tw = ctx.measureText(b.text).width, bw = tw + fs * 1.1, bh = fs * 1.7;
      var bx2 = r.x * T - bw / 2, by2 = r.y * T - T * 1.05 - bh - (p && p.mode === 'ride' ? T * 0.4 : 0) - (save.look.hat !== 'none' ? T * 0.2 : 0);
      bx2 = Math.max(-view.ox / 1 + 4, Math.min(bx2, L.W * T - bw));
      by2 = Math.max(-view.oy + 4 + 64 * view.dpr, by2);
      var a = Math.min(1, b.t * 3);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(30,20,60,0.25)'; A.rr(ctx, bx2 + 2, by2 + 4, bw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = '#fff'; A.rr(ctx, bx2, by2, bw, bh, bh / 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r.x * T - fs * 0.4, by2 + bh - 1); ctx.lineTo(r.x * T, by2 + bh + fs * 0.55); ctx.lineTo(r.x * T + fs * 0.3, by2 + bh - 1); ctx.fill();
      ctx.fillStyle = '#2b2550'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.text, bx2 + bw / 2, by2 + bh / 2 + 1);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---------- main loop ----------
  var STEP = 1 / 60, lastNow = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    if (game) {
      var paused = $('confirm').classList.contains('on') || document.hidden;
      if (!paused) {
        game.t += dt;
        game.acc += dt;
        while (game.acc >= STEP) {
          RX.step(game.S, STEP);
          handleEvents();
          game.acc -= STEP;
        }
        var S = game.S;
        var moving = S.started && !S.stuck && S.phase !== 'done';
        game.brush += dt * (moving ? 16 : 2);
        if (game.comboT > 0) game.comboT -= dt;
        if (game.bubble) { game.bubble.t -= dt; if (game.bubble.t <= 0) game.bubble = null; }
        if (S.stuck) {
          game.stuckBeep -= dt;
          if (game.stuckBeep <= 0) { game.stuckBeep = 2.5; Snd.beep(); if (!game.bubble) game.bubble = { text: 'Help! 🆘', t: 1.5 }; }
        }
        if (moving) emitTrail();
        if (S.mopping && Math.random() < 0.3) game.fx.push({ kind: 'drop', x: S.roxy.x + (Math.random() - 0.5) * 0.6, y: S.roxy.y + (Math.random() - 0.5) * 0.6, vx: 0, vy: -0.4, g: 2, life: 0.4, max: 0.5, size: 0.04 });
        if (S.turbo > 0 && Math.random() < 0.5) game.fx.push({ kind: 'puff', x: S.roxy.x - Math.cos(S.roxy.a) * 0.45, y: S.roxy.y - Math.sin(S.roxy.a) * 0.45, vx: -Math.cos(S.roxy.a) * 0.5, vy: -Math.sin(S.roxy.a) * 0.5, life: 0.4, max: 0.5, size: 0.08 });
        updateFx(dt);
        updatePet(dt);
        eraseDust();
        if (game.demo && S.phase === 'done') { game = newGame(1 + Math.floor(Math.random() * 2), true); layout(); }
        if (!game.demo && game.wonAt && game.t >= game.wonAt && !$('win').classList.contains('on')) showWin();
      }
      render();
      updateHud();
    }
    if (mode === 'garage') drawGarage(now / 1000);
    if ($('win').classList.contains('on')) drawWinRoxy(now / 1000);
    requestAnimationFrame(frame);
  }

  // ---------- winning ----------
  function showWin() {
    var S = game.S, par = game.par, t = S.cleanTime;
    var stars = t <= par.three ? 3 : t <= par.two ? 2 : 1;
    var id = game.L.def.id, prev = save.levels[id] || {};
    var before = totalStars();
    var newBest = !prev.best || t < prev.best;
    save.levels[id] = { stars: Math.max(prev.stars || 0, stars), best: newBest ? t : prev.best };
    persist();
    var after = totalStars();
    $('winTitle').textContent = ['', 'All clean!', 'Super clean!', 'Sparkly clean!'][stars];
    $('winTime').textContent = '⏱ ' + fmt(t);
    $('winBest').innerHTML = newBest && prev.best ? 'Best: ' + fmt(t) + '<span class="newrec">New record!</span>' : 'Best: ' + fmt(save.levels[id].best);
    var spans = document.querySelectorAll('.bigstars span');
    spans.forEach(function (s) { s.className = ''; });
    spans.forEach(function (s, i) {
      setTimeout(function () { s.className = 'in' + (i >= stars ? ' off' : ''); if (i < stars) Snd.star(i); }, 400 + i * 380);
    });
    var unlocks = [];
    [A.COLORS, A.HATS, A.FACES, A.TRAILS].forEach(function (list) { list.forEach(function (o) { if (o.stars && o.stars > before && o.stars <= after) unlocks.push(o.name); }); });
    if (game.i + 1 < RX.LEVELS.length && !prev.stars && !save.levels[RX.LEVELS[game.i + 1].id]) unlocks.unshift('🏠 ' + RX.LEVELS[game.i + 1].name);
    $('winUnlocks').textContent = unlocks.length ? '🎁 New: ' + unlocks.join(', ') + '!' : '';
    $('winNext').style.display = game.i + 1 < RX.LEVELS.length ? '' : 'none';
    $('win').classList.add('on');
    say(stars === 3 ? 'Wow! Three stars! You are amazing helpers!' : stars === 2 ? 'Great job! Two stars!' : 'We did it! The house is clean!', { bubble: false, force: true });
  }

  // ---------- garage ----------
  var gTab = 'color', gParts = [], gAngle = 0;
  var gcv = $('garageCv'), gctx = gcv.getContext('2d');
  function openGarage() {
    setMode('garage');
    $('gaStars').textContent = '⭐ ' + totalStars();
    buildOptions();
  }
  function listFor(tab) { return { color: A.COLORS, hat: A.HATS, face: A.FACES, trail: A.TRAILS }[tab]; }
  function buildOptions() {
    var box = $('options'), list = listFor(gTab), stars = totalStars();
    box.innerHTML = '';
    document.querySelectorAll('#tabs .brick').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === gTab); });
    list.forEach(function (o) {
      var locked = o.stars && stars < o.stars;
      var b = document.createElement('button');
      b.className = 'opt' + (save.look[gTab] === o.id ? ' sel' : '') + (locked ? ' lock' : '');
      var c = document.createElement('canvas');
      c.width = c.height = 160;
      b.appendChild(c);
      var lbl = document.createElement('div'); lbl.textContent = o.name; b.appendChild(lbl);
      if (locked) { var lk = document.createElement('div'); lk.className = 'lk'; lk.textContent = '🔒 ⭐' + o.stars; b.appendChild(lk); }
      drawOption(c, gTab, o.id);
      b.addEventListener('click', function () {
        Snd.ensure();
        if (locked) { Snd.nope(); say('Earn ' + o.stars + ' stars to unlock this!', { bubble: false, force: true }); return; }
        save.look[gTab] = o.id; persist();
        Snd.pick();
        box.querySelectorAll('.opt').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        if (gTab === 'color') buildOptions();
        for (var i = 0; i < 14; i++) { var a = Math.random() * TAU; gParts.push({ kind: 'sparkle', x: Math.cos(a) * 0.4, y: Math.sin(a) * 0.4 - 0.2, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, life: 0.8, max: 0.8, size: 0.06, color: ['#FFE066', '#fff', '#FF9AD5'][i % 3] }); }
      });
      box.appendChild(b);
    });
  }
  function drawOption(c, tab, id) {
    var x = c.getContext('2d'), look = Object.assign({}, save.look);
    look[tab] = id;
    x.clearRect(0, 0, c.width, c.height);
    if (tab === 'trail') {
      look.hat = 'none';
      var R = 30, demo = [];
      x.save(); x.translate(0, 0);
      var parts = { none: [], bubbles: 'bubble', sparkles: 'sparkle', hearts: 'heart', stars: 'star', notes: 'note', rainbow: 'rainbow' }[id];
      if (parts && parts.length) {
        for (var i = 0; i < 6; i++) {
          var px = 0.12 + i * 0.07, py = 0.55 + Math.sin(i) * 0.12;
          if (parts === 'rainbow') { for (var k = 0; k < 6; k++) demo.push({ kind: 'rainbow', x: px, y: 0.47 + k * 0.035, life: 1, max: 1, size: 0.025, color: RAINBOW[k] }); }
          else demo.push({ kind: parts, x: px, y: py, life: 1, max: 1, size: 0.05, color: ['#FFE066', '#FF6FA8', '#8E4FC9', '#7FE8FF'][i % 4] });
        }
      }
      demo.forEach(function (p) { A.drawParticle(x, p, c.width); });
      A.drawRoxy(x, c.width * 0.68, c.height * 0.58, R * 1.4, look, { a: 0, t: 0, brush: 0.3 });
      x.restore();
      return;
    }
    if (tab === 'hat' && id !== 'none') {
      A.drawRoxy(x, c.width / 2, c.height * 0.8, 60, look, { a: Math.PI / 2, t: 0.5, brush: 0.3 });
    } else {
      A.drawRoxy(x, c.width / 2, c.height * 0.62, 52, look, { a: Math.PI / 2, t: 0.5, brush: 0.3 });
    }
  }
  function drawGarage(t) {
    var r = gcv.getBoundingClientRect(), dpr = view.dpr;
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return;
    if (gcv.width !== W || gcv.height !== H) { gcv.width = W; gcv.height = H; }
    var c = gctx, S = Math.min(W, H);
    c.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H * 0.52, plate = S * 0.42;
    // round studded turntable
    c.fillStyle = 'rgba(30,50,110,0.2)'; A.ellipse(c, cx + 6, cy + plate * 0.12, plate * 1.02, plate * 0.98); c.fill();
    c.fillStyle = '#5E9C4E'; A.circle(c, cx, cy + plate * 0.06, plate); c.fill();
    c.fillStyle = '#78B65F'; A.circle(c, cx, cy, plate); c.fill();
    var sp = S * 0.05;
    for (var y = -plate; y <= plate; y += sp) for (var x = -plate; x <= plate; x += sp) {
      if (x * x + y * y > (plate - sp * 0.6) * (plate - sp * 0.6)) continue;
      A.stud(c, cx + x, cy + y, sp * 0.27, '#78B65F');
    }
    gAngle += 0.012;
    var R = S * 0.2, a = Math.sin(gAngle) * 1.3 + Math.PI / 2;
    var rx = cx + Math.cos(gAngle * 0.8) * S * 0.05, ry = cy + Math.sin(gAngle * 1.3) * S * 0.03;
    // trail preview
    if (Math.random() < 0.35 && save.look.trail !== 'none') {
      var kinds = { bubbles: 'bubble', sparkles: 'sparkle', hearts: 'heart', stars: 'star', notes: 'note', rainbow: 'rainbow' };
      var k = kinds[save.look.trail];
      if (k === 'rainbow') { for (var q = 0; q < 6; q++) gParts.push({ kind: 'rainbow', x: (rx - cx) / S + (q - 2.5) * 0.012, y: (ry - cy) / S + 0.12, vx: (q - 2.5) * 0.04, vy: 0.25, life: 1, max: 1, size: 0.012, color: RAINBOW[q] }); }
      else gParts.push({ kind: k, x: (rx - cx) / S + (Math.random() - 0.5) * 0.3, y: (ry - cy) / S + 0.1, vx: (Math.random() - 0.5) * 0.2, vy: -0.25, life: 1.2, max: 1.2, size: 0.025, color: ['#FFE066', '#FF6FA8', '#8E4FC9', '#7FE8FF', '#ffffff'][Math.floor(Math.random() * 5)], rot: Math.random() * 6 });
    }
    c.save(); c.translate(cx, cy);
    for (var i = gParts.length - 1; i >= 0; i--) {
      var p = gParts[i];
      p.life -= 1 / 60; p.x += p.vx / 60; p.y += p.vy / 60;
      if (p.life <= 0) { gParts.splice(i, 1); continue; }
      A.drawParticle(c, p, S);
    }
    c.restore();
    A.drawRoxy(c, rx, ry, R, save.look, { a: a, t: t, brush: t * 10, mood: null });
  }
  function drawWinRoxy(t) {
    var c = $('winRoxy'), x = c.getContext('2d');
    if (c.width !== 240) { c.width = 240; c.height = 240; }
    x.clearRect(0, 0, 240, 240);
    A.drawRoxy(x, 120, 150 + Math.abs(Math.sin(t * 4)) * -14, 62, save.look, { a: Math.PI / 2 + Math.sin(t * 2) * 0.4, t: t, brush: t * 8, mood: 'done' });
  }

  // ---------- level select ----------
  function openLevels() {
    setMode('levels');
    if (!game || !game.demo) startDemo();
    $('lvStars').textContent = '⭐ ' + totalStars();
    var grid = $('levelGrid');
    grid.innerHTML = '';
    RX.LEVELS.forEach(function (def, i) {
      var L = RX.buildLevel(def), rec = save.levels[def.id] || {}, open = unlocked(i);
      var b = document.createElement('button');
      b.className = 'card' + (open ? '' : ' locked');
      var thumb = A.renderThumb(L, 360);
      thumb.style.width = '100%';
      b.innerHTML = '<div class="num">' + (i + 1) + '</div>';
      b.appendChild(thumb);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = def.name; b.appendChild(nm);
      var meta = document.createElement('div'); meta.className = 'meta';
      var s = rec.stars || 0;
      meta.innerHTML = '<span class="stars">' + '⭐'.repeat(s) + '<span style="filter:grayscale(1);opacity:.3">' + '⭐'.repeat(3 - s) + '</span></span>' + (rec.best ? '<span>⏱ ' + fmt(rec.best) + '</span>' : '');
      b.appendChild(meta);
      b.addEventListener('click', function () {
        Snd.ensure();
        if (!open) { Snd.nope(); say('Clean the house before this one first!', { bubble: false, force: true }); return; }
        Snd.click();
        startLevel(i);
      });
      grid.appendChild(b);
    });
  }

  // ---------- buttons ----------
  function onTap(id, fn) { $(id).addEventListener('click', function (e) { Snd.ensure(); fn(e); }); }
  onTap('btnPlay', function () { Snd.click(); openLevels(); });
  onTap('btnGarage', function () { Snd.click(); openGarage(); });
  onTap('lvBack', function () { Snd.click(); setMode('title'); });
  onTap('gaBack', function () { Snd.click(); setMode('title'); });
  document.querySelectorAll('#tabs .brick').forEach(function (b) { b.addEventListener('click', function () { Snd.ensure(); Snd.click(); gTab = b.dataset.tab; buildOptions(); }); });
  onTap('btnHome', function () { Snd.click(); $('confirm').classList.add('on'); });
  onTap('cfNo', function () { Snd.click(); $('confirm').classList.remove('on'); });
  onTap('cfYes', function () { Snd.click(); $('confirm').classList.remove('on'); hush(); openLevels(); });
  onTap('winAgain', function () { Snd.click(); startLevel(game.i); });
  onTap('winNext', function () { Snd.click(); startLevel(Math.min(game.i + 1, RX.LEVELS.length - 1)); });
  onTap('winHouses', function () { Snd.click(); $('win').classList.remove('on'); hush(); openLevels(); });
  var SOUND_ICONS = ['🔇', '🔈', '🔊'];
  function syncSound() { $('btnSound').textContent = $('btnSound2').textContent = SOUND_ICONS[save.audio]; }
  function cycleSound() { save.audio = (save.audio + 2) % 3; persist(); syncSound(); if (save.audio < 2) hush(); Snd.click(); if (save.audio === 2) say('I can talk!', { force: true }); }
  onTap('btnSound', cycleSound);
  onTap('btnSound2', cycleSound);
  syncSound();
  document.addEventListener('visibilitychange', function () { if (document.hidden) hush(); });

  // ---------- go ----------
  startDemo();
  setMode('title');
  requestAnimationFrame(frame);

  // test hooks
  function ff(sec) {
    for (var i = 0; i < sec * 60 && game; i++) {
      RX.step(game.S, STEP); handleEvents(); updateFx(STEP); updatePet(STEP); eraseDust(); game.t += STEP;
      if (game.S.stuck || game.S.phase === 'done') break;
    }
    return { time: game.S.time, left: game.S.dirtLeft, stuck: game.S.stuck && game.S.stuck.kind, phase: game.S.phase };
  }
  RX.debug = { ff: ff, get game() { return game; }, startLevel: startLevel, openGarage: openGarage, openLevels: openLevels, showWin: showWin, save: save, setMode: setMode, tidyToy: tidyToy, tapRoom: tapRoom };
})();
