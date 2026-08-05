import { applyOp, canCoalesce, mergeRedo, type Op } from './ops.js';
import type { Course } from './schema.js';

/**
 * The document store: current course, undo/redo, and change notification.
 *
 * Framework-agnostic on purpose. React binds to it with `useSyncExternalStore`,
 * but nothing here imports React, so the model stays testable in plain Node and
 * reusable from a future CLI or export pipeline.
 */

interface UndoEntry {
  /** Applying this reverses the edit. */
  inverse: Op;
  /** Applying this re-applies it. */
  redo: Op;
  at: number;
}

export interface StoreState {
  course: Course;
  canUndo: boolean;
  canRedo: boolean;
  /** True when there are edits not yet written to storage. */
  dirty: boolean;
}

type Listener = () => void;

/** Deep history is not free, and nobody undoes 500 steps in a map editor. */
const MAX_HISTORY = 200;

export class CourseStore {
  #course: Course;
  #undo: UndoEntry[] = [];
  #redo: UndoEntry[] = [];
  #dirty = false;
  #listeners = new Set<Listener>();
  #snapshot: StoreState;

  constructor(course: Course) {
    this.#course = course;
    this.#snapshot = this.#computeSnapshot();
  }

  /**
   * Stable object identity between changes.
   *
   * `useSyncExternalStore` compares snapshots by reference and will loop
   * forever if this allocates a fresh object on every call, so the snapshot is
   * rebuilt only when something actually changes.
   */
  getSnapshot = (): StoreState => this.#snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Apply an edit. Coalesces with the previous entry when appropriate. */
  dispatch(op: Op, now = Date.now()): void {
    const { course, inverse, undoable } = applyOp(this.#course, op);
    this.#course = course;

    if (undoable) {
      const previous = this.#undo.at(-1);

      if (previous && canCoalesce(previous.redo, op, now - previous.at)) {
        // Keep the ORIGINAL inverse — it points at the value before the run of
        // edits started, which is what undo should restore. Only the redo op
        // and timestamp advance. Overwriting the inverse here would make undo
        // step back a single keystroke instead of the whole edit.
        previous.redo = mergeRedo(previous.redo, op);
        previous.at = now;
      } else {
        this.#undo.push({ inverse, redo: op, at: now });
        if (this.#undo.length > MAX_HISTORY) this.#undo.shift();
      }

      // Any new edit invalidates the redo branch.
      this.#redo = [];
      this.#dirty = true;
    } else {
      // Camera moves still need persisting, just not undoing.
      this.#dirty = true;
    }

    this.#emit();
  }

  undo(): void {
    const entry = this.#undo.pop();
    if (!entry) return;
    const { course } = applyOp(this.#course, entry.inverse);
    this.#course = course;
    this.#redo.push(entry);
    this.#dirty = true;
    this.#emit();
  }

  redo(): void {
    const entry = this.#redo.pop();
    if (!entry) return;
    const { course } = applyOp(this.#course, entry.redo);
    this.#course = course;
    this.#undo.push(entry);
    this.#dirty = true;
    this.#emit();
  }

  /**
   * Replace the document wholesale — opening a file, or restoring an autosave.
   *
   * History is cleared rather than carried over: undoing across a document
   * swap would apply ops to a course they were never derived from, which is
   * how you corrupt a file that was fine on disk.
   */
  load(course: Course): void {
    this.#course = course;
    this.#undo = [];
    this.#redo = [];
    this.#dirty = false;
    this.#emit();
  }

  /**
   * Called by the persistence layer once a write lands.
   *
   * Takes the document that was actually written, because a save is
   * asynchronous and editing does not stop while one is in flight. A write that
   * started before the last edit landed after it, and clearing `dirty` on that
   * basis is how an edit gets lost: the autosave is driven by `dirty`, so a
   * document wrongly marked clean never gets rescheduled, and the edit survives
   * only until the tab is reloaded.
   *
   * Reference equality is the right test — every op produces a new course
   * object, so an unchanged reference means nothing has happened since.
   */
  markClean(saved: Course): void {
    if (!this.#dirty || saved !== this.#course) return;
    this.#dirty = false;
    this.#emit();
  }

  #computeSnapshot(): StoreState {
    return {
      course: this.#course,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
      dirty: this.#dirty,
    };
  }

  #emit(): void {
    this.#snapshot = this.#computeSnapshot();
    for (const listener of this.#listeners) listener();
  }
}
