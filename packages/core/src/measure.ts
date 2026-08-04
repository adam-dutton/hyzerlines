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
