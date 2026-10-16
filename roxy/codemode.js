/* Code Roxy: block-coding puzzles. Build a program, press Go, watch Roxy run it. */
(function () {
  var RX = globalThis.RX, A = RX.Art, Code = RX.Code;
  var $ = function (id) { return document.getElementById(id); };
  var App = function () { return RX.App; };
  var TAU = Math.PI * 2;

  // ---------- block pictures ----------
  var ICON = {
    fwd: '<svg viewBox="0 0 40 40"><path d="M20 4 L34 20 H25 V36 H15 V20 H6 Z" fill="#fff"/></svg>',
    left: '<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M30 34 V20 Q30 12 22 12 H10"/><path d="M16 5 L9 12 L16 19"/></svg>',
    right: '<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 34 V20 Q10 12 18 12 H30"/><path d="M24 5 L31 12 L24 19"/></svg>',
    repeat: '<svg viewBox="0 0 40 40" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 18 A12 12 0 0 1 30 12"/><path d="M31 4 V13 H22"/><path d="M32 22 A12 12 0 0 1 10 28"/><path d="M9 36 V27 H18"/></svg>',
    mop: '<svg viewBox="0 0 40 40"><path d="M20 4 C26 13 31 19 31 25 A11 11 0 0 1 9 25 C9 19 14 13 20 4 Z" fill="#fff"/><ellipse cx="15" cy="25" rx="3" ry="4.5" fill="#1E9BB0" opacity="0.5"/></svg>',
    zoom: '<svg viewBox="0 0 40 40"><path d="M6 8 L20 20 L6 32 Z M20 8 L34 20 L20 32 Z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>'
  };
  var INTRO = {
    fwd: 'Forward makes Roxy drive one square ahead.',
    right: 'Right turns Roxy to HER right. She stays on the same square!',
    left: 'Left turns Roxy to HER left. Look at which way she is facing!',
    repeat: 'Repeat does the blocks inside it again and again. Tap the number to change how many times!',
    mop: 'Mop cleans a puddle when Roxy is sitting on it.',
    zoom: 'Zoom drives Roxy forward until something is in the way.'
  };
  var CH_COLORS = { 1: '#0055BF', 2: '#8E4FC9', 3: '#1E9BB0', 4: '#C91A09' };

  function blockHtml(op, extra) {
    return '<span class="ic">' + ICON[op] + '</span><span>' + Code.BLOCKS[op].name + '</span>' + (extra || '');
  }

  // ---------- state ----------
  var P = null;              // the open puzzle
  var progs = {};            // programs kept while the app is open, by puzzle id
  var speed = 1;
  var cv = $('codeCv'), ctx = cv.getContext('2d');

  function save() { return App().save; }
  function rec(id) { return save().code[id] || {}; }
  function unlocked(i) {
    var ps = Code.PUZZLES;
    return i === 0 || !!rec(ps[i - 1].id).stars || !!rec(ps[i].id).stars;
  }

  // ---------- puzzle list ----------
  function openLevels() {
    stopRun();
    App().setMode('codeLevels');
    $('clStars').textContent = '⭐ ' + App().totalStars();
    var box = $('chapters');
    box.innerHTML = '';
    var nextShown = false;
    Code.CHAPTERS.forEach(function (ch) {
      var sec = document.createElement('div');
      sec.className = 'chap';
      var used = {};
      Code.PUZZLES.forEach(function (p) { if (p.ch === ch.n) p.blocks.forEach(function (b) { used[b] = 1; }); });
      sec.innerHTML = '<h3>' + ch.icon + ' ' + ch.n + '. ' + ch.name + ' <span class="mini">' +
        Object.keys(used).map(function (b) { return '<span style="background:' + Code.BLOCKS[b].color + '">' + ICON[b] + '</span>'; }).join('') + '</span></h3>';
      var tiles = document.createElement('div');
      tiles.className = 'tiles';
      Code.PUZZLES.forEach(function (p, i) {
        if (p.ch !== ch.n) return;
        var r = rec(p.id), open = unlocked(i);
        var b = document.createElement('button');
        b.className = 'tile' + (open ? '' : ' locked');
        b.style.setProperty('--c', CH_COLORS[ch.n]);
        if (open && !r.stars && !nextShown) { b.classList.add('next'); nextShown = true; }
        var s = r.stars || 0;
        b.innerHTML = '<span class="tn">' + (i + 1) + '</span><span class="tname">' + p.name + '</span><span class="ts">' + '⭐'.repeat(s) + '<span class="off">' + '⭐'.repeat(3 - s) + '</span></span>';
        b.addEventListener('click', function () {
          App().Snd.ensure();
          if (!open) { App().Snd.nope(); App().say('Finish the puzzle before this one first!', { bubble: false, force: true }); return; }
          App().Snd.click();
          openPuzzle(i);
        });
        tiles.appendChild(b);
      });
      sec.appendChild(tiles);
      box.appendChild(sec);
    });
  }

  // ---------- one puzzle ----------
  function openPuzzle(i) {
    var puz = Code.PUZZLES[i];
    var w = Code.build(puz);
    P = {
      i: i, puz: puz, w: w, L: RX.buildLevel(w.def), par: Code.par(puz),
      prog: progs[puz.id] || [], cur: null, T: 0, floor: null, sprites: null,
      view: null, run: null, fx: [], hint: null, t: 0, combo: 0
    };
    progs[puz.id] = P.prog;
    P.cur = { parent: null, index: P.prog.length };
    resetView();
    App().setMode('code');
    $('cNum').textContent = i + 1;
    $('cName').textContent = puz.name;
    var goal = '⭐⭐⭐ ' + P.par + ' blocks or fewer';
    if (puz.home) goal = '🏠 End on the dock · ' + goal;
    $('cGoal').textContent = goal;
    $('cSound').textContent = App().soundIcon();
    $('cWin').classList.remove('on');
    hideMsg();
    renderPalette();
    renderProg();
    if (puz.intro && !save().codeSeen[puz.intro]) showIntro(puz.intro);
    else setTimeout(function () { if (P && P.puz === puz) App().say(puz.home ? 'Clean up, then drive me back home to my dock!' : 'Can you clean up all the mess?', { bubble: false }); }, 400);
  }

  function resetView() {
    var w = P.w;
    P.view = {
      x: w.start.x, y: w.start.y, a: Code.ANGLE[w.start.dir], mood: null, wob: 0,
      dirt: w.dirt.map(function (d) { return { d: d, alive: true, hp: 1 }; }),
      bubble: null
    };
  }

  function showIntro(op) {
    $('cIntroBlk').innerHTML = '<div class="blk intro-blk" style="--c:' + Code.BLOCKS[op].color + '">' + blockHtml(op, op === 'repeat' ? '<span class="nchip">×3</span>' : '') + '</div>';
    $('cIntroText').textContent = INTRO[op];
    $('cIntro').classList.add('on');
    App().say('New block! ' + INTRO[op], { bubble: false, force: true });
  }
  $('cIntroOk').addEventListener('click', function () {
    App().Snd.ensure(); App().Snd.click();
    if (P && P.puz.intro) { save().codeSeen[P.puz.intro] = 1; App().persist(); }
    $('cIntro').classList.remove('on');
    App().hush();
  });

  // ---------- the program editor ----------
  function listOf(parent) { return parent ? parent.body : P.prog; }
  function find(node, list, parent) {
    list = list || P.prog;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === node) return { parent: parent || null, index: i };
      if (list[i].body) { var r = find(node, list[i].body, list[i]); if (r) return r; }
    }
    return null;
  }
  function inside(node, target) {
    if (!node || !node.body) return false;
    return node.body.some(function (b) { return b === target || inside(b, target); });
  }
  function total() { return Code.count(P.prog); }
  function full() { return P.puz.max && total() >= P.puz.max; }

  function edited() {
    stopRun();
    resetView();
    hideMsg();
    P.hint = null;
    renderProg();
  }

  function add(op) {
    if (full()) {
      App().Snd.nope();
      showMsg('Only ' + P.puz.max + ' blocks fit here! Try a Repeat.', true);
      App().say('Only ' + P.puz.max + ' blocks fit! Can you use Repeat?', { bubble: false, force: true });
      return;
    }
    var node = Code.node(op);
    listOf(P.cur.parent).splice(P.cur.index, 0, node);
    if (op === 'repeat') P.cur = { parent: node, index: 0 };
    else P.cur.index++;
    App().Snd.click();
    App().say(Code.BLOCKS[op].say, { bubble: false, force: true });
    edited();
  }

  function removeNode(node) {
    var loc = find(node);
    if (!loc) return;
    listOf(loc.parent).splice(loc.index, 1);
    if (P.cur.parent === node || inside(node, P.cur.parent)) P.cur = { parent: loc.parent, index: loc.index };
    else if (P.cur.parent === loc.parent && P.cur.index > loc.index) P.cur.index--;
    App().Snd.tone(300, 0.12, { type: 'triangle', vol: 0.15, slide: 0.6 });
    edited();
  }

  function backspace() {
    var list = listOf(P.cur.parent);
    if (P.cur.index > 0) { removeNode(list[P.cur.index - 1]); return; }
    if (P.cur.parent) {
      var par = P.cur.parent, loc = find(par);
      if (!par.body.length) { removeNode(par); return; }
      P.cur = { parent: loc.parent, index: loc.index };
      edited();
      return;
    }
    App().Snd.nope();
  }

  function setCursor(parent, index) {
    P.cur = { parent: parent, index: index };
    App().Snd.tone(880, 0.05, { type: 'triangle', vol: 0.1 });
    renderProg();
  }

  function renderPalette() {
    var box = $('cPalBlocks');
    box.innerHTML = '';
    P.puz.blocks.forEach(function (op) {
      var b = document.createElement('button');
      b.className = 'blk pal';
      b.style.setProperty('--c', Code.BLOCKS[op].color);
      b.innerHTML = blockHtml(op);
      b.dataset.op = op;
      b.addEventListener('click', function () { App().Snd.ensure(); add(op); });
      box.appendChild(b);
    });
  }

  function cursorEl() {
    var c = document.createElement('div');
    c.className = 'cur';
    c.textContent = P.cur.parent ? 'next block goes here (inside the loop)' : 'next block goes here';
    if (P.cur.parent) {
      var out = document.createElement('button');
      out.className = 'out';
      out.textContent = '⤵ Out of loop';
      out.addEventListener('click', function (e) {
        e.stopPropagation();
        var loc = find(P.cur.parent);
        setCursor(loc.parent, loc.index + 1);
      });
      c.appendChild(out);
    }
    return c;
  }

  function renderList(box, list, parent) {
    for (var i = 0; i <= list.length; i++) {
      if (P.cur.parent === parent && P.cur.index === i) box.appendChild(cursorEl());
      if (i < list.length) box.appendChild(blockEl(list[i], parent, i));
    }
  }

  function blockEl(b, parent, i) {
    var info = Code.BLOCKS[b.op];
    var head = document.createElement('div');
    head.className = 'blk';
    head.dataset.id = b.id;
    head.style.setProperty('--c', info.color);
    head.innerHTML = blockHtml(b.op, (b.op === 'repeat' ? '<span class="nchip">×' + b.n + '</span>' : '') + '<span class="x">✕</span>');
    head.querySelector('.x').addEventListener('click', function (e) { e.stopPropagation(); App().Snd.ensure(); removeNode(b); });
    if (b.op !== 'repeat') {
      head.addEventListener('click', function () { App().Snd.ensure(); setCursor(parent, i + 1); });
      return head;
    }
    head.querySelector('.nchip').addEventListener('click', function (e) {
      e.stopPropagation(); App().Snd.ensure();
      b.n = b.n >= 9 ? 2 : b.n + 1;
      App().Snd.tone(500 + b.n * 60, 0.08, { type: 'triangle', vol: 0.15 });
      App().say(b.n + ' times!', { bubble: false, force: true });
      edited();
    });
    head.addEventListener('click', function () { App().Snd.ensure(); setCursor(b, b.body.length); });
    var wrap = document.createElement('div');
    wrap.className = 'loop';
    wrap.appendChild(head);
    var body = document.createElement('div');
    body.className = 'loop-body';
    renderList(body, b.body, b);
    wrap.appendChild(body);
    var end = document.createElement('div');
    end.className = 'loop-end';
    end.addEventListener('click', function () { App().Snd.ensure(); setCursor(parent, i + 1); });
    wrap.appendChild(end);
    return wrap;
  }

  function renderProg() {
    var box = $('cProg');
    box.innerHTML = '';
    var hat = document.createElement('div');
    hat.className = 'hat-blk';
    hat.textContent = '▶ When I press Go';
    hat.addEventListener('click', function () { setCursor(null, 0); });
    box.appendChild(hat);
    renderList(box, P.prog, null);
    var n = total();
    var cnt = $('cCount');
    cnt.textContent = P.puz.max ? n + ' / ' + P.puz.max : n + (n === 1 ? ' block' : ' blocks');
    cnt.classList.toggle('full', !!full());
    document.querySelectorAll('#cPalBlocks .blk').forEach(function (b) { b.classList.toggle('off', !!full()); });
    var c = box.querySelector('.cur');
    if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' });
  }

  function highlight(id, cls) {
    document.querySelectorAll('#cProg .blk.' + cls).forEach(function (e) { e.classList.remove(cls); });
    if (id == null) return;
    var el = document.querySelector('#cProg .blk[data-id="' + id + '"]');
    if (el) {
      el.classList.add(cls);
      var box = $('cProg'), r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
      if (r.top < br.top || r.bottom > br.bottom) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ---------- running ----------
  var DUR = { move: 0.42, turn: 0.32, mop: 0.8, mopnone: 0.45, bump: 0.6, stuck: 0.8, zoomstop: 0.45, loop: 0.18 };

  function startRun(stepMode) {
    if (!P) return;
    if (P.run && P.run.done) { resetView(); P.run = null; }
    if (!P.run) {
      if (!P.prog.length) {
        App().Snd.nope();
        showMsg('Add some blocks first! 👉', true);
        App().say('Tap the blocks to build your code!', { bubble: false, force: true });
        return;
      }
      resetView();
      hideMsg();
      highlight(null, 'bad');
      var r = Code.run(P.w, P.prog);
      P.run = { steps: r.steps, res: r, i: 0, t: 0, playing: true, stepMode: !!stepMode, done: false };
      P.combo = 0;
      if (r.steps.length) beginStep();
    } else {
      P.run.playing = true;
      P.run.stepMode = !!stepMode;
    }
    if (!P.run.steps.length) finishRun();
    updateGo();
  }

  function stopRun() {
    if (!P) return;
    P.run = null;
    highlight(null, 'run');
    highlight(null, 'bad');
    updateGo();
  }

  function updateGo() {
    var g = $('cGo');
    var playing = P && P.run && P.run.playing && !P.run.done;
    g.textContent = playing ? '⏸ Pause' : '▶ Go!';
    g.classList.toggle('stop', !!playing);
  }

  function beginStep() {
    var s = P.run.steps[P.run.i];
    highlight(s.id, 'run');
    var v = P.view;
    s.fromA = v.a;
    s.fromX = v.x; s.fromY = v.y;
    if (s.op === 'turn') App().Snd.tone(s.turn > 0 ? 660 : 520, 0.12, { type: 'triangle', vol: 0.12, slide: s.turn > 0 ? 1.3 : 0.8 });
    if (s.op === 'move') App().Snd.tone(330, 0.08, { type: 'sine', vol: 0.06 });
    if (s.op === 'loop') App().Snd.tone(440 + s.lap * 70, 0.1, { type: 'triangle', vol: 0.1 });
    if (s.op === 'bump' || s.op === 'stuck') App().Snd.uhoh();
    if (s.op === 'mop') App().Snd.mop(3);
  }

  function ease(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

  function animateStep(s, k) {
    var v = P.view, d = Code.DIRS[s.dir], e = ease(k);
    v.wob = 0; v.mood = null;
    switch (s.op) {
      case 'move':
        v.x = s.from.x + (s.x - s.from.x) * e; v.y = s.from.y + (s.y - s.from.y) * e; v.a = Code.ANGLE[s.dir];
        break;
      case 'turn':
        v.a = s.fromA + s.turn * Math.PI / 2 * e;
        break;
      case 'bump':
        var b = Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.3;
        v.x = s.x + d[0] * b; v.y = s.y + d[1] * b;
        if (k > 0.3) v.mood = 'stuck';
        break;
      case 'stuck':
        var f = Math.min(1, k * 2) * 0.32;
        v.x = s.x + d[0] * f; v.y = s.y + d[1] * f; v.wob = k > 0.4 ? Math.sin(k * 60) * 0.05 : 0;
        if (k > 0.4) v.mood = 'stuck';
        break;
      case 'zoomstop':
        var z = Math.sin(k * Math.PI) * 0.1;
        v.x = s.x + d[0] * z; v.y = s.y + d[1] * z;
        break;
      case 'mop': case 'mopnone':
        v.wob = Math.sin(k * 40) * 0.04;
        if (s.op === 'mop') s.cleaned.forEach(function (idx) { P.view.dirt[idx].hp = 1 - k; });
        if (Math.random() < 0.4) P.fx.push({ kind: 'drop', x: v.x + 0.5 + (Math.random() - 0.5) * 0.7, y: v.y + 0.5 + (Math.random() - 0.5) * 0.7, vx: 0, vy: -0.5, g: 2, life: 0.4, max: 0.5, size: 0.05 });
        break;
    }
  }

  function endStep(s) {
    var v = P.view;
    animateStep(s, 1);
    if (s.op === 'move' || s.op === 'mop') {
      (s.cleaned || []).forEach(function (idx) {
        var dd = v.dirt[idx];
        dd.alive = false;
        P.combo++;
        if (s.op === 'move') App().Snd.suck(P.combo);
        burst(dd.d.x + 0.5, dd.d.y + 0.5, 'sparkle', 8, 0.08, 1.3);
      });
    }
    if (s.op === 'turn') v.a = s.fromA + s.turn * Math.PI / 2;
  }

  function finishRun() {
    var r = P.run.res;
    P.run.done = true; P.run.playing = false;
    highlight(null, 'run');
    updateGo();
    var name = Code.OBST_NAMES;
    switch (r.result) {
      case 'win': win(); return;
      case 'bump':
        highlight(r.failAt, 'bad');
        showMsg('💥 Oops! Roxy bumped into ' + (name[r.steps[r.steps.length - 1].what] || 'something') + '. Fix the red block!', true);
        App().say('Oops! I bumped into ' + (name[r.steps[r.steps.length - 1].what] || 'something') + '!', { bubble: false, force: true });
        P.view.mood = 'stuck';
        break;
      case 'stuck':
        highlight(r.failAt, 'bad');
        showMsg('🧦 Uh oh! Roxy is stuck on a ' + r.steps[r.steps.length - 1].toy.kind + '. Drive around it!', true);
        App().say('Uh oh! I am stuck! Drive me around it!', { bubble: false, force: true });
        P.view.mood = 'stuck';
        break;
      case 'dirt':
        showMsg('🔍 Roxy still sees ' + r.left + ' more mess. Add more blocks!', true);
        App().say('Hmm, I still see some mess!', { bubble: false, force: true });
        P.pulse = 2.5;
        break;
      case 'home':
        showMsg('🏠 All clean! Now drive Roxy back to her dock.', true);
        App().say('All clean! But I need to go home to my dock!', { bubble: false, force: true });
        break;
      case 'long':
        showMsg('😵 Whoa, that is a LOT of steps! Try fewer repeats.', true);
        break;
    }
  }

  function win() {
    var blocks = total(), stars = Code.stars(P.puz, blocks);
    var id = P.puz.id, prev = rec(id);
    save().code[id] = { stars: Math.max(prev.stars || 0, stars), blocks: Math.min(prev.blocks || 99, blocks) };
    App().persist();
    App().Snd.fanfare();
    P.view.mood = 'done';
    for (var i = 0; i < 40; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 2 + Math.random() * 4;
      P.fx.push({ kind: 'brick', x: P.view.x + 0.5, y: P.view.y + 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 6, life: 1.6 + Math.random(), max: 2.6, size: 0.1 + Math.random() * 0.06, color: ['#C91A09', '#0055BF', '#F2CD37', '#4B9F4A', '#FE8A18', '#F785B1'][i % 6], rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10 });
    }
    setTimeout(function () {
      if (!P || P.puz.id !== id) return;
      $('cWinTitle').textContent = ['', 'You did it!', 'Great coding!', 'Super coder!'][stars];
      $('cWinBlocks').textContent = 'You used ' + blocks + (blocks === 1 ? ' block' : ' blocks') + '.';
      $('cWinTip').textContent = stars < 3 ? '💡 Can you do it with only ' + P.par + ' blocks? ' + (P.puz.blocks.indexOf('repeat') >= 0 ? 'Try Repeat!' : '') : '🏆 Perfect! That is the shortest code!';
      var spans = document.querySelectorAll('#cWinStars span');
      spans.forEach(function (s) { s.className = ''; });
      spans.forEach(function (s, k) { setTimeout(function () { s.className = 'in' + (k >= stars ? ' off' : ''); if (k < stars) App().Snd.star(k); }, 300 + k * 350); });
      $('cWinNext').style.display = P.i + 1 < Code.PUZZLES.length ? '' : 'none';
      $('cWin').classList.add('on');
      App().say(stars === 3 ? 'Perfect code! You are a super coder!' : 'You did it! Great coding!', { bubble: false, force: true });
    }, 1100);
  }

  // ---------- messages, hints, particles ----------
  var msgTimer = null;
  function showMsg(text, bad) {
    var m = $('cMsg');
    m.textContent = text;
    m.classList.toggle('bad', !!bad);
    m.classList.remove('on'); void m.offsetWidth; m.classList.add('on');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(hideMsg, 6000);
  }
  function hideMsg() { $('cMsg').classList.remove('on'); }

  function showHint() {
    var r = Code.run(P.w, Code.parse(P.puz.sol));
    var pts = [{ x: P.w.start.x, y: P.w.start.y }];
    r.steps.forEach(function (s) { if (s.op === 'move') pts.push({ x: s.x, y: s.y }); });
    P.hint = { pts: pts, t: 6 };
    showMsg('💡 ' + P.puz.hint);
    App().say(P.puz.hint, { bubble: false, force: true });
  }

  function burst(x, y, kind, n, size, speed) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = (0.3 + Math.random()) * speed;
      P.fx.push({ kind: kind, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, life: 0.6 + Math.random() * 0.4, max: 1, size: size, color: ['#FFE066', '#ffffff', '#FF9AD5', '#7FE8FF'][i % 4] });
    }
  }

  // ---------- drawing ----------
  function fit() {
    var r = $('cRoom').getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (!W || !H) return false;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var L = P.L;
    // show the room plus a little grass around it
    var cols = L.W - 1.2, rows = L.H - 0.6;
    var T = Math.max(8, Math.floor(Math.min(W / cols, H / rows)));
    if (T !== P.T) { P.T = T; P.floor = A.renderFloor(L, T); P.sprites = A.buildSprites(L, T); }
    P.ox = Math.round(W / 2 - L.W * T / 2);
    P.oy = Math.round(H / 2 - L.H * T / 2 + T * 0.2);
    return true;
  }

  function draw(t) {
    if (!fit()) return;
    var T = P.T, v = P.view, w = P.w;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(1, 0, 0, 1, P.ox, P.oy);
    ctx.drawImage(P.floor, 0, 0);
    // the squares Roxy steps on
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(1, T * 0.03);
    ctx.setLineDash([T * 0.12, T * 0.1]);
    for (var y = 0; y < w.H; y++) for (var x = 0; x < w.W; x++) {
      if (w.grid[y * w.W + x] === '#') continue;
      A.rr(ctx, (x + 2) * T + T * 0.06, (y + 2) * T + T * 0.06, T * 0.88, T * 0.88, T * 0.12); ctx.stroke();
    }
    ctx.setLineDash([]);
    // hint footprints
    if (P.hint) {
      var hp = P.hint, alpha = Math.min(1, hp.t);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(255,214,60,0.9)'; ctx.lineWidth = T * 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      hp.pts.forEach(function (p, k) { var px = (p.x + 2.5) * T, py = (p.y + 2.5) * T; if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
      ctx.stroke();
      ctx.font = '700 ' + Math.round(T * 0.26) + 'px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      hp.pts.forEach(function (p, k) {
        if (!k) return;
        ctx.fillStyle = '#FFD23F'; A.circle(ctx, (p.x + 2.5) * T, (p.y + 2.5) * T, T * 0.17); ctx.fill();
        ctx.fillStyle = '#5a3d00'; ctx.fillText(String(k), (p.x + 2.5) * T, (p.y + 2.5) * T + 1);
      });
      ctx.globalAlpha = 1;
    }
    // mess
    v.dirt.forEach(function (o) {
      if (!o.alive) return;
      var d = o.d, ox = (d.v - 0.5) * 0.25, oy = (d.rot / 6.28 - 0.5) * 0.25;
      var px = (d.x + 2.5 + (d.wet ? 0 : ox)) * T, py = (d.y + 2.5 + (d.wet ? 0 : oy)) * T;
      if (P.pulse > 0) {
        ctx.strokeStyle = 'rgba(255,90,90,' + (0.5 + 0.5 * Math.sin(t * 10)) + ')'; ctx.lineWidth = T * 0.06;
        A.circle(ctx, (d.x + 2.5) * T, (d.y + 2.5) * T, T * 0.38); ctx.stroke();
      }
      A.drawDirt(ctx, { kind: d.kind, wet: d.wet, hp: o.hp, rot: d.rot, v: d.v }, px, py, T * (d.wet ? 1.5 : 1.25), t);
    });
    // which way Roxy is looking (only while waiting)
    if (!P.run || P.run.done) {
      var dirKey = nearestDir(v.a), dd = Code.DIRS[dirKey];
      var ax = (v.x + 2.5 + dd[0] * 0.78) * T, ay = (v.y + 2.5 + dd[1] * 0.78) * T;
      var bob = Math.sin(t * 5) * T * 0.05;
      ctx.save(); ctx.translate(ax + dd[0] * bob, ay + dd[1] * bob); ctx.rotate(Code.ANGLE[dirKey]);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.moveTo(T * 0.16, 0); ctx.lineTo(-T * 0.08, -T * 0.16); ctx.lineTo(-T * 0.02, 0); ctx.lineTo(-T * 0.08, T * 0.16); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // stand-up things in depth order
    var list = P.sprites.slice();
    list.push({ key: v.y + 2.5 + 0.45, roxy: true });
    w.toys.forEach(function (toy) { list.push({ key: toy.y + 2.5 + 0.3, toy: toy }); });
    list.sort(function (a, b) { return a.key - b.key; });
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it.img) ctx.drawImage(it.img, it.dx, it.dy);
      else if (it.toy) {
        var stuckOn = P.run && P.run.res.result === 'stuck' && P.run.done && P.run.res.steps[P.run.res.steps.length - 1].toy === it.toy;
        A.drawToy(ctx, { kind: it.toy.kind, rot: it.toy.rot }, (it.toy.x + 2.5) * T, (it.toy.y + 2.5) * T, T, t, stuckOn ? Math.sin(t * 25) * 0.15 : 0);
      } else if (it.roxy) {
        var moving = P.run && P.run.playing && !P.run.done;
        A.drawRoxy(ctx, (v.x + 2.5 + v.wob) * T, (v.y + 2.5) * T, T * 0.45, save().look, { a: v.a, t: t, brush: moving ? t * 16 : t * 2, mood: v.mood, mop: P.run && P.run.playing && P.run.steps[P.run.i] && P.run.steps[P.run.i].op === 'mop' });
      }
    }
    P.fx.forEach(function (p) { A.drawParticle(ctx, p, T); });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function nearestDir(a) {
    var best = 'e', bd = 9;
    for (var k in Code.ANGLE) {
      var d = Math.abs(Math.atan2(Math.sin(a - Code.ANGLE[k]), Math.cos(a - Code.ANGLE[k])));
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  // called every frame by the main loop while Code Roxy is open
  function frame(t, dt) {
    if (!P || App().mode !== 'code') return;
    P.t += dt;
    var run = P.run;
    if (run && run.playing && !run.done && !$('cIntro').classList.contains('on')) {
      var s = run.steps[run.i];
      run.t += dt * speed;
      var dur = DUR[s.op] || 0.3;
      animateStep(s, Math.min(1, run.t / dur));
      if (run.t >= dur) {
        endStep(s);
        run.i++; run.t = 0;
        var wasLoop = s.op === 'loop';
        if (run.i >= run.steps.length) finishRun();
        else {
          beginStep();
          if (run.stepMode && !wasLoop) { run.playing = false; updateGo(); }
        }
      }
    }
    if (P.hint) { P.hint.t -= dt; if (P.hint.t <= 0) P.hint = null; }
    if (P.pulse > 0) P.pulse -= dt;
    for (var i = P.fx.length - 1; i >= 0; i--) {
      var p = P.fx[i];
      p.life -= dt;
      if (p.life <= 0) { P.fx.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    draw(t);
  }

  // ---------- buttons ----------
  function tap(id, fn) { $(id).addEventListener('click', function (e) { App().Snd.ensure(); fn(e); }); }
  tap('cGo', function () {
    if (P.run && P.run.playing && !P.run.done) { P.run.playing = false; updateGo(); App().Snd.click(); return; }
    App().Snd.click();
    if (P.run && !P.run.done) { P.run.playing = true; P.run.stepMode = false; updateGo(); return; }
    startRun(false);
  });
  tap('cStep', function () {
    App().Snd.click();
    if (P.run && P.run.playing && !P.run.done) return;
    startRun(true);
  });
  tap('cReset', function () { App().Snd.click(); stopRun(); resetView(); hideMsg(); });
  tap('cHint', function () { App().Snd.pick(); showHint(); });
  tap('cSpeed', function () { speed = speed === 1 ? 2.2 : 1; $('cSpeed').textContent = speed === 1 ? '🐢' : '🐇'; App().Snd.click(); });
  tap('cBksp', function () { backspace(); });
  tap('cClear', function () {
    if (!P.prog.length) { App().Snd.nope(); return; }
    P.prog.length = 0;
    P.cur = { parent: null, index: 0 };
    App().Snd.tone(400, 0.25, { type: 'triangle', vol: 0.15, slide: 0.4 });
    edited();
  });
  tap('cBack', function () { App().Snd.click(); App().hush(); openLevels(); });
  tap('clBack', function () { App().Snd.click(); App().setMode('title'); });
  tap('cSound', function () { App().cycleSound(); });
  tap('cWinAgain', function () { App().Snd.click(); $('cWin').classList.remove('on'); stopRun(); resetView(); });
  tap('cWinNext', function () { App().Snd.click(); $('cWin').classList.remove('on'); openPuzzle(Math.min(P.i + 1, Code.PUZZLES.length - 1)); });
  tap('cWinList', function () { App().Snd.click(); $('cWin').classList.remove('on'); openLevels(); });

  RX.CodeMode = {
    openLevels: openLevels, openPuzzle: openPuzzle, frame: frame,
    // test hooks
    get state() { return P; }, add: add, run: function () { startRun(false); }, setSpeed: function (s) { speed = s; }
  };
})();
