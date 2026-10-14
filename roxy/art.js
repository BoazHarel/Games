/* Roxy's Big Clean: everything drawn in code, in a LEGO style. */
(function () {
  var RX = globalThis.RX || (globalThis.RX = {});
  var C = RX.C;
  var A = RX.Art = {};
  var TAU = Math.PI * 2;

  // ---------- color helpers ----------
  var shadeCache = {};
  function rgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function shade(h, f) {
    if (h.charAt(0) !== '#') return h;
    var key = h + f;
    if (shadeCache[key]) return shadeCache[key];
    var c = rgb(h), t = f < 0 ? 0 : 255, p = Math.abs(f);
    var out = 'rgb(' + Math.round((t - c[0]) * p + c[0]) + ',' + Math.round((t - c[1]) * p + c[1]) + ',' + Math.round((t - c[2]) * p + c[2]) + ')';
    shadeCache[key] = out;
    return out;
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  A.shade = shade; A.rgba = rgba;

  function hash(a, b, c) {
    var h = (a * 374761393 + b * 668265263 + (c || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  A.hash = hash;

  // ---------- shape helpers ----------
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); }
  function ellipse(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  A.rr = rr; A.circle = circle; A.ellipse = ellipse;

  A.star = function (ctx, x, y, r, n, inner) {
    n = n || 5; inner = inner || 0.45;
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var a = -Math.PI / 2 + i * Math.PI / n, rr2 = i % 2 ? r * inner : r;
      ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    ctx.closePath();
  };
  A.heart = function (ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.3, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.3, x, y + s * 0.35);
    ctx.closePath();
  };

  // A LEGO stud seen from slightly above
  A.stud = function (ctx, x, y, r, col) {
    ctx.fillStyle = shade(col, -0.3);
    circle(ctx, x, y + r * 0.32, r); ctx.fill();
    ctx.fillStyle = col;
    circle(ctx, x, y, r); ctx.fill();
    ctx.strokeStyle = shade(col, 0.4);
    ctx.lineWidth = Math.max(0.8, r * 0.22);
    ctx.beginPath(); ctx.arc(x, y, r * 0.6, Math.PI * 1.0, Math.PI * 1.7); ctx.stroke();
  };
  var stud = A.stud;

  // A brick/plate/tile: footprint (x,y,w,h) on the floor, raised by hgt pixels
  A.block = function (ctx, x, y, w, h, hgt, col, o) {
    o = o || {};
    var rad = o.r != null ? o.r : Math.min(w, h) * 0.07;
    if (!o.noShadow && hgt > 0) {
      ctx.fillStyle = 'rgba(40,25,10,0.2)';
      rr(ctx, x + hgt * 0.3 + 1, y + hgt * 0.1 + 1, w, h, rad); ctx.fill();
    }
    if (hgt > 0) {
      ctx.fillStyle = shade(col, -0.3);
      rr(ctx, x, y - hgt, w, h + hgt, rad); ctx.fill();
      // little molding line at the front
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x + rad, y + h - Math.max(1, hgt * 0.12), w - rad * 2, Math.max(1, hgt * 0.12));
    }
    ctx.fillStyle = col;
    rr(ctx, x, y - hgt, w, h, rad); ctx.fill();
    // top bevel
    ctx.strokeStyle = shade(col, 0.28);
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.04);
    ctx.beginPath();
    ctx.moveTo(x + rad, y - hgt + ctx.lineWidth / 2); ctx.lineTo(x + w - rad, y - hgt + ctx.lineWidth / 2);
    ctx.stroke();
    if (o.gloss) {
      var g = ctx.createLinearGradient(x, y - hgt, x + w, y - hgt + h);
      g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(0.45, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; rr(ctx, x, y - hgt, w, h, rad); ctx.fill();
    }
    if (o.studs) {
      var sp = o.studs, nx = Math.max(1, Math.round(w / sp)), ny = Math.max(1, Math.round(h / sp));
      var sr = sp * 0.27;
      for (var j = 0; j < ny; j++) for (var i = 0; i < nx; i++) {
        stud(ctx, x + (i + 0.5) * w / nx, y - hgt + (j + 0.5) * h / ny - sr * 0.12, sr, o.studCol || col);
      }
    }
  };
  var block = A.block;

  // ---------- floors ----------
  function floorCell(ctx, L, x, y, T, style) {
    var F = RX.FLOORS[style], px = x * T, py = y * T, h2 = T / 2;
    ctx.fillStyle = F.base;
    ctx.fillRect(px, py, T, T);
    if (F.studs) {
      for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) stud(ctx, px + h2 * (i + 0.5), py + h2 * (j + 0.5) - T * 0.02, T * 0.13, F.base);
      return;
    }
    var line = 'rgba(0,0,0,0.13)', light = 'rgba(255,255,255,0.22)';
    if (F.pattern === 'planks' || F.pattern === 'deck') {
      var rows = F.pattern === 'deck' ? 3 : 2, rh = T / rows;
      for (var r = 0; r < rows; r++) {
        var gr = y * rows + r, shift = (gr * 3) % 4;
        for (var s = 0; s < 2; s++) {
          var gc = x * 2 + s, plank = Math.floor((gc + shift) / 4);
          ctx.fillStyle = hash(gr, plank) < 0.5 ? F.base : F.alt;
          ctx.fillRect(px + s * h2, py + r * rh, h2, rh);
          if ((gc + shift) % 4 === 0) { ctx.fillStyle = line; ctx.fillRect(px + s * h2, py + r * rh, 1, rh); }
        }
        ctx.fillStyle = F.pattern === 'deck' ? 'rgba(60,35,10,0.35)' : line;
        ctx.fillRect(px, py + r * rh + rh - (F.pattern === 'deck' ? 2 : 1), T, F.pattern === 'deck' ? 2 : 1);
        ctx.fillStyle = light; ctx.fillRect(px, py + r * rh, T, 1);
      }
      if (F.pattern === 'deck') {
        ctx.fillStyle = 'rgba(80,50,20,0.5)';
        for (var r2 = 0; r2 < rows; r2++) if (hash(x, y, r2) < 0.5) { circle(ctx, px + T * 0.2, py + rh * (r2 + 0.5), T * 0.025); ctx.fill(); }
      }
      return;
    }
    if (F.pattern === 'tiles2') {
      ctx.fillStyle = hash(x, y) < 0.3 ? F.alt : F.base;
      ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
      ctx.fillStyle = line; ctx.fillRect(px, py + T - 1, T, 1); ctx.fillRect(px + T - 1, py, 1, T);
      ctx.fillStyle = light; ctx.fillRect(px, py, T, 1); ctx.fillRect(px, py, 1, T);
      return;
    }
    if (F.pattern === 'checker') {
      ctx.fillStyle = (x + y) % 2 ? F.alt : F.base;
      ctx.fillRect(px, py, T, T);
      ctx.fillStyle = line; ctx.fillRect(px, py + T - 1, T, 1); ctx.fillRect(px + T - 1, py, 1, T);
      ctx.fillStyle = light; ctx.fillRect(px + 1, py + 1, T - 2, 1);
      return;
    }
    if (F.pattern === 'checker1') {
      for (var b = 0; b < 2; b++) for (var a = 0; a < 2; a++) {
        ctx.fillStyle = (x * 2 + a + y * 2 + b) % 2 ? F.alt : F.base;
        ctx.fillRect(px + a * h2, py + b * h2, h2, h2);
      }
      ctx.fillStyle = line;
      ctx.fillRect(px, py + h2 - 0.5, T, 1); ctx.fillRect(px + h2 - 0.5, py, 1, T);
      ctx.fillRect(px, py + T - 1, T, 1); ctx.fillRect(px + T - 1, py, 1, T);
      return;
    }
    if (F.pattern === 'stone') {
      for (var q = 0; q < 2; q++) for (var p = 0; p < 2; p++) {
        var hv = hash(x * 2 + p, y * 2 + q, 7);
        var col = hv < 0.35 ? F.alt : F.base;
        ctx.fillStyle = col;
        ctx.fillRect(px + p * h2, py + q * h2, h2, h2);
        if (hv > 0.82) stud(ctx, px + p * h2 + h2 / 2, py + q * h2 + h2 / 2 - 1, T * 0.12, col);
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fillRect(px + p * h2, py + q * h2 + h2 - 1, h2, 1); ctx.fillRect(px + p * h2 + h2 - 1, py + q * h2, 1, h2);
      }
    }
  }

  function outsideCell(ctx, L, x, y, T) {
    var px = x * T, py = y * T, kind = L.def.outside;
    if (kind === 'moat' || (kind === 'beach' && (L.def.transposed ? x >= L.W - 1 : y >= L.H - 1))) {
      var deep = kind === 'moat' ? '#3C7FC0' : '#3AAFCB';
      ctx.fillStyle = deep; ctx.fillRect(px, py, T, T);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (var k = 0; k < 2; k++) {
        if (hash(x, y, k) < 0.55) {
          var wx = px + hash(x, y, k + 3) * T * 0.6, wy = py + (k + 0.4) * T / 2;
          rr(ctx, wx, wy, T * 0.35, T * 0.07, T * 0.035); ctx.fill();
        }
      }
      return;
    }
    var base = kind === 'beach' ? '#E3CF98' : C.lgreen;
    ctx.fillStyle = base; ctx.fillRect(px, py, T, T);
    for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) stud(ctx, px + T / 2 * (i + 0.5), py + T / 2 * (j + 0.5) - T * 0.02, T * 0.12, base);
  }

  function rugDraw(ctx, f, T) {
    var x = f.x * T + T * 0.08, y = f.y * T + T * 0.08, w = f.w * T - T * 0.16, h = f.h * T - T * 0.16;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    if (f.round) { ellipse(ctx, x + w / 2 + 1, y + h / 2 + 2, w / 2, h / 2); ctx.fill(); }
    else { rr(ctx, x + 1, y + 2, w, h, T * 0.1); ctx.fill(); }
    ctx.fillStyle = f.color;
    if (f.round) { ellipse(ctx, x + w / 2, y + h / 2, w / 2, h / 2); ctx.fill(); }
    else { rr(ctx, x, y, w, h, T * 0.1); ctx.fill(); }
    ctx.strokeStyle = f.color === C.white ? C.sky : shade(f.color, 0.45);
    ctx.lineWidth = T * 0.07;
    ctx.setLineDash([T * 0.18, T * 0.12]);
    if (f.round) { ellipse(ctx, x + w / 2, y + h / 2, w / 2 - T * 0.15, h / 2 - T * 0.15); ctx.stroke(); }
    else { rr(ctx, x + T * 0.15, y + T * 0.15, w - T * 0.3, h - T * 0.3, T * 0.06); ctx.stroke(); }
    ctx.setLineDash([]);
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    if (f.round) { ellipse(ctx, x + w / 2, y + h / 2, w / 2, h / 2); ctx.fill(); } else { rr(ctx, x, y, w, h, T * 0.1); ctx.fill(); }
  }

  // Background: baseplate, floors, rugs, wall shadows, paths
  A.renderFloor = function (L, T) {
    var cv = document.createElement('canvas');
    cv.width = L.W * T; cv.height = L.H * T;
    var ctx = cv.getContext('2d');
    var x, y, i;
    for (y = 0; y < L.H; y++) for (x = 0; x < L.W; x++) {
      i = y * L.W + x;
      if (L.type[i] === 2) floorCell(ctx, L, x, y, T, L.rooms[L.room[i]].floor);
      else if (L.type[i] === 0) outsideCell(ctx, L, x, y, T);
      else {
        // under walls: the floor of whichever room is next door shows under the wall's front lip
        ctx.fillStyle = '#8a8f93'; ctx.fillRect(x * T, y * T, T, T);
      }
    }
    // front path + steps, leading away from the front door
    if (L.def.frontDoor) {
      var fdx = L.def.frontDoor[0], fdy = L.def.frontDoor[1], dir = null;
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (d) {
        var nx = fdx + d[0], ny = fdy + d[1];
        if (!dir && nx >= 0 && ny >= 0 && nx < L.W && ny < L.H && L.type[ny * L.W + nx] === 0) dir = d;
      });
      for (var n = 1; dir; n++) {
        x = fdx + dir[0] * n; y = fdy + dir[1] * n;
        if (x < 0 || y < 0 || x >= L.W || y >= L.H || L.type[y * L.W + x] !== 0) break;
        var along = dir[1] !== 0;
        var px0 = along ? x * T - T * 0.2 : x * T + 1, py0 = along ? y * T + 1 : y * T - T * 0.2;
        var pw = along ? T * 1.4 : T - 2, ph = along ? T - 2 : T * 1.4;
        if (L.def.outside === 'moat') {
          block(ctx, px0, py0, pw, ph, T * 0.08, '#8B5A2B', { r: 2, noShadow: true });
          ctx.fillStyle = 'rgba(60,30,10,0.45)';
          for (var k = 1; k < 4; k++) {
            if (along) ctx.fillRect(px0, py0 - T * 0.08 + k * ph / 4, pw, 1);
            else ctx.fillRect(px0 + k * pw / 4, py0 - T * 0.08, 1, ph);
          }
        } else {
          block(ctx, px0, py0, pw, ph, T * (n === 1 ? 0.12 : 0.05), L.def.outside === 'beach' ? '#C9A06C' : C.lgray, { r: 2, noShadow: true });
        }
      }
    }
    // rugs
    L.furniture.forEach(function (f) { if (f.t === 'rug') rugDraw(ctx, f, T); });
    // soft shadows the walls throw onto the floor
    ctx.fillStyle = 'rgba(30,20,10,0.16)';
    for (y = 0; y < L.H - 1; y++) for (x = 0; x < L.W; x++) {
      i = y * L.W + x;
      if (L.type[i] === 1 && L.type[i + L.W] !== 1) ctx.fillRect(x * T, (y + 1) * T, T, T * 0.16);
      if (L.type[i] === 1 && x < L.W - 1 && L.type[i + 1] !== 1) ctx.fillRect((x + 1) * T, y * T + T * 0.1, T * 0.1, T);
    }
    return cv;
  };

  // A tiny map thumbnail for level cards
  A.renderThumb = function (L, size) {
    var T = Math.max(4, Math.floor(size / Math.max(L.W, L.H)));
    var floor = A.renderFloor(L, T);
    var ctx = floor.getContext('2d');
    var sprites = A.buildSprites(L, T);
    sprites.forEach(function (s) { ctx.drawImage(s.img, s.dx, s.dy); });
    return floor;
  };

  // ---------- walls ----------
  var WALL_H = 0.55;
  A.WALL_H = WALL_H;
  function wallSprite(T, col, kind) {
    var hw = Math.round(T * WALL_H);
    var cv = document.createElement('canvas');
    cv.width = T; cv.height = T + hw;
    var ctx = cv.getContext('2d');
    if (kind === 3) {
      // front door: wall with a red door on the front face and a step
      block(ctx, 0, hw, T, T, hw, col, { noShadow: true, r: T * 0.03 });
      ctx.fillStyle = C.red;
      rr(ctx, T * 0.15, hw + T - hw + 1, T * 0.7, hw - 1, 2); ctx.fill();
      ctx.fillStyle = C.yellow; circle(ctx, T * 0.72, hw + T - hw * 0.45, T * 0.04); ctx.fill();
      ctx.fillStyle = shade(col, -0.1);
      rr(ctx, T * 0.1, T * 0.12, T * 0.8, T * 0.76, T * 0.06); ctx.fill();
      ctx.fillStyle = C.red; rr(ctx, T * 0.2, T * 0.25, T * 0.6, T * 0.5, T * 0.04); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(T * 0.2, T * 0.25, T * 0.6, T * 0.06);
      return cv;
    }
    block(ctx, 0, hw, T, T, hw, col, { noShadow: true, r: T * 0.03, studs: kind ? 0 : T / 2 });
    if (kind === 1 || kind === 2) {
      // window: trans-clear panel set into the brick
      ctx.fillStyle = shade(col, -0.15);
      if (kind === 1) rr(ctx, -1, T * 0.28, T + 2, T * 0.44, 2); else rr(ctx, T * 0.28, -1, T * 0.44, T + 2, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(160,220,245,0.95)';
      if (kind === 1) ctx.fillRect(0, T * 0.33, T, T * 0.34); else ctx.fillRect(T * 0.33, 0, T * 0.34, T);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      if (kind === 1) { ctx.moveTo(T * 0.2, T * 0.33); ctx.lineTo(T * 0.38, T * 0.33); ctx.lineTo(T * 0.26, T * 0.67); ctx.lineTo(T * 0.08, T * 0.67); }
      else { ctx.moveTo(T * 0.33, T * 0.2); ctx.lineTo(T * 0.67, T * 0.08); ctx.lineTo(T * 0.67, T * 0.26); ctx.lineTo(T * 0.33, T * 0.38); }
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      if (kind === 1) ctx.fillRect(0, T * 0.49, T, 1.5); else ctx.fillRect(T * 0.49, 0, 1.5, T);
      // the front face of a south window shows glass too
      if (kind === 1) {
        ctx.fillStyle = 'rgba(160,220,245,0.85)';
        ctx.fillRect(T * 0.12, hw + T - hw * 0.8, T * 0.76, hw * 0.55);
      }
    }
    // seams between bricks
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(T - 1, 0, 1, T + hw);
    return cv;
  }

  // ---------- furniture ----------
  var F = {};
  // each: [height in tiles, draw(ctx, x, y, w, h, hp, f, T)] where (x,y,w,h) is the footprint, hp the raised height in px
  F.bed = [0.32, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + 1, y + 1, w - 2, h - 2, hp * 0.6, C.nougat, { r: T * 0.08 });
    var m = T * 0.07, mx = x + m, my = y + m, mw = w - m * 2, mh = h - m * 2, top = my - hp;
    ctx.fillStyle = C.white; rr(ctx, mx, top, mw, mh, T * 0.1); ctx.fill();
    // headboard
    var hd = f.head, depth = T * 0.55;
    ctx.fillStyle = shade(C.nougat, -0.1);
    if (hd === 'w') rr(ctx, x, y - hp * 1.3, T * 0.16, h, 3);
    if (hd === 'e') rr(ctx, x + w - T * 0.16, y - hp * 1.3, T * 0.16, h, 3);
    if (hd === 'n') rr(ctx, x, y - hp * 1.5, w, T * 0.2, 3);
    if (hd === 's') rr(ctx, x, y + h - hp - T * 0.2, w, T * 0.2, 3);
    ctx.fill();
    // blanket covers the foot end
    ctx.fillStyle = f.color;
    var bx = mx, by = top, bw = mw, bh = mh;
    if (hd === 'w') { bx = mx + depth + T * 0.12; bw = mw - depth - T * 0.12; }
    if (hd === 'e') { bw = mw - depth - T * 0.12; }
    if (hd === 'n') { by = top + depth + T * 0.12; bh = mh - depth - T * 0.12; }
    if (hd === 's') { bh = mh - depth - T * 0.12; }
    rr(ctx, bx, by, bw, bh, T * 0.1); ctx.fill();
    ctx.fillStyle = shade(f.color, 0.3);
    if (hd === 'w' || hd === 'e') ctx.fillRect(hd === 'w' ? bx : bx + bw - T * 0.12, by, T * 0.12, bh);
    else ctx.fillRect(bx, hd === 'n' ? by : by + bh - T * 0.12, bw, T * 0.12);
    // studs on the blanket like a printed tile
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (var i = 0; i < 4; i++) { circle(ctx, bx + bw * (0.2 + 0.2 * i), by + bh * 0.5, T * 0.06); ctx.fill(); }
    // pillows
    ctx.fillStyle = C.sky;
    var pw = T * 0.42, ph = (hd === 'w' || hd === 'e') ? (mh - T * 0.2) / 2 : pw;
    for (var p = 0; p < 2; p++) {
      if (hd === 'w' || hd === 'e') {
        var px = hd === 'w' ? mx + T * 0.08 : mx + mw - pw - T * 0.08;
        rr(ctx, px, top + T * 0.07 + p * (ph + T * 0.06), pw, ph, T * 0.08);
      } else {
        var pwid = (mw - T * 0.2) / 2;
        var py = hd === 'n' ? top + T * 0.08 : top + mh - pw - T * 0.08;
        rr(ctx, mx + T * 0.07 + p * (pwid + T * 0.06), py, pwid, pw, T * 0.08);
      }
      ctx.fill();
    }
  }];
  F.nightstand = [0.36, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.08, y + T * 0.08, w - T * 0.16, h - T * 0.16, hp, C.nougat, {});
    var cx = x + w / 2, cy = y + h / 2 - hp - T * 0.04;
    ctx.fillStyle = 'rgba(255,240,150,0.35)'; circle(ctx, cx, cy, T * 0.34); ctx.fill();
    ctx.fillStyle = shade(C.yellow, -0.2); circle(ctx, cx, cy + T * 0.03, T * 0.2); ctx.fill();
    ctx.fillStyle = C.yellow; circle(ctx, cx, cy, T * 0.2); ctx.fill();
    ctx.fillStyle = '#fff6c0'; circle(ctx, cx, cy, T * 0.08); ctx.fill();
  }];
  F.dresser = [0.42, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.05, y + T * 0.08, w - T * 0.1, h - T * 0.16, hp, C.brown, { gloss: 1 });
    var top = y + T * 0.08 - hp;
    for (var i = 0; i < f.w * 2; i++) {
      ctx.fillStyle = C.gold;
      circle(ctx, x + T * 0.05 + (i + 0.5) * (w - T * 0.1) / (f.w * 2), y + h - T * 0.08 - hp * 0.45, T * 0.035); ctx.fill();
    }
    // a little picture frame + a plant cup on top
    ctx.fillStyle = C.white; rr(ctx, x + T * 0.2, top + T * 0.15, T * 0.3, T * 0.22, 2); ctx.fill();
    ctx.fillStyle = C.mblue; ctx.fillRect(x + T * 0.24, top + T * 0.19, T * 0.22, T * 0.14);
    if (f.w > 1) stud(ctx, x + w - T * 0.35, top + T * 0.32, T * 0.13, C.bgreen);
  }];
  F.sofa = [0.3, function (ctx, x, y, w, h, hp, f, T) {
    var col = f.color || C.blue, face = f.face || 's';
    block(ctx, x + 1, y + 1, w - 2, h - 2, hp, col, { r: T * 0.12 });
    var top = y + 1 - hp, back = T * 0.32, arm = T * 0.22;
    ctx.fillStyle = shade(col, -0.12);
    // backrest along the wall side (opposite the facing direction)
    if (face === 'e') rr(ctx, x + 1, top - hp * 0.6, back, h - 2 + hp * 0.6, T * 0.1);
    if (face === 'w') rr(ctx, x + w - 1 - back, top - hp * 0.6, back, h - 2 + hp * 0.6, T * 0.1);
    if (face === 's') rr(ctx, x + 1, top - hp * 0.6, w - 2, back + hp * 0.6, T * 0.1);
    if (face === 'n') rr(ctx, x + 1, top + h - 2 - back, w - 2, back, T * 0.1);
    ctx.fill();
    ctx.fillStyle = shade(col, 0.12);
    // seat cushions
    var n = Math.max(f.w, f.h);
    for (var i = 0; i < n; i++) {
      if (face === 'e' || face === 'w') {
        var cx0 = face === 'e' ? x + back + 3 : x + arm * 0.2 + 2;
        rr(ctx, cx0, top + arm + i * (h - arm * 2) / n + 2, w - back - 6, (h - arm * 2) / n - 4, T * 0.08);
      } else {
        var cy0 = face === 's' ? top + back + 3 : top + 3;
        rr(ctx, x + arm + i * (w - arm * 2) / n + 2, cy0, (w - arm * 2) / n - 4, h - back - 6, T * 0.08);
      }
      ctx.fill();
    }
    // armrests
    ctx.fillStyle = shade(col, -0.05);
    if (face === 'e' || face === 'w') {
      rr(ctx, x + 1, top - hp * 0.3, w - 2, arm, T * 0.1); ctx.fill();
      rr(ctx, x + 1, top + h - 2 - arm - hp * 0.3, w - 2, arm, T * 0.1); ctx.fill();
    } else {
      rr(ctx, x + 1, top - hp * 0.3, arm, h - 2, T * 0.1); ctx.fill();
      rr(ctx, x + w - 1 - arm, top - hp * 0.3, arm, h - 2, T * 0.1); ctx.fill();
    }
  }];
  F.table = [0.28, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.12, y + T * 0.12, w - T * 0.24, h - T * 0.24, hp, C.brown, { gloss: 1 });
    var top = y + T * 0.12 - hp;
    ctx.fillStyle = C.white; circle(ctx, x + w * 0.35, top + T * 0.3, T * 0.1); ctx.fill();
    ctx.fillStyle = '#6b3a1a'; circle(ctx, x + w * 0.35, top + T * 0.3, T * 0.06); ctx.fill();
    ctx.fillStyle = C.yellow; rr(ctx, x + w * 0.5, top + h * 0.45, T * 0.28, T * 0.2, 2); ctx.fill();
  }];
  F.dtable = [0.32, function (ctx, x, y, w, h, hp, f, T) {
    // chairs tucked in, then the table
    var chair = C.nougat;
    for (var i = 0; i < f.w; i++) {
      block(ctx, x + i * T + T * 0.3, y + T * 0.02, T * 0.4, T * 0.2, hp * 0.6, chair, { noShadow: 1 });
      block(ctx, x + i * T + T * 0.3, y + h - T * 0.22, T * 0.4, T * 0.2, hp * 0.6, chair, { noShadow: 1 });
    }
    block(ctx, x + T * 0.1, y + T * 0.2, w - T * 0.2, h - T * 0.4, hp, C.tan, { gloss: 1 });
    var top = y + T * 0.2 - hp;
    for (var p = 0; p < f.w * 2; p++) {
      ctx.fillStyle = C.white;
      circle(ctx, x + T * 0.1 + (p + 0.5) * (w - T * 0.2) / (f.w * 2), top + (h - T * 0.4) / 2, T * 0.11); ctx.fill();
      ctx.fillStyle = [C.red, C.lime, C.orange, C.yellow][p % 4];
      circle(ctx, x + T * 0.1 + (p + 0.5) * (w - T * 0.2) / (f.w * 2), top + (h - T * 0.4) / 2, T * 0.05); ctx.fill();
    }
  }];
  F.tv = [0.55, function (ctx, x, y, w, h, hp, f, T) {
    var vert = f.h > f.w;
    block(ctx, x + T * 0.1, y + T * 0.1, w - T * 0.2, h - T * 0.2, hp * 0.4, C.brown, {});
    ctx.fillStyle = C.black;
    var tx, ty, tw, th;
    if (vert) { tx = x + (f.face === 'w' ? w - T * 0.32 : T * 0.12); ty = y + T * 0.05 - hp; tw = T * 0.2; th = h - T * 0.1; }
    else { tx = x + T * 0.05; ty = y + T * 0.12 - hp; tw = w - T * 0.1; th = T * 0.2; }
    block(ctx, tx, ty + hp, tw, th, hp, C.black, { noShadow: 1, r: 2 });
    var g = ctx.createLinearGradient(tx, ty, tx + tw, ty + th);
    g.addColorStop(0, '#4fa3e0'); g.addColorStop(1, '#a6e4ff');
    ctx.fillStyle = g; ctx.fillRect(tx + 2, ty + 2, tw - 4, th - 4);
    // a game console + remote
    ctx.fillStyle = C.white; rr(ctx, x + w * 0.3, y + h * 0.55 - hp * 0.4, T * 0.22, T * 0.14, 2); ctx.fill();
  }];
  F.plant = [0.62, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    block(ctx, cx - T * 0.22, cy - T * 0.22, T * 0.44, T * 0.44, hp * 0.45, '#B8572E', { r: T * 0.2 });
    var top = cy - hp * 0.45, n = f.palm ? 7 : 6;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU + 0.3, len = f.palm ? T * 0.55 : T * 0.36;
      ctx.fillStyle = i % 2 ? C.bgreen : C.green;
      ctx.save(); ctx.translate(cx, top - hp * 0.3); ctx.rotate(a);
      ellipse(ctx, len * 0.55, 0, len * 0.55, f.palm ? T * 0.1 : T * 0.13, 0); ctx.fill();
      if (f.palm) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke(); }
      ctx.restore();
    }
    stud(ctx, cx, top - hp * 0.35, T * 0.1, C.bgreen);
  }];
  F.counter = [0.42, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x, y + 1, w, h - 1, hp, C.white, { r: 2 });
    var top = y + 1 - hp, n = Math.max(f.w, f.h);
    for (var i = 0; i < n; i++) {
      var cx = f.w >= f.h ? x + (i + 0.5) * T : x + w / 2, cy = f.w >= f.h ? top + h / 2 : top + (i + 0.5) * T;
      if (f.stove === i) {
        ctx.fillStyle = C.black; rr(ctx, cx - T * 0.42, cy - T * 0.42, T * 0.84, T * 0.84, 3); ctx.fill();
        for (var b = 0; b < 4; b++) {
          var bx = cx + (b % 2 ? 0.2 : -0.2) * T, by = cy + (b < 2 ? -0.2 : 0.2) * T;
          ctx.strokeStyle = b === 1 ? '#ff5a36' : '#555'; ctx.lineWidth = T * 0.045;
          circle(ctx, bx, by, T * 0.12); ctx.stroke();
        }
      } else if (f.sinkAt === i) {
        ctx.fillStyle = '#B9C3CB'; rr(ctx, cx - T * 0.32, cy - T * 0.28, T * 0.64, T * 0.56, T * 0.12); ctx.fill();
        ctx.fillStyle = '#8D99A3'; rr(ctx, cx - T * 0.24, cy - T * 0.2, T * 0.48, T * 0.4, T * 0.1); ctx.fill();
        ctx.fillStyle = '#d7dee3'; circle(ctx, cx, cy - T * 0.3, T * 0.07); ctx.fill();
      } else {
        // cutting board / fruit bowl
        if ((i + (f.x || 0)) % 2) { ctx.fillStyle = C.nougat; rr(ctx, cx - T * 0.25, cy - T * 0.18, T * 0.5, T * 0.36, 3); ctx.fill(); stud(ctx, cx - T * 0.05, cy - T * 0.02, T * 0.08, C.lime); }
        else { ctx.fillStyle = C.mblue; circle(ctx, cx, cy, T * 0.22); ctx.fill(); stud(ctx, cx - T * 0.07, cy - T * 0.04, T * 0.08, C.red); stud(ctx, cx + T * 0.07, cy - T * 0.02, T * 0.08, C.yellow); stud(ctx, cx, cy + T * 0.07, T * 0.08, C.orange); }
      }
    }
  }];
  F.fridge = [0.75, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.05, y + T * 0.05, w - T * 0.1, h - T * 0.1, hp, '#E6EBEE', { gloss: 1, r: T * 0.06 });
    ctx.fillStyle = '#A9B2B9';
    ctx.fillRect(x + T * 0.05, y + h - T * 0.05 - hp * 0.55, w - T * 0.1, 1.5);
    ctx.fillRect(x + w * 0.75, y + h - T * 0.05 - hp * 0.9, T * 0.05, hp * 0.3);
    ctx.fillRect(x + w * 0.75, y + h - T * 0.05 - hp * 0.45, T * 0.05, hp * 0.3);
    stud(ctx, x + w * 0.3, y + T * 0.3 - hp, T * 0.08, C.red);
    stud(ctx, x + w * 0.55, y + T * 0.45 - hp, T * 0.08, C.yellow);
  }];
  F.toilet = [0.34, function (ctx, x, y, w, h, hp, f, T) {
    var face = f.face || 's', cx = x + w / 2, cy = y + h / 2;
    // tank sits on the wall side
    var ox = { n: 0, s: 0, e: -1, w: 1 }[face], oy = { n: 1, s: -1, e: 0, w: 0 }[face];
    var tx = cx + ox * T * 0.3, ty = cy + oy * T * 0.3;
    var tw = ox ? T * 0.26 : T * 0.62, th = ox ? T * 0.62 : T * 0.26;
    block(ctx, tx - tw / 2, ty - th / 2, tw, th, hp * 1.4, C.white, { r: 3 });
    var bx = cx - ox * T * 0.08, by = cy - oy * T * 0.08;
    ctx.fillStyle = 'rgba(40,25,10,0.2)'; ellipse(ctx, bx + 2, by + 2, T * 0.26, T * 0.3, ox ? Math.PI / 2 : 0); ctx.fill();
    ctx.fillStyle = shade(C.white, -0.2); ellipse(ctx, bx, by - hp * 0.6, T * 0.26, T * 0.3, ox ? Math.PI / 2 : 0); ctx.fill();
    ctx.fillStyle = C.white; ellipse(ctx, bx, by - hp, T * 0.26, T * 0.3, ox ? Math.PI / 2 : 0); ctx.fill();
    ctx.fillStyle = '#9fd3ef'; ellipse(ctx, bx, by - hp, T * 0.15, T * 0.18, ox ? Math.PI / 2 : 0); ctx.fill();
  }];
  F.sink = [0.45, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.12, y + T * 0.08, w - T * 0.24, h - T * 0.2, hp, C.white, { r: T * 0.1 });
    var top = y + T * 0.08 - hp;
    ctx.fillStyle = '#B5DDF2'; ellipse(ctx, x + w / 2, top + (h - T * 0.2) / 2 + T * 0.04, T * 0.24, T * 0.2); ctx.fill();
    ctx.fillStyle = '#C9CED2'; rr(ctx, x + w / 2 - T * 0.04, top + T * 0.04, T * 0.08, T * 0.2, 2); ctx.fill();
    stud(ctx, x + w / 2, top + T * 0.08, T * 0.06, '#C9CED2');
  }];
  F.tub = [0.36, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + 1, y + 2, w - 2, h - 4, hp, C.white, { r: T * 0.2 });
    var top = y + 2 - hp, ix = x + T * 0.14, iy = top + T * 0.14, iw = w - T * 0.28, ih = h - 4 - T * 0.28;
    var g = ctx.createLinearGradient(ix, iy, ix, iy + ih);
    g.addColorStop(0, '#7FC8F0'); g.addColorStop(1, '#B9E6FA');
    ctx.fillStyle = g; rr(ctx, ix, iy, iw, ih, T * 0.16); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (var i = 0; i < 5; i++) { circle(ctx, ix + iw * (0.15 + 0.17 * i), iy + ih * (0.3 + 0.4 * hash(i, f.x)), T * (0.05 + 0.04 * hash(f.y, i))); ctx.fill(); }
    // rubber duck
    var dx = ix + iw * 0.7, dy = iy + ih * 0.5;
    ctx.fillStyle = C.yellow; ellipse(ctx, dx, dy, T * 0.11, T * 0.08); ctx.fill();
    circle(ctx, dx + T * 0.08, dy - T * 0.04, T * 0.06); ctx.fill();
    ctx.fillStyle = C.orange; circle(ctx, dx + T * 0.14, dy - T * 0.03, T * 0.025); ctx.fill();
  }];
  F.shelf = [0.6, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.04, y + T * 0.15, w - T * 0.08, h - T * 0.3, hp, C.brown, {});
    var top = y + T * 0.15 - hp, n = Math.round((w - T * 0.12) / (T * 0.13));
    var cols = [C.red, C.blue, C.yellow, C.bgreen, C.orange, C.white, C.lavender, C.azure];
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = cols[Math.floor(hash(i, f.x, f.y) * cols.length)];
      var bh = (h - T * 0.36) * (0.7 + 0.3 * hash(f.x, i));
      ctx.fillRect(x + T * 0.08 + i * T * 0.13, top + T * 0.04, T * 0.11, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(x + T * 0.08 + i * T * 0.13, top + T * 0.04, T * 0.03, bh);
    }
  }];
  F.toybox = [0.42, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.08, y + T * 0.12, w - T * 0.16, h - T * 0.2, hp, C.red, { studs: T / 2, r: 3 });
    ctx.fillStyle = C.yellow;
    ctx.fillRect(x + T * 0.08, y + h - T * 0.08 - hp * 0.6, w - T * 0.16, T * 0.06);
    // a teddy ear peeking out
    stud(ctx, x + w * 0.3, y + T * 0.15 - hp, T * 0.09, C.nougat);
  }];
  F.beanbag = [0.24, function (ctx, x, y, w, h, hp, f, T) {
    var col = f.color || C.orange, cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = 'rgba(40,25,10,0.22)'; ellipse(ctx, cx + 3, cy + 3, T * 0.42, T * 0.38); ctx.fill();
    ctx.fillStyle = shade(col, -0.25); ellipse(ctx, cx, cy, T * 0.42, T * 0.38); ctx.fill();
    ctx.fillStyle = col; ellipse(ctx, cx, cy - hp, T * 0.42, T * 0.36); ctx.fill();
    ctx.fillStyle = shade(col, -0.12); ellipse(ctx, cx + T * 0.05, cy - hp + T * 0.06, T * 0.2, T * 0.17); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ellipse(ctx, cx - T * 0.16, cy - hp - T * 0.14, T * 0.12, T * 0.07, -0.5); ctx.fill();
  }];
  F.kidtable = [0.26, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.08, y + T * 0.12, w - T * 0.16, h - T * 0.24, hp, C.yellow, { r: T * 0.12 });
    var top = y + T * 0.12 - hp;
    ctx.fillStyle = C.white; ctx.save(); ctx.translate(x + w * 0.35, top + T * 0.35); ctx.rotate(-0.15); ctx.fillRect(-T * 0.2, -T * 0.14, T * 0.4, T * 0.28); ctx.restore();
    [C.red, C.blue, C.bgreen].forEach(function (c, i) { ctx.fillStyle = c; ctx.save(); ctx.translate(x + w * 0.65 + i * T * 0.08, top + T * 0.36); ctx.rotate(0.4); ctx.fillRect(-T * 0.02, -T * 0.13, T * 0.045, T * 0.26); ctx.restore(); });
  }];
  F.legoset = [0.18, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.04, y + T * 0.1, w - T * 0.08, h - T * 0.2, hp * 0.3, C.bgreen, { studs: T / 2 });
    var top = y + T * 0.1 - hp * 0.3;
    block(ctx, x + T * 0.2, top + T * 0.5, T * 0.5, T * 0.25, hp * 1.4, C.lgray, { studs: T / 4, noShadow: 1 });
    block(ctx, x + T * 0.9, top + T * 0.55, T * 0.25, T * 0.25, hp * 2.2, C.red, { studs: T / 4, noShadow: 1 });
    block(ctx, x + T * 1.25, top + T * 0.45, T * 0.5, T * 0.25, hp * 1.0, C.blue, { studs: T / 4, noShadow: 1 });
  }];
  F.desk = [0.36, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.04, y + T * 0.08, w - T * 0.08, h - T * 0.25, hp, C.tan, { gloss: 1 });
    var top = y + T * 0.08 - hp;
    ctx.fillStyle = '#5c6670'; rr(ctx, x + w * 0.35, top + T * 0.12, T * 0.5, T * 0.34, 3); ctx.fill();
    ctx.fillStyle = '#9ad1ff'; rr(ctx, x + w * 0.35 + 2, top + T * 0.12 + 2, T * 0.5 - 4, T * 0.22, 2); ctx.fill();
    stud(ctx, x + T * 0.25, top + T * 0.3, T * 0.12, C.lime);
    // chair
    block(ctx, x + w * 0.4, y + h - T * 0.28, T * 0.4, T * 0.26, hp * 0.5, C.red, { noShadow: 1, r: T * 0.08 });
  }];
  F.stairs = [0, function (ctx, x, y, w, h, hp, f, T) {
    var n = 6;
    for (var i = 0; i < n; i++) {
      var c = 0.75 - i * 0.09;
      ctx.fillStyle = 'rgb(' + Math.round(200 * c) + ',' + Math.round(170 * c) + ',' + Math.round(130 * c) + ')';
      ctx.fillRect(x + i * w / n, y, w / n, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + i * w / n, y, 2, h);
    }
    ctx.fillStyle = C.white; ctx.fillRect(x, y, w, T * 0.08); ctx.fillRect(x, y + h - T * 0.08, w, T * 0.08);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + T * 0.08, w, 2);
  }];
  F.washer = [0.5, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.06, y + T * 0.06, w - T * 0.12, h - T * 0.12, hp, C.white, { gloss: 1 });
    var top = y + T * 0.06 - hp, cx = x + w / 2, cy = top + (h - T * 0.12) / 2 + T * 0.05;
    ctx.fillStyle = '#B9C3CB'; circle(ctx, cx, cy, T * 0.28); ctx.fill();
    ctx.fillStyle = f.dryer ? '#ffd9a8' : '#86cdef'; circle(ctx, cx, cy, T * 0.22); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; circle(ctx, cx - T * 0.07, cy - T * 0.07, T * 0.06); ctx.fill();
    ctx.fillStyle = C.red; circle(ctx, x + w * 0.22, top + T * 0.12, T * 0.04); ctx.fill();
  }];
  F.basket = [0.3, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = 'rgba(40,25,10,0.22)'; circle(ctx, cx + 3, cy + 3, T * 0.36); ctx.fill();
    ctx.fillStyle = '#8C5A2B'; ctx.fillRect(cx - T * 0.36, cy - hp, T * 0.72, hp); circle(ctx, cx, cy, T * 0.36); ctx.fill();
    ctx.fillStyle = '#C08A4E'; circle(ctx, cx, cy - hp, T * 0.36); ctx.fill();
    [[C.pink, -0.1, -0.05], [C.sky, 0.1, 0.02], [C.white, 0, 0.12], [C.lime, -0.12, 0.12]].forEach(function (s) {
      ctx.fillStyle = s[0]; ellipse(ctx, cx + s[1] * T, cy - hp + s[2] * T - T * 0.03, T * 0.14, T * 0.1, s[1] * 5); ctx.fill();
    });
  }];
  F.island = [0.42, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.04, y + T * 0.12, w - T * 0.08, h - T * 0.24, hp, '#D8DDE1', { gloss: 1 });
    var top = y + T * 0.12 - hp;
    ctx.fillStyle = C.white; circle(ctx, x + w * 0.3, top + T * 0.35, T * 0.2); ctx.fill();
    stud(ctx, x + w * 0.27, top + T * 0.32, T * 0.08, C.orange); stud(ctx, x + w * 0.34, top + T * 0.38, T * 0.08, C.lime);
    ctx.fillStyle = C.yellow; ctx.save(); ctx.translate(x + w * 0.7, top + T * 0.36); ctx.rotate(0.5); ellipse(ctx, 0, 0, T * 0.2, T * 0.06); ctx.fill(); ctx.restore();
  }];
  F.surfboard = [0.1, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2, vert = f.h > f.w;
    var rx = (vert ? h : w) * 0.47, ry = T * 0.24, rot = vert ? Math.PI / 2 : 0;
    ctx.fillStyle = 'rgba(40,25,10,0.22)'; ellipse(ctx, cx + 2, cy + 3, rx, ry, rot); ctx.fill();
    ctx.fillStyle = f.color || C.coral; ellipse(ctx, cx, cy - hp, rx, ry, rot); ctx.fill();
    ctx.fillStyle = C.white;
    if (vert) ctx.fillRect(cx - T * 0.03, cy - hp - rx * 0.8, T * 0.06, rx * 1.6); else ctx.fillRect(cx - rx * 0.8, cy - hp - T * 0.03, rx * 1.6, T * 0.06);
  }];
  F.bench = [0.3, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.15, y + T * 0.05, w - T * 0.3, h - T * 0.1, hp, C.nougat, { studs: T / 2 });
    ctx.fillStyle = C.red; ellipse(ctx, x + w * 0.5, y + h - T * 0.3 - hp, T * 0.1, T * 0.16); ctx.fill();
    ctx.fillStyle = C.blue; ellipse(ctx, x + w * 0.5, y + T * 0.4 - hp, T * 0.1, T * 0.16); ctx.fill();
  }];
  F.umbrella = [0.95, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    block(ctx, cx - T * 0.3, cy - T * 0.3, T * 0.6, T * 0.6, hp * 0.3, C.white, { r: T * 0.3 });
    ctx.fillStyle = 'rgba(40,25,10,0.18)'; circle(ctx, cx + T * 0.3, cy + T * 0.15, T * 0.78); ctx.fill();
    var top = cy - hp, n = 8;
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? C.white : C.red;
      ctx.beginPath(); ctx.moveTo(cx, top); ctx.arc(cx, top, T * 0.78, i / n * TAU, (i + 1) / n * TAU); ctx.closePath(); ctx.fill();
    }
    stud(ctx, cx, top - 2, T * 0.08, C.white);
  }];
  F.lounger = [0.22, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.08, y + T * 0.15, w - T * 0.16, h - T * 0.3, hp, C.white, { r: T * 0.1 });
    var top = y + T * 0.15 - hp;
    for (var i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? C.azure : C.white; ctx.fillRect(x + T * 0.12 + i * (w - T * 0.24) / 4, top + 2, (w - T * 0.24) / 4, h - T * 0.3 - 4); }
    ctx.fillStyle = C.yellow; rr(ctx, x + w - T * 0.5, top + T * 0.08, T * 0.32, h - T * 0.46, 4); ctx.fill();
  }];
  F.throne = [0.7, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.2, y + T * 0.1, w - T * 0.4, h - T * 0.15, hp * 0.4, C.gold, { studs: T / 2 });
    block(ctx, x + T * 0.3, y + T * 0.05, w - T * 0.6, T * 0.25, hp, C.gold, { noShadow: 1 });
    ctx.fillStyle = C.red; rr(ctx, x + T * 0.45, y + T * 0.35 - hp * 0.4, w - T * 0.9, h - T * 0.55, 4); ctx.fill();
    A.star(ctx, x + w / 2, y + T * 0.05 - hp + T * 0.12, T * 0.1); ctx.fillStyle = C.blue; ctx.fill();
  }];
  F.armor = [0.7, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = 'rgba(40,25,10,0.22)'; circle(ctx, cx + 3, cy + 3, T * 0.3); ctx.fill();
    block(ctx, cx - T * 0.25, cy - T * 0.15, T * 0.5, T * 0.4, hp * 0.6, '#9BA3A8', { noShadow: 1, r: T * 0.12 });
    ctx.fillStyle = '#B9C0C4'; circle(ctx, cx, cy - hp, T * 0.2); ctx.fill();
    ctx.fillStyle = '#5F6A72'; ctx.fillRect(cx - T * 0.13, cy - hp + T * 0.02, T * 0.26, T * 0.04);
    ctx.fillStyle = C.red; ellipse(ctx, cx, cy - hp - T * 0.18, T * 0.05, T * 0.12); ctx.fill();
  }];
  F.banner = [0.85, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h * 0.4;
    stud(ctx, cx, cy, T * 0.16, C.dgray);
    ctx.fillStyle = C.brown; ctx.fillRect(cx - T * 0.03, cy - hp, T * 0.06, hp);
    ctx.fillStyle = f.color || C.blue;
    ctx.beginPath(); ctx.moveTo(cx + T * 0.03, cy - hp); ctx.lineTo(cx + T * 0.4, cy - hp + T * 0.06); ctx.lineTo(cx + T * 0.3, cy - hp + T * 0.18); ctx.lineTo(cx + T * 0.4, cy - hp + T * 0.32); ctx.lineTo(cx + T * 0.03, cy - hp + T * 0.32); ctx.fill();
    A.star(ctx, cx + T * 0.18, cy - hp + T * 0.16, T * 0.06); ctx.fillStyle = C.yellow; ctx.fill();
  }];
  F.cauldron = [0.34, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = 'rgba(255,120,30,0.35)'; circle(ctx, cx, cy + T * 0.05, T * 0.42); ctx.fill();
    ctx.fillStyle = 'rgba(40,25,10,0.25)'; circle(ctx, cx + 3, cy + 3, T * 0.36); ctx.fill();
    ctx.fillStyle = '#2b2f33'; ctx.fillRect(cx - T * 0.36, cy - hp, T * 0.72, hp); circle(ctx, cx, cy, T * 0.36); ctx.fill();
    ctx.fillStyle = '#3d4348'; circle(ctx, cx, cy - hp, T * 0.36); ctx.fill();
    ctx.fillStyle = f.y > 8 ? '#C9772B' : '#7CE36A'; circle(ctx, cx, cy - hp, T * 0.27); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; circle(ctx, cx - T * 0.08, cy - hp - T * 0.05, T * 0.06); ctx.fill(); circle(ctx, cx + T * 0.1, cy - hp + T * 0.06, T * 0.04); ctx.fill();
  }];
  F.longtable = [0.34, function (ctx, x, y, w, h, hp, f, T) {
    for (var i = 0; i < f.w; i++) {
      block(ctx, x + i * T + T * 0.25, y - T * 0.02, T * 0.5, T * 0.18, hp * 0.6, C.brown, { noShadow: 1 });
      block(ctx, x + i * T + T * 0.25, y + h - T * 0.16, T * 0.5, T * 0.18, hp * 0.6, C.brown, { noShadow: 1 });
    }
    block(ctx, x + T * 0.05, y + T * 0.18, w - T * 0.1, h - T * 0.36, hp, C.nougat, { gloss: 1 });
    var top = y + T * 0.18 - hp, mid = top + (h - T * 0.36) / 2;
    for (var p = 0; p < f.w; p++) {
      var px = x + (p + 0.5) * T;
      ctx.fillStyle = C.white; circle(ctx, px, mid, T * 0.13); ctx.fill();
      if (p % 2) { ctx.fillStyle = '#C9772B'; ellipse(ctx, px, mid, T * 0.09, T * 0.06, 0.6); ctx.fill(); ctx.fillStyle = C.white; circle(ctx, px + T * 0.08, mid - T * 0.06, T * 0.03); ctx.fill(); }
      else { stud(ctx, px, mid - 1, T * 0.07, C.gold); }
    }
  }];
  F.barrel = [0.46, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    ctx.fillStyle = 'rgba(40,25,10,0.22)'; circle(ctx, cx + 3, cy + 3, T * 0.34); ctx.fill();
    ctx.fillStyle = '#6E3B17'; ctx.fillRect(cx - T * 0.34, cy - hp, T * 0.68, hp); circle(ctx, cx, cy, T * 0.34); ctx.fill();
    ctx.fillStyle = '#4b4f52'; ctx.fillRect(cx - T * 0.34, cy - hp * 0.35, T * 0.68, T * 0.05);
    ctx.fillStyle = '#9A5A2A'; circle(ctx, cx, cy - hp, T * 0.34); ctx.fill();
    ctx.strokeStyle = '#4b4f52'; ctx.lineWidth = T * 0.05; circle(ctx, cx, cy - hp, T * 0.31); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(cx + i * T * 0.12, cy - hp - T * 0.28); ctx.lineTo(cx + i * T * 0.12, cy - hp + T * 0.28); ctx.stroke(); }
  }];
  F.weapons = [0.6, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.2, y + T * 0.05, w - T * 0.4, h - T * 0.1, hp * 0.3, C.brown, {});
    for (var i = 0; i < f.h; i++) {
      var cy = y + (i + 0.5) * T - hp * 0.3;
      if (i % 2) {
        ctx.fillStyle = C.blue; ellipse(ctx, x + w / 2, cy, T * 0.26, T * 0.32); ctx.fill();
        ctx.fillStyle = C.yellow; A.star(ctx, x + w / 2, cy, T * 0.1); ctx.fill();
      } else {
        ctx.fillStyle = '#D5DADD'; ctx.fillRect(x + w / 2 - T * 0.04, cy - T * 0.38, T * 0.08, T * 0.6);
        ctx.fillStyle = C.gold; ctx.fillRect(x + w / 2 - T * 0.16, cy + T * 0.18, T * 0.32, T * 0.06);
      }
    }
  }];
  F.chest = [0.38, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.1, y + T * 0.15, w - T * 0.2, h - T * 0.3, hp, '#8B4A1B', { r: T * 0.08 });
    var top = y + T * 0.15 - hp;
    ctx.fillStyle = C.gold;
    ctx.fillRect(x + T * 0.1, top + (h - T * 0.3) * 0.45, w - T * 0.2, T * 0.06);
    ctx.fillRect(x + w / 2 - T * 0.05, top, T * 0.1, h - T * 0.3);
    for (var i = 0; i < 3; i++) stud(ctx, x + T * 0.3 + i * T * 0.2, top + T * 0.2, T * 0.07, C.gold);
  }];
  F.dock = [0.3, function (ctx, x, y, w, h, hp, f, T) {
    // charging base: low wedge against the wall with a green light
    var d = f.dir, bw = T * 0.84, bd = T * 0.26, bx, by, bwid, bhgt;
    if (d === 'n' || d === 's') { bx = x + (w - bw) / 2; by = d === 'n' ? y : y + h - bd; bwid = bw; bhgt = bd; }
    else { by = y + (h - bw) / 2; bx = d === 'w' ? x : x + w - bd; bwid = bd; bhgt = bw; }
    ctx.fillStyle = 'rgba(80,90,100,0.25)';
    rr(ctx, x + T * 0.04, y + T * 0.04, w - T * 0.08, h - T * 0.08, T * 0.2); ctx.fill();
    block(ctx, bx, by, bwid, bhgt, hp, '#3B4249', { r: T * 0.08 });
    var lx = bx + bwid / 2, ly = by + bhgt / 2 - hp;
    ctx.fillStyle = 'rgba(120,255,140,0.35)'; circle(ctx, lx, ly, T * 0.12); ctx.fill();
    ctx.fillStyle = '#62F07A'; circle(ctx, lx, ly, T * 0.05); ctx.fill();
  }];

  A.FURN = F;

  function furnSprite(f, T) {
    var spec = F[f.t];
    if (!spec) spec = [0.3, function (ctx, x, y, w, h, hp) { block(ctx, x + 2, y + 2, w - 4, h - 4, hp, C.lgray, { studs: T / 2 }); }];
    var hp = Math.round(spec[0] * T), pad = Math.ceil(T * (f.t === 'umbrella' ? 0.6 : 0.25));
    var w = f.w * T, h = f.h * T;
    var cv = document.createElement('canvas');
    cv.width = w + pad * 2; cv.height = h + hp + pad * 2;
    var ctx = cv.getContext('2d');
    spec[1](ctx, pad, pad + hp, w, h, hp, f, T);
    return { img: cv, dx: f.x * T - pad, dy: f.y * T - pad - hp, key: f.y + f.h - (f.t === 'dock' ? 0.6 : 0) };
  }

  // ---------- outdoor decorations ----------
  function treeSprite(T, kind, size, seed) {
    var s = Math.round(T * size), hp = Math.round(T * 0.5), pad = Math.ceil(T * 0.2);
    var cv = document.createElement('canvas');
    cv.width = s + pad * 2; cv.height = s + hp + pad * 2;
    var ctx = cv.getContext('2d');
    var cx = pad + s / 2, cy = pad + hp + s / 2, r = s / 2;
    ctx.fillStyle = 'rgba(20,40,10,0.25)'; circle(ctx, cx + r * 0.25, cy + r * 0.15, r * 0.95); ctx.fill();
    if (kind === 'palm') {
      ctx.fillStyle = '#8C5A2B'; ctx.fillRect(cx - T * 0.06, cy - hp, T * 0.12, hp);
      for (var i = 0; i < 7; i++) {
        ctx.save(); ctx.translate(cx, cy - hp); ctx.rotate(i / 7 * TAU + seed);
        ctx.fillStyle = i % 2 ? C.bgreen : C.green;
        ellipse(ctx, r * 0.55, 0, r * 0.55, r * 0.17); ctx.fill();
        ctx.restore();
      }
      stud(ctx, cx, cy - hp, T * 0.1, '#8C5A2B');
      return cv;
    }
    if (kind === 'flowers') {
      for (var f = 0; f < 5; f++) {
        var a = f / 5 * TAU + seed, fx = cx + Math.cos(a) * r * 0.45, fy = cy + Math.sin(a) * r * 0.45;
        stud(ctx, fx, fy, T * 0.13, C.bgreen);
        stud(ctx, fx, fy - T * 0.05, T * 0.09, [C.red, C.yellow, C.pink, C.white, C.orange][(f + Math.floor(seed * 10)) % 5]);
      }
      return cv;
    }
    // round LEGO bush: stacked studded domes
    ctx.fillStyle = C.green; circle(ctx, cx, cy - hp * 0.3, r); ctx.fill();
    ctx.fillStyle = shade(C.bgreen, 0); circle(ctx, cx - r * 0.08, cy - hp * 0.6, r * 0.82); ctx.fill();
    ctx.fillStyle = shade(C.bgreen, 0.12); circle(ctx, cx - r * 0.15, cy - hp * 0.85, r * 0.55); ctx.fill();
    var studR = T * 0.09;
    for (var ring = 0; ring < 3; ring++) {
      var rr2 = r * (0.7 - ring * 0.25), n = Math.max(1, Math.round(rr2 * TAU / (T * 0.3)));
      for (var k = 0; k < n; k++) {
        var aa = k / n * TAU + ring * 0.4;
        stud(ctx, cx - r * 0.1 + Math.cos(aa) * rr2, cy - hp * (0.6 + ring * 0.15) + Math.sin(aa) * rr2 * 0.9, studR, shade(C.bgreen, ring * 0.06));
      }
    }
    return cv;
  }

  function placeDecor(L) {
    var out = [], rnd = RX.rng(L.def.seed * 31 + 5), W = L.W, H = L.H;
    if (L.def.outside === 'moat') return out;
    var nearHouse = function (x, y, d) {
      for (var yy = y - d; yy <= y + d; yy++) for (var xx = x - d; xx <= x + d; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (L.type[yy * W + xx] !== 0) return true;
      }
      return false;
    };
    var fd = L.def.frontDoor;
    var cells = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (L.type[y * W + x] !== 0 || nearHouse(x, y, 0)) continue;
      if (fd && (L.def.transposed ? Math.abs(y - fd[1]) <= 1 && x > fd[0] : Math.abs(x - fd[0]) <= 1 && y > fd[1])) continue;
      if (L.def.outside === 'beach' && (L.def.transposed ? x >= W - 1 : y >= H - 1)) continue;
      cells.push([x, y]);
    }
    var used = {};
    var n = Math.min(cells.length, Math.round(cells.length * 0.22));
    for (var i = 0; i < n; i++) {
      var c = cells[(rnd() * cells.length) | 0];
      if (used[c[0] + ',' + c[1]]) continue;
      used[c[0] + ',' + c[1]] = 1;
      var kind = L.def.outside === 'beach' ? (rnd() < 0.5 ? 'palm' : 'shell') : (rnd() < 0.45 ? 'bush' : 'flowers');
      out.push({ x: c[0] + 0.5, y: c[1] + 0.5, kind: kind, seed: rnd() * 6, size: kind === 'bush' ? 0.8 + rnd() * 0.25 : 0.8 });
    }
    return out;
  }

  // Everything that stands up from the floor, sorted by its front edge
  A.buildSprites = function (L, T) {
    var list = [];
    var cache = {};
    for (var y = 0; y < L.H; y++) for (var x = 0; x < L.W; x++) {
      var i = y * L.W + x;
      if (L.type[i] !== 1) continue;
      var key = L.wallColor[i] + '|' + L.window[i];
      if (!cache[key]) cache[key] = wallSprite(T, L.wallColor[i], L.window[i]);
      list.push({ img: cache[key], dx: x * T, dy: y * T - Math.round(T * WALL_H), key: y + 1 });
    }
    L.furniture.forEach(function (f) { if (f.t !== 'rug') list.push(furnSprite(f, T)); });
    var d = L.dock;
    list.push(furnSprite({ t: 'dock', x: d.x, y: d.y, w: 1, h: 1, dir: d.dir }, T));
    placeDecor(L).forEach(function (t) {
      if (t.kind === 'shell') {
        var cv = document.createElement('canvas'); cv.width = cv.height = T;
        var ctx = cv.getContext('2d');
        A.drawDirt(ctx, { kind: 'shell', rot: t.seed, v: t.seed / 6 }, T / 2, T / 2, T * 1.6, 0);
        list.push({ img: cv, dx: t.x * T - T / 2, dy: t.y * T - T / 2, key: t.y - 0.5 });
        return;
      }
      var img = treeSprite(T, t.kind, t.size, t.seed);
      var s = Math.round(T * t.size), hp = Math.round(T * 0.5), pad = Math.ceil(T * 0.2);
      list.push({ img: img, dx: t.x * T - s / 2 - pad, dy: t.y * T - s / 2 - hp - pad, key: t.y + 0.3 });
    });
    list.sort(function (a, b) { return a.key - b.key; });
    return list;
  };

  // ---------- dust layer ----------
  A.DUST_RES = 20;
  A.renderDust = function (L) {
    var R = A.DUST_RES;
    var cv = document.createElement('canvas');
    cv.width = L.W * R; cv.height = L.H * R;
    var ctx = cv.getContext('2d');
    var rnd = RX.rng(L.def.seed + 99);
    for (var i = 0; i < L.W * L.H; i++) {
      if (L.type[i] !== 2 || L.blocked[i]) continue;
      var x = (i % L.W) * R, y = ((i / L.W) | 0) * R;
      ctx.fillStyle = 'rgba(120,110,95,0.22)';
      ctx.fillRect(x, y, R, R);
      for (var k = 0; k < 7; k++) {
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,80,70,0.35)' : 'rgba(150,140,125,0.35)';
        circle(ctx, x + rnd() * R, y + rnd() * R, 0.6 + rnd() * 1.4); ctx.fill();
      }
    }
    return cv;
  };

  // ---------- dirt ----------
  var BRICK_COLS = [C.red, C.blue, C.yellow, C.bgreen, C.orange, C.white, C.azure, C.lime];
  A.drawDirt = function (ctx, d, x, y, T, t) {
    var k = d.kind, v = d.v || 0, s = d.wet ? T : T * 1.55;
    ctx.save();
    ctx.translate(x, y);
    switch (k) {
      case 'crumb':
        stud(ctx, 0, 0, s * 0.075, ['#C9A063', '#A9773F', '#E2C48C'][Math.floor(v * 3)]);
        stud(ctx, s * 0.1, s * 0.06, s * 0.05, '#C9A063');
        break;
      case 'cheerio':
        ctx.strokeStyle = '#B07A2A'; ctx.lineWidth = s * 0.055;
        circle(ctx, 1, 2, s * 0.07); ctx.stroke();
        ctx.strokeStyle = '#E8B55A';
        circle(ctx, 0, 0, s * 0.07); ctx.stroke();
        break;
      case 'brick':
        ctx.rotate(d.rot);
        var bc = BRICK_COLS[Math.floor(v * BRICK_COLS.length)];
        block(ctx, -s * 0.13, -s * 0.065, s * 0.26, s * 0.13, s * 0.07, bc, { r: 1.5, studs: s * 0.13, noShadow: 1 });
        break;
      case 'dust':
        ctx.fillStyle = 'rgba(120,120,125,0.55)';
        for (var i = 0; i < 5; i++) { circle(ctx, Math.cos(i * 1.3 + v * 6) * s * 0.06, Math.sin(i * 1.3 + v * 6) * s * 0.05, s * 0.07); ctx.fill(); }
        ctx.fillStyle = 'rgba(200,200,205,0.6)'; circle(ctx, -s * 0.02, -s * 0.02, s * 0.05); ctx.fill();
        break;
      case 'sand':
        ctx.fillStyle = '#C8A25E';
        for (var j = 0; j < 7; j++) { circle(ctx, Math.cos(j * 2.4 + v * 9) * s * 0.11 * ((j % 3) / 2 + 0.3), Math.sin(j * 2.4 + v * 9) * s * 0.1 * ((j % 3) / 2 + 0.3), s * 0.025); ctx.fill(); }
        break;
      case 'shell':
        ctx.rotate(d.rot);
        ctx.fillStyle = ['#F7C6CF', '#FBE3C8', C.white][Math.floor(v * 3) % 3];
        ctx.beginPath(); ctx.moveTo(0, s * 0.08); ctx.arc(0, s * 0.08, s * 0.14, Math.PI * 1.15, Math.PI * 1.85); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(180,100,90,0.6)'; ctx.lineWidth = 1;
        for (var r = -2; r <= 2; r++) { ctx.beginPath(); ctx.moveTo(0, s * 0.08); ctx.lineTo(Math.sin(r * 0.25) * s * 0.13, s * 0.08 - Math.cos(r * 0.25) * s * 0.13); ctx.stroke(); }
        break;
      case 'leaf':
        ctx.rotate(d.rot);
        ctx.fillStyle = v < 0.5 ? C.bgreen : C.orange;
        ellipse(ctx, 0, 0, s * 0.13, s * 0.06); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 0.12, 0); ctx.lineTo(s * 0.12, 0); ctx.stroke();
        break;
      case 'coin':
        stud(ctx, 0, 0, s * 0.09, C.gold);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.4 * Math.sin(t * 4 + v * 9)) + ')';
        A.star(ctx, -s * 0.03, -s * 0.04, s * 0.04, 4, 0.3); ctx.fill();
        break;
      case 'hay':
        ctx.rotate(d.rot);
        ctx.strokeStyle = '#E2BE4A'; ctx.lineWidth = s * 0.025; ctx.lineCap = 'round';
        for (var hh = -1; hh <= 1; hh++) { ctx.beginPath(); ctx.moveTo(-s * 0.13, hh * s * 0.03); ctx.lineTo(s * 0.13, hh * s * 0.04 + s * 0.02); ctx.stroke(); }
        break;
      case 'glitter':
        for (var g = 0; g < 4; g++) {
          ctx.fillStyle = [C.pink, C.lavender, C.yellow, C.azure][g];
          var tw = 0.6 + 0.4 * Math.sin(t * 5 + g * 2 + v * 10);
          A.star(ctx, Math.cos(g * 1.7 + v * 5) * s * 0.1, Math.sin(g * 1.7 + v * 5) * s * 0.09, s * 0.05 * tw, 4, 0.35); ctx.fill();
        }
        break;
      case 'puddle': case 'juice': case 'mud':
        var hp = Math.max(0.15, d.hp == null ? 1 : d.hp);
        var col = k === 'puddle' ? [90, 170, 235] : k === 'juice' ? [255, 150, 30] : [120, 80, 40];
        ctx.scale(hp, hp);
        ctx.rotate(d.rot);
        ctx.fillStyle = 'rgba(' + col.join(',') + ',0.55)';
        ctx.beginPath();
        for (var p = 0; p <= 10; p++) {
          var a = p / 10 * TAU, rr3 = s * (0.24 + 0.05 * Math.sin(a * 3 + v * 7));
          ctx.lineTo(Math.cos(a) * rr3, Math.sin(a) * rr3 * 0.8);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ellipse(ctx, -s * 0.08, -s * 0.07, s * 0.06, s * 0.025, -0.4); ctx.fill();
        break;
    }
    ctx.restore();
  };

  // ---------- toys (things Roxy gets stuck on) ----------
  A.drawToy = function (ctx, toy, x, y, T, t, wob) {
    var s = T;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(30,20,10,0.25)'; ellipse(ctx, s * 0.05, s * 0.08, s * 0.3, s * 0.22); ctx.fill();
    ctx.rotate(toy.rot * 0.3 + (wob || 0));
    switch (toy.kind) {
      case 'sock':
        ctx.fillStyle = C.white; rr(ctx, -s * 0.12, -s * 0.3, s * 0.24, s * 0.42, s * 0.08); ctx.fill();
        ellipse(ctx, s * 0.06, s * 0.12, s * 0.2, s * 0.12); ctx.fill();
        ctx.fillStyle = C.red; ctx.fillRect(-s * 0.12, -s * 0.22, s * 0.24, s * 0.06); ctx.fillRect(-s * 0.12, -s * 0.08, s * 0.24, s * 0.06);
        ctx.fillStyle = C.blue; ctx.fillRect(-s * 0.12, -s * 0.3, s * 0.24, s * 0.05);
        break;
      case 'teddy':
        ctx.fillStyle = '#A8693A';
        circle(ctx, -s * 0.15, -s * 0.2, s * 0.08); ctx.fill(); circle(ctx, s * 0.15, -s * 0.2, s * 0.08); ctx.fill();
        ellipse(ctx, 0, s * 0.12, s * 0.2, s * 0.18); ctx.fill();
        circle(ctx, 0, -s * 0.1, s * 0.17); ctx.fill();
        ctx.fillStyle = '#E7C08E'; ellipse(ctx, 0, -s * 0.05, s * 0.08, s * 0.06); ctx.fill(); ellipse(ctx, 0, s * 0.14, s * 0.1, s * 0.09); ctx.fill();
        ctx.fillStyle = C.black; circle(ctx, -s * 0.06, -s * 0.13, s * 0.025); ctx.fill(); circle(ctx, s * 0.06, -s * 0.13, s * 0.025); ctx.fill(); circle(ctx, 0, -s * 0.07, s * 0.025); ctx.fill();
        ctx.fillStyle = C.red; ctx.fillRect(-s * 0.08, s * 0.0, s * 0.16, s * 0.04);
        break;
      case 'car':
        ctx.fillStyle = C.black;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) { rr(ctx, p[0] * s * 0.16 - s * 0.05, p[1] * s * 0.12 - s * 0.04, s * 0.1, s * 0.08, 2); ctx.fill(); });
        block(ctx, -s * 0.22, -s * 0.13, s * 0.44, s * 0.26, s * 0.06, C.red, { noShadow: 1, r: s * 0.06 });
        ctx.fillStyle = '#9FD9F5'; rr(ctx, s * 0.02, -s * 0.16, s * 0.1, s * 0.2, 2); ctx.fill();
        stud(ctx, -s * 0.1, -s * 0.06, s * 0.05, C.red);
        break;
      case 'dino':
        ctx.fillStyle = C.bgreen;
        ctx.beginPath(); ctx.moveTo(-s * 0.15, 0); ctx.quadraticCurveTo(-s * 0.35, s * 0.08, -s * 0.38, -s * 0.05); ctx.quadraticCurveTo(-s * 0.3, s * 0.02, -s * 0.12, -s * 0.08); ctx.fill();
        ellipse(ctx, 0, 0, s * 0.18, s * 0.13); ctx.fill();
        circle(ctx, s * 0.2, -s * 0.06, s * 0.1); ctx.fill();
        ctx.fillStyle = C.yellow;
        for (var i = 0; i < 4; i++) { A.star(ctx, -s * 0.12 + i * s * 0.08, -s * 0.12, s * 0.035, 3, 0.4); ctx.fill(); }
        ctx.fillStyle = C.black; circle(ctx, s * 0.23, -s * 0.09, s * 0.02); ctx.fill();
        break;
      case 'ball':
        for (var w = 0; w < 6; w++) {
          ctx.fillStyle = [C.red, C.white, C.blue, C.white, C.yellow, C.white][w];
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.2, w / 6 * TAU + t * 0, (w + 1) / 6 * TAU); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; circle(ctx, -s * 0.06, -s * 0.07, s * 0.05); ctx.fill();
        break;
      case 'bucket':
        ctx.fillStyle = shade(C.blue, -0.2); circle(ctx, 0, 0, s * 0.2); ctx.fill();
        ctx.fillStyle = '#E3CF98'; circle(ctx, 0, 0, s * 0.15); ctx.fill();
        ctx.strokeStyle = C.yellow; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.arc(0, 0, s * 0.25, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
        ctx.fillStyle = C.red; rr(ctx, s * 0.12, -s * 0.28, s * 0.06, s * 0.2, 2); ctx.fill();
        break;
      case 'duck':
        ctx.fillStyle = C.yellow; ellipse(ctx, 0, s * 0.04, s * 0.2, s * 0.15); ctx.fill();
        circle(ctx, s * 0.12, -s * 0.08, s * 0.1); ctx.fill();
        ctx.fillStyle = C.orange; ellipse(ctx, s * 0.23, -s * 0.07, s * 0.06, s * 0.03); ctx.fill();
        ctx.fillStyle = C.black; circle(ctx, s * 0.14, -s * 0.11, s * 0.02); ctx.fill();
        break;
      case 'knight':
        ctx.fillStyle = C.red; rr(ctx, -s * 0.2, -s * 0.05, s * 0.4, s * 0.2, s * 0.06); ctx.fill();
        ctx.fillStyle = '#A0A5A9'; circle(ctx, 0, -s * 0.05, s * 0.13); ctx.fill();
        ctx.fillStyle = '#5F6A72'; ctx.fillRect(-s * 0.08, -s * 0.07, s * 0.16, s * 0.03);
        ctx.fillStyle = C.yellow; ellipse(ctx, 0, -s * 0.2, s * 0.03, s * 0.08); ctx.fill();
        ctx.fillStyle = '#D5DADD'; ctx.fillRect(s * 0.18, -s * 0.25, s * 0.04, s * 0.3);
        break;
      case 'horse':
        ctx.fillStyle = '#7A4A25'; ellipse(ctx, 0, 0, s * 0.22, s * 0.12); ctx.fill();
        ellipse(ctx, s * 0.24, -s * 0.06, s * 0.1, s * 0.07, -0.4); ctx.fill();
        ctx.fillStyle = C.black; ctx.fillRect(s * 0.02, -s * 0.13, s * 0.18, s * 0.04);
        ctx.fillStyle = C.white; circle(ctx, s * 0.28, -s * 0.09, s * 0.02); ctx.fill();
        ctx.strokeStyle = C.black; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.moveTo(-s * 0.22, 0); ctx.lineTo(-s * 0.32, s * 0.06); ctx.stroke();
        break;
    }
    ctx.restore();
  };

  // ---------- pets ----------
  A.drawPet = function (ctx, kind, x, y, a, T, t, mode) {
    var s = T;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(30,20,10,0.2)'; ellipse(ctx, s * 0.05, s * 0.08, s * 0.3, s * 0.2); ctx.fill();
    if (kind === 'dragon') {
      var flap = Math.sin(t * (mode === 'walk' ? 10 : 3)) * 0.35;
      ctx.rotate(a);
      ctx.fillStyle = shade(C.bgreen, -0.15);
      [-1, 1].forEach(function (side) {
        ctx.save(); ctx.scale(1, side); ctx.rotate(flap);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.05, s * 0.32); ctx.lineTo(-s * 0.18, s * 0.26); ctx.lineTo(-s * 0.2, s * 0.08); ctx.closePath(); ctx.fill();
        ctx.restore();
      });
      ctx.fillStyle = C.bgreen;
      ctx.beginPath(); ctx.moveTo(-s * 0.12, 0); ctx.quadraticCurveTo(-s * 0.3, Math.sin(t * 4) * s * 0.1, -s * 0.38, s * 0.04); ctx.lineTo(-s * 0.12, s * 0.05); ctx.fill();
      ellipse(ctx, 0, 0, s * 0.17, s * 0.12); ctx.fill();
      circle(ctx, s * 0.18, 0, s * 0.1); ctx.fill();
      ctx.fillStyle = C.yellow; ellipse(ctx, 0, 0, s * 0.1, s * 0.06); ctx.fill();
      ctx.fillStyle = C.white; A.star(ctx, s * 0.14, -s * 0.09, s * 0.035, 3); ctx.fill(); A.star(ctx, s * 0.14, s * 0.09, s * 0.035, 3); ctx.fill();
      ctx.fillStyle = C.black; circle(ctx, s * 0.22, -s * 0.04, s * 0.02); ctx.fill(); circle(ctx, s * 0.22, s * 0.04, s * 0.02); ctx.fill();
    } else {
      // tabby cat; curled up when resting
      if (mode === 'sit' || mode === 'ride') {
        ctx.fillStyle = C.orange; ellipse(ctx, 0, 0, s * 0.22, s * 0.18); ctx.fill();
        ctx.strokeStyle = C.orange; ctx.lineWidth = s * 0.07; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0.3, 1.9 + Math.sin(t * 2) * 0.1); ctx.stroke();
        ctx.fillStyle = shade(C.orange, -0.2);
        for (var i = 0; i < 3; i++) { ctx.fillRect(-s * 0.12 + i * s * 0.08, -s * 0.16, s * 0.03, s * 0.12); }
        ctx.fillStyle = C.orange; circle(ctx, s * 0.12, -s * 0.06, s * 0.12); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.03, -s * 0.12); ctx.lineTo(s * 0.06, -s * 0.24); ctx.lineTo(s * 0.12, -s * 0.15); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.14, -s * 0.16); ctx.lineTo(s * 0.22, -s * 0.24); ctx.lineTo(s * 0.23, -s * 0.11); ctx.fill();
        ctx.strokeStyle = C.black; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(s * 0.09, -s * 0.06, s * 0.025, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.16, -s * 0.06, s * 0.025, 0.2, Math.PI - 0.2); ctx.stroke();
      } else {
        ctx.rotate(a);
        ctx.strokeStyle = C.orange; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-s * 0.18, 0); ctx.quadraticCurveTo(-s * 0.32, Math.sin(t * 6) * s * 0.12, -s * 0.36, Math.sin(t * 6 + 1) * s * 0.1); ctx.stroke();
        ctx.fillStyle = C.orange; ellipse(ctx, 0, 0, s * 0.2, s * 0.11); ctx.fill();
        ctx.fillStyle = shade(C.orange, -0.2);
        for (var j = 0; j < 3; j++) ctx.fillRect(-s * 0.12 + j * s * 0.07, -s * 0.1, s * 0.03, s * 0.2);
        ctx.fillStyle = C.orange; circle(ctx, s * 0.2, 0, s * 0.1); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.08); ctx.lineTo(s * 0.3, -s * 0.12); ctx.lineTo(s * 0.24, -s * 0.02); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.08); ctx.lineTo(s * 0.3, s * 0.12); ctx.lineTo(s * 0.24, s * 0.02); ctx.fill();
        ctx.fillStyle = '#7ad46a'; circle(ctx, s * 0.25, -s * 0.035, s * 0.02); ctx.fill(); circle(ctx, s * 0.25, s * 0.035, s * 0.02); ctx.fill();
      }
    }
    ctx.restore();
  };

  // ---------- Roxy ----------
  A.COLORS = [
    { id: 'white', name: 'Snow', body: '#EEF1F3' },
    { id: 'black', name: 'Night', body: '#2A3138' },
    { id: 'red', name: 'Cherry', body: C.red },
    { id: 'pink', name: 'Bubblegum', body: '#F785B1' },
    { id: 'purple', name: 'Grape', body: '#9B59D0' },
    { id: 'blue', name: 'Ocean', body: C.blue },
    { id: 'azure', name: 'Sky', body: C.azure },
    { id: 'green', name: 'Leaf', body: C.bgreen },
    { id: 'lime', name: 'Lime', body: '#A5D610' },
    { id: 'yellow', name: 'Sunny', body: C.yellow },
    { id: 'orange', name: 'Tiger', body: C.orange },
    { id: 'gold', name: 'Gold', body: '#E3B43A', stars: 8 },
    { id: 'rainbow', name: 'Rainbow', body: '#ff0000', stars: 12 }
  ];
  A.HATS = [
    { id: 'none', name: 'No hat' }, { id: 'party', name: 'Party' }, { id: 'propeller', name: 'Propeller' },
    { id: 'bow', name: 'Bow' }, { id: 'bunny', name: 'Bunny' }, { id: 'cowboy', name: 'Cowboy' },
    { id: 'tophat', name: 'Top Hat' }, { id: 'chef', name: 'Chef' }, { id: 'pirate', name: 'Pirate' },
    { id: 'flower', name: 'Flower' }, { id: 'viking', name: 'Viking' }, { id: 'crown', name: 'Crown', stars: 3 },
    { id: 'wizard', name: 'Wizard', stars: 6 }, { id: 'unicorn', name: 'Unicorn', stars: 10 }
  ];
  A.FACES = [
    { id: 'happy', name: 'Happy' }, { id: 'googly', name: 'Googly' }, { id: 'hearts', name: 'Love' },
    { id: 'stars', name: 'Starry' }, { id: 'cool', name: 'Cool' }, { id: 'cat', name: 'Kitty' }, { id: 'sleepy', name: 'Sweet' }
  ];
  A.TRAILS = [
    { id: 'none', name: 'None' }, { id: 'bubbles', name: 'Bubbles' }, { id: 'sparkles', name: 'Sparkles' },
    { id: 'hearts', name: 'Hearts' }, { id: 'stars', name: 'Stars' }, { id: 'notes', name: 'Music' }, { id: 'rainbow', name: 'Rainbow', stars: 14 }
  ];

  A.bodyColor = function (look, t) {
    if (look.color === 'rainbow') return 'hsl(' + ((t * 60) % 360) + ',85%,58%)';
    var c = A.COLORS.find(function (o) { return o.id === look.color; });
    return c ? c.body : '#EEF1F3';
  };

  // Roxy at (x,y) with radius R (pixels). st: {a, t, brush, mood, mop}
  A.drawRoxy = function (ctx, x, y, R, look, st) {
    var t = st.t || 0, a = st.a || 0;
    var body = A.bodyColor(look, t), solid = body.charAt(0) === '#';
    var h = R * 0.28;
    var dark = solid ? shade(body, -0.32) : 'rgba(0,0,0,0.25)';
    ctx.save();
    // shadow
    ctx.fillStyle = 'rgba(25,15,5,0.28)'; ellipse(ctx, x + R * 0.14, y + R * 0.18, R * 1.04, R * 0.98); ctx.fill();
    // side brushes spin under the front edge
    for (var s = -1; s <= 1; s += 2) {
      var ba = a + s * 0.85, bx = x + Math.cos(ba) * R * 0.86, by = y + Math.sin(ba) * R * 0.86;
      ctx.strokeStyle = 'rgba(70,70,70,0.75)'; ctx.lineWidth = Math.max(1, R * 0.05);
      for (var k = 0; k < 3; k++) {
        var aa = (st.brush || 0) * s + k * TAU / 3;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(aa) * R * 0.32, by + Math.sin(aa) * R * 0.32); ctx.stroke();
      }
      ctx.fillStyle = '#4a4f55'; circle(ctx, bx, by, R * 0.07); ctx.fill();
    }
    // body side (a short cylinder)
    if (!solid) { ctx.fillStyle = body; circle(ctx, x, y, R); ctx.fill(); }
    ctx.fillStyle = dark; circle(ctx, x, y, R); ctx.fill();
    ctx.fillRect(x - R, y - h, R * 2, h);
    // top
    ctx.fillStyle = body; circle(ctx, x, y - h, R); ctx.fill();
    var g = ctx.createRadialGradient(x - R * 0.4, y - h - R * 0.45, R * 0.1, x, y - h, R);
    g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g; circle(ctx, x, y - h, R); ctx.fill();
    // front bumper (shows which way she's going)
    ctx.strokeStyle = '#3a4047'; ctx.lineWidth = R * 0.15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - h, R * 0.9, a - 1.05, a + 1.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = R * 0.04;
    ctx.beginPath(); ctx.arc(x, y - h, R * 0.97, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    // little stud power button
    var glow = st.mood === 'done' ? '#62F07A' : (st.turbo ? '#FFD23F' : '#62D0F0');
    stud(ctx, x, y - h + R * 0.62, R * 0.11, glow);
    // face screen
    var fw = R * 1.08, fh = R * 0.6, fx = x - fw / 2, fy = y - h - R * 0.32;
    ctx.fillStyle = '#1C232C'; rr(ctx, fx, fy, fw, fh, fh * 0.42); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, fx + fw * 0.08, fy + fh * 0.1, fw * 0.5, fh * 0.18, fh * 0.1); ctx.fill();
    drawFace(ctx, x, fy + fh / 2, R, look.face, st);
    if (st.mop) {
      ctx.fillStyle = 'rgba(120,200,255,0.5)';
      for (var m = 0; m < 3; m++) { circle(ctx, x - Math.cos(a) * R * 1.05 + Math.sin(a) * (m - 1) * R * 0.35, y - Math.sin(a) * R * 1.05 - Math.cos(a) * (m - 1) * R * 0.35, R * 0.1); ctx.fill(); }
    }
    drawHat(ctx, x, y - h - R * 0.55, R, look.hat, t, look);
    ctx.restore();
  };

  function drawFace(ctx, cx, cy, R, face, st) {
    var a = st.a || 0, t = st.t || 0;
    var lx = Math.cos(a) * R * 0.07, ly = Math.sin(a) * R * 0.05;
    var ex = R * 0.24, cyan = '#7FE8FF';
    var blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    var mood = st.mood;
    ctx.save();
    ctx.lineCap = 'round';
    if (mood === 'stuck') {
      ctx.strokeStyle = '#FF8A7A'; ctx.lineWidth = R * 0.07;
      for (var i = -1; i <= 1; i += 2) { circle(ctx, cx + i * ex, cy - R * 0.02, R * 0.1); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(cx, cy + R * 0.2, R * 0.06, 0, TAU); ctx.stroke();
      ctx.restore(); return;
    }
    if (mood === 'done' || mood === 'happy' || face === 'sleepy') {
      ctx.strokeStyle = face === 'hearts' ? '#FF7FB0' : cyan; ctx.lineWidth = R * 0.08;
      for (var j = -1; j <= 1; j += 2) { ctx.beginPath(); ctx.arc(cx + j * ex, cy + R * 0.02, R * 0.1, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,120,160,0.6)';
      ellipse(ctx, cx - R * 0.42, cy + R * 0.12, R * 0.08, R * 0.05); ctx.fill();
      ellipse(ctx, cx + R * 0.42, cy + R * 0.12, R * 0.08, R * 0.05); ctx.fill();
      if (face === 'sleepy' && mood !== 'done') {
        ctx.strokeStyle = cyan; ctx.lineWidth = R * 0.03;
        for (var e = -1; e <= 1; e += 2) for (var l = 0; l < 2; l++) { ctx.beginPath(); ctx.moveTo(cx + e * (ex + R * 0.08), cy - R * 0.02); ctx.lineTo(cx + e * (ex + R * 0.14), cy - R * 0.08 + l * R * 0.05); ctx.stroke(); }
      }
      ctx.strokeStyle = cyan; ctx.lineWidth = R * 0.05;
      ctx.beginPath(); ctx.arc(cx, cy + R * 0.12, R * 0.08, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.restore(); return;
    }
    switch (face) {
      case 'googly':
        for (var g = -1; g <= 1; g += 2) {
          ctx.fillStyle = C.white; circle(ctx, cx + g * ex, cy, R * 0.15); ctx.fill();
          ctx.fillStyle = C.black; circle(ctx, cx + g * ex + lx * 1.2, cy + ly * 1.2, R * 0.07 * blink + R * 0.01); ctx.fill();
        }
        break;
      case 'hearts':
        ctx.fillStyle = '#FF6FA8';
        var pulse = 1 + Math.sin(t * 6) * 0.1;
        for (var hh = -1; hh <= 1; hh += 2) { A.heart(ctx, cx + hh * ex + lx, cy + R * 0.02 + ly, R * 0.15 * pulse); ctx.fill(); }
        break;
      case 'stars':
        ctx.fillStyle = '#FFE066';
        for (var ss = -1; ss <= 1; ss += 2) { ctx.save(); ctx.translate(cx + ss * ex + lx, cy + ly); ctx.rotate(t * 1.5); A.star(ctx, 0, 0, R * 0.15, 5, 0.45); ctx.fill(); ctx.restore(); }
        break;
      case 'cool':
        ctx.fillStyle = '#0b0f14';
        rr(ctx, cx - R * 0.48, cy - R * 0.13, R * 0.42, R * 0.24, R * 0.08); ctx.fill();
        rr(ctx, cx + R * 0.06, cy - R * 0.13, R * 0.42, R * 0.24, R * 0.08); ctx.fill();
        ctx.fillStyle = '#7FE8FF'; ctx.fillRect(cx - R * 0.08, cy - R * 0.09, R * 0.16, R * 0.03);
        ctx.fillStyle = 'rgba(127,232,255,0.6)';
        ctx.fillRect(cx - R * 0.42, cy - R * 0.1, R * 0.08, R * 0.04); ctx.fillRect(cx + R * 0.12, cy - R * 0.1, R * 0.08, R * 0.04);
        ctx.strokeStyle = cyan; ctx.lineWidth = R * 0.05;
        ctx.beginPath(); ctx.moveTo(cx - R * 0.06, cy + R * 0.2); ctx.quadraticCurveTo(cx + R * 0.05, cy + R * 0.24, cx + R * 0.14, cy + R * 0.15); ctx.stroke();
        break;
      case 'cat':
        ctx.fillStyle = '#B8FF7A';
        for (var c2 = -1; c2 <= 1; c2 += 2) { ellipse(ctx, cx + c2 * ex + lx, cy - R * 0.02 + ly, R * 0.09, R * 0.13 * blink); ctx.fill(); }
        ctx.strokeStyle = cyan; ctx.lineWidth = R * 0.04;
        ctx.beginPath(); ctx.arc(cx - R * 0.05, cy + R * 0.14, R * 0.05, 0.1, Math.PI - 0.1); ctx.arc(cx + R * 0.05, cy + R * 0.14, R * 0.05, 0.1, Math.PI - 0.1); ctx.stroke();
        ctx.lineWidth = R * 0.02;
        for (var wk = -1; wk <= 1; wk += 2) { ctx.beginPath(); ctx.moveTo(cx + wk * R * 0.32, cy + R * 0.1); ctx.lineTo(cx + wk * R * 0.5, cy + R * 0.06); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + wk * R * 0.32, cy + R * 0.16); ctx.lineTo(cx + wk * R * 0.5, cy + R * 0.18); ctx.stroke(); }
        break;
      default:
        ctx.fillStyle = cyan;
        for (var p = -1; p <= 1; p += 2) { rr(ctx, cx + p * ex - R * 0.07 + lx, cy - R * 0.14 * blink + ly, R * 0.14, R * 0.26 * blink, R * 0.07 * blink); ctx.fill(); }
        ctx.strokeStyle = cyan; ctx.lineWidth = R * 0.045;
        ctx.beginPath(); ctx.arc(cx + lx * 0.5, cy + R * 0.12, R * 0.07, 0.25, Math.PI - 0.25); ctx.stroke();
    }
    ctx.restore();
  }

  // Hats stand upright on top of Roxy. (x,y) = where the hat sits, R = Roxy radius
  function drawHat(ctx, x, y, R, hat, t, look) {
    if (!hat || hat === 'none') return;
    var s = R;
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    switch (hat) {
      case 'party':
        ctx.fillStyle = C.mblue;
        ctx.beginPath(); ctx.moveTo(-s * 0.32, 0); ctx.lineTo(0, -s * 0.85); ctx.lineTo(s * 0.32, 0); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.clip();
        ctx.fillStyle = C.yellow;
        for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-s, -s * 0.15 - i * s * 0.22); ctx.lineTo(s, -s * 0.35 - i * s * 0.22); ctx.lineTo(s, -s * 0.27 - i * s * 0.22); ctx.lineTo(-s, -s * 0.07 - i * s * 0.22); ctx.fill(); }
        ctx.restore();
        ctx.fillStyle = C.pink; circle(ctx, 0, -s * 0.88, s * 0.12); ctx.fill();
        ctx.fillStyle = C.red; ellipse(ctx, 0, 0, s * 0.36, s * 0.08); ctx.fill();
        break;
      case 'propeller':
        ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(0, 0, s * 0.38, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.yellow; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.38, Math.PI * 1.33, Math.PI * 1.66); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.38, Math.PI, Math.PI * 1.33); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.bgreen; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, s * 0.38, Math.PI * 1.66, Math.PI * 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.dgray; ctx.fillRect(-s * 0.025, -s * 0.52, s * 0.05, s * 0.16);
        var spin = Math.cos(t * 14);
        ctx.fillStyle = C.yellow; ellipse(ctx, 0, -s * 0.52, s * 0.42 * Math.abs(spin) + s * 0.04, s * 0.06); ctx.fill();
        ctx.fillStyle = C.red; circle(ctx, 0, -s * 0.53, s * 0.05); ctx.fill();
        break;
      case 'bow':
        ctx.fillStyle = C.dpink;
        ctx.beginPath(); ctx.moveTo(0, -s * 0.15); ctx.lineTo(-s * 0.42, -s * 0.38); ctx.lineTo(-s * 0.42, s * 0.05); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -s * 0.15); ctx.lineTo(s * 0.42, -s * 0.38); ctx.lineTo(s * 0.42, s * 0.05); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.pink; circle(ctx, 0, -s * 0.15, s * 0.12); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; circle(ctx, -s * 0.28, -s * 0.2, s * 0.05); ctx.fill(); circle(ctx, s * 0.28, -s * 0.2, s * 0.05); ctx.fill();
        break;
      case 'bunny':
        for (var b = -1; b <= 1; b += 2) {
          ctx.save(); ctx.translate(b * s * 0.2, 0); ctx.rotate(b * 0.18 + Math.sin(t * 3 + b) * 0.05);
          ctx.fillStyle = C.white; ellipse(ctx, 0, -s * 0.42, s * 0.13, s * 0.42); ctx.fill();
          ctx.fillStyle = C.pink; ellipse(ctx, 0, -s * 0.42, s * 0.06, s * 0.3); ctx.fill();
          ctx.restore();
        }
        break;
      case 'cowboy':
        ctx.fillStyle = '#7A4A25'; ellipse(ctx, 0, 0, s * 0.62, s * 0.14); ctx.fill();
        ctx.fillStyle = '#93602F';
        ctx.beginPath(); ctx.moveTo(-s * 0.3, 0); ctx.quadraticCurveTo(-s * 0.32, -s * 0.48, -s * 0.12, -s * 0.44); ctx.quadraticCurveTo(0, -s * 0.36, s * 0.12, -s * 0.44); ctx.quadraticCurveTo(s * 0.32, -s * 0.48, s * 0.3, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.red; ctx.fillRect(-s * 0.3, -s * 0.12, s * 0.6, s * 0.08);
        ctx.fillStyle = C.yellow; A.star(ctx, 0, -s * 0.08, s * 0.07); ctx.fill();
        break;
      case 'tophat':
        ctx.fillStyle = '#20262c'; ellipse(ctx, 0, 0, s * 0.48, s * 0.11); ctx.fill();
        rr(ctx, -s * 0.28, -s * 0.62, s * 0.56, s * 0.62, s * 0.04); ctx.fill();
        ctx.fillStyle = '#353d45'; ellipse(ctx, 0, -s * 0.62, s * 0.28, s * 0.07); ctx.fill();
        ctx.fillStyle = C.red; ctx.fillRect(-s * 0.28, -s * 0.18, s * 0.56, s * 0.1);
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-s * 0.22, -s * 0.58, s * 0.06, s * 0.36);
        break;
      case 'chef':
        ctx.fillStyle = C.white; rr(ctx, -s * 0.3, -s * 0.22, s * 0.6, s * 0.24, s * 0.04); ctx.fill();
        ctx.fillStyle = '#dfe4e8'; ctx.fillRect(-s * 0.3, -s * 0.04, s * 0.6, s * 0.05);
        ctx.fillStyle = C.white;
        circle(ctx, -s * 0.2, -s * 0.42, s * 0.2); ctx.fill(); circle(ctx, s * 0.2, -s * 0.42, s * 0.2); ctx.fill(); circle(ctx, 0, -s * 0.55, s * 0.24); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.06)'; circle(ctx, s * 0.08, -s * 0.48, s * 0.12); ctx.fill();
        break;
      case 'pirate':
        ctx.fillStyle = '#1d2024';
        ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.02); ctx.quadraticCurveTo(-s * 0.45, -s * 0.5, 0, -s * 0.55); ctx.quadraticCurveTo(s * 0.45, -s * 0.5, s * 0.55, -s * 0.02); ctx.quadraticCurveTo(0, -s * 0.18, -s * 0.55, -s * 0.02); ctx.fill();
        ctx.strokeStyle = C.gold; ctx.lineWidth = s * 0.04; ctx.stroke();
        ctx.fillStyle = C.white; circle(ctx, 0, -s * 0.32, s * 0.09); ctx.fill();
        ctx.fillStyle = '#1d2024'; circle(ctx, -s * 0.03, -s * 0.33, s * 0.02); ctx.fill(); circle(ctx, s * 0.03, -s * 0.33, s * 0.02); ctx.fill();
        break;
      case 'flower':
        ctx.strokeStyle = C.bgreen; ctx.lineWidth = s * 0.06;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.1, -s * 0.2, 0, -s * 0.38); ctx.stroke();
        ctx.fillStyle = C.bgreen; ellipse(ctx, s * 0.12, -s * 0.15, s * 0.1, s * 0.05, -0.5); ctx.fill();
        for (var p = 0; p < 6; p++) { ctx.fillStyle = C.white; ellipse(ctx, Math.cos(p / 6 * TAU + t * 0.5) * s * 0.17, -s * 0.5 + Math.sin(p / 6 * TAU + t * 0.5) * s * 0.17, s * 0.12, s * 0.08, p / 6 * TAU + t * 0.5); ctx.fill(); }
        ctx.fillStyle = C.yellow; circle(ctx, 0, -s * 0.5, s * 0.1); ctx.fill();
        break;
      case 'viking':
        ctx.fillStyle = '#F2E6C9';
        for (var v = -1; v <= 1; v += 2) {
          ctx.beginPath(); ctx.moveTo(v * s * 0.3, -s * 0.2); ctx.quadraticCurveTo(v * s * 0.62, -s * 0.25, v * s * 0.55, -s * 0.7); ctx.quadraticCurveTo(v * s * 0.45, -s * 0.35, v * s * 0.25, -s * 0.05); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#9BA3A8'; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7d858a'; ctx.fillRect(-s * 0.36, -s * 0.06, s * 0.72, s * 0.07); ctx.fillRect(-s * 0.03, -s * 0.36, s * 0.06, s * 0.3);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ellipse(ctx, -s * 0.15, -s * 0.22, s * 0.07, s * 0.04, -0.6); ctx.fill();
        break;
      case 'crown':
        ctx.fillStyle = '#F2C230';
        ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.lineTo(-s * 0.42, -s * 0.42); ctx.lineTo(-s * 0.2, -s * 0.22); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.2, -s * 0.22); ctx.lineTo(s * 0.42, -s * 0.42); ctx.lineTo(s * 0.4, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#C99A16'; ctx.fillRect(-s * 0.4, -s * 0.1, s * 0.8, s * 0.1);
        ctx.fillStyle = C.red; circle(ctx, 0, -s * 0.2, s * 0.07); ctx.fill();
        ctx.fillStyle = C.blue; circle(ctx, -s * 0.24, -s * 0.12, s * 0.045); ctx.fill(); circle(ctx, s * 0.24, -s * 0.12, s * 0.045); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * Math.sin(t * 4)) + ')'; A.star(ctx, s * 0.3, -s * 0.38, s * 0.06, 4, 0.3); ctx.fill();
        break;
      case 'wizard':
        ctx.fillStyle = '#3B3FB6'; ellipse(ctx, 0, 0, s * 0.55, s * 0.13); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 0.32, 0); ctx.quadraticCurveTo(-s * 0.1, -s * 0.5, s * 0.05, -s * 0.85); ctx.quadraticCurveTo(s * 0.25, -s * 0.9, s * 0.35, -s * 0.75); ctx.quadraticCurveTo(s * 0.15, -s * 0.72, s * 0.32, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.yellow;
        A.star(ctx, -s * 0.05, -s * 0.25, s * 0.08); ctx.fill(); A.star(ctx, s * 0.12, -s * 0.5, s * 0.06); ctx.fill();
        ctx.fillStyle = C.white; circle(ctx, s * 0.36, -s * 0.75, s * 0.05); ctx.fill();
        break;
      case 'unicorn':
        ctx.fillStyle = C.white;
        ctx.beginPath(); ctx.moveTo(-s * 0.36, 0); ctx.lineTo(-s * 0.3, -s * 0.28); ctx.lineTo(-s * 0.16, -s * 0.06); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.36, 0); ctx.lineTo(s * 0.3, -s * 0.28); ctx.lineTo(s * 0.16, -s * 0.06); ctx.fill();
        var hg = ctx.createLinearGradient(0, 0, 0, -s * 0.8);
        hg.addColorStop(0, '#F7C64B'); hg.addColorStop(1, '#FFF2B0');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.moveTo(-s * 0.12, -s * 0.02); ctx.lineTo(0, -s * 0.82); ctx.lineTo(s * 0.12, -s * 0.02); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#D9A42A'; ctx.lineWidth = s * 0.03;
        for (var u = 1; u < 4; u++) { ctx.beginPath(); ctx.moveTo(-s * 0.12 * (1 - u / 4.5), -s * 0.2 * u + s * 0.05); ctx.lineTo(s * 0.12 * (1 - u / 4.5), -s * 0.2 * u - s * 0.03); ctx.stroke(); }
        [C.pink, C.lavender, C.azure].forEach(function (c, k) { ctx.fillStyle = c; circle(ctx, -s * 0.2 + k * s * 0.2, s * 0.02, s * 0.09); ctx.fill(); });
        break;
    }
    ctx.restore();
  }
  A.drawHat = drawHat;

  // ---------- particles ----------
  A.drawParticle = function (ctx, p, T) {
    var a = Math.max(0, Math.min(1, p.life / p.max * 1.4));
    var x = p.x * T, y = p.y * T, s = p.size * T;
    ctx.globalAlpha = a;
    switch (p.kind) {
      case 'bubble':
        ctx.strokeStyle = 'rgba(120,200,255,0.9)'; ctx.lineWidth = Math.max(1, s * 0.15);
        circle(ctx, x, y, s); ctx.stroke();
        ctx.fillStyle = 'rgba(200,240,255,0.35)'; circle(ctx, x, y, s); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; circle(ctx, x - s * 0.35, y - s * 0.35, s * 0.25); ctx.fill();
        break;
      case 'sparkle':
        ctx.fillStyle = p.color || '#FFE066';
        A.star(ctx, x, y, s, 4, 0.3); ctx.fill();
        break;
      case 'star':
        ctx.fillStyle = p.color || C.yellow;
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot || 0); A.star(ctx, 0, 0, s, 5, 0.45); ctx.fill(); ctx.restore();
        break;
      case 'heart':
        ctx.fillStyle = p.color || '#FF6FA8';
        A.heart(ctx, x, y, s); ctx.fill();
        break;
      case 'note':
        ctx.fillStyle = p.color || C.purple;
        ellipse(ctx, x, y, s * 0.5, s * 0.38, -0.4); ctx.fill();
        ctx.fillRect(x + s * 0.38, y - s * 1.4, Math.max(1, s * 0.16), s * 1.4);
        ctx.fillRect(x + s * 0.38, y - s * 1.4, s * 0.6, Math.max(1, s * 0.2));
        break;
      case 'rainbow':
        ctx.fillStyle = p.color; circle(ctx, x, y, s); ctx.fill();
        break;
      case 'drop':
        ctx.fillStyle = 'rgba(110,190,255,0.8)'; circle(ctx, x, y, s); ctx.fill();
        break;
      case 'puff':
        ctx.fillStyle = 'rgba(255,255,255,0.75)'; circle(ctx, x, y, s); ctx.fill();
        break;
      case 'brick':
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot || 0);
        block(ctx, -s, -s * 0.5, s * 2, s, s * 0.5, p.color, { noShadow: 1, r: 1.5, studs: s });
        ctx.restore();
        break;
      case 'text':
        ctx.font = '700 ' + Math.round(s) + 'px Fredoka, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, s * 0.22); ctx.strokeStyle = 'rgba(40,30,60,0.85)'; ctx.lineJoin = 'round';
        ctx.strokeText(p.text, x, y);
        ctx.fillStyle = p.color || '#fff'; ctx.fillText(p.text, x, y);
        break;
    }
    ctx.globalAlpha = 1;
  };
})();
