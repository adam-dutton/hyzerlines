import {
  anchorOf,
  bearing,
  courseCorridors,
  featureIndex,
  footprintOf,
  KIND_DEFINITIONS,
  type Course,
  type Feature,
} from '@hyzerlines/core';

/**
 * Geometry the document does not contain, prepared for the map.
 *
 * A tee is stored as a point, but a tee is a pad; a fairway is stored as a line,
 * but a fairway is ground you can land on. Both second shapes are computed in
 * `@hyzerlines/core` and assembled here into one source.
 *
 * They render **beneath** the drawn features and take no clicks. That ordering
 * is the whole point: the thing you select and drag is still the point you
 * placed, and the rectangle around it is a consequence, not a second object with
 * its own handles. A designer who could grab either would immediately want to
 * know which one is real.
 */

/**
 * Which way a tee faces, when it has not been told.
 *
 * The target its hole plays to. A tee's whole purpose is to point at something,
 * and a pad drawn at right angles to the throw would be worse than no pad — it
 * would look deliberate. When there is no target to aim at, `footprintOf`
 * returns null and only the point renders, which is the honest outcome.
 *
 * A fairway would be the better source once one is drawn — the first segment is
 * the line the designer actually intends — but it is also the thing most likely
 * to be missing, so the target is what this reaches for first.
 */
function fallbackBearing(
  course: Course,
  feature: Feature,
  featureById: ReadonlyMap<string, Feature>,
): number | null {
  const hole = feature.holeId
    ? course.holes.find((h) => h.id === feature.holeId)
    : course.holes.find((h) => h.teeIds.includes(feature.id));
  if (!hole) return null;

  const target = hole.targetIds.map((id) => featureById.get(id)).find((f) => f !== undefined);
  if (!target) return null;

  return bearing(anchorOf(feature), anchorOf(target));
}

export function derivedGeometry(course: Course): GeoJSON.FeatureCollection {
  const featureById = featureIndex(course);
  const features: GeoJSON.Feature[] = [];

  for (const feature of course.features) {
    if (!KIND_DEFINITIONS[feature.kind].placedRectangle) continue;

    const footprint = footprintOf(feature, fallbackBearing(course, feature, featureById));
    if (!footprint) continue;

    features.push({
      type: 'Feature',
      properties: { id: feature.id, kind: feature.kind, derived: 'footprint' },
      geometry: {
        type: 'Polygon',
        coordinates: [[...footprint.ring, footprint.ring[0]!]],
      },
    });
  }

  for (const corridor of courseCorridors(course).values()) {
    features.push({
      type: 'Feature',
      properties: { id: corridor.fairwayId, kind: 'fairway', derived: 'corridor' },
      geometry: {
        type: 'Polygon',
        coordinates: [[...corridor.ring, corridor.ring[0]!]],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
