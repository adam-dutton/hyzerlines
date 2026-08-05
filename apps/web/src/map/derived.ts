import {
  anchorOf,
  bearing,
  courseFairways,
  featureIndex,
  footprintOf,
  KIND_DEFINITIONS,
  type Course,
  type FairwayChoices,
  type Feature,
  type HoleFairway,
} from '@hyzerlines/core';

/**
 * Geometry the document does not contain, prepared for the map.
 *
 * A tee is stored as a point, but a tee is a pad. A tee and a target imply the
 * line between them, but neither stores it. All of that is computed in
 * `@hyzerlines/core` and assembled here into one source.
 *
 * Footprints carry their feature's own `id`, so the pad is the tee as far as
 * clicking and selection are concerned — the yellow dot underneath it is
 * suppressed, because a point and a rectangle both representing one tee is the
 * interface claiming two objects where the designer placed one.
 *
 * Fairway lines carry a `pair` key instead: they may have no feature behind them
 * at all until somebody bends one.
 */

export interface DerivedGeometry {
  collection: GeoJSON.FeatureCollection;
  /** Features whose point marker should be suppressed in favour of a footprint. */
  withFootprint: Set<string>;
  /** Every fairway on screen, for the vertex editor to reshape. */
  fairways: HoleFairway[];
}

/**
 * Which way a tee faces, when it has not been told.
 *
 * The target its hole plays to. A tee's whole purpose is to point at something,
 * and a pad drawn at right angles to the throw would be worse than no pad — it
 * would look deliberate. When there is no target to aim at, `footprintOf`
 * returns null and only the point renders, which is the honest outcome.
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

export function derivedGeometry(course: Course, choices?: FairwayChoices): DerivedGeometry {
  const featureById = featureIndex(course);
  const features: GeoJSON.Feature[] = [];
  const withFootprint = new Set<string>();

  for (const feature of course.features) {
    if (!KIND_DEFINITIONS[feature.kind].placedRectangle) continue;

    const footprint = footprintOf(feature, fallbackBearing(course, feature, featureById));
    if (!footprint) continue;

    withFootprint.add(feature.id);
    features.push({
      type: 'Feature',
      properties: { id: feature.id, kind: feature.kind, derived: 'footprint' },
      geometry: {
        type: 'Polygon',
        coordinates: [[...footprint.ring, footprint.ring[0]!]],
      },
    });
  }

  const fairways = courseFairways(course, choices);

  for (const fairway of fairways) {
    const pair = `${fairway.teeId} ${fairway.targetId}`;

    if (fairway.corridor) {
      features.push({
        type: 'Feature',
        properties: {
          id: fairway.fairwayId ?? pair,
          pair,
          kind: 'fairway',
          derived: 'corridor',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[...fairway.corridor.ring, fairway.corridor.ring[0]!]],
        },
      });
    }

    /*
     * The centreline is drawn as well as the corridor.
     *
     * The corridor says how much room the shot has; the line says where the
     * shot goes. On a wide corridor over broken canopy the fill alone does not
     * read as a direction, and the line is also what carries the vertex handles.
     */
    features.push({
      type: 'Feature',
      properties: {
        id: fairway.fairwayId ?? pair,
        pair,
        kind: 'fairway',
        derived: 'centreline',
        // Straight lines are drawn more quietly than shaped ones: one is a
        // consequence of where the tee and pin are, the other is a decision.
        shaped: fairway.fairwayId !== null,
      },
      geometry: { type: 'LineString', coordinates: fairway.line },
    });
  }

  return {
    collection: { type: 'FeatureCollection', features },
    withFootprint,
    fairways,
  };
}
