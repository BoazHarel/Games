/* Roxy's Big Clean: art for the farm, school and space station, plus extra hats. */
(function () {
  var RX = globalThis.RX, A = RX.Art, C = RX.C, F = A.FURN;
  var TAU = Math.PI * 2;
  var block = A.block, stud = A.stud, rr = A.rr, circle = A.circle, ellipse = A.ellipse, shade = A.shade, hash = A.hash;

  // ---------- furniture ----------
  F.fireplace = [0.62, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.05, y + T * 0.02, w - T * 0.1, h - T * 0.04, hp, '#B5452B', { r: 3 });
    var top = y + T * 0.02 - hp;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (var r = 0; r < h / (T * 0.25); r++) ctx.fillRect(x + T * 0.05, top + r * T * 0.25, w - T * 0.1, 1);
    // the fire inside
    var fx = x + w / 2, fy = top + (h - T * 0.04) / 2;
    ctx.fillStyle = '#2b1d16'; rr(ctx, fx - T * 0.28, fy - T * 0.5, T * 0.56, T, T * 0.12); ctx.fill();
    ctx.fillStyle = 'rgba(255,160,40,0.35)'; circle(ctx, fx, fy, T * 0.45); ctx.fill();
    ctx.fillStyle = '#7A4A25'; ctx.save(); ctx.translate(fx, fy + T * 0.1); ctx.rotate(0.5); ctx.fillRect(-T * 0.22, -T * 0.05, T * 0.44, T * 0.1); ctx.rotate(-1); ctx.fillRect(-T * 0.22, -T * 0.05, T * 0.44, T * 0.1); ctx.restore();
    ctx.fillStyle = '#FF7A1A'; A.star(ctx, fx, fy - T * 0.05, T * 0.2, 5, 0.5); ctx.fill();
    ctx.fillStyle = '#FFD23F'; A.star(ctx, fx, fy - T * 0.03, T * 0.11, 5, 0.5); ctx.fill();
  }];
  F.hay = [0.42, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.06, y + T * 0.12, w - T * 0.12, h - T * 0.24, hp, '#E8C35A', { r: T * 0.08 });
    var top = y + T * 0.12 - hp, bw = w - T * 0.12, bh = h - T * 0.24;
    ctx.strokeStyle = 'rgba(150,110,30,0.55)'; ctx.lineWidth = 1;
    for (var i = 0; i < 9; i++) { var yy = top + bh * hash(i, f.x || 0, f.y || 0); ctx.beginPath(); ctx.moveTo(x + T * 0.1, yy); ctx.lineTo(x + T * 0.06 + bw * (0.5 + 0.4 * hash(f.y || 0, i)), yy + T * 0.04); ctx.stroke(); }
    ctx.fillStyle = '#9C6B2C';
    ctx.fillRect(x + T * 0.06 + bw * 0.28, top, T * 0.05, bh + hp); ctx.fillRect(x + T * 0.06 + bw * 0.68, top, T * 0.05, bh + hp);
  }];
  F.chalkboard = [0.55, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x, y + T * 0.05, w, T * 0.35, hp, C.nougat, { r: 3 });
    var top = y + T * 0.05 - hp;
    ctx.fillStyle = '#2E5E46'; rr(ctx, x + T * 0.08, top + T * 0.05, w - T * 0.16, T * 0.25, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 ' + Math.round(T * 0.18) + 'px Fredoka, sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('A B C  1 2 3', x + T * 0.2, top + T * 0.18);
    ctx.strokeStyle = '#FFE066'; ctx.lineWidth = 1.5; circle(ctx, x + w - T * 0.4, top + T * 0.18, T * 0.06); ctx.stroke();
    ctx.fillStyle = C.white; ctx.fillRect(x + w * 0.5, top + T * 0.33, T * 0.12, T * 0.04);
  }];
  F.schooldesk = [0.3, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.28, y + T * 0.66, T * 0.44, T * 0.26, hp * 0.6, C.red, { r: T * 0.06 });
    block(ctx, x + T * 0.12, y + T * 0.12, w - T * 0.24, T * 0.48, hp, C.tan, { gloss: 1 });
    var top = y + T * 0.12 - hp;
    ctx.fillStyle = C.white; ctx.save(); ctx.translate(x + w * 0.42, top + T * 0.24); ctx.rotate(-0.2); ctx.fillRect(-T * 0.14, -T * 0.1, T * 0.28, T * 0.2); ctx.restore();
    ctx.fillStyle = C.yellow; ctx.save(); ctx.translate(x + w * 0.72, top + T * 0.24); ctx.rotate(0.6); ctx.fillRect(-T * 0.02, -T * 0.12, T * 0.045, T * 0.24); ctx.restore();
  }];
  F.easel = [0.75, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    ctx.strokeStyle = '#8C5A2B'; ctx.lineWidth = T * 0.05; ctx.lineCap = 'round';
    [[-0.3, 0.3], [0.3, 0.3], [0, -0.3]].forEach(function (l) { ctx.beginPath(); ctx.moveTo(cx, cy - hp * 0.6); ctx.lineTo(cx + l[0] * T, cy + l[1] * T); ctx.stroke(); });
    var top = cy - hp;
    ctx.fillStyle = C.white; rr(ctx, cx - T * 0.32, top - T * 0.1, T * 0.64, T * 0.48, 2); ctx.fill();
    [[C.red, -0.12, 0.05], [C.blue, 0.1, 0.12], [C.yellow, 0.02, 0.25], [C.bgreen, -0.15, 0.25]].forEach(function (b) { ctx.fillStyle = b[0]; circle(ctx, cx + b[1] * T, top + b[2] * T, T * 0.08); ctx.fill(); });
  }];
  F.locker = [0.8, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + 1, y + T * 0.08, w - 2, h - T * 0.4, hp, C.mblue, { r: 2 });
    var n = f.w * 2;
    for (var i = 0; i < n; i++) {
      var lx = x + 1 + i * (w - 2) / n;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(lx, y + T * 0.08 - hp, 1, h - T * 0.4 + hp);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var v = 0; v < 3; v++) ctx.fillRect(lx + T * 0.08, y + h - T * 0.32 - hp * (0.85 - v * 0.08), T * 0.3, 1.5);
      ctx.fillStyle = '#C9CED2'; ctx.fillRect(lx + (w - 2) / n - T * 0.1, y + h - T * 0.32 - hp * 0.45, T * 0.04, hp * 0.15);
    }
  }];
  F.hoop = [0.95, function (ctx, x, y, w, h, hp, f, T) {
    var cx = x + w / 2, cy = y + h / 2;
    block(ctx, cx - T * 0.18, cy - T * 0.18, T * 0.36, T * 0.36, hp * 0.2, C.dgray, { r: T * 0.1 });
    ctx.fillStyle = C.dgray; ctx.fillRect(cx - T * 0.04, cy - hp, T * 0.08, hp);
    var top = cy - hp;
    ctx.fillStyle = C.white; rr(ctx, cx - T * 0.38, top - T * 0.28, T * 0.76, T * 0.4, 3); ctx.fill();
    ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.strokeRect(cx - T * 0.14, top - T * 0.14, T * 0.28, T * 0.2);
    ctx.strokeStyle = C.orange; ctx.lineWidth = T * 0.05; ellipse(ctx, cx, top + T * 0.2, T * 0.18, T * 0.08); ctx.stroke();
  }];
  F.console = [0.45, function (ctx, x, y, w, h, hp, f, T) {
    block(ctx, x + T * 0.04, y + T * 0.08, w - T * 0.08, h - T * 0.16, hp, '#3A434C', { r: 4, gloss: 1 });
    var top = y + T * 0.08 - hp, n = Math.max(f.w, f.h);
    var cols = ['#62F07A', '#FF5A5A', '#FFD23F', '#3FA7FF'];
    for (var i = 0; i < n; i++) {
      var horiz = f.w >= f.h;
      var cx = horiz ? x + (i + 0.5) * T : x + w / 2, cy = horiz ? top + (h - T * 0.16) / 2 : top + (i + 0.5) * T - T * 0.08;
      ctx.fillStyle = '#7FE8FF'; rr(ctx, cx - T * 0.3, cy - T * 0.3, T * 0.32, T * 0.24, 2); ctx.fill();
      ctx.strokeStyle = 'rgba(20,90,120,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - T * 0.27, cy - T * 0.17); for (var k = 0; k < 5; k++) ctx.lineTo(cx - T * 0.27 + k * T * 0.06, cy - T * 0.17 + Math.sin(k * 1.7 + i) * T * 0.06); ctx.stroke();
      for (var b = 0; b < 3; b++) { ctx.fillStyle = cols[(i + b) % 4]; circle(ctx, cx + T * 0.12 + (b % 2) * T * 0.1, cy - T * 0.22 + b * T * 0.12, T * 0.045); ctx.fill(); }
    }
  }];

  // ---------- outdoors ----------
  A.extraDecor.outside = function (ctx, L, x, y, T) {
    if (L.def.outside !== 'space') return false;
    var px = x * T, py = y * T;
    ctx.fillStyle = '#161A3A'; ctx.fillRect(px, py, T, T);
    for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) stud(ctx, px + T / 2 * (i + 0.5), py + T / 2 * (j + 0.5) - T * 0.02, T * 0.12, '#1E2350');
    for (var k = 0; k < 3; k++) {
      if (hash(x, y, k + 11) < 0.45) {
        var sx = px + hash(x, y, k + 21) * T, sy = py + hash(x, y, k + 31) * T, r = T * (0.02 + 0.04 * hash(x, y, k + 41));
        ctx.fillStyle = ['#ffffff', '#FFE066', '#9FD3FF'][k];
        A.star(ctx, sx, sy, r * 1.6, 4, 0.35); ctx.fill();
      }
    }
    if (hash(x, y, 99) < 0.025) {
      var c = ['#F28C5A', '#7FC8F0', '#C9A0E8'][Math.floor(hash(x, y, 98) * 3)];
      ctx.fillStyle = c; circle(ctx, px + T / 2, py + T / 2, T * 0.32); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = T * 0.05; ellipse(ctx, px + T / 2, py + T / 2, T * 0.5, T * 0.14, -0.3); ctx.stroke();
    }
    return true;
  };
  A.extraDecor.hay = function (ctx, cx, cy, r, hp, T, seed) {
    F.hay[1](ctx, cx - T / 2, cy - T / 2, T, T, Math.round(T * 0.42), { x: Math.round(seed * 10), y: 3 }, T);
  };

  // ---------- new mess ----------
  A.extraDirt.rock = function (ctx, d, s, t, v) {
    stud(ctx, 0, 0, s * 0.08, v < 0.5 ? '#9AA0A6' : '#7D838A');
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; circle(ctx, s * 0.02, -s * 0.01, s * 0.025); ctx.fill();
  };
  A.extraDirt.paper = function (ctx, d, s) {
    ctx.rotate(d.rot);
    ctx.fillStyle = C.white; ctx.fillRect(-s * 0.1, -s * 0.07, s * 0.2, s * 0.14);
    ctx.fillStyle = 'rgba(80,120,200,0.6)'; for (var i = 0; i < 3; i++) ctx.fillRect(-s * 0.08, -s * 0.04 + i * s * 0.035, s * 0.16, 1);
  };
  A.extraDirt.crayon = function (ctx, d, s, t, v) {
    ctx.rotate(d.rot);
    var c = [C.red, C.blue, C.bgreen, C.purple, C.orange][Math.floor(v * 5)];
    ctx.fillStyle = c; rr(ctx, -s * 0.12, -s * 0.025, s * 0.2, s * 0.05, 1.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.08, -s * 0.025); ctx.lineTo(s * 0.13, 0); ctx.lineTo(s * 0.08, s * 0.025); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-s * 0.06, -s * 0.025, s * 0.04, s * 0.05);
  };
  A.extraDirt.feather = function (ctx, d, s) {
    ctx.rotate(d.rot);
    ctx.fillStyle = '#FFF7E8'; ellipse(ctx, 0, 0, s * 0.13, s * 0.045); ctx.fill();
    ctx.strokeStyle = '#C8B89A'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s * 0.15, 0); ctx.lineTo(s * 0.12, 0); ctx.stroke();
  };
  A.extraDirt.stardust = function (ctx, d, s, t, v) {
    for (var g = 0; g < 3; g++) {
      ctx.fillStyle = ['#FFE066', '#C9A0E8', '#9FD3FF'][g];
      var tw = 0.6 + 0.4 * Math.sin(t * 4 + g * 2 + v * 10);
      A.star(ctx, Math.cos(g * 2.1 + v * 5) * s * 0.08, Math.sin(g * 2.1 + v * 5) * s * 0.07, s * 0.07 * tw, 5, 0.45); ctx.fill();
    }
  };

  // ---------- new toys ----------
  A.extraToy.boot = function (ctx, toy, s) {
    ctx.fillStyle = C.yellow; rr(ctx, -s * 0.1, -s * 0.28, s * 0.2, s * 0.4, s * 0.06); ctx.fill();
    ellipse(ctx, s * 0.06, s * 0.12, s * 0.18, s * 0.1); ctx.fill();
    ctx.fillStyle = shade(C.yellow, -0.25); ctx.fillRect(-s * 0.1, -s * 0.28, s * 0.2, s * 0.06);
    ctx.fillStyle = '#5a4a3a'; ctx.fillRect(-s * 0.12, s * 0.17, s * 0.36, s * 0.04);
  };
  A.extraToy.block = function (ctx, toy, s) {
    block(ctx, -s * 0.18, -s * 0.14, s * 0.36, s * 0.36, s * 0.1, C.red, { noShadow: 1, r: 3 });
    ctx.fillStyle = C.white; ctx.font = '700 ' + Math.round(s * 0.26) + 'px Fredoka, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A', 0, -s * 0.06);
  };
  A.extraToy.alien = function (ctx, toy, s) {
    ctx.fillStyle = '#7BD65A'; ellipse(ctx, 0, s * 0.06, s * 0.2, s * 0.17); ctx.fill();
    circle(ctx, 0, -s * 0.1, s * 0.16); ctx.fill();
    ctx.strokeStyle = '#7BD65A'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(-s * 0.06, -s * 0.22); ctx.lineTo(-s * 0.12, -s * 0.34); ctx.moveTo(s * 0.06, -s * 0.22); ctx.lineTo(s * 0.12, -s * 0.34); ctx.stroke();
    ctx.fillStyle = C.pink; circle(ctx, -s * 0.12, -s * 0.34, s * 0.035); ctx.fill(); circle(ctx, s * 0.12, -s * 0.34, s * 0.035); ctx.fill();
    ctx.fillStyle = C.white; circle(ctx, 0, -s * 0.1, s * 0.08); ctx.fill();
    ctx.fillStyle = C.black; circle(ctx, 0, -s * 0.09, s * 0.04); ctx.fill();
  };
  A.extraToy.rocket = function (ctx, toy, s) {
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.moveTo(-s * 0.1, s * 0.22); ctx.lineTo(-s * 0.2, s * 0.3); ctx.lineTo(-s * 0.1, s * 0.05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.1, s * 0.22); ctx.lineTo(s * 0.2, s * 0.3); ctx.lineTo(s * 0.1, s * 0.05); ctx.fill();
    ctx.fillStyle = C.white; rr(ctx, -s * 0.1, -s * 0.15, s * 0.2, s * 0.4, s * 0.06); ctx.fill();
    ctx.fillStyle = C.red; ctx.beginPath(); ctx.moveTo(-s * 0.1, -s * 0.12); ctx.quadraticCurveTo(0, -s * 0.38, s * 0.1, -s * 0.12); ctx.fill();
    ctx.fillStyle = C.sky; circle(ctx, 0, 0, s * 0.055); ctx.fill();
  };

  // ---------- new pets ----------
  A.extraPet.dog = function (ctx, s, a, t, mode) {
    var fur = '#C68A4E', ear = '#7A4A25';
    if (mode === 'sit' || mode === 'ride') {
      ctx.fillStyle = fur; ellipse(ctx, 0, s * 0.03, s * 0.22, s * 0.17); ctx.fill();
      ctx.strokeStyle = fur; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.05); ctx.lineTo(-s * 0.3, s * 0.0 + Math.sin(t * 10) * s * 0.06); ctx.stroke();
      ctx.fillStyle = fur; circle(ctx, s * 0.05, -s * 0.12, s * 0.13); ctx.fill();
      ctx.fillStyle = ear; ellipse(ctx, -s * 0.08, -s * 0.1, s * 0.05, s * 0.1, 0.3); ctx.fill(); ellipse(ctx, s * 0.18, -s * 0.1, s * 0.05, s * 0.1, -0.3); ctx.fill();
      ctx.fillStyle = '#F2D8B8'; ellipse(ctx, s * 0.05, -s * 0.06, s * 0.07, s * 0.05); ctx.fill();
      ctx.fillStyle = C.black; circle(ctx, s * 0.05, -s * 0.08, s * 0.025); ctx.fill();
      circle(ctx, 0, -s * 0.15, s * 0.018); ctx.fill(); circle(ctx, s * 0.1, -s * 0.15, s * 0.018); ctx.fill();
      ctx.fillStyle = C.red; ctx.fillRect(-s * 0.04, -s * 0.01, s * 0.18, s * 0.03);
      return;
    }
    ctx.rotate(a);
    ctx.strokeStyle = fur; ctx.lineWidth = s * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.18, 0); ctx.lineTo(-s * 0.3, Math.sin(t * 14) * s * 0.1); ctx.stroke();
    ctx.fillStyle = fur; ellipse(ctx, 0, 0, s * 0.2, s * 0.11); ctx.fill();
    circle(ctx, s * 0.2, 0, s * 0.1); ctx.fill();
    ctx.fillStyle = ear; ellipse(ctx, s * 0.17, -s * 0.1, s * 0.07, s * 0.04, 0.4); ctx.fill(); ellipse(ctx, s * 0.17, s * 0.1, s * 0.07, s * 0.04, -0.4); ctx.fill();
    ctx.fillStyle = C.black; circle(ctx, s * 0.3, 0, s * 0.025); ctx.fill();
    ctx.fillStyle = C.red; ctx.fillRect(s * 0.08, -s * 0.09, s * 0.03, s * 0.18);
  };
  A.extraPet.alien = function (ctx, s, a, t, mode) {
    var bob = Math.sin(t * 3) * s * 0.05;
    ctx.translate(0, -s * 0.12 + bob);
    ctx.fillStyle = 'rgba(180,255,150,0.25)'; circle(ctx, 0, 0, s * 0.3); ctx.fill();
    ctx.fillStyle = '#7BD65A';
    ctx.beginPath(); ctx.moveTo(-s * 0.18, s * 0.12);
    for (var i = 0; i <= 4; i++) ctx.lineTo(-s * 0.18 + i * s * 0.09, s * 0.12 + (i % 2 ? s * 0.06 : 0) + Math.sin(t * 6 + i) * s * 0.02);
    ctx.lineTo(s * 0.18, -s * 0.02); ctx.quadraticCurveTo(s * 0.18, -s * 0.24, 0, -s * 0.24); ctx.quadraticCurveTo(-s * 0.18, -s * 0.24, -s * 0.18, -s * 0.02); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7BD65A'; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo(0, -s * 0.24); ctx.lineTo(0, -s * 0.36); ctx.stroke();
    ctx.fillStyle = '#FFE066'; circle(ctx, 0, -s * 0.37, s * (0.04 + 0.01 * Math.sin(t * 8))); ctx.fill();
    ctx.fillStyle = C.white; circle(ctx, 0, -s * 0.08, s * 0.09); ctx.fill();
    ctx.fillStyle = C.black; circle(ctx, Math.cos(a) * s * 0.03, -s * 0.08 + Math.sin(a) * s * 0.03, s * 0.045); ctx.fill();
    ctx.strokeStyle = '#3c7a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, s * 0.03, s * 0.05, 0.3, Math.PI - 0.3); ctx.stroke();
  };

  // ---------- new hats ----------
  A.HATS.splice(A.HATS.length - 3, 0, { id: 'straw', name: 'Farmer' }, { id: 'grad', name: 'Smarty', stars: 12 });
  A.HATS.push({ id: 'astronaut', name: 'Astronaut', stars: 30 });
  A.extraHat.straw = function (ctx, s) {
    ctx.fillStyle = '#E6C46A'; ellipse(ctx, 0, 0, s * 0.62, s * 0.15); ctx.fill();
    ctx.strokeStyle = 'rgba(150,110,40,0.5)'; ctx.lineWidth = 1;
    for (var i = 1; i < 4; i++) { ellipse(ctx, 0, 0, s * 0.62 * i / 4, s * 0.15 * i / 4); ctx.stroke(); }
    ctx.fillStyle = '#EFD27E'; ctx.beginPath(); ctx.moveTo(-s * 0.28, 0); ctx.quadraticCurveTo(-s * 0.28, -s * 0.4, 0, -s * 0.4); ctx.quadraticCurveTo(s * 0.28, -s * 0.4, s * 0.28, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.red; ctx.fillRect(-s * 0.28, -s * 0.1, s * 0.56, s * 0.08);
    ctx.strokeStyle = '#D9A93A'; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.3); ctx.lineTo(s * 0.4, -s * 0.5); ctx.stroke();
  };
  A.extraHat.grad = function (ctx, s, t) {
    ctx.fillStyle = '#20262c';
    ctx.beginPath(); ctx.arc(0, 0, s * 0.3, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.28); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s * 0.55, -s * 0.28); ctx.lineTo(0, -s * 0.12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#353d45'; ctx.beginPath(); ctx.moveTo(-s * 0.55, -s * 0.28); ctx.lineTo(0, -s * 0.12); ctx.lineTo(s * 0.55, -s * 0.28); ctx.lineTo(0, -s * 0.2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.yellow; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.quadraticCurveTo(s * 0.35, -s * 0.3, s * 0.4 + Math.sin(t * 3) * s * 0.03, s * 0.05); ctx.stroke();
    ctx.fillStyle = C.yellow; circle(ctx, 0, -s * 0.3, s * 0.05); ctx.fill(); circle(ctx, s * 0.4 + Math.sin(t * 3) * s * 0.03, s * 0.08, s * 0.06); ctx.fill();
  };
  A.extraHat.astronaut = function (ctx, s, t) {
    ctx.fillStyle = 'rgba(190,230,255,0.35)'; circle(ctx, 0, s * 0.15, s * 0.95); ctx.fill();
    ctx.strokeStyle = '#E8EDF1'; ctx.lineWidth = s * 0.1; circle(ctx, 0, s * 0.15, s * 0.95); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = s * 0.07;
    ctx.beginPath(); ctx.arc(0, s * 0.15, s * 0.78, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
    ctx.fillStyle = C.red; rr(ctx, -s * 0.12, -s * 0.86, s * 0.24, s * 0.1, 2); ctx.fill();
    ctx.fillStyle = 'rgba(98,240,122,' + (0.5 + 0.5 * Math.sin(t * 5)) + ')'; circle(ctx, s * 0.62, -s * 0.5, s * 0.06); ctx.fill();
  };
})();
