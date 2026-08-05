import type { Position } from './geo.js';
import { KIND_DEFINITIONS, type Feature } from './features.js';
import { EARTH_RADIUS, segmentsCross } from './measure.js';
import { TEEING_AREA, TEE_PAD_M, TARGET_CIRCLES } from './pdga.js';

/**
 * Geometry the document does not store.
 *
 * A tee is a point; its pad is a rectangle. A fairway is a line; its corridor is
 * an area. Both of the second things are computed here, every time, from the
 * first — and neither is ever written back.
 *
 * That is the whole discipline of this module. Storing a derived polygon means
 * two representations of one fact, which stay in step exactly until someone
 * drags the point they came from. Recomputing costs a few dozen multiplications
 * per feature and can never be stale.
 *
 * ## Working in metres
 *
 * Everything here converts to a local east/north plane in METRES, does its work
 * there, and converts back. Offsetting a polyline in degrees would make a
 * corridor visibly wider north-to-south than east-to-west — by a factor of
 * 1/cos(latitude), the same error `measure.ts` refuses for distance — and at
 * Minneapolis that is a fairway 40% fatter on one axis than the other.
 *
 * The plane is tangent at the first coordinate given. Over the few hundred
 * metres a hole spans, the divergence from the sphere is far below a pixel.
 */

const DEG = Math.PI / 180;

/** Metres per degree of latitude. Constant; longitude is the one that varies. */
const M_PER_DEG_LAT = EARTH_RADIUS * DEG;

/** A point on the local tangent plane: metres east and north of the origin. */
export type Local = [east: number, north: number];

/**
 * A tangent plane anchored at one position.
 *
 * Built once per feature rather than per vertex — the cosine is the expensive
 * part, and holding latitude fixed across a single hole is exactly the
 * approximation this module has already accepted.
 */
export interface Plane {
  origin: Position;
  mPerDegLng: number;
}

export function planeAt(origin: Position): Plane {
  // Guard the poles: cos(90°) is 0, and dividing by it would send every
  // longitude to infinity. No disc golf course is affected; a NaN-filled
  // polygon that silently blanks the map would be.
  const mPerDegLng = Math.max(M_PER_DEG_LAT * Math.cos(origin[1] * DEG), 1e-6);
  return { origin, mPerDegLng };
}

export function toLocal(plane: Plane, position: Position): Local {
  return [
    (position[0] - plane.origin[0]) * plane.mPerDegLng,
    (position[1] - plane.origin[1]) * M_PER_DEG_LAT,
  ];
}

export function fromLocal(plane: Plane, [east, north]: Local): Position {
  return [plane.origin[0] + east / plane.mPerDegLng, plane.origin[1] + north / M_PER_DEG_LAT];
}

/**
 * Unit vectors for a compass bearing, on the local plane.
 *
 * `forward` points the way play goes; `right` is 90° clockwise from it, which is
 * the player's right when standing on the tee looking down the fairway.
 */
function axes(bearingDeg: number): { forward: Local; right: Local } {
  const b = bearingDeg * DEG;
  const sin = Math.sin(b);
  const cos = Math.cos(b);
  // Compass bearings run clockwise from north, so east = sin and north = cos —
  // transposed from the usual maths convention, and the transposition is the
  // whole reason this is a named function rather than two lines inline.
  return { forward: [sin, cos], right: [cos, -sin] };
}

/* ------------------------------------------------------------------------- */
/* Tees and drop zones: a point plus a rectangle                              */
/* ------------------------------------------------------------------------- */

/**
 * Where a placed rectangle's dimensions came from.
 *
 * Surfaced so the interface can distinguish "the designer measured this pad" from
 * "this is what the rules say a tee is when there is no pad" — the difference
 * between a fact and a floor, which a designer taking the number to a parks
 * department needs to be able to see.
 */
export interface Footprint {
  /** Open ring: front-left, front-right, back-right, back-left. */
  ring: Position[];
  widthM: number;
  lengthM: number;
  bearingDeg: number;
  /** True when width or length fell back to a default rather than being set. */
  defaulted: boolean;
}

/**
 * Defaults for a placed rectangle with nothing filled in.
 *
 * Both are published figures, from two different documents, chosen for two
 * different reasons:
 *
 *   length   [RULES] 802.04.A. With no pad, the teeing area *is* "the area
 *            extending three meters perpendicularly behind the designated tee
 *            line". Not a typical value — the legal extent.
 *
 *   width    [ELEMENTS] p2, the *typical* pad width. The rules define how deep
 *            a padless teeing area is but say nothing about how wide, because a
 *            tee line is bounded by markers rather than by a dimension. So the
 *            design guideline's own word for a default is what gets used.
 *
 * A drop zone shares them. [RULES] 806.02.C calls a drop zone a marked area
 * without dimensioning it, and a designer who draws one and a designer who
 * draws a tee are asking for the same rectangle.
 */
export const PLACED_RECTANGLE_DEFAULTS = {
  widthM: TEE_PAD_M.typicalWidth,
  lengthM: TEEING_AREA.defaultDepthM,
} as const;

const positiveNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * The rectangle a tee or drop zone really occupies.
 *
 * **The stored point is the FRONT CENTRE**, and the rectangle extends backwards
 * along the reverse of the bearing. That is not a rendering convenience: it is
 * the measuring point. [ELEMENTS] p2 measures hole length "from front of the
 * tee", and [RULES] 802.04.A puts the teeing area behind the tee line. Anchoring
 * at the centre of the pad instead would silently add half a pad length to every
 * hole on the course.
 *
 * Returns null when there is no bearing to be had — from the feature or from the
 * caller. A rectangle needs a direction, and defaulting an unknown one to north
 * would draw a claim the designer never made. The point still renders; only the
 * footprint is withheld.
 */
export function footprintOf(
  feature: Feature,
  fallbackBearingDeg: number | null = null,
): Footprint | null {
  if (!KIND_DEFINITIONS[feature.kind].placedRectangle) return null;
  if (feature.geometry.type !== 'point') return null;

  const stored = feature.props['bearing'];
  const bearingDeg =
    typeof stored === 'number' && Number.isFinite(stored) ? stored : fallbackBearingDeg;
  if (bearingDeg === null) return null;

  const width = positiveNumber(feature.props['width']);
  const length = positiveNumber(feature.props['length']);
  const widthM = width ?? PLACED_RECTANGLE_DEFAULTS.widthM;
  const lengthM = length ?? PLACED_RECTANGLE_DEFAULTS.lengthM;

  const front = feature.geometry.coordinates;
  const plane = planeAt(front);
  const { forward, right } = axes(bearingDeg);

  const half = widthM / 2;
  const corner = (side: number, back: number): Position =>
    fromLocal(plane, [
      right[0] * side * half - forward[0] * back,
      right[1] * side * half - forward[1] * back,
    ]);

  return {
    ring: [corner(-1, 0), corner(1, 0), corner(1, lengthM), corner(-1, lengthM)],
    widthM,
    lengthM,
    bearingDeg,
    defaulted: width === null || length === null,
  };
}

/* ------------------------------------------------------------------------- */
/* Fairway corridors                                                          */
/* ------------------------------------------------------------------------- */

/**
 * How wide the playable corridor is, tee end to target end.
 *
 * **This taper is ours, not the PDGA's.** The PDGA publishes no fairway width,
 * and this file is not going to invent one and let it read like a rule. What it
 * does instead is join two figures that *are* published, with a straight line
 * between them:
 *
 *   at the tee      the pad's own width — the corridor starts as wide as the
 *                   thing you throw from, because at the moment of release that
 *                   is exactly how much room there is.
 *
 *   at the target   20 m — Circle 1, across. [RULES] 806.01.A puts its radius
 *                   at 10 m, so the corridor arrives exactly as wide as the
 *                   putting circle and its edges land on the ring the map
 *                   already draws around every target.
 *
 * The interpolation between them is a designer's convenience, nothing more. It
 * exists so a drawn line reads as ground rather than as a hairline, and every
 * width it produces is overridable per fairway.
 */
export const FAIRWAY_CORRIDOR = {
  /** Used when the pair's tee has no width set, or there is no tee at all. */
  fallbackWidthAtTeeM: TEE_PAD_M.typicalWidth,
  /**
   * A corridor narrower than this is a line, not a fairway. Ours: a pad can
   * legitimately be narrow, but a metre-wide corridor stops being drawable.
   */
  minimumWidthAtTeeM: 1,
  /**
   * Circle 1, across — see TARGET_CIRCLES in pdga.ts.
   *
   * A width, so it is the diameter rather than the published radius. Reading
   * the 10 m as a width instead put the corridor's edge halfway to a ring drawn
   * on the same map, which read as the taper failing rather than as a decision.
   */
  widthAtTargetM: TARGET_CIRCLES.find((c) => c.id === 'c1')!.radiusM * 2,
  /**
   * How far a dogleg's outside corner may spike past the corridor width.
   *
   * A mitre joint runs to `width / cos(turn / 2)`, which goes to infinity as a
   * turn approaches a hairpin. Clamping at 2 lets a right-angle dogleg keep its
   * point (1.41) while a 120° turn or sharper gets cut back. Ours; SVG's stock
   * value of 4 is tuned for glyph strokes, not for ground.
   */
  miterLimit: 2,
} as const;

export interface CorridorWidths {
  /** Full width in metres at the first vertex of the centreline. */
  atStart: number;
  /** Full width in metres at the last. */
  atEnd: number;
}

/**
 * The default corridor for a fairway, given the tee it is thrown from.
 *
 * `teePadWidthM` is the width the designer set on the tee, or null when they
 * have not set one — including when the fairway is not attached to a pair yet.
 */
export function defaultCorridorWidths(teePadWidthM: number | null): CorridorWidths {
  const atStart = Math.max(
    FAIRWAY_CORRIDOR.minimumWidthAtTeeM,
    positiveNumber(teePadWidthM) ?? FAIRWAY_CORRIDOR.fallbackWidthAtTeeM,
  );
  return { atStart, atEnd: FAIRWAY_CORRIDOR.widthAtTargetM };
}

export interface Corridor {
  /** Open ring, ready to render. */
  ring: Position[];
  widths: CorridorWidths;
  /**
   * True when the ring folds over itself.
   *
   * Not an error — the corridor is still drawn — but it means the centreline
   * turns more sharply than the corridor is wide, so the polygon has stopped
   * describing real ground. `rules.ts` reports it.
   */
  selfIntersects: boolean;
}

const sub = (a: Local, b: Local): Local => [a[0] - b[0], a[1] - b[1]];
const len = (v: Local): number => Math.hypot(v[0], v[1]);

/** Left-hand normal of a unit direction: rotate 90° counter-clockwise. */
const leftNormal = (d: Local): Local => [-d[1], d[0]];

/**
 * The area a fairway covers, from the line down its middle.
 *
 * A variable-width buffer: each vertex is pushed out perpendicular to the path
 * by half the width *at that point*, where the width is interpolated by
 * DISTANCE ALONG THE LINE rather than by vertex index. Index would make a
 * dogleg with one long leg and one short one taper almost entirely within the
 * short one — the corridor would balloon in the first ten metres of a
 * two-hundred-metre hole and then run parallel.
 *
 * Ends are cut square. A round cap would push the corridor past the target and
 * behind the tee line, both of which are places the hole demonstrably is not.
 *
 * Returns null for a centreline that has no length — two identical points is a
 * click, not a fairway.
 */
export function fairwayCorridor(
  centreline: readonly Position[],
  widths: CorridorWidths,
  miterLimit: number = FAIRWAY_CORRIDOR.miterLimit,
): Corridor | null {
  if (centreline.length < 2) return null;

  const plane = planeAt(centreline[0]!);

  /*
   * Consecutive duplicates are dropped first.
   *
   * A repeated vertex has no direction, so its normal would be NaN and the
   * whole polygon would vanish — and a double-click that finishes a line leaves
   * exactly that, which is how this gets hit in practice rather than in theory.
   */
  const points: Local[] = [];
  for (const position of centreline) {
    const local = toLocal(plane, position);
    const previous = points[points.length - 1];
    if (previous && len(sub(local, previous)) < 1e-6) continue;
    points.push(local);
  }
  if (points.length < 2) return null;

  // Cumulative distance, for interpolating width along the ground.
  const along: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    along.push(along[i - 1]! + len(sub(points[i]!, points[i - 1]!)));
  }
  const total = along[along.length - 1]!;
  if (total <= 0) return null;

  const halfWidthAt = (i: number): number => {
    const t = along[i]! / total;
    return (widths.atStart + (widths.atEnd - widths.atStart) * t) / 2;
  };

  // Unit direction of each segment; segment i runs from points[i] to points[i+1].
  const directions: Local[] = [];
  for (let i = 1; i < points.length; i++) {
    const d = sub(points[i]!, points[i - 1]!);
    const l = len(d);
    directions.push([d[0] / l, d[1] / l]);
  }

  const left: Local[] = [];
  const right: Local[] = [];

  for (let i = 0; i < points.length; i++) {
    const incoming = directions[i - 1];
    const outgoing = directions[i];
    const half = halfWidthAt(i);

    // Ends take the single segment they touch; interior vertices mitre.
    const n1 = leftNormal(incoming ?? outgoing!);
    const n2 = leftNormal(outgoing ?? incoming!);

    const bisector: Local = [n1[0] + n2[0], n1[1] + n2[1]];
    const bisectorLength = len(bisector);

    let offset: Local;
    if (bisectorLength < 1e-9) {
      // The path doubles straight back on itself; the two normals cancel and
      // there is no bisector to speak of. Use the incoming side, which at least
      // keeps the polygon closed rather than emitting NaN.
      offset = [n1[0] * half, n1[1] * half];
    } else {
      const m: Local = [bisector[0] / bisectorLength, bisector[1] / bisectorLength];
      // 1 / cos(half the turn), which is how far out the joint has to sit for
      // both offset edges to meet it.
      const scale = Math.min(1 / (m[0] * n1[0] + m[1] * n1[1]), miterLimit);
      offset = [m[0] * half * scale, m[1] * half * scale];
    }

    const p = points[i]!;
    left.push([p[0] + offset[0], p[1] + offset[1]]);
    right.push([p[0] - offset[0], p[1] - offset[1]]);
  }

  // Down one side and back the other. Open ring — the closing edge is implied,
  // matching how polygon features are stored.
  const ring = [...left, ...right.slice().reverse()].map((local) => fromLocal(plane, local));

  return { ring, widths, selfIntersects: ringSelfIntersects(ring) };
}

/**
 * Whether a closed ring crosses itself.
 *
 * Every pair of non-adjacent edges, including the implied closing edge.
 * Adjacent edges share an endpoint and are skipped: `segmentsCross` already
 * refuses to call a shared endpoint a crossing, but skipping them outright
 * makes that independent of how the strictness is written.
 *
 * Quadratic, and deliberately so. A fairway has a handful of vertices, and a
 * sweep-line implementation would be more code than the case justifies.
 *
 * Exactly-collinear doubling back is not detected — two edges lying on top of
 * one another never cross in the strict sense. That shape is degenerate for
 * other reasons and shows up as a corridor with no visible area.
 */
export function ringSelfIntersects(ring: readonly Position[]): boolean {
  const n = ring.length;
  if (n < 4) return false;

  for (let i = 0; i < n; i++) {
    const a1 = ring[i]!;
    const a2 = ring[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // Adjacent, or the first and last edges, which are also adjacent.
      if (j === i || j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(a1, a2, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

/**
 * A circle on the ground, as a polygon.
 *
 * For the rings around a target — see TARGET_CIRCLES. Metric radius, so the
 * circle stays 10 m across at every zoom rather than being a screen-space dot
 * that lies about how big Circle 1 is.
 */
export function circleRing(centre: Position, radiusM: number, segments = 64): Position[] {
  const plane = planeAt(centre);
  const ring: Position[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * 2 * Math.PI;
    ring.push(fromLocal(plane, [Math.cos(angle) * radiusM, Math.sin(angle) * radiusM]));
  }
  return ring;
}
