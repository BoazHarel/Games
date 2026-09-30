'use strict';

// Chunky flat sprites; tile coordinates are scaled by 56 into CSS pixels.
var TILE = 56;

// Sheet crops. Balloon tip and body height are fractions of balloon.png.
var SPRITE_SRC = {
  marble: 'sprites/marble.png',
  pillow: 'sprites/pillow.png',
  fan: 'sprites/fan.png',
  band: 'sprites/band.png',
  soldier: 'sprites/soldier.png',
  car: 'sprites/car.png',
  teddy: 'sprites/teddy.png',
  block: 'sprites/block.png',
  balloon: 'sprites/balloon.png'
};
var BALLOON_TIP = 245 / 260;
var BALLOON_BODY = (163 - 14) / 260;
var spriteImg = {};
var spriteHooks = [];

function spriteReady(type) {
  var img = spriteImg[type];
  return !!(img && img.complete && img.naturalWidth);
}

function noteSprites() {
  var i;
  for (i = 0; i < spriteHooks.length; i++) spriteHooks[i]();
}

function hookSprites(fn) {
  var names = Object.keys(SPRITE_SRC);
  var i;
  spriteHooks.push(fn);
  for (i = 0; i < names.length; i++) {
    if (spriteReady(names[i])) {
      fn();
      return;
    }
  }
}

function preloadSprites() {
  var names = Object.keys(SPRITE_SRC);
  var i;
  for (i = 0; i < names.length; i++) {
    (function (name) {
      var img = new Image();
      spriteImg[name] = img;
      img.onload = function () { noteSprites(); };
      img.src = SPRITE_SRC[name];
    })(names[i]);
  }
}

function drawFittedSprite(ctx, type, box) {
  var img = spriteImg[type];
  var s = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  var w = img.naturalWidth * s;
  var h = img.naturalHeight * s;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

function drawBalloonSprite(ctx, bodyPx) {
  var img = spriteImg.balloon;
  var s = bodyPx / (img.naturalHeight * BALLOON_BODY);
  var w = img.naturalWidth * s;
  var h = img.naturalHeight * s;
  ctx.drawImage(img, -w / 2, -h * BALLOON_TIP, w, h);
}

preloadSprites();

// Rendered room and toy frames. Missing files fall back to the flat sprites.
var ART_SRC = {
  wood: 'art/wood.png',
  rug: 'art/rug.png',
  wall: 'art/wall.png',
  bookshelf: 'art/bookshelf.png',
  tv: 'art/tv.png',
  couch: 'art/couch.png',
  marble: 'art/marble.png',
  pillow: 'art/pillow.png',
  fan: 'art/fan.png',
  fan_blades: 'art/fan_blades.png',
  fan_handle: 'art/fan_handle.png',
  band: 'art/band.png',
  soldier0: 'art/soldier0.png',
  soldier1: 'art/soldier1.png',
  car: 'art/car.png',
  teddy0: 'art/teddy0.png',
  teddy1: 'art/teddy1.png',
  block: 'art/block.png',
  balloon: 'art/balloon.png'
};
var artImg = {};
var BALLOON_ART_TIP = 0.994;
var BALLOON_ART_BODY = 0.575;

function artReady(name) {
  var img = artImg[name];
  return !!(img && img.complete && img.naturalWidth && !img.failed);
}

function preloadArt() {
  var names = Object.keys(ART_SRC);
  var i;
  for (i = 0; i < names.length; i++) {
    (function (name) {
      var img = new Image();
      artImg[name] = img;
      img.onload = function () { noteSprites(); };
      img.onerror = function () { img.failed = true; };
      img.src = ART_SRC[name];
    })(names[i]);
  }
}

preloadArt();

function animTime() {
  return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

function paintRepeat(ctx, name) {
  var img = artImg[name];
  if (!img._pat) img._pat = ctx.createPattern(img, 'repeat');
  ctx.fillStyle = img._pat;
}

function drawCentered(ctx, img, box) {
  var s = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  var w = img.naturalWidth * s;
  var h = img.naturalHeight * s;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
}

function drawGroundShadow(ctx, box) {
  ctx.save();
  ctx.fillStyle = 'rgba(50, 32, 16, 0.2)';
  ctx.beginPath();
  ctx.ellipse(0, box * 0.34, box * 0.28, box * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function applyMotion(ctx, type, t, framed) {
  var s;
  if (type === 'pillow') {
    s = Math.sin(t * 2.4);
    ctx.scale(1 + 0.045 * s, 1 - 0.07 * s);
  } else if (type === 'marble') {
    ctx.translate(0, -1.3 * Math.sin(t * 2.1));
  } else if (type === 'band') {
    ctx.rotate(0.08 * Math.sin(t * 3.4));
  } else if (type === 'balloon') {
    ctx.translate(1.4 * Math.sin(t * 1.5), -3.1 * Math.sin(t * 1.6));
    ctx.rotate(0.06 * Math.sin(t * 1.5));
  } else if (type === 'car') {
    ctx.translate(0, 0.9 * Math.sin(t * 16));
  } else if (type === 'block') {
    s = Math.sin(t * 4.2);
    ctx.translate(1.8 * s, 0);
    ctx.rotate(0.07 * s);
  } else if (type === 'teddy' && !framed) {
    s = Math.sin(t * 4.5);
    ctx.translate(1.2 * s, -0.8 * Math.abs(s));
    ctx.rotate(0.1 * s);
  } else if (type === 'soldier' && framed) {
    ctx.translate(0, -1.1 * Math.abs(Math.sin(t * 6 * Math.PI)));
  } else if (type === 'fan') {
    ctx.translate(0, -1.0 * Math.sin(t * 2.2));
  }
}

function drawMarbleGlint(ctx, t) {
  var g = 0.5 + 0.5 * Math.sin(t * 2.6);
  ctx.save();
  ctx.globalAlpha *= 0.2 + 0.5 * g;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-7, -9, 3.2, 1.5, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFanRig(ctx, box) {
  var blades = artImg.fan_blades;
  var handle = artImg.fan_handle;
  var bw = box * 0.96;
  var bh = bw * (blades.naturalHeight / blades.naturalWidth);
  var hw = bw * 0.35;
  var hh = hw * (handle.naturalHeight / handle.naturalWidth);
  var hubY = box * 0.04;
  ctx.save();
  ctx.translate(0, hubY);
  ctx.rotate(animTime() * 3.1);
  ctx.drawImage(blades, -bw / 2, -bh * 0.72, bw, bh);
  ctx.restore();
  ctx.drawImage(handle, -hw / 2, hubY - hh * 0.12, hw, hh);
}

function drawBalloonArt(ctx, bodyPx) {
  var img = artImg.balloon;
  var s = bodyPx / (img.naturalHeight * BALLOON_ART_BODY);
  var w = img.naturalWidth * s;
  var h = img.naturalHeight * s;
  ctx.drawImage(img, -w / 2, -h * BALLOON_ART_TIP, w, h);
}

function iconArt(type) {
  if (type === 'soldier' && artReady('soldier0')) return artImg.soldier0;
  if (type === 'teddy' && artReady('teddy0')) return artImg.teddy0;
  if (artReady(type)) return artImg[type];
  return null;
}

function drawRugEdge(ctx) {
  var r;
  var c;
  var x;
  var y;
  for (r = 0; r < 10; r++) {
    for (c = 0; c < 16; c++) {
      if (!isRug(c, r)) continue;
      x = c * TILE;
      y = r * TILE;
      ctx.fillStyle = '#6a3828';
      if (!isRug(c, r - 1)) ctx.fillRect(x, y, TILE, 4);
      if (!isRug(c, r + 1)) ctx.fillRect(x, y + TILE - 4, TILE, 4);
      if (!isRug(c - 1, r)) ctx.fillRect(x, y, 4, TILE);
      if (!isRug(c + 1, r)) ctx.fillRect(x + TILE - 4, y, 4, TILE);
    }
  }
}

function faceAngle(facing) {
  if (facing === 'n') return -Math.PI / 2;
  if (facing === 'w') return Math.PI;
  if (facing === 's') return Math.PI / 2;
  return 0;
}

function trailStep(facing) {
  if (facing === 'n') return { x: 0, y: 1 };
  if (facing === 's') return { x: 0, y: -1 };
  if (facing === 'w') return { x: 1, y: 0 };
  return { x: -1, y: 0 };
}

function marcherType(enemy) {
  if (enemy && typeof enemy === 'object') return enemy.type;
  return enemy;
}

function isRug(c, r) {
  if (c < 0 || r < 0 || c > 15 || r > 9) return false;
  if (r === 2) return c >= 2 && c <= 14;
  if (r === 3) return c === 2 || c === 14;
  if (r === 4) return (c >= 2 && c <= 9) || c === 14;
  if (r === 5 || r === 6) return c === 9 || c === 14;
  if (r === 7) return c >= 0 && c <= 9;
  return false;
}

function drawMarbleShape(ctx) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1c2128';
  ctx.fillStyle = '#2f3d4d';
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a2330';
  ctx.beginPath();
  ctx.ellipse(3, 0, 6.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3d4c5c';
  ctx.beginPath();
  ctx.arc(-12, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawPillowShape(ctx) {
  var bumps = [[-13, -9], [13, -9], [-13, 9], [13, 9]];
  var i;
  ctx.fillStyle = '#f3b7c6';
  ctx.strokeStyle = '#2a3038';
  ctx.lineWidth = 2;
  for (i = 0; i < bumps.length; i++) {
    ctx.beginPath();
    ctx.arc(bumps[i][0], bumps[i][1], 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawFanShape(ctx, spin, upgraded) {
  var len = upgraded ? 11 : 8.5;
  var wid = upgraded ? 5.6 : 4.2;
  var reach = upgraded ? 15 : 12;
  var i;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1e2a28';
  ctx.fillStyle = '#2d8f74';
  ctx.fillRect(-3, 6, 6, 12);
  ctx.strokeRect(-3, 6, 6, 12);
  ctx.save();
  ctx.rotate(spin || 0);
  ctx.fillStyle = '#3caf93';
  for (i = 0; i < 5; i++) {
    ctx.rotate((Math.PI * 2) / 5);
    ctx.beginPath();
    ctx.ellipse(0, -reach, wid, len, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#2d8f74';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBandShape(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-14, -16);
  ctx.lineTo(0, -1);
  ctx.lineTo(14, -16);
  ctx.moveTo(0, -1);
  ctx.lineTo(0, 17);
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.strokeStyle = '#f2c230';
  ctx.lineWidth = 7;
  ctx.stroke();
}

function drawSoldierShape(ctx) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#243024';
  ctx.fillStyle = '#6d8a52';
  ctx.fillRect(-18, -14, 36, 22);
  ctx.strokeRect(-18, -14, 36, 22);
  ctx.fillStyle = '#2e3828';
  ctx.fillRect(6, -12, 12, 12);
  ctx.strokeRect(6, -12, 12, 12);
  ctx.fillStyle = '#d7f0e4';
  ctx.beginPath();
  ctx.arc(9, -6, 2.3, 0, Math.PI * 2);
  ctx.arc(14.5, -6, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.fillRect(-14, 8, 10, 7);
  ctx.fillRect(2, 8, 10, 7);
  ctx.strokeRect(-14, 8, 10, 7);
  ctx.strokeRect(2, 8, 10, 7);
}

function drawCarShape(ctx) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2a1818';
  ctx.fillStyle = '#8d939a';
  ctx.beginPath();
  ctx.arc(-10, 8, 5, 0, Math.PI * 2);
  ctx.arc(11, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#4a5056';
  ctx.beginPath();
  ctx.arc(-10, 8, 2, 0, Math.PI * 2);
  ctx.arc(11, 8, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d23c38';
  ctx.fillRect(-18, -5, 36, 13);
  ctx.strokeRect(-18, -5, 36, 13);
  ctx.fillStyle = '#2c3440';
  ctx.fillRect(4, -12, 14, 10);
  ctx.strokeRect(4, -12, 14, 10);
}

function drawTeddyShape(ctx) {
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3a2418';
  ctx.fillStyle = '#8d5a3c';
  ctx.beginPath();
  ctx.arc(-11, -14, 6.5, 0, Math.PI * 2);
  ctx.arc(11, -14, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -2, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#d2a87c';
  ctx.beginPath();
  ctx.ellipse(0, 12, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f0d2b4';
  ctx.beginPath();
  ctx.ellipse(0, 2, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2a1810';
  ctx.beginPath();
  ctx.arc(0, 1, 1.8, 0, Math.PI * 2);
  ctx.arc(-5, -5, 1.5, 0, Math.PI * 2);
  ctx.arc(5, -5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2a1810';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-9, -10);
  ctx.lineTo(-3, -7);
  ctx.moveTo(9, -10);
  ctx.lineTo(3, -7);
  ctx.stroke();
}

function drawBlockShape(ctx) {
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#6a3818';
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(18, -12);
  ctx.lineTo(0, -2);
  ctx.lineTo(-18, -12);
  ctx.closePath();
  ctx.fillStyle = '#f0a04a';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-18, -12);
  ctx.lineTo(0, -2);
  ctx.lineTo(0, 16);
  ctx.lineTo(-18, 6);
  ctx.closePath();
  ctx.fillStyle = '#d4843a';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(18, -12);
  ctx.lineTo(0, -2);
  ctx.lineTo(0, 16);
  ctx.lineTo(18, 6);
  ctx.closePath();
  ctx.fillStyle = '#c46e28';
  ctx.fill();
  ctx.stroke();
}

function drawBalloonShape(ctx) {
  ctx.strokeStyle = '#2a3038';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -12);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(-3.5, -16);
  ctx.lineTo(3.5, -16);
  ctx.closePath();
  ctx.fillStyle = '#6eb6d6';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -30, 12, 15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#8ecff0';
  ctx.fill();
  ctx.stroke();
}

function paintShape(ctx, kind, type, spin, upgraded) {
  if (kind === 'tower') {
    if (type === 'marble') drawMarbleShape(ctx);
    else if (type === 'pillow') drawPillowShape(ctx);
    else if (type === 'fan') drawFanShape(ctx, spin, upgraded);
    else if (type === 'band') drawBandShape(ctx);
    return;
  }
  if (type === 'soldier') drawSoldierShape(ctx);
  else if (type === 'car') drawCarShape(ctx);
  else if (type === 'teddy') drawTeddyShape(ctx);
  else if (type === 'block') drawBlockShape(ctx);
  else if (type === 'balloon') drawBalloonShape(ctx);
}

function drawBookshelf(ctx) {
  var img;
  var bw;
  var bh;
  var s;
  var dw;
  var dh;
  var cells = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]];
  if (artReady('bookshelf')) {
    img = artImg.bookshelf;
    bw = 3 * TILE;
    bh = 2 * TILE;
    s = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
    dw = img.naturalWidth * s;
    dh = img.naturalHeight * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, bw, TILE);
    ctx.rect(0, TILE, 2 * TILE, TILE);
    ctx.clip();
    ctx.drawImage(img, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
    ctx.restore();
    ctx.fillStyle = '#6b4a30';
    ctx.fillRect(2 * TILE - 4, TILE, 4, TILE);
    ctx.fillRect(2 * TILE, TILE - 4, TILE, 4);
    return;
  }
  var colors = ['#9a3e3e', '#3e5f8e', '#d2b15a', '#3f7a4e', '#7a4e86', '#c46a3a'];
  var i;
  var b;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#2a1c14';
  for (i = 0; i < cells.length; i++) {
    var x = cells[i][0] * TILE;
    var y = cells[i][1] * TILE;
    var bx = x + 8;
    ctx.fillStyle = '#6b4b34';
    ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = '#3f2c20';
    ctx.fillRect(x + 6, y + 22, TILE - 12, 3);
    ctx.fillRect(x + 6, y + 40, TILE - 12, 3);
    for (b = 0; b < 5; b++) {
      ctx.fillStyle = colors[(i + b) % colors.length];
      ctx.fillRect(bx, y + 8, 7, 14);
      ctx.fillStyle = colors[(i + b + 3) % colors.length];
      ctx.fillRect(bx, y + 26, 7, 14);
      bx += 8;
    }
  }
}

function drawTV(ctx) {
  var x = 6 * TILE;
  var w;
  var h;
  var img;
  var s;
  var dw;
  var dh;
  if (artReady('tv')) {
    w = 3 * TILE;
    h = TILE;
    ctx.fillStyle = '#4e3426';
    ctx.fillRect(x + 10, h - 13, w - 20, 9);
    ctx.fillStyle = '#2c1e16';
    ctx.fillRect(x + 22, h - 15, w - 44, 4);
    img = artImg.tv;
    s = Math.min((w - 12) / img.naturalWidth, (h - 14) / img.naturalHeight);
    dw = img.naturalWidth * s;
    dh = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - dw) / 2, h - 14 - dh, dw, dh);
    return;
  }
  var w = TILE * 3;
  var h = TILE;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1c2128';
  ctx.fillStyle = '#3a3632';
  ctx.fillRect(x + 18, h - 12, w - 36, 8);
  ctx.strokeRect(x + 18, h - 12, w - 36, 8);
  ctx.fillStyle = '#2c3138';
  ctx.fillRect(x + 8, 4, w - 16, h - 16);
  ctx.strokeRect(x + 8, 4, w - 16, h - 16);
  ctx.fillStyle = '#243240';
  ctx.fillRect(x + 16, 10, w - 32, h - 30);
}

function drawCouch(ctx) {
  var x = 13 * TILE;
  var y;
  var w;
  var h;
  var img;
  var s;
  var dw;
  var dh;
  if (artReady('couch')) {
    y = 8 * TILE;
    w = 3 * TILE;
    h = 2 * TILE;
    img = artImg.couch;
    s = Math.min((w - 4) / img.naturalWidth, (h - 4) / img.naturalHeight);
    dw = img.naturalWidth * s;
    dh = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + h - dh - 2, dw, dh);
    return;
  }
  var y = 8 * TILE;
  var w = TILE * 3;
  var h = TILE * 2;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3a2a20';
  ctx.fillStyle = '#6b5344';
  ctx.fillRect(x + 6, y + 8, w - 12, h - 16);
  ctx.strokeRect(x + 6, y + 8, w - 12, h - 16);
  ctx.fillRect(x + 14, y + 8, w - 28, 28);
  ctx.strokeRect(x + 14, y + 8, w - 28, 28);
  ctx.fillRect(x + 6, y + 24, 16, h - 40);
  ctx.fillRect(x + w - 22, y + 24, 16, h - 40);
  ctx.beginPath();
  ctx.moveTo(x + w / 3, y + 40);
  ctx.lineTo(x + w / 3, y + h - 18);
  ctx.moveTo(x + (2 * w) / 3, y + 40);
  ctx.lineTo(x + (2 * w) / 3, y + h - 18);
  ctx.stroke();
}

function drawRoom(ctx) {
  var r;
  var c;
  if (!artReady('wood')) {
    drawRoomFlat(ctx);
    return;
  }
  ctx.save();
  paintRepeat(ctx, 'wood');
  ctx.fillRect(0, 0, 896, 560);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 896, 26);
  ctx.clip();
  if (artReady('wall')) {
    paintRepeat(ctx, 'wall');
    ctx.fillRect(0, 0, 896, 26);
  } else {
    ctx.fillStyle = '#d7d0c4';
    ctx.fillRect(0, 0, 896, 26);
  }
  ctx.restore();
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 20, 896, 8);
  ctx.fillStyle = '#b7a48e';
  ctx.fillRect(0, 27, 896, 2);
  ctx.fillStyle = 'rgba(90, 60, 30, 0.1)';
  ctx.fillRect(0, 29, 896, 5);
  ctx.save();
  ctx.beginPath();
  for (r = 0; r < 10; r++) {
    for (c = 0; c < 16; c++) {
      if (isRug(c, r)) ctx.rect(c * TILE, r * TILE, TILE, TILE);
    }
  }
  ctx.clip();
  if (artReady('rug')) {
    paintRepeat(ctx, 'rug');
    ctx.fillRect(0, 0, 896, 560);
  } else {
    ctx.fillStyle = '#c4a574';
    ctx.fillRect(0, 0, 896, 560);
  }
  ctx.restore();
  drawRugEdge(ctx);
  drawBookshelf(ctx);
  drawTV(ctx);
  drawCouch(ctx);
  ctx.restore();
}

function drawRoomFlat(ctx) {
  var seams = [84, 196, 308, 420, 532];
  var joints = [[140, 0, 84], [420, 84, 196], [700, 196, 308], [250, 308, 420], [560, 420, 532]];
  var r;
  var c;
  var i;
  ctx.save();
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(0, 0, 896, 560);
  ctx.strokeStyle = '#ddd0b8';
  ctx.lineWidth = 1;
  for (i = 0; i < seams.length; i++) {
    ctx.beginPath();
    ctx.moveTo(0, seams[i]);
    ctx.lineTo(896, seams[i]);
    ctx.stroke();
  }
  for (i = 0; i < joints.length; i++) {
    ctx.beginPath();
    ctx.moveTo(joints[i][0], joints[i][1]);
    ctx.lineTo(joints[i][0], joints[i][2]);
    ctx.stroke();
  }
  ctx.fillStyle = '#c4a574';
  for (r = 0; r < 10; r++) {
    for (c = 0; c < 16; c++) {
      if (isRug(c, r)) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }
  ctx.fillStyle = '#a08050';
  for (r = 0; r < 10; r++) {
    for (c = 0; c < 16; c++) {
      var x;
      var y;
      if (!isRug(c, r)) continue;
      x = c * TILE;
      y = r * TILE;
      if (!isRug(c, r - 1)) ctx.fillRect(x, y, TILE, 1);
      if (!isRug(c, r + 1)) ctx.fillRect(x, y + TILE - 1, TILE, 1);
      if (!isRug(c - 1, r)) ctx.fillRect(x, y, 1, TILE);
      if (!isRug(c + 1, r)) ctx.fillRect(x + TILE - 1, y, 1, TILE);
    }
  }
  drawBookshelf(ctx);
  drawTV(ctx);
  drawCouch(ctx);
  ctx.restore();
}

function drawScuffs(ctx, count) {
  var marks = [
    [-7, -2, 0.4, 6],
    [6, 3, 1.3, 5],
    [-3, 7, 2.2, 7],
    [8, -6, 0.8, 4],
    [-9, 2, 1.8, 6],
    [2, -8, 2.6, 5],
    [4, 5, 0.2, 7],
    [-5, -7, 1.5, 4]
  ];
  var n = count | 0;
  var cx = 14.5 * TILE;
  var cy = 6.5 * TILE;
  var i;
  ctx.save();
  if (n > 8) n = 8;
  if (n > 0) {
    ctx.strokeStyle = 'rgba(110, 80, 50, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(cx + marks[i][0], cy + marks[i][1], marks[i][3], marks[i][2], marks[i][2] + 1.15);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawTower(ctx, tower, opts) {
  var box = TILE - 8;
  var t;
  ctx.save();
  tower = tower || {};
  opts = opts || {};
  ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
  ctx.translate((tower.c + 0.5) * TILE, (tower.r + 0.5) * TILE);
  if (tower.type === 'fan' && artReady('fan_blades') && artReady('fan_handle')) {
    drawGroundShadow(ctx, box);
    drawFanRig(ctx, box);
  } else if (artReady(tower.type)) {
    t = animTime();
    drawGroundShadow(ctx, box);
    ctx.save();
    applyMotion(ctx, tower.type, t, false);
    drawCentered(ctx, artImg[tower.type], box);
    if (tower.type === 'marble') drawMarbleGlint(ctx, t);
    ctx.restore();
  } else if (spriteReady(tower.type)) {
    drawFittedSprite(ctx, tower.type, box);
  } else {
    paintShape(ctx, 'tower', tower.type, opts.spin || 0, !!tower.upgraded);
  }
  ctx.restore();
}

function drawMarcher(ctx, enemy, pos, opts) {
  var type;
  var facing;
  var x;
  var y;
  var step;
  var alpha;
  ctx.save();
  pos = pos || {};
  opts = opts || {};
  type = marcherType(enemy);
  facing = pos.facing || 'e';
  x = pos.x * TILE;
  y = pos.y * TILE;
  alpha = opts.alpha == null ? 1 : opts.alpha;
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (opts.slowed) {
    step = trailStep(facing);
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = '#6e98a8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(step.x * 18, step.y * 18);
    ctx.lineTo(step.x * 30, step.y * 30);
    ctx.stroke();
    ctx.globalAlpha = alpha;
  }
  var box = TILE - 8;
  var t = animTime();
  var frames = null;
  var frameName;
  var single = type;
  if (type === 'soldier' && artReady('soldier0') && artReady('soldier1')) frames = ['soldier0', 'soldier1', 6];
  else if (type === 'teddy' && artReady('teddy0') && artReady('teddy1')) frames = ['teddy0', 'teddy1', 4.5];
  if (!frames && (type === 'soldier' || type === 'teddy') && artReady(type + '0')) single = type + '0';
  if (frames || artReady(single)) {
    if ((type === 'soldier' || type === 'car') && facing === 'w') ctx.scale(-1, 1);
    if (type !== 'balloon') drawGroundShadow(ctx, box);
    ctx.save();
    applyMotion(ctx, type, t, !!frames);
    if (frames) {
      frameName = frames[Math.floor(t * frames[2]) % 2];
      drawCentered(ctx, artImg[frameName], box);
    } else if (type === 'balloon' && artReady('balloon')) {
      drawBalloonArt(ctx, TILE - 10);
    } else if (artReady(single)) {
      drawCentered(ctx, artImg[single], box);
    } else if (spriteReady(type)) {
      if (type === 'balloon') drawBalloonSprite(ctx, TILE - 10);
      else drawFittedSprite(ctx, type, box);
    } else {
      if (type === 'soldier' || type === 'car') ctx.rotate(faceAngle(facing));
      paintShape(ctx, 'marcher', type, 0, false);
    }
    ctx.restore();
  } else if (spriteReady(type)) {
    if ((type === 'soldier' || type === 'car') && facing === 'w') ctx.scale(-1, 1);
    if (type === 'balloon') drawBalloonSprite(ctx, TILE - 10);
    else drawFittedSprite(ctx, type, box);
  } else {
    if (type === 'soldier' || type === 'car') ctx.rotate(faceAngle(facing));
    paintShape(ctx, 'marcher', type, 0, false);
  }
  ctx.restore();
}

function drawBeam(ctx, kind, x0, y0, x1, y1, alpha) {
  var ax = x0 * TILE;
  var ay = y0 * TILE;
  var bx = x1 * TILE;
  var by = y1 * TILE;
  var dx = bx - ax;
  var dy = by - ay;
  var len = Math.sqrt(dx * dx + dy * dy);
  var steps;
  var i;
  var t;
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  if (kind === 'band') {
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  } else if (kind === 'marble') {
    steps = Math.max(1, Math.round(len / 12));
    ctx.fillStyle = '#2f3d4d';
    ctx.strokeStyle = '#1c2128';
    ctx.lineWidth = 1;
    for (i = 0; i <= steps; i++) {
      t = i / steps;
      ctx.beginPath();
      ctx.arc(ax + dx * t, ay + dy * t, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPillow(ctx, x, y, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.translate(x * TILE, y * TILE);
  ctx.fillStyle = '#f3b7c6';
  ctx.strokeStyle = '#2a3038';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 8, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawSplash(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.beginPath();
  ctx.arc(x * TILE, y * TILE, r * TILE, 0, Math.PI * 2);
  ctx.strokeStyle = '#f3b7c6';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function drawPop(ctx, x, y, text, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.fillStyle = '#f0e8d8';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x * TILE, y * TILE);
  ctx.restore();
}

function drawRing(ctx, c, r, rangeTiles) {
  ctx.save();
  ctx.beginPath();
  ctx.arc((c + 0.5) * TILE, (r + 0.5) * TILE, rangeTiles * TILE, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(30,26,20,0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function chipBox(c, r) {
  var w = 36;
  var h = 18;
  var y = r * TILE + (TILE - h) / 2;
  var x = c === 15 ? c * TILE - 4 - w : (c + 1) * TILE + 4;
  return { x: x, y: y, w: w, h: h };
}

function drawChip(ctx, c, r, cost, affordable) {
  var b = chipBox(c, r);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(b.x + 4, b.y);
  ctx.lineTo(b.x + b.w - 4, b.y);
  ctx.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + 4, 4);
  ctx.lineTo(b.x + b.w, b.y + b.h - 4);
  ctx.arcTo(b.x + b.w, b.y + b.h, b.x + b.w - 4, b.y + b.h, 4);
  ctx.lineTo(b.x + 4, b.y + b.h);
  ctx.arcTo(b.x, b.y + b.h, b.x, b.y + b.h - 4, 4);
  ctx.lineTo(b.x, b.y + 4);
  ctx.arcTo(b.x, b.y, b.x + 4, b.y, 4);
  ctx.closePath();
  ctx.fillStyle = '#f0c84a';
  ctx.fill();
  ctx.strokeStyle = '#2a2418';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = affordable ? '#3a3018' : 'rgba(58,48,24,0.35)';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(cost), b.x + b.w / 2, b.y + b.h / 2 + 1);
  ctx.restore();
}

function paintIcon(canvas, kind, type) {
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  var m = w < h ? w : h;
  var margin;
  var box;
  var img;
  var s;
  var dw;
  var dh;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  img = iconArt(type);
  if (!img && spriteReady(type)) img = spriteImg[type];
  if (img) {
    margin = Math.max(2, Math.round(m * 0.07));
    box = m - margin * 2;
    s = Math.min(box / img.naturalWidth, box / img.naturalHeight);
    dw = img.naturalWidth * s;
    dh = img.naturalHeight * s;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    ctx.translate(w / 2, h / 2);
    ctx.scale(m / 48, m / 48);
    if (kind === 'marcher' && type === 'balloon') ctx.translate(0, 22);
    paintShape(ctx, kind, type, 0, false);
  }
  ctx.restore();
}

globalThis.RugDraw = {
  drawRoom: drawRoom,
  drawScuffs: drawScuffs,
  drawTower: drawTower,
  drawMarcher: drawMarcher,
  drawBeam: drawBeam,
  drawPillow: drawPillow,
  drawSplash: drawSplash,
  drawPop: drawPop,
  drawRing: drawRing,
  drawChip: drawChip,
  chipBox: chipBox,
  paintIcon: paintIcon,
  hookSprites: hookSprites
};


