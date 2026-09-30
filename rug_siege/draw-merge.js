/* Bowl, Blanket, Catch, and Tin. Loaded after draw.js. */
(function () {
  var D = globalThis.RugDraw;
  if (!D) return;
  var prevTower = D.drawTower;
  var prevMarcher = D.drawMarcher;
  var prevIcon = D.paintIcon;

  function drawBowl(ctx) {
    ctx.fillStyle = '#e4d3b0';
    ctx.beginPath();
    ctx.ellipse(4, 14, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6e6c4';
    ctx.strokeStyle = '#8a6a3b';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 6);
    ctx.lineTo(14, -8);
    ctx.lineTo(20, 2);
    ctx.lineTo(-8, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8a15a';
    ctx.beginPath();
    ctx.moveTo(-10, 8);
    ctx.quadraticCurveTo(6, -2, 16, 2);
    ctx.lineTo(12, 8);
    ctx.quadraticCurveTo(4, 4, -6, 12);
    ctx.closePath();
    ctx.fill();
  }

  function drawBlanket(ctx) {
    ctx.fillStyle = '#7f9bb5';
    ctx.strokeStyle = '#3e5870';
    ctx.lineWidth = 3;
    ctx.fillRect(-16, -12, 32, 24);
    ctx.strokeRect(-16, -12, 32, 24);
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 6);
    ctx.stroke();
    ctx.strokeStyle = '#d5e2ee';
    ctx.beginPath();
    ctx.moveTo(-16, 8);
    ctx.lineTo(16, -4);
    ctx.stroke();
  }

  function drawCatch(ctx) {
    ctx.strokeStyle = '#c45c4a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -4, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#6e342c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-10, -12);
    ctx.lineTo(10, 4);
    ctx.moveTo(-10, 4);
    ctx.lineTo(10, -12);
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 10);
    ctx.moveTo(-14, -4);
    ctx.lineTo(14, -4);
    ctx.stroke();
    ctx.fillStyle = '#8a5a32';
    ctx.fillRect(-3, 10, 6, 10);
  }

  function drawTin(ctx, shield) {
    ctx.fillStyle = '#8a93a0';
    ctx.strokeStyle = '#3d4450';
    ctx.lineWidth = 2;
    ctx.fillRect(-10, 8, 6, 12);
    ctx.strokeRect(-10, 8, 6, 12);
    ctx.fillRect(4, 8, 6, 12);
    ctx.strokeRect(4, 8, 6, 12);
    ctx.fillRect(-12, -8, 24, 18);
    ctx.strokeRect(-12, -8, 24, 18);
    ctx.fillStyle = '#9aa3b0';
    ctx.fillRect(-7, -20, 14, 12);
    ctx.strokeRect(-7, -20, 14, 12);
    if ((shield || 0) >= 3) return;
    ctx.fillStyle = '#d7dde6';
    ctx.beginPath();
    ctx.arc(14, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, 0, 3, 0, Math.PI * 2);
    ctx.stroke();
    if (shield >= 1) {
      ctx.beginPath();
      ctx.moveTo(8, -4);
      ctx.lineTo(16, 4);
      ctx.stroke();
    }
    if (shield >= 2) {
      ctx.beginPath();
      ctx.moveTo(12, -6);
      ctx.lineTo(20, 2);
      ctx.stroke();
    }
  }

  function paintMerge(ctx, type, shield) {
    if (type === 'bowl') drawBowl(ctx);
    else if (type === 'blanket') drawBlanket(ctx);
    else if (type === 'catch') drawCatch(ctx);
    else drawTin(ctx, shield || 0);
  }

  D.drawTower = function (ctx, tower, opts) {
    var type = tower && tower.type;
    if (type !== 'bowl' && type !== 'blanket' && type !== 'catch') {
      prevTower(ctx, tower, opts);
      return;
    }
    ctx.save();
    tower = tower || {};
    opts = opts || {};
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    ctx.translate((tower.c + 0.5) * 56, (tower.r + 0.5) * 56);
    paintMerge(ctx, type, 0);
    ctx.restore();
  };

  D.drawMarcher = function (ctx, enemy, pos, opts) {
    var type = enemy && enemy.type;
    if (type !== 'tin') {
      prevMarcher(ctx, enemy, pos, opts);
      return;
    }
    pos = pos || {};
    opts = opts || {};
    ctx.save();
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    ctx.translate((pos.x || 0) * 56, (pos.y || 0) * 56);
    if (pos.facing === 'w') ctx.scale(-1, 1);
    paintMerge(ctx, 'tin', enemy.shield || 0);
    ctx.restore();
  };

  D.paintIcon = function (canvas, kind, type) {
    var ctx, w, h, m;
    if (type !== 'bowl' && type !== 'blanket' && type !== 'catch' && type !== 'tin') {
      prevIcon(canvas, kind, type);
      return;
    }
    ctx = canvas.getContext('2d');
    w = canvas.width;
    h = canvas.height;
    m = w < h ? w : h;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.scale(m / 64, m / 64);
    paintMerge(ctx, type, 0);
    ctx.restore();
  };

  D.mergeChipBox = function (c, r) {
    var y = r * 56 - 20;
    if (y < 2) y = r * 56 + 40;
    return { x: c * 56 + 10, y: y, w: 36, h: 18 };
  };

  D.drawMergeChip = function (ctx, c, r, type, cost, affordable) {
    var b = D.mergeChipBox(c, r);
    ctx.save();
    ctx.fillStyle = affordable ? '#f6e6c4' : 'rgba(246,230,196,0.45)';
    ctx.strokeStyle = '#8a6a3b';
    ctx.lineWidth = 1;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.save();
    ctx.translate(b.x + 11, b.y + 9);
    ctx.scale(0.2, 0.2);
    paintMerge(ctx, type, 0);
    ctx.restore();
    ctx.fillStyle = affordable ? '#1e1a14' : 'rgba(30,26,20,0.4)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(cost), b.x + b.w - 2, b.y + b.h / 2 + 1);
    ctx.restore();
  };
})();
