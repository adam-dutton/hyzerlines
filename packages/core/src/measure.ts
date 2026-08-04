import type { Position } from './geo.js';
import type { Feature } from './features.js';

/**
 * Distance on the ground.
 *
 * Haversine on a sphere, not Web Mercator pixel math. Mercator distances are
 * wrong by a factor of 1/cos(latitude) — about 40% at Minneapolis, 100% at
 * Anchorage — and this app's entire premise is that its numbers are true. The
 * error would be invisible: a plausible-looking wrong number.
 *
 * Everything here returns meters. Conversion happens only at display.
 */

/** IUGG mean Earth radius, meters. */
const EARTH_RADIUS = 6371008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance between two positions, in meters. */
export function distance(a: Position, b: Position): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const dφ = φ2 - φ1;
  const dλ = toRadians(lng2 - lng1);

  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  // asin form rather than atan2: better conditioned for the short distances a
  // course deals in, where the two points are never near-antipodal.
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total length along a path, in meters. */
export function pathLength(coordinates: readonly Position[]): number {
  let total = 0;
  for (let i = 1; i < coordinates.length; i++) {
    total += distance(coordinates[i - 1]!, coordinates[i]!);
  }
  return total;
}

/**
 * A representative point for any feature.
 *
 * Points are themselves; lines use their first vertex, because a fairway is
 * drawn tee-first and its start is the meaningful end. Areas use the centroid
 * of their vertices — good enough for the proximity questions asked of it, and
 * notably NOT a true area centroid, which would need the shoelace formula.
 */
export function anchorOf(feature: Feature): Position {
  const geometry = feature.geometry;
  if (geometry.type === 'point') return geometry.coordinates;
  if (geometry.type === 'line') return geometry.coordinates[0]!;

  const ring = geometry.coordinates;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return [lng / ring.length, lat / ring.length];
}

/** Length of a feature's geometry, or 0 for a point. */
export function featureLength(feature: Feature): number {
  const geometry = feature.geometry;
  if (geometry.type === 'point') return 0;
  if (geometry.type === 'line') return pathLength(geometry.coordinates);
  // Areas report perimeter, closing the implied ring.
  const ring = geometry.coordinates;
  return pathLength([...ring, ring[0]!]);
}

/**
 * Whether two paths cross.
 *
 * Plain planar segment intersection in degrees, deliberately. Over the few
 * hundred metres a fairway spans, the difference between a great-circle arc and
 * a straight line in lng/lat is far below the precision of a hand-drawn route —
 * and unlike distance, a crossing is a yes/no answer, so a metre of curvature
 * error cannot turn into a wrong number a designer would quote.
 *
 * Touching endpoints do not count: two fairways that legitimately share a
 * junction should not be reported as crossing.
 */
export function pathsCross(a: readonly Position[], b: readonly Position[]): boolean {
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      if (segmentsCross(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!)) return true;
    }
  }
  return false;
}

const cross = (o: Position, p: Position, q: Position): number =>
  (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);

function segmentsCross(p1: Position, p2: Position, p3: Position, p4: Position): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  /*
   * Each segment must have the other's endpoints strictly on opposite sides.
   *
   * A product rather than a sign comparison, because a cross product of exactly
   * zero means "on the line" — which is what a shared endpoint produces — and
   * `(d1 > 0) !== (d2 > 0)` would read that zero as the opposite side and
   * report a junction as a crossing.
   */
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Compass bearing from a to b, in degrees clockwise from north.
 *
 * Used for tee orientation and, later, for wind adjustment.
 */
export function bearing(a: Position, b: Position): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const dλ = toRadians(lng2 - lng1);

  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
