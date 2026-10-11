/* Rug Siege 3D view — a cozy, sun-lit living room.
   World: +x east, +y up, +z south. Sim tile (x, y) maps to world (x, y-up, y).
   A toy's face is authored on local −z. Heading is yawToward(dx, dz).
   Presentation only: reads sim state, never writes it. */
(function () {
  var THREE = globalThis.THREE;
  var YAW = {
    e: [1, 0],
    n: [0, -1],
    w: [-1, 0],
    s: [0, 1]
  };

  function yawToward(dx, dz) {
    return Math.atan2(-dx, -dz);
  }

  function cellOf(x, z) {
    var c = Math.floor(x);
    var r = Math.floor(z);
    if (c < 0 || c > 15 || r < 0 || r > 9) return null;
    return { c: c, r: r };
  }

  function selfTestFacing() {
    var dirs = [[1, 0, 1, 0], [0, -1, 0, -1], [-1, 0, -1, 0], [0, 1, 0, 1]];
    var fails = [];
    var i;
    for (i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      var g = new THREE.Group();
      var nose = new THREE.Object3D();
      nose.position.set(0, 0.4, -0.5);
      g.add(nose);
      g.rotation.y = yawToward(d[0], d[1]);
      g.updateMatrixWorld(true);
      var p = new THREE.Vector3();
      nose.getWorldPosition(p);
      var len = Math.sqrt(p.x * p.x + p.z * p.z) || 1;
      var dot = (p.x / len) * d[2] + (p.z / len) * d[3];
      if (dot < 0.98) fails.push(d[0] + ',' + d[1] + ' dot ' + dot.toFixed(3));
    }
    var samples = [
      [0.5, 7.5, 0, 7],
      [14.5, 6.5, 14, 6],
      [0, 0, 0, 0],
      [15.99, 9.99, 15, 9],
      [-0.01, 1, null, null],
      [8, 10, null, null],
      [16, 5, null, null]
    ];
    for (i = 0; i < samples.length; i++) {
      var q = samples[i];
      var hit = cellOf(q[0], q[1]);
      if (q[2] == null) {
        if (hit) fails.push('miss ' + q[0] + ',' + q[1]);
      } else if (!hit || hit.c !== q[2] || hit.r !== q[3]) {
        fails.push('cell ' + q[0] + ',' + q[1]);
      }
    }
    return fails;
  }

  /* ------------------------------------------------------------------ */
  /* Quality + shared state                                              */
  /* ------------------------------------------------------------------ */

  var LOW = false;
  try {
    LOW = window.matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
  } catch (err) {}

  var renderer = null;
  var scene = null;
  var camera = null;
  var canvas = null;
  var raycaster = null;
  var pointer = null;
  var floorPlane = null;
  var planeHit = null;
  var proj = null;
  var aimDir = null;
  var UPV = null;
  var pickList = [];
  var pools = {};
  var ghosts = {};
  var ghosting = false;
  var matSink = null;
  var blobMat = null;
  var sizedW = -1;
  var sizedH = -1;
  var safe = { x: 8, y: 96, w: 800, h: 400 };
  var prMax = LOW ? 1.5 : 1.75;
  var prCur = 1;
  var perfAcc = 0;
  var perfN = 0;
  var lastNow = 0;
  var mountNow = -1;
  var shakeAmp = 0;
  var camDir = null;
  var camDist = 20;
  var camLook = null;
  var tvScreen = null;
  var holeSwirl = null;
  var motes = null;
  var moteSeed = [];
  var scuffs = [];
  var freeDots = null;
  var woodCells = [];
  var ring = null;
  var ringDash = null;
  var pad = null;
  var selGlow = null;
  var hpBack = null;
  var hpFill = null;
  var sparksFx = null;
  var softFx = null;
  var shots = [];
  var bandShots = [];
  var pillowShots = [];
  var rolls = [];
  var shocks = [];
  var flashes = [];
  var thumbs = {};
  var TEX = {};
  var GEO = {};
  var WHITE = new THREE.Color(1, 1, 1);
  var MARCH = { soldier: 1, car: 1, teddy: 1, block: 1, balloon: 1, tin: 1 };
  var MERGED = { bowl: 1, blanket: 1, catch: 1 };
  var HEIGHT = { soldier: 1.0, car: 0.62, teddy: 1.28, block: 0.78, balloon: 2.0, tin: 1.22 };

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var R = rng(7);

  function rgba(r, g, b, a) {
    return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a == null ? 1 : a) + ')';
  }
  function clamp01(t) { return t < 0 ? 0 : (t > 1 ? 1 : t); }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function easeOutBack(t) {
    var c1 = 1.9;
    var c3 = c1 + 1;
    t = clamp01(t);
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function easeOutElastic(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
  }
  function lerpAngle(a, b, k) {
    var d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  }

  function mat(hex, o) {
    o = o || {};
    var P = {
      color: hex,
      roughness: o.roughness == null ? 0.55 : o.roughness,
      metalness: o.metalness || 0,
      map: o.map || null,
      transparent: !!o.transparent || ghosting,
      opacity: ghosting ? 0.6 : (o.opacity == null ? 1 : o.opacity),
      side: o.side || THREE.FrontSide,
      envMapIntensity: o.env == null ? 1 : o.env
    };
    if (o.emissive != null) {
      P.emissive = o.emissive;
      P.emissiveIntensity = o.emissiveIntensity == null ? 0.8 : o.emissiveIntensity;
    }
    if (o.flat) P.flatShading = true;
    var m;
    if (o.clearcoat || o.sheen) {
      P.clearcoat = o.clearcoat || 0;
      P.clearcoatRoughness = o.clearcoatRoughness == null ? 0.2 : o.clearcoatRoughness;
      if (o.sheen) {
        P.sheen = o.sheen;
        P.sheenColor = new THREE.Color(o.sheenColor == null ? 0xffffff : o.sheenColor);
        P.sheenRoughness = 0.6;
      }
      m = new THREE.MeshPhysicalMaterial(P);
    } else {
      m = new THREE.MeshStandardMaterial(P);
    }
    if (ghosting) m.depthWrite = false;
    else if (o.transparent) m.depthWrite = !!o.depthWrite;
    m.userData.e0 = m.emissive.clone();
    m.userData.ei0 = m.emissiveIntensity;
    if (matSink) matSink.push(m);
    return m;
  }

  function cg(key, fn) {
    var g = GEO[key];
    if (!g) g = GEO[key] = fn();
    return g;
  }

  function mesh(geometry, material, x, y, z, shadow) {
    var m = new THREE.Mesh(geometry, material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = !!shadow && !material.transparent;
    m.receiveShadow = !material.transparent;
    return m;
  }
  function box(w, h, d, m, x, y, z, sh) {
    return mesh(cg('b' + w + ',' + h + ',' + d, function () { return new THREE.BoxGeometry(w, h, d); }), m, x, y, z, sh);
  }
  function rbox(w, h, d, r, m, x, y, z, sh) {
    return mesh(cg('r' + [w, h, d, r].join(','), function () { return roundedBoxGeometry(w, h, d, r, 3); }), m, x, y, z, sh);
  }
  function ball(r, m, x, y, z, sh) {
    return mesh(cg('s' + r, function () { return new THREE.SphereGeometry(r, 22, 16); }), m, x, y, z, sh);
  }
  function cyl(rt, rb, h, m, x, y, z, sh, seg) {
    seg = seg || 20;
    return mesh(cg('c' + [rt, rb, h, seg].join(','), function () { return new THREE.CylinderGeometry(rt, rb, h, seg); }), m, x, y, z, sh);
  }
  function tor(rad, t, m, x, y, z, sh, arc) {
    return mesh(cg('t' + [rad, t, arc || 0].join(','), function () {
      return new THREE.TorusGeometry(rad, t, 10, 36, arc || Math.PI * 2);
    }), m, x, y, z, sh);
  }

  function roundedBoxGeometry(w, h, d, r, s) {
    s = s || 3;
    r = Math.min(r, w / 2, h / 2, d / 2);
    var n = s * 2 + 1;
    var g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
    var pos = g.attributes.position;
    var nor = g.attributes.normal;
    var hw = [w / 2, h / 2, d / 2];
    var v = [0, 0, 0];
    var inner = [0, 0, 0];
    var off = [0, 0, 0];
    for (var i = 0; i < pos.count; i++) {
      v[0] = pos.getX(i);
      v[1] = pos.getY(i);
      v[2] = pos.getZ(i);
      var len2 = 0;
      for (var a = 0; a < 3; a++) {
        var idx = Math.round((v[a] + 0.5) * n);
        var x = idx <= s ? -hw[a] + r * (idx / s) : hw[a] - r * ((n - idx) / s);
        var lim = hw[a] - r;
        var cl = Math.max(-lim, Math.min(lim, x));
        inner[a] = cl;
        off[a] = x - cl;
        len2 += off[a] * off[a];
      }
      var len = Math.sqrt(len2);
      if (len > 1e-7) {
        pos.setXYZ(i, inner[0] + off[0] / len * r, inner[1] + off[1] / len * r, inner[2] + off[2] / len * r);
        nor.setXYZ(i, off[0] / len, off[1] / len, off[2] / len);
      } else {
        pos.setXYZ(i, inner[0], inner[1], inner[2]);
      }
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  function puffyGeometry(w, h, d, puff) {
    var g = roundedBoxGeometry(w, h, d, Math.min(h / 2, 0.06), 4);
    var pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var nx = pos.getX(i) / (w / 2);
      var nz = pos.getZ(i) / (d / 2);
      var k = 1 + puff * (1 - nx * nx) * (1 - nz * nz);
      pos.setY(i, pos.getY(i) * k);
    }
    g.computeVertexNormals();
    return g;
  }

  function starGeometry(R1, r1, depth) {
    var sh = new THREE.Shape();
    for (var i = 0; i < 10; i++) {
      var a = Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 ? r1 : R1;
      if (i === 0) sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    sh.closePath();
    var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: R1 * 0.12, bevelSegments: 2 });
    g.center();
    return g;
  }

  function heartShape(s) {
    var h = new THREE.Shape();
    h.moveTo(0, -0.9 * s);
    h.bezierCurveTo(-0.2 * s, -0.6 * s, -1.0 * s, -0.25 * s, -0.95 * s, 0.25 * s);
    h.bezierCurveTo(-0.9 * s, 0.75 * s, -0.25 * s, 0.85 * s, 0, 0.4 * s);
    h.bezierCurveTo(0.25 * s, 0.85 * s, 0.9 * s, 0.75 * s, 0.95 * s, 0.25 * s);
    h.bezierCurveTo(1.0 * s, -0.25 * s, 0.2 * s, -0.6 * s, 0, -0.9 * s);
    return h;
  }

  function stretchBetween(m, ax, ay, az, bx, by, bz) {
    var dx = bx - ax;
    var dy = by - ay;
    var dz = bz - az;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    aimDir.set(dx / len, dy / len, dz / len);
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UPV, aimDir);
  }

  /* ------------------------------------------------------------------ */
  /* Code-painted textures                                               */
  /* ------------------------------------------------------------------ */

  function canvasTex(w, h, draw, linear) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    if (!linear) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
    return t;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function grain(g, x, y, w, h, horiz, base, rnd, knotChance) {
    var j = (rnd() - 0.5) * 30;
    g.fillStyle = rgba(base[0] + j, base[1] + j * 0.85, base[2] + j * 0.7);
    g.fillRect(x, y, w, h);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    var L = horiz ? w : h;
    var T = horiz ? h : w;
    var count = Math.max(4, Math.round(T / 3));
    for (var k = 0; k < count; k++) {
      var off = (k + rnd()) * T / count;
      var dark = rnd() < 0.72;
      g.strokeStyle = dark ? rgba(92, 48, 20, 0.05 + rnd() * 0.14) : rgba(255, 232, 196, 0.05 + rnd() * 0.09);
      g.lineWidth = 0.5 + rnd() * 1.7;
      var amp = 0.5 + rnd() * 2.6;
      var fr = 0.008 + rnd() * 0.03;
      var ph = rnd() * 6.28;
      g.beginPath();
      for (var t = -8; t <= L + 8; t += 8) {
        var o = off + Math.sin(t * fr + ph) * amp;
        if (horiz) {
          if (t < 0) g.moveTo(x + t, y + o); else g.lineTo(x + t, y + o);
        } else if (t < 0) g.moveTo(x + o, y + t);
        else g.lineTo(x + o, y + t);
      }
      g.stroke();
    }
    if (rnd() < (knotChance == null ? 0.15 : knotChance)) {
      var kx = horiz ? x + rnd() * w : x + w / 2;
      var ky = horiz ? y + h / 2 : y + rnd() * h;
      for (var q = 4; q > 0; q--) {
        g.strokeStyle = rgba(90, 46, 18, 0.12 + 0.04 * q);
        g.lineWidth = 1;
        g.beginPath();
        g.ellipse(kx, ky, (horiz ? 7 : 3) * q * 0.6, (horiz ? 3 : 7) * q * 0.6, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
    var gr = horiz ? g.createLinearGradient(x, y, x, y + h) : g.createLinearGradient(x, y, x + w, y);
    gr.addColorStop(0, 'rgba(255,240,220,0.12)');
    gr.addColorStop(0.5, 'rgba(255,240,220,0)');
    gr.addColorStop(1, 'rgba(60,30,10,0.12)');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.restore();
  }

  function plankTexture() {
    return canvasTex(1024, 1024, function (g, W, H) {
      var rnd = rng(11);
      var rows = 8;
      var rh = H / rows;
      for (var r = 0; r < rows; r++) {
        var x = -rnd() * 300;
        while (x < W) {
          var len = 260 + rnd() * 420;
          grain(g, x, r * rh, len, rh, true, [168, 112, 66], rnd, 0.3);
          g.fillStyle = 'rgba(52,26,10,0.55)';
          g.fillRect(x + len - 2, r * rh, 3, rh);
          x += len;
        }
        g.fillStyle = 'rgba(52,26,10,0.6)';
        g.fillRect(0, r * rh, W, 3);
        g.fillStyle = 'rgba(255,226,186,0.18)';
        g.fillRect(0, r * rh + 3, W, 2);
      }
    });
  }

  function kindGrid() {
    var k = [];
    for (var r = 0; r < 10; r++) {
      k[r] = [];
      for (var c = 0; c < 16; c++) k[r][c] = RugSim.cellKind(c, r);
    }
    return k;
  }

  function rugAt(k, c, r) {
    if (c === -1 && r === 7) return true;
    return r >= 0 && r < 10 && c >= 0 && c < 16 && k[r][c] === 'path';
  }

  function boardTexture() {
    var S = 128;
    var k = kindGrid();
    return canvasTex(16 * S, 10 * S, function (g) {
      var rnd = rng(3);
      var r;
      var c;
      for (r = 0; r < 10; r++) {
        for (c = 0; c < 16; c++) {
          var x = c * S;
          var y = r * S;
          var horiz = (c + r) % 2 === 0;
          var n = 3;
          var sw = S / n;
          for (var i = 0; i < n; i++) {
            if (horiz) grain(g, x, y + i * sw, S, sw, true, [212, 156, 98], rnd, 0.1);
            else grain(g, x + i * sw, y, sw, S, false, [212, 156, 98], rnd, 0.1);
          }
          g.fillStyle = 'rgba(96,52,20,0.32)';
          for (i = 1; i < n; i++) {
            if (horiz) g.fillRect(x, y + i * sw - 1, S, 2);
            else g.fillRect(x + i * sw - 1, y, 2, S);
          }
          g.fillStyle = 'rgba(255,244,222,0.42)';
          g.fillRect(x, y, S, 3);
          g.fillRect(x, y, 3, S);
          g.fillStyle = 'rgba(78,40,14,0.6)';
          g.fillRect(x, y + S - 3, S, 3);
          g.fillRect(x + S - 3, y, 3, S);
        }
      }
      // soft contact shadow cast by the rug onto the parquet
      g.save();
      g.shadowColor = 'rgba(46,20,6,0.75)';
      g.shadowBlur = 26;
      g.shadowOffsetX = 5;
      g.shadowOffsetY = 9;
      g.fillStyle = '#6a2422';
      for (r = 0; r < 10; r++) {
        for (c = 0; c < 16; c++) if (rugAt(k, c, r)) g.fillRect(c * S, r * S, S, S);
      }
      g.restore();
      drawRug(g, k, S);
    });
  }

  function drawRug(g, k, S) {
    var r;
    var c;
    var cells = [];
    for (r = 0; r < 10; r++) {
      for (c = 0; c < 16; c++) if (rugAt(k, c, r)) cells.push([c, r]);
    }
    var i;
    var weave = document.createElement('canvas');
    weave.width = 8;
    weave.height = 8;
    var wg = weave.getContext('2d');
    wg.fillStyle = 'rgba(0,0,0,0.10)';
    wg.fillRect(0, 0, 8, 1);
    wg.fillRect(0, 4, 8, 1);
    wg.fillStyle = 'rgba(255,255,255,0.07)';
    wg.fillRect(0, 2, 8, 1);
    wg.fillRect(0, 6, 8, 1);
    wg.fillStyle = 'rgba(0,0,0,0.07)';
    wg.fillRect(3, 0, 1, 8);
    wg.fillRect(7, 0, 1, 8);
    var pat = g.createPattern(weave, 'repeat');

    for (i = 0; i < cells.length; i++) {
      c = cells[i][0];
      r = cells[i][1];
      g.fillStyle = (c + r) % 2 ? '#b23b3b' : '#ab3636';
      g.fillRect(c * S, r * S, S, S);
    }
    // field motifs
    for (i = 0; i < cells.length; i++) {
      c = cells[i][0];
      r = cells[i][1];
      var cx = c * S + S / 2;
      var cy = r * S + S / 2;
      diamond(g, cx, cy, 26, '#f1e1c0');
      diamond(g, cx, cy, 21, '#e7a93e');
      diamond(g, cx, cy, 13, '#2f4a6b');
      diamond(g, cx, cy, 6, '#f6ead2');
      var nb = [[1, 0], [0, 1]];
      for (var q = 0; q < 2; q++) {
        if (rugAt(k, c + nb[q][0], r + nb[q][1])) {
          var mx = cx + nb[q][0] * S / 2;
          var my = cy + nb[q][1] * S / 2;
          diamond(g, mx, my, 9, '#f1e1c0');
          diamond(g, mx, my, 5, '#2f4a6b');
        }
      }
      g.fillStyle = 'rgba(246,226,190,0.55)';
      var dots = [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]];
      for (q = 0; q < 4; q++) {
        g.beginPath();
        g.arc(cx + dots[q][0] * S, cy + dots[q][1] * S, 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
    // borders
    var bands = [[0, 13, '#f2e2c2'], [13, 6, '#2d4566'], [22, 4, '#e3a83f']];
    for (i = 0; i < cells.length; i++) {
      c = cells[i][0];
      r = cells[i][1];
      var x = c * S;
      var y = r * S;
      var sides = [
        [!rugAt(k, c, r - 1), 'top'],
        [!rugAt(k, c, r + 1), 'bottom'],
        [!rugAt(k, c - 1, r), 'left'],
        [!rugAt(k, c + 1, r), 'right']
      ];
      for (var s = 0; s < 4; s++) {
        if (!sides[s][0]) continue;
        for (var b = 0; b < bands.length; b++) {
          var o = bands[b][0];
          var w = bands[b][1];
          g.fillStyle = bands[b][2];
          if (sides[s][1] === 'top') g.fillRect(x, y + o, S, w);
          if (sides[s][1] === 'bottom') g.fillRect(x, y + S - o - w, S, w);
          if (sides[s][1] === 'left') g.fillRect(x + o, y, w, S);
          if (sides[s][1] === 'right') g.fillRect(x + S - o - w, y, w, S);
        }
        g.fillStyle = '#2d4566';
        for (var t = 4; t < S; t += 16) {
          g.beginPath();
          if (sides[s][1] === 'top') { g.moveTo(x + t, y + 13); g.lineTo(x + t + 8, y + 13); g.lineTo(x + t + 4, y + 5); }
          if (sides[s][1] === 'bottom') { g.moveTo(x + t, y + S - 13); g.lineTo(x + t + 8, y + S - 13); g.lineTo(x + t + 4, y + S - 5); }
          if (sides[s][1] === 'left') { g.moveTo(x + 13, y + t); g.lineTo(x + 13, y + t + 8); g.lineTo(x + 5, y + t + 4); }
          if (sides[s][1] === 'right') { g.moveTo(x + S - 13, y + t); g.lineTo(x + S - 13, y + t + 8); g.lineTo(x + S - 5, y + t + 4); }
          g.fill();
        }
      }
      // concave corners
      var diag = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (var d = 0; d < 4; d++) {
        var dx = diag[d][0];
        var dy = diag[d][1];
        if (!rugAt(k, c + dx, r) || !rugAt(k, c, r + dy) || rugAt(k, c + dx, r + dy)) continue;
        for (b = 0; b < bands.length; b++) {
          o = bands[b][0];
          w = bands[b][1];
          g.fillStyle = bands[b][2];
          var ex = dx < 0 ? x : x + S;
          var ey = dy < 0 ? y : y + S;
          var sx = dx < 0 ? 1 : -1;
          var sy = dy < 0 ? 1 : -1;
          // horizontal piece and vertical piece of the corner L
          g.fillRect(Math.min(ex, ex + sx * (o + w)), Math.min(ey + sy * o, ey + sy * (o + w)), o + w, w);
          g.fillRect(Math.min(ex + sx * o, ex + sx * (o + w)), Math.min(ey, ey + sy * (o + w)), w, o + w);
        }
      }
    }
    // woven texture over everything
    g.save();
    g.fillStyle = pat;
    for (i = 0; i < cells.length; i++) g.fillRect(cells[i][0] * S, cells[i][1] * S, S, S);
    var rnd = rng(19);
    for (i = 0; i < cells.length; i++) {
      for (var p = 0; p < 140; p++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,240,220,0.07)';
        g.fillRect(cells[i][0] * S + rnd() * S, cells[i][1] * S + rnd() * S, 2, 2);
      }
    }
    g.restore();
  }

  function diamond(g, cx, cy, s, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx, cy - s);
    g.lineTo(cx + s, cy);
    g.lineTo(cx, cy + s);
    g.lineTo(cx - s, cy);
    g.closePath();
    g.fill();
  }

  function wallpaperTexture() {
    return canvasTex(512, 512, function (g, W, H) {
      g.fillStyle = '#f5e7d0';
      g.fillRect(0, 0, W, H);
      for (var x = 0; x < W; x += 64) {
        g.fillStyle = 'rgba(232,206,170,0.45)';
        g.fillRect(x, 0, 30, H);
        g.fillStyle = 'rgba(214,180,140,0.35)';
        g.fillRect(x + 30, 0, 2, H);
      }
      var rnd = rng(5);
      for (var y = 0; y < H; y += 64) {
        for (x = 0; x < W; x += 64) {
          var ox = ((y / 64) % 2) * 32 + 47;
          sparkle(g, (x + ox) % W, y + 32, 6, 'rgba(226,150,110,0.55)');
        }
      }
      for (var i = 0; i < 2600; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(120,80,40,0.04)' : 'rgba(255,255,255,0.05)';
        g.fillRect(rnd() * W, rnd() * H, 2, 2);
      }
    });
  }

  function sparkle(g, x, y, s, col) {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(x, y - s);
    g.quadraticCurveTo(x, y, x + s, y);
    g.quadraticCurveTo(x, y, x, y + s);
    g.quadraticCurveTo(x, y, x - s, y);
    g.quadraticCurveTo(x, y, x, y - s);
    g.fill();
  }

  function wainscotTexture() {
    return canvasTex(512, 256, function (g, W, H) {
      g.fillStyle = '#93b29a';
      g.fillRect(0, 0, W, H);
      var pw = W / 2;
      for (var i = 0; i < 2; i++) {
        var x = i * pw + 28;
        var y = 34;
        var w = pw - 56;
        var h = H - 70;
        g.fillStyle = '#8aa991';
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,240,0.45)';
        g.fillRect(x, y + h - 4, w, 4);
        g.fillRect(x + w - 4, y, 4, h);
        g.fillStyle = 'rgba(40,60,44,0.35)';
        g.fillRect(x, y, w, 5);
        g.fillRect(x, y, 5, h);
      }
      var rnd = rng(8);
      for (var n = 0; n < 1600; n++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)';
        g.fillRect(rnd() * W, rnd() * H, 2, 2);
      }
    });
  }

  function skyTexture() {
    return canvasTex(512, 352, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#7fc0e8');
      grd.addColorStop(0.55, '#cdeeff');
      grd.addColorStop(0.75, '#fff1d6');
      grd.addColorStop(1, '#ffe2b0');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      var sun = g.createRadialGradient(380, 110, 6, 380, 110, 150);
      sun.addColorStop(0, 'rgba(255,252,236,1)');
      sun.addColorStop(0.18, 'rgba(255,244,210,0.95)');
      sun.addColorStop(1, 'rgba(255,230,180,0)');
      g.fillStyle = sun;
      g.fillRect(0, 0, w, h);
      function cloud(x, y, s) {
        g.fillStyle = 'rgba(255,255,255,0.92)';
        g.beginPath();
        g.arc(x, y, 22 * s, 0, Math.PI * 2);
        g.arc(x + 26 * s, y - 12 * s, 28 * s, 0, Math.PI * 2);
        g.arc(x + 56 * s, y, 22 * s, 0, Math.PI * 2);
        g.fill();
        g.fillRect(x, y, 56 * s, 22 * s);
      }
      cloud(60, 90, 1);
      cloud(230, 60, 0.7);
      g.fillStyle = '#9cc483';
      g.beginPath();
      g.moveTo(0, h * 0.78);
      g.quadraticCurveTo(140, h * 0.6, 290, h * 0.76);
      g.quadraticCurveTo(410, h * 0.62, w, h * 0.74);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fill();
      g.fillStyle = '#76a65f';
      g.beginPath();
      g.moveTo(0, h * 0.88);
      g.quadraticCurveTo(220, h * 0.74, w, h * 0.9);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fill();
      function tree(x, y, s) {
        g.fillStyle = '#6b4a2e';
        g.fillRect(x - 4 * s, y, 8 * s, 34 * s);
        g.fillStyle = '#4f8a4a';
        g.beginPath();
        g.arc(x, y - 6 * s, 30 * s, 0, Math.PI * 2);
        g.arc(x - 20 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
        g.arc(x + 20 * s, y + 8 * s, 20 * s, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,220,0.18)';
        g.beginPath();
        g.arc(x + 8 * s, y - 16 * s, 14 * s, 0, Math.PI * 2);
        g.fill();
      }
      tree(110, h * 0.66, 1.3);
      tree(440, h * 0.7, 0.9);
    });
  }

  function cartoonTexture() {
    return canvasTex(512, 288, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#5fb6f0');
      grd.addColorStop(1, '#bfe9ff');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffd34d';
      g.beginPath();
      g.arc(420, 70, 38, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffd34d';
      g.lineWidth = 6;
      for (var i = 0; i < 10; i++) {
        var a = i * Math.PI / 5;
        g.beginPath();
        g.moveTo(420 + Math.cos(a) * 50, 70 + Math.sin(a) * 50);
        g.lineTo(420 + Math.cos(a) * 64, 70 + Math.sin(a) * 64);
        g.stroke();
      }
      g.fillStyle = '#7bd36a';
      g.beginPath();
      g.moveTo(0, 210);
      g.quadraticCurveTo(160, 150, 320, 220);
      g.quadraticCurveTo(420, 180, w, 210);
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fill();
      // a happy cartoon dino
      g.fillStyle = '#9b6ff0';
      g.beginPath();
      g.ellipse(200, 196, 70, 42, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.ellipse(268, 140, 30, 26, 0, 0, Math.PI * 2);
      g.fill();
      g.fillRect(244, 140, 30, 60);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(276, 132, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1e1630';
      g.beginPath();
      g.arc(279, 133, 4.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#1e1630';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(268, 148, 12, 0.2, 1.2);
      g.stroke();
      g.fillStyle = '#ff8fb3';
      for (i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(150 + i * 30, 160 - i * 4);
        g.lineTo(165 + i * 30, 138 - i * 4);
        g.lineTo(180 + i * 30, 160 - i * 4);
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, 0, w, h * 0.45);
    });
  }

  function drawingTexture(kind) {
    return canvasTex(256, 200, function (g, w, h) {
      g.fillStyle = '#fffdf6';
      g.fillRect(0, 0, w, h);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.lineWidth = 7;
      function crayon(col) { g.strokeStyle = col; g.fillStyle = col; }
      if (kind === 0) {
        crayon('#f2b134');
        g.beginPath(); g.arc(200, 48, 24, 0, Math.PI * 2); g.fill();
        crayon('#d9534f');
        g.beginPath(); g.moveTo(50, 110); g.lineTo(100, 60); g.lineTo(150, 110); g.closePath(); g.stroke();
        crayon('#4f86c6');
        g.strokeRect(62, 110, 76, 64);
        crayon('#6b4a2e');
        g.strokeRect(90, 140, 20, 34);
        crayon('#5ab552');
        g.beginPath(); g.moveTo(0, 182); g.lineTo(256, 182); g.stroke();
      } else if (kind === 1) {
        var cols = ['#e5484d', '#f0913a', '#f2c53a', '#5ab552', '#4f86c6', '#8f63c9'];
        g.lineWidth = 11;
        for (var i = 0; i < cols.length; i++) {
          crayon(cols[i]);
          g.beginPath();
          g.arc(128, 180, 120 - i * 12, Math.PI, 0);
          g.stroke();
        }
        crayon('#9ad0f5');
        g.beginPath(); g.arc(40, 170, 22, 0, Math.PI * 2); g.arc(216, 170, 22, 0, Math.PI * 2); g.fill();
      } else {
        crayon('#e5484d');
        g.beginPath();
        g.moveTo(128, 150);
        g.bezierCurveTo(60, 100, 80, 40, 128, 74);
        g.bezierCurveTo(176, 40, 196, 100, 128, 150);
        g.fill();
        crayon('#4f86c6');
        g.lineWidth = 5;
        g.beginPath(); g.arc(50, 70, 14, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(50, 84); g.lineTo(50, 140); g.moveTo(30, 104); g.lineTo(70, 104); g.moveTo(50, 140); g.lineTo(34, 176); g.moveTo(50, 140); g.lineTo(66, 176); g.stroke();
        crayon('#f0913a');
        g.beginPath(); g.arc(206, 84, 11, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(206, 95); g.lineTo(206, 140); g.moveTo(190, 112); g.lineTo(222, 112); g.moveTo(206, 140); g.lineTo(194, 172); g.moveTo(206, 140); g.lineTo(218, 172); g.stroke();
      }
    });
  }

  function clockTexture() {
    return canvasTex(256, 256, function (g) {
      g.fillStyle = '#fffaf0';
      g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
      var cols = ['#e5484d', '#f0913a', '#f2c53a', '#5ab552', '#4f86c6', '#8f63c9'];
      for (var i = 0; i < 12; i++) {
        var a = i * Math.PI / 6;
        g.fillStyle = cols[i % cols.length];
        g.beginPath();
        g.arc(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96, i % 3 === 0 ? 12 : 7, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = '#3a2a20';
      g.lineCap = 'round';
      g.lineWidth = 10;
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 44, 128 - 30); g.stroke();
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 8, 128 - 78); g.stroke();
      g.fillStyle = '#e5484d';
      g.beginPath(); g.arc(128, 128, 10, 0, Math.PI * 2); g.fill();
    });
  }

  function blobTexture() {
    return canvasTex(128, 128, function (g) {
      var grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grd.addColorStop(0, 'rgba(46,24,10,0.62)');
      grd.addColorStop(0.5, 'rgba(46,24,10,0.3)');
      grd.addColorStop(1, 'rgba(46,24,10,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });
  }

  function radialTex(stops) {
    return canvasTex(128, 128, function (g) {
      var grd = g.createRadialGradient(64, 64, 0, 64, 64, 63);
      for (var i = 0; i < stops.length; i++) grd.addColorStop(stops[i][0], stops[i][1]);
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });
  }

  function ringTexture() {
    return canvasTex(512, 512, function (g) {
      var grd = g.createRadialGradient(256, 256, 0, 256, 256, 256);
      grd.addColorStop(0, 'rgba(255,255,255,0.03)');
      grd.addColorStop(0.8, 'rgba(255,255,255,0.16)');
      grd.addColorStop(0.93, 'rgba(255,255,255,0.32)');
      grd.addColorStop(0.95, 'rgba(255,255,255,0.95)');
      grd.addColorStop(0.985, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 512, 512);
    });
  }

  function dashTexture() {
    return canvasTex(512, 512, function (g) {
      g.strokeStyle = '#fff';
      g.lineWidth = 10;
      g.lineCap = 'round';
      for (var i = 0; i < 28; i++) {
        var a0 = i * Math.PI * 2 / 28;
        g.beginPath();
        g.arc(256, 256, 236, a0, a0 + 0.12);
        g.stroke();
      }
    });
  }

  function padTexture() {
    return canvasTex(128, 128, function (g) {
      g.clearRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(g, 8, 8, 112, 112, 22);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 7;
      roundRect(g, 8, 8, 112, 112, 22);
      g.stroke();
    });
  }

  function dotTexture() {
    return canvasTex(128, 128, function (g) {
      g.fillStyle = 'rgba(255,255,255,0.22)';
      roundRect(g, 14, 14, 100, 100, 20);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.setLineDash([12, 10]);
      g.lineWidth = 4;
      roundRect(g, 14, 14, 100, 100, 20);
      g.stroke();
    });
  }

  function swirlTexture() {
    return canvasTex(256, 256, function (g) {
      g.translate(128, 128);
      g.lineCap = 'round';
      for (var k = 0; k < 3; k++) {
        g.rotate(Math.PI * 2 / 3);
        g.strokeStyle = 'rgba(255,255,255,0.95)';
        g.lineWidth = 9;
        g.beginPath();
        for (var t = 0; t <= 1; t += 0.05) {
          var a = t * 2.4;
          var rr = 70 + t * 46;
          if (t === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.stroke();
      }
    });
  }

  function netTexture() {
    return canvasTex(128, 128, function (g) {
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 3;
      for (var i = 0; i <= 128; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
      }
    });
  }

  function quiltTexture() {
    return canvasTex(256, 256, function (g) {
      var cols = ['#f5a8b8', '#9fd3c7', '#ffe08a', '#a9c6f0', '#f7c59f', '#c9b6ea'];
      for (var y = 0; y < 4; y++) {
        for (var x = 0; x < 4; x++) {
          g.fillStyle = cols[(x + y * 3) % cols.length];
          g.fillRect(x * 64, y * 64, 64, 64);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          if ((x + y) % 2) {
            for (var d = 8; d < 64; d += 14) { g.beginPath(); g.arc(x * 64 + 32, y * 64 + 32, d / 3, 0, Math.PI * 2); g.fill(); }
          } else {
            g.fillRect(x * 64 + 8, y * 64 + 28, 48, 8);
          }
        }
      }
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.setLineDash([6, 5]);
      g.lineWidth = 2;
      for (var i = 0; i <= 256; i += 64) {
        g.beginPath(); g.moveTo(i + 2, 0); g.lineTo(i + 2, 256); g.stroke();
        g.beginPath(); g.moveTo(0, i + 2); g.lineTo(256, i + 2); g.stroke();
      }
    });
  }

  function letterAtlas() {
    return canvasTex(384, 256, function (g) {
      var faces = [['A', '#e5484d'], ['B', '#4f86c6'], ['C', '#5ab552'], ['1', '#f2b134'], ['2', '#8f63c9'], ['3', '#f0913a']];
      for (var i = 0; i < 6; i++) {
        var x = (i % 3) * 128;
        var y = Math.floor(i / 3) * 128;
        g.fillStyle = '#f6e3c0';
        g.fillRect(x, y, 128, 128);
        g.fillStyle = faces[i][1];
        roundRect(g, x + 12, y + 12, 104, 104, 14);
        g.fill();
        g.fillStyle = '#fff8ea';
        roundRect(g, x + 20, y + 20, 88, 88, 10);
        g.fill();
        g.fillStyle = faces[i][1];
        g.font = '900 78px "Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(faces[i][0], x + 64, y + 68);
      }
    });
  }

  function chestTexture() {
    return canvasTex(256, 256, function (g) {
      g.fillStyle = '#3f7ec4';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#f2c53a';
      g.fillRect(0, 108, 256, 40);
      g.fillStyle = '#e5484d';
      g.fillRect(0, 116, 256, 24);
      g.fillStyle = '#ffe48a';
      var rnd = rng(4);
      for (var i = 0; i < 9; i++) {
        var x = 20 + rnd() * 216;
        var y = rnd() < 0.5 ? 20 + rnd() * 70 : 166 + rnd() * 70;
        sparkle(g, x, y, 10 + rnd() * 6, '#ffe48a');
      }
    });
  }

  function atlasTexture() {
    var t = canvasTex(256, 256, function (g) {
      var grd = g.createRadialGradient(64, 64, 0, 64, 64, 62);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      g.save();
      g.translate(192, 64);
      var gl = g.createRadialGradient(0, 0, 0, 0, 0, 60);
      gl.addColorStop(0, 'rgba(255,255,255,0.5)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      g.fillRect(-64, -64, 128, 128);
      g.fillStyle = '#fff';
      g.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5;
        var rr = i % 2 ? 19 : 46;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = '#fff';
      roundRect(g, 24, 128 + 40, 80, 48, 10);
      g.fill();
      g.save();
      g.translate(192, 192);
      var gl2 = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      gl2.addColorStop(0, 'rgba(255,255,255,1)');
      gl2.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl2;
      g.fillRect(-64, -64, 128, 128);
      sparkle(g, 0, 0, 58, '#fff');
      g.restore();
    });
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    return t;
  }

  function shaftTexture() {
    return canvasTex(64, 256, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0.0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
  }

  function sunPatchTexture() {
    return canvasTex(256, 256, function (g) {
      g.filter = 'blur(7px)';
      g.fillStyle = '#fff';
      var m = 22;
      var gap = 10;
      var pw = (256 - m * 2 - gap) / 2;
      for (var y = 0; y < 2; y++) {
        for (var x = 0; x < 2; x++) g.fillRect(m + x * (pw + gap), m + y * (pw + gap), pw, pw);
      }
      g.filter = 'none';
    });
  }

  /* ------------------------------------------------------------------ */
  /* Toys                                                                */
  /* ------------------------------------------------------------------ */

  function addBlob(g, s) {
    var m = new THREE.Mesh(cg('blob', function () { return new THREE.PlaneGeometry(1, 1); }), blobMat);
    m.scale.set(s || 0.72, s || 0.72, 1);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.05;
    m.renderOrder = 2;
    // Disc is wider than a cell after the toy scale. A hit would report the tower cell.
    m.raycast = function () {};
    g.add(m);
    return m;
  }

  function flashMats(g, k) {
    if (g.userData.fk === k) return;
    g.userData.fk = k;
    var ms = g.userData.mats || [];
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (k > 0) {
        m.emissive.copy(m.userData.e0).lerp(WHITE, k * 0.6);
        m.emissiveIntensity = Math.max(m.userData.ei0, 1);
      } else {
        m.emissive.copy(m.userData.e0);
        m.emissiveIntensity = m.userData.ei0;
      }
    }
  }

  function marcher(fn, blobSize, netScale) {
    return function () {
      var g = new THREE.Group();
      var rig = new THREE.Group();
      g.add(rig);
      var tick = fn(rig, g);
      addBlob(g, blobSize || 0.62);
      var swirl = new THREE.Mesh(cg('swirlG', function () { return new THREE.PlaneGeometry(0.8, 0.8); }), TEX.swirlMat);
      swirl.rotation.x = -Math.PI / 2;
      swirl.position.y = 0.06;
      swirl.visible = false;
      swirl.renderOrder = 3;
      g.add(swirl);
      var net = new THREE.Mesh(cg('netG', function () {
        return new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      }), TEX.netMat);
      net.visible = false;
      net.renderOrder = 4;
      g.add(net);
      var ns = netScale || 1;
      g.userData.tick = function (info) {
        var h = info.hit;
        var sq = h < 0.28 ? Math.sin(h / 0.28 * Math.PI) * (1 - h / 0.28) : 0;
        rig.scale.set(1 + sq * 0.3, 1 - sq * 0.3, 1 + sq * 0.3);
        rig.rotation.x = sq * 0.25;
        flashMats(g, h < 0.14 ? 1 - h / 0.14 : 0);
        var snare = info.snare || 0;
        swirl.visible = info.slow < 0.999 && snare <= 0;
        if (swirl.visible) {
          swirl.rotation.z = -info.time * 5;
          var ss = 0.9 + Math.sin(info.time * 9) * 0.06;
          swirl.scale.set(ss, ss, ss);
        }
        net.visible = snare > 0;
        if (net.visible) {
          var d = smooth((1.2 - snare) / 0.25);
          net.scale.set(ns * 1.1, ns * (1.5 - 0.15 * Math.sin(info.time * 14)), ns * 1.1);
          net.position.y = (1 - d) * 1.2;
        }
        tick(info);
      };
      return g;
    };
  }

  function tower(fn, felt, starY) {
    return function () {
      var g = new THREE.Group();
      var base = new THREE.Group();
      g.add(base);
      var wood = mat(0x9a6438, { roughness: 0.45, clearcoat: 0.3 });
      base.add(cyl(0.31, 0.33, 0.07, wood, 0, 0.035, 0, true, 28));
      base.add(cyl(0.275, 0.275, 0.014, mat(felt, { roughness: 0.95 }), 0, 0.075, 0, false, 28));
      var gold = mat(0xf2c14e, { metalness: 0.85, roughness: 0.25, emissive: 0x7a4a00, emissiveIntensity: 0.35 });
      var trim = tor(0.31, 0.024, gold, 0, 0.07, 0);
      trim.rotation.x = Math.PI / 2;
      trim.visible = false;
      base.add(trim);
      var star = mesh(cg('star', function () { return starGeometry(0.1, 0.045, 0.03); }), gold, 0, starY, 0, false);
      star.visible = false;
      g.add(star);
      var rig = new THREE.Group();
      rig.position.y = 0.08;
      g.add(rig);
      var tick = fn(rig, g);
      addBlob(g, 0.92);
      g.userData.tick = function (info) {
        trim.visible = !!info.upgraded;
        star.visible = !!info.upgraded;
        if (star.visible) {
          star.rotation.y = info.time * 2.2;
          star.position.y = starY + Math.sin(info.time * 2.6) * 0.035;
        }
        var f = info.fire;
        var s = f < 0.32 ? Math.sin(f / 0.32 * Math.PI) * (1 - f / 0.32) : 0;
        rig.scale.set(1 + s * 0.22, 1 - s * 0.26, 1 + s * 0.22);
        tick(info);
      };
      return g;
    };
  }

  // ---- marchers --------------------------------------------------------

  var buildSoldier = marcher(function (rig) {
    var green = mat(0x5f9440, { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    var dark = mat(0x456d2d, { roughness: 0.5 });
    var eye = mat(0x1c2414, { roughness: 0.3 });
    var hop = new THREE.Group();
    rig.add(hop);
    hop.add(rbox(0.34, 0.035, 0.27, 0.015, green, 0, 0.018, 0, true));
    var legL = rbox(0.08, 0.2, 0.09, 0.025, green, -0.055, 0.135, -0.03, true);
    var legR = rbox(0.08, 0.2, 0.09, 0.025, green, 0.055, 0.135, 0.04, false);
    legL.rotation.x = 0.25;
    legR.rotation.x = -0.25;
    hop.add(legL);
    hop.add(legR);
    hop.add(rbox(0.21, 0.21, 0.14, 0.05, green, 0, 0.33, 0, true));
    hop.add(box(0.215, 0.035, 0.145, dark, 0, 0.25, 0));
    hop.add(rbox(0.15, 0.15, 0.07, 0.03, dark, 0, 0.34, 0.095));
    hop.add(ball(0.08, green, 0, 0.5, 0, true));
    var helmet = ball(0.092, dark, 0, 0.53, 0.005, false);
    helmet.scale.set(1, 0.72, 1);
    hop.add(helmet);
    var brim = tor(0.088, 0.016, dark, 0, 0.515, 0);
    brim.rotation.x = Math.PI / 2;
    hop.add(brim);
    hop.add(ball(0.017, eye, -0.032, 0.5, -0.072));
    hop.add(ball(0.017, eye, 0.032, 0.5, -0.072));
    var arm = rbox(0.06, 0.18, 0.06, 0.025, green, 0.12, 0.34, -0.04);
    arm.rotation.x = -0.9;
    hop.add(arm);
    var arm2 = rbox(0.06, 0.18, 0.06, 0.025, green, -0.12, 0.34, -0.04);
    arm2.rotation.x = -0.9;
    hop.add(arm2);
    var rifle = box(0.035, 0.035, 0.42, dark, 0.0, 0.4, -0.15);
    rifle.rotation.x = 0.35;
    hop.add(rifle);
    return function (info) {
      var ph = info.progress * 5.4;
      var hh = Math.abs(Math.sin(ph));
      hop.position.y = hh * 0.1;
      var sq = 1 + (hh - 0.35) * 0.14;
      hop.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      hop.rotation.x = -Math.cos(ph) * 0.12 * Math.sign(Math.sin(ph));
    };
  }, 0.58, 0.95);

  var buildTin = marcher(function (rig) {
    var tin = mat(0xc4ccd4, { metalness: 0.85, roughness: 0.28 });
    var red = mat(0xd64545, { roughness: 0.35, clearcoat: 0.6 });
    var dark = mat(0x3b434b, { metalness: 0.5, roughness: 0.4 });
    var glow = mat(0xfff2a8, { emissive: 0xffd34d, emissiveIntensity: 1.2 });
    var body = new THREE.Group();
    rig.add(body);
    var legL = new THREE.Group();
    var legR = new THREE.Group();
    legL.position.set(-0.065, 0.16, 0);
    legR.position.set(0.065, 0.16, 0);
    legL.add(cyl(0.04, 0.04, 0.13, dark, 0, -0.07, 0, true, 12));
    legR.add(cyl(0.04, 0.04, 0.13, dark, 0, -0.07, 0, true, 12));
    legL.add(rbox(0.09, 0.04, 0.12, 0.015, red, 0, -0.14, -0.015));
    legR.add(rbox(0.09, 0.04, 0.12, 0.015, red, 0, -0.14, -0.015));
    rig.add(legL);
    rig.add(legR);
    body.add(cyl(0.13, 0.14, 0.24, tin, 0, 0.29, 0, true, 24));
    var band = cyl(0.142, 0.142, 0.05, red, 0, 0.24, 0, false, 24);
    body.add(band);
    body.add(ball(0.03, glow, 0, 0.33, -0.13));
    body.add(rbox(0.21, 0.16, 0.18, 0.04, tin, 0, 0.5, 0, true));
    body.add(ball(0.03, glow, -0.05, 0.51, -0.09));
    body.add(ball(0.03, glow, 0.05, 0.51, -0.09));
    body.add(box(0.1, 0.022, 0.01, dark, 0, 0.455, -0.091));
    body.add(cyl(0.008, 0.008, 0.12, dark, 0, 0.64, 0, false, 6));
    body.add(ball(0.028, red, 0, 0.71, 0));
    var key = new THREE.Group();
    key.position.set(0, 0.32, 0.15);
    key.add(cyl(0.012, 0.012, 0.06, tin, 0, 0, 0, false, 8));
    key.children[0].rotation.x = Math.PI / 2;
    var l1 = tor(0.04, 0.012, mat(0xf2c14e, { metalness: 0.8, roughness: 0.3 }), -0.04, 0, 0.035);
    var l2 = tor(0.04, 0.012, l1.material, 0.04, 0, 0.035);
    l1.rotation.y = Math.PI / 2;
    l2.rotation.y = Math.PI / 2;
    key.add(l1);
    key.add(l2);
    body.add(key);
    var shieldG = new THREE.Group();
    shieldG.position.set(0, 0.3, -0.2);
    var lid = cyl(0.14, 0.14, 0.025, mat(0xdfe5ea, { metalness: 0.9, roughness: 0.2 }), 0, 0, 0, true, 28);
    lid.rotation.x = Math.PI / 2;
    shieldG.add(lid);
    var knob = ball(0.03, red, 0, 0, -0.025);
    shieldG.add(knob);
    var crackMat = mat(0x22262a, { roughness: 0.5 });
    var c1 = box(0.12, 0.012, 0.01, crackMat, 0.03, 0.04, -0.016);
    c1.rotation.z = 0.5;
    var c2 = box(0.1, 0.012, 0.01, crackMat, -0.04, -0.03, -0.016);
    c2.rotation.z = -0.8;
    shieldG.add(c1);
    shieldG.add(c2);
    body.add(shieldG);
    return function (info) {
      var ph = info.progress * 7;
      var sw = Math.sin(ph);
      legL.rotation.x = sw * 0.6;
      legR.rotation.x = -sw * 0.6;
      body.rotation.z = sw * 0.08;
      body.position.y = Math.abs(Math.cos(ph)) * 0.03;
      key.rotation.z = info.time * 5;
      var shield = info.shield || 0;
      shieldG.visible = shield < 3;
      c1.visible = shield >= 1;
      c2.visible = shield >= 2;
      shieldG.rotation.z = shield >= 2 ? 0.25 : 0;
    };
  }, 0.62, 1.05);

  var buildCar = marcher(function (rig) {
    var paint = mat(0xe0453a, { roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
    var glass = mat(0x2b3f5c, { roughness: 0.1, metalness: 0.3, clearcoat: 1 });
    var tire = mat(0x24221f, { roughness: 0.8 });
    var chrome = mat(0xe8eef2, { metalness: 0.9, roughness: 0.18 });
    var white = mat(0xfff8ec, { roughness: 0.4 });
    var lamp = mat(0xfff4cf, { emissive: 0xffe08a, emissiveIntensity: 1.2 });
    var tail = mat(0xff6a5a, { emissive: 0xff2a1a, emissiveIntensity: 0.6 });
    var body = new THREE.Group();
    rig.add(body);
    body.add(rbox(0.36, 0.15, 0.58, 0.06, paint, 0, 0.18, 0, true));
    body.add(rbox(0.285, 0.085, 0.3, 0.04, glass, 0, 0.29, 0.04));
    body.add(rbox(0.27, 0.05, 0.25, 0.03, paint, 0, 0.345, 0.04, true));
    body.add(box(0.075, 0.006, 0.17, white, 0, 0.257, -0.2));
    body.add(box(0.075, 0.006, 0.12, white, 0, 0.373, 0.04));
    body.add(box(0.075, 0.006, 0.1, white, 0, 0.257, 0.24));
    body.add(ball(0.034, lamp, -0.11, 0.19, -0.285));
    body.add(ball(0.034, lamp, 0.11, 0.19, -0.285));
    body.add(box(0.06, 0.03, 0.01, tail, -0.11, 0.2, 0.291));
    body.add(box(0.06, 0.03, 0.01, tail, 0.11, 0.2, 0.291));
    body.add(rbox(0.38, 0.045, 0.045, 0.02, chrome, 0, 0.12, -0.29));
    body.add(rbox(0.38, 0.045, 0.045, 0.02, chrome, 0, 0.12, 0.29));
    var numT = TEX.num7;
    var numM = mat(0xffffff, { map: numT, roughness: 0.4 });
    var n1 = mesh(cg('numdisc', function () { return new THREE.CircleGeometry(0.055, 20); }), numM, 0.181, 0.19, 0.02);
    n1.rotation.y = Math.PI / 2;
    var n2 = mesh(n1.geometry, numM, -0.181, 0.19, 0.02);
    n2.rotation.y = -Math.PI / 2;
    body.add(n1);
    body.add(n2);
    var wheels = [];
    var spots = [[-0.18, 0.18], [0.18, 0.18], [-0.18, -0.18], [0.18, -0.18]];
    for (var i = 0; i < spots.length; i++) {
      var w = new THREE.Group();
      w.position.set(spots[i][0], 0.09, spots[i][1]);
      var t = cyl(0.09, 0.09, 0.075, tire, 0, 0, 0, true, 20);
      t.rotation.z = Math.PI / 2;
      var hub = cyl(0.045, 0.045, 0.08, chrome, 0, 0, 0, false, 12);
      hub.rotation.z = Math.PI / 2;
      var spoke = box(0.082, 0.07, 0.016, white, 0, 0, 0);
      w.add(t);
      w.add(hub);
      w.add(spoke);
      rig.add(w);
      wheels.push(w);
    }
    return function (info) {
      var spin = -info.progress / 0.09;
      for (var n = 0; n < wheels.length; n++) wheels[n].rotation.x = spin;
      body.position.y = Math.abs(Math.sin(info.progress * 14)) * 0.025;
      body.rotation.x = Math.sin(info.progress * 9) * 0.03;
    };
  }, 0.7, 1.05);

  var buildTeddy = marcher(function (rig) {
    var fur = mat(0xc07f45, { roughness: 0.85, sheen: 0.6, sheenColor: 0xffd9b0 });
    var cream = mat(0xf1d3a8, { roughness: 0.85, sheen: 0.4, sheenColor: 0xffffff });
    var pink = mat(0xf2a0a8, { roughness: 0.7 });
    var dark = mat(0x24150e, { roughness: 0.2, clearcoat: 1 });
    var white = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.4 });
    var bow = mat(0x3f86d6, { roughness: 0.4, clearcoat: 0.4 });
    var body = new THREE.Group();
    rig.add(body);
    var torso = ball(0.19, fur, 0, 0.27, 0, true);
    torso.scale.set(1, 1.05, 0.92);
    body.add(torso);
    var belly = ball(0.12, cream, 0, 0.25, -0.115);
    belly.scale.set(1, 1.15, 0.5);
    body.add(belly);
    body.add(ball(0.165, fur, 0, 0.55, 0, true));
    body.add(ball(0.068, fur, -0.125, 0.68, 0.0));
    body.add(ball(0.068, fur, 0.125, 0.68, 0.0));
    var e1 = ball(0.04, pink, -0.125, 0.68, -0.035);
    e1.scale.z = 0.5;
    var e2 = ball(0.04, pink, 0.125, 0.68, -0.035);
    e2.scale.z = 0.5;
    body.add(e1);
    body.add(e2);
    var muz = ball(0.072, cream, 0, 0.51, -0.13);
    muz.scale.set(1.15, 0.85, 0.8);
    body.add(muz);
    var nose = ball(0.03, dark, 0, 0.54, -0.19);
    nose.scale.set(1.3, 0.9, 0.9);
    body.add(nose);
    body.add(ball(0.027, dark, -0.062, 0.6, -0.138));
    body.add(ball(0.027, dark, 0.062, 0.6, -0.138));
    body.add(ball(0.009, white, -0.054, 0.611, -0.163));
    body.add(ball(0.009, white, 0.07, 0.611, -0.163));
    var b1 = mesh(cg('bowcone', function () { return new THREE.ConeGeometry(0.045, 0.08, 4); }), bow, -0.045, 0.415, -0.12);
    b1.rotation.z = Math.PI / 2;
    var b2 = mesh(b1.geometry, bow, 0.045, 0.415, -0.12);
    b2.rotation.z = -Math.PI / 2;
    body.add(b1);
    body.add(b2);
    body.add(ball(0.022, bow, 0, 0.415, -0.125));
    var legL = new THREE.Group();
    var legR = new THREE.Group();
    legL.position.set(-0.09, 0.14, 0);
    legR.position.set(0.09, 0.14, 0);
    var f1 = ball(0.075, fur, 0, -0.06, -0.01, true);
    f1.scale.set(1, 0.9, 1.25);
    var f2 = ball(0.075, fur, 0, -0.06, -0.01, true);
    f2.scale.set(1, 0.9, 1.25);
    legL.add(f1);
    legR.add(f2);
    var p1 = ball(0.045, cream, 0, -0.06, -0.09);
    p1.scale.z = 0.4;
    var p2 = ball(0.045, cream, 0, -0.06, -0.09);
    p2.scale.z = 0.4;
    legL.add(p1);
    legR.add(p2);
    var armL = new THREE.Group();
    var armR = new THREE.Group();
    armL.position.set(-0.19, 0.34, 0);
    armR.position.set(0.19, 0.34, 0);
    var a1 = ball(0.06, fur, 0, -0.07, 0);
    a1.scale.set(0.9, 1.35, 0.9);
    var a2 = ball(0.06, fur, 0, -0.07, 0);
    a2.scale.set(0.9, 1.35, 0.9);
    armL.add(a1);
    armR.add(a2);
    rig.add(legL);
    rig.add(legR);
    body.add(armL);
    body.add(armR);
    return function (info) {
      var ph = info.progress * 7;
      var sw = Math.sin(ph);
      body.rotation.z = sw * 0.16;
      body.position.y = Math.abs(sw) * 0.045;
      legL.rotation.x = sw * 0.7;
      legR.rotation.x = -sw * 0.7;
      armL.rotation.x = -sw * 0.7;
      armR.rotation.x = sw * 0.7;
      armL.rotation.z = -0.2;
      armR.rotation.z = 0.2;
    };
  }, 0.68, 1.15);

  var buildBlock = marcher(function (rig, root) {
    var S = 0.36;
    var m = mat(0xffffff, { map: TEX.letters, roughness: 0.5, clearcoat: 0.3 });
    var cube = mesh(cg('letterCube', function () {
      var g = roundedBoxGeometry(S, S, S, 0.045, 3);
      var uv = g.attributes.uv;
      var per = uv.count / 6;
      for (var i = 0; i < uv.count; i++) {
        var f = Math.floor(i / per);
        uv.setXY(i, ((f % 3) + uv.getX(i)) / 3, (1 - Math.floor(f / 3)) * 0.5 + uv.getY(i) * 0.5);
      }
      return g;
    }), m, 0, S / 2, 0, true);
    var hold = new THREE.Group();
    hold.add(cube);
    rig.add(hold);
    var lastN = -1;
    return function (info) {
      var L = 0.62;
      var p = info.progress / L;
      var n = Math.floor(p);
      var f = p - n;
      var a = smooth(Math.min(1, f * 1.35)) * Math.PI / 2;
      cube.rotation.set(-(n * Math.PI / 2 + a), 0, 0);
      cube.position.y = (S / 2) * Math.SQRT2 * Math.sin(a + Math.PI / 4);
      if (n !== lastN) {
        if (lastN >= 0 && n === lastN + 1 && softFx && info.progress > 0.6) dust(root.position.x, root.position.z, 3, 0.7);
        lastN = n;
      }
    };
  }, 0.66, 1.0);

  var buildBalloon = marcher(function (rig) {
    var skin = mat(0xf0454f, { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
    var dark = mat(0x3a1418, { roughness: 0.3 });
    var white = mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.2 });
    var str = mat(0xf4ead8, { roughness: 0.6 });
    var bal = new THREE.Group();
    rig.add(bal);
    var b = ball(0.2, skin, 0, 0, 0, true);
    b.scale.set(1, 1.14, 1);
    bal.add(b);
    var knot = mesh(cg('knot', function () { return new THREE.ConeGeometry(0.035, 0.05, 10); }), skin, 0, -0.245, 0);
    knot.rotation.x = Math.PI;
    bal.add(knot);
    bal.add(ball(0.024, dark, -0.06, 0.04, -0.18));
    bal.add(ball(0.024, dark, 0.06, 0.04, -0.18));
    bal.add(ball(0.008, white, -0.053, 0.05, -0.2));
    bal.add(ball(0.008, white, 0.067, 0.05, -0.2));
    var smile = tor(0.045, 0.008, dark, 0, -0.02, -0.188, false, Math.PI);
    smile.rotation.z = Math.PI;
    smile.rotation.x = -0.25;
    bal.add(smile);
    var cheek = mat(0xff9aa6, { roughness: 0.5, transparent: true, opacity: 0.7 });
    var ch1 = ball(0.022, cheek, -0.105, -0.01, -0.16);
    ch1.scale.z = 0.3;
    var ch2 = ball(0.022, cheek, 0.105, -0.01, -0.16);
    ch2.scale.z = 0.3;
    ch1.rotation.y = 0.5;
    ch2.rotation.y = -0.5;
    bal.add(ch1);
    bal.add(ch2);
    var shine = ball(0.04, white, -0.08, 0.1, -0.12);
    shine.scale.set(0.6, 1.1, 0.4);
    bal.add(shine);
    var string = cyl(0.007, 0.007, 1, str, 0, 0.4, 0, false, 6);
    rig.add(string);
    return function (info) {
      var t = info.time + info.progress * 0.7;
      bal.position.set(Math.sin(t * 1.3) * 0.07, 0.96 + Math.sin(t * 2.1) * 0.06, Math.cos(t * 0.9) * 0.03);
      bal.rotation.z = Math.sin(t * 1.3) * 0.15;
      stretchBetween(string, Math.sin(t * 3) * 0.02, 0.04, 0, bal.position.x, bal.position.y - 0.26, bal.position.z);
    };
  }, 0.5, 1.0);

  // ---- towers ----------------------------------------------------------

  var buildMarble = tower(function (rig) {
    var cup = mat(0xd9a35b, { roughness: 0.35, metalness: 0.3 });
    rig.add(cyl(0.1, 0.14, 0.08, cup, 0, 0.04, 0, true));
    var holder = new THREE.Group();
    rig.add(holder);
    var glass = mat(0xa8dcff, { roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.5, env: 1.8 });
    var core = mesh(cg('swirlKnot', function () { return new THREE.TorusKnotGeometry(0.08, 0.024, 72, 8, 2, 3); }),
      mat(0xff7a3d, { roughness: 0.3, emissive: 0x8a2a00, emissiveIntensity: 0.4 }), 0, 0, 0, true);
    var core2 = mesh(cg('swirlKnot2', function () { return new THREE.TorusKnotGeometry(0.06, 0.016, 64, 6, 3, 2); }),
      mat(0x3fb6e0, { roughness: 0.3, emissive: 0x003a5a, emissiveIntensity: 0.4 }), 0, 0, 0);
    var sphere = ball(0.2, glass, 0, 0, 0);
    var shine = ball(0.035, mat(0xffffff, { emissive: 0xffffff, emissiveIntensity: 1 }), -0.08, 0.1, -0.11);
    shine.scale.set(0.7, 1, 0.4);
    holder.add(core);
    holder.add(core2);
    holder.add(sphere);
    holder.add(shine);
    var orbit = new THREE.Group();
    rig.add(orbit);
    var o1 = ball(0.055, mat(0x7fe0a8, { roughness: 0.1, clearcoat: 1 }), 0.32, 0, 0, true);
    var o2 = ball(0.055, mat(0xf6c84c, { roughness: 0.1, clearcoat: 1 }), -0.32, 0, 0, true);
    orbit.add(o1);
    orbit.add(o2);
    return function (info) {
      var f = info.fire;
      var kick = f < 0.2 ? Math.sin(f / 0.2 * Math.PI) : 0;
      var y = 0.34 + Math.sin(info.time * 2.4) * 0.04 + kick * 0.06;
      holder.position.y = y;
      core.rotation.set(info.time * 0.7, info.time * 1.6, 0);
      core2.rotation.set(-info.time * 0.9, -info.time * 1.1, 0);
      orbit.visible = !!info.upgraded;
      orbit.position.y = y;
      orbit.rotation.y = info.time * 2.4;
    };
  }, 0x3f6fb0, 0.78);

  var buildPillow = tower(function (rig) {
    var pink = mat(0xf6a9bb, { roughness: 0.9, sheen: 1, sheenColor: 0xffffff });
    var deep = mat(0xe07a95, { roughness: 0.8, sheen: 0.6, sheenColor: 0xffd0dc });
    var cream = mat(0xfff4ea, { roughness: 0.7 });
    var p = new THREE.Group();
    rig.add(p);
    p.add(mesh(cg('pillowG', function () { return puffyGeometry(0.52, 0.09, 0.44, 1.35); }), pink, 0, 0.13, 0, true));
    var tas = [[-0.26, -0.22], [0.26, -0.22], [-0.26, 0.22], [0.26, 0.22]];
    for (var i = 0; i < 4; i++) p.add(ball(0.032, deep, tas[i][0], 0.13, tas[i][1]));
    var heart = mesh(cg('heartG', function () {
      var g = new THREE.ShapeGeometry(heartShape(0.07), 10);
      return g;
    }), cream, 0, 0.237, 0.0);
    heart.rotation.x = -Math.PI / 2;
    p.add(heart);
    return function (info) {
      var s = Math.sin(info.time * 2.6);
      p.scale.set(1 - s * 0.03, 1 + s * 0.08, 1 - s * 0.03);
    };
  }, 0xe0607e, 0.62);

  var buildFan = tower(function (rig) {
    var cream = mat(0xf7efe0, { roughness: 0.35, clearcoat: 0.5 });
    var mint = mat(0x7cc8b5, { roughness: 0.35, clearcoat: 0.4 });
    var red = mat(0xe2574c, { roughness: 0.3, clearcoat: 0.5 });
    var metal = mat(0xc7cdd2, { metalness: 0.85, roughness: 0.22 });
    rig.add(cyl(0.16, 0.19, 0.06, cream, 0, 0.03, 0, true, 28));
    rig.add(cyl(0.028, 0.034, 0.26, metal, 0, 0.18, 0, true, 10));
    var head = new THREE.Group();
    head.position.set(0, 0.44, 0);
    rig.add(head);
    var motor = ball(0.085, cream, 0, 0, 0.08, true);
    motor.scale.set(1, 1, 1.25);
    head.add(motor);
    var ringF = tor(0.215, 0.012, metal, 0, 0, -0.045);
    var ringB = tor(0.2, 0.01, metal, 0, 0, 0.03);
    head.add(ringF);
    head.add(ringB);
    for (var i = 0; i < 4; i++) {
      var sp = box(0.43, 0.007, 0.007, metal, 0, 0, -0.048);
      sp.rotation.z = i * Math.PI / 4;
      head.add(sp);
    }
    var blades = new THREE.Group();
    blades.position.z = -0.01;
    head.add(blades);
    for (i = 0; i < 4; i++) {
      var piv = new THREE.Group();
      piv.rotation.z = i * Math.PI / 2;
      var bl = ball(0.1, mint, 0, 0.1, 0, true);
      bl.scale.set(0.58, 1, 0.12);
      bl.rotation.y = 0.35;
      piv.add(bl);
      blades.add(piv);
    }
    blades.add(ball(0.04, red, 0, 0, -0.02));
    return function (info) {
      head.rotation.y = Math.sin(info.time * 0.9) * 0.5;
      blades.rotation.z = -info.time * (info.upgraded ? 22 : 15);
    };
  }, 0x5aa7a0, 0.82);

  var buildBand = tower(function (rig) {
    var wood = mat(0xa8713f, { roughness: 0.5, clearcoat: 0.3 });
    var grip = mat(0xd8564a, { roughness: 0.6 });
    var rubber = mat(0xf5c242, { roughness: 0.4, clearcoat: 0.3 });
    var leather = mat(0x6b3e22, { roughness: 0.7 });
    var stone = mat(0x9fd6ff, { roughness: 0.1, clearcoat: 1 });
    rig.add(cyl(0.036, 0.042, 0.24, wood, 0, 0.12, 0, true, 12));
    rig.add(cyl(0.046, 0.046, 0.1, grip, 0, 0.1, 0, false, 12));
    var pL = cyl(0.03, 0.03, 1, wood, 0, 0, 0, true, 10);
    var pR = cyl(0.03, 0.03, 1, wood, 0, 0, 0, true, 10);
    rig.add(pL);
    rig.add(pR);
    stretchBetween(pL, 0, 0.22, 0, -0.11, 0.44, 0);
    stretchBetween(pR, 0, 0.22, 0, 0.11, 0.44, 0);
    rig.add(ball(0.036, wood, -0.11, 0.44, 0));
    rig.add(ball(0.036, wood, 0.11, 0.44, 0));
    var bL = cyl(0.013, 0.013, 1, rubber, 0, 0, 0, false, 6);
    var bR = cyl(0.013, 0.013, 1, rubber, 0, 0, 0, false, 6);
    rig.add(bL);
    rig.add(bR);
    var pouch = rbox(0.09, 0.055, 0.04, 0.016, leather, 0, 0.42, 0.05);
    rig.add(pouch);
    var pebble = ball(0.034, stone, 0, 0.42, 0.05);
    rig.add(pebble);
    return function (info) {
      var f = info.fire;
      var z;
      if (f < 0.1) z = 0.05 - 0.2 * (f / 0.1) + 0.0;
      else if (f < 0.35) z = -0.15 + Math.sin((f - 0.1) / 0.25 * Math.PI * 3) * 0.04 * (1 - (f - 0.1) / 0.25) + (f - 0.1) / 0.25 * 0.15;
      else z = Math.min(0.2, (f - 0.35) * 0.22);
      z = Math.max(-0.05, z);
      var wob = Math.sin(info.time * 6) * 0.004;
      pouch.position.set(0, 0.42 + wob, z + 0.03);
      pebble.position.set(0, 0.42 + wob, z + 0.03);
      pebble.visible = f > 0.35;
      stretchBetween(bL, -0.11, 0.44, 0, -0.04, 0.42 + wob, z + 0.03);
      stretchBetween(bR, 0.11, 0.44, 0, 0.04, 0.42 + wob, z + 0.03);
    };
  }, 0xd8a03a, 0.7);

  var buildBowl = tower(function (rig) {
    var china = mat(0xfaf6ee, { roughness: 0.25, clearcoat: 0.6, side: THREE.DoubleSide });
    var blue = mat(0x4f86c6, { roughness: 0.3, clearcoat: 0.5 });
    var milk = mat(0xfffdf6, { roughness: 0.2 });
    var silver = mat(0xdfe5ea, { metalness: 0.9, roughness: 0.18 });
    var bowl = new THREE.Group();
    rig.add(bowl);
    var pts = [
      new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.11, 0.0), new THREE.Vector2(0.13, 0.02),
      new THREE.Vector2(0.2, 0.06), new THREE.Vector2(0.25, 0.14), new THREE.Vector2(0.265, 0.21)
    ];
    bowl.add(mesh(cg('bowlLathe', function () { return new THREE.LatheGeometry(pts, 32); }), china, 0, 0, 0, true));
    var rim = tor(0.262, 0.016, blue, 0, 0.21, 0);
    rim.rotation.x = Math.PI / 2;
    bowl.add(rim);
    var surf = mesh(cg('milkDisc', function () { return new THREE.CircleGeometry(0.235, 28); }), milk, 0, 0.165, 0);
    surf.rotation.x = -Math.PI / 2;
    bowl.add(surf);
    var cols = [0xf2a33a, 0xe5484d, 0xf2c53a, 0x8f63c9, 0x5ab552, 0xf2a33a, 0xe5484d];
    var rr = rng(9);
    for (var i = 0; i < cols.length; i++) {
      var o = tor(0.032, 0.013, mat(cols[i], { roughness: 0.6 }), (rr() - 0.5) * 0.3, 0.172, (rr() - 0.5) * 0.3);
      o.rotation.x = Math.PI / 2 + (rr() - 0.5) * 0.5;
      bowl.add(o);
    }
    var spoon = new THREE.Group();
    spoon.position.set(0.1, 0.2, 0.05);
    spoon.rotation.set(0.3, 0.4, -0.7);
    spoon.add(box(0.026, 0.01, 0.26, silver, 0, 0, 0.1));
    var sb = ball(0.045, silver, 0, 0, -0.04);
    sb.scale.set(0.8, 0.3, 1.1);
    spoon.add(sb);
    bowl.add(spoon);
    return function (info) {
      var f = info.fire;
      var tilt = f < 0.6 ? Math.sin(f / 0.6 * Math.PI) * 0.5 : 0;
      bowl.rotation.x = -tilt + Math.sin(info.time * 1.4) * 0.04;
      bowl.rotation.z = Math.sin(info.time * 1.1) * 0.04;
    };
  }, 0x4f86c6, 0.62);

  var buildBlanket = tower(function (rig) {
    var quilt = mat(0xffffff, { map: TEX.quilt, roughness: 0.9, sheen: 0.6, sheenColor: 0xffffff, side: THREE.DoubleSide });
    var wood = mat(0xa8713f, { roughness: 0.6 });
    var flag = mat(0xf0913a, { roughness: 0.6, side: THREE.DoubleSide });
    var tent = mesh(cg('tentG', function () {
      var pos = [];
      var uv = [];
      var idx = [];
      var NU = 8;
      var NV = 6;
      for (var s = -1; s <= 1; s += 2) {
        var base = pos.length / 3;
        for (var j = 0; j <= NV; j++) {
          for (var i = 0; i <= NU; i++) {
            var u = i / NU;
            var v = j / NV;
            var z = -0.28 + u * 0.56;
            var x = s * 0.31 * v;
            var y = 0.46 - 0.44 * v - Math.sin(v * Math.PI) * 0.035 + (v > 0.85 ? Math.sin(u * Math.PI * 8) * 0.012 * (v - 0.85) / 0.15 : 0);
            pos.push(x, y, z);
            uv.push(u, v);
          }
        }
        for (j = 0; j < NV; j++) {
          for (i = 0; i < NU; i++) {
            var a = base + j * (NU + 1) + i;
            var b = a + 1;
            var c = a + NU + 1;
            var d = c + 1;
            if (s < 0) idx.push(a, c, b, b, c, d);
            else idx.push(a, b, c, b, d, c);
          }
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }), quilt, 0, 0, 0, true);
    rig.add(tent);
    var inner = box(0.5, 0.01, 0.5, mat(0x5a3a5a, { roughness: 1 }), 0, 0.005, 0);
    rig.add(inner);
    var pole = cyl(0.012, 0.012, 0.66, wood, 0, 0.0, 0, true, 6);
    pole.rotation.x = Math.PI / 2;
    pole.position.set(0, 0.47, 0);
    rig.add(pole);
    rig.add(cyl(0.008, 0.008, 0.22, wood, 0, 0.58, 0.0, false, 6));
    var fl = mesh(cg('flagG', function () {
      var s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.16, -0.04);
      s.lineTo(0, -0.08);
      s.closePath();
      return new THREE.ShapeGeometry(s);
    }), flag, 0, 0.69, 0);
    rig.add(fl);
    return function (info) {
      fl.rotation.y = Math.sin(info.time * 5) * 0.4 + 0.6;
      var s = Math.sin(info.time * 1.6);
      tent.scale.set(1 + s * 0.025, 1 - s * 0.02, 1);
    };
  }, 0x8f63c9, 0.82);

  var buildCatch = tower(function (rig) {
    var wood = mat(0xa8713f, { roughness: 0.55, clearcoat: 0.3 });
    var red = mat(0xe5484d, { roughness: 0.35, clearcoat: 0.5 });
    var net = mat(0xffffff, { map: TEX.netTex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, roughness: 0.8 });
    net.alphaTest = 0.3;
    rig.add(cyl(0.1, 0.12, 0.06, red, 0, 0.03, 0, true, 20));
    var arm = new THREE.Group();
    arm.position.y = 0.06;
    rig.add(arm);
    arm.add(cyl(0.022, 0.026, 0.5, wood, 0, 0.25, 0, true, 10));
    var head = new THREE.Group();
    head.position.y = 0.66;
    arm.add(head);
    head.add(tor(0.16, 0.016, red, 0, 0, 0, true));
    var cone = mesh(cg('netCone', function () { return new THREE.ConeGeometry(0.16, 0.3, 18, 3, true); }), net, 0, 0, 0.15);
    cone.rotation.x = Math.PI / 2;
    head.add(cone);
    return function (info) {
      var f = info.fire;
      var sw = f < 0.6 ? Math.sin(f / 0.6 * Math.PI) : 0;
      arm.rotation.x = -sw * 0.9 + Math.sin(info.time * 1.6) * 0.06;
      head.rotation.z = Math.sin(info.time * 2.2) * 0.15;
    };
  }, 0xe5484d, 0.92);

  var BUILD = {
    marble: buildMarble,
    pillow: buildPillow,
    fan: buildFan,
    band: buildBand,
    bowl: buildBowl,
    blanket: buildBlanket,
    catch: buildCatch,
    soldier: buildSoldier,
    car: buildCar,
    teddy: buildTeddy,
    block: buildBlock,
    balloon: buildBalloon,
    tin: buildTin
  };

  function build(type, asGhost) {
    ghosting = !!asGhost;
    var sink = [];
    matSink = sink;
    var fn = BUILD[type] || buildMarble;
    var g;
    try {
      g = fn();
    } finally {
      ghosting = false;
      matSink = null;
    }
    g.userData.kind = type;
    g.userData.mats = sink;
    g.userData.base = MARCH[type] ? 1.72 : 1.5;
    g.scale.setScalar(g.userData.base);
    if (asGhost) g.traverse(function (o) { o.castShadow = false; o.receiveShadow = false; });
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* The room                                                            */
  /* ------------------------------------------------------------------ */

  function staticGroup() {
    var g = new THREE.Group();
    scene.add(g);
    return g;
  }

  function rugGeometry(k) {
    var pos = [];
    var nor = [];
    var uv = [];
    var Y0 = 0.006;
    var Y1 = 0.042;
    function U(x) { return x / 16; }
    function V(z) { return 1 - z / 10; }
    function quad(p, n, uvs) {
      var ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
      var bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
      var cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      var order = (cx * n[0] + cy * n[1] + cz * n[2]) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (var i = 0; i < 6; i++) {
        var q = order[i];
        pos.push(p[q][0], p[q][1], p[q][2]);
        nor.push(n[0], n[1], n[2]);
        uv.push(uvs[q][0], uvs[q][1]);
      }
    }
    for (var r = -1; r <= 10; r++) {
      for (var c = -1; c <= 16; c++) {
        if (!rugAt(k, c, r)) continue;
        var x0 = c === -1 ? -0.5 : c;
        var x1 = c + 1;
        var z0 = r;
        var z1 = r + 1;
        var uvx0 = c === -1 ? 0.001 : U(x0);
        quad([[x0, Y1, z0], [x0, Y1, z1], [x1, Y1, z1], [x1, Y1, z0]], [0, 1, 0],
          [[uvx0, V(z0)], [uvx0, V(z1)], [U(x1), V(z1)], [U(x1), V(z0)]]);
        if (!rugAt(k, c, r - 1)) {
          quad([[x0, Y0, z0], [x1, Y0, z0], [x1, Y1, z0], [x0, Y1, z0]], [0, 0, -1],
            [[uvx0, V(z0)], [U(x1), V(z0)], [U(x1), V(z0)], [uvx0, V(z0)]]);
        }
        if (!rugAt(k, c, r + 1)) {
          quad([[x0, Y0, z1], [x1, Y0, z1], [x1, Y1, z1], [x0, Y1, z1]], [0, 0, 1],
            [[uvx0, V(z1)], [U(x1), V(z1)], [U(x1), V(z1)], [uvx0, V(z1)]]);
        }
        if (!rugAt(k, c - 1, r)) {
          quad([[x0, Y0, z0], [x0, Y0, z1], [x0, Y1, z1], [x0, Y1, z0]], [-1, 0, 0],
            [[uvx0, V(z0)], [uvx0, V(z1)], [uvx0, V(z1)], [uvx0, V(z0)]]);
        }
        if (!rugAt(k, c + 1, r)) {
          quad([[x1, Y0, z0], [x1, Y0, z1], [x1, Y1, z1], [x1, Y1, z0]], [1, 0, 0],
            [[U(x1), V(z0)], [U(x1), V(z1)], [U(x1), V(z1)], [U(x1), V(z0)]]);
        }
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }

  function addFloorAndBoard() {
    var k = kindGrid();
    var G = staticGroup();
    var fl = plankTexture();
    fl.wrapS = fl.wrapT = THREE.RepeatWrapping;
    fl.repeat.set(10, 10);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), mat(0xffffff, { map: fl, roughness: 0.5, env: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(8, 0, 12);
    floor.receiveShadow = true;
    G.add(floor);

    var frameMat = mat(0x5b3720, { roughness: 0.4, clearcoat: 0.4 });
    var fr = new THREE.Mesh(new THREE.PlaneGeometry(16.8, 10.8), frameMat);
    fr.rotation.x = -Math.PI / 2;
    fr.position.set(8, 0.002, 5);
    fr.receiveShadow = true;
    G.add(fr);
    var brass = mat(0xe8b85a, { metalness: 0.8, roughness: 0.3 });
    var bw = 0.045;
    var strips = [[16.5, bw, 8, -0.2], [16.5, bw, 8, 10.2], [bw, 10.45, -0.2, 5], [bw, 10.45, 16.2, 5]];
    for (var i = 0; i < strips.length; i++) {
      var s = new THREE.Mesh(new THREE.PlaneGeometry(strips[i][0], strips[i][1]), brass);
      s.rotation.x = -Math.PI / 2;
      s.position.set(strips[i][2], 0.003, strips[i][3]);
      s.receiveShadow = true;
      G.add(s);
    }

    var boardMap = boardTexture();
    var board = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), mat(0xffffff, { map: boardMap, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4, env: 0.8 }));
    board.rotation.x = -Math.PI / 2;
    board.position.set(8, 0.004, 5);
    board.receiveShadow = true;
    G.add(board);

    var rug = new THREE.Mesh(rugGeometry(k), mat(0xffffff, { map: boardMap, roughness: 0.95, sheen: 0.6, sheenColor: 0xffd6c8, env: 0.4 }));
    rug.receiveShadow = true;
    rug.castShadow = true;
    G.add(rug);

    // fringe at the rug's far end
    var fringeMat = mat(0xf2e2c2, { roughness: 0.9 });
    var fg = new THREE.CylinderGeometry(0.012, 0.016, 0.16, 5);
    fg.rotateX(Math.PI / 2);
    var fringe = new THREE.InstancedMesh(fg, fringeMat, 16);
    var m4 = new THREE.Matrix4();
    var q = new THREE.Quaternion();
    var e = new THREE.Euler();
    var rr = rng(12);
    for (i = 0; i < 16; i++) {
      e.set(0, (rr() - 0.5) * 0.35, 0);
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(14.06 + i * 0.058, 0.012, 7.07), q, new THREE.Vector3(1, 1, 1));
      fringe.setMatrixAt(i, m4);
    }
    fringe.castShadow = true;
    G.add(fringe);

    // the escape burrow at the end of the rug
    var holeMat = new THREE.MeshBasicMaterial({ map: radialTex([[0, 'rgba(8,4,14,1)'], [0.55, 'rgba(26,12,30,0.98)'], [0.8, 'rgba(60,24,30,0.6)'], [1, 'rgba(60,24,30,0)']]), transparent: true, depthWrite: false });
    var hole = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), holeMat);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(14.5, 0.045, 6.5);
    hole.renderOrder = 2;
    G.add(hole);
    holeSwirl = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({
      map: TEX.swirl, color: 0x9a6cff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    holeSwirl.rotation.x = -Math.PI / 2;
    holeSwirl.position.set(14.5, 0.047, 6.5);
    holeSwirl.renderOrder = 3;
    G.add(holeSwirl);
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 40), mat(0x8a2a2c, { roughness: 1 }));
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 1, 0.6);
    rim.position.set(14.5, 0.045, 6.5);
    rim.receiveShadow = true;
    G.add(rim);

    var scuffMat = new THREE.MeshBasicMaterial({ map: TEX.blob, color: 0x2a1408, transparent: true, opacity: 0.85, depthWrite: false });
    var marks = [[0.42, 0.1], [-0.4, 0.2], [0.3, -0.38], [-0.36, -0.24], [0.05, -0.46], [-0.12, 0.42], [0.4, 0.36], [-0.46, 0.0]];
    for (i = 0; i < marks.length; i++) {
      var sc = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), scuffMat);
      sc.rotation.x = -Math.PI / 2;
      sc.rotation.z = i * 1.3;
      sc.position.set(14.5 + marks[i][0], 0.046, 6.5 + marks[i][1]);
      sc.visible = false;
      sc.renderOrder = 3;
      scene.add(sc);
      scuffs.push(sc);
    }
  }

  function addWalls() {
    var G = staticGroup();
    var wp = wallpaperTexture();
    wp.wrapS = wp.wrapT = THREE.RepeatWrapping;
    var ws = wainscotTexture();
    ws.wrapS = ws.wrapT = THREE.RepeatWrapping;
    var trim = mat(0xfbf5ea, { roughness: 0.4, clearcoat: 0.3 });
    function wall(x0, x1, zc, ry, along) {
      var len = Math.abs(x1 - x0);
      var mp = wp.clone();
      mp.needsUpdate = true;
      mp.repeat.set(len / 2.2, 1.2);
      var up = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6), mat(0xffffff, { map: mp, roughness: 0.9, env: 0.4 }));
      var mw = ws.clone();
      mw.needsUpdate = true;
      mw.repeat.set(len / 3.2, 1);
      var lo = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.1), mat(0xffffff, { map: mw, roughness: 0.6, env: 0.5 }));
      var grp = new THREE.Group();
      up.position.set(0, 1.1 + 1.3, 0);
      lo.position.set(0, 0.55, 0);
      up.receiveShadow = true;
      lo.receiveShadow = true;
      grp.add(up);
      grp.add(lo);
      var rail = box(len, 0.07, 0.07, trim, 0, 1.11, 0.03, false);
      var base = box(len, 0.18, 0.06, trim, 0, 0.09, 0.03, false);
      var crown = box(len, 0.1, 0.1, trim, 0, 3.65, 0.04, false);
      grp.add(rail);
      grp.add(base);
      grp.add(crown);
      grp.rotation.y = ry;
      if (along === 'x') grp.position.set((x0 + x1) / 2, 0, zc);
      else grp.position.set(zc, 0, (x0 + x1) / 2);
      G.add(grp);
    }
    wall(-6, 22, -0.42, 0, 'x');
    wall(-0.42, 18, -2.75, Math.PI / 2, 'z');
    wall(-0.42, 18, 18.75, -Math.PI / 2, 'z');

    // ambient-occlusion strip where wall meets floor
    var ao = new THREE.MeshBasicMaterial({
      map: canvasTex(8, 64, function (g, w, h) {
        var gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, 'rgba(40,20,8,0.55)');
        gr.addColorStop(1, 'rgba(40,20,8,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false
    });
    var aoB = new THREE.Mesh(new THREE.PlaneGeometry(28, 1.0), ao);
    aoB.rotation.x = -Math.PI / 2;
    aoB.position.set(8, 0.0015, -0.42 + 0.5);
    aoB.renderOrder = 1;
    G.add(aoB);
    var aoL = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 1.0), ao);
    aoL.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    aoL.position.set(-2.75 + 0.5, 0.0015, 8.8);
    G.add(aoL);
    var aoR = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 1.0), ao);
    aoR.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    aoR.position.set(18.75 - 0.5, 0.0015, 8.8);
    G.add(aoR);

    // window
    var white = mat(0xfbf5ea, { roughness: 0.35, clearcoat: 0.3 });
    var win = new THREE.Group();
    win.position.set(12.1, 2.1, -0.42);
    G.add(win);
    var pane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.5), new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false, color: 0xf0f0f0 }));
    pane.position.z = 0.01;
    win.add(pane);
    win.add(box(2.4, 0.13, 0.14, white, 0, 0.81, 0.05));
    win.add(box(2.4, 0.13, 0.14, white, 0, -0.81, 0.05));
    win.add(box(0.13, 1.75, 0.14, white, -1.13, 0, 0.05));
    win.add(box(0.13, 1.75, 0.14, white, 1.13, 0, 0.05));
    win.add(box(0.06, 1.5, 0.07, white, 0, 0, 0.04));
    win.add(box(2.1, 0.06, 0.07, white, 0, 0.05, 0.04));
    win.add(box(2.7, 0.07, 0.3, white, 0, -0.9, 0.15, true));
    var pot = mat(0xd9784a, { roughness: 0.7 });
    var green = mat(0x5f9a52, { roughness: 0.6 });
    win.add(cyl(0.11, 0.08, 0.16, pot, 0.75, -0.78, 0.15, true));
    var cac = ball(0.09, green, 0.75, -0.62, 0.15, true);
    cac.scale.set(1, 1.6, 1);
    win.add(cac);
    win.add(ball(0.03, mat(0xff8fb3, { roughness: 0.5 }), 0.75, -0.47, 0.15));
    win.add(cyl(0.1, 0.07, 0.13, mat(0x4f86c6, { roughness: 0.4, clearcoat: 0.4 }), -0.7, -0.8, 0.15, true));
    var bud = ball(0.07, mat(0xf2c53a, { roughness: 0.6 }), -0.7, -0.67, 0.15);
    win.add(bud);
    // curtains
    var curtMat = mat(0xe58f86, { roughness: 0.85, sheen: 0.8, sheenColor: 0xffe0d8, side: THREE.DoubleSide });
    var cgeo = new THREE.PlaneGeometry(0.75, 2.5, 24, 6);
    var cp = cgeo.attributes.position;
    for (i = 0; i < cp.count; i++) {
      var x = cp.getX(i);
      var y = cp.getY(i);
      var gather = 1 - Math.max(0, (y + 0.4) / 1.65) * 0;
      cp.setZ(i, Math.sin((x + 0.375) * 26) * 0.05 * gather + 0.06);
      if (y < -0.6) cp.setX(i, x * (0.75 + 0.25 * ((y + 1.25) / 0.65)));
    }
    cgeo.computeVertexNormals();
    var cL = new THREE.Mesh(cgeo, curtMat);
    cL.position.set(-1.45, 0.1, 0.06);
    cL.castShadow = true;
    var cR = new THREE.Mesh(cgeo, curtMat);
    cR.position.set(1.45, 0.1, 0.06);
    cR.castShadow = true;
    win.add(cL);
    win.add(cR);
    var tie = mat(0xf2c53a, { roughness: 0.5 });
    var t1 = tor(0.16, 0.025, tie, -1.45, -0.45, 0.12);
    t1.scale.set(1, 0.4, 1);
    var t2 = tor(0.16, 0.025, tie, 1.45, -0.45, 0.12);
    t2.scale.set(1, 0.4, 1);
    win.add(t1);
    win.add(t2);
    var rod = cyl(0.025, 0.025, 3.6, mat(0x6b4a2e, { roughness: 0.4, metalness: 0.3 }), 0, 1.36, 0.14);
    rod.rotation.z = Math.PI / 2;
    win.add(rod);
    win.add(ball(0.05, rod.material, -1.82, 1.36, 0.14));
    win.add(ball(0.05, rod.material, 1.82, 1.36, 0.14));

    // sunbeam: shaft + warm patch
    var w0 = [[11.15, 2.82], [13.05, 2.82], [13.05, 1.38], [11.15, 1.38]];
    var dir = new THREE.Vector3(-0.32, -0.7, 1).normalize();
    var fp = [];
    for (i = 0; i < 4; i++) {
      var tt = w0[i][1] / -dir.y;
      fp.push([w0[i][0] + dir.x * tt, 0.05, -0.36 + dir.z * tt]);
    }
    var patchGeo = new THREE.BufferGeometry();
    patchGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      fp[0][0], fp[0][1], fp[0][2], fp[1][0], fp[1][1], fp[1][2], fp[2][0], fp[2][1], fp[2][2],
      fp[0][0], fp[0][1], fp[0][2], fp[2][0], fp[2][1], fp[2][2], fp[3][0], fp[3][1], fp[3][2]
    ], 3));
    patchGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
    var patch = new THREE.Mesh(patchGeo, new THREE.MeshBasicMaterial({
      map: sunPatchTexture(), color: 0xffc77a, transparent: true, opacity: 0.32, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    patch.renderOrder = 3;
    G.add(patch);
    var sp = [];
    var su = [];
    var faces = [[0, 1], [1, 2], [2, 3], [3, 0]];
    for (i = 0; i < 4; i++) {
      var a = faces[i][0];
      var b = faces[i][1];
      var A = [w0[a][0], w0[a][1], -0.38];
      var B = [w0[b][0], w0[b][1], -0.38];
      sp.push(A[0], A[1], A[2], B[0], B[1], B[2], fp[b][0], fp[b][1], fp[b][2]);
      sp.push(A[0], A[1], A[2], fp[b][0], fp[b][1], fp[b][2], fp[a][0], fp[a][1], fp[a][2]);
      su.push(0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0);
    }
    var shaftGeo = new THREE.BufferGeometry();
    shaftGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    shaftGeo.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    var shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({
      map: shaftTexture(), color: 0xffe2b0, transparent: true, opacity: 0.09, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    shaft.renderOrder = 9;
    G.add(shaft);
    motesInit(w0, fp);

    // bunting
    var flagShape = new THREE.Shape();
    flagShape.moveTo(-0.17, 0);
    flagShape.lineTo(0.17, 0);
    flagShape.lineTo(0, -0.34);
    flagShape.closePath();
    var flagGeo = new THREE.ShapeGeometry(flagShape);
    var nF = 34;
    var flags = new THREE.InstancedMesh(flagGeo, mat(0xffffff, { roughness: 0.8, side: THREE.DoubleSide }), nF);
    var colors = [0xe5484d, 0xf2c53a, 0x5ab552, 0x4f86c6, 0xf0913a, 0x8f63c9, 0xf6a9bb];
    var linePts = [];
    var m4 = new THREE.Matrix4();
    var qq = new THREE.Quaternion();
    var col = new THREE.Color();
    for (i = 0; i < nF; i++) {
      var u = i / (nF - 1);
      var seg = u < 0.5 ? u * 2 : (u - 0.5) * 2;
      var fx = -0.2 + u * 17.2;
      var fy = 3.3 - Math.sin(seg * Math.PI) * 0.45;
      qq.setFromEuler(new THREE.Euler(0, 0, Math.cos(seg * Math.PI) * 0.12 * (u < 0.5 ? 1 : 1)));
      m4.compose(new THREE.Vector3(fx, fy, -0.3), qq, new THREE.Vector3(1, 1, 1));
      flags.setMatrixAt(i, m4);
      flags.setColorAt(i, col.setHex(colors[i % colors.length]));
    }
    for (i = 0; i <= 80; i++) {
      var uu = i / 80;
      var sg = uu < 0.5 ? uu * 2 : (uu - 0.5) * 2;
      linePts.push(new THREE.Vector3(-0.2 + uu * 17.2, 3.3 - Math.sin(sg * Math.PI) * 0.45, -0.3));
    }
    G.add(flags);
    G.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), new THREE.LineBasicMaterial({ color: 0x8a6a4a })));

    // clock + kid drawings
    var clk = new THREE.Group();
    clk.position.set(4.6, 2.35, -0.4);
    var face = new THREE.Mesh(new THREE.CircleGeometry(0.32, 40), mat(0xffffff, { map: clockTexture(), roughness: 0.4 }));
    face.position.z = 0.04;
    clk.add(face);
    clk.add(tor(0.33, 0.04, mat(0xf2c53a, { roughness: 0.3, clearcoat: 0.6 }), 0, 0, 0.04, true));
    G.add(clk);
    var draws = [[3.35, 1.62, 0.08, 0], [15.4, 2.05, -0.1, 1], [16.6, 1.55, 0.12, 2], [5.85, 1.6, -0.06, 2]];
    var tape = mat(0xfff1b8, { roughness: 0.6, transparent: true, opacity: 0.85 });
    for (i = 0; i < draws.length; i++) {
      var d = draws[i];
      var paper = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.6), mat(0xffffff, { map: drawingTexture(d[3]), roughness: 0.9 }));
      paper.position.set(d[0], d[1], -0.395);
      paper.rotation.z = d[2];
      paper.castShadow = false;
      paper.receiveShadow = true;
      G.add(paper);
      var tp = box(0.2, 0.06, 0.004, tape, d[0] + Math.sin(-d[2]) * 0.3, d[1] + Math.cos(d[2]) * 0.3, -0.39);
      tp.rotation.z = d[2] + 0.15;
      G.add(tp);
    }
  }

  function addFurniture() {
    var G = staticGroup();
    var honey = mat(0xc08850, { roughness: 0.45, clearcoat: 0.3 });
    var honeyDark = mat(0x9a6438, { roughness: 0.6 });
    // bookshelf (cells c0-2 r0)
    var shelf = new THREE.Group();
    shelf.position.set(1.5, 0, -0.05);
    G.add(shelf);
    shelf.add(rbox(0.1, 2.35, 0.66, 0.02, honey, -1.38, 1.175, 0, true));
    shelf.add(rbox(0.1, 2.35, 0.66, 0.02, honey, 1.38, 1.175, 0, true));
    shelf.add(rbox(2.9, 0.1, 0.72, 0.03, honey, 0, 2.38, 0, true));
    shelf.add(box(2.7, 2.3, 0.04, honeyDark, 0, 1.17, -0.3));
    shelf.add(box(2.7, 0.14, 0.62, honey, 0, 0.07, 0, true));
    var shelfYs = [0.14, 0.72, 1.3, 1.86];
    for (var s = 1; s < shelfYs.length; s++) shelf.add(box(2.68, 0.05, 0.6, honey, 0, shelfYs[s], 0, true));
    var bookGeo = new THREE.BoxGeometry(1, 1, 1);
    var books = new THREE.InstancedMesh(bookGeo, mat(0xffffff, { roughness: 0.6 }), 64);
    var bcols = [0xd9534f, 0x3f7ec4, 0x5ab552, 0xf2c53a, 0x8f63c9, 0xf0913a, 0x2f4a6b, 0xe07a95, 0x7cc8b5, 0xfff1d6];
    var m4 = new THREE.Matrix4();
    var q = new THREE.Quaternion();
    var col = new THREE.Color();
    var rr = rng(21);
    var nb = 0;
    for (s = 0; s < 3; s++) {
      var x = -1.26;
      var lim = s === 1 ? 0.35 : 1.26;
      while (x < lim && nb < 64) {
        var bw = 0.07 + rr() * 0.07;
        var bh = 0.32 + rr() * 0.18;
        var tilt = rr() < 0.08 ? 0.18 : 0;
        q.setFromEuler(new THREE.Euler(0, 0, tilt));
        m4.compose(new THREE.Vector3(1.5 + x + bw / 2, shelfYs[s] + 0.025 + bh / 2, -0.05 + 0.02), q, new THREE.Vector3(bw, bh, 0.42));
        books.setMatrixAt(nb, m4);
        books.setColorAt(nb, col.setHex(bcols[Math.floor(rr() * bcols.length)]));
        nb++;
        x += bw + 0.008 + (tilt ? 0.06 : 0);
      }
    }
    books.count = nb;
    books.castShadow = true;
    books.receiveShadow = true;
    G.add(books);
    // globe & toy on shelves
    var globe = new THREE.Group();
    globe.position.set(1.5 + 0.85, 0.72 + 0.03, -0.05);
    globe.add(cyl(0.12, 0.14, 0.04, honeyDark, 0, 0.02, 0, true));
    globe.add(cyl(0.012, 0.012, 0.16, honeyDark, 0, 0.1, 0));
    var gl = ball(0.17, mat(0x4f9ad6, { roughness: 0.4, clearcoat: 0.6 }), 0, 0.33, 0, true);
    globe.add(gl);
    var land = ball(0.172, mat(0x7cc070, { roughness: 0.5 }), 0, 0.33, 0);
    land.scale.set(0.6, 0.9, 0.5);
    land.position.x = 0.05;
    globe.add(land);
    G.add(globe);
    var rocket = new THREE.Group();
    rocket.position.set(0.55, 1.86 + 0.03, -0.05);
    rocket.add(cyl(0.07, 0.08, 0.3, mat(0xfff8ec, { roughness: 0.3, clearcoat: 0.6 }), 0, 0.2, 0, true));
    rocket.add(mesh(new THREE.ConeGeometry(0.07, 0.14, 16), mat(0xe5484d, { roughness: 0.3, clearcoat: 0.6 }), 0, 0.42, 0));
    rocket.add(ball(0.03, mat(0x4f86c6, { roughness: 0.2, clearcoat: 1 }), 0, 0.25, 0.07));
    for (var f = 0; f < 3; f++) {
      var fin = box(0.02, 0.1, 0.08, mat(0xe5484d, { roughness: 0.4 }), Math.sin(f * 2.1) * 0.08, 0.08, Math.cos(f * 2.1) * 0.08);
      fin.rotation.y = f * 2.1;
      rocket.add(fin);
    }
    G.add(rocket);
    var plant2 = new THREE.Group();
    plant2.position.set(2.4, 2.43, -0.05);
    plant2.add(cyl(0.12, 0.09, 0.16, mat(0xfff8ec, { roughness: 0.4 }), 0, 0.08, 0, true));
    var leafM = mat(0x5f9a52, { roughness: 0.6 });
    for (f = 0; f < 7; f++) {
      var lf = ball(0.08, leafM, Math.cos(f) * 0.12, 0.2 + (f % 3) * 0.05, Math.sin(f) * 0.08, true);
      lf.scale.set(1.4, 0.5, 0.9);
      lf.rotation.y = f;
      lf.rotation.z = Math.cos(f) * 0.5;
      plant2.add(lf);
    }
    G.add(plant2);

    // toy basket + book stack (cells c0-1 r1)
    var basket = new THREE.Group();
    basket.position.set(0.55, 0, 1.5);
    G.add(basket);
    var weave = canvasTex(128, 64, function (g) {
      g.fillStyle = '#c99a5e';
      g.fillRect(0, 0, 128, 64);
      for (var y = 0; y < 64; y += 8) {
        for (var x = 0; x < 128; x += 16) {
          g.fillStyle = ((x + y) / 8) % 2 ? '#b0814a' : '#dcb47a';
          roundRect(g, x + ((y / 8) % 2) * 8, y + 1, 14, 6, 3);
          g.fill();
        }
      }
    });
    weave.wrapS = THREE.RepeatWrapping;
    weave.repeat.set(3, 1);
    var bm = mat(0xffffff, { map: weave, roughness: 0.9, side: THREE.DoubleSide });
    basket.add(mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.46, 28, 1, true), bm, 0, 0.23, 0, true));
    basket.add(cyl(0.32, 0.32, 0.02, bm, 0, 0.01, 0));
    var lip = tor(0.38, 0.03, mat(0xb0814a, { roughness: 0.8 }), 0, 0.46, 0, true);
    lip.rotation.x = Math.PI / 2;
    basket.add(lip);
    var bb = ball(0.2, mat(0xffffff, {
      map: canvasTex(128, 64, function (g) {
        var cs = ['#e5484d', '#fff8ec', '#4f86c6', '#fff8ec', '#f2c53a', '#fff8ec'];
        for (var i = 0; i < 6; i++) { g.fillStyle = cs[i]; g.fillRect(i * 128 / 6, 0, 128 / 6 + 1, 64); }
      }), roughness: 0.3, clearcoat: 0.6
    }), 0.08, 0.5, 0.02, true);
    bb.rotation.set(0.4, 0.3, 0.6);
    basket.add(bb);
    var ear1 = ball(0.05, mat(0xf3eadb, { roughness: 0.9 }), -0.16, 0.56, -0.05, true);
    ear1.scale.set(0.6, 2, 0.6);
    ear1.rotation.z = 0.25;
    var ear2 = ball(0.05, ear1.material, -0.08, 0.58, -0.08, true);
    ear2.scale.set(0.6, 2, 0.6);
    ear2.rotation.z = -0.15;
    basket.add(ear1);
    basket.add(ear2);
    var stack = new THREE.Group();
    stack.position.set(1.5, 0, 1.45);
    G.add(stack);
    var sc = [0x4f86c6, 0xf2c53a, 0xe5484d, 0x5ab552];
    for (var i = 0; i < 4; i++) {
      var bk = rbox(0.62 - i * 0.05, 0.1, 0.46 - i * 0.03, 0.02, mat(sc[i], { roughness: 0.5 }), 0, 0.05 + i * 0.1, 0, true);
      bk.rotation.y = (i % 2 ? 0.2 : -0.12);
      stack.add(bk);
      var pg = box(0.58 - i * 0.05, 0.07, 0.03, mat(0xfff8ec, { roughness: 0.8 }), 0, 0.05 + i * 0.1, 0.22 - i * 0.015);
      pg.rotation.y = bk.rotation.y;
      stack.add(pg);
    }

    // TV + console (cells c6-8 r0)
    var tv = new THREE.Group();
    tv.position.set(7.5, 0, -0.02);
    G.add(tv);
    var walnut = mat(0x8a5530, { roughness: 0.4, clearcoat: 0.4 });
    var doorM = mat(0xd9a35b, { roughness: 0.45, clearcoat: 0.3 });
    tv.add(rbox(2.7, 0.5, 0.62, 0.05, walnut, 0, 0.42, 0, true));
    tv.add(rbox(1.25, 0.38, 0.03, 0.02, doorM, -0.66, 0.42, 0.31));
    tv.add(rbox(1.25, 0.38, 0.03, 0.02, doorM, 0.66, 0.42, 0.31));
    tv.add(ball(0.035, mat(0xf2c14e, { metalness: 0.8, roughness: 0.25 }), -0.1, 0.42, 0.34));
    tv.add(ball(0.035, mat(0xf2c14e, { metalness: 0.8, roughness: 0.25 }), 0.1, 0.42, 0.34));
    var legs = [[-1.2, -0.22], [1.2, -0.22], [-1.2, 0.22], [1.2, 0.22]];
    for (i = 0; i < 4; i++) {
      var lg = cyl(0.03, 0.018, 0.2, walnut, legs[i][0], 0.09, legs[i][1], true, 8);
      lg.rotation.z = legs[i][0] < 0 ? 0.12 : -0.12;
      tv.add(lg);
    }
    tv.add(rbox(0.5, 0.04, 0.28, 0.015, mat(0x2a2a30, { roughness: 0.5 }), 0, 0.69, -0.05, true));
    tv.add(box(0.07, 0.2, 0.06, mat(0x2a2a30, { roughness: 0.5 }), 0, 0.79, -0.08, true));
    tv.add(rbox(2.05, 1.18, 0.09, 0.05, mat(0x26262c, { roughness: 0.3, metalness: 0.3, clearcoat: 0.6 }), 0, 1.47, -0.1, true));
    tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.04), new THREE.MeshBasicMaterial({ map: cartoonTexture(), toneMapped: false, color: 0xdddddd }));
    tvScreen.position.set(0, 1.47, -0.05);
    tv.add(tvScreen);
    var pad1 = new THREE.Group();
    pad1.position.set(0.9, 0.69, 0.08);
    pad1.rotation.y = -0.4;
    pad1.add(rbox(0.26, 0.05, 0.14, 0.03, mat(0x4f86c6, { roughness: 0.4, clearcoat: 0.6 }), 0, 0, 0, true));
    pad1.add(ball(0.02, mat(0xe5484d, {}), 0.07, 0.03, 0));
    pad1.add(ball(0.02, mat(0xf2c53a, {}), 0.1, 0.03, 0.03));
    tv.add(pad1);
    tv.add(rbox(0.22, 0.38, 0.22, 0.04, mat(0x3a3a40, { roughness: 0.6 }), -1.15, 0.86, -0.05, true));
    var cone = cyl(0.06, 0.06, 0.01, mat(0x666670, { roughness: 0.4 }), -1.15, 0.9, 0.065);
    cone.rotation.x = Math.PI / 2;
    tv.add(cone);

    // couch (cells c13-15 r8-9), back toward the camera
    var couch = new THREE.Group();
    couch.position.set(14.5, 0, 9.05);
    G.add(couch);
    var teal = mat(0x3f8a83, { roughness: 0.85, sheen: 0.8, sheenColor: 0xbfe8e2 });
    var tealD = mat(0x357670, { roughness: 0.9, sheen: 0.6, sheenColor: 0xbfe8e2 });
    couch.add(rbox(2.9, 0.32, 1.35, 0.1, teal, 0, 0.3, 0, true));
    couch.add(rbox(1.36, 0.2, 1.05, 0.09, tealD, -0.69, 0.55, -0.12, true));
    couch.add(rbox(1.36, 0.2, 1.05, 0.09, tealD, 0.69, 0.55, -0.12, true));
    couch.add(rbox(2.9, 0.62, 0.3, 0.12, teal, 0, 0.72, 0.53, true));
    couch.add(rbox(0.32, 0.55, 1.4, 0.13, teal, -1.36, 0.55, 0.0, true));
    couch.add(rbox(0.32, 0.55, 1.4, 0.13, teal, 1.36, 0.55, 0.0, true));
    var btn = mat(0x2c625d, { roughness: 0.6 });
    for (i = 0; i < 5; i++) couch.add(ball(0.03, btn, -1.0 + i * 0.5, 0.78, 0.69));
    var cl = [[-1.2, -0.48], [1.2, -0.48], [-1.2, 0.48], [1.2, 0.48]];
    for (i = 0; i < 4; i++) couch.add(cyl(0.05, 0.03, 0.14, walnut, cl[i][0], 0.07, cl[i][1], true, 10));
    var pmus = mat(0xf2b134, { roughness: 0.9, sheen: 1, sheenColor: 0xffffff });
    var pcor = mat(0xf27b6b, { roughness: 0.9, sheen: 1, sheenColor: 0xffffff });
    var pg1 = mesh(cg('couchPillow', function () { return puffyGeometry(0.5, 0.08, 0.5, 1.2); }), pmus, -0.95, 0.9, 0.25, true);
    pg1.rotation.set(-1.2, 0.2, 0.15);
    var pg2 = mesh(pg1.geometry, pcor, 0.9, 0.88, 0.22, true);
    pg2.rotation.set(-1.15, -0.25, -0.1);
    couch.add(pg1);
    couch.add(pg2);
    var throwTex = canvasTex(128, 128, function (g) {
      for (var y = 0; y < 128; y += 16) {
        g.fillStyle = (y / 16) % 2 ? '#fff4e0' : '#e5484d';
        g.fillRect(0, y, 128, 16);
      }
    });
    var thr = rbox(0.6, 0.05, 0.75, 0.025, mat(0xffffff, { map: throwTex, roughness: 0.95, sheen: 0.6 }), 0.2, 1.03, 0.55, true);
    thr.rotation.set(0.0, 0.1, 0);
    couch.add(thr);
    var thr2 = rbox(0.6, 0.45, 0.05, 0.025, thr.material, 0.2, 0.83, 0.72, false);
    couch.add(thr2);

    // toy chest — where the marchers come from
    var chest = new THREE.Group();
    chest.position.set(-1.2, 0, 7.5);
    G.add(chest);
    var chestMat = mat(0xffffff, { map: chestTexture(), roughness: 0.45, clearcoat: 0.4 });
    var goldT = mat(0xf2c14e, { metalness: 0.75, roughness: 0.3 });
    chest.add(rbox(0.9, 0.6, 1.25, 0.06, chestMat, 0, 0.3, 0, true));
    var inside = box(0.78, 0.02, 1.12, mat(0x2a1a2a, { roughness: 1 }), 0, 0.59, 0);
    chest.add(inside);
    var hinge = new THREE.Group();
    hinge.position.set(-0.45, 0.6, 0);
    hinge.rotation.z = 1.95;
    chest.add(hinge);
    hinge.add(rbox(0.9, 0.08, 1.27, 0.04, chestMat, 0.45, 0.04, 0, true));
    hinge.add(box(0.06, 0.1, 1.29, goldT, 0.88, 0.04, 0));
    var corners = [[-0.45, -0.62], [0.45, -0.62], [-0.45, 0.62], [0.45, 0.62]];
    for (i = 0; i < 4; i++) chest.add(box(0.07, 0.62, 0.07, goldT, corners[i][0], 0.3, corners[i][1], false));
    var glowIn = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.15), new THREE.MeshBasicMaterial({
      map: TEX.glow, color: 0xffd27a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glowIn.rotation.x = -Math.PI / 2;
    glowIn.position.y = 0.62;
    chest.add(glowIn);
    var spill = ball(0.09, mat(0x5ab552, { roughness: 0.3, clearcoat: 0.6 }), 0.7, 0.09, -0.75, true);
    G.add(spill);
    spill.position.set(-0.6, 0.09, 6.55);
    var blk = rbox(0.2, 0.2, 0.2, 0.03, mat(0xf2c53a, { roughness: 0.5 }), -1.85, 0.1, 8.5, true);
    blk.rotation.y = 0.5;
    G.add(blk);

    // floor lamp (left)
    var lamp = new THREE.Group();
    lamp.position.set(-1.6, 0, 2.0);
    G.add(lamp);
    var brass = mat(0xd9b06a, { metalness: 0.8, roughness: 0.3 });
    lamp.add(cyl(0.22, 0.26, 0.05, brass, 0, 0.025, 0, true));
    lamp.add(cyl(0.025, 0.025, 1.7, brass, 0, 0.88, 0, true, 8));
    var shade = mesh(new THREE.CylinderGeometry(0.22, 0.34, 0.4, 24, 1, true), mat(0xfff0d8, {
      emissive: 0xffc98a, emissiveIntensity: 0.9, roughness: 0.6, side: THREE.DoubleSide
    }), 0, 1.75, 0, false);
    lamp.add(shade);
    var lampLight = new THREE.PointLight(0xffb870, 9, 9, 2);
    lampLight.position.set(-1.6, 1.6, 2.1);
    scene.add(lampLight);

    // big plant (right back corner)
    var plant = new THREE.Group();
    plant.position.set(17.6, 0, 0.7);
    G.add(plant);
    plant.add(cyl(0.34, 0.26, 0.55, mat(0xfff8ec, { roughness: 0.35, clearcoat: 0.4 }), 0, 0.275, 0, true, 24));
    var band = tor(0.34, 0.03, mat(0x4f86c6, { roughness: 0.4 }), 0, 0.5, 0);
    band.rotation.x = Math.PI / 2;
    plant.add(band);
    var leaf = mat(0x4f8f4a, { roughness: 0.55, side: THREE.DoubleSide });
    var leaf2 = mat(0x6aae5c, { roughness: 0.55, side: THREE.DoubleSide });
    var lr = rng(33);
    for (i = 0; i < 14; i++) {
      var a = i * 2.4;
      var h = 0.8 + lr() * 1.2;
      var st = cyl(0.012, 0.012, h, leaf, Math.cos(a) * 0.08, 0.5 + h / 2, Math.sin(a) * 0.08, false, 5);
      plant.add(st);
      var lv = ball(0.22, i % 2 ? leaf : leaf2, Math.cos(a) * (0.2 + lr() * 0.25), 0.5 + h, Math.sin(a) * (0.2 + lr() * 0.2), true);
      lv.scale.set(1, 0.18, 0.62);
      lv.rotation.set(0.3 * Math.sin(a), -a, 0.5 * Math.cos(a));
      plant.add(lv);
    }

    // side table next to couch
    var tbl = new THREE.Group();
    tbl.position.set(17.4, 0, 8.6);
    G.add(tbl);
    tbl.add(cyl(0.38, 0.38, 0.05, honey, 0, 0.62, 0, true, 28));
    tbl.add(cyl(0.04, 0.05, 0.6, honeyDark, 0, 0.3, 0, true, 10));
    tbl.add(cyl(0.22, 0.24, 0.04, honeyDark, 0, 0.02, 0, true, 20));
    tbl.add(cyl(0.07, 0.06, 0.14, mat(0xe5484d, { roughness: 0.3, clearcoat: 0.6 }), 0.1, 0.72, 0.05, true));
    var hd = tor(0.035, 0.012, mat(0xe5484d, { roughness: 0.3 }), 0.18, 0.72, 0.05);
    tbl.add(hd);

    // a stray toy ball on the left
    G.add(ball(0.16, mat(0x8f63c9, { roughness: 0.3, clearcoat: 0.8 }), -2.0, 0.16, 4.6, true));
  }

  function motesInit(w0, fp) {
    var n = LOW ? 26 : 50;
    var pos = new Float32Array(n * 3);
    var r = rng(77);
    for (var i = 0; i < n; i++) {
      var u = r();
      var v = r();
      var s = 0.15 + r() * 0.8;
      var top = [w0[0][0] + (w0[1][0] - w0[0][0]) * u, w0[3][1] + (w0[0][1] - w0[3][1]) * v, -0.38];
      var bot = [fp[0][0] + (fp[1][0] - fp[0][0]) * u, 0.05, fp[3][2] + (fp[0][2] - fp[3][2]) * v];
      moteSeed.push({
        x: top[0] + (bot[0] - top[0]) * s,
        y: top[1] + (bot[1] - top[1]) * s,
        z: top[2] + (bot[2] - top[2]) * s,
        p: r() * 6.28,
        q: 0.3 + r() * 0.6
      });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    motes = new THREE.Points(g, new THREE.PointsMaterial({
      map: TEX.glow, color: 0xffe8c0, size: 0.06, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    }));
    motes.frustumCulled = false;
    motes.renderOrder = 9;
    scene.add(motes);
  }

  function updateMotes(time) {
    if (!motes) return;
    var pos = motes.geometry.attributes.position;
    for (var i = 0; i < moteSeed.length; i++) {
      var m = moteSeed[i];
      pos.setXYZ(i,
        m.x + Math.sin(time * 0.3 * m.q + m.p) * 0.25,
        m.y + Math.sin(time * 0.21 * m.q + m.p * 2) * 0.18,
        m.z + Math.cos(time * 0.17 * m.q + m.p) * 0.2);
    }
    pos.needsUpdate = true;
  }

  /* ------------------------------------------------------------------ */
  /* Guides: free-cell dots, range ring, hover pad, selection glow, HP   */
  /* ------------------------------------------------------------------ */

  function addGuides() {
    var r;
    var c;
    for (r = 0; r < 10; r++) {
      for (c = 0; c < 16; c++) if (RugSim.cellKind(c, r) === 'wood') woodCells.push([c, r]);
    }
    var dg = new THREE.PlaneGeometry(0.86, 0.86);
    dg.rotateX(-Math.PI / 2);
    freeDots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({
      map: dotTexture(), color: 0xfff4d8, transparent: true, opacity: 0.6, depthWrite: false
    }), woodCells.length);
    freeDots.visible = false;
    freeDots.renderOrder = 3;
    freeDots.frustumCulled = false;
    scene.add(freeDots);

    ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: ringTexture(), color: 0xffd25a, transparent: true, opacity: 0.85, depthWrite: false
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 4;
    scene.add(ring);
    ringDash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
      map: dashTexture(), color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false
    }));
    ringDash.rotation.x = -Math.PI / 2;
    ringDash.visible = false;
    ringDash.renderOrder = 4;
    scene.add(ringDash);

    pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: padTexture(), color: 0xb7f0a0, transparent: true, opacity: 0.9, depthWrite: false
    }));
    pad.rotation.x = -Math.PI / 2;
    pad.visible = false;
    pad.renderOrder = 4;
    scene.add(pad);

    selGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({
      map: TEX.swirl, color: 0xffd25a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    selGlow.rotation.x = -Math.PI / 2;
    selGlow.visible = false;
    selGlow.renderOrder = 4;
    scene.add(selGlow);

    var bg = new THREE.PlaneGeometry(1, 1);
    hpBack = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0x2a1c14, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false }), 80);
    hpBack.count = 0;
    hpBack.renderOrder = 20;
    hpBack.frustumCulled = false;
    scene.add(hpBack);
    var fg = new THREE.PlaneGeometry(1, 1);
    fg.translate(0.5, 0, 0);
    hpFill = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, transparent: true }), 80);
    hpFill.count = 0;
    hpFill.renderOrder = 21;
    hpFill.frustumCulled = false;
    hpFill.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(hpFill);
  }

  /* ------------------------------------------------------------------ */
  /* Particles (one draw call per blend mode)                            */
  /* ------------------------------------------------------------------ */

  var PV = [
    'attribute vec4 pcolor;',
    'attribute float psize;',
    'attribute float pshape;',
    'attribute float prot;',
    'uniform float uScale;',
    'varying vec4 vColor;',
    'varying float vShape;',
    'varying float vRot;',
    'void main() {',
    '  vColor = pcolor; vShape = pshape; vRot = prot;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  gl_PointSize = psize * uScale / max(0.1, -mv.z);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var PF = [
    'uniform sampler2D map;',
    'varying vec4 vColor;',
    'varying float vShape;',
    'varying float vRot;',
    'void main() {',
    '  vec2 p = gl_PointCoord - 0.5;',
    '  float c = cos(vRot); float s = sin(vRot);',
    '  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;',
    '  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;',
    '  float col = mod(vShape, 2.0); float row = floor(vShape / 2.0);',
    '  vec2 uv = vec2(col * 0.5 + p.x * 0.5, 1.0 - (row * 0.5 + p.y * 0.5));',
    '  vec4 t = texture2D(map, uv);',
    '  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);',
    '  if (gl_FragColor.a < 0.01) discard;',
    '  #include <colorspace_fragment>',
    '}'
  ].join('\n');

  function Particles(max, additive) {
    this.max = max;
    this.p = [];
    var g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.siz = new Float32Array(max);
    this.shp = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSiz = new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage);
    this.aShp = new THREE.BufferAttribute(this.shp, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('pcolor', this.aCol);
    g.setAttribute('psize', this.aSiz);
    g.setAttribute('pshape', this.aShp);
    g.setAttribute('prot', this.aRot);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: TEX.atlas }, uScale: { value: 600 } },
      vertexShader: PV,
      fragmentShader: PF,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = additive ? 11 : 10;
    scene.add(this.pts);
  }
  Particles.prototype.add = function (o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push(o);
  };
  Particles.prototype.update = function (dt) {
    var p = this.p;
    var k = 0;
    for (var i = p.length - 1; i >= 0; i--) {
      var q = p[i];
      q.age += dt;
      if (q.age >= q.life) {
        p[i] = p[p.length - 1];
        p.pop();
      }
    }
    for (i = 0; i < p.length; i++) {
      q = p[i];
      if (q.age < 0) continue;
      var damp = Math.exp(-q.drag * dt);
      q.vx *= damp;
      q.vy *= damp;
      q.vz *= damp;
      q.vy -= q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.y < 0.06 && q.vy < 0) {
        q.y = 0.06;
        q.vy *= -0.35;
        q.vx *= 0.6;
        q.vz *= 0.6;
        q.vr *= 0.5;
      }
      q.r += q.vr * dt;
      var t = q.age / q.life;
      var a = q.a * (q.fadeIn && t < 0.15 ? t / 0.15 : 1) * (1 - Math.pow(t, q.fadeP || 2));
      this.pos[k * 3] = q.x;
      this.pos[k * 3 + 1] = q.y;
      this.pos[k * 3 + 2] = q.z;
      this.col[k * 4] = q.c.r;
      this.col[k * 4 + 1] = q.c.g;
      this.col[k * 4 + 2] = q.c.b;
      this.col[k * 4 + 3] = a;
      this.siz[k] = q.s0 + (q.s1 - q.s0) * (1 - (1 - t) * (1 - t));
      this.shp[k] = q.sh;
      this.rot[k] = q.r;
      k++;
    }
    this.geo.setDrawRange(0, k);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aSiz.needsUpdate = true;
    this.aShp.needsUpdate = true;
    this.aRot.needsUpdate = true;
  };

  var colCache = {};
  function C(hex) {
    var c = colCache[hex];
    if (!c) c = colCache[hex] = new THREE.Color(hex);
    return c;
  }

  function emit(sys, x, y, z, n, o) {
    if (!sys) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = (o.speed || 1) * (0.4 + Math.random() * 0.8);
      var up = (o.up || 0) * (0.5 + Math.random() * 0.8);
      var cols = o.colors;
      var s0 = o.size[0] * (0.7 + Math.random() * 0.6);
      sys.add({
        x: x + (Math.random() - 0.5) * (o.spread || 0),
        y: y + (Math.random() - 0.5) * (o.spreadY || 0),
        z: z + (Math.random() - 0.5) * (o.spread || 0),
        vx: Math.cos(a) * sp,
        vy: up + (o.vy || 0),
        vz: Math.sin(a) * sp,
        age: -(o.delay || 0) - Math.random() * (o.jitter || 0),
        life: o.life[0] + Math.random() * (o.life[1] - o.life[0]),
        s0: s0,
        s1: o.size[1] * (s0 / o.size[0]),
        c: C(cols[Math.floor(Math.random() * cols.length)]),
        a: o.alpha == null ? 1 : o.alpha,
        grav: o.grav || 0,
        drag: o.drag || 0,
        sh: o.shape || 0,
        r: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * (o.spin || 0),
        fadeIn: !!o.fadeIn,
        fadeP: o.fadeP
      });
    }
  }

  function dust(x, z, n, scale) {
    scale = scale || 1;
    emit(softFx, x, 0.12, z, n, {
      speed: 0.9 * scale, up: 0.35, size: [0.2 * scale, 0.55 * scale], life: [0.5, 0.9],
      colors: [0xf3e2c6, 0xe8d2b0, 0xfff4e2], grav: -0.25, drag: 3.2, alpha: 0.55, spread: 0.2, fadeIn: true
    });
  }
  function sparks(x, y, z, n, colors) {
    emit(sparksFx, x, y, z, n, {
      speed: 2.4, up: 1.6, size: [0.16, 0.03], life: [0.22, 0.42], colors: colors || [0xfff3c4, 0xffd25a, 0xffffff],
      grav: 7, drag: 2.5, shape: 3, spin: 6
    });
  }
  function stars(x, y, z, n, delay) {
    emit(sparksFx, x, y, z, n, {
      speed: 1.6, up: 2.4, size: [0.3, 0.08], life: [0.6, 1.0], colors: [0xffe07a, 0xfff6c8, 0xffc23a],
      grav: 4, drag: 1.6, shape: 1, spin: 5, delay: delay || 0
    });
  }
  function confetti(x, y, z, n, spread) {
    emit(softFx, x, y, z, n, {
      speed: 2.4, up: 3.4, size: [0.13, 0.11], life: [1.2, 2.0],
      colors: [0xe5484d, 0xf2c53a, 0x5ab552, 0x4f86c6, 0xf0913a, 0x8f63c9, 0xf6a9bb],
      grav: 5, drag: 1.4, shape: 2, spin: 14, spread: spread || 0.3, fadeP: 6
    });
  }
  function feathers(x, z, n) {
    emit(softFx, x, 0.4, z, n, {
      speed: 1.4, up: 1.2, size: [0.1, 0.08], life: [0.8, 1.3], colors: [0xffffff, 0xfff0f4, 0xffd6e0],
      grav: 0.7, drag: 3.2, shape: 2, spin: 8, spread: 0.3, alpha: 0.95, fadeP: 3
    });
  }

  /* ------------------------------------------------------------------ */
  /* FX meshes (projectiles, shockwaves, flashes)                        */
  /* ------------------------------------------------------------------ */

  function addFxMeshes() {
    var i;
    for (i = 0; i < 10; i++) {
      var s = ball(0.075, mat(0xbfe6ff, { roughness: 0.05, clearcoat: 1, emissive: 0x4a90c0, emissiveIntensity: 0.6 }), 0, 0, 0, true);
      s.visible = false;
      scene.add(s);
      shots.push(s);
    }
    for (i = 0; i < 6; i++) {
      var b = tor(0.07, 0.018, mat(0xf5c242, { roughness: 0.4, emissive: 0x8a5a00, emissiveIntensity: 0.4 }), 0, 0, 0, true);
      b.visible = false;
      scene.add(b);
      bandShots.push(b);
    }
    for (i = 0; i < 8; i++) {
      var p = mesh(cg('pillowShot', function () { return puffyGeometry(0.24, 0.05, 0.2, 1.3); }),
        mat(0xf6a9bb, { roughness: 0.9, sheen: 1, sheenColor: 0xffffff }), 0, 0, 0, true);
      p.visible = false;
      scene.add(p);
      pillowShots.push(p);
    }
    for (i = 0; i < 4; i++) {
      var o = tor(0.13, 0.055, mat(0xf2a33a, { roughness: 0.6, clearcoat: 0.2 }), 0, 0, 0, true);
      o.visible = false;
      scene.add(o);
      rolls.push(o);
    }
    var ringT = radialTex([[0, 'rgba(255,255,255,0)'], [0.62, 'rgba(255,255,255,0)'], [0.82, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]);
    for (i = 0; i < 10; i++) {
      var sh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
        map: ringT, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false
      }));
      sh.rotation.x = -Math.PI / 2;
      sh.visible = false;
      sh.renderOrder = 5;
      sh.userData.t0 = -1;
      scene.add(sh);
      shocks.push(sh);
    }
    for (i = 0; i < 5; i++) {
      var fl = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEX.glow, color: 0xffe7a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      fl.visible = false;
      fl.renderOrder = 12;
      fl.userData.t0 = -1;
      scene.add(fl);
      flashes.push(fl);
    }
  }

  var clockNow = 0;
  function shock(x, z, radius, color, dur) {
    var best = shocks[0];
    for (var i = 0; i < shocks.length; i++) {
      if (shocks[i].userData.t0 < 0) { best = shocks[i]; break; }
      if (shocks[i].userData.t0 < best.userData.t0) best = shocks[i];
    }
    best.userData.t0 = clockNow;
    best.userData.dur = dur || 0.45;
    best.userData.rad = radius;
    best.position.set(x, 0.07, z);
    best.material.color.set(color || 0xffffff);
  }
  function flash(x, y, z, size, color, dur) {
    var best = flashes[0];
    for (var i = 0; i < flashes.length; i++) {
      if (flashes[i].userData.t0 < 0) { best = flashes[i]; break; }
      if (flashes[i].userData.t0 < best.userData.t0) best = flashes[i];
    }
    best.userData.t0 = clockNow;
    best.userData.dur = dur || 0.5;
    best.userData.size = size;
    best.position.set(x, y, z);
    best.material.color.set(color || 0xffe7a0);
  }
  function updateTransient() {
    var i;
    var t;
    for (i = 0; i < shocks.length; i++) {
      var s = shocks[i];
      if (s.userData.t0 < 0) { s.visible = false; continue; }
      t = (clockNow - s.userData.t0) / s.userData.dur;
      if (t >= 1) { s.userData.t0 = -1; s.visible = false; continue; }
      s.visible = true;
      var e = 1 - Math.pow(1 - t, 3);
      var rr = s.userData.rad * (0.25 + 0.75 * e);
      s.scale.set(rr, rr, rr);
      s.material.opacity = (1 - t) * 0.9;
    }
    for (i = 0; i < flashes.length; i++) {
      var f = flashes[i];
      if (f.userData.t0 < 0) { f.visible = false; continue; }
      t = (clockNow - f.userData.t0) / f.userData.dur;
      if (t >= 1) { f.userData.t0 = -1; f.visible = false; continue; }
      f.visible = true;
      var sz = f.userData.size * (0.5 + 0.8 * Math.sqrt(t));
      f.scale.set(sz, sz, sz);
      f.material.opacity = (1 - t) * (1 - t);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Camera                                                              */
  /* ------------------------------------------------------------------ */

  function fitCamera() {
    if (!camera || sizedW < 2 || sizedH < 2) return;
    var left = safe.x + 8;
    var right = safe.x + safe.w - 8;
    var top = safe.y + 8;
    var bottom = safe.y + safe.h - 8;
    if (right - left < 40 || bottom - top < 40) return;
    var aspect = (right - left) / (bottom - top);
    var t = clamp01((1.7 - aspect) / (1.7 - 0.8));
    var el = (40 + 20 * t) * Math.PI / 180;
    var yaw = 0.06;
    camDir.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
    camera.fov = 30;
    camera.aspect = sizedW / sizedH;
    var scx = (left + right) / 2;
    var scy = (top + bottom) / 2;
    camera.setViewOffset(sizedW, sizedH, sizedW / 2 - scx, sizedH / 2 - scy, sizedW, sizedH);
    camera.updateProjectionMatrix();
    var corners = [
      new THREE.Vector3(-0.1, 0, -0.1),
      new THREE.Vector3(16.1, 0, -0.1),
      new THREE.Vector3(-0.1, 0, 10.1),
      new THREE.Vector3(16.1, 0, 10.1),
      new THREE.Vector3(-1.45, 0.6, 7.5),
      new THREE.Vector3(16.0, 1.0, 9.8),
      new THREE.Vector3(13.0, 1.0, 9.8),
      new THREE.Vector3(7.5, 1.2, -0.1)
    ];
    var v = new THREE.Vector3();
    function fits(dist) {
      camera.position.copy(camLook).addScaledVector(camDir, dist);
      camera.lookAt(camLook);
      camera.updateMatrixWorld(true);
      for (var i = 0; i < corners.length; i++) {
        v.copy(corners[i]).project(camera);
        var px = (v.x * 0.5 + 0.5) * sizedW;
        var py = (-v.y * 0.5 + 0.5) * sizedH;
        if (px < left || px > right || py < top || py > bottom) return false;
      }
      return true;
    }
    var lo = 6;
    var hi = 90;
    for (var n = 0; n < 18; n++) {
      var mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    camDist = hi;
    fits(hi);
    if (scene.fog) {
      scene.fog.near = camDist + 12;
      scene.fog.far = camDist + 55;
    }
  }

  var tmpV = new THREE.Vector3();
  function updateCamera(now, time) {
    var intro = mountNow < 0 ? 1 : clamp01((now - mountNow) / 2200);
    var e = 1 - Math.pow(1 - intro, 3);
    var rot = (1 - e) * 0.45;
    var c = Math.cos(rot);
    var s = Math.sin(rot);
    tmpV.set(camDir.x * c + camDir.z * s, camDir.y, -camDir.x * s + camDir.z * c);
    var dist = camDist * (1 + 0.38 * (1 - e));
    camera.position.copy(camLook).addScaledVector(tmpV, dist);
    camera.position.y += (1 - e) * 2.5;
    var sway = 0.05;
    camera.position.x += Math.sin(now * 0.00021) * sway;
    camera.position.y += Math.sin(now * 0.00017) * sway * 0.6;
    if (shakeAmp > 0.001) {
      camera.position.x += (Math.sin(now * 0.091) + Math.sin(now * 0.057)) * 0.5 * shakeAmp;
      camera.position.y += (Math.sin(now * 0.073) + Math.sin(now * 0.039)) * 0.5 * shakeAmp;
      camera.position.z += Math.sin(now * 0.083) * 0.4 * shakeAmp;
    }
    camera.lookAt(camLook);
    camera.updateMatrixWorld(true);
  }

  function resizeIfNeeded() {
    var w = canvas.clientWidth | 0;
    var h = canvas.clientHeight | 0;
    if (w < 2 || h < 2) return;
    if (w === sizedW && h === sizedH) return;
    sizedW = w;
    sizedH = h;
    if (!prCur) prCur = Math.min(window.devicePixelRatio || 1, prMax);
    renderer.setPixelRatio(prCur);
    renderer.setSize(w, h, false);
    fitCamera();
  }

  function adaptQuality(dt) {
    if (dt <= 0 || dt > 0.25) return;
    perfAcc += dt;
    perfN++;
    if (perfAcc < 3) return;
    var avg = perfAcc / perfN;
    perfAcc = 0;
    perfN = 0;
    if (avg > 1 / 38 && prCur > 1) {
      prCur = Math.max(1, prCur - 0.25);
      sizedW = -1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pools                                                               */
  /* ------------------------------------------------------------------ */

  function take(type) {
    var pool = pools[type];
    if (!pool) pool = pools[type] = [];
    for (var i = 0; i < pool.length; i++) {
      if (!pool[i].userData.live) {
        pool[i].userData.live = true;
        pool[i].visible = true;
        return pool[i];
      }
    }
    var m = build(type, false);
    m.userData.live = true;
    scene.add(m);
    pool.push(m);
    return m;
  }

  function hidePools() {
    var k;
    var i;
    for (k in pools) {
      var pool = pools[k];
      for (i = 0; i < pool.length; i++) {
        pool[i].userData.live = false;
        pool[i].visible = false;
      }
    }
    for (k in ghosts) ghosts[k].visible = false;
  }

  function ghostOf(type) {
    if (!ghosts[type]) {
      ghosts[type] = build(type, true);
      ghosts[type].visible = false;
      scene.add(ghosts[type]);
    }
    return ghosts[type];
  }

  function setGhostOpacity(g, opacity) {
    g.traverse(function (o) {
      if (!o.material || o.material === blobMat || !o.material.transparent) return;
      if (o.material.userData.e0) o.material.opacity = opacity;
    });
  }

  /* ------------------------------------------------------------------ */
  /* State diff → juice                                                  */
  /* ------------------------------------------------------------------ */

  var T = { st: null, en: {}, tw: {}, lives: 0, phase: '' };
  var seenShots = new WeakSet();
  var towerFx = {};
  var enemyFx = {};
  var V = { x: 0, y: 0, z: 0, s: 1, yaw: 0, spin: 0 };

  function faceOf(facing) {
    return YAW[facing] || YAW.e;
  }

  function visPos(progress) {
    var p = RugSim.posAlong(progress);
    var f = faceOf(p.facing);
    V.x = p.x;
    V.z = p.y;
    V.y = 0;
    V.s = 1;
    V.spin = 0;
    V.yaw = yawToward(f[0], f[1]);
    if (progress < 0.6) {
      var t = progress / 0.6;
      V.x = -1.05 + 2.15 * t;
      V.y = Math.sin(t * Math.PI) * 0.8 + (1 - t) * 0.45;
      V.s = 0.45 + 0.55 * easeOutBack(t);
    }
    if (progress > 36.3) {
      var u = clamp01((progress - 36.3) / 0.7);
      V.s = 1 - 0.85 * u * u;
      V.y = -0.2 * u * u;
      V.spin = u * u * 9;
    }
    return V;
  }

  function nearestPathYaw(c, r) {
    var cells = RugParts.pathCells;
    var best = 1e9;
    var bx = 0;
    var bz = 0;
    for (var i = 0; i < cells.length; i++) {
      var dx = cells[i][0] - c;
      var dz = cells[i][1] - r;
      var d = dx * dx + dz * dz;
      if (d < best) { best = d; bx = dx; bz = dz; }
    }
    return yawToward(bx, bz);
  }

  function aimTower(x, z, tx, tz) {
    var c = Math.floor(x);
    var r = Math.floor(z);
    for (var id in T.tw) {
      var tw = T.tw[id];
      if (tw.c === c && tw.r === r) {
        var tf = towerFx[id];
        if (!tf) return;
        tf.fire = clockNow;
        if (tx != null) tf.aimTo = yawToward(tx - x, tz - z);
        return;
      }
    }
  }

  function diffState(state, out) {
    var towers = state.towers || [];
    var enemies = state.enemies || [];
    var fresh = T.st !== state;
    var i;
    var id;
    if (fresh) {
      T.tw = {};
      T.en = {};
      towerFx = {};
      enemyFx = {};
      T.lives = state.lives;
      T.phase = state.phase;
    }
    var cur = {};
    var added = [];
    for (i = 0; i < towers.length; i++) {
      var tw = towers[i];
      cur[tw.id] = 1;
      var prev = T.tw[tw.id];
      if (!prev) {
        added.push(tw);
        var yaw0 = nearestPathYaw(tw.c, tw.r);
        towerFx[tw.id] = { born: fresh ? -1e9 : clockNow, fire: -1e9, aim: yaw0, aimTo: yaw0 };
      } else if (!prev.up && tw.upgraded && !fresh) {
        stars(tw.c + 0.5, 0.9, tw.r + 0.5, 14);
        sparks(tw.c + 0.5, 0.6, tw.r + 0.5, 12, [0xffe07a, 0xffffff]);
        shock(tw.c + 0.5, tw.r + 0.5, 1.1, 0xffd25a, 0.55);
        flash(tw.c + 0.5, 0.8, tw.r + 0.5, 2.0, 0xffe07a, 0.5);
        towerFx[tw.id].born = clockNow - 120;
      }
      T.tw[tw.id] = { c: tw.c, r: tw.r, type: tw.type, up: !!tw.upgraded };
    }
    var removed = [];
    for (id in T.tw) {
      if (!cur[id]) {
        removed.push(T.tw[id]);
        delete T.tw[id];
        delete towerFx[id];
      }
    }
    if (!fresh) {
      var merged = false;
      for (i = 0; i < added.length; i++) {
        var a = added[i];
        var x = a.c + 0.5;
        var z = a.r + 0.5;
        if (MERGED[a.type] && removed.length >= 2) {
          merged = true;
          flash(x, 0.7, z, 3.2, 0xfff0b0, 0.7);
          shock(x, z, 1.8, 0xffe07a, 0.6);
          shock(x, z, 1.1, 0xffffff, 0.4);
          stars(x, 0.6, z, 20);
          confetti(x, 0.5, z, 26);
          shakeAmp = Math.max(shakeAmp, 0.12);
          out.merges.push({ type: a.type, c: a.c, r: a.r });
        } else {
          dust(x, z, 10, 1);
          shock(x, z, 0.9, 0xfff4d8, 0.4);
          sparks(x, 0.3, z, 6, [0xfff3c4, 0xffffff]);
        }
      }
      if (!merged) {
        for (i = 0; i < removed.length; i++) {
          var rm = removed[i];
          dust(rm.c + 0.5, rm.r + 0.5, 12, 1.1);
          stars(rm.c + 0.5, 0.4, rm.r + 0.5, 6);
        }
      } else {
        for (i = 0; i < removed.length; i++) dust(removed[i].c + 0.5, removed[i].r + 0.5, 6, 0.8);
      }
    }

    var curE = {};
    for (i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      curE[en.id] = 1;
      var pe = T.en[en.id];
      var ef = enemyFx[en.id];
      if (!ef) ef = enemyFx[en.id] = { hit: -1e9, yaw: null };
      if (!pe) {
        if (!fresh) {
          dust(-1.1, 7.5, 4, 0.8);
          sparks(-1.1, 0.7, 7.5, 4, [0xffe07a, 0xffffff]);
        }
        pe = T.en[en.id] = { x: 0, y: 0, z: 0, hp: en.hp, snare: 0 };
      } else if (!fresh) {
        if (en.hp < pe.hp - 0.01) {
          ef.hit = clockNow;
          sparks(pe.x, pe.y, pe.z, 5);
        } else if ((en.shield || 0) > (pe.shield || 0)) {
          ef.hit = clockNow;
          sparks(pe.x, pe.y, pe.z - 0.2, 8, [0xffffff, 0xd8e4ee, 0xfff3c4]);
        }
        if (!(pe.snare > 0) && (en.snare || 0) > 0) {
          var bestId = null;
          var bd = 1e9;
          for (id in T.tw) {
            if (T.tw[id].type !== 'catch') continue;
            var dx = T.tw[id].c + 0.5 - pe.x;
            var dz = T.tw[id].r + 0.5 - pe.z;
            if (dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; bestId = id; }
          }
          if (bestId && towerFx[bestId]) {
            towerFx[bestId].fire = clockNow;
            towerFx[bestId].aimTo = yawToward(pe.x - (T.tw[bestId].c + 0.5), pe.z - (T.tw[bestId].r + 0.5));
          }
          sparks(pe.x, 0.6, pe.z, 6, [0xffffff, 0xfff3c4]);
        }
      }
      pe.hp = en.hp;
      pe.snare = en.snare || 0;
      pe.shield = en.shield || 0;
      pe.progress = en.progress;
      pe.type = en.type;
      pe.gold = en.gold;
    }
    for (id in T.en) {
      if (curE[id]) continue;
      var gone = T.en[id];
      if (!fresh) {
        if (gone.progress >= 36.4) {
          emit(sparksFx, 14.5, 0.2, 6.5, 14, {
            speed: 1.2, up: 1.4, size: [0.2, 0.04], life: [0.4, 0.7], colors: [0x9a6cff, 0xd6b8ff, 0xff8fb3],
            grav: -1, drag: 2, shape: 3, spin: 8
          });
          shock(14.5, 6.5, 0.9, 0xb48cff, 0.45);
        } else {
          var ht = HEIGHT[gone.type] || 1;
          var py = Math.max(0.3, gone.y);
          dust(gone.x, gone.z, 9, 1.2);
          stars(gone.x, py, gone.z, gone.type === 'balloon' ? 6 : 8);
          if (gone.type === 'balloon') {
            emit(softFx, gone.x, py, gone.z, 16, {
              speed: 2.6, up: 1, size: [0.14, 0.1], life: [0.6, 1.0], colors: [0xf0454f, 0xff7a84],
              grav: 4, drag: 2, shape: 2, spin: 12
            });
            flash(gone.x, py, gone.z, 1.4, 0xffffff, 0.25);
          } else {
            flash(gone.x, py * 0.8, gone.z, 1.2 * ht, 0xfff0c8, 0.35);
          }
          shock(gone.x, gone.z, 0.8, 0xfff4d8, 0.35);
          out.kills.push({ wx: gone.x, wy: py + 0.3, wz: gone.z, n: gone.gold || 0 });
        }
      }
      delete T.en[id];
      delete enemyFx[id];
    }

    if (!fresh && state.lives < T.lives) {
      shakeAmp = Math.max(shakeAmp, 0.28);
      out.leaks += T.lives - state.lives;
    }
    if (!fresh && T.phase !== state.phase) {
      if (state.phase === 'won') {
        for (i = 0; i < 6; i++) confetti(2 + i * 2.4, 1.5, 3 + (i % 2) * 3, 40, 1.4);
      } else if (T.phase === 'march' && state.phase === 'idle') {
        confetti(8, 1.2, 5, 30, 2.5);
        for (id in T.tw) stars(T.tw[id].c + 0.5, 0.9, T.tw[id].r + 0.5, 3, Math.random() * 0.3);
      }
    }
    T.lives = state.lives;
    T.phase = state.phase;
    T.st = state;
  }

  /* ------------------------------------------------------------------ */
  /* Mount                                                               */
  /* ------------------------------------------------------------------ */

  function buildEnvironment() {
    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      var env = new THREE.Scene();
      var room = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), new THREE.MeshBasicMaterial({ color: 0xb98d68, side: THREE.BackSide }));
      room.position.y = 2;
      env.add(room);
      var floorE = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0x7a4e2e }));
      floorE.rotation.x = -Math.PI / 2;
      floorE.position.y = -0.45;
      env.add(floorE);
      var ceil = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0xfff3e0 }));
      ceil.rotation.x = Math.PI / 2;
      ceil.position.y = 4.4;
      env.add(ceil);
      var winE = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      winE.position.set(1.5, 2, -4.9);
      winE.material.color.setRGB(6, 6, 5.5);
      env.add(winE);
      var lampE = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lampE.material.color.setRGB(5, 3.4, 1.8);
      lampE.position.set(-4, 2, -2);
      env.add(lampE);
      var key = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      key.material.color.setRGB(2.5, 2.3, 2.1);
      key.position.set(-2, 4.3, 3);
      key.rotation.x = Math.PI / 2;
      env.add(key);
      scene.environment = pmrem.fromScene(env, 0.035).texture;
      pmrem.dispose();
    } catch (err) {}
  }

  function mount(target) {
    canvas = target;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
    } catch (err) {
      return false;
    }
    if (!renderer.getContext()) return false;
    renderer.setClearColor(0x3a2a1e, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    prCur = Math.min(window.devicePixelRatio || 1, prMax);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3a2a1e);
    scene.fog = new THREE.Fog(0x4a3424, 34, 70);
    camera = new THREE.PerspectiveCamera(30, 1, 0.5, 140);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    planeHit = new THREE.Vector3();
    proj = new THREE.Vector3();
    aimDir = new THREE.Vector3();
    UPV = new THREE.Vector3(0, 1, 0);
    camDir = new THREE.Vector3(0.06, 0.64, 0.77).normalize();
    camLook = new THREE.Vector3(7.9, 0, 5.15);

    TEX.blob = blobTexture();
    TEX.glow = radialTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    TEX.swirl = swirlTexture();
    TEX.atlas = atlasTexture();
    TEX.letters = letterAtlas();
    TEX.quilt = quiltTexture();
    TEX.netTex = netTexture();
    TEX.num7 = canvasTex(64, 64, function (g) {
      g.fillStyle = '#fff8ec';
      g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2f4a6b';
      g.font = '900 44px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('7', 32, 35);
    });
    TEX.swirlMat = new THREE.MeshBasicMaterial({ map: TEX.swirl, color: 0x9fe0ff, transparent: true, opacity: 0.85, depthWrite: false });
    TEX.netMat = new THREE.MeshBasicMaterial({ map: TEX.netTex, color: 0xfff6e0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.2 });

    var hemi = new THREE.HemisphereLight(0xfff0dc, 0x80543a, 0.9);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffe2bc, 2.6);
    key.position.set(1.5, 14, 13);
    key.target.position.set(8.5, 0, 4.5);
    key.castShadow = true;
    var sm = LOW ? 1024 : 2048;
    key.shadow.mapSize.set(sm, sm);
    key.shadow.camera.left = -13;
    key.shadow.camera.right = 13;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    key.shadow.camera.near = 4;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 3;
    scene.add(key);
    scene.add(key.target);
    var fill = new THREE.DirectionalLight(0xcfe0ff, 0.5);
    fill.position.set(22, 7, 12);
    scene.add(fill);
    var winLight = new THREE.PointLight(0xffe6c0, 14, 10, 2);
    winLight.position.set(12.1, 2.2, 0.8);
    scene.add(winLight);
    var tvLight = new THREE.PointLight(0x9fc8ff, 3, 4, 2);
    tvLight.position.set(7.5, 1.4, 0.8);
    scene.add(tvLight);

    buildEnvironment();

    blobMat = new THREE.MeshBasicMaterial({ map: TEX.blob, transparent: true, depthWrite: false });
    addFloorAndBoard();
    addWalls();
    addFurniture();
    addGuides();
    softFx = new Particles(LOW ? 400 : 700, false);
    sparksFx = new Particles(LOW ? 300 : 500, true);
    addFxMeshes();
    resizeIfNeeded();
    try { makeThumbs(); } catch (err) {}
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 40px Fredoka').then(function () {
        var t2 = letterAtlas();
        TEX.letters.image = t2.image;
        TEX.letters.needsUpdate = true;
      }).catch(function () {});
    }
    return true;
  }

  function setSafe(r) {
    var x = Math.round(r.x);
    var y = Math.round(r.y);
    var w = Math.round(r.w);
    var h = Math.round(r.h);
    if (x === safe.x && y === safe.y && w === safe.w && h === safe.h) return;
    safe = { x: x, y: y, w: w, h: h };
    sizedW = -1;
  }

  /* ------------------------------------------------------------------ */
  /* Thumbnails (3D toy portraits for the HUD)                           */
  /* ------------------------------------------------------------------ */

  function makeThumbs() {
    var size = 192;
    var rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    var ts = new THREE.Scene();
    ts.environment = scene.environment;
    ts.add(new THREE.HemisphereLight(0xfff4e6, 0x8a6a50, 1.1));
    var k = new THREE.DirectionalLight(0xfff0dc, 2.0);
    k.position.set(-2, 4, 3);
    ts.add(k);
    var f = new THREE.DirectionalLight(0xcfe0ff, 0.6);
    f.position.set(3, 1, 2);
    ts.add(f);
    var cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
    var buf = new Uint8Array(size * size * 4);
    var cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    var cx = cv.getContext('2d');
    var img = cx.createImageData(size, size);
    var oldClear = new THREE.Color();
    renderer.getClearColor(oldClear);
    var oldAlpha = renderer.getClearAlpha();
    var bbox = new THREE.Box3();
    var ctr = new THREE.Vector3();
    var dim = new THREE.Vector3();
    for (var type in BUILD) {
      var m = build(type, false);
      m.traverse(function (o) { if (o.material === blobMat) o.visible = false; });
      if (m.userData.tick) {
        m.userData.tick({ progress: 1.3, time: 0.6, now: 0, slow: 1, shield: 0, snare: 0, upgraded: false, hit: 9, fire: 9 });
      }
      m.rotation.y = Math.PI - 0.55;
      ts.add(m);
      m.updateMatrixWorld(true);
      visibleBox(m, bbox);
      bbox.getCenter(ctr);
      bbox.getSize(dim);
      var rad = Math.max(dim.x, dim.y, dim.z) * 0.5;
      var dist = rad / Math.sin(cam.fov * Math.PI / 360) * 1.02;
      cam.position.set(ctr.x, ctr.y + dist * 0.38, ctr.z + dist * 0.92);
      cam.lookAt(ctr);
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(ts, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var si = ((size - 1 - y) * size + x) * 4;
          var di = (y * size + x) * 4;
          var a = buf[si + 3];
          var un = a > 0 ? 255 / a : 0;
          img.data[di] = Math.min(255, buf[si] * (a < 255 ? un : 1));
          img.data[di + 1] = Math.min(255, buf[si + 1] * (a < 255 ? un : 1));
          img.data[di + 2] = Math.min(255, buf[si + 2] * (a < 255 ? un : 1));
          img.data[di + 3] = a;
        }
      }
      cx.putImageData(img, 0, 0);
      thumbs[type] = cv.toDataURL('image/png');
      ts.remove(m);
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(oldClear, oldAlpha);
    rt.dispose();
  }

  function visibleBox(root, b) {
    b.makeEmpty();
    var tmp = new THREE.Box3();
    root.traverse(function (o) {
      if (!o.isMesh || o.material === blobMat) return;
      for (var p = o; p; p = p.parent) if (!p.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      b.union(tmp);
    });
  }

  function thumb(type) {
    return thumbs[type] || null;
  }

  /* ------------------------------------------------------------------ */
  /* Frame                                                               */
  /* ------------------------------------------------------------------ */

  var hpM = new THREE.Matrix4();
  var hpQ = new THREE.Quaternion();
  var hpP = new THREE.Vector3();
  var hpS = new THREE.Vector3();
  var hpC = new THREE.Color();
  var camRight = new THREE.Vector3();
  var dotM = new THREE.Matrix4();
  var ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  function frame(state, ui) {
    if (!renderer) return null;
    ui = ui || {};
    resizeIfNeeded();
    var time = ui.time || 0;
    var now = ui.now || 0;
    var dt = lastNow ? (now - lastNow) / 1000 : 0;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    lastNow = now;
    clockNow = now / 1000;
    if (mountNow < 0) mountNow = now;
    adaptQuality(dt);
    shakeAmp *= Math.exp(-dt * 7);

    var out = { kills: [], leaks: 0, merges: [] };
    diffState(state, out);
    hidePools();
    pickList.length = 0;
    var i;

    // ---- towers
    var towers = state.towers || [];
    for (i = 0; i < towers.length; i++) {
      var tw = towers[i];
      var m = take(tw.type);
      var tf = towerFx[tw.id] || { born: -1e9, fire: -1e9, aim: 0, aimTo: 0 };
      var age = clockNow - tf.born;
      var pop = age < 0.6 ? 0.15 + 0.85 * easeOutElastic(age / 0.6) : 1;
      var sel = ui.selectedId === tw.id;
      tf.aim = lerpAngle(tf.aim, tf.aimTo, 1 - Math.exp(-dt * 9));
      m.position.set(tw.c + 0.5, sel ? 0.1 + Math.sin(time * 5) * 0.03 : 0, tw.r + 0.5);
      m.rotation.set(0, tf.aim, 0);
      m.scale.setScalar(m.userData.base * pop * (sel ? 1.06 : 1));
      m.userData.c = tw.c;
      m.userData.r = tw.r;
      m.userData.pick = true;
      if (m.userData.tick) {
        m.userData.tick({ progress: 0, time: time, now: now, upgraded: !!tw.upgraded, shield: 0, slow: 1, snare: 0, hit: 9, fire: clockNow - tf.fire });
      }
      pickList.push(m);
    }

    if (ui.ghost && BUILD[ui.ghost.type]) {
      var gh = ghostOf(ui.ghost.type);
      gh.visible = true;
      gh.position.set(ui.ghost.c + 0.5, 0.05 + Math.sin(time * 4) * 0.04, ui.ghost.r + 0.5);
      gh.rotation.set(0, nearestPathYaw(ui.ghost.c, ui.ghost.r), 0);
      setGhostOpacity(gh, ui.ghost.ok ? 0.62 : 0.28);
      if (gh.userData.tick) {
        gh.userData.tick({ progress: 0, time: time, now: now, upgraded: false, shield: 0, slow: 1, snare: 0, hit: 9, fire: 9 });
      }
    }

    // ---- marchers
    var enemies = state.enemies || [];
    var bars = 0;
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      var ef = enemyFx[en.id] || { hit: -1e9, yaw: null };
      visPos(en.progress);
      if (ef.yaw == null) ef.yaw = V.yaw;
      else ef.yaw = lerpAngle(ef.yaw, V.yaw, 1 - Math.exp(-dt * 11));
      var body = take(en.type);
      body.position.set(V.x, V.y, V.z);
      body.rotation.set(0, ef.yaw + V.spin, 0);
      body.scale.setScalar(body.userData.base * V.s);
      body.userData.pick = false;
      if (body.userData.tick) {
        body.userData.tick({
          progress: en.progress,
          time: time,
          now: now,
          slow: en.slow == null ? 1 : en.slow,
          shield: en.shield || 0,
          snare: en.snare || 0,
          upgraded: false,
          hit: clockNow - ef.hit,
          fire: 9
        });
      }
      var ht = (HEIGHT[en.type] || 1) * V.s;
      var pe = T.en[en.id];
      if (pe) {
        pe.x = V.x;
        pe.y = V.y + ht * 0.55;
        pe.z = V.z;
      }
      if (en.hp < en.maxHp && bars < 80 && V.s > 0.5) {
        var frac = Math.max(0, en.hp / en.maxHp);
        var w = 0.62;
        hpQ.copy(camera.quaternion);
        hpP.set(V.x, V.y + ht + 0.16, V.z);
        hpS.set(w + 0.06, 0.13, 1);
        hpM.compose(hpP, hpQ, hpS);
        hpBack.setMatrixAt(bars, hpM);
        hpP.addScaledVector(camRight, -w / 2);
        hpS.set(w * frac, 0.08, 1);
        hpM.compose(hpP, hpQ, hpS);
        hpFill.setMatrixAt(bars, hpM);
        if (frac > 0.6) hpC.setHex(0x7ed957);
        else if (frac > 0.3) hpC.setHex(0xffc93c);
        else hpC.setHex(0xff5a5a);
        hpFill.setColorAt(bars, hpC);
        bars++;
      }
    }
    hpBack.count = bars;
    hpFill.count = bars;
    hpBack.instanceMatrix.needsUpdate = true;
    hpFill.instanceMatrix.needsUpdate = true;
    if (hpFill.instanceColor) hpFill.instanceColor.needsUpdate = true;

    // ---- pillow projectiles
    var projs = state.projectiles || [];
    for (i = 0; i < pillowShots.length; i++) pillowShots[i].visible = false;
    for (i = 0; i < projs.length && i < pillowShots.length; i++) {
      var shot = projs[i];
      if (!seenShots.has(shot)) {
        seenShots.add(shot);
        aimTower(shot.x, shot.y, shot.tx, shot.ty);
        dust(shot.x, shot.y, 3, 0.6);
      }
      var u = shot.travel > 0 ? clamp01(shot.age / shot.travel) : 0;
      var px = shot.x + (shot.tx - shot.x) * u;
      var pz = shot.y + (shot.ty - shot.y) * u;
      var py = 0.45 + Math.sin(u * Math.PI) * 1.1;
      var ps = pillowShots[i];
      ps.visible = true;
      ps.position.set(px, py, pz);
      ps.rotation.set(u * 4, u * 3, u * 6);
      var stretch = 1 + Math.sin(u * Math.PI) * 0.25;
      ps.scale.set(1.5 / stretch, 1.5 * stretch, 1.5 / stretch);
    }

    // ---- event fx (beams, splashes, rolls, pops)
    for (i = 0; i < shots.length; i++) shots[i].visible = false;
    for (i = 0; i < bandShots.length; i++) bandShots[i].visible = false;
    for (i = 0; i < rolls.length; i++) rolls[i].visible = false;
    var si = 0;
    var bi = 0;
    var ri = 0;
    var fx = ui.fx || [];
    for (i = 0; i < fx.length; i++) {
      var f = fx[i];
      var k = (now - f.born) / (f.dur * 1000);
      if (k < 0) k = 0;
      if (!f._seen) {
        f._seen = 1;
        if (f.t === 'beam') {
          aimTower(f.x0, f.y0, f.x1, f.y1);
          var band = f.kind === 'band';
          emit(sparksFx, f.x1, 0.45, f.y1, band ? 10 : 6, {
            speed: band ? 2.8 : 2, up: 1.5, size: [band ? 0.22 : 0.15, 0.03], life: [0.2, 0.4],
            colors: band ? [0xffe07a, 0xfff6c8, 0xffc23a] : [0xd8f0ff, 0xffffff, 0xa8dcff],
            grav: 6, drag: 2.5, shape: 3, spin: 6, delay: f.dur * 0.85
          });
          if (band) shakeAmp = Math.max(shakeAmp, 0.04);
        } else if (f.t === 'splash') {
          shock(f.x, f.y, (f.r || 1) * 1.05, 0xffe6ee, 0.45);
          feathers(f.x, f.y, 12);
          dust(f.x, f.y, 6, 1.1);
          shakeAmp = Math.max(shakeAmp, 0.05);
        } else if (f.t === 'roll') {
          for (var id in T.tw) {
            var bt = T.tw[id];
            if (bt.type !== 'bowl') continue;
            var ddx = bt.c + 0.5 - f.x0;
            var ddz = bt.r + 0.5 - f.y0;
            if (ddx * ddx + ddz * ddz <= 4.5 && towerFx[id]) {
              towerFx[id].fire = clockNow;
              towerFx[id].aimTo = yawToward(-ddx, -ddz);
            }
          }
        } else if (f.t === 'pop') {
          stars(f.x, 0.5, f.y, 8);
          emit(sparksFx, f.x, 0.5, f.y, 10, {
            speed: 1.2, up: 2.4, size: [0.18, 0.06], life: [0.5, 0.8], colors: [0xffd25a, 0xffe9a0],
            grav: 5, drag: 1, shape: 0
          });
        }
      }
      if (f.t === 'beam') {
        if (f.kind === 'band' && bi < bandShots.length) {
          var bs = bandShots[bi++];
          var kb = Math.min(1, k / 0.85);
          bs.visible = kb < 1;
          bs.position.set(f.x0 + (f.x1 - f.x0) * kb, 0.75 + Math.sin(kb * Math.PI) * 0.35 - kb * 0.2, f.y0 + (f.y1 - f.y0) * kb);
          bs.rotation.set(now * 0.03, now * 0.02, 0);
          bs.scale.setScalar(1.6);
          if (bs.visible) emit(sparksFx, bs.position.x, bs.position.y, bs.position.z, 1, {
            speed: 0.1, size: [0.12, 0.02], life: [0.15, 0.25], colors: [0xffd25a], shape: 0
          });
        } else if (si < shots.length) {
          var sh = shots[si++];
          var km = Math.min(1, k / 0.85);
          sh.visible = km < 1;
          sh.position.set(f.x0 + (f.x1 - f.x0) * km, 0.62 - km * 0.2, f.y0 + (f.y1 - f.y0) * km);
          if (sh.visible) emit(sparksFx, sh.position.x, sh.position.y, sh.position.z, 2, {
            speed: 0.15, size: [0.14, 0.02], life: [0.12, 0.22], colors: [0xbfe6ff, 0xffffff], shape: 0
          });
        }
      } else if (f.t === 'roll' && ri < rolls.length) {
        var orb = rolls[ri++];
        var kr = clamp01(k);
        orb.visible = kr < 1;
        orb.position.set(f.x0 + (f.x1 - f.x0) * kr, 0.2, f.y0 + (f.y1 - f.y0) * kr);
        var ry = yawToward(f.x1 - f.x0, f.y1 - f.y0);
        orb.rotation.set(0, ry + Math.PI / 2, 0);
        orb.rotateZ(-kr * 14);
        orb.scale.setScalar(1.4);
        if (Math.random() < 0.5) dust(orb.position.x, orb.position.z, 1, 0.6);
      }
    }

    // ---- room details
    var nScuff = Math.min(8, state.scuffs || 0);
    for (i = 0; i < scuffs.length; i++) scuffs[i].visible = i < nScuff;
    if (holeSwirl) {
      holeSwirl.rotation.z = -time * 1.5;
      holeSwirl.material.opacity = 0.35 + Math.sin(now * 0.004) * 0.12;
    }
    if (tvScreen) {
      var fl2 = 0.86 + Math.sin(now * 0.011) * 0.03 + Math.sin(now * 0.037) * 0.02;
      tvScreen.material.color.setRGB(fl2, fl2, fl2);
    }
    updateMotes(now / 1000);

    // ---- guides
    if (ui.showGrid) {
      freeDots.visible = true;
      var pulse = 0.5 + Math.sin(now * 0.006) * 0.15;
      freeDots.material.opacity = pulse;
      for (i = 0; i < woodCells.length; i++) {
        var wc = woodCells[i];
        if (RugSim.towerAt(state, wc[0], wc[1])) freeDots.setMatrixAt(i, ZERO);
        else {
          dotM.makeTranslation(wc[0] + 0.5, 0.05, wc[1] + 0.5);
          freeDots.setMatrixAt(i, dotM);
        }
      }
      freeDots.instanceMatrix.needsUpdate = true;
    } else {
      freeDots.visible = false;
    }
    if (ui.range && ui.range.radius) {
      ring.visible = true;
      ringDash.visible = true;
      var rad = ui.range.radius;
      ring.position.set(ui.range.c + 0.5, 0.06, ui.range.r + 0.5);
      ringDash.position.set(ui.range.c + 0.5, 0.062, ui.range.r + 0.5);
      ring.scale.set(rad, rad, rad);
      var rd = rad * 1.04;
      ringDash.scale.set(rd, rd, rd);
      ringDash.rotation.z = time * 0.4;
      var good = !ui.ghost || ui.ghost.ok;
      ring.material.color.set(ui.ghost ? (good ? 0x9cf07a : 0xff7a6a) : 0xffd25a);
      ring.material.opacity = 0.75 + Math.sin(time * 3) * 0.12;
    } else {
      ring.visible = false;
      ringDash.visible = false;
    }
    if (ui.hover) {
      pad.visible = true;
      pad.position.set(ui.hover.c + 0.5, 0.058, ui.hover.r + 0.5);
      pad.material.color.set(ui.hover.ok ? 0xb7f0a0 : 0xff9a8a);
      var pp = 0.95 + Math.sin(now * 0.01) * 0.04;
      pad.scale.set(pp, pp, pp);
    } else {
      pad.visible = false;
    }
    if (ui.selectedId != null) {
      var stw = null;
      for (i = 0; i < towers.length; i++) if (towers[i].id === ui.selectedId) stw = towers[i];
      selGlow.visible = !!stw;
      if (stw) {
        selGlow.position.set(stw.c + 0.5, 0.055, stw.r + 0.5);
        selGlow.rotation.z = -time * 2;
      }
    } else {
      selGlow.visible = false;
    }

    // ---- particles + transient
    if (softFx) {
      var uScale = (sizedH * prCur) / (2 * Math.tan(camera.fov * Math.PI / 360));
      softFx.mat.uniforms.uScale.value = uScale;
      sparksFx.mat.uniforms.uScale.value = uScale;
      softFx.update(dt);
      sparksFx.update(dt);
    }
    updateTransient();

    updateCamera(now, time);
    renderer.render(scene, camera);

    for (i = 0; i < out.kills.length; i++) {
      var kk = out.kills[i];
      var sp = project(kk.wx, kk.wy, kk.wz);
      kk.x = sp ? sp.x : -1;
      kk.y = sp ? sp.y : -1;
    }
    for (i = 0; i < out.merges.length; i++) {
      var mg = out.merges[i];
      var mp = project(mg.c + 0.5, 1.2, mg.r + 0.5);
      mg.x = mp ? mp.x : -1;
      mg.y = mp ? mp.y : -1;
    }
    return out;
  }

  function pick(clientX, clientY) {
    if (!renderer) return null;
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(pickList, true);
    var i;
    for (i = 0; i < hits.length; i++) {
      var o = hits[i].object;
      while (o && o.userData.c == null) o = o.parent;
      if (o && o.userData.pick) return { c: o.userData.c, r: o.userData.r };
    }
    if (!raycaster.ray.intersectPlane(floorPlane, planeHit)) return null;
    return cellOf(planeHit.x, planeHit.z);
  }

  function project(x, y, z) {
    if (!renderer) return null;
    proj.set(x, y, z).project(camera);
    if (proj.z < -1 || proj.z > 1) return null;
    var rect = canvas.getBoundingClientRect();
    return {
      x: (proj.x * 0.5 + 0.5) * rect.width,
      y: (-proj.y * 0.5 + 0.5) * rect.height
    };
  }

  function shake(a) {
    shakeAmp = Math.max(shakeAmp, a || 0.2);
  }

  globalThis.RugView = {
    mount: mount,
    setSafe: setSafe,
    frame: frame,
    pick: pick,
    project: project,
    thumb: thumb,
    shake: shake,
    yawToward: yawToward,
    cellOf: cellOf,
    selfTestFacing: selfTestFacing
  };
})();
