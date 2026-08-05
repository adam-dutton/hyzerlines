import { describe, expect, it } from 'vitest';

import {
  activeLayout,
  createCourse,
  parseCourse,
  DESCRIPTION_MAX,
  DOCUMENT_VERSION,
} from './schema.js';
import { applyOp, canCoalesce, isUndoable, COALESCE_WINDOW_MS, type Op } from './ops.js';
import { CourseStore } from './store.js';
import { serializeCourse, deserializeCourse, suggestedFilename } from './file.js';

describe('schema', () => {
  it('creates a valid course', () => {
    const course = createCourse();
    expect(course.version).toBe(DOCUMENT_VERSION);
    expect(course.name).toBe('Untitled course');
    expect(parseCourse(course).ok).toBe(true);
  });

  it('rejects data that is not a course', () => {
    for (const bad of [null, 42, 'nope', {}, { version: 'one' }]) {
      const result = parseCourse(bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  // A newer file must fail loudly. Silently accepting one and dropping fields
  // it doesn't understand would destroy the user's work on the next save.
  it('refuses documents from a newer format', () => {
    const future = { ...createCourse(), version: DOCUMENT_VERSION + 1 };
    const result = parseCourse(future);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer version/i);
  });

  it('reports where validation failed', () => {
    const broken = { ...createCourse(), view: { ...createCourse().view, zoom: 99 } };
    const result = parseCourse(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/view\.zoom/);
  });

  // Longitude and latitude are both plain numbers, so a transposition is
  // invisible to the type system. The schema bounds are the only guard.
  it('rejects transposed coordinates that fall outside latitude range', () => {
    const course = createCourse();
    const swapped = { ...course, view: { ...course.view, center: [39.8283, -98.5795] } };
    expect(parseCourse(swapped).ok).toBe(false);
  });

  /**
   * Every total is computed over a layout's plays, so a document without one
   * would make "what is the par" a special case everywhere it is asked.
   */
  it('gives a new course one layout, and makes it active', () => {
    const course = createCourse();
    expect(course.layouts).toHaveLength(1);
    expect(activeLayout(course)?.id).toBe(course.activeLayoutId);
  });

  /** A pointer at a layout that is gone would break every total silently. */
  it('falls back to the first layout when the active id is stale', () => {
    const course = { ...createCourse(), activeLayoutId: 'nope' };
    expect(activeLayout(course)).toBe(course.layouts[0]);
  });
});

describe('applyOp', () => {
  it('does not mutate its input', () => {
    const course = createCourse();
    const before = JSON.stringify(course);
    applyOp(course, { type: 'setName', name: 'Kaposia' });
    expect(JSON.stringify(course)).toBe(before);
  });

  it('produces an inverse that restores the prior value', () => {
    const course = createCourse({ name: 'Original' });
    const { course: next, inverse } = applyOp(course, { type: 'setName', name: 'Changed' });
    expect(next.name).toBe('Changed');
    expect(applyOp(next, inverse).course.name).toBe('Original');
  });

  it('round-trips every op type through its inverse', () => {
    const course = createCourse();
    const ops: Op[] = [
      { type: 'setName', name: 'Something else' },
      { type: 'setBasemap', basemapId: 'osm' },
      { type: 'setNotes', notes: 'Watch the pond on 7.' },
      { type: 'setView', view: { center: [-93.1, 44.9], zoom: 16, bearing: 30, pitch: 20 } },
    ];

    for (const op of ops) {
      const { course: next, inverse } = applyOp(course, op);
      const restored = applyOp(next, inverse).course;
      // updatedAt is expected to differ; everything else must come back.
      expect({ ...restored, updatedAt: '' }).toEqual({ ...course, updatedAt: '' });
    }
  });

  it('treats camera moves as not undoable', () => {
    expect(isUndoable({ type: 'setName', name: 'x' })).toBe(true);
    expect(isUndoable({ type: 'setBasemap', basemapId: 'osm' })).toBe(true);
    expect(
      isUndoable({ type: 'setView', view: createCourse().view }),
      'panning must not fill the undo stack',
    ).toBe(false);
  });

  it('does not bump updatedAt for camera moves', () => {
    const course = createCourse();
    const { course: next } = applyOp(course, {
      type: 'setView',
      view: { center: [0, 0], zoom: 10, bearing: 0, pitch: 0 },
    });
    expect(next.updatedAt).toBe(course.updatedAt);
  });
});

describe('coalescing', () => {
  it('merges rapid edits to the same field', () => {
    expect(
      canCoalesce({ type: 'setName', name: 'a' }, { type: 'setName', name: 'ab' }, 100),
    ).toBe(true);
  });

  it('does not merge across the time window', () => {
    expect(
      canCoalesce(
        { type: 'setName', name: 'a' },
        { type: 'setName', name: 'ab' },
        COALESCE_WINDOW_MS + 1,
      ),
    ).toBe(false);
  });

  it('never merges different op types', () => {
    expect(
      canCoalesce({ type: 'setName', name: 'a' }, { type: 'setBasemap', basemapId: 'osm' }, 10),
    ).toBe(false);
  });
});

describe('CourseStore', () => {
  it('starts with nothing to undo or redo', () => {
    const store = new CourseStore(createCourse());
    const s = store.getSnapshot();
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    expect(s.dirty).toBe(false);
  });

  it('returns a referentially stable snapshot between changes', () => {
    const store = new CourseStore(createCourse());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    store.dispatch({ type: 'setName', name: 'x' });
    const after = store.getSnapshot();
    expect(store.getSnapshot()).toBe(after);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const store = new CourseStore(createCourse());
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.dispatch({ type: 'setName', name: 'a' });
    expect(calls).toBe(1);
    unsubscribe();
    store.dispatch({ type: 'setName', name: 'b' });
    expect(calls).toBe(1);
  });

  it('undoes and redoes', () => {
    const store = new CourseStore(createCourse({ name: 'Start' }));
    store.dispatch({ type: 'setName', name: 'Edited' }, 1000);
    expect(store.getSnapshot().course.name).toBe('Edited');

    store.undo();
    expect(store.getSnapshot().course.name).toBe('Start');
    expect(store.getSnapshot().canRedo).toBe(true);

    store.redo();
    expect(store.getSnapshot().course.name).toBe('Edited');
  });

  /**
   * The bug this guards: when coalescing, it is tempting to overwrite the stored
   * inverse with the newest one. That makes undo step back a single keystroke
   * instead of the whole typing run — the entire point of coalescing.
   */
  it('undoes an entire typing run in one step', () => {
    const store = new CourseStore(createCourse({ name: '' }));
    let t = 1000;
    for (const name of ['K', 'Ka', 'Kap', 'Kapo', 'Kaposia']) {
      store.dispatch({ type: 'setName', name }, (t += 50));
    }
    expect(store.getSnapshot().course.name).toBe('Kaposia');

    store.undo();
    expect(store.getSnapshot().course.name).toBe('');
    expect(store.getSnapshot().canUndo).toBe(false);
  });

  it('keeps deliberate later edits as separate undo steps', () => {
    const store = new CourseStore(createCourse({ name: '' }));
    store.dispatch({ type: 'setName', name: 'First' }, 1000);
    store.dispatch({ type: 'setName', name: 'Second' }, 1000 + COALESCE_WINDOW_MS + 1);

    store.undo();
    expect(store.getSnapshot().course.name).toBe('First');
    store.undo();
    expect(store.getSnapshot().course.name).toBe('');
  });

  it('does not put camera moves on the undo stack', () => {
    const store = new CourseStore(createCourse());
    store.dispatch({
      type: 'setView',
      view: { center: [0, 0], zoom: 12, bearing: 0, pitch: 0 },
    });
    expect(store.getSnapshot().canUndo).toBe(false);
    // ...but it still needs saving.
    expect(store.getSnapshot().dirty).toBe(true);
  });

  it('drops the redo branch when a new edit arrives', () => {
    const store = new CourseStore(createCourse({ name: 'A' }));
    store.dispatch({ type: 'setName', name: 'B' }, 1000);
    store.undo();
    expect(store.getSnapshot().canRedo).toBe(true);

    store.dispatch({ type: 'setName', name: 'C' }, 5000);
    expect(store.getSnapshot().canRedo).toBe(false);
  });

  // Undoing across a document swap would apply ops to a course they were never
  // derived from — a reliable way to corrupt a file that was fine on disk.
  it('clears history when a document is loaded', () => {
    const store = new CourseStore(createCourse({ name: 'A' }));
    store.dispatch({ type: 'setName', name: 'B' }, 1000);
    store.load(createCourse({ name: 'Opened' }));

    const s = store.getSnapshot();
    expect(s.course.name).toBe('Opened');
    expect(s.canUndo).toBe(false);
    expect(s.canRedo).toBe(false);
    expect(s.dirty).toBe(false);
  });

  /*
   * Both are additive with defaults, so a version 2 document written before
   * they existed opens with them empty rather than failing to parse.
   */
  it('location and description are absent from older documents', () => {
    const { location: _l, description: _d, ...older } = createCourse();

    const parsed = parseCourse(older);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.course.location).toBe('');
    expect(parsed.course.description).toBe('');
  });

  /*
   * Truncated on write rather than refused. The op arrives a keystroke at a
   * time, and dropping the whole edit on the character that goes over reads as
   * the field having died — while letting it through would produce a document
   * the schema then refuses to parse back.
   */
  it('caps the description rather than rejecting it', () => {
    const course = createCourse();
    const tooLong = 'x'.repeat(DESCRIPTION_MAX + 50);

    const applied = applyOp(course, { type: 'setDescription', description: tooLong }).course;
    expect(applied.description).toHaveLength(DESCRIPTION_MAX);
    expect(parseCourse(applied).ok).toBe(true);
  });

  // A run of typing is one edit. Undo after naming a course should clear the
  // name, not walk back a letter at a time.
  it('coalesces a typing run in every free-text field on the course', () => {
    for (const op of [
      (v: string) => ({ type: 'setName' as const, name: v }),
      (v: string) => ({ type: 'setNotes' as const, notes: v }),
      (v: string) => ({ type: 'setLocation' as const, location: v }),
      (v: string) => ({ type: 'setDescription' as const, description: v }),
    ]) {
      expect(canCoalesce(op('a'), op('ab'), 50)).toBe(true);
    }
  });

  it('tracks dirty state across save', () => {
    const store = new CourseStore(createCourse());
    expect(store.getSnapshot().dirty).toBe(false);
    store.dispatch({ type: 'setName', name: 'x' });
    expect(store.getSnapshot().dirty).toBe(true);
    store.markClean(store.getSnapshot().course);
    expect(store.getSnapshot().dirty).toBe(false);
  });

  /*
   * A save is asynchronous and editing does not stop while one is in flight.
   * This is a real edit being lost, not a bookkeeping nicety: the autosave is
   * driven by `dirty`, so a document wrongly marked clean is never written
   * again, and the edit lives only until the tab reloads. It cost an afternoon
   * as a par override that vanished on refresh.
   */
  it('stays dirty when an edit lands while a save is in flight', () => {
    const store = new CourseStore(createCourse());
    store.dispatch({ type: 'setName', name: 'first' });
    const writing = store.getSnapshot().course; // what the save was handed

    store.dispatch({ type: 'setName', name: 'second' });
    store.markClean(writing); // the older write finally lands

    expect(store.getSnapshot().dirty).toBe(true);
  });

  it('bounds history growth', () => {
    const store = new CourseStore(createCourse({ name: '' }));
    // Spaced beyond the coalesce window so each is its own entry.
    for (let i = 0; i < 260; i++) {
      store.dispatch({ type: 'setName', name: `n${i}` }, i * (COALESCE_WINDOW_MS + 10));
    }
    let steps = 0;
    while (store.getSnapshot().canUndo && steps < 1000) {
      store.undo();
      steps++;
    }
    expect(steps).toBeLessThanOrEqual(200);
  });
});

describe('.hyzer files', () => {
  it('round-trips through serialize and deserialize', () => {
    const course = createCourse({ name: 'Kaposia Park' });
    const result = deserializeCourse(serializeCourse(course));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.course).toEqual(course);
  });

  it('reports unreadable files without throwing', () => {
    for (const bad of ['', 'not json', '{', '[]', '{"version":1}']) {
      const result = deserializeCourse(bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it('derives a filesystem-safe filename', () => {
    expect(suggestedFilename(createCourse({ name: 'Kaposia / Lower 9 (draft)' }))).toBe(
      'kaposia-lower-9-draft.hyzer',
    );
    expect(suggestedFilename(createCourse({ name: '   ' }))).toBe('course.hyzer');
    expect(suggestedFilename(createCourse({ name: '???' }))).toBe('course.hyzer');
  });

  it('stays human-readable', () => {
    // Diffable in version control and repairable by hand is the whole reason
    // this is pretty-printed JSON rather than something compact.
    const text = serializeCourse(createCourse());
    expect(text).toContain('\n  "name"');
    expect(text.endsWith('\n')).toBe(true);
  });
});
