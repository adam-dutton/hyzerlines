import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DISPLAY,
  displaySchema,
  showsCircle,
  showsFairwayAreas,
  showsFairwayLines,
} from './display.js';
import { createCourse, parseCourse } from './schema.js';
import { applyOp } from './ops.js';
import { TARGET_CIRCLES } from './pdga.js';

describe('display settings', () => {
  it('starts with every aid on', () => {
    expect(Object.values(DEFAULT_DISPLAY).every(Boolean)).toBe(true);
    expect(createCourse().display).toEqual(DEFAULT_DISPLAY);
  });

  /*
   * The whole point of a master switch. Without this, turning fairways off and
   * then back on would be two clicks that have to remember which of the two
   * children was on — the master would just be a third checkbox.
   */
  it('the master switch overrules its parts', () => {
    const off = displaySchema.parse({ fairways: false });
    expect(off.fairwayLines).toBe(true);
    expect(showsFairwayLines(off)).toBe(false);
    expect(showsFairwayAreas(off)).toBe(false);

    const linesOnly = displaySchema.parse({ fairwayAreas: false });
    expect(showsFairwayLines(linesOnly)).toBe(true);
    expect(showsFairwayAreas(linesOnly)).toBe(false);
  });

  it('has a switch for every circle the map draws', () => {
    for (const circle of TARGET_CIRCLES) {
      expect(showsCircle(DEFAULT_DISPLAY, circle.id)).toBe(true);
      expect(showsCircle(displaySchema.parse({ [circle.id]: false }), circle.id)).toBe(false);
      expect(showsCircle(displaySchema.parse({ circles: false }), circle.id)).toBe(false);
    }
  });

  /*
   * Additive, so no migration. A version-2 document written before these
   * existed has to open with everything on rather than with a blank map, which
   * is what an undefaulted field would produce.
   */
  it('is absent from older documents and defaults on', () => {
    const { display: _omitted, ...withoutDisplay } = createCourse();

    const parsed = parseCourse(withoutDisplay);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.course.display).toEqual(DEFAULT_DISPLAY);
  });

  it('sets partially and undoes wholly', () => {
    const course = createCourse();
    const applied = applyOp(course, { type: 'setDisplay', changes: { c2: false } });

    expect(applied.course.display.c2).toBe(false);
    // Untouched keys survive a partial set.
    expect(applied.course.display.c1).toBe(true);

    const undone = applyOp(applied.course, applied.inverse);
    expect(undone.course.display).toEqual(DEFAULT_DISPLAY);
  });
});
