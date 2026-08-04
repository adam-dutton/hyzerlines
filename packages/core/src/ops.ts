import type { Course } from './schema.js';
import type { View } from './geo.js';
import type { Feature, Geometry } from './features.js';
import type { Hole } from './holes.js';
import type { SkillLevel } from './pdga.js';

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
  | { type: 'setBasemap'; basemapId: string }
  | { type: 'setSkillLevel'; skillLevel: SkillLevel }
  | { type: 'addFeature'; feature: Feature }
  | { type: 'removeFeature'; id: string }
  | { type: 'setGeometry'; id: string; geometry: Geometry }
  | { type: 'setLabel'; id: string; label: string }
  | { type: 'setProp'; id: string; key: string; value: string | number | boolean | undefined }
  | { type: 'addHole'; hole: Hole }
  | { type: 'removeHole'; id: string }
  | { type: 'updateHole'; id: string; changes: Partial<Omit<Hole, 'id'>> }
  | { type: 'setDismissed'; ruleIds: string[] };

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
 *
 * Ops that target a feature that no longer exists are no-ops rather than
 * errors. That case is reachable normally — an inspector edit can race a
 * deletion — and throwing would take down the session over a stale reference.
 */
export function applyOp(course: Course, op: Op): ApplyResult {
  const undoable = isUndoable(op);

  switch (op.type) {
    case 'setName':
      return result(
        { ...course, name: op.name },
        { type: 'setName', name: course.name },
        undoable,
      );

    case 'setView':
      return result(
        { ...course, view: op.view },
        { type: 'setView', view: course.view },
        undoable,
      );

    case 'setBasemap':
      return result(
        { ...course, basemapId: op.basemapId },
        { type: 'setBasemap', basemapId: course.basemapId },
        undoable,
      );

    /*
     * Undoable, unlike the camera. Changing the skill level re-pars every hole
     * that has no override, which is a substantial and easily-mistaken edit —
     * exactly the kind of thing ⌘Z should take back.
     */
    case 'setSkillLevel':
      return result(
        { ...course, skillLevel: op.skillLevel },
        { type: 'setSkillLevel', skillLevel: course.skillLevel },
        undoable,
      );

    case 'addFeature':
      return result(
        { ...course, features: [...course.features, op.feature] },
        { type: 'removeFeature', id: op.feature.id },
        undoable,
      );

    case 'removeFeature': {
      const existing = course.features.find((f) => f.id === op.id);
      if (!existing) return noop(course, op);
      return result(
        { ...course, features: course.features.filter((f) => f.id !== op.id) },
        // Restores the whole feature, so undoing a delete brings back its
        // properties and label rather than a bare shape.
        //
        // Hole references are deliberately NOT cleaned up here. Undo would
        // have to restore them, which means the inverse op would need to carry
        // the entire holes array — and a delete that silently rewrites unrelated
        // parts of the document is the kind of op that makes undo untrustworthy.
        // The dangling reference is instead surfaced as a structural finding,
        // where the designer can see it and decide.
        { type: 'addFeature', feature: existing },
        undoable,
      );
    }

    case 'setGeometry': {
      const existing = course.features.find((f) => f.id === op.id);
      if (!existing) return noop(course, op);
      return result(
        mapFeature(course, op.id, (f) => ({ ...f, geometry: op.geometry })),
        { type: 'setGeometry', id: op.id, geometry: existing.geometry },
        undoable,
      );
    }

    case 'setLabel': {
      const existing = course.features.find((f) => f.id === op.id);
      if (!existing) return noop(course, op);
      return result(
        mapFeature(course, op.id, (f) => ({ ...f, label: op.label })),
        { type: 'setLabel', id: op.id, label: existing.label },
        undoable,
      );
    }

    case 'addHole':
      return result(
        { ...course, holes: [...course.holes, op.hole] },
        { type: 'removeHole', id: op.hole.id },
        undoable,
      );

    case 'removeHole': {
      const existing = course.holes.find((h) => h.id === op.id);
      if (!existing) return noop(course, op);
      return result(
        { ...course, holes: course.holes.filter((h) => h.id !== op.id) },
        // Restores the whole hole, so undoing brings back its assignments.
        { type: 'addHole', hole: existing },
        undoable,
      );
    }

    case 'updateHole': {
      const existing = course.holes.find((h) => h.id === op.id);
      if (!existing) return noop(course, op);
      // The inverse captures only the keys that changed, so undo restores
      // exactly what this op touched rather than the whole hole.
      const inverseChanges: Partial<Omit<Hole, 'id'>> = {};
      for (const key of Object.keys(op.changes) as (keyof Omit<Hole, 'id'>)[]) {
        (inverseChanges as Record<string, unknown>)[key] = existing[key];
      }
      return result(
        {
          ...course,
          holes: course.holes.map((h) => (h.id === op.id ? { ...h, ...op.changes } : h)),
        },
        { type: 'updateHole', id: op.id, changes: inverseChanges },
        undoable,
      );
    }

    case 'setDismissed':
      return result(
        { ...course, dismissedRules: op.ruleIds },
        { type: 'setDismissed', ruleIds: course.dismissedRules },
        undoable,
      );

    case 'setProp': {
      const existing = course.features.find((f) => f.id === op.id);
      if (!existing) return noop(course, op);
      const previous = existing.props[op.key];
      return result(
        mapFeature(course, op.id, (f) => {
          const props = { ...f.props };
          // undefined clears rather than storing a hole, so a cleared field
          // round-trips through JSON as an absent key instead of null.
          if (op.value === undefined) delete props[op.key];
          else props[op.key] = op.value;
          return { ...f, props };
        }),
        { type: 'setProp', id: op.id, key: op.key, value: previous },
        undoable,
      );
    }
  }
}

function mapFeature(course: Course, id: string, fn: (f: Feature) => Feature): Course {
  return { ...course, features: course.features.map((f) => (f.id === id ? fn(f) : f)) };
}

function result(course: Course, inverse: Op, undoable: boolean): ApplyResult {
  return { course: touch(course, undoable), inverse, undoable };
}

/** A no-op still returns an inverse, so callers never special-case it. */
function noop(course: Course, op: Op): ApplyResult {
  return { course, inverse: op, undoable: false };
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
 * Without this, typing a name produces one undo entry per keystroke and ⌘Z
 * becomes useless — and dragging a vertex would produce one per frame.
 * Coalescing is by op identity plus a time window, so a continuous edit
 * collapses to one entry while a deliberate later change stays separate.
 */
export const COALESCE_WINDOW_MS = 700;

export function canCoalesce(previous: Op, next: Op, msSincePrevious: number): boolean {
  if (msSincePrevious > COALESCE_WINDOW_MS) return false;
  if (previous.type !== next.type) return false;

  switch (next.type) {
    case 'setName':
      return true;
    // Same field on the same feature only. Merging edits to two different
    // features, or two different fields, would make undo skip whole changes.
    case 'setLabel':
      return previous.type === 'setLabel' && previous.id === next.id;
    case 'setGeometry':
      return previous.type === 'setGeometry' && previous.id === next.id;
    case 'setProp':
      return (
        previous.type === 'setProp' && previous.id === next.id && previous.key === next.key
      );
    default:
      // Structural changes never merge — undo must step over each one.
      return false;
  }
}
