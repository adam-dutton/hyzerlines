import type { Feature } from './features.js';
import type { Hole } from './holes.js';
import type { Op } from './ops.js';
import type { Course } from './schema.js';

/**
 * Which hole a tee or target belongs to.
 *
 * ## Two fields, one fact
 *
 * A hole lists its `teeIds` and `targetIds`; a feature carries a `holeId`. For
 * tees and targets those say the same thing, and **the hole's arrays are
 * authoritative** — pairs, layouts, par and every design check read them, and
 * `holeId` exists so that scoped queries work the same way for a tee as they do
 * for an OB line.
 *
 * Two fields that can disagree is normally a bug waiting to happen. What makes
 * it safe here is that nothing writes one without the other: every move goes
 * through `assignToHole`, which emits a single batch. Order matters too —
 * removing from the old hole before adding to the new one, so a feature dragged
 * back to where it started does not end up listed twice.
 */

/** Which of a hole's two lists a feature belongs in, or null if neither. */
function listFor(feature: Feature): 'teeIds' | 'targetIds' | null {
  if (feature.kind === 'tee') return 'teeIds';
  if (feature.kind === 'target') return 'targetIds';
  return null;
}

/** The hole a tee or target is currently assigned to, if any. */
export function holeOf(course: Course, featureId: string): Hole | undefined {
  return course.holes.find(
    (hole) => hole.teeIds.includes(featureId) || hole.targetIds.includes(featureId),
  );
}

/**
 * Move a tee or target into a hole, or out of every hole.
 *
 * Returns null when there is nothing to do — the feature is already there, or
 * it is a kind that holes do not list. Returning null rather than an empty
 * batch keeps a no-op off the undo stack entirely, so ⌘Z after re-picking the
 * hole a tee is already in does not swallow the edit before it.
 *
 * Assignment does **not** touch pairs. A par override on a tee that has moved to
 * another hole is still that shot's par, and the pair is still measurable; the
 * structural checks will say if the result no longer makes sense. Quietly
 * deleting a number the designer set is the worse failure.
 */
export function assignToHole(
  course: Course,
  featureId: string,
  holeId: string | null,
): Op | null {
  const feature = course.features.find((f) => f.id === featureId);
  if (!feature) return null;

  const list = listFor(feature);
  if (!list) return null;

  const current = holeOf(course, featureId);
  if ((current?.id ?? null) === holeId) return null;

  const ops: Op[] = [];

  if (current) {
    ops.push({
      type: 'updateHole',
      id: current.id,
      changes: {
        teeIds: current.teeIds.filter((id) => id !== featureId),
        targetIds: current.targetIds.filter((id) => id !== featureId),
      },
    });
  }

  const destination = holeId ? course.holes.find((h) => h.id === holeId) : undefined;
  if (destination) {
    ops.push({
      type: 'updateHole',
      id: destination.id,
      changes: { [list]: [...destination[list], featureId] },
    });
  }

  // Kept in step with the arrays — see the note at the top of this file.
  ops.push({ type: 'setFeatureHole', id: featureId, holeId: destination?.id ?? null });

  return { type: 'batch', ops };
}

/**
 * Reorder a hole's tees or targets.
 *
 * Not cosmetic: the first tee and first target are the hole's representative
 * pair until a layout routes it, which decides what the scorecard prints and
 * what the fairway is drawn between. "Make this the main tee" is therefore a
 * real editing action, and it is this.
 */
export function moveToFront(
  course: Course,
  featureId: string,
  list: 'teeIds' | 'targetIds',
): Op | null {
  const hole = holeOf(course, featureId);
  if (!hole || !hole[list].includes(featureId)) return null;
  if (hole[list][0] === featureId) return null;

  return {
    type: 'updateHole',
    id: hole.id,
    changes: { [list]: [featureId, ...hole[list].filter((id) => id !== featureId)] },
  };
}
