/* Rug siege path, cell kind, and damage helpers. */
(function () {
  var RP = globalThis.RugParts || (globalThis.RugParts = {});

  RP.dist = function (ax, ay, bx, by) {
    var dx = ax - bx;
    var dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  };

  RP.cellKind = function (c, r) {
    if (c < 0 || c > 15 || r < 0 || r > 9) return 'out';
    if (r === 0 && (c <= 2 || (c >= 6 && c <= 8))) return 'blocked';
    if (r === 1 && c <= 1) return 'blocked';
    if ((r === 8 || r === 9) && c >= 13) return 'blocked';
    if (r === 2 && c >= 2 && c <= 14) return 'path';
    if (r === 3 && (c === 2 || c === 14)) return 'path';
    if (r === 4 && ((c >= 2 && c <= 9) || c === 14)) return 'path';
    if ((r === 5 || r === 6) && (c === 9 || c === 14)) return 'path';
    if (r === 7 && c <= 9) return 'path';
    return 'wood';
  };

  RP.posAlong = function (progress) {
    if (progress < 0) progress = 0;
    if (progress > 37) progress = 37;
    var segs = [
      { x: 0.5, y: 7.5, dx: 1, dy: 0, len: 9, f: 'e' },
      { x: 9.5, y: 7.5, dx: 0, dy: -1, len: 3, f: 'n' },
      { x: 9.5, y: 4.5, dx: -1, dy: 0, len: 7, f: 'w' },
      { x: 2.5, y: 4.5, dx: 0, dy: -1, len: 2, f: 'n' },
      { x: 2.5, y: 2.5, dx: 1, dy: 0, len: 12, f: 'e' },
      { x: 14.5, y: 2.5, dx: 0, dy: 1, len: 4, f: 's' }
    ];
    var p = progress;
    var i;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (p < s.len || i === segs.length - 1) {
        if (p > s.len) p = s.len;
        return { x: s.x + s.dx * p, y: s.y + s.dy * p, facing: s.f };
      }
      p -= s.len;
    }
  };

  RP.pathCells = [
    [0, 7], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7],
    [9, 6], [9, 5], [9, 4],
    [8, 4], [7, 4], [6, 4], [5, 4], [4, 4], [3, 4], [2, 4],
    [2, 3], [2, 2],
    [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],
    [14, 3], [14, 4], [14, 5], [14, 6]
  ];

  RP.damageAt = function (dist, R, center, isBlock) {
    if (dist > R) return 0;
    var d = center * (1 - 0.5 * dist / R);
    if (isBlock) d *= 0.5;
    return d;
  };
})();

(function () {
  var P = globalThis.RugParts || (globalThis.RugParts = {});
  var BASE = {
    soldier: { hp: 30, speed: 1.35, gold: 3 },
    car: { hp: 20, speed: 2.5, gold: 4 },
    teddy: { hp: 100, speed: 0.8, gold: 8 },
    block: { hp: 150, speed: 0.7, gold: 10 },
    balloon: { hp: 40, speed: 1.5, gold: 6 },
    tin: { hp: 70, speed: 1.1, gold: 8 }
  };
  var COST = { marble: 50, pillow: 90, fan: 70, band: 120 };
  var UP = { marble: 80, pillow: 140, fan: 100, band: 170 };
  var DOCK = {
    marble: "hits the first in line",
    pillow: "hits a patch",
    fan: "slows",
    band: "hits what got past the others"
  };

  P.scaleHp = function (base, wave) {
    return Math.round(base * (1 + 0.07 * (wave - 1)));
  };
  P.scaleGold = function (base, wave) {
    return Math.round(base * (1 + 0.04 * (wave - 1)));
  };
  P.baseOf = function (type) {
    var b = BASE[type];
    return { hp: b.hp, speed: b.speed, gold: b.gold };
  };
  P.cost = function (type) { return COST[type]; };
  P.upCost = function (type) { return UP[type]; };
  P.dockLine = function (type) { return DOCK[type] || ""; };

  P.rangeOf = function (tower) {
    if (tower.type === "marble") return 2.4;
    if (tower.type === "pillow") return 2.2;
    if (tower.type === "fan") return tower.upgraded ? 2.5 : 2.0;
    if (tower.type === "band") return 5.2;
    if (tower.type === "bowl") return 2.0;
    if (tower.type === "blanket") return 1.4;
    if (tower.type === "catch") return 2.8;
  };

  function shot(dmg, cd, splash, center) {
    return { dmg: dmg, cd: cd, splash: splash, center: center };
  }

  P.shotOf = function (tower) {
    var u = tower.upgraded;
    if (tower.type === "marble") return u ? shot(26, 0.7, 0, 0) : shot(14, 0.9, 0, 0);
    if (tower.type === "pillow") return u ? shot(0, 1.7, 1.6, 32) : shot(0, 1.7, 1.15, 20);
    if (tower.type === "band") return u ? shot(55, 1.5, 0, 0) : shot(30, 2.0, 0, 0);
    if (tower.type === "bowl") return shot(18, 2.2, 0, 0);
    if (tower.type === "catch") return shot(0, 2.0, 0, 0);
    return null;
  };

  function grp(type, n, gap) {
    var a = [];
    for (var i = 0; i < n; i++) a.push([type, gap]);
    return a;
  }
  function cat(parts) {
    var a = [];
    for (var i = 0; i < parts.length; i++) {
      for (var j = 0; j < parts[i].length; j++) a.push(parts[i][j]);
    }
    return a;
  }
  function alt(a, b, n, gap) {
    var o = [];
    for (var i = 0; i < n; i++) {
      o.push([a, gap]);
      o.push([b, gap]);
    }
    return o;
  }

  var W = [
    [grp("soldier", 8, 1.2), 0],
    [cat([grp("soldier", 6, 1.0), grp("car", 4, 0.8)]), 6],
    [grp("soldier", 12, 0.7), 0],
    [grp("teddy", 4, 1.5), 0],
    [alt("soldier", "car", 6, 0.55), 1],
    [grp("car", 10, 0.4), 0],
    [cat([grp("teddy", 3, 1.4), grp("soldier", 8, 0.8)]), 0],
    [grp("block", 5, 1.3), 0],
    [[
      ["soldier", 0.7], ["soldier", 0.7], ["soldier", 0.7], ["block", 0.7],
      ["soldier", 0.7], ["soldier", 0.7], ["soldier", 0.7], ["block", 0.7],
      ["soldier", 0.7], ["soldier", 0.7]
    ], 3],
    [grp("balloon", 6, 1.0), 0],
    [cat([grp("teddy", 4, 1.2), grp("car", 8, 0.45)]), 4],
    [grp("car", 14, 0.32), 0],
    [grp("block", 8, 0.85), 0],
    [cat([grp("balloon", 6, 0.9), grp("car", 6, 0.45)]), 0],
    [alt("teddy", "block", 4, 1.1), 1],
    [cat([grp("soldier", 14, 0.35), grp("balloon", 4, 0.8)]), 14],
    [grp("block", 10, 0.6), 0],
    [cat([grp("teddy", 5, 1.0), grp("car", 10, 0.35)]), 5],
    [alt("balloon", "block", 6, 0.7), 0],
    [cat([
      grp("teddy", 4, 0.9), grp("block", 6, 0.9),
      grp("balloon", 8, 0.6), grp("car", 12, 0.3)
    ]), 18],
    [grp("tin", 6, 1.0), 0],
    [cat([grp("tin", 4, 0.9), grp("balloon", 8, 0.7)]), 4],
    [alt("block", "tin", 6, 0.85), 1],
    [cat([
      grp("tin", 4, 0.9), grp("block", 6, 0.9),
      grp("balloon", 8, 0.6), grp("car", 10, 0.3)
    ]), 18]
  ];
  var CHIP = { 3: 1, 12: 1, 17: 1 };

  P.queue = function (wave) {
    var units = W[wave - 1][0];
    var out = [];
    for (var i = 0; i < units.length; i++) {
      out.push({ type: units[i][0], wait: i === 0 ? 0 : units[i][1] });
    }
    return out;
  };

  P.previewWave = function (wave) {
    var mark = W[wave - 1][1];
    var chip = !!CHIP[wave];
    return P.queue(wave).map(function (u, i) {
      var marked = i === mark;
      return { type: u.type, marked: marked, gapChip: marked && chip };
    });
  };
})();

/* Rug Siege actions: place, sell, upgrade, wave control. No simulation step. */
(function () {
  var P = globalThis.RugParts;

  function frozen(state) {
    var phase = state.phase;
    return phase === 'won' || phase === 'lost' || phase === 'stopped';
  }

  function fresh() {
    return {
      gold: 110,
      lives: 20,
      speed: 1,
      phase: 'idle',
      outcome: null,
      cleared: 0,
      scuffs: 0,
      towers: [],
      enemies: [],
      projectiles: [],
      events: [],
      nextTowerId: 1,
      nextEnemyId: 1,
      queue: [],
      qIndex: 0,
      spawnTimer: 0
    };
  }

  function displayWave(state) {
    if (state.phase === 'won' || state.cleared >= 24 ||
        (state.phase === 'stopped' && state.outcome === 'win')) return 24;
    return state.cleared + 1;
  }

  function towerAt(state, c, r) {
    var towers = state.towers;
    for (var i = 0; i < towers.length; i++) {
      if (towers[i].c === c && towers[i].r === r) return towers[i];
    }
    return null;
  }

  function place(state, type, c, r) {
    var cost;
    if (frozen(state)) return {ok: false, reason: 'frozen'};
    if (P.cellKind(c, r) !== 'wood') return {ok: false, reason: 'blocked'};
    if (towerAt(state, c, r)) return {ok: false, reason: 'occupied'};
    cost = P.cost(type);
    if (state.gold < cost) return {ok: false, reason: 'gold'};
    state.gold -= cost;
    state.towers.push({
      id: state.nextTowerId++,
      type: type,
      c: c,
      r: r,
      upgraded: false,
      spent: cost,
      cooldown: 0
    });
    return {ok: true};
  }

  function sell(state, c, r) {
    var towers, i, tower, refund;
    if (frozen(state)) return {ok: false};
    towers = state.towers;
    for (i = 0; i < towers.length; i++) {
      tower = towers[i];
      if (tower.c !== c || tower.r !== r) continue;
      refund = Math.floor(tower.spent * 7 / 10);
      state.gold += refund;
      towers.splice(i, 1);
      state.events.push({t: 'pop', x: c + 0.5, y: r + 0.5, n: refund});
      return {ok: true, refund: refund};
    }
    return {ok: false};
  }

  function upgrade(state, id) {
    var towers, i, tower, cost;
    if (frozen(state)) return {ok: false, reason: 'frozen'};
    towers = state.towers;
    tower = null;
    for (i = 0; i < towers.length; i++) {
      if (towers[i].id === id) {
        tower = towers[i];
        break;
      }
    }
    if (!tower) return {ok: false, reason: 'missing'};
    if (tower.type === 'bowl' || tower.type === 'blanket' || tower.type === 'catch') {
      return {ok: false, reason: 'maxed'};
    }
    if (tower.upgraded) return {ok: false, reason: 'maxed'};
    cost = P.upCost(tower.type);
    if (state.gold < cost) return {ok: false, reason: 'gold'};
    state.gold -= cost;
    tower.spent += cost;
    tower.upgraded = true;
    return {ok: true};
  }

  function startWave(state) {
    var next;
    if (state.phase !== 'idle' || state.cleared >= 24) return {ok: false};
    next = state.cleared + 1;
    state.phase = 'march';
    state.queue = P.queue(next).slice();
    state.qIndex = 0;
    state.spawnTimer = 0;
    return {ok: true};
  }

  function stop(state) {
    if (state.phase !== 'won' && state.phase !== 'lost') return {ok: false};
    state.phase = 'stopped';
    return {ok: true};
  }

  function setSpeed(state, speed) {
    var phase = state.phase;
    if ((phase === 'idle' || phase === 'march') && (speed === 1 || speed === 2)) {
      state.speed = speed;
      return {ok: true};
    }
    return {ok: false};
  }

  function pair(typeA, typeB) {
    var key = typeA < typeB ? typeA + '+' + typeB : typeB + '+' + typeA;
    if (key === 'marble+pillow') return { type: 'bowl', cost: 40 };
    if (key === 'fan+pillow') return { type: 'blanket', cost: 40 };
    if (key === 'band+fan') return { type: 'catch', cost: 50 };
    return null;
  }

  function merge(state, selectedId, destC, destR) {
    var dest, src, i, orth, rec, spent, id;
    if (frozen(state)) return { ok: false, reason: 'frozen' };
    dest = towerAt(state, destC, destR);
    src = null;
    for (i = 0; i < state.towers.length; i++) {
      if (state.towers[i].id === selectedId) src = state.towers[i];
    }
    if (!src || !dest || src === dest) return { ok: false, reason: 'apart' };
    orth = (src.r === dest.r && Math.abs(src.c - dest.c) === 1) ||
      (src.c === dest.c && Math.abs(src.r - dest.r) === 1);
    if (!orth) return { ok: false, reason: 'apart' };
    rec = pair(src.type, dest.type);
    if (!rec) return { ok: false, reason: 'pair' };
    if (state.gold < rec.cost) return { ok: false, reason: 'gold' };
    spent = src.spent + dest.spent + rec.cost;
    state.gold -= rec.cost;
    state.towers = state.towers.filter(function (t) { return t !== src && t !== dest; });
    id = state.nextTowerId++;
    state.towers.push({
      id: id,
      type: rec.type,
      c: dest.c,
      r: dest.r,
      upgraded: false,
      spent: spent,
      cooldown: 0
    });
    return { ok: true, id: id };
  }

  P.fresh = fresh;
  P.displayWave = displayWave;
  P.pair = pair;
  P.merge = merge;
  P.towerAt = towerAt;
  P.place = place;
  P.sell = sell;
  P.upgrade = upgrade;
  P.startWave = startWave;
  P.stop = stop;
  P.setSpeed = setSpeed;
})();

/* Rug Siege march substep: spawn, fire, fly, deaths, move, leaks, clear. */
(function () {
  var P = globalThis.RugParts;

  P.step = function (state, dt) {
    if (state.phase !== 'march') return;

    var wave = state.cleared + 1;
    var queue = state.queue;
    var enemies = state.enemies;
    var towers = state.towers;
    var i, j, k, e, tw, c, shot, best, bestN, n, pr, at, mul, m;

    function ctr(t) {
      return { x: t.c + 0.5, y: t.r + 0.5 };
    }
    function lead(a, b) {
      if (!b || a.progress > b.progress) return a;
      if (a.progress < b.progress) return b;
      return a.id < b.id ? a : b;
    }
    function seen(t, en) {
      var a = ctr(t);
      var b = P.posAlong(en.progress);
      return P.dist(a.x, a.y, b.x, b.y) <= P.rangeOf(t);
    }
    function covered(en, self) {
      if (en.hp <= 0) return false;
      for (k = 0; k < towers.length; k++) {
        if (towers[k] !== self && seen(towers[k], en)) return true;
      }
      return false;
    }
    function harm(en, amount, direct) {
      if (en.hp <= 0) return;
      if (direct && en.type === 'tin' && (en.shield || 0) < 3) {
        en.shield = (en.shield || 0) + 1;
        amount = 0;
      }
      en.hp -= amount;
    }

    if (state.qIndex < queue.length && state.spawnTimer <= 0) {
      var spec = queue[state.qIndex];
      var base = P.baseOf(spec.type);
      var hp = P.scaleHp(base.hp, wave);
      enemies.push({
        id: state.nextEnemyId++,
        type: spec.type,
        progress: 0,
        hp: hp,
        maxHp: hp,
        gold: P.scaleGold(base.gold, wave),
        slow: 1,
        shield: 0,
        snare: 0,
        catchLock: 0
      });
      state.qIndex++;
      state.spawnTimer = state.qIndex < queue.length ? queue[state.qIndex].wait : 1e9;
    }
    if (state.qIndex < queue.length) state.spawnTimer -= dt;

    for (i = 0; i < towers.length; i++) {
      tw = towers[i];
      tw.cooldown -= dt;
      if (tw.cooldown < 0) tw.cooldown = 0;
      if (tw.type === 'fan' || tw.type === 'blanket' || tw.cooldown > 0) continue;
      shot = P.shotOf(tw);
      c = ctr(tw);
      best = null;
      if (tw.type === 'marble' || tw.type === 'band') {
        var any = null;
        var open = null;
        for (j = 0; j < enemies.length; j++) {
          e = enemies[j];
          if (e.hp <= 0 || !seen(tw, e)) continue;
          any = lead(e, any);
          if (tw.type === 'band' && !covered(e, tw)) open = lead(e, open);
        }
        best = tw.type === 'band' ? (open || any) : any;
        if (!best) continue;
        harm(best, shot.dmg, true);
        at = P.posAlong(best.progress);
        state.events.push({ t: 'beam', kind: tw.type, x0: c.x, y0: c.y, x1: at.x, y1: at.y });
        tw.cooldown = shot.cd;
      } else if (tw.type === 'pillow') {
        bestN = -1;
        for (j = 0; j < enemies.length; j++) {
          e = enemies[j];
          if (e.hp <= 0 || !seen(tw, e)) continue;
          at = P.posAlong(e.progress);
          n = 0;
          for (k = 0; k < enemies.length; k++) {
            if (k === j || enemies[k].hp <= 0) continue;
            var other = P.posAlong(enemies[k].progress);
            if (P.dist(at.x, at.y, other.x, other.y) <= shot.splash) n++;
          }
          if (n > bestN || (n === bestN && lead(e, best) === e)) {
            bestN = n;
            best = e;
          }
        }
        if (!best) continue;
        at = P.posAlong(best.progress);
        state.projectiles.push({
          x: c.x, y: c.y, tx: at.x, ty: at.y,
          age: 0, travel: 0.35, radius: shot.splash, center: shot.center
        });
        tw.cooldown = shot.cd;
      } else if (tw.type === 'bowl') {
        var cells = P.pathCells;
        var bestI = -1;
        var bestD = 1e9;
        var bc = c;
        for (j = 0; j < cells.length; j++) {
          var dist = P.dist(bc.x, bc.y, cells[j][0] + 0.5, cells[j][1] + 0.5);
          if (dist < bestD) { bestD = dist; bestI = j; }
        }
        if (bestD > 2) continue;
        var lastI = bestI + 2;
        if (lastI > cells.length - 1) lastI = cells.length - 1;
        for (j = 0; j < enemies.length; j++) {
          e = enemies[j];
          if (e.hp <= 0) continue;
          at = P.posAlong(e.progress);
          var ec = Math.floor(at.x);
          var er = Math.floor(at.y);
          for (k = bestI; k <= lastI; k++) {
            if (cells[k][0] === ec && cells[k][1] === er) {
              harm(e, 18, true);
              break;
            }
          }
        }
        state.events.push({
          t: 'roll',
          x0: cells[bestI][0] + 0.5,
          y0: cells[bestI][1] + 0.5,
          x1: cells[lastI][0] + 0.5,
          y1: cells[lastI][1] + 0.5
        });
        tw.cooldown = 2.2;
      } else if (tw.type === 'catch') {
        best = null;
        for (j = 0; j < enemies.length; j++) {
          e = enemies[j];
          if (e.hp <= 0 || !seen(tw, e)) continue;
          if ((e.snare || 0) > 0 || (e.catchLock || 0) > 0) continue;
          best = lead(e, best);
        }
        if (!best) continue;
        harm(best, 0, true);
        best.snare = 1.2;
        tw.cooldown = 2.0;
      }
    }

    i = 0;
    while (i < state.projectiles.length) {
      pr = state.projectiles[i];
      pr.age += dt;
      if (pr.age < pr.travel) { i++; continue; }
      state.events.push({ t: 'splash', x: pr.tx, y: pr.ty, r: pr.radius });
      at = { x: pr.tx, y: pr.ty };
      for (j = 0; j < enemies.length; j++) {
        e = enemies[j];
        if (e.hp <= 0) continue;
        var ep = P.posAlong(e.progress);
        e.hp -= P.damageAt(P.dist(at.x, at.y, ep.x, ep.y), pr.radius, pr.center, e.type === 'block');
      }
      state.projectiles.splice(i, 1);
    }

    for (i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) {
        state.gold += enemies[i].gold;
        enemies.splice(i, 1);
      }
    }

    for (i = 0; i < enemies.length; i++) {
      e = enemies[i];
      if (e.hp <= 0) continue;
      if ((e.snare || 0) > 0) {
        e.snare -= dt;
        if (e.snare <= 0) {
          e.snare = 0;
          e.catchLock = 4;
        }
      } else if ((e.catchLock || 0) > 0) {
        e.catchLock -= dt;
        if (e.catchLock < 0) e.catchLock = 0;
      }
      mul = (e.snare || 0) > 0 ? 0 : 1;
      if (mul !== 0) {
        for (j = 0; j < towers.length; j++) {
          tw = towers[j];
          if ((tw.type !== 'fan' && tw.type !== 'blanket') || !seen(tw, e)) continue;
          if (tw.type === 'blanket') m = e.type === 'balloon' ? 0.7 : 0.5;
          else m = e.type === 'balloon' ? (tw.upgraded ? 0.75 : 0.85) : (tw.upgraded ? 0.4 : 0.6);
          if (m < mul) mul = m;
        }
      }
      e.slow = mul;
      e.progress += P.baseOf(e.type).speed * e.slow * dt;
    }

    for (i = 0; i < enemies.length; i++) {
      e = enemies[i];
      if (e.progress < 37) continue;
      if (state.lives <= 0) break;
      state.lives -= 1;
      if (state.scuffs < 8) state.scuffs += 1;
      enemies.splice(i, 1);
      i--;
      if (state.lives === 0) {
        state.phase = 'lost';
        state.outcome = 'lose';
        break;
      }
    }

    if (state.phase !== 'march') return;
    if (state.qIndex >= queue.length && enemies.length === 0 && state.projectiles.length === 0) {
      state.gold += 5 + wave;
      state.cleared = wave;
      if (wave === 24) {
        state.phase = 'won';
        state.outcome = 'win';
      } else {
        state.phase = 'idle';
      }
    }
  };
})();

(function () {
  var P = globalThis.RugParts;
  globalThis.RugSim = {
    TILE: 56,
    COLS: 16,
    ROWS: 10,
    fresh: function () { return P.fresh(); },
    step: function (state, dt) { return P.step(state, dt); },
    place: function (state, type, c, r) { return P.place(state, type, c, r); },
    sell: function (state, c, r) { return P.sell(state, c, r); },
    upgrade: function (state, id) { return P.upgrade(state, id); },
    pair: function (a, b) { return P.pair(a, b); },
    merge: function (state, selectedId, destC, destR) { return P.merge(state, selectedId, destC, destR); },
    startWave: function (state) { return P.startWave(state); },
    stop: function (state) { return P.stop(state); },
    setSpeed: function (state, speed) { return P.setSpeed(state, speed); },
    displayWave: function (state) { return P.displayWave(state); },
    preview: function (state) { return P.previewWave(P.displayWave(state)); },
    dockLine: function (type) { return P.dockLine(type); },
    rangeOf: function (tower) { return P.rangeOf(tower); },
    cellKind: function (c, r) { return P.cellKind(c, r); },
    towerAt: function (state, c, r) { return P.towerAt(state, c, r); },
    posAlong: function (progress) { return P.posAlong(progress); },
    damageAt: function (dist, R, center, isBlock) { return P.damageAt(dist, R, center, isBlock); }
  };
})();
