import type { Feature, Geometry } from './features.js';
import type { Position } from './geo.js';
import { anchorOf } from './measure.js';
import type { Op } from './ops.js';
import type { Course } from './schema.js';

/**
 * Putting a feature somewhere else.
 *
 * Separate from vertex editing, which reshapes one point of a line. This moves
 * the whole thing: a tee to the other side of the path, an OB boundary five
 * metres back from the road.
 *
 * ## Moving a tee drags its fairway with it
 *
 * A derived fairway needs no help — it is computed from the tee and target every
 * render, so it follows for free. A **shaped** one does not: its coordinates are
 * stored, and moving the tee without them would leave the routed line starting
 * in a field ten metres from the pad it is supposed to start at.
 *
 * So the end that belongs to the moved feature comes along. Only that end — the
 * bend in the middle is the designer's decision about where the hole goes, and a
 * tee nudged two metres should not redraw their dogleg.
 */

/** Shift every coordinate of a geometry by a delta in degrees. */
function translate(geometry: Geometry, dLng: number, dLat: number): Geometry {
  const move = ([lng, lat]: Position): Position => [lng + dLng, lat + dLat];
  return geometry.type === 'point'
    ? { type: 'point', coordinates: move(geometry.coordinates) }
    : { ...geometry, coordinates: geometry.coordinates.map(move) };
}

/**
 * The ops that keep stored fairways attached to a tee or target that has moved.
 *
 * Empty for every other kind, and for a pair whose fairway is still the straight
 * derived line.
 */
function reattachFairways(course: Course, feature: Feature, to: Position): Op[] {
  if (feature.kind !== 'tee' && feature.kind !== 'target') return [];
  const isTee = feature.kind === 'tee';

  return course.pairs.flatMap((pair) => {
    if (!pair.fairwayId) return [];
    if ((isTee ? pair.teeId : pair.targetId) !== feature.id) return [];

    const fairway = course.features.find((f) => f.id === pair.fairwayId);
    if (!fairway || fairway.geometry.type !== 'line') return [];

    const coordinates = [...fairway.geometry.coordinates];
    // The tee is the first vertex and the target the last, because that is the
    // direction `courseFairways` builds the line in.
    coordinates[isTee ? 0 : coordinates.length - 1] = to;

    return [
      {
        type: 'setGeometry' as const,
        id: fairway.id,
        geometry: { type: 'line' as const, coordinates },
      },
    ];
  });
}

/**
 * Move a feature so that its anchor lands on `to`.
 *
 * Points go exactly there. Lines and areas translate: the anchor is the first
 * vertex of a line and the vertex centroid of an area, so dragging either one
 * moves the whole shape rigidly rather than deforming it.
 *
 * Returns null when there is nothing to move. `gesture` ties a whole drag into
 * one undo entry — see the note on `Op`.
 */
export function moveFeatureTo(
  course: Course,
  featureId: string,
  to: Position,
  gesture?: string,
): Op | null {
  const feature = course.features.find((f) => f.id === featureId);
  if (!feature) return null;

  const from = anchorOf(feature);
  if (from[0] === to[0] && from[1] === to[1]) return null;

  const geometry =
    feature.geometry.type === 'point'
      ? ({ type: 'point', coordinates: to } as Geometry)
      : translate(feature.geometry, to[0] - from[0], to[1] - from[1]);

  const stamp = gesture === undefined ? {} : { gesture };
  const ops: Op[] = [
    { type: 'setGeometry', id: featureId, geometry, ...stamp },
    ...reattachFairways(course, feature, to),
  ];

  // A move with nothing following it stays a plain op rather than a batch of
  // one, so the common case does not pay for the uncommon one.
  return ops.length === 1 ? ops[0]! : { type: 'batch', ops, ...stamp };
}
