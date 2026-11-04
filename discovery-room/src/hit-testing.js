import {
  pointInPolygon,
  polygonArea,
  polygonBBox,
  polygonSignedArea,
  projectPolygon
} from './validator.js';
import { getMinTapCssPx } from './viewport.js';
import { GAL_HIT_EXPANSION_FACTOR } from './gal-mode.js';

const TIE_EPSILON = 1e-4;

/**
 * Computes the area-weighted centroid [cx, cy] of a 2D polygon.
 * Falls back to vertex average if area is near zero.
 */
export function polygonCentroid(pts) {
  if (!Array.isArray(pts) || pts.length === 0) {
    return [0, 0];
  }
  const signedArea = polygonSignedArea(pts);
  if (Math.abs(signedArea) <= 1e-7) {
    let sx = 0;
    let sy = 0;
    for (const [x, y] of pts) {
      sx += x;
      sy += y;
    }
    return [sx / pts.length, sy / pts.length];
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  const factor = 1 / (6 * signedArea);
  return [cx * factor, cy * factor];
}

/**
 * Euclidean distance from point P to segment AB.
 */
export function pointToSegmentDistance(pt, a, b) {
  const [px, py] = pt;
  const [ax, ay] = a;
  const [bx, by] = b;
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-12) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const projX = ax + t * abx;
  const projY = ay + t * aby;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Minimum Euclidean distance from point P to any boundary edge of a polygon.
 */
export function pointToPolygonEdgeDistance(pt, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return Infinity;
  }
  let minDist = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const dist = pointToSegmentDistance(pt, a, b);
    if (dist < minDist) {
      minDist = dist;
    }
  }
  return minDist;
}

/**
 * Scales a polygon radially outward from its centroid by `(scaleX, scaleY)`.
 */
export function scalePolygonFromCentroid(polygon, scaleX, scaleY = scaleX) {
  if (scaleX === 1 && scaleY === 1) {
    return polygon.map(([x, y]) => [x, y]);
  }
  const [cx, cy] = polygonCentroid(polygon);
  return polygon.map(([x, y]) => [cx + (x - cx) * scaleX, cy + (y - cy) * scaleY]);
}

/**
 * Computes the effective enlarged hitPolygon in canonical stage pixel coordinates (1600x900),
 * enforcing both the physical minimum tap target size (~2 cm / 140 device px via devicePixelRatio,
 * floor 64 CSS px) and Gal mode expansion (1.2x).
 */
export function getEffectiveHitStagePolygon(tappable, options = {}) {
  const canvasWidth = options.canvasWidth || 1600;
  const canvasHeight = options.canvasHeight || 900;
  const fittedWidth = options.fittedStageWidth || 1340;
  const fittedHeight = options.fittedStageHeight || 753.75;
  const dpr = options.devicePixelRatio || 1;
  const galMode = Boolean(options.galMode);
  const config = options.config || {};

  const baseStagePoly = projectPolygon(tappable.hitPolygon, canvasWidth, canvasHeight);
  const bboxStage = polygonBBox(baseStagePoly);

  // Convert minimum physical CSS px floor into canonical 1600x900 stage pixels
  const baseMinCssPx = getMinTapCssPx(config, dpr);
  const targetMinCssPx = baseMinCssPx * (galMode ? GAL_HIT_EXPANSION_FACTOR : 1.0);

  const stagePerCssX = fittedWidth > 0 ? canvasWidth / fittedWidth : 1;
  const stagePerCssY = fittedHeight > 0 ? canvasHeight / fittedHeight : 1;
  const requiredStageWidth = targetMinCssPx * stagePerCssX;
  const requiredStageHeight = targetMinCssPx * stagePerCssY;

  const baseFactor = galMode ? GAL_HIT_EXPANSION_FACTOR : 1.0;
  const scaleX = Math.max(
    baseFactor,
    bboxStage.width > 1e-6 ? requiredStageWidth / bboxStage.width : baseFactor
  );
  const scaleY = Math.max(
    baseFactor,
    bboxStage.height > 1e-6 ? requiredStageHeight / bboxStage.height : baseFactor
  );

  return scalePolygonFromCentroid(baseStagePoly, scaleX, scaleY);
}

/**
 * Converts a client pointer position `(clientX, clientY)` and stage bounding rect
 * into percentage coordinates `[xPct, yPct]` in `0..100`.
 */
export function clientPointToStagePct(clientX, clientY, stageRect) {
  if (!stageRect || stageRect.width <= 0 || stageRect.height <= 0) {
    return null;
  }
  const xPct = ((clientX - stageRect.left) / stageRect.width) * 100;
  const yPct = ((clientY - stageRect.top) / stageRect.height) * 100;
  if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) {
    return null;
  }
  return [xPct, yPct];
}

/**
 * Evaluates a tap at `pointPct` (`[xPct, yPct]` in `0..100` stage coordinates)
 * against a stop's tappables using the Two-Stage Overlap Rule (ADR 0003):
 *
 * 1. First check un-enlarged drawn `outlinePolygon`s on all active tappables (`!sceneryOnlyInV1`).
 *    An exact outline hit wins immediately (ties go to the smaller `outlinePolygon` area).
 * 2. If no drawn `outlinePolygon` is hit, check enlarged `hitPolygon`s (including the physical
 *    ~2 cm / 140 dev-px minimum floor and Gal mode expansion). If multiple enlarged areas contain
 *    the tap point, the candidate whose drawn `outlinePolygon` edge/centroid is nearest the tap
 *    wins; ties go to the smaller object (by `outlinePolygon` area).
 *
 * @param {[number, number]} pointPct - Tap coordinates `[xPct, yPct]` in `0..100`
 * @param {Array<object>} tappables - Array of tappable definitions from `world.json`
 * @param {object} [options] - Viewport & config options
 * @returns {{ tappable: object, matchStage: 'outline' | 'hit' } | null}
 */
export function resolveTapHit(pointPct, tappables, options = {}) {
  if (!Array.isArray(pointPct) || pointPct.length !== 2 || !Array.isArray(tappables)) {
    return null;
  }

  const canvasWidth = options.canvasWidth || 1600;
  const canvasHeight = options.canvasHeight || 900;
  const tapStagePt = [(pointPct[0] / 100) * canvasWidth, (pointPct[1] / 100) * canvasHeight];

  const activeTappables = tappables.filter(
    (t) =>
      t &&
      !t.sceneryOnlyInV1 &&
      Array.isArray(t.outlinePolygon) &&
      t.outlinePolygon.length >= 3 &&
      Array.isArray(t.hitPolygon) &&
      t.hitPolygon.length >= 3
  );

  if (activeTappables.length === 0) {
    return null;
  }

  const prepared = activeTappables.map((tappable) => {
    const outlineStage = projectPolygon(tappable.outlinePolygon, canvasWidth, canvasHeight);
    const outlineArea = polygonArea(outlineStage);
    const centroid = polygonCentroid(outlineStage);
    return {
      tappable,
      outlineStage,
      outlineArea,
      centroid
    };
  });

  // Stage 1: Check un-enlarged drawn outlinePolygons first
  const exactOutlineHits = prepared.filter((item) =>
    pointInPolygon(tapStagePt, item.outlineStage)
  );

  if (exactOutlineHits.length > 0) {
    exactOutlineHits.sort((a, b) => a.outlineArea - b.outlineArea);
    return {
      tappable: exactOutlineHits[0].tappable,
      matchStage: 'outline'
    };
  }

  // Stage 2: Check enlarged hitPolygons (with physical ~2cm / 140 dev-px floor & Gal mode expansion)
  const enlargedHits = [];
  for (const item of prepared) {
    const effectiveHitStage = getEffectiveHitStagePolygon(item.tappable, options);
    if (pointInPolygon(tapStagePt, effectiveHitStage)) {
      const edgeDistance = pointToPolygonEdgeDistance(tapStagePt, item.outlineStage);
      const centroidDistance = Math.hypot(
        tapStagePt[0] - item.centroid[0],
        tapStagePt[1] - item.centroid[1]
      );
      enlargedHits.push({
        ...item,
        edgeDistance,
        centroidDistance
      });
    }
  }

  if (enlargedHits.length === 0) {
    return null;
  }

  if (enlargedHits.length === 1) {
    return {
      tappable: enlargedHits[0].tappable,
      matchStage: 'hit'
    };
  }

  enlargedHits.sort((a, b) => {
    const edgeDiff = a.edgeDistance - b.edgeDistance;
    const centroidDiff = a.centroidDistance - b.centroidDistance;

    // If equidistant by either outline edge distance or outline centroid distance,
    // break tie in favor of the smaller object (by outlinePolygon area).
    if (Math.abs(edgeDiff) <= TIE_EPSILON || Math.abs(centroidDiff) <= TIE_EPSILON) {
      if (Math.abs(a.outlineArea - b.outlineArea) > TIE_EPSILON) {
        return a.outlineArea - b.outlineArea;
      }
    }

    if (Math.abs(edgeDiff) > TIE_EPSILON) {
      return edgeDiff;
    }
    if (Math.abs(centroidDiff) > TIE_EPSILON) {
      return centroidDiff;
    }
    return a.outlineArea - b.outlineArea;
  });

  return {
    tappable: enlargedHits[0].tappable,
    matchStage: 'hit'
  };
}
