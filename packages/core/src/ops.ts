import type { Course, View } from './schema.js';

/**
 * Every mutation to a course goes through an operation.
 *
 * Nothing in the app edits a Course directly. That is the whole point: a single
 * chokepoint is what makes undo, autosave, and eventually multiplayer possible
 * without touching call sites. When the Yjs question comes up at PR 8, this
 * module is the only thing that has to change.
 *
 * Ops are plain JSON so they can be logged, replayed, or sent over a wire.
 */

export type Op =
  | { type: 'setName'; name: string }
  | { type: 'setView'; view: View }
  | { type: 'setBasemap'; basemapId: string };

export interface ApplyResult {
  course: Course;
  /** The op that reverses this one. Undo is just applying it. */
  inverse: Op;
  /** Whether this belongs on the undo stack at all — see `isUndoable`. */
  undoable: boolean;
}

/**
 * Camera moves are deliberately not undoable.
 *
 * They are recorded in the document so a course reopens where you left it, but
 * a pan is not an edit. If it were undoable, ⌘Z after ten minutes of scrolling
 * would rewind the camera instead of the work — which is precisely the moment a
 * designer reaches for undo and is most alarmed to have it do the wrong thing.
 */
export function isUndoable(op: Op): boolean {
  return op.type !== 'setView';
}

/**
 * Apply an op, returning a new course and the op that undoes it.
 *
 * Pure and immutable: never mutates its input, so React sees a new reference
 * and snapshots taken elsewhere stay valid.
 */
export function applyOp(course: Course, op: Op): ApplyResult {
  const undoable = isUndoable(op);

  switch (op.type) {
    case 'setName':
      return {
        course: touch({ ...course, name: op.name }, undoable),
        inverse: { type: 'setName', name: course.name },
        undoable,
      };

    case 'setView':
      return {
        course: touch({ ...course, view: op.view }, undoable),
        inverse: { type: 'setView', view: course.view },
        undoable,
      };

    case 'setBasemap':
      return {
        course: touch({ ...course, basemapId: op.basemapId }, undoable),
        inverse: { type: 'setBasemap', basemapId: course.basemapId },
        undoable,
      };
  }
}

/**
 * `updatedAt` tracks edits, not camera drift.
 *
 * Bumping it on every pan would make "last modified" meaningless — and once
 * sync exists, would produce write conflicts from users who only looked around.
 */
function touch(course: Course, undoable: boolean): Course {
  return undoable ? { ...course, updatedAt: new Date().toISOString() } : course;
}

/**
 * Whether a new op should absorb the previous one instead of stacking on it.
 *
 * Without this, typing a course name produces one undo entry per keystroke and
 * ⌘Z becomes useless. Coalescing is by op identity plus a time window, so a
 * continuous edit collapses to one entry while a deliberate later change to the
 * same field stays separate.
 */
export const COALESCE_WINDOW_MS = 700;

export function canCoalesce(previous: Op, next: Op, msSincePrevious: number): boolean {
  if (msSincePrevious > COALESCE_WINDOW_MS) return false;
  // Only continuous edits to the same scalar field collapse. Structural changes
  // must never merge, or undo would skip past whole operations.
  return previous.type === next.type && next.type === 'setName';
}
