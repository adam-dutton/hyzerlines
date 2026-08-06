import {
  anchorOf,
  bearing,
  circleRing,
  courseFairways,
  featureIndex,
  footprintOf,
  holeLabelPosition,
  holeName,
  KIND_DEFINITIONS,
  showsCircle,
  showsFairwayAreas,
  showsFairwayLines,
  TARGET_CIRCLES,
  type Course,
  type FairwayChoices,
  type Feature,
  type HoleFairway,
} from '@hyzerlines/core';

/**
 * Geometry the document does not contain, prepared for the map.
 *
 * A tee is stored as a point, but a tee is a pad. A tee and a target imply the
 * line between them, but neither stores it. A target has circles around it that
 * exist in the rules rather than in the file. All of that is computed in
 * `@hyzerlines/core` and assembled here into one source.
 *
 * Footprints carry their feature's own `id`, so the pad is the tee as far as
 * clicking and selection are concerned. Fairway lines carry a `pair` key
 * instead: they may have no feature behind them at all until somebody bends one.
 */

export interface DerivedGeometry {
  collection: GeoJSON.FeatureCollection;
  /** Features whose point marker should be suppressed in favour of a footprint. */
  withFootprint: Set<string>;
  /** Every fairway on screen, for the vertex editor to reshape. */
  fairways: HoleFairway[];
}

/**
 * Which way a tee faces: down the first leg of its fairway.
 *
 * **Locked to the fairway, not to the target.** On a straight hole the two are
 * the same, but on a dogleg they are not, and a pad aimed at a pin the player
 * cannot see from it is aimed at the wrong thing. Players stand on the tee
 * facing the gap they are throwing into, which is the first segment.
 *
 * A bearing set explicitly on the feature still wins — `footprintOf` prefers it —
 * so this is a default that tracks the design rather than a rule that overrides
 * the designer.
 */
function fairwayBearings(fairways: readonly HoleFairway[]): Map<string, number> {
  const bearings = new Map<string, number>();
  for (const fairway of fairways) {
    const [from, to] = fairway.line;
    if (from && to) bearings.set(fairway.teeId, bearing(from, to));
  }
  return bearings;
}

/**
 * The fallback for a drop zone, or a tee with no fairway.
 *
 * The target its hole plays to. When there is nothing to aim at, `footprintOf`
 * returns null and only the point renders, which is the honest outcome — a
 * rectangle at an invented angle would look deliberate.
 */
function bearingToTarget(
  course: Course,
  feature: Feature,
  featureById: ReadonlyMap<string, Feature>,
): number | null {
  const hole = feature.holeId
    ? course.holes.find((h) => h.id === feature.holeId)
    : course.holes.find((h) => h.teeIds.includes(feature.id));
  if (!hole) return null;

  const target = hole.targetIds.map((id) => featureById.get(id)).find((f) => f !== undefined);
  return target ? bearing(anchorOf(feature), anchorOf(target)) : null;
}

export function derivedGeometry(course: Course, choices?: FairwayChoices): DerivedGeometry {
  const featureById = featureIndex(course);
  const features: GeoJSON.Feature[] = [];
  const withFootprint = new Set<string>();

  /*
   * Every fairway is computed, and only some are drawn.
   *
   * The two must not be the same list. A tee faces down the first leg of its
   * fairway and a hole's number sits at the midpoint of its shot — both remain
   * true of a hole whose corridor is switched off, and computing from the
   * filtered list would spin the pad and move the number when you hid the line
   * you were trying to see past.
   */
  const allFairways = courseFairways(course, choices);
  const teeBearings = fairwayBearings(allFairways);

  const holeById = new Map(course.holes.map((hole) => [hole.id, hole]));
  const fairways = allFairways.filter(
    (f) => f.holeId === null || (holeById.get(f.holeId)?.showFairway ?? true),
  );

  for (const feature of course.features) {
    if (!KIND_DEFINITIONS[feature.kind].placedRectangle) continue;

    const fallback =
      teeBearings.get(feature.id) ?? bearingToTarget(course, feature, featureById);
    const footprint = footprintOf(feature, fallback);
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

    /*
     * The front line: what stands in for the pad before it is legible.
     *
     * The footprint ring's own first two corners are the front-left and
     * front-right of the pad — the tee line itself — so this needs no
     * geometry of its own. It carries the same id as the footprint, which is
     * deliberate: they are two representations of one tee, cross-faded by
     * zoom in `derivedLayers`, and selecting one has to select both.
     */
    features.push({
      type: 'Feature',
      properties: { id: feature.id, kind: feature.kind, derived: 'front' },
      geometry: { type: 'LineString', coordinates: [footprint.ring[0]!, footprint.ring[1]!] },
    });
  }

  /*
   * The circles around every target.
   *
   * Drawn at their real radius on the ground rather than as a screen-space ring,
   * because the whole point of Circle 1 is that it is ten metres — a circle that
   * stayed the same size on screen while you zoomed would be decoration.
   *
   * All three provenances are carried through as a property so the interface can
   * say which is a rule and which is league convention. See TARGET_CIRCLES.
   */
  for (const feature of course.features) {
    if (feature.kind !== 'target' || feature.geometry.type !== 'point') continue;
    for (const circle of TARGET_CIRCLES) {
      if (!showsCircle(course.display, circle.id)) continue;
      const ring = circleRing(feature.geometry.coordinates, circle.radiusM);
      features.push({
        type: 'Feature',
        properties: {
          id: `${feature.id} ${circle.id}`,
          kind: 'target',
          derived: 'circle',
          circle: circle.id,
          authority: circle.authority,
        },
        geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
      });
    }
  }

  const drawLines = showsFairwayLines(course.display);
  const drawAreas = showsFairwayAreas(course.display);

  for (const fairway of fairways) {
    const pair = `${fairway.teeId} ${fairway.targetId}`;

    if (fairway.corridor && drawAreas) {
      features.push({
        type: 'Feature',
        properties: {
          id: fairway.fairwayId ?? pair,
          pair,
          kind: 'fairway',
          derived: 'corridor',
          /*
           * What clicking it should select, which is not what its `id` says.
           *
           * The id has to stay the corridor's own key so feature-state
           * highlighting finds it, but a corridor is not a thing you select —
           * it is the room hole 7's shot has, and clicking it means hole 7.
           * `hole <id>` is the same convention the hole label uses, so the
           * editor's existing selection path handles it with no branching.
           */
          ...(fairway.holeId ? { selectAs: `hole ${fairway.holeId}` } : {}),
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
    if (!drawLines) continue;
    features.push({
      type: 'Feature',
      properties: {
        id: fairway.fairwayId ?? pair,
        pair,
        kind: 'fairway',
        derived: 'centreline',
      },
      geometry: { type: 'LineString', coordinates: fairway.line },
    });
  }

  /*
   * Hole numbers, on the ground rather than in a floating list.
   *
   * A course is read as a sequence, and until now the only place that sequence
   * appeared was the left panel — so working out which shape on the map was hole
   * seven meant clicking things. The label carries the hole's id, which is what
   * makes it selectable.
   */
  const byHole = new Map(allFairways.filter((f) => f.holeId).map((f) => [f.holeId!, f]));
  for (const hole of course.holes) {
    const at = holeLabelPosition(course, hole, byHole.get(hole.id));
    if (!at) continue;
    features.push({
      type: 'Feature',
      properties: {
        id: `hole ${hole.id}`,
        holeId: hole.id,
        derived: 'holeLabel',
        number: String(hole.number),
        name: holeName(hole),
      },
      geometry: { type: 'Point', coordinates: at },
    });
  }

  return {
    collection: { type: 'FeatureCollection', features },
    withFootprint,
    fairways,
  };
}
