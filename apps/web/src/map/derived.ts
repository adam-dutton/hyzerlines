import { PATTERN_TEXT, letteringPoints } from './patterns';
import {
  alternativeShots,
  anchorOf,
  bearing,
  circleRing,
  courseFairways,
  featureIndex,
  footprintOf,
  bearingNearest,
  corridorWidthsFor,
  distance,
  fairwayCorridor,
  FAIRWAY_CORRIDOR,
  holeLabelPosition,
  holeName,
  semicircleRing,
  offsetFrom,
  KIND_DEFINITIONS,
  mandoBearingFor,
  mandoLineOf,
  showsCircle,
  showsFairwayAreas,
  showsFairwayLines,
  TARGET_CIRCLES,
  type AlternativeShot,
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

/**
 * How many rings the mandatory's shading is built from.
 *
 * A stand-in for a radial gradient, which MapLibre fills do not have. Nested
 * semicircles at one opacity each stack up densest at the flat edge and thin
 * out towards the arc, which is the falloff a gradient would give — six is
 * enough that the steps are not countable and few enough to cost nothing.
 */
const SHADE_BANDS = 6;

export interface DerivedGeometry {
  collection: GeoJSON.FeatureCollection;
  /**
   * Features whose plain point circle should be suppressed.
   *
   * Because something better is standing in for it: a pad, or a glyph. The
   * circle is the fallback for a point with no picture of its own, and drawing
   * both would be the interface claiming two objects where one was placed.
   */
  withMarker: Set<string>;
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
function fairwayBearings(
  fairways: readonly HoleFairway[],
  alternatives: readonly AlternativeShot[],
): Map<string, number> {
  const bearings = new Map<string, number>();
  /*
   * Fairways first, and an alternative never overwrites one.
   *
   * A tee that is not the shot in play still throws somewhere, and before the
   * alternatives existed it had no line to face down — it fell back to the
   * hole's *first* target, which on a hole being shown at its long pin aimed
   * every spare pad at a basket the panel was not measuring to. Now each pad
   * faces down its own shot.
   */
  for (const { teeId, line } of [...fairways, ...alternatives]) {
    if (bearings.has(teeId)) continue;
    const [from, to] = line;
    if (from && to) bearings.set(teeId, bearing(from, to));
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

export function derivedGeometry(
  course: Course,
  choices?: FairwayChoices,
  /** How far off the shot the hole numbers sit. See `holeNumberStyleSchema`. */
  offset = 0,
  /** Where a mandatory's line starts, out from the object. See `mandoLineOf`. */
  lineGap = 0,
  /** How the regulated areas are lettered. See `letteringPoints`. */
  lettering: { on: boolean; spacingM: number; angle: number } = {
    on: false,
    spacingM: 30,
    angle: 0,
  },
  /** The two shapes that are off unless the stylesheet asks for them. */
  approach: { secondCorridor: boolean; shade: boolean } = {
    secondCorridor: false,
    shade: false,
  },
): DerivedGeometry {
  const featureById = featureIndex(course);
  const features: GeoJSON.Feature[] = [];
  const withMarker = new Set<string>();

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
  const alternatives = alternativeShots(course, choices);
  const teeBearings = fairwayBearings(allFairways, alternatives);

  const holeById = new Map(course.holes.map((hole) => [hole.id, hole]));
  const shown = (fairway: HoleFairway) =>
    fairway.holeId === null || (holeById.get(fairway.holeId)?.showFairway ?? true);
  const fairways = allFairways.filter(shown);

  for (const feature of course.features) {
    if (!KIND_DEFINITIONS[feature.kind].placedRectangle) continue;
    // `footprintOf` refuses a non-point too; this is here so the glyph below
    // can read the stored coordinate without a second check.
    if (feature.geometry.type !== 'point') continue;

    const fallback =
      teeBearings.get(feature.id) ?? bearingToTarget(course, feature, featureById);
    const footprint = footprintOf(feature, fallback);
    if (!footprint) continue;

    withMarker.add(feature.id);
    features.push({
      type: 'Feature',
      properties: { id: feature.id, kind: feature.kind, derived: 'footprint' },
      geometry: {
        type: 'Polygon',
        coordinates: [[...footprint.ring, footprint.ring[0]!]],
      },
    });

    /*
     * The glyph: what stands in for the pad before it is legible.
     *
     * It replaced a line drawn along the pad's own front edge. That line was a
     * real measurement rather than an arbitrary dot, which was the argument
     * for it — but at the zooms it existed for, a two-metre edge is a few
     * pixels of hairline, and it was carrying the whole job of saying *what*
     * is there. The glyph says tee or drop zone outright, and it keeps the
     * facing the line carried by turning with the pad.
     *
     * It carries the same id as the footprint, which is deliberate: they are
     * two representations of one tee, swapped by zoom in `derivedLayers`, and
     * selecting one has to select both.
     */
    features.push({
      type: 'Feature',
      properties: {
        id: feature.id,
        kind: feature.kind,
        derived: 'marker',
        bearing: footprint.bearingDeg,
      },
      geometry: { type: 'Point', coordinates: feature.geometry.coordinates },
    });
  }

  /*
   * The letters over a regulated area.
   *
   * Generated as points so they can be drawn by a symbol layer, which stays
   * upright when the camera turns — see `letteringPoints` for why a tiled fill
   * pattern could not.
   */
  if (lettering.on) {
    for (const feature of course.features) {
      const text = PATTERN_TEXT[feature.kind];
      if (!text || feature.geometry.type !== 'polygon') continue;

      for (const at of letteringPoints(
        feature.geometry.coordinates,
        lettering.spacingM,
        lettering.angle,
      )) {
        features.push({
          type: 'Feature',
          properties: {
            id: feature.id,
            kind: feature.kind,
            derived: 'lettering',
            text,
          },
          geometry: { type: 'Point', coordinates: at },
        });
      }
    }
  }

  /*
   * The ground outside a property line.
   *
   * A polygon of the whole world with the boundary punched out of it, which is
   * what a hole in a GeoJSON ring is for. The alternative — shading the site
   * itself — is the one thing a site plan cannot do: a designer reads terrain
   * through that fill for the entire job, and every tree line and fall of
   * ground goes through it.
   *
   * The world ring stops at ±85° rather than ±90 because that is where Web
   * Mercator stops; a coordinate beyond it has no position on this map.
   */
  for (const feature of course.features) {
    if (feature.kind !== 'boundary' || feature.geometry.type !== 'polygon') continue;
    const ring = feature.geometry.coordinates;
    if (ring.length < 3) continue;

    features.push({
      type: 'Feature',
      properties: { id: feature.id, kind: 'boundary', derived: 'outside' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85],
          ],
          [...ring, ring[0]!],
        ],
      },
    });
  }

  /*
   * Mandatories: the side you must pass, and the plane you may not cross.
   *
   * Both come from the same fact — the ruling, plus which way play runs past
   * the object — so they are emitted together. A mandatory the designer has not
   * ruled on yet, or one on a hole with no shot to take a direction from, gets
   * neither: it stays a plain point, which is the honest drawing of a marker
   * nobody has decided about.
   *
   * `over` is a ruling with no line. The plane it describes is horizontal, and
   * drawn in plan it would be a mark on top of the object saying nothing about
   * where you may throw — so the glyph is withheld too, and the point stands.
   */
  for (const feature of course.features) {
    if (feature.kind !== 'mando') continue;

    if (feature.geometry.type !== 'point') continue;
    const mando = mandoLineOf(feature, mandoBearingFor(course, feature.id), lineGap);
    if (!mando) continue;

    withMarker.add(feature.id);
    features.push({
      type: 'Feature',
      properties: {
        id: feature.id,
        kind: 'mando',
        derived: 'mandoLine',
        side: mando.side,
      },
      geometry: { type: 'LineString', coordinates: mando.line },
    });
    features.push({
      type: 'Feature',
      properties: {
        id: feature.id,
        kind: 'mando',
        derived: 'marker',
        side: mando.side,
        bearing: mando.bearingDeg,
      },
      geometry: { type: 'Point', coordinates: feature.geometry.coordinates },
    });

    /*
     * The shading behind the wall: a half disc, flat edge on the line, bulging
     * the way play goes. Banded rather than a gradient, because MapLibre fills
     * have no radial gradient — see `derivedLayers`.
     */
    if (approach.shade) {
      const [from, to] = mando.line;
      const middle: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const radius = distance(from, to) / 2;

      for (let band = 0; band < SHADE_BANDS; band++) {
        const ring = semicircleRing(
          middle,
          (radius * (SHADE_BANDS - band)) / SHADE_BANDS,
          mando.bearingDeg,
        );
        features.push({
          type: 'Feature',
          properties: {
            id: `${feature.id} shade ${band}`,
            kind: 'mando',
            derived: 'mandoShade',
          },
          geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] },
        });
      }
    }

    /*
     * The arrowhead, at the far end and pointing out along the wall.
     *
     * The line says where the plane is; this says which way it faces. On a hole
     * with two mandatories a wall with no direction is one you have to work out
     * from a glyph forty pixels away.
     */
    features.push({
      type: 'Feature',
      properties: {
        id: feature.id,
        kind: 'mando',
        derived: 'mandoArrow',
        bearing: bearing(mando.line[0], mando.line[1]),
      },
      geometry: { type: 'Point', coordinates: mando.line[1] },
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

  /*
   * Every corridor is emitted, drawn or not.
   *
   * Turning fairways off is about what the map *shows* — a designer reading the
   * canopy under hole 7 does not want a translucent band over it. It was
   * silently also about what the map *answers*: with the corridor gone, the
   * ground where hole 7's shot runs stopped selecting hole 7, and the only
   * targets left were the pad, the number and a hairline. The band is still the
   * most obvious thing on screen that is hole 7, whether or not it is painted.
   *
   * So a hidden corridor is drawn at zero opacity rather than withheld.
   * `queryRenderedFeatures` still finds it, which is what makes the click work,
   * and nothing about the picture changes.
   */
  for (const fairway of allFairways) {
    const pair = `${fairway.teeId} ${fairway.targetId}`;
    const visible = shown(fairway) && drawAreas;

    if (fairway.corridor) {
      features.push({
        type: 'Feature',
        properties: {
          id: fairway.fairwayId ?? pair,
          pair,
          kind: 'fairway',
          derived: 'corridor',
          hidden: !visible,
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
    /*
     * The approach corridor: the same line, opened out to Circle 2.
     *
     * Under the first one, because it is the wider claim — how much room the
     * approach has, where the first says how much room the line has. Drawn from
     * the same centreline rather than a second geometry: they are two readings
     * of one shot, and a second line would be a second thing to keep in step.
     */
    if (approach.secondCorridor && visible && fairway.corridor) {
      const wide = fairwayCorridor(fairway.line, {
        atStart: corridorWidthsFor(
          fairway.fairwayId ? featureById.get(fairway.fairwayId) : undefined,
          featureById.get(fairway.teeId),
        ).atStart,
        atEnd: FAIRWAY_CORRIDOR.approachWidthAtTargetM,
      });
      if (wide) {
        features.push({
          type: 'Feature',
          properties: { id: `${pair} approach`, pair, kind: 'fairway', derived: 'approach' },
          geometry: { type: 'Polygon', coordinates: [[...wide.ring, wide.ring[0]!]] },
        });
      }
    }

    if (!drawLines || !shown(fairway)) continue;
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
   * The shots the hole holds and is not being drawn as.
   *
   * Without these a three-tee hole draws one corridor and nothing says the
   * other two tees throw anywhere — they are pads on the ground with no line
   * leaving them, which reads as a mistake rather than as a design. The lines
   * are what make the scorecard's extra columns legible on the map.
   *
   * Gated on the same two switches as the centreline they are alternatives to:
   * the course-wide fairway-lines setting, and the hole's own `showFairway`.
   * An aid you turned off must not come back thinner.
   */
  if (drawLines) {
    for (const shot of alternatives) {
      if (!(holeById.get(shot.holeId)?.showFairway ?? true)) continue;
      features.push({
        type: 'Feature',
        properties: {
          id: `${shot.teeId} ${shot.targetId}`,
          pair: `${shot.teeId} ${shot.targetId}`,
          kind: 'fairway',
          derived: 'alternative',
        },
        geometry: { type: 'LineString', coordinates: shot.line },
      });
    }
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
    const centre = holeLabelPosition(course, hole, byHole.get(hole.id));
    if (!centre) continue;

    /*
     * Nudged off the shot, in metres on the ground.
     *
     * The number sits at the midpoint of the corridor, which is the right place
     * and also directly on the line — so on a narrow hole it covers the thing
     * it labels. The offset moves it square to the shot, which keeps it beside
     * the same stretch of fairway however far you zoom.
     */
    const line = byHole.get(hole.id)?.line;
    const along = line ? bearingNearest(line, centre) : null;
    const at = offset === 0 || along === null ? centre : offsetFrom(centre, along + 90, offset);
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
    withMarker,
    fairways,
  };
}
