/* Rug Siege 3D view.
   World: +x east, +y up, +z south. Sim tile (x, y) maps to world (x, y-up, y).
   A toy's face is authored on local −z. Heading is yawToward(dx, dz). */
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
  var pickList = [];
  var pools = {};
  var ghosts = {};
  var ghosting = false;
  var blobMat = null;
  var grid = null;
  var ring = null;
  var pad = null;
  var scuffs = [];
  var beams = [];
  var splashes = [];
  var rolls = [];
  var pillows = [];
  var sizedW = -1;
  var sizedH = -1;
  var safe = { x: 8, y: 96, w: 800, h: 400 };
  var wheelGeo = null;

  function mat(hex, o) {
    o = o || {};
    var m = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: o.roughness == null ? 0.55 : o.roughness,
      metalness: o.metalness || 0,
      clearcoat: o.clearcoat || 0,
      clearcoatRoughness: o.clearcoatRoughness == null ? 0.25 : o.clearcoatRoughness,
      sheen: o.sheen || 0,
      sheenColor: new THREE.Color(o.sheenColor == null ? 0xffffff : o.sheenColor),
      sheenRoughness: 0.55,
      emissive: o.emissive == null ? 0x000000 : o.emissive,
      emissiveIntensity: o.emissiveIntensity || (o.emissive ? 0.8 : 0),
      map: o.map || null,
      transparent: !!o.transparent || ghosting,
      opacity: ghosting ? 0.5 : (o.opacity == null ? 1 : o.opacity),
      side: o.side || THREE.FrontSide,
      depthWrite: ghosting ? false : !o.transparent,
      envMapIntensity: 1,
      polygonOffset: !!o.polygonOffset,
      polygonOffsetFactor: o.polygonOffset ? -1 : 0
    });
    return m;
  }

  function box(w, h, d, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = !material.transparent;
    m.receiveShadow = true;
    return m;
  }

  function ball(r, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), material);
    m.position.set(x, y, z);
    m.castShadow = !material.transparent;
    m.receiveShadow = true;
    return m;
  }

  function cyl(rt, rb, h, material, x, y, z) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 14), material);
    m.position.set(x, y, z);
    m.castShadow = !material.transparent;
    m.receiveShadow = true;
    return m;
  }

  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  function woodTexture() {
    return canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#8d6844';
      g.fillRect(0, 0, w, h);
      var i;
      for (i = 0; i < 7; i++) {
        var x = i * 74;
        var shade = 118 + (i * 13) % 36;
        g.fillStyle = 'rgb(' + (shade + 28) + ',' + (shade - 8) + ',' + (shade - 42) + ')';
        g.fillRect(x, 0, 70, h);
        g.fillStyle = 'rgba(48, 28, 12, 0.35)';
        g.fillRect(x + 68, 0, 6, h);
        g.strokeStyle = 'rgba(70, 38, 16, 0.28)';
        var y;
        for (y = 12; y < h; y += 16) {
          g.beginPath();
          g.moveTo(x + 8, y);
          g.bezierCurveTo(x + 22, y + 5, x + 46, y - 4, x + 62, y + 2);
          g.stroke();
        }
        if (i % 2 === 0) {
          g.fillStyle = 'rgba(62, 34, 14, 0.35)';
          g.beginPath();
          g.ellipse(x + 28, 90 + i * 48, 9, 5, 0.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  }

  function boardTexture() {
    var S = 64;
    var W = 16 * S;
    var H = 10 * S;
    var kind = [];
    var r;
    var c;
    for (r = 0; r < 10; r++) {
      kind[r] = [];
      for (c = 0; c < 16; c++) kind[r][c] = RugSim.cellKind(c, r);
    }
    function isPath(cc, rr) {
      return rr >= 0 && rr < 10 && cc >= 0 && cc < 16 && kind[rr][cc] === 'path';
    }
    return canvasTex(W, H, function (g) {
      g.fillStyle = '#7a5738';
      g.fillRect(0, 0, W, H);
      for (r = 0; r < 10; r++) {
        for (c = 0; c < 16; c++) {
          if (kind[r][c] !== 'wood') continue;
          var x = c * S;
          var y = r * S;
          g.fillStyle = (c + r) % 2 ? '#e7d0aa' : '#dcc29a';
          g.fillRect(x + 2, y + 2, S - 4, S - 4);
          g.strokeStyle = 'rgba(92, 58, 28, 0.22)';
          g.beginPath();
          var yy;
          for (yy = 8; yy < S - 4; yy += 8) {
            g.moveTo(x + 6, y + yy);
            g.bezierCurveTo(x + 20, y + yy + 2, x + 40, y + yy - 2, x + S - 8, y + yy + 1);
          }
          g.stroke();
        }
      }
      for (r = 0; r < 10; r++) {
        for (c = 0; c < 16; c++) {
          if (!isPath(c, r)) continue;
          var px = c * S;
          var py = r * S;
          g.fillStyle = (c + r) % 2 ? '#8a2c30' : '#7a2428';
          g.fillRect(px, py, S, S);
          g.fillStyle = 'rgba(255, 228, 200, 0.06)';
          var row;
          for (row = 3; row < S; row += 5) g.fillRect(px, py + row, S, 1);
        }
      }
      g.fillStyle = '#f3e0c4';
      var band = 8;
      for (r = 0; r < 10; r++) {
        for (c = 0; c < 16; c++) {
          if (!isPath(c, r)) continue;
          var bx = c * S;
          var by = r * S;
          if (!isPath(c, r - 1)) g.fillRect(bx, by, S, band);
          if (!isPath(c, r + 1)) g.fillRect(bx, by + S - band, S, band);
          if (!isPath(c - 1, r)) g.fillRect(bx, by, band, S);
          if (!isPath(c + 1, r)) g.fillRect(bx + S - band, by, band, S);
        }
      }
      for (r = 0; r < 10; r++) {
        for (c = 0; c < 16; c++) {
          if ((c + r) % 2 || !isPath(c, r)) continue;
          var cx = c * S + S / 2;
          var cy = r * S + S / 2;
          g.fillStyle = '#e7c98a';
          g.beginPath();
          g.moveTo(cx, cy - 11);
          g.lineTo(cx + 11, cy);
          g.lineTo(cx, cy + 11);
          g.lineTo(cx - 11, cy);
          g.closePath();
          g.fill();
          g.fillStyle = '#fff6e8';
          g.beginPath();
          g.arc(cx, cy, 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  }

  function skyTexture() {
    return canvasTex(256, 160, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#8ec8e6');
      grd.addColorStop(0.62, '#d5f1ff');
      grd.addColorStop(1, '#b7d39a');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#6e8f58';
      g.beginPath();
      g.moveTo(0, h);
      g.quadraticCurveTo(36, h * 0.45, 78, h);
      g.fill();
      g.fillStyle = '#4f7344';
      g.beginPath();
      g.arc(168, h * 0.78, 58, Math.PI, 0);
      g.fill();
      g.fillStyle = '#fffdf4';
      g.beginPath();
      g.arc(206, 34, 16, 0, Math.PI * 2);
      g.fill();
    });
  }

  function wallTexture() {
    return canvasTex(256, 256, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, '#f7f1e8');
      grd.addColorStop(1, '#e4d5c4');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      var i;
      for (i = 0; i < 900; i++) {
        g.fillStyle = 'rgba(120, 90, 60, 0.035)';
        g.fillRect((i * 47) % w, (i * 19) % h, 2, 2);
      }
      g.fillStyle = 'rgba(90, 60, 36, 0.08)';
      g.fillRect(0, h * 0.72, w, h);
    });
  }

  function blobTexture() {
    return canvasTex(128, 128, function (g) {
      var grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
      grd.addColorStop(0, 'rgba(50, 30, 16, 0.42)');
      grd.addColorStop(1, 'rgba(50, 30, 16, 0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });
  }

  function screenTexture() {
    return canvasTex(256, 144, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#ffd7a8');
      grd.addColorStop(0.55, '#f08a62');
      grd.addColorStop(1, '#3c4a78');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2a241c';
      g.fillRect(0, h * 0.62, w, h);
      g.fillStyle = '#6f8a62';
      g.beginPath();
      g.moveTo(0, h * 0.62);
      g.lineTo(70, h * 0.4);
      g.lineTo(140, h * 0.62);
      g.fill();
      g.fillStyle = '#fff4dd';
      g.beginPath();
      g.arc(190, 42, 16, 0, Math.PI * 2);
      g.fill();
    });
  }

  function pictureTexture() {
    return canvasTex(180, 120, function (g, w, h) {
      g.fillStyle = '#9ec4d8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8e6c8';
      g.fillRect(0, 70, w, 50);
      g.fillStyle = '#6a8f62';
      g.beginPath();
      g.arc(50, 78, 28, Math.PI, 0);
      g.fill();
      g.beginPath();
      g.arc(100, 84, 36, Math.PI, 0);
      g.fill();
      g.fillStyle = '#fff8ea';
      g.beginPath();
      g.arc(130, 36, 12, 0, Math.PI * 2);
      g.fill();
    });
  }

  function addBlob(g, s) {
    var m = new THREE.Mesh(new THREE.PlaneGeometry(s || 0.72, s || 0.72), blobMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.035;
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 2;
    g.add(m);
  }

  function finishTower(g, tick) {
    var wood = mat(0x6a4128, { roughness: 0.7 });
    g.add(cyl(0.26, 0.3, 0.07, wood, 0, 0.035, 0));
    var ringM = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.022, 8, 22),
      mat(0xe6c34a, { metalness: 0.65, roughness: 0.28 })
    );
    ringM.rotation.x = Math.PI / 2;
    ringM.position.y = 0.08;
    ringM.name = 'up';
    ringM.visible = false;
    g.add(ringM);
    addBlob(g, 0.78);
    g.userData.tick = function (time, info) {
      ringM.visible = !!info.upgraded;
      tick(time, info);
    };
    return g;
  }

  function finishMarcher(g, tick) {
    addBlob(g, 0.62);
    var disc = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.28, 24),
      mat(0x9ec7e6, { transparent: true, opacity: 0.8, roughness: 0.5, depthWrite: true })
    );
    disc.material.depthWrite = false;
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.05;
    disc.visible = false;
    disc.renderOrder = 3;
    g.add(disc);
    g.userData.tick = function (time, info) {
      var slow = info.slow == null ? 1 : info.slow;
      disc.visible = slow < 0.999;
      if (disc.visible) disc.material.color.set(slow <= 0 ? 0xe6b15a : 0x9ec7e6);
      tick(time, info);
    };
    return g;
  }

  function buildPerson(cloth, skin, dark, lid) {
    var g = new THREE.Group();
    var hips = new THREE.Group();
    hips.position.y = 0.34;
    g.add(hips);
    var torso = box(0.28, 0.28, 0.16, cloth, 0, 0.12, 0);
    hips.add(torso);
    hips.add(box(0.3, 0.045, 0.17, dark, 0, 0.01, 0));
    var head = box(0.22, 0.2, 0.2, skin, 0, 0.36, 0);
    hips.add(head);
    if (!lid) {
      hips.add(box(0.24, 0.07, 0.22, cloth, 0, 0.48, -0.01));
      hips.add(box(0.18, 0.03, 0.08, cloth, 0, 0.44, -0.14));
    }
    var eyeL = ball(0.045, dark, -0.05, 0.35, -0.13);
    var eyeR = ball(0.045, dark, 0.05, 0.35, -0.13);
    eyeL.scale.z = 0.45;
    eyeR.scale.z = 0.45;
    hips.add(eyeL);
    hips.add(eyeR);
    function limb(x, y, len, color) {
      var pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      pivot.add(box(0.07, len, 0.07, color, 0, -len / 2, 0));
      hips.add(pivot);
      return pivot;
    }
    var armL = limb(-0.18, 0.16, 0.22, cloth);
    var armR = limb(0.18, 0.16, 0.22, cloth);
    var legL = limb(-0.07, -0.02, 0.28, dark);
    var legR = limb(0.07, -0.02, 0.28, dark);
    var lidMesh = null;
    var crack1 = null;
    var crack2 = null;
    if (lid) {
      lidMesh = cyl(0.1, 0.1, 0.03, mat(0xd5dde3, { metalness: 0.7, roughness: 0.25 }), 0, 0.16, -0.12);
      lidMesh.rotation.x = -Math.PI / 2;
      hips.add(lidMesh);
      var crackMat = mat(0x2a2e32, { roughness: 0.4 });
      crack1 = box(0.09, 0.012, 0.012, crackMat, 0.02, 0.16, -0.14);
      crack2 = box(0.012, 0.08, 0.012, crackMat, -0.03, 0.16, -0.14);
      crack1.visible = false;
      crack2.visible = false;
      hips.add(crack1);
      hips.add(crack2);
    }
    return finishMarcher(g, function (time, info) {
      var phase = info.progress * 8;
      var swing = Math.sin(phase);
      legL.rotation.x = swing * 1.05;
      legR.rotation.x = -swing * 1.05;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      torso.rotation.x = -swing * 0.08;
      head.rotation.z = swing * 0.06;
      hips.position.y = 0.34 + Math.abs(Math.cos(phase)) * 0.045;
      if (lidMesh) {
        var shield = info.shield || 0;
        lidMesh.visible = shield < 3;
        crack1.visible = shield >= 1 && shield < 3;
        crack2.visible = shield >= 2 && shield < 3;
      }
    });
  }

  function buildSoldier() {
    return buildPerson(
      mat(0x6d8a4e, { roughness: 0.62 }),
      mat(0xd8c7a2, { roughness: 0.7 }),
      mat(0x2c3328, { roughness: 0.5 }),
      false
    );
  }

  function buildTin() {
    return buildPerson(
      mat(0x9aa3ab, { metalness: 0.72, roughness: 0.32 }),
      mat(0xb7c0c7, { metalness: 0.55, roughness: 0.35 }),
      mat(0x4c545c, { metalness: 0.4, roughness: 0.45 }),
      true
    );
  }

  function buildCar() {
    var g = new THREE.Group();
    var paint = mat(0xd24b3a, { roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.18, metalness: 0.08 });
    var glass = mat(0xc9e7f5, { roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.85 });
    var tire = mat(0x1c1c1c, { roughness: 0.85 });
    var body = new THREE.Group();
    g.add(body);
    body.add(box(0.36, 0.14, 0.52, paint, 0, 0.2, 0));
    body.add(box(0.3, 0.12, 0.26, paint, 0, 0.32, 0.04));
    body.add(box(0.26, 0.1, 0.02, glass, 0, 0.32, -0.1));
    var lampMat = mat(0xfff1c9, { emissive: 0xffe2a0, emissiveIntensity: 0.7, roughness: 0.3 });
    body.add(ball(0.035, lampMat, -0.1, 0.2, -0.26));
    body.add(ball(0.035, lampMat, 0.1, 0.2, -0.26));
    if (!wheelGeo) {
      wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.07, 14);
      wheelGeo.rotateZ(Math.PI / 2);
    }
    var wheels = [];
    var spots = [[-0.2, 0.16], [0.2, 0.16], [-0.2, -0.16], [0.2, -0.16]];
    var i;
    for (i = 0; i < spots.length; i++) {
      var w = new THREE.Mesh(wheelGeo, tire);
      w.position.set(spots[i][0], 0.09, spots[i][1]);
      w.castShadow = true;
      g.add(w);
      wheels.push(w);
    }
    return finishMarcher(g, function (time, info) {
      var spin = info.progress / 0.09;
      for (var n = 0; n < wheels.length; n++) wheels[n].rotation.x = spin;
      body.position.y = Math.abs(Math.sin(info.progress * 14)) * 0.028;
    });
  }

  function buildTeddy() {
    var g = new THREE.Group();
    var fur = mat(0xc4844a, { roughness: 0.82, sheen: 0.25, sheenColor: 0xf0d2b0 });
    var snout = mat(0xe6c7a2, { roughness: 0.75 });
    var dark = mat(0x3a2418, { roughness: 0.5 });
    var body = new THREE.Group();
    g.add(body);
    body.add(ball(0.2, fur, 0, 0.28, 0));
    body.add(ball(0.15, fur, 0, 0.52, 0));
    body.add(ball(0.07, fur, -0.12, 0.64, 0));
    body.add(ball(0.07, fur, 0.12, 0.64, 0));
    body.add(ball(0.07, snout, 0, 0.5, -0.12));
    body.add(ball(0.035, dark, 0, 0.49, -0.18));
    body.add(ball(0.025, dark, -0.05, 0.56, -0.13));
    body.add(ball(0.025, dark, 0.05, 0.56, -0.13));
    var legL = new THREE.Group();
    var legR = new THREE.Group();
    legL.position.set(-0.08, 0.16, 0);
    legR.position.set(0.08, 0.16, 0);
    legL.add(ball(0.07, fur, 0, -0.06, 0));
    legR.add(ball(0.07, fur, 0, -0.06, 0));
    var armL = new THREE.Group();
    var armR = new THREE.Group();
    armL.position.set(-0.18, 0.32, 0);
    armR.position.set(0.18, 0.32, 0);
    armL.add(ball(0.055, fur, 0, -0.07, 0));
    armR.add(ball(0.055, fur, 0, -0.07, 0));
    g.add(legL);
    g.add(legR);
    g.add(armL);
    g.add(armR);
    return finishMarcher(g, function (time, info) {
      var phase = info.progress * 7;
      var swing = Math.sin(phase);
      body.rotation.z = swing * 0.22;
      body.position.y = Math.abs(swing) * 0.05;
      legL.rotation.x = swing * 0.7;
      legR.rotation.x = -swing * 0.7;
      armL.rotation.x = -swing * 0.65;
      armR.rotation.x = swing * 0.65;
    });
  }

  function buildBlock() {
    var g = new THREE.Group();
    var wobble = new THREE.Group();
    var cube = box(0.4, 0.4, 0.4, mat(0xe0b03a, { roughness: 0.48, clearcoat: 0.25 }), 0, 0.28, 0);
    var face = box(0.16, 0.16, 0.02, mat(0xd24b3a, { roughness: 0.45 }), 0, 0.3, -0.21);
    wobble.add(cube);
    wobble.add(face);
    g.add(wobble);
    return finishMarcher(g, function (time, info) {
      var swing = Math.sin(info.progress * 5.5);
      wobble.rotation.z = swing * 0.28;
      wobble.position.y = Math.abs(swing) * 0.06;
    });
  }

  function buildBalloon() {
    var g = new THREE.Group();
    var skin = mat(0xe23b4a, { roughness: 0.28, clearcoat: 0.55, clearcoatRoughness: 0.12 });
    var balloon = ball(0.2, skin, 0, 0.95, 0);
    var knot = ball(0.04, skin, 0, 0.74, 0);
    var eye = ball(0.03, mat(0x2a1c1c, { roughness: 0.4 }), -0.06, 0.98, -0.16);
    var eye2 = ball(0.03, mat(0x2a1c1c, { roughness: 0.4 }), 0.06, 0.98, -0.16);
    var string = cyl(0.008, 0.008, 1, mat(0x6b533c, { roughness: 0.6 }), 0, 0.4, 0);
    string.castShadow = false;
    g.add(balloon);
    g.add(knot);
    g.add(eye);
    g.add(eye2);
    g.add(string);
    return finishMarcher(g, function (time) {
      balloon.position.set(Math.sin(time * 1.3) * 0.09, 0.95 + Math.sin(time * 2.1) * 0.07, Math.cos(time * 0.9) * 0.04);
      knot.position.set(balloon.position.x, balloon.position.y - 0.2, 0);
      eye.position.set(balloon.position.x - 0.06, balloon.position.y + 0.03, -0.16);
      eye2.position.set(balloon.position.x + 0.06, balloon.position.y + 0.03, -0.16);
      stretchBetween(string, 0, 0.05, 0, balloon.position.x, balloon.position.y - 0.18, balloon.position.z);
    });
  }

  function buildMarble() {
    var g = new THREE.Group();
    var glass = mat(0xd7ecff, { roughness: 0.06, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.06 });
    var swirl = mat(0xf08a62, { roughness: 0.2, clearcoat: 0.4 });
    var sphere = ball(0.2, glass, 0, 0.32, 0);
    var core = ball(0.08, swirl, 0.04, 0.34, 0.02);
    g.add(sphere);
    g.add(core);
    return finishTower(g, function (time) {
      var y = 0.32 + Math.sin(time * 2.4) * 0.07;
      sphere.position.y = y;
      core.position.y = y + 0.02;
      sphere.rotation.y = time * 0.8;
      core.rotation.y = -time * 1.3;
    });
  }

  function buildPillow() {
    var g = new THREE.Group();
    var cloth = mat(0xf4f0ea, { roughness: 0.85, sheen: 0.85, sheenColor: 0xfff8f0 });
    var puff = ball(0.24, cloth, 0, 0.22, 0);
    puff.scale.set(1.15, 0.62, 0.9);
    var seam = box(0.28, 0.012, 0.02, mat(0xd9cfc0, { roughness: 0.7 }), 0, 0.22, -0.16);
    g.add(puff);
    g.add(seam);
    return finishTower(g, function (time) {
      var s = Math.sin(time * 2.6);
      puff.scale.set(1.15 - s * 0.07, 0.62 + s * 0.1, 0.9);
      puff.position.y = 0.2 + s * 0.03;
    });
  }

  function buildFan() {
    var g = new THREE.Group();
    var cream = mat(0xf6f1e7, { roughness: 0.45, clearcoat: 0.2 });
    var metal = mat(0xc5ccd1, { metalness: 0.75, roughness: 0.28 });
    g.add(cyl(0.2, 0.22, 0.06, metal, 0, 0.1, 0));
    g.add(cyl(0.04, 0.05, 0.22, metal, 0, 0.24, 0));
    var head = new THREE.Group();
    head.position.set(0, 0.46, 0);
    g.add(head);
    head.add(cyl(0.08, 0.08, 0.12, metal, 0, 0, 0.06));
    var cage = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.015, 8, 28), cream);
    head.add(cage);
    var blades = new THREE.Group();
    head.add(blades);
    var i;
    for (i = 0; i < 3; i++) {
      var pivot = new THREE.Group();
      pivot.rotation.z = i * Math.PI * 2 / 3;
      pivot.add(box(0.07, 0.22, 0.012, cream, 0, 0.13, 0));
      blades.add(pivot);
    }
    var handle = box(0.06, 0.08, 0.16, mat(0x6a4128, { roughness: 0.6 }), 0, -0.02, 0.16);
    head.add(handle);
    return finishTower(g, function (time) {
      blades.rotation.z = time * 11;
    });
  }

  function buildBand() {
    var g = new THREE.Group();
    var peg = mat(0x6a4128, { roughness: 0.65 });
    var yellow = mat(0xf0c43a, { roughness: 0.35, clearcoat: 0.35 });
    g.add(cyl(0.045, 0.05, 0.32, peg, -0.16, 0.22, 0));
    g.add(cyl(0.045, 0.05, 0.32, peg, 0.16, 0.22, 0));
    var band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 8, 24), yellow);
    band.position.y = 0.28;
    g.add(band);
    return finishTower(g, function (time) {
      var w = Math.sin(time * 6);
      band.scale.set(1 + w * 0.16, 0.55 - w * 0.1, 1);
      band.rotation.z = Math.sin(time * 5) * 0.18;
    });
  }

  function buildBowl() {
    var g = new THREE.Group();
    var pts = [
      new THREE.Vector2(0.04, 0.02),
      new THREE.Vector2(0.16, 0.03),
      new THREE.Vector2(0.24, 0.1),
      new THREE.Vector2(0.26, 0.2),
      new THREE.Vector2(0.18, 0.24)
    ];
    var outer = new THREE.Mesh(
      new THREE.LatheGeometry(pts, 22),
      mat(0xe4d3b0, { roughness: 0.55 })
    );
    var inner = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 20),
      mat(0xe8a15a, { roughness: 0.4, side: THREE.DoubleSide })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.08;
    var bowl = new THREE.Group();
    bowl.add(outer);
    bowl.add(inner);
    bowl.rotation.x = 0.55;
    bowl.rotation.z = 0.28;
    bowl.position.y = 0.12;
    g.add(bowl);
    return finishTower(g, function (time) {
      bowl.rotation.x = 0.55 + Math.sin(time * 1.4) * 0.1;
      bowl.rotation.z = 0.28 + Math.sin(time * 1.1) * 0.06;
    });
  }

  function buildBlanket() {
    var g = new THREE.Group();
    var cloth = mat(0x6d8eae, { roughness: 0.9, sheen: 0.7, sheenColor: 0xd5e4f0 });
    var fold = mat(0x3e5870, { roughness: 0.85 });
    var blanket = new THREE.Group();
    blanket.add(box(0.62, 0.08, 0.46, cloth, 0, 0.12, 0));
    blanket.add(box(0.62, 0.05, 0.08, fold, 0, 0.16, 0.02));
    blanket.add(box(0.5, 0.02, 0.02, mat(0xe7eef4, { roughness: 0.5 }), 0, 0.175, 0.02));
    g.add(blanket);
    return finishTower(g, function (time) {
      blanket.rotation.x = Math.sin(time * 1.5) * 0.16;
      blanket.rotation.z = Math.sin(time * 0.9) * 0.05;
      blanket.position.y = Math.sin(time * 1.5) * 0.03;
    });
  }

  function buildCatch() {
    var g = new THREE.Group();
    var red = mat(0xc4473a, { roughness: 0.4, clearcoat: 0.3 });
    var wood = mat(0x7a5130, { roughness: 0.62 });
    var head = new THREE.Group();
    head.position.y = 0.46;
    var hoop = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 28), red);
    head.add(hoop);
    head.add(box(0.36, 0.012, 0.012, wood, 0, 0, 0));
    head.add(box(0.012, 0.36, 0.012, wood, 0, 0, 0));
    g.add(head);
    g.add(cyl(0.03, 0.038, 0.28, wood, 0, 0.2, 0));
    return finishTower(g, function (time) {
      head.rotation.z = Math.sin(time * 2.2) * 0.22;
      head.rotation.x = Math.sin(time * 1.3) * 0.12;
    });
  }

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
    var fn = BUILD[type] || buildMarble;
    var g;
    try {
      g = fn();
    } finally {
      ghosting = false;
    }
    g.userData.kind = type;
    var march = type === 'soldier' || type === 'car' || type === 'teddy' || type === 'block' || type === 'balloon' || type === 'tin';
    g.scale.setScalar(march ? 1.72 : 1.5);
    return g;
  }

  function stretchBetween(mesh, ax, ay, az, bx, by, bz) {
    var dx = bx - ax;
    var dy = by - ay;
    var dz = bz - az;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
    aimDir.set(dx / len, dy / len, dz / len);
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aimDir);
  }

  function addFurniture() {
    var wood = mat(0x6b4226, { roughness: 0.62 });
    var shelf = new THREE.Group();
    shelf.add(box(2.9, 0.08, 0.85, wood, 1.5, 0.04, 0.42));
    shelf.add(box(2.9, 1.9, 0.08, wood, 1.5, 1.1, 0.08));
    shelf.add(box(0.08, 1.9, 0.7, wood, 0.1, 1.1, 0.42));
    shelf.add(box(0.08, 1.9, 0.7, wood, 2.9, 1.1, 0.42));
    var colors = [0x8c3a3a, 0xd8c39a, 0x3d5a4c, 0xc4a15a, 0x2f3d55, 0xa34b2e, 0xe6e0d4, 0x6d7a45];
    var s;
    for (s = 0; s < 4; s++) {
      shelf.add(box(2.7, 0.05, 0.62, wood, 1.5, 0.38 + s * 0.46, 0.4));
      var b;
      for (b = 0; b < 6; b++) {
        var bh = 0.28 + ((s + b) % 3) * 0.05;
        shelf.add(box(0.12, bh, 0.28, mat(colors[(s * 3 + b) % colors.length], { roughness: 0.55 }), 0.4 + b * 0.38, 0.38 + s * 0.46 + bh / 2 + 0.03, 0.36));
      }
    }
    shelf.add(box(1.9, 0.85, 0.62, wood, 1.0, 0.46, 1.4));
    scene.add(shelf);

    var tv = new THREE.Group();
    var consoleMat = mat(0x3a312b, { roughness: 0.5 });
    tv.add(box(2.6, 0.35, 0.7, consoleMat, 7.5, 0.22, 0.42));
    tv.add(box(2.15, 1.15, 0.08, mat(0x161616, { roughness: 0.35, metalness: 0.4 }), 7.5, 1.05, 0.28));
    var screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.0),
      new THREE.MeshBasicMaterial({ map: screenTexture() })
    );
    screen.position.set(7.5, 1.05, 0.33);
    tv.add(screen);
    scene.add(tv);

    var sofa = mat(0x2f5c55, { roughness: 0.78, sheen: 0.35, sheenColor: 0xcfe0da });
    var cushion = mat(0x3e746b, { roughness: 0.8, sheen: 0.4, sheenColor: 0xd5ebe4 });
    var couch = new THREE.Group();
    couch.add(box(2.8, 0.32, 1.7, sofa, 14.5, 0.2, 8.95));
    couch.add(box(2.8, 0.7, 0.28, sofa, 14.5, 0.62, 9.7));
    couch.add(box(0.22, 0.5, 1.5, sofa, 13.2, 0.48, 8.9));
    couch.add(box(0.22, 0.5, 1.5, sofa, 15.8, 0.48, 8.9));
    couch.add(box(0.8, 0.16, 0.7, cushion, 13.7, 0.42, 8.85));
    couch.add(box(0.8, 0.16, 0.7, cushion, 14.5, 0.42, 8.85));
    couch.add(box(0.8, 0.16, 0.7, cushion, 15.3, 0.42, 8.85));
    var leg = mat(0x4a3424, { roughness: 0.6 });
    couch.add(cyl(0.04, 0.045, 0.12, leg, 13.3, 0.06, 8.3));
    couch.add(cyl(0.04, 0.045, 0.12, leg, 15.7, 0.06, 8.3));
    couch.add(cyl(0.04, 0.045, 0.12, leg, 13.3, 0.06, 9.55));
    couch.add(cyl(0.04, 0.045, 0.12, leg, 15.7, 0.06, 9.55));
    couch.add(box(0.42, 0.16, 0.42, mat(0xc4473a, { roughness: 0.7 }), 15.15, 0.52, 8.7));
    scene.add(couch);

    var frame = mat(0x6b4226, { roughness: 0.55 });
    var pic = new THREE.Group();
    pic.add(box(1.35, 0.95, 0.05, frame, 11.4, 1.85, 0.06));
    var art = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.75), new THREE.MeshBasicMaterial({ map: pictureTexture() }));
    art.position.set(11.4, 1.85, 0.1);
    pic.add(art);
    scene.add(pic);

    var pot = mat(0x8a4b32, { roughness: 0.6 });
    var leaf = mat(0x3f6b45, { roughness: 0.7 });
    var plant = new THREE.Group();
    plant.position.set(-0.75, 0, 10.15);
    plant.add(cyl(0.16, 0.12, 0.22, pot, 0, 0.11, 0));
    plant.add(ball(0.18, leaf, 0, 0.38, 0));
    plant.add(ball(0.12, leaf, 0.12, 0.5, 0.04));
    plant.add(ball(0.1, leaf, -0.1, 0.46, -0.02));
    scene.add(plant);

    var crate = mat(0x8a5a32, { roughness: 0.68 });
    var chest = new THREE.Group();
    chest.position.set(-0.85, 0, 7.4);
    chest.rotation.y = 0.5;
    chest.add(box(0.62, 0.32, 0.42, crate, 0, 0.2, 0));
    chest.add(box(0.64, 0.08, 0.44, mat(0xa8743e, { roughness: 0.55 }), 0, 0.38, 0));
    chest.add(box(0.08, 0.06, 0.06, mat(0xe6c34a, { metalness: 0.6, roughness: 0.3 }), 0, 0.28, -0.22));
    scene.add(chest);

    var lampMetal = mat(0xc5b8a4, { metalness: 0.7, roughness: 0.28 });
    var lamp = new THREE.Group();
    lamp.position.set(-0.7, 0, 3.15);
    lamp.add(cyl(0.16, 0.2, 0.05, lampMetal, 0, 0.03, 0));
    lamp.add(cyl(0.025, 0.025, 1.25, lampMetal, 0, 0.66, 0));
    var shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.26, 0.32, 18, 1, true),
      mat(0xfff3dd, {
        emissive: 0xffd7a4,
        emissiveIntensity: 0.55,
        roughness: 0.45,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92
      })
    );
    shade.position.y = 1.28;
    shade.castShadow = false;
    lamp.add(shade);
    scene.add(lamp);
    var lampLight = new THREE.PointLight(0xffc98a, 1.4, 7, 2);
    lampLight.position.set(-0.7, 1.2, 3.15);
    scene.add(lampLight);
  }

  function addRoom() {
    var woodMap = woodTexture();
    woodMap.wrapS = THREE.RepeatWrapping;
    woodMap.wrapT = THREE.RepeatWrapping;
    woodMap.repeat.set(3.2, 2.4);
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 18),
      mat(0xffffff, { map: woodMap, roughness: 0.78 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(8, 0, 4.6);
    floor.receiveShadow = true;
    floor.castShadow = false;
    scene.add(floor);

    var lip = new THREE.Mesh(
      new THREE.PlaneGeometry(16.4, 10.4),
      mat(0x4a301c, { roughness: 0.9 })
    );
    lip.rotation.x = -Math.PI / 2;
    lip.position.set(8, 0.008, 5);
    lip.receiveShadow = true;
    scene.add(lip);

    var board = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 10),
      mat(0xffffff, { map: boardTexture(), roughness: 0.86, sheen: 0.2, sheenColor: 0xf0d8c4 })
    );
    board.rotation.x = -Math.PI / 2;
    board.position.set(8, 0.016, 5);
    board.receiveShadow = true;
    scene.add(board);

    var wallMap = wallTexture();
    wallMap.wrapS = THREE.RepeatWrapping;
    wallMap.wrapT = THREE.RepeatWrapping;
    wallMap.repeat.set(3, 1.4);
    var wallMat = mat(0xffffff, { map: wallMap, roughness: 0.9 });
    scene.add(box(26.6, 3.4, 0.22, wallMat, 8, 1.7, -0.48));
    scene.add(box(0.22, 2.2, 1.1, wallMat, -1.15, 1.1, -0.05));
    scene.add(box(0.22, 2.2, 1.1, wallMat, 17.15, 1.1, -0.05));
    var trim = mat(0xf7f1e8, { roughness: 0.55 });
    scene.add(box(20, 0.14, 0.1, trim, 8, 0.08, -0.32));
    scene.add(box(20, 0.08, 0.14, trim, 8, 3.12, -0.36));

    var frame = mat(0x6b4226, { roughness: 0.5 });
    var win = new THREE.Group();
    win.add(box(2.7, 1.7, 0.1, frame, 0, 0, 0));
    var pane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 1.32),
      new THREE.MeshBasicMaterial({ map: skyTexture() })
    );
    pane.position.z = 0.06;
    win.add(pane);
    win.add(box(0.06, 1.32, 0.05, frame, 0, 0, 0.08));
    win.add(box(2.3, 0.06, 0.05, frame, 0, 0, 0.08));
    win.position.set(11.3, 1.95, -0.32);
    scene.add(win);
    var curtain = mat(0xc56d66, { roughness: 0.8, sheen: 0.45, sheenColor: 0xf0d0cc });
    scene.add(box(0.22, 1.9, 0.08, curtain, 9.8, 1.85, -0.22));
    scene.add(box(0.22, 1.9, 0.08, curtain, 12.8, 1.85, -0.22));
    var windowLight = new THREE.PointLight(0xfff1d4, 2.2, 16, 2);
    windowLight.position.set(11.3, 1.7, 0.4);
    scene.add(windowLight);

    var hole = new THREE.Mesh(
      new THREE.CircleGeometry(0.22, 20),
      mat(0x241812, { roughness: 1 })
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(14.5, 0.028, 6.5);
    scene.add(hole);

    var scuffMat = mat(0x3a2a20, { transparent: true, opacity: 0.55, roughness: 1 });
    scuffMat.depthWrite = false;
    var marks = [[0.16, 0.1], [-0.12, 0.16], [0.2, -0.1], [-0.18, -0.06], [0.02, -0.18], [-0.08, 0.22], [0.22, 0.16], [0, 0.02]];
    var i;
    for (i = 0; i < marks.length; i++) {
      var sc = new THREE.Mesh(new THREE.CircleGeometry(0.06, 10), scuffMat);
      sc.rotation.x = -Math.PI / 2;
      sc.position.set(14.5 + marks[i][0], 0.032, 6.5 + marks[i][1]);
      sc.visible = false;
      sc.renderOrder = 3;
      scene.add(sc);
      scuffs.push(sc);
    }
    addFurniture();
  }

  function addGuides() {
    var pts = [];
    var c;
    var r;
    for (r = 0; r < 10; r++) {
      for (c = 0; c < 16; c++) {
        if (RugSim.cellKind(c, r) !== 'wood') continue;
        var x = c;
        var z = r;
        pts.push(x, 0.04, z, x + 1, 0.04, z);
        pts.push(x + 1, 0.04, z, x + 1, 0.04, z + 1);
        pts.push(x + 1, 0.04, z + 1, x, 0.04, z + 1);
        pts.push(x, 0.04, z + 1, x, 0.04, z);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xf4ead8,
      transparent: true,
      opacity: 0.45
    }));
    grid.visible = false;
    scene.add(grid);

    ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      mat(0xe6c34a, { transparent: true, opacity: 0.55, roughness: 0.4, side: THREE.DoubleSide })
    );
    ring.material.depthWrite = false;
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 4;
    scene.add(ring);

    pad = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.9),
      mat(0xcfe3c0, { transparent: true, opacity: 0.38, roughness: 0.8 })
    );
    pad.material.depthWrite = false;
    pad.rotation.x = -Math.PI / 2;
    pad.visible = false;
    pad.renderOrder = 3;
    scene.add(pad);
  }

  function makeBeam() {
    var g = new THREE.Group();
    var core = cyl(0.025, 0.025, 1, mat(0xfff6e8, {
      emissive: 0xfff1cc,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 1,
      roughness: 0.3
    }), 0, 0, 0);
    var glow = cyl(0.07, 0.07, 1, mat(0xffe2a8, {
      emissive: 0xffc56a,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.35,
      roughness: 0.4
    }), 0, 0, 0);
    core.castShadow = false;
    glow.castShadow = false;
    g.add(glow);
    g.add(core);
    g.userData.core = core;
    g.userData.glow = glow;
    g.visible = false;
    scene.add(g);
    return g;
  }

  function makeSplash() {
    var m = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 1, 40),
      mat(0xfff1d6, { transparent: true, opacity: 0.8, emissive: 0xffd7a4, emissiveIntensity: 0.5, side: THREE.DoubleSide })
    );
    m.material.depthWrite = false;
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 4;
    scene.add(m);
    return m;
  }

  function makeRoll() {
    var ballM = ball(0.11, mat(0xe8a15a, { roughness: 0.42, transparent: true, opacity: 1 }), 0, 0.12, 0);
    ballM.visible = false;
    scene.add(ballM);
    return ballM;
  }

  function makePillow() {
    var m = ball(0.12, mat(0xf4f0ea, { roughness: 0.8, sheen: 0.6, sheenColor: 0xfff8f0 }), 0, 0.4, 0);
    m.scale.set(1.2, 0.7, 0.9);
    m.visible = false;
    scene.add(m);
    return m;
  }

  function fitCamera() {
    if (!camera || sizedW < 2 || sizedH < 2) return;
    var look = new THREE.Vector3(8, 0.12, 5.05);
    var back = new THREE.Vector3(0.12, 0.62, 1.22).normalize();
    camera.fov = 28;
    camera.aspect = sizedW / sizedH;
    camera.updateProjectionMatrix();
    var corners = [
      new THREE.Vector3(-0.15, 0, -0.05),
      new THREE.Vector3(16.15, 0, -0.05),
      new THREE.Vector3(-0.15, 0, 10.15),
      new THREE.Vector3(16.15, 0, 10.15),
      new THREE.Vector3(0.4, 1.25, 7.6),
      new THREE.Vector3(14.6, 1.35, 2.3),
      new THREE.Vector3(2.2, 2.15, 0.35)
    ];
    var padPx = 14;
    var left = safe.x + padPx;
    var right = safe.x + safe.w - padPx;
    var top = safe.y + padPx;
    var bottom = safe.y + safe.h - padPx;
    if (right - left < 40 || bottom - top < 40) return;
    var v = new THREE.Vector3();
    function fits(dist) {
      camera.position.copy(look).addScaledVector(back, dist);
      camera.lookAt(look);
      camera.updateMatrixWorld(true);
      var i;
      for (i = 0; i < corners.length; i++) {
        v.copy(corners[i]).project(camera);
        var px = (v.x * 0.5 + 0.5) * sizedW;
        var py = (-v.y * 0.5 + 0.5) * sizedH;
        if (px < left || px > right || py < top || py > bottom) return false;
      }
      return true;
    }
    var lo = 7;
    var hi = 52;
    var n;
    for (n = 0; n < 16; n++) {
      var mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    fits(hi);
  }

  function resizeIfNeeded() {
    var w = canvas.clientWidth | 0;
    var h = canvas.clientHeight | 0;
    if (w < 2 || h < 2) return;
    if (w === sizedW && h === sizedH) return;
    sizedW = w;
    sizedH = h;
    var pr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    fitCamera();
  }

  function take(type) {
    var pool = pools[type];
    if (!pool) pool = pools[type] = [];
    var i;
    for (i = 0; i < pool.length; i++) {
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
      o.material.opacity = opacity;
    });
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
    renderer.setClearColor(0xc4ad90, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc4ad90);
    camera = new THREE.PerspectiveCamera(30, 1, 0.08, 80);
    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();
    floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    planeHit = new THREE.Vector3();
    proj = new THREE.Vector3();
    aimDir = new THREE.Vector3();

    scene.add(new THREE.HemisphereLight(0xfff3e2, 0x6a4630, 0.32));
    var sun = new THREE.DirectionalLight(0xffe2b8, 3.6);
    sun.position.set(13.5, 9.2, -2.2);
    sun.target.position.set(7, 0, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);
    var fill = new THREE.DirectionalLight(0xd5e2ff, 0.42);
    fill.position.set(4, 6, 16);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffc9a0, 0.55);
    rim.position.set(-6, 5, 8);
    scene.add(rim);

    try {
      var pmrem = new THREE.PMREMGenerator(renderer);
      var envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0xfff2e2);
      var a = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      a.position.set(0, 1.2, -1);
      envScene.add(a);
      var b = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffc48a }));
      b.position.set(-0.8, 0.3, 0.6);
      envScene.add(b);
      scene.environment = pmrem.fromScene(envScene, 0.04).texture;
      pmrem.dispose();
    } catch (err) {}

    blobMat = new THREE.MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      depthWrite: false
    });
    addRoom();
    addGuides();
    var n;
    for (n = 0; n < 8; n++) beams.push(makeBeam());
    for (n = 0; n < 6; n++) splashes.push(makeSplash());
    for (n = 0; n < 3; n++) rolls.push(makeRoll());
    for (n = 0; n < 6; n++) pillows.push(makePillow());
    resizeIfNeeded();
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

  function faceOf(facing) {
    return YAW[facing] || YAW.e;
  }

  function frame(state, ui) {
    if (!renderer) return;
    ui = ui || {};
    resizeIfNeeded();
    var time = ui.time || 0;
    var now = ui.now || 0;
    hidePools();
    pickList.length = 0;

    var towers = state.towers || [];
    var i;
    for (i = 0; i < towers.length; i++) {
      var tw = towers[i];
      var m = take(tw.type);
      var lift = ui.selectedId === tw.id ? 0.06 : 0;
      m.position.set(tw.c + 0.5, lift, tw.r + 0.5);
      m.rotation.set(0, 0, 0);
      m.userData.c = tw.c;
      m.userData.r = tw.r;
      m.userData.pick = true;
      if (m.userData.tick) {
        m.userData.tick(time, { progress: 0, time: time, upgraded: !!tw.upgraded, shield: 0, slow: 1 });
      }
      pickList.push(m);
    }

    if (ui.ghost && BUILD[ui.ghost.type]) {
      var gh = ghostOf(ui.ghost.type);
      gh.visible = true;
      gh.position.set(ui.ghost.c + 0.5, 0, ui.ghost.r + 0.5);
      gh.rotation.set(0, 0, 0);
      setGhostOpacity(gh, ui.ghost.ok ? 0.72 : 0.32);
      if (gh.userData.tick) {
        gh.userData.tick(time, { progress: 0, time: time, upgraded: false, shield: 0, slow: 1 });
      }
    }

    var enemies = state.enemies || [];
    for (i = 0; i < enemies.length; i++) {
      var en = enemies[i];
      var pos = RugSim.posAlong(en.progress);
      var face = faceOf(pos.facing);
      var body = take(en.type);
      body.position.set(pos.x, 0, pos.y);
      body.rotation.set(0, yawToward(face[0], face[1]), 0);
      body.userData.pick = false;
      if (body.userData.tick) {
        body.userData.tick(time, {
          progress: en.progress,
          time: time,
          slow: en.slow == null ? 1 : en.slow,
          shield: en.shield || 0,
          upgraded: false
        });
      }
    }

    var shots = state.projectiles || [];
    for (i = 0; i < pillows.length; i++) pillows[i].visible = false;
    for (i = 0; i < shots.length && i < pillows.length; i++) {
      var shot = shots[i];
      var u = 0;
      if (shot.travel > 0) u = shot.age / shot.travel;
      if (u < 0) u = 0;
      if (u > 1) u = 1;
      var px = shot.x + (shot.tx - shot.x) * u;
      var pz = shot.y + (shot.ty - shot.y) * u;
      var py = 0.35 + Math.sin(u * Math.PI) * 0.8;
      pillows[i].visible = true;
      pillows[i].position.set(px, py, pz);
      pillows[i].rotation.z = u * 5;
    }

    for (i = 0; i < beams.length; i++) beams[i].visible = false;
    for (i = 0; i < splashes.length; i++) splashes[i].visible = false;
    for (i = 0; i < rolls.length; i++) rolls[i].visible = false;
    var bi = 0;
    var si = 0;
    var ri = 0;
    var fx = ui.fx || [];
    for (i = 0; i < fx.length; i++) {
      var f = fx[i];
      var alpha = 1 - (now - f.born) / (f.dur * 1000);
      if (alpha <= 0) continue;
      if (f.t === 'beam' && bi < beams.length) {
        var beam = beams[bi++];
        beam.visible = true;
        var wide = f.kind === 'band';
        beam.userData.core.material.opacity = alpha;
        beam.userData.core.material.color.set(wide ? 0xffd56a : 0xfffaf0);
        beam.userData.glow.material.opacity = alpha * 0.4;
        beam.userData.glow.scale.set(wide ? 1.8 : 1, 1, wide ? 1.8 : 1);
        stretchBetween(beam, f.x0, 0.5, f.y0, f.x1, 0.34, f.y1);
      } else if (f.t === 'splash' && si < splashes.length) {
        var sp = splashes[si++];
        sp.visible = true;
        var grow = (f.r || 1) * (0.35 + 0.75 * (1 - alpha));
        sp.position.set(f.x, 0.06, f.y);
        sp.scale.set(grow, grow, grow);
        sp.material.opacity = alpha * 0.75;
      } else if (f.t === 'roll' && ri < rolls.length) {
        var orb = rolls[ri++];
        var t = 1 - alpha;
        orb.visible = true;
        orb.position.set(f.x0 + (f.x1 - f.x0) * t, 0.14, f.y0 + (f.y1 - f.y0) * t);
        orb.material.opacity = Math.max(alpha, 0.35);
      }
    }

    var nScuff = state.scuffs || 0;
    if (nScuff > 8) nScuff = 8;
    for (i = 0; i < scuffs.length; i++) scuffs[i].visible = i < nScuff;

    grid.visible = !!ui.showGrid;
    if (ui.range && ui.range.radius) {
      ring.visible = true;
      ring.position.set(ui.range.c + 0.5, 0.06, ui.range.r + 0.5);
      ring.scale.set(ui.range.radius, ui.range.radius, ui.range.radius);
      ring.material.opacity = 0.42 + Math.sin(time * 3) * 0.08;
    } else {
      ring.visible = false;
    }
    if (ui.hover) {
      pad.visible = true;
      pad.position.set(ui.hover.c + 0.5, 0.045, ui.hover.r + 0.5);
      pad.material.color.set(ui.hover.ok ? 0xb7d7a8 : 0xe7b2a8);
      pad.material.opacity = ui.hover.mode === 'place' ? 0.5 : 0.22;
    } else {
      pad.visible = false;
    }

    renderer.render(scene, camera);
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

  globalThis.RugView = {
    mount: mount,
    setSafe: setSafe,
    frame: frame,
    pick: pick,
    project: project,
    yawToward: yawToward,
    cellOf: cellOf,
    selfTestFacing: selfTestFacing
  };
})();
