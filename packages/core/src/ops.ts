import type { Course } from './schema.js';
import type { View } from './geo.js';
import type { Feature, Geometry } from './features.js';
import type { Hole } from './holes.js';
import type { Pair } from './pairs.js';
import type { Layout } from './layouts.js';

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
  | { type: 'setNotes'; notes: string }
  | { type: 'addFeature'; feature: Feature }
  | { type: 'removeFeature'; id: string }
  /**
   * `gesture` ties a continuous pointer drag together.
   *
   * Without it, coalescing is purely time-based, so a drag that stalls for more
   * than `COALESCE_WINDOW_MS` — a slow frame, a loaded machine — splits into two
   * undo entries mid-gesture. A drag has a definite start and end and the editor
   * knows both, so it says so rather than leaving undo to infer it from timing.
   */
  | { type: 'setGeometry'; id: string; geometry: Geometry; gesture?: string }
  | { type: 'setLabel'; id: string; label: string }
  | { type: 'setProp'; id: string; key: string; value: string | number | boolean | undefined }
  | { type: 'setTags'; id: string; tags: string[] }
  | { type: 'setFeatureHole'; id: string; holeId: string | null }
  | { type: 'addHole'; hole: Hole }
  | { type: 'removeHole'; id: string }
  | { type: 'updateHole'; id: string; changes: Partial<Omit<Hole, 'id'>> }
  /**
   * Upsert, because pairs are sparse.
   *
   * A pair has no record until it carries something, so "set the par on this
   * tee-and-target" has to be able to create the record — and the inverse of
   * creating one is removing it, not setting it back to empty.
   */
  | { type: 'setPair'; pair: Pair }
  | { type: 'removePair'; id: string }
  | { type: 'addLayout'; layout: Layout }
  | { type: 'removeLayout'; id: string }
  | { type: 'updateLayout'; id: string; changes: Partial<Omit<Layout, 'id'>> }
  | { type: 'setActiveLayout'; id: string | null }
  | { type: 'setDismissed'; ruleIds: string[] }
  /**
   * Several edits that are one action.
   *
   * Moving a tee from hole 3 to hole 4 is two `updateHole`s, and bending a
   * fairway for the first time is an `addFeature` plus a `setPair`. Dispatching
   * those separately would put each half on the undo stack alone, so one ⌘Z
   * would leave the document in a state the designer never asked for — a tee in
   * neither hole, or a pair pointing at a feature that no longer exists.
   *
   * Applied in order; the inverse is the inverses in reverse.
   */
  | { type: 'batch'; ops: Op[]; gesture?: string };

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
  // A batch is undoable if any part of it is — a batch that also moved the
  // camera should still be reversible for the edit it carried.
  if (op.type === 'batch') return op.ops.some(isUndoable);
  return op.type !== 'setView' && op.type !== 'setActiveLayout';
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
    /*
     * Each step is applied to the result of the last, so a batch can build on
     * itself — add a feature, then reference it.
     *
     * `touch` is left to the individual ops rather than applied again here;
     * running it twice would be harmless but the batch is not itself an edit.
     */
    case 'batch': {
      let next = course;
      const inverses: Op[] = [];
      for (const step of op.ops) {
        const applied = applyOp(next, step);
        next = applied.course;
        inverses.push(applied.inverse);
      }
      return { course: next, inverse: { type: 'batch', ops: inverses.reverse() }, undoable };
    }

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

    case 'setNotes':
      return result(
        { ...course, notes: op.notes },
        { type: 'setNotes', notes: course.notes },
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
        // The inverse carries no gesture: undoing is not part of the drag, and
        // a stamped inverse would coalesce into whatever gesture came next.
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

    case 'setTags': {
      const existing = course.features.find((f) => f.id === op.id);
      if (!existing) return noop(course, op);
      return result(
        mapFeature(course, op.id, (f) => ({ ...f, tags: op.tags })),
        { type: 'setTags', id: op.id, tags: existing.tags },
        undoable,
      );
    }

    /*
     * Re-scoping between course level and a hole is a field edit, which is the
     * whole reason scope is a property rather than a second collection.
     */
    case 'setFeatureHole': {
      const existing = course.features.find((f) => f.id === op.id);
      if (!existing) return noop(course, op);
      return result(
        mapFeature(course, op.id, (f) => ({ ...f, holeId: op.holeId })),
        { type: 'setFeatureHole', id: op.id, holeId: existing.holeId },
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

    /*
     * An upsert, because pairs are sparse.
     *
     * The inverse of creating a pair is removing it, not blanking it — a pair
     * that exists with nothing in it would be a record the document has no
     * reason to carry, and it would come back on every undo.
     */
    case 'setPair': {
      const existing = course.pairs.find(
        (p) => p.teeId === op.pair.teeId && p.targetId === op.pair.targetId,
      );
      return result(
        {
          ...course,
          pairs: existing
            ? course.pairs.map((p) => (p.id === existing.id ? op.pair : p))
            : [...course.pairs, op.pair],
        },
        existing ? { type: 'setPair', pair: existing } : { type: 'removePair', id: op.pair.id },
        undoable,
      );
    }

    case 'removePair': {
      const existing = course.pairs.find((p) => p.id === op.id);
      if (!existing) return noop(course, op);
      return result(
        { ...course, pairs: course.pairs.filter((p) => p.id !== op.id) },
        { type: 'setPair', pair: existing },
        undoable,
      );
    }

    case 'addLayout':
      return result(
        { ...course, layouts: [...course.layouts, op.layout] },
        { type: 'removeLayout', id: op.layout.id },
        undoable,
      );

    case 'removeLayout': {
      const existing = course.layouts.find((l) => l.id === op.id);
      if (!existing) return noop(course, op);
      const remaining = course.layouts.filter((l) => l.id !== op.id);
      return result(
        {
          ...course,
          layouts: remaining,
          // Never leave the document pointing at a layout that is gone.
          activeLayoutId:
            course.activeLayoutId === op.id
              ? (remaining[0]?.id ?? null)
              : course.activeLayoutId,
        },
        { type: 'addLayout', layout: existing },
        undoable,
      );
    }

    case 'updateLayout': {
      const existing = course.layouts.find((l) => l.id === op.id);
      if (!existing) return noop(course, op);
      const inverseChanges: Partial<Omit<Layout, 'id'>> = {};
      for (const key of Object.keys(op.changes) as (keyof Omit<Layout, 'id'>)[]) {
        (inverseChanges as Record<string, unknown>)[key] = existing[key];
      }
      return result(
        {
          ...course,
          layouts: course.layouts.map((l) => (l.id === op.id ? { ...l, ...op.changes } : l)),
        },
        { type: 'updateLayout', id: op.id, changes: inverseChanges },
        undoable,
      );
    }

    /*
     * Not undoable, for the same reason the camera is not: switching layouts is
     * looking at the course a different way, not changing it. Undo after a
     * switch should take back your last edit, not put the view back.
     */
    case 'setActiveLayout':
      return result(
        { ...course, activeLayoutId: op.id },
        { type: 'setActiveLayout', id: course.activeLayoutId },
        undoable,
      );

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
  /*
   * One gesture is one entry, however long it took.
   *
   * Checked before the time window, which is the whole point: the window is a
   * heuristic for "these edits felt like one action", and a drag does not need
   * to be guessed at.
   */
  const gesture = gestureOf(next);
  if (gesture !== undefined && gestureOf(previous) === gesture) return true;

  if (msSincePrevious > COALESCE_WINDOW_MS) return false;

  /*
   * An edit to a feature the previous op just created is part of that op.
   *
   * Bending a fairway for the first time is one gesture that produces two
   * different ops: a batch that materialises the feature and attaches it to its
   * pair, then a run of geometry updates as the pointer moves. Without this they
   * land as two undo entries, and one ⌘Z takes back the bend while leaving
   * behind a fairway the designer never asked to create.
   */
  if (next.type === 'setGeometry' && previous.type === 'batch') {
    return previous.ops.some((op) => op.type === 'addFeature' && op.feature.id === next.id);
  }

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

const gestureOf = (op: Op): string | undefined =>
  op.type === 'setGeometry' || op.type === 'batch' ? op.gesture : undefined;

/**
 * The op that redoes a coalesced run.
 *
 * For a run of same-type edits the latest one says everything: redoing a name
 * you typed means applying the final name. A batch is different — it created
 * something the later ops depend on, so replaying only the latest would apply a
 * geometry change to a feature that redo has not brought back yet, and the whole
 * edit would silently vanish.
 *
 * So a batch keeps its steps and absorbs the new op, replacing the tail when the
 * tail already targets the same thing. That last part is what keeps a
 * three-second drag from accumulating one op per frame.
 */
export function mergeRedo(previous: Op, next: Op): Op {
  if (previous.type !== 'batch') return next;

  const ops = [...previous.ops];
  const last = ops[ops.length - 1];
  const sameTarget =
    last !== undefined &&
    last.type === next.type &&
    'id' in last &&
    'id' in next &&
    last.id === next.id;

  if (sameTarget) ops[ops.length - 1] = next;
  else ops.push(next);

  /*
   * The gesture stamp is carried over.
   *
   * Dropping it would end the gesture at the first merge: the next op would find
   * an unstamped previous entry, fall back to the time window, and split the
   * drag in two the moment a frame ran long.
   */
  return {
    type: 'batch',
    ops,
    ...(previous.gesture === undefined ? {} : { gesture: previous.gesture }),
  };
}
