/* Roxy's Big Clean: simulation. Pure logic, no drawing, so it can run headless for par times. */
(function () {
  var RX = globalThis.RX || (globalThis.RX = {});

  RX.rng = function (seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  RX.WET = { puddle: 1, juice: 1, mud: 1, goo: 1, paint: 1 };
  RX.STRATS = {
    zigzag: { speed: 1.0 },
    snail: { speed: 1.0 },
    bouncy: { speed: 1.4 },
    sniffy: { speed: 0.55 }
  };
  var SPEED = 2.2;      // tiles per second
  var TURN = 7.5;       // radians per second
  var RAD = 0.42;       // Roxy body radius (tiles)
  var SUCK = 0.6;       // pickup radius
  var MOP_TIME = 0.5;   // seconds a puddle needs under the mop
  var TOY_HIT = 0.5;
  var TURBO_TIME = 5, TURBO_CD = 12;
  RX.SIM = { RAD: RAD, SUCK: SUCK, TURBO_TIME: TURBO_TIME, TURBO_CD: TURBO_CD };

  var D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

  // Dijkstra over passable cells, 8-way without cutting corners.
  // goal(cell) -> true when reached. Returns cells after `start` up to the goal, or null.
  RX.findPath = function (L, start, goal, maxCost) {
    var W = L.W, N = W * L.H, P = L.passable;
    var dist = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    var heap = [start]; dist[start] = 0;
    var less = function (a, b) { return dist[a] < dist[b]; };
    function push(v) {
      heap.push(v); var i = heap.length - 1;
      while (i > 0) { var p = (i - 1) >> 1; if (less(heap[i], heap[p])) { var t = heap[i]; heap[i] = heap[p]; heap[p] = t; i = p; } else break; }
    }
    function pop() {
      var top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; var i = 0;
        for (;;) {
          var l = i * 2 + 1, r = l + 1, m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === i) break;
          var t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m;
        }
      }
      return top;
    }
    while (heap.length) {
      var c = pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c !== start && goal(c)) {
        var path = [];
        for (var v = c; v !== start; v = prev[v]) path.push(v);
        return path.reverse();
      }
      if (maxCost && dist[c] > maxCost) break;
      var cx = c % W, cy = (c / W) | 0;
      for (var k = 0; k < 8; k++) {
        var nx = cx + D8[k][0], ny = cy + D8[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= L.H) continue;
        var n = ny * W + nx;
        if (!P[n] || done[n]) continue;
        if (k >= 4 && (!P[cy * W + nx] || !P[ny * W + cx])) continue;
        var nd = dist[c] + D8[k][2];
        if (nd < dist[n]) { dist[n] = nd; prev[n] = c; push(n); }
      }
    }
    return null;
  };

  RX.pathCost = function (L, start, target) {
    if (start === target) return 0;
    var p = RX.findPath(L, start, function (c) { return c === target; });
    return p ? p.length : 1e9;
  };

  function center(L, c) { return { x: (c % L.W) + 0.5, y: ((c / L.W) | 0) + 0.5 }; }

  // ---------- create ----------
  RX.createSim = function (L, opts) {
    opts = opts || {};
    var def = L.def;
    var S = {
      L: L, rng: RX.rng(def.seed * 7919 + 1), brainRng: RX.rng(opts.seed || ((Math.random() * 1e9) | 0)),
      dirt: [], cellDirt: [], dirtLeft: 0, dirtTotal: 0, roomLeft: [], roomTotal: [],
      toys: [], strategy: null, started: false, time: 0, cleanTime: null, phase: 'idle',
      focus: -1, requested: -1, queue: [], target: null, st: {}, visited: new Uint8Array(L.W * L.H),
      turbo: 0, turboCd: 0, stuck: null, spin: 0, mopping: false, events: [], moved: 0,
      roxy: { x: L.dock.x + 0.5, y: L.dock.y + 0.5, a: { n: Math.PI / 2, s: -Math.PI / 2, e: Math.PI, w: 0 }[L.dock.dir] || 0 }
    };
    for (var i = 0; i < L.W * L.H; i++) S.cellDirt.push([]);
    genMess(S);
    if (!opts.noToys) genToys(S);
    return S;
  };

  function genMess(S) {
    var L = S.L, rnd = S.rng, W = L.W;
    L.rooms.forEach(function (room) {
      S.roomLeft[room.k] = 0;
      var m = room.mess || {};
      var n = m.n || 6, kinds = m.k || RX.DEFAULT_MESS[room.floor] || ['crumb'];
      var cells = room.cells.filter(function (c) { return c !== L.dock.cell; });
      var placed = 0, guard = 0;
      while (placed < n && guard++ < 500) {
        var c0 = cells[(rnd() * cells.length) | 0];
        var kind = kinds[(rnd() * kinds.length) | 0];
        var wet = !!RX.WET[kind];
        var size = wet ? 1 : 1 + ((rnd() * 3) | 0);
        for (var s = 0; s < size && placed < n; s++) {
          var c = c0;
          if (s > 0) {
            var nx = (c0 % W) + ((rnd() * 3) | 0) - 1, ny = ((c0 / W) | 0) + ((rnd() * 3) | 0) - 1;
            var cand = ny * W + nx;
            if (L.passable[cand] && L.room[cand] === room.k && cand !== L.dock.cell) c = cand;
          }
          // keep wet spills one per cell so they don't stack into blobs
          if (wet && S.cellDirt[c].some(function (d) { return d.wet; })) continue;
          var off = wet ? 0.22 : 0.32;
          var d = {
            x: (c % W) + 0.5 + (rnd() * 2 - 1) * off, y: ((c / W) | 0) + 0.5 + (rnd() * 2 - 1) * off,
            kind: kind, wet: wet, hp: 1, cell: c, room: room.k, alive: true,
            rot: rnd() * Math.PI * 2, v: rnd(), id: S.dirt.length
          };
          S.dirt.push(d); S.cellDirt[c].push(d);
          S.roomLeft[room.k]++; placed++;
        }
      }
      S.roomTotal[room.k] = S.roomLeft[room.k];
    });
    S.dirtLeft = S.dirtTotal = S.dirt.length;
  }

  function genToys(S) {
    var L = S.L, rnd = S.rng, W = L.W, t = L.def.toys;
    if (!t || !t.n) return;
    var near = function (c, o) { return Math.abs(c % W - o % W) <= 1 && Math.abs(((c / W) | 0) - ((o / W) | 0)) <= 1; };
    var cands = [];
    for (var c = 0; c < W * L.H; c++) {
      if (!L.passable[c] || L.door[c] || near(c, L.dock.cell)) continue;
      cands.push(c);
    }
    var usedRooms = {};
    for (var n = 0, guard = 0; n < t.n && guard < 300; guard++) {
      var c2 = cands[(rnd() * cands.length) | 0];
      var r = L.room[c2];
      if (usedRooms[r] && guard < 200) continue;
      if (S.toys.some(function (o) { return near(o.cell, c2); })) continue;
      // don't plug narrow spots (a cell with walls on opposite sides)
      var x = c2 % W, y = (c2 / W) | 0;
      var P = L.passable;
      if ((!P[c2 - 1] && !P[c2 + 1]) || (!P[c2 - W] && !P[c2 + W])) continue;
      usedRooms[r] = 1;
      S.toys.push({ x: x + 0.5 + (rnd() - 0.5) * 0.2, y: y + 0.5 + (rnd() - 0.5) * 0.2, cell: c2, room: r, kind: t.k[n % t.k.length], alive: true, rot: rnd() * 6.28, id: n });
      n++;
    }
  }

  // ---------- commands from the player ----------
  RX.setStrategy = function (S, name) {
    if (S.phase === 'home' || S.phase === 'done') return;
    S.strategy = name;
    S.st = {};
    S.queue = [];
    S.target = null;
    if (!S.started) { S.started = true; S.phase = 'clean'; S.events.push({ t: 'start' }); }
  };

  RX.requestRoom = function (S, k) {
    if (S.phase === 'home' || S.phase === 'done') return false;
    if (S.roomLeft[k] === 0) return false;
    S.requested = k;
    if (S.focus !== k) { S.queue = []; S.target = null; }
    if (!S.started) RX.setStrategy(S, 'zigzag');
    return true;
  };

  RX.removeToy = function (S, toy) {
    if (!toy.alive) return;
    toy.alive = false;
    if (S.stuck === toy) { S.stuck = null; S.events.push({ t: 'unstuck', toy: toy }); }
  };

  RX.turbo = function (S) {
    if (S.turboCd > 0 || S.turbo > 0 || !S.started || S.phase === 'done') return false;
    S.turbo = TURBO_TIME;
    return true;
  };

  RX.spin = function (S) {
    if (S.stuck || S.spin > 0 || S.phase === 'done') return false;
    S.spin = 0.9;
    return true;
  };

  // ---------- step ----------
  RX.step = function (S, dt) {
    if (S.phase === 'done') return;
    if (S.started && S.cleanTime === null) S.time += dt;
    if (S.turbo > 0) { S.turbo -= dt; if (S.turbo <= 0) { S.turbo = 0; S.turboCd = TURBO_CD; } }
    else if (S.turboCd > 0) S.turboCd = Math.max(0, S.turboCd - dt);

    if (S.started) clean(S, dt);
    if (S.stuck) { if (!S.stuck.alive) S.stuck = null; else return; }
    if (S.spin > 0) {
      S.spin -= dt;
      S.roxy.a += dt * Math.PI * 2 / 0.9;
      return;
    }
    move(S, dt);
    checkToys(S);
  };

  function clean(S, dt) {
    var L = S.L, r = S.roxy, W = L.W;
    var cx = Math.floor(r.x), cy = Math.floor(r.y);
    S.mopping = false;
    for (var y = cy - 1; y <= cy + 1; y++) for (var x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= L.H) continue;
      var list = S.cellDirt[y * W + x];
      for (var i = list.length - 1; i >= 0; i--) {
        var d = list[i];
        var dx = d.x - r.x, dy = d.y - r.y;
        if (dx * dx + dy * dy > SUCK * SUCK) continue;
        if (d.wet) {
          S.mopping = true;
          d.hp -= dt / MOP_TIME;
          if (d.hp > 0) continue;
        }
        list.splice(i, 1);
        d.alive = false;
        S.dirtLeft--; S.roomLeft[d.room]--;
        S.lastPick = S.time;
        S.events.push({ t: d.wet ? 'mop' : 'suck', d: d });
        if (S.roomLeft[d.room] === 0) {
          S.events.push({ t: 'roomClean', room: d.room });
          if (S.requested === d.room) S.requested = -1;
        }
        if (S.dirtLeft === 0) {
          S.cleanTime = S.time;
          S.phase = 'home';
          S.queue = [];
          S.events.push({ t: 'allClean' });
        }
      }
    }
  }

  function checkToys(S) {
    var r = S.roxy;
    for (var i = 0; i < S.toys.length; i++) {
      var t = S.toys[i];
      if (!t.alive) continue;
      var dx = t.x - r.x, dy = t.y - r.y;
      if (dx * dx + dy * dy < TOY_HIT * TOY_HIT) {
        S.stuck = t;
        S.events.push({ t: 'stuck', toy: t });
        return;
      }
    }
  }

  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  function move(S, dt) {
    var r = S.roxy, budget = dt;
    for (var iter = 0; iter < 6 && budget > 1e-6; iter++) {
      if (!S.target) {
        S.target = S.queue.length ? S.queue.shift() : brain(S);
        if (!S.target) return;
      }
      var mult = S.strategy ? RX.STRATS[S.strategy].speed : 1;
      if (S.phase === 'home') mult = 1.1;
      var speed = SPEED * mult * (S.turbo > 0 ? 1.8 : 1) * (S.mopping ? 0.45 : 1);
      var dx = S.target.x - r.x, dy = S.target.y - r.y, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1e-4) { arrive(S); continue; }
      var diff = wrap(Math.atan2(dy, dx) - r.a);
      var turn = TURN * (S.turbo > 0 ? 1.5 : 1);
      if (Math.abs(diff) > 0.5) {
        // spin in place first, like the real robot
        var need = Math.abs(diff) / turn;
        if (need <= budget) { r.a += diff; budget -= need; }
        else { r.a += Math.sign(diff) * turn * budget; budget = 0; }
        continue;
      }
      r.a += Math.max(-turn * budget, Math.min(turn * budget, diff));
      var stepLen = speed * budget;
      if (stepLen >= dist) {
        r.x = S.target.x; r.y = S.target.y;
        budget -= dist / speed;
        S.moved += dist;
        markVisited(S);
        arrive(S);
      } else {
        r.x += dx / dist * stepLen; r.y += dy / dist * stepLen;
        S.moved += stepLen;
        budget = 0;
        markVisited(S);
      }
      // a puddle can show up mid-step; let the next frame re-evaluate speed
      if (S.mopping) break;
    }
  }

  function markVisited(S) {
    var r = S.roxy, cx = Math.floor(r.x), cy = Math.floor(r.y);
    var dx = r.x - cx - 0.5, dy = r.y - cy - 0.5;
    if (dx * dx + dy * dy < 0.35 * 0.35) S.visited[cy * S.L.W + cx] = 1;
  }

  function arrive(S) {
    var t = S.target;
    S.target = null;
    if (t && t.dock && S.phase === 'home') {
      S.phase = 'done';
      S.events.push({ t: 'docked' });
    }
  }

  function curCell(S) { return Math.floor(S.roxy.y) * S.L.W + Math.floor(S.roxy.x); }

  function atCenter(S) {
    var r = S.roxy;
    var dx = r.x - Math.floor(r.x) - 0.5, dy = r.y - Math.floor(r.y) - 0.5;
    return dx * dx + dy * dy < 0.0025;
  }

  function pathPoints(S, cells) {
    return cells.map(function (c) { return center(S.L, c); });
  }

  function goPath(S, goal) {
    var p = RX.findPath(S.L, curCell(S), goal);
    if (!p || !p.length) return null;
    S.queue = pathPoints(S, p);
    return S.queue.shift();
  }

  function nearestDirtyRoom(S) {
    var L = S.L, cur = curCell(S);
    var p = RX.findPath(L, cur, function (c) { return S.roomLeft[L.room[c]] > 0; });
    if (p) return L.room[p[p.length - 1]];
    if (S.roomLeft[L.room[cur]] > 0) return L.room[cur];
    for (var k = 0; k < S.roomLeft.length; k++) if (S.roomLeft[k] > 0) return k;
    return -1;
  }

  function setFocus(S, k) {
    if (S.focus !== k) S.events.push({ t: 'focus', room: k });
    S.focus = k;
    S.st = {};
    S.queue = [];
  }

  function brain(S) {
    if (!S.started) return null;
    var L = S.L;
    if (S.phase === 'home' || S.dirtLeft === 0) {
      S.phase = 'home';
      if (!atCenter(S)) return center(L, curCell(S));
      if (curCell(S) === L.dock.cell) { S.phase = 'done'; S.events.push({ t: 'docked' }); return null; }
      var p = RX.findPath(L, curCell(S), function (c) { return c === L.dock.cell; });
      if (!p) { S.phase = 'done'; S.events.push({ t: 'docked' }); return null; }
      S.queue = pathPoints(S, p);
      S.queue[S.queue.length - 1].dock = true;
      return S.queue.shift();
    }
    if (S.requested >= 0 && S.roomLeft[S.requested] === 0) S.requested = -1;
    if (S.requested >= 0 && S.focus !== S.requested) setFocus(S, S.requested);
    if (S.focus < 0 || S.roomLeft[S.focus] === 0) setFocus(S, nearestDirtyRoom(S));
    if (S.focus < 0) return null;

    var bouncing = S.strategy === 'bouncy';
    if (!atCenter(S) && !(bouncing && L.room[curCell(S)] === S.focus && S.st.init)) return center(L, curCell(S));

    if (L.room[curCell(S)] !== S.focus) {
      var f = S.focus;
      return goPath(S, function (c) { return L.room[c] === f; });
    }
    var t = STRAT[S.strategy](S);
    if (t) return t;
    return toNearestDirt(S);
  }

  function toNearestDirt(S) {
    var L = S.L, f = S.focus;
    return goPath(S, function (c) {
      if (L.room[c] !== f) return false;
      var list = S.cellDirt[c];
      for (var i = 0; i < list.length; i++) if (list[i].alive) return true;
      return false;
    });
  }

  // can Roxy sweep into cell c for the current room pattern?
  function fresh(S, c) {
    var L = S.L;
    return c >= 0 && c < L.W * L.H && L.passable[c] && L.room[c] === S.focus && !S.visited[c];
  }
  function cellXY(L, c) { return [c % L.W, (c / L.W) | 0]; }

  // pick the corner of the focus room nearest Roxy. Returns {cell, sx, sy}
  function nearestCorner(S) {
    var L = S.L, room = L.rooms[S.focus], cur = curCell(S), best = null;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s) {
      var bc = -1, bv = -1e9;
      room.cells.forEach(function (c) {
        if (S.visited[c]) return;
        var xy = cellXY(L, c), v = s[0] * xy[0] + s[1] * xy[1];
        if (v > bv) { bv = v; bc = c; }
      });
      if (bc < 0) return;
      var a = cellXY(L, cur), b = cellXY(L, bc);
      var d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      if (!best || d < best.d) best = { cell: bc, sx: s[0], sy: s[1], d: d };
    });
    return best;
  }

  function roomBox(S) {
    var L = S.L, cells = L.rooms[S.focus].cells, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    cells.forEach(function (c) { var xy = cellXY(L, c); x0 = Math.min(x0, xy[0]); x1 = Math.max(x1, xy[0]); y0 = Math.min(y0, xy[1]); y1 = Math.max(y1, xy[1]); });
    return { w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function toNearestFresh(S) {
    var L = S.L;
    var p = RX.findPath(L, curCell(S), function (c) { return fresh(S, c); });
    if (!p) return null;
    S.queue = pathPoints(S, p);
    return { first: S.queue.shift(), cell: p[p.length - 1] };
  }

  var STRAT = {};

  // Lawn-mower rows along the room's long side
  STRAT.zigzag = function (S) {
    var L = S.L, W = L.W, st = S.st, cur = curCell(S);
    if (!st.init) {
      st.init = true;
      var box = roomBox(S), horiz = box.w >= box.h;
      var cn = nearestCorner(S);
      if (!cn) return null;
      st.p = horiz ? [-cn.sx, 0] : [0, -cn.sy];
      st.s = horiz ? [0, -cn.sy] : [-cn.sx, 0];
      if (cn.cell !== cur) {
        var p = RX.findPath(L, cur, function (c) { return c === cn.cell; });
        if (p) { S.queue = pathPoints(S, p); return S.queue.shift(); }
      }
    }
    var xy = cellXY(L, cur);
    var a = (xy[1] + st.p[1]) * W + xy[0] + st.p[0];
    if (xy[0] + st.p[0] >= 0 && xy[0] + st.p[0] < W && fresh(S, a)) return center(L, a);
    var b = (xy[1] + st.s[1]) * W + xy[0] + st.s[0];
    if (xy[0] + st.s[0] >= 0 && xy[0] + st.s[0] < W && fresh(S, b)) { st.p = [-st.p[0], -st.p[1]]; return center(L, b); }
    var far = toNearestFresh(S);
    if (!far) return null;
    // face the side with more sweeping left to do
    var t = cellXY(L, far.cell), ahead = 0, behind = 0, fwd = 0, back = 0;
    L.rooms[S.focus].cells.forEach(function (c) {
      if (S.visited[c]) return;
      var q = cellXY(L, c);
      var ds = (q[0] - t[0]) * st.s[0] + (q[1] - t[1]) * st.s[1];
      var dp = (q[0] - t[0]) * st.p[0] + (q[1] - t[1]) * st.p[1];
      if (ds > 0) ahead++; else if (ds < 0) behind++;
      if (ds === 0) { if (dp > 0) fwd++; else if (dp < 0) back++; }
    });
    if (behind > ahead) st.s = [-st.s[0], -st.s[1]];
    if (back > fwd) st.p = [-st.p[0], -st.p[1]];
    return far.first;
  };

  // Snail shell: go round the edge, turn right when blocked, spiral inward
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  STRAT.snail = function (S) {
    var L = S.L, W = L.W, st = S.st, cur = curCell(S);
    if (!st.init) {
      st.init = true;
      var cn = nearestCorner(S);
      if (!cn) return null;
      var key = cn.sx + ',' + cn.sy;
      st.h = { '-1,-1': 0, '1,-1': 1, '1,1': 2, '-1,1': 3 }[key];
      if (cn.cell !== cur) {
        var p = RX.findPath(L, cur, function (c) { return c === cn.cell; });
        if (p) { S.queue = pathPoints(S, p); return S.queue.shift(); }
      }
    }
    var xy = cellXY(L, cur);
    var tries = [st.h, (st.h + 1) % 4, (st.h + 3) % 4];
    for (var i = 0; i < tries.length; i++) {
      var d = DIRS[tries[i]], nx = xy[0] + d[0];
      if (nx < 0 || nx >= W) continue;
      var n = (xy[1] + d[1]) * W + nx;
      if (fresh(S, n)) { st.h = tries[i]; return center(L, n); }
    }
    var far = toNearestFresh(S);
    return far ? far.first : null;
  };

  // Bouncy: drive straight until something is in the way, then spin to a new direction
  STRAT.bouncy = function (S) {
    var L = S.L, r = S.roxy, st = S.st, rnd = S.brainRng;
    st.init = true;
    // real bouncers eventually wander into the last crumbs; nudge her there if she's been unlucky
    if (S.time - (S.lastPick || 0) > 7 && S.time - (st.nudged || 0) > 7) {
      st.nudged = S.time;
      var go = toNearestDirt(S);
      if (go) return go;
    }
    var dirtList = S.dirt.filter(function (d) { return d.alive && d.room === S.focus; });
    var best = null;
    for (var k = 0; k < 16; k++) {
      var a = k * Math.PI / 8 + (rnd() - 0.5) * 0.35;
      var len = rayLen(S, r.x, r.y, a, 7);
      if (len < 0.45) continue;
      var ex = r.x + Math.cos(a) * len, ey = r.y + Math.sin(a) * len;
      var hits = 0;
      dirtList.forEach(function (d) { if (segDist(d.x, d.y, r.x, r.y, ex, ey) < 0.55) hits++; });
      var back = Math.abs(wrap(a - r.a - Math.PI)) < 0.5 ? 0.6 : 0;
      var score = Math.min(len, 5) * 0.25 + rnd() * 1.6 + Math.min(hits, 4) * 0.8 - back;
      if (!best || score > best.score) best = { score: score, x: ex, y: ey };
    }
    if (!best) return atCenter(S) ? null : center(L, curCell(S));
    return { x: best.x, y: best.y };
  };

  // Sniffy: smell the nearest crumb and go straight for it (but sniffing is slow)
  STRAT.sniffy = function (S) {
    return toNearestDirt(S);
  };

  function segDist(px, py, ax, ay, bx, by) {
    var vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    var L2 = vx * vx + vy * vy, t = L2 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
    var dx = ax + vx * t - px, dy = ay + vy * t - py;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function clear(S, px, py) {
    var L = S.L, W = L.W;
    var x0 = Math.floor(px - RAD), x1 = Math.floor(px + RAD), y0 = Math.floor(py - RAD), y1 = Math.floor(py + RAD);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= L.H) return false;
      var c = y * W + x;
      if (L.passable[c] && L.room[c] === S.focus) continue;
      var nx = Math.max(x, Math.min(px, x + 1)), ny = Math.max(y, Math.min(py, y + 1));
      if ((nx - px) * (nx - px) + (ny - py) * (ny - py) < RAD * RAD) return false;
    }
    return true;
  }

  function rayLen(S, x, y, a, max) {
    var cx = Math.cos(a), sy = Math.sin(a), last = 0;
    for (var t = 0.06; t <= max; t += 0.06) {
      if (!clear(S, x + cx * t, y + sy * t)) break;
      last = t;
    }
    return last;
  }

  // ---------- par times: how fast Roxy cleans on her own with each pattern ----------
  RX.simulate = function (L, strategy, opts) {
    opts = opts || {};
    var S = RX.createSim(L, { noToys: true, seed: 12345 });
    RX.setStrategy(S, strategy);
    var dt = 1 / 30;
    for (var i = 0; i < 30 * 1200 && S.cleanTime === null; i++) {
      RX.step(S, dt);
      S.events.length = 0;
    }
    return { time: S.cleanTime === null ? Infinity : S.cleanTime, left: S.dirtLeft, sim: S };
  };

  RX.computePar = function (L) {
    var best = Infinity, times = {};
    ['zigzag', 'snail', 'sniffy'].forEach(function (s) {
      var t = RX.simulate(L, s).time;
      times[s] = t;
      best = Math.min(best, t);
    });
    return { best: best, times: times, three: Math.ceil(best * 1.15), two: Math.ceil(best * 1.6) };
  };
})();
