import { describe, expect, it } from 'vitest';

import { createCourse } from './schema.js';
import { createFeature } from './features.js';
import { isUndoable } from './ops.js';
import { CourseStore } from './store.js';

/**
 * Seeded values, and why they are not edits.
 *
 * The bug: the location field is filled in by reverse-geocoding the first thing
 * you draw, and the answer comes back a second or two later. That put an op the
 * designer never made on top of the one they did — so ⌘Z after drawing took
 * back an invisible field and left the drawing on the map. CI caught it and a
 * local run never did, because the geocoder was unreachable in the sandbox.
 */
describe('seeded ops', () => {
  it('keeps a seeded location off the undo stack', () => {
    expect(isUndoable({ type: 'setLocation', location: 'Denver, CO', seeded: true })).toBe(
      false,
    );
  });

  /* A designer typing in the same field is a real edit and must stay undoable. */
  it('leaves a typed location undoable', () => {
    expect(isUndoable({ type: 'setLocation', location: 'Denver, CO' })).toBe(true);
    expect(isUndoable({ type: 'setLocation', location: 'Denver, CO', seeded: false })).toBe(
      true,
    );
  });

  /*
   * The whole point, at the level the bug happened: one undo after drawing
   * takes back the drawing, whatever the geocoder did in between.
   */
  it('undoes the drawing, not the seed that landed after it', () => {
    const store = new CourseStore(createCourse());
    const feature = createFeature('target', { type: 'point', coordinates: [-93.1, 44.9] });

    store.dispatch({ type: 'addFeature', feature });
    store.dispatch({ type: 'setLocation', location: 'Denver, CO', seeded: true });

    store.undo();

    expect(store.getSnapshot().course.features).toHaveLength(0);
    // And the seeded value stands: undoing a drawing is not a reason to throw
    // away a name the app worked out.
    expect(store.getSnapshot().course.location).toBe('Denver, CO');
    expect(store.getSnapshot().canUndo).toBe(false);
  });
});
