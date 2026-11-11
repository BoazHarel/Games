const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const UNBUILT_BRANCHES_V1 = new Set(['E', 'F', 'H', 'I']);
const BUILT_BRANCHES_V1 = new Set(['root', 'A', 'B', 'C', 'D', 'G', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'DD', 'FA', 'GX1', 'Q', 'R', 'S', 'W', 'T', 'X', 'Y']);
const FORBIDDEN_HAND_ENTERED_KEYS = [
  'dilatedPercent',
  'dilationPercent',
  'enlargementPercent',
  'minDevicePx',
  'minDevicePxAt1340x800',
  'minCssPx',
  'minCssPxAt1024x600',
  'overlapRatio',
  'computedArea'
];

const EPSILON = 1e-6;

/**
 * Computes the fitted 16:9 stage dimensions (object-fit: contain) inside a given viewport.
 */
export function getFittedStageDimensions(viewportWidth, viewportHeight, canvasWidth = 1600, canvasHeight = 900) {
  const scale = Math.min(viewportWidth / canvasWidth, viewportHeight / canvasHeight);
  return {
    width: canvasWidth * scale,
    height: canvasHeight * scale,
    scale
  };
}

/**
 * Projects a polygon in 0..100 percentage coordinates onto a target pixel width & height.
 */
export function projectPolygon(polygon, width, height) {
  return polygon.map(([xPct, yPct]) => [(xPct / 100) * width, (yPct / 100) * height]);
}

/**
 * Signed area of a 2D polygon via the Shoelace formula.
 * Positive for counter-clockwise (in standard math coordinates).
 */
export function polygonSignedArea(pts) {
  if (!Array.isArray(pts) || pts.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * Unsigned area of a 2D polygon.
 */
export function polygonArea(pts) {
  return Math.abs(polygonSignedArea(pts));
}

/**
 * Axis-aligned bounding box of a 2D polygon.
 */
export function polygonBBox(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Checks whether point P lies on segment AB within tolerance.
 */
export function pointOnSegment(pt, a, b, tol = 1e-5) {
  const [px, py] = pt;
  const [ax, ay] = a;
  const [bx, by] = b;
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= tol * tol) {
    return Math.hypot(px - ax, py - ay) <= tol;
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return Math.hypot(px - closestX, py - closestY) <= tol;
}

/**
 * Point-in-polygon check (inclusive of boundary edges).
 */
export function pointInPolygon(pt, polygon, tol = 1e-5) {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (pointOnSegment(pt, a, b, tol)) {
      return true;
    }
  }

  const [px, py] = pt;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = (yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function ensureCCW(pts) {
  return polygonSignedArea(pts) >= 0 ? pts.slice() : pts.slice().reverse();
}

function cross2D(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTriangle(pt, a, b, c) {
  const c1 = cross2D(a, b, pt);
  const c2 = cross2D(b, c, pt);
  const c3 = cross2D(c, a, pt);
  const hasNeg = c1 < -EPSILON || c2 < -EPSILON || c3 < -EPSILON;
  const hasPos = c1 > EPSILON || c2 > EPSILON || c3 > EPSILON;
  return !(hasNeg && hasPos);
}

/**
 * Decomposes a simple polygon (convex or concave) into CCW triangles via ear clipping.
 */
export function triangulatePolygon(pts) {
  const poly = ensureCCW(pts);
  if (poly.length < 3) return [];
  if (poly.length === 3) return [poly];

  const triangles = [];
  const vertices = poly.slice();
  let guard = vertices.length * vertices.length * 2;

  while (vertices.length > 3 && guard > 0) {
    guard--;
    let earFound = false;
    const n = vertices.length;

    for (let i = 0; i < n; i++) {
      const prev = vertices[(i - 1 + n) % n];
      const curr = vertices[i];
      const next = vertices[(i + 1) % n];

      if (cross2D(prev, curr, next) <= EPSILON) {
        continue;
      }

      let containsOtherVertex = false;
      for (let j = 0; j < n; j++) {
        if (j === (i - 1 + n) % n || j === i || j === (i + 1) % n) continue;
        if (pointInTriangle(vertices[j], prev, curr, next)) {
          containsOtherVertex = true;
          break;
        }
      }

      if (!containsOtherVertex) {
        triangles.push([prev, curr, next]);
        vertices.splice(i, 1);
        earFound = true;
        break;
      }
    }

    if (!earFound) {
      // Fallback fan triangulation if collinear/degenerate vertices exist
      for (let i = 1; i < vertices.length - 1; i++) {
        triangles.push([vertices[0], vertices[i], vertices[i + 1]]);
      }
      return triangles;
    }
  }

  if (vertices.length === 3) {
    triangles.push([vertices[0], vertices[1], vertices[2]]);
  }
  return triangles;
}

function lineIntersection(p1, p2, a, b) {
  const x1 = p1[0];
  const y1 = p1[1];
  const x2 = p2[0];
  const y2 = p2[1];
  const x3 = a[0];
  const y3 = a[1];
  const x4 = b[0];
  const y4 = b[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) <= 1e-12) {
    return [(x1 + x2) / 2, (y1 + y2) / 2];
  }
  const pre = x1 * y2 - y1 * x2;
  const post = x3 * y4 - y3 * x4;
  const ix = (pre * (x3 - x4) - (x1 - x2) * post) / denom;
  const iy = (pre * (y3 - y4) - (y1 - y2) * post) / denom;
  return [ix, iy];
}

/**
 * Sutherland-Hodgman clipping of a subject polygon against a convex CCW clip polygon.
 */
export function sutherlandHodgmanClip(subjectPoly, clipPolyCCW) {
  let outputList = subjectPoly.slice();
  for (let i = 0; i < clipPolyCCW.length; i++) {
    const edgeStart = clipPolyCCW[i];
    const edgeEnd = clipPolyCCW[(i + 1) % clipPolyCCW.length];
    const inputList = outputList;
    outputList = [];
    if (inputList.length === 0) {
      break;
    }

    let s = inputList[inputList.length - 1];
    for (const e of inputList) {
      const eInside = cross2D(edgeStart, edgeEnd, e) >= -EPSILON;
      const sInside = cross2D(edgeStart, edgeEnd, s) >= -EPSILON;
      if (eInside) {
        if (!sInside) {
          outputList.push(lineIntersection(s, e, edgeStart, edgeEnd));
        }
        outputList.push(e);
      } else if (sInside) {
        outputList.push(lineIntersection(s, e, edgeStart, edgeEnd));
      }
      s = e;
    }
  }
  return outputList;
}

/**
 * Exact analytical intersection area between two simple 2D polygons (convex or concave).
 */
export function polygonIntersectionArea(polyA, polyB) {
  const bboxA = polygonBBox(polyA);
  const bboxB = polygonBBox(polyB);
  if (
    bboxA.maxX <= bboxB.minX ||
    bboxB.maxX <= bboxA.minX ||
    bboxA.maxY <= bboxB.minY ||
    bboxB.maxY <= bboxA.minY
  ) {
    return 0;
  }

  const trisA = triangulatePolygon(polyA);
  const trisB = triangulatePolygon(polyB);
  let totalArea = 0;

  for (const triA of trisA) {
    const tBoxA = polygonBBox(triA);
    for (const triB of trisB) {
      const tBoxB = polygonBBox(triB);
      if (
        tBoxA.maxX <= tBoxB.minX ||
        tBoxB.maxX <= tBoxA.minX ||
        tBoxA.maxY <= tBoxB.minY ||
        tBoxB.maxY <= tBoxA.minY
      ) {
        continue;
      }
      const clipped = sutherlandHodgmanClip(triA, triB);
      if (clipped.length >= 3) {
        totalArea += polygonArea(clipped);
      }
    }
  }
  return totalArea;
}

function validatePolygonArray(poly, label, errors) {
  if (!Array.isArray(poly) || poly.length < 3) {
    errors.push(`${label} must be an array of at least 3 [x, y] vertices.`);
    return false;
  }
  for (let i = 0; i < poly.length; i++) {
    const pt = poly[i];
    if (
      !Array.isArray(pt) ||
      pt.length !== 2 ||
      typeof pt[0] !== 'number' ||
      typeof pt[1] !== 'number' ||
      !Number.isFinite(pt[0]) ||
      !Number.isFinite(pt[1]) ||
      pt[0] < 0 ||
      pt[0] > 100 ||
      pt[1] < 0 ||
      pt[1] > 100
    ) {
      errors.push(`${label}[${i}] must be [x, y] numbers within 0..100.`);
      return false;
    }
  }
  return true;
}

/**
 * Validates the complete world.json object against schema, stop graph, hardware budget,
 * and geometry-computed polygon rules.
 *
 * @param {object} world - Parsed world.json data
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateWorld(world) {
  const errors = [];
  const warnings = [];

  if (!world || typeof world !== 'object' || Array.isArray(world)) {
    return { valid: false, errors: ['world.json root must be an object.'], warnings };
  }

  if (world.schemaVersion !== 1) {
    errors.push(`schemaVersion must be 1 (got ${JSON.stringify(world.schemaVersion)}).`);
  }
  if (typeof world.contentVersion !== 'string' || world.contentVersion.trim().length === 0) {
    errors.push('contentVersion must be a non-empty string.');
  }
  if (world.rootId !== 'room') {
    errors.push(`rootId must be "room" (got ${JSON.stringify(world.rootId)}).`);
  }

  const cfg = world.config;
  if (!cfg || typeof cfg !== 'object') {
    errors.push('config object is required.');
    return { valid: false, errors, warnings };
  }

  const canvasWidth = cfg.canvasWidth;
  const canvasHeight = cfg.canvasHeight;
  const minTapDevicePx = cfg.minTapDevicePx;
  const minTapCssPxFloor = cfg.minTapCssPxFloor;
  const minDilationPercent = cfg.minDilationPercent;
  const maxOverlapWarnRatio = cfg.maxOverlapWarnRatio;
  const flyInDurationMs = cfg.flyInDurationMs;

  if (canvasWidth !== 1600 || canvasHeight !== 900) {
    errors.push(`config.canvasWidth/canvasHeight must be 1600x900 (got ${canvasWidth}x${canvasHeight}).`);
  }
  if (typeof minTapDevicePx !== 'number' || minTapDevicePx < 140) {
    errors.push(`config.minTapDevicePx must be >= 140 (got ${minTapDevicePx}).`);
  }
  if (typeof minTapCssPxFloor !== 'number' || minTapCssPxFloor < 64) {
    errors.push(`config.minTapCssPxFloor must be >= 64 (got ${minTapCssPxFloor}).`);
  }
  if (typeof minDilationPercent !== 'number' || minDilationPercent < 15) {
    errors.push(`config.minDilationPercent must be >= 15 (got ${minDilationPercent}).`);
  }
  if (typeof maxOverlapWarnRatio !== 'number' || maxOverlapWarnRatio <= 0 || maxOverlapWarnRatio > 0.10) {
    errors.push(`config.maxOverlapWarnRatio must be in (0, 0.10] (got ${maxOverlapWarnRatio}).`);
  }
  if (flyInDurationMs !== 600) {
    errors.push(`config.flyInDurationMs must be 600 (got ${flyInDurationMs}).`);
  }

  if (!world.stops || typeof world.stops !== 'object' || Array.isArray(world.stops)) {
    errors.push('stops map is required.');
    return { valid: false, errors, warnings };
  }

  const stopIds = Object.keys(world.stops);
  if (stopIds.length === 0) {
    errors.push('stops map cannot be empty.');
    return { valid: false, errors, warnings };
  }
  if (!world.stops[world.rootId]) {
    errors.push(`Root stop "${world.rootId}" is missing from stops.`);
  }

  const fitted1340 = getFittedStageDimensions(1340, 800, canvasWidth || 1600, canvasHeight || 900);
  const fitted1024 = getFittedStageDimensions(1024, 600, canvasWidth || 1600, canvasHeight || 900);
  const requiredDilationFactor = 1 + (typeof minDilationPercent === 'number' ? minDilationPercent : 15) / 100;

  for (const [stopKey, stop] of Object.entries(world.stops)) {
    const prefix = `Stop "${stopKey}"`;
    if (!stop || typeof stop !== 'object') {
      errors.push(`${prefix}: stop definition must be an object.`);
      continue;
    }
    if (stop.id !== stopKey) {
      errors.push(`${prefix}: stop.id "${stop.id}" does not match key "${stopKey}".`);
    }
    if (typeof stop.name !== 'string' || stop.name.trim().length === 0) {
      errors.push(`${prefix}: name must be a non-empty string.`);
    }
    if (!BUILT_BRANCHES_V1.has(stop.branch)) {
      errors.push(`${prefix}: branch "${stop.branch}" is not a built v1 branch.`);
    }
    if (stop.branch === 'B' && stop.id !== 'b-street') {
      errors.push(`${prefix}: only "b-street" is built in Branch B for v1.`);
    }
    if (typeof stop.level !== 'number' || !Number.isInteger(stop.level) || stop.level < 0 || stop.level > 8) {
      errors.push(`${prefix}: level must be an integer between 0 and 8.`);
    }
    if (stop.id === 'room' && (stop.level !== 0 || stop.branch !== 'root')) {
      errors.push(`${prefix}: room must have level 0 and branch "root".`);
    }
    if (stop.id !== 'room' && stop.level === 0) {
      errors.push(`${prefix}: only "room" may have level 0.`);
    }

    if (typeof stop.paletteColor !== 'string' || !HEX_COLOR_RE.test(stop.paletteColor)) {
      errors.push(`${prefix}: paletteColor must be a 6-digit hex colour (got ${JSON.stringify(stop.paletteColor)}).`);
    }
    if (stop.paletteColorByMode !== undefined && stop.paletteColorByMode !== null) {
      if (
        typeof stop.paletteColorByMode !== 'object' ||
        !HEX_COLOR_RE.test(stop.paletteColorByMode.day || '') ||
        !HEX_COLOR_RE.test(stop.paletteColorByMode.night || '')
      ) {
        errors.push(`${prefix}: paletteColorByMode must have valid hex colours for "day" and "night".`);
      }
    } else if (stop.id === 'room') {
      errors.push(`${prefix}: room must define paletteColorByMode for "day" and "night".`);
    }

    if (typeof stop.end !== 'boolean') {
      errors.push(`${prefix}: end must be a boolean.`);
    }
    if (typeof stop.isRealPhoto !== 'boolean') {
      errors.push(`${prefix}: isRealPhoto must be a boolean.`);
    }
    if (stop.isRealPhoto) {
      if (!stop.end) {
        errors.push(`${prefix}: isRealPhoto stops must be leaf stops (end: true).`);
      }
      if (
        !stop.credits ||
        typeof stop.credits !== 'object' ||
        typeof stop.credits.source !== 'string' ||
        stop.credits.source.trim().length === 0 ||
        typeof stop.credits.attribution !== 'string' ||
        stop.credits.attribution.trim().length === 0
      ) {
        errors.push(`${prefix}: isRealPhoto stops must include non-empty credits.source and credits.attribution.`);
      }
    } else if (stop.credits !== null && stop.credits !== undefined) {
      errors.push(`${prefix}: non-photo stops must have credits: null.`);
    }

    if (typeof stop.parentQuestion !== 'string' || stop.parentQuestion.trim().length === 0) {
      errors.push(`${prefix}: parentQuestion must be a non-empty string.`);
    }

    // Image block validation
    const img = stop.image;
    if (!img || typeof img !== 'object') {
      errors.push(`${prefix}: image object is required.`);
    } else {
      if (typeof img.background !== 'string' || !img.background.endsWith('.webp')) {
        errors.push(`${prefix}: image.background must be a .webp path.`);
      }
      if (typeof img.thumbnail !== 'string' || !img.thumbnail.endsWith('.webp')) {
        errors.push(`${prefix}: image.thumbnail must be a .webp path.`);
      }
      if (img.width !== 1600 || img.height !== 900) {
        errors.push(`${prefix}: image.width/height must be 1600x900.`);
      }
      if (img.backgroundByMode !== undefined && img.backgroundByMode !== null) {
        if (
          typeof img.backgroundByMode !== 'object' ||
          typeof img.backgroundByMode.day !== 'string' ||
          !img.backgroundByMode.day.endsWith('.webp') ||
          typeof img.backgroundByMode.night !== 'string' ||
          !img.backgroundByMode.night.endsWith('.webp')
        ) {
          errors.push(`${prefix}: image.backgroundByMode must provide .webp paths for "day" and "night".`);
        }
      } else if (stop.id === 'room') {
        errors.push(`${prefix}: room must define image.backgroundByMode for "day" and "night".`);
      }
    }

    // Links validation
    if (!Array.isArray(stop.links)) {
      errors.push(`${prefix}: links must be an array.`);
    } else {
      for (const link of stop.links) {
        if (!link || typeof link !== 'object') {
          errors.push(`${prefix}: link entry must be an object.`);
          continue;
        }
        if (UNBUILT_BRANCHES_V1.has(link.targetBranch) && link.sceneryOnlyInV1 !== true) {
          errors.push(`${prefix}: link to unbuilt branch "${link.targetBranch}" must set sceneryOnlyInV1: true.`);
        }
      }
    }

    if (stop.unlinked) {
      continue;
    }

    if (!Array.isArray(stop.tappables)) {
      errors.push(`${prefix}: tappables must be an array.`);
      continue;
    }
    if (!Array.isArray(stop.children)) {
      errors.push(`${prefix}: children must be an array.`);
      continue;
    }

    const PASS_THROUGH_STOPS = new Set([
      'b-street',
      'g-dinosaurs',
      'a-northern-lights',
      'a-shooting-star-satellite'
    ]);
    if (stop.passThrough && !PASS_THROUGH_STOPS.has(stop.id)) {
      errors.push(`${prefix}: passThrough: true is only permitted on designated pass-through stops.`);
    }

    const activeTappables = stop.tappables.filter((t) => t && t.sceneryOnlyInV1 !== true);
    const activeStagePolygons = [];
    const expectedChildrenSet = new Set();
    const seenTappableIds = new Set();
    let roomHasWindowTargetByMode = false;
    let roomHasLightSwitchAction = false;

    // Tappable count rules
    if (stop.end) {
      if (stop.tappables.length !== 0) {
        errors.push(`${prefix}: end stops must have 0 tappables (got ${stop.tappables.length}).`);
      }
      if (stop.children.length !== 0) {
        errors.push(`${prefix}: end stops must have 0 children (got ${stop.children.length}).`);
      }
    } else if (stop.id === 'room') {
      if (stop.tappables.length !== 7) {
        errors.push(`${prefix}: room must have exactly 7 tappables in v1 (got ${stop.tappables.length}).`);
      }
      if (activeTappables.length < 4 || activeTappables.length > 6) {
        errors.push(`${prefix}: room must have 4..6 active tappables in v1 (got ${activeTappables.length}).`);
      }
    } else if (stop.passThrough) {
      if (activeTappables.length < 1 || stop.tappables.length < 1 || stop.tappables.length > 6) {
        errors.push(
          `${prefix}: pass-through stop must have >= 1 active tappable and 1..6 total tappables (got ${activeTappables.length} active, ${stop.tappables.length} total).`
        );
      }
    } else {
      if (activeTappables.length < 1 || activeTappables.length > 6) {
        errors.push(
          `${prefix}: non-end stop must have 1..6 active tappables (got ${activeTappables.length}).`
        );
      }
      if (stop.tappables.length > 6) {
        errors.push(`${prefix}: non-end stop cannot exceed 6 total tappables (got ${stop.tappables.length}).`);
      }
    }

    // Per-tappable validation
    for (const tap of stop.tappables) {
      const tapPrefix = `${prefix} tappable "${tap?.id || 'unknown'}"`;
      if (!tap || typeof tap !== 'object') {
        errors.push(`${tapPrefix}: must be an object.`);
        continue;
      }
      if (typeof tap.id !== 'string' || tap.id.trim().length === 0) {
        errors.push(`${tapPrefix}: id must be a non-empty string.`);
      } else if (seenTappableIds.has(tap.id)) {
        errors.push(`${tapPrefix}: duplicate tappable id "${tap.id}".`);
      } else {
        seenTappableIds.add(tap.id);
      }

      for (const forbiddenKey of FORBIDDEN_HAND_ENTERED_KEYS) {
        if (forbiddenKey in tap) {
          errors.push(
            `${tapPrefix}: forbidden hand-entered metric field "${forbiddenKey}" present; metrics must be computed from polygon geometry.`
          );
        }
      }

      if (typeof tap.sceneryOnlyInV1 !== 'boolean') {
        errors.push(`${tapPrefix}: sceneryOnlyInV1 must be a boolean.`);
      }
      if (tap.layerImage !== null && (typeof tap.layerImage !== 'string' || !tap.layerImage.endsWith('.webp'))) {
        errors.push(`${tapPrefix}: layerImage must be null or a .webp path.`);
      }
      if (tap.layerImageByMode !== undefined && tap.layerImageByMode !== null) {
        if (
          typeof tap.layerImageByMode !== 'object' ||
          typeof tap.layerImageByMode.day !== 'string' ||
          !tap.layerImageByMode.day.endsWith('.webp') ||
          typeof tap.layerImageByMode.night !== 'string' ||
          !tap.layerImageByMode.night.endsWith('.webp')
        ) {
          errors.push(`${tapPrefix}: layerImageByMode must provide .webp paths for "day" and "night".`);
        }
      }

      // Target / action / scenery resolution rules
      if (tap.sceneryOnlyInV1) {
        if (tap.targetStopId !== null || tap.targetByMode !== null || tap.action !== null) {
          errors.push(
            `${tapPrefix}: sceneryOnlyInV1 tappables must have targetStopId: null, targetByMode: null, and action: null.`
          );
        }
        if (!UNBUILT_BRANCHES_V1.has(tap.unbuiltBranch)) {
          errors.push(
            `${tapPrefix}: sceneryOnlyInV1 tappables must declare unbuiltBranch in B/E/F/H/I (got ${JSON.stringify(tap.unbuiltBranch)}).`
          );
        }
        if (tap.sceneryStopId !== undefined && tap.sceneryStopId !== null) {
          const sceneryStop = world.stops[tap.sceneryStopId];
          if (!sceneryStop) {
            errors.push(`${tapPrefix}: sceneryStopId "${tap.sceneryStopId}" does not exist in stops.`);
          } else if (sceneryStop.sceneryOnlyInV1 !== true) {
            errors.push(`${tapPrefix}: sceneryStopId "${tap.sceneryStopId}" must have sceneryOnlyInV1: true.`);
          } else if (sceneryStop.level !== stop.level + 1) {
            errors.push(
              `${tapPrefix}: sceneryStopId "${tap.sceneryStopId}" level must be ${stop.level + 1} (got ${sceneryStop.level}).`
            );
          }
        }
      } else {
        if (tap.unbuiltBranch) {
          errors.push(
            `${tapPrefix}: tappable pointing to unbuiltBranch "${tap.unbuiltBranch}" must set sceneryOnlyInV1: true.`
          );
        }

        if (tap.action !== null && tap.action !== undefined) {
          if (tap.action !== 'toggleDayNight') {
            errors.push(`${tapPrefix}: unsupported action "${tap.action}".`);
          }
          if (tap.targetStopId !== null || tap.targetByMode !== null) {
            errors.push(`${tapPrefix}: action tappables must have targetStopId: null and targetByMode: null.`);
          }
          if (stop.id === 'room' && tap.action === 'toggleDayNight') {
            if (!tap.layerImageByMode) {
              errors.push(`${tapPrefix}: room light switch must define layerImageByMode.`);
            }
            roomHasLightSwitchAction = true;
          }
        } else if (tap.targetByMode !== null && tap.targetByMode !== undefined) {
          if (tap.targetStopId !== null) {
            errors.push(`${tapPrefix}: tappable with targetByMode must have targetStopId: null.`);
          }
          if (
            typeof tap.targetByMode !== 'object' ||
            typeof tap.targetByMode.day !== 'string' ||
            typeof tap.targetByMode.night !== 'string'
          ) {
            errors.push(`${tapPrefix}: targetByMode must specify "day" and "night" stop IDs.`);
          } else {
            for (const modeKey of ['day', 'night']) {
              const modeTargetId = tap.targetByMode[modeKey];
              if (!world.stops[modeTargetId]) {
                errors.push(`${tapPrefix}: targetByMode.${modeKey} "${modeTargetId}" does not exist in stops.`);
              } else {
                expectedChildrenSet.add(modeTargetId);
              }
            }
            if (
              stop.id === 'room' &&
              tap.targetByMode.day === 'b-street' &&
              tap.targetByMode.night === 'a-night-sky'
            ) {
              if (!tap.layerImageByMode) {
                errors.push(`${tapPrefix}: room window must define layerImageByMode.`);
              }
              roomHasWindowTargetByMode = true;
            }
          }
        } else if (typeof tap.targetStopId === 'string' && tap.targetStopId.length > 0) {
          if (!world.stops[tap.targetStopId]) {
            errors.push(`${tapPrefix}: targetStopId "${tap.targetStopId}" does not exist in stops.`);
          } else {
            expectedChildrenSet.add(tap.targetStopId);
          }
        } else {
          errors.push(
            `${tapPrefix}: active tappable must define targetStopId, targetByMode, or action.`
          );
        }
      }

      // Geometry validation on outlinePolygon and hitPolygon
      const outlineValid = validatePolygonArray(tap.outlinePolygon, `${tapPrefix}.outlinePolygon`, errors);
      const hitValid = validatePolygonArray(tap.hitPolygon, `${tapPrefix}.hitPolygon`, errors);
      if (!outlineValid || !hitValid) {
        continue;
      }

      const outlineStage = projectPolygon(tap.outlinePolygon, canvasWidth || 1600, canvasHeight || 900);
      const hitStage = projectPolygon(tap.hitPolygon, canvasWidth || 1600, canvasHeight || 900);
      const outlineArea = polygonArea(outlineStage);
      const hitArea = polygonArea(hitStage);
      const outlineBBox = polygonBBox(outlineStage);
      const hitBBox = polygonBBox(hitStage);

      if (outlineArea <= EPSILON || outlineBBox.width <= EPSILON || outlineBBox.height <= EPSILON) {
        errors.push(`${tapPrefix}: outlinePolygon is degenerate (zero area or dimension).`);
        continue;
      }
      if (hitArea <= EPSILON || hitBBox.width <= EPSILON || hitBBox.height <= EPSILON) {
        errors.push(`${tapPrefix}: hitPolygon is degenerate (zero area or dimension).`);
        continue;
      }

      // Check every vertex of outlinePolygon lies inside or on hitPolygon
      let allVerticesInside = true;
      for (const vertex of outlineStage) {
        if (!pointInPolygon(vertex, hitStage)) {
          allVerticesInside = false;
          break;
        }
      }
      if (!allVerticesInside) {
        errors.push(`${tapPrefix}: hitPolygon must completely enclose outlinePolygon.`);
      }

      // Geometry-computed >= 15% dilation check (width, height, and sqrt(area))
      const widthRatio = hitBBox.width / outlineBBox.width;
      const heightRatio = hitBBox.height / outlineBBox.height;
      const linearAreaRatio = Math.sqrt(hitArea / outlineArea);

      if (
        widthRatio < requiredDilationFactor - EPSILON ||
        heightRatio < requiredDilationFactor - EPSILON ||
        linearAreaRatio < requiredDilationFactor - EPSILON
      ) {
        errors.push(
          `${tapPrefix}: geometry-computed hitPolygon dilation must be >= ${minDilationPercent}% over outlinePolygon ` +
            `(got width +${((widthRatio - 1) * 100).toFixed(1)}%, height +${((heightRatio - 1) * 100).toFixed(1)}%, linear-area +${((linearAreaRatio - 1) * 100).toFixed(1)}%).`
        );
      }

      // Geometry-computed >= 140 device px at 1340x800 and >= 64 CSS px at 1024x600
      const hit1340 = projectPolygon(tap.hitPolygon, fitted1340.width, fitted1340.height);
      const bbox1340 = polygonBBox(hit1340);
      const minDim1340 = Math.min(bbox1340.width, bbox1340.height);
      if (minDim1340 < minTapDevicePx - EPSILON) {
        errors.push(
          `${tapPrefix}: geometry-computed hitPolygon minimum size at 1340x800 must be >= ${minTapDevicePx} device px ` +
            `(got ${bbox1340.width.toFixed(1)}x${bbox1340.height.toFixed(1)} device px).`
        );
      }

      const hit1024 = projectPolygon(tap.hitPolygon, fitted1024.width, fitted1024.height);
      const bbox1024 = polygonBBox(hit1024);
      const minDim1024 = Math.min(bbox1024.width, bbox1024.height);
      if (minDim1024 < minTapCssPxFloor - EPSILON) {
        errors.push(
          `${tapPrefix}: geometry-computed hitPolygon minimum size at 1024x600 must be >= ${minTapCssPxFloor} CSS px ` +
            `(got ${bbox1024.width.toFixed(1)}x${bbox1024.height.toFixed(1)} CSS px).`
        );
      }

      if (!tap.sceneryOnlyInV1) {
        activeStagePolygons.push({
          id: tap.id,
          pts: hitStage,
          area: hitArea
        });
      }
    }

    if (stop.id === 'room') {
      if (!roomHasWindowTargetByMode) {
        errors.push(`${prefix}: room must include window tappable with targetByMode { day: "b-street", night: "a-night-sky" }.`);
      }
      if (!roomHasLightSwitchAction) {
        errors.push(`${prefix}: room must include light-switch tappable with action: "toggleDayNight".`);
      }
    }

    // Check stop.children matches expectedChildrenSet
    const declaredChildrenSet = new Set(stop.children);
    if (declaredChildrenSet.size !== stop.children.length) {
      errors.push(`${prefix}: children array contains duplicate stop IDs.`);
    }
    for (const childId of expectedChildrenSet) {
      if (!declaredChildrenSet.has(childId)) {
        errors.push(`${prefix}: active tappable target "${childId}" is missing from stop.children.`);
      }
    }
    for (const childId of declaredChildrenSet) {
      if (!expectedChildrenSet.has(childId)) {
        errors.push(`${prefix}: stop.children entry "${childId}" is not targeted by any active tappable.`);
      }
      const childStop = world.stops[childId];
      if (!childStop) {
        errors.push(`${prefix}: child "${childId}" does not exist in stops.`);
      } else if (childStop.level !== stop.level + 1) {
        errors.push(
          `${prefix}: child "${childId}" level must be ${stop.level + 1} (got ${childStop.level}).`
        );
      }
    }

    // Pairwise enlarged hitPolygon overlap warning (> 10%)
    for (let i = 0; i < activeStagePolygons.length; i++) {
      for (let j = i + 1; j < activeStagePolygons.length; j++) {
        const polyA = activeStagePolygons[i];
        const polyB = activeStagePolygons[j];
        const interArea = polygonIntersectionArea(polyA.pts, polyB.pts);
        if (interArea > EPSILON) {
          const minPolyArea = Math.min(polyA.area, polyB.area);
          const overlapRatio = interArea / minPolyArea;
          if (overlapRatio > maxOverlapWarnRatio) {
            warnings.push(
              `${prefix}: enlarged hitPolygons "${polyA.id}" and "${polyB.id}" overlap by ${(overlapRatio * 100).toFixed(1)}% (> ${(maxOverlapWarnRatio * 100).toFixed(0)}% threshold).`
            );
          }
        }
      }
    }

    // Optional example stop "more friends" validation (Issue #50)
    if (stop.moreFriends !== undefined) {
      if (!Array.isArray(stop.moreFriends)) {
        errors.push(`${prefix}: moreFriends must be an array.`);
      } else if (stop.moreFriends.length < 2 || stop.moreFriends.length > 3) {
        errors.push(
          `${prefix}: moreFriends must contain 2 to 3 animals (got ${stop.moreFriends.length}).`
        );
      } else {
        const friendIds = new Set();
        for (const friend of stop.moreFriends) {
          const friendPrefix = `${prefix} friend "${friend?.id || 'unknown'}"`;
          if (!friend || typeof friend !== 'object') {
            errors.push(`${friendPrefix}: must be an object.`);
            continue;
          }
          if (!friend.id || typeof friend.id !== 'string') {
            errors.push(`${friendPrefix}: missing or non-string id.`);
          } else if (friendIds.has(friend.id)) {
            errors.push(`${friendPrefix}: duplicate friend id "${friend.id}".`);
          } else {
            friendIds.add(friend.id);
          }

          if (!friend.label || typeof friend.label !== 'string') {
            errors.push(`${friendPrefix}: missing or non-string label.`);
          }
          if (!friend.layerImage || typeof friend.layerImage !== 'string') {
            errors.push(`${friendPrefix}: missing or non-string layerImage.`);
          }
          if (!friend.actionAnimation || typeof friend.actionAnimation !== 'string') {
            errors.push(`${friendPrefix}: missing or non-string actionAnimation.`);
          }

          for (const forbiddenKey of FORBIDDEN_HAND_ENTERED_KEYS) {
            if (Object.prototype.hasOwnProperty.call(friend, forbiddenKey)) {
              errors.push(
                `${friendPrefix}: hand-entered validation key "${forbiddenKey}" is forbidden.`
              );
            }
          }

          if (
            !friend.bounds ||
            typeof friend.bounds.x !== 'number' ||
            typeof friend.bounds.y !== 'number' ||
            typeof friend.bounds.w !== 'number' ||
            typeof friend.bounds.h !== 'number'
          ) {
            errors.push(`${friendPrefix}: bounds must define numeric x, y, w, h.`);
          }

          const outlineValid = validatePolygonArray(
            friend.outlinePolygon,
            `${friendPrefix}.outlinePolygon`,
            errors
          );
          const hitValid = validatePolygonArray(
            friend.hitPolygon,
            `${friendPrefix}.hitPolygon`,
            errors
          );
          if (!outlineValid || !hitValid) {
            continue;
          }

          const outlineStage = projectPolygon(
            friend.outlinePolygon,
            canvasWidth || 1600,
            canvasHeight || 900
          );
          const hitStage = projectPolygon(
            friend.hitPolygon,
            canvasWidth || 1600,
            canvasHeight || 900
          );
          const outlineArea = polygonArea(outlineStage);
          const hitArea = polygonArea(hitStage);
          const outlineBBox = polygonBBox(outlineStage);
          const hitBBox = polygonBBox(hitStage);

          if (outlineArea <= EPSILON || outlineBBox.width <= EPSILON || outlineBBox.height <= EPSILON) {
            errors.push(`${friendPrefix}: outlinePolygon is degenerate.`);
            continue;
          }
          if (hitArea <= EPSILON || hitBBox.width <= EPSILON || hitBBox.height <= EPSILON) {
            errors.push(`${friendPrefix}: hitPolygon is degenerate.`);
            continue;
          }

          const widthRatio = hitBBox.width / outlineBBox.width;
          const heightRatio = hitBBox.height / outlineBBox.height;
          const linearAreaRatio = Math.sqrt(hitArea / outlineArea);

          if (
            widthRatio < requiredDilationFactor - EPSILON ||
            heightRatio < requiredDilationFactor - EPSILON ||
            linearAreaRatio < requiredDilationFactor - EPSILON
          ) {
            errors.push(
              `${friendPrefix}: geometry-computed hitPolygon dilation must be >= ${minDilationPercent}% over outlinePolygon.`
            );
          }

          const hit1340 = projectPolygon(friend.hitPolygon, fitted1340.width, fitted1340.height);
          const bbox1340 = polygonBBox(hit1340);
          const minDim1340 = Math.min(bbox1340.width, bbox1340.height);
          if (minDim1340 < minTapDevicePx - EPSILON) {
            errors.push(
              `${friendPrefix}: hit target min dimension ${minDim1340.toFixed(1)} device px is below ${minTapDevicePx} px floor at 1340x800.`
            );
          }

          const hit1024 = projectPolygon(friend.hitPolygon, fitted1024.width, fitted1024.height);
          const bbox1024 = polygonBBox(hit1024);
          const minDim1024 = Math.min(bbox1024.width, bbox1024.height);
          if (minDim1024 < minTapCssPxFloor - EPSILON) {
            errors.push(
              `${friendPrefix}: hit target min dimension ${minDim1024.toFixed(1)} CSS px is below ${minTapCssPxFloor} px floor at 1024x600.`
            );
          }
        }
      }
    }
  }

  // Graph reachability and cycle detection from rootId
  if (world.stops[world.rootId]) {
    const visited = new Set();
    const visiting = new Set();

    const dfs = (currentId) => {
      visiting.add(currentId);
      visited.add(currentId);
      const currentStop = world.stops[currentId];
      if (currentStop && Array.isArray(currentStop.tappables)) {
        for (const tap of currentStop.tappables) {
          if (tap?.sceneryOnlyInV1 && tap.sceneryStopId && world.stops[tap.sceneryStopId]?.sceneryOnlyInV1) {
            visited.add(tap.sceneryStopId);
          }
        }
      }
      if (currentStop && Array.isArray(currentStop.children)) {
        for (const childId of currentStop.children) {
          if (!world.stops[childId]) continue;
          if (visiting.has(childId)) {
            errors.push(`Cycle detected in stop graph involving "${currentId}" -> "${childId}".`);
          } else if (!visited.has(childId)) {
            dfs(childId);
          }
        }
      }
      visiting.delete(currentId);
    };

    dfs(world.rootId);

    for (const stopKey of stopIds) {
      const stop = world.stops[stopKey];
      if (stop && stop.unlinked) continue;
      if (!visited.has(stopKey)) {
        errors.push(`Stop "${stopKey}" is unreachable from root "${world.rootId}".`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
