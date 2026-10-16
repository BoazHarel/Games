/* Code Roxy: the puzzle rooms and the little block-language interpreter. No drawing here. */
(function () {
  var RX = globalThis.RX || (globalThis.RX = {});
  var C = RX.C;
  var Code = RX.Code = {};

  Code.DIRS = { e: [1, 0], s: [0, 1], w: [-1, 0], n: [0, -1] };
  Code.LEFT = { e: 'n', n: 'w', w: 's', s: 'e' };
  Code.RIGHT = { e: 's', s: 'w', w: 'n', n: 'e' };
  Code.BACK = { e: 'w', w: 'e', n: 's', s: 'n' };
  Code.ANGLE = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };

  Code.BLOCKS = {
    fwd:    { name: 'Forward', say: 'Forward!', color: '#0055BF' },
    left:   { name: 'Left', say: 'Turn left!', color: '#E07A00' },
    right:  { name: 'Right', say: 'Turn right!', color: '#E07A00' },
    repeat: { name: 'Repeat', say: 'Repeat!', color: '#8E4FC9' },
    mop:    { name: 'Mop', say: 'Mop!', color: '#1E9BB0' },
    zoom:   { name: 'Zoom', say: 'Zoom!', color: '#3E8E3A' }
  };

  Code.CHAPTERS = [
    { n: 1, name: 'Go & Turn', icon: '🧭' },
    { n: 2, name: 'Repeat', icon: '🔁' },
    { n: 3, name: 'Mop & Zoom', icon: '💧' },
    { n: 4, name: 'Loops in Loops', icon: '🌀' }
  ];

  // Map legend: . floor  R Roxy (and her dock)  c crumb  p puddle
  // obstacles: P plant  T table  K toy box  O beanbag  B barrel  D dresser  H hay
  // toys (Roxy gets stuck): S sock  Y teddy  A car
  var BASIC = ['fwd', 'left', 'right'], LOOPS = ['fwd', 'left', 'right', 'repeat'];
  Code.PUZZLES = [
    { id: 'c1', ch: 1, name: 'First Steps', dir: 'e', blocks: ['fwd'], intro: 'fwd', floor: 'studs', wall: C.red,
      map: ['......', 'R.c..c', '......'], sol: 'F F F F F',
      hint: 'Roxy goes forward one square for each Forward block.' },
    { id: 'c2', ch: 1, name: 'Turn Right', dir: 'e', blocks: ['fwd', 'right'], intro: 'right', floor: 'wood', wall: C.blue,
      map: ['R..c', '....', '....', '...c'], sol: 'F F F R F F F',
      hint: 'Go to the end, then turn right!' },
    { id: 'c3', ch: 1, name: 'Turn Left', dir: 's', blocks: BASIC, intro: 'left', floor: 'checker', wall: C.yellow,
      map: ['R...', '....', 'c...', '...c'], sol: 'F F F L F F F',
      hint: 'Roxy is looking down. Which way is left for her?' },
    { id: 'c4', ch: 1, name: 'Stairs', dir: 'e', blocks: BASIC, floor: 'lav', wall: C.orange,
      map: ['..c.', '.cc.', 'R...'], sol: 'F L F R F L F',
      hint: 'Step, turn, step, turn... like climbing stairs!' },
    { id: 'c5', ch: 1, name: 'Around the Plant', dir: 'e', blocks: BASIC, floor: 'tile', wall: C.bgreen,
      map: ['..c..', 'R.Pc.', '.....'], sol: 'F L F R F F R F',
      hint: 'Roxy bumps into plants. Go around the top!' },
    { id: 'c6', ch: 1, name: 'Sock Alert', dir: 'e', blocks: BASIC, floor: 'bluec', wall: C.azure,
      map: ['R.S..', '...cc', '.....', '.....'], sol: 'F R F L F F F',
      hint: 'Socks make Roxy stuck. Drive around the sock!' },

    { id: 'c7', ch: 2, name: 'Long Hall', dir: 'e', blocks: LOOPS, intro: 'repeat', max: 2, floor: 'wood', wall: C.white,
      map: ['........', 'R.c.cc.c', '........'], sol: '7{F}',
      hint: 'Only 2 blocks fit! Put Forward inside Repeat and pick a number.' },
    { id: 'c8', ch: 2, name: 'Square Dance', dir: 'e', blocks: LOOPS, floor: 'studs', wall: C.red,
      map: ['R.cc', '.TT.', '.TTc', 'c...'], sol: '4{F F F R}',
      hint: 'Go along one side and turn. Do that 4 times!' },
    { id: 'c9', ch: 2, name: 'Stair Loop', dir: 'e', blocks: LOOPS, max: 6, floor: 'pinkc', wall: C.dpink,
      map: ['....c', '...c.', '..c..', '.c...', 'R....'], sol: '4{F L F R}',
      hint: 'One stair is Forward, Left, Forward, Right. How many stairs?' },
    { id: 'c10', ch: 2, name: 'Star Shape', dir: 'n', blocks: LOOPS, floor: 'lstone', wall: C.purple,
      map: ['P.c.P', '.....', 'c.R.c', '.....', 'P.c.P'], sol: '4{F F R R F F L}',
      hint: 'Go out, turn all the way around, come back, then turn left.' },

    { id: 'c11', ch: 3, name: 'Mop Time', dir: 'e', blocks: ['fwd', 'left', 'right', 'repeat', 'mop'], intro: 'mop', floor: 'bath', wall: C.azure,
      map: ['.....', 'R.p.p', '.....'], sol: '2{F F M}',
      hint: 'Puddles need the Mop block while Roxy sits on them.' },
    { id: 'c12', ch: 3, name: 'Puddle Corners', dir: 'e', blocks: ['fwd', 'left', 'right', 'repeat', 'mop'], floor: 'checker', wall: C.blue,
      map: ['R.p', '.T.', 'pcp'], sol: '4{F F M R}',
      hint: 'Go to a corner, mop, turn. Again and again!' },
    { id: 'c13', ch: 3, name: 'Zoom!', dir: 'e', blocks: ['fwd', 'left', 'right', 'zoom'], intro: 'zoom', floor: 'lwood', wall: C.orange,
      map: ['R.....c', '.......', '.......', '.......', 'c.....c'], sol: 'Z R Z R Z',
      hint: 'Zoom drives until something is in the way.' },
    { id: 'c14', ch: 3, name: 'Code a Zig-Zag', dir: 'e', blocks: ['fwd', 'left', 'right', 'repeat', 'zoom'], floor: 'grassc', wall: C.lime,
      map: ['R..c.c', 'c...c.', '.c..c.', '..c..c', '......'], sol: '2{Z R F R Z L F L}',
      hint: 'Zoom across, turn down, zoom back, turn down. That is how Zig-Zag works!' },

    { id: 'c15', ch: 4, name: 'There and Back', dir: 'e', blocks: LOOPS, home: true, floor: 'studs', wall: C.yellow,
      map: ['......', 'R.c..c', '......'], sol: '2{5{F} R R}',
      hint: 'Put a Repeat inside a Repeat! Go to the end and turn around, two times.' },
    { id: 'c16', ch: 4, name: 'Big Square', dir: 'e', blocks: LOOPS, home: true, floor: 'wood', wall: C.bgreen,
      map: ['R.c.c', '.TTT.', 'cTTTc', '.TTT.', 'c.c..'], sol: '4{4{F} R}',
      hint: 'One side is 4 Forwards. A square has 4 sides!' },
    { id: 'c17', ch: 4, name: 'Grand Finale', dir: 'e', blocks: ['fwd', 'left', 'right', 'repeat', 'mop', 'zoom'], floor: 'stone', wall: C.dred,
      map: ['R.c...p', 'p..c.c.', '.c..c.p', 'p...c..', '.......'], sol: '2{Z M R F R Z M L F L}',
      hint: 'Zig-zag again, but mop at the end of every row!' }
  ];

  // ---------- program helpers ----------
  var uid = 0;
  Code.node = function (op, n) {
    var b = { id: ++uid, op: op };
    if (op === 'repeat') { b.n = n || 3; b.body = []; }
    return b;
  };
  Code.parse = function (src) {
    var toks = src.replace(/\{/g, ' { ').replace(/\}/g, ' } ').trim().split(/\s+/), i = 0;
    var MAP = { F: 'fwd', L: 'left', R: 'right', M: 'mop', Z: 'zoom' };
    function list() {
      var out = [];
      while (i < toks.length && toks[i] !== '}') {
        var t = toks[i++];
        if (/^\d+$/.test(t)) { i++; var r = Code.node('repeat', +t); r.body = list(); i++; out.push(r); }
        else out.push(Code.node(MAP[t]));
      }
      return out;
    }
    return list();
  };
  Code.count = function (prog) {
    var n = 0;
    prog.forEach(function (b) { n += 1 + (b.body ? Code.count(b.body) : 0); });
    return n;
  };

  // ---------- the room ----------
  var OBST = { P: 'plant', T: 'table', K: 'toybox', O: 'beanbag', B: 'barrel', D: 'dresser', H: 'hay' };
  var TOYS = { S: 'sock', Y: 'teddy', A: 'car' };
  Code.OBST_NAMES = { plant: 'the plant', table: 'the table', toybox: 'the toy box', beanbag: 'the beanbag', barrel: 'the barrel', dresser: 'the dresser', hay: 'the hay', wall: 'the wall' };

  Code.build = function (puz) {
    var H = puz.map.length, W = puz.map[0].length;
    var w = { W: W, H: H, puz: puz, grid: [], dirt: [], toys: [], obst: [] };
    var rnd = RX.rng(puz.id.length * 977 + W * 31 + H);
    var dry = (RX.DEFAULT_MESS[puz.floor] || ['crumb']).filter(function (k) { return !RX.WET[k]; });
    if (!dry.length) dry = ['crumb'];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var ch = puz.map[y].charAt(x), cell = '.';
      if (ch === 'R') w.start = { x: x, y: y, dir: puz.dir };
      if (ch === 'c' || ch === 'p') {
        var wet = ch === 'p';
        w.dirt.push({ x: x, y: y, wet: wet, kind: wet ? 'puddle' : dry[(rnd() * dry.length) | 0], rot: rnd() * 6.28, v: rnd(), idx: w.dirt.length });
      }
      if (OBST[ch]) { cell = '#'; w.obst.push({ x: x, y: y, t: OBST[ch] }); }
      if (TOYS[ch]) { cell = 't'; w.toys.push({ x: x, y: y, kind: TOYS[ch], rot: rnd() * 2 - 1 }); }
      w.grid.push(cell);
    }
    // a LEGO room definition the house renderer understands (interior sits at +2,+2)
    var furn = [];
    w.obst.forEach(function (o) {
      // merge 2x2 table blocks into one table
      if (o.t === 'table' && o.merged) return;
      var f = { t: o.t, x: o.x + 2, y: o.y + 2 };
      if (o.t === 'table') {
        var sameAt = function (dx, dy) { return w.obst.find(function (q) { return q.t === 'table' && q.x === o.x + dx && q.y === o.y + dy && !q.merged; }); };
        var ww = 1, hh = 1;
        while (sameAt(ww, 0)) ww++;
        while (sameAt(0, hh)) hh++;
        for (var yy = 0; yy < hh; yy++) for (var xx = 0; xx < ww; xx++) { var q = sameAt(xx, yy); if (q && (xx || yy)) q.merged = true; }
        f.w = ww; f.h = hh;
        if (ww * hh > 1) f.t = 'dtable';
      }
      if (o.t === 'beanbag') f.color = C.orange;
      furn.push(f);
    });
    var back = Code.BACK[w.start.dir];
    w.def = {
      id: 'code-' + puz.id, name: puz.name, w: W + 4, h: H + 4, outside: 'grass', seed: puz.id.length * 13 + W,
      rooms: [{ id: 'room', name: puz.name, icon: '🧹', floor: puz.floor, wall: puz.wall, rects: [[2, 2, W, H]], mess: { n: 0 } }],
      doors: [], windows: W >= 4 ? [[2 + Math.floor(W / 2) - 1, 1, 2, 'h']] : [], frontDoor: null,
      furniture: furn, dock: [w.start.x + 2, w.start.y + 2, back], toys: null, pet: null
    };
    return w;
  };

  // ---------- running a program ----------
  // Returns every little thing Roxy does, plus how it ended.
  Code.run = function (w, prog, maxSteps) {
    maxSteps = maxSteps || 400;
    var st = { x: w.start.x, y: w.start.y, dir: w.start.dir };
    var left = {}, nLeft = 0;
    w.dirt.forEach(function (d) { left[d.idx] = true; nLeft++; });
    var steps = [], result = null, failAt = null;

    function at(x, y) {
      if (x < 0 || y < 0 || x >= w.W || y >= w.H) return 'wall';
      var g = w.grid[y * w.W + x];
      if (g === '#') return w.obst.find(function (o) { return o.x === x && o.y === y; }).t;
      if (g === 't') return 'toy';
      return null;
    }
    function cleanHere(wet) {
      var got = [];
      w.dirt.forEach(function (d) {
        if (left[d.idx] && d.x === st.x && d.y === st.y && d.wet === wet) { left[d.idx] = false; nLeft--; got.push(d.idx); }
      });
      return got;
    }
    function forward(b) {
      var d = Code.DIRS[st.dir], nx = st.x + d[0], ny = st.y + d[1], what = at(nx, ny);
      if (what === 'toy') {
        var toy = w.toys.find(function (t) { return t.x === nx && t.y === ny; });
        steps.push({ op: 'stuck', id: b.id, x: st.x, y: st.y, dir: st.dir, toy: toy });
        result = 'stuck'; failAt = b.id; return false;
      }
      if (what) {
        steps.push({ op: 'bump', id: b.id, x: st.x, y: st.y, dir: st.dir, what: what });
        result = 'bump'; failAt = b.id; return false;
      }
      var from = { x: st.x, y: st.y };
      st.x = nx; st.y = ny;
      steps.push({ op: 'move', id: b.id, from: from, x: st.x, y: st.y, dir: st.dir, cleaned: cleanHere(false) });
      return true;
    }
    function exec(list) {
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (steps.length >= maxSteps) { result = 'long'; failAt = b.id; return false; }
        switch (b.op) {
          case 'fwd': if (!forward(b)) return false; break;
          case 'left': st.dir = Code.LEFT[st.dir]; steps.push({ op: 'turn', id: b.id, x: st.x, y: st.y, dir: st.dir, turn: -1 }); break;
          case 'right': st.dir = Code.RIGHT[st.dir]; steps.push({ op: 'turn', id: b.id, x: st.x, y: st.y, dir: st.dir, turn: 1 }); break;
          case 'mop':
            var got = cleanHere(true);
            steps.push({ op: got.length ? 'mop' : 'mopnone', id: b.id, x: st.x, y: st.y, dir: st.dir, cleaned: got });
            break;
          case 'zoom':
            var moved = 0;
            for (;;) {
              var d = Code.DIRS[st.dir];
              if (at(st.x + d[0], st.y + d[1])) break;
              if (!forward(b)) return false;
              moved++;
              if (steps.length >= maxSteps) { result = 'long'; failAt = b.id; return false; }
            }
            if (!moved) steps.push({ op: 'zoomstop', id: b.id, x: st.x, y: st.y, dir: st.dir });
            break;
          case 'repeat':
            for (var k = 0; k < b.n; k++) {
              steps.push({ op: 'loop', id: b.id, x: st.x, y: st.y, dir: st.dir, lap: k + 1 });
              if (!exec(b.body)) return false;
            }
            break;
        }
      }
      return true;
    }
    exec(prog);
    if (!result) {
      if (nLeft > 0) result = 'dirt';
      else if (w.puz.home && (st.x !== w.start.x || st.y !== w.start.y)) result = 'home';
      else result = 'win';
    }
    return { steps: steps, result: result, failAt: failAt, end: st, left: nLeft };
  };

  Code.stars = function (puz, blocks) {
    var par = Code.count(Code.parse(puz.sol));
    return blocks <= par ? 3 : blocks <= par + 2 ? 2 : 1;
  };
  Code.par = function (puz) { return Code.count(Code.parse(puz.sol)); };
})();
