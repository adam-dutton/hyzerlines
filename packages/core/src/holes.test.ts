import { describe, expect, it } from 'vitest';

import { createCourse } from './schema.js';
import { createFeature, type Geometry } from './features.js';
import { applyOp, type Op } from './ops.js';
import { CourseStore } from './store.js';
import { bearing, boundsOf, distance, pathLength, pathsCross } from './measure.js';
import type { Position } from './geo.js';
import { createHole, holeName, pairingsOf } from './holes.js';
import { checkCourse, PDGA_RULES } from './rules.js';
import { shapeFairway } from './pairView.js';
import { serializeCourse, deserializeCourse } from './file.js';

const pt = (lng: number, lat: number): Geometry => ({ type: 'point', coordinates: [lng, lat] });

describe('measure', () => {
  /**
   * Anchored to a published reference rather than to our own output, so this
   * catches a wrong formula rather than merely a changed one.
   *
   * One degree of latitude is ~111.19 km on a sphere of the radius we use.
   */
  it('matches known great-circle distances', () => {
    expect(distance([0, 0], [0, 1])).toBeCloseTo(111195, -2);
    // A degree of longitude shrinks with the cosine of latitude.
    expect(distance([0, 60], [1, 60])).toBeCloseTo(111195 * Math.cos((60 * Math.PI) / 180), -2);
  });

  /**
   * The failure this guards against is using Web Mercator pixel math, which
   * overstates distance by 1/cos(latitude) — ~40% at Minneapolis. It would
   * produce a plausible-looking wrong number, which is the worst kind.
   */
  it('does not scale distance with latitude for equal ground separation', () => {
    const atEquator = distance([0, 0], [0, 0.001]);
    const atMinneapolis = distance([-93.1, 44.9], [-93.1, 44.901]);
    expect(atMinneapolis).toBeCloseTo(atEquator, 0);
  });

  it('is symmetric and zero for identical points', () => {
    expect(distance([-93.1, 44.9], [-93.1, 44.9])).toBe(0);
    expect(distance([-93.1, 44.9], [-93.2, 45])).toBeCloseTo(
      distance([-93.2, 45], [-93.1, 44.9]),
      6,
    );
  });

  it('sums path segments', () => {
    const a: [number, number] = [-93.1, 44.9];
    const b: [number, number] = [-93.1, 44.91];
    const c: [number, number] = [-93.11, 44.91];
    expect(pathLength([a, b, c])).toBeCloseTo(distance(a, b) + distance(b, c), 6);
    expect(pathLength([a])).toBe(0);
  });

  it('reports compass bearings', () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0, 1); // north
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90, 1); // east
    expect(bearing([0, 1], [0, 0])).toBeCloseTo(180, 1); // south
  });

  describe('bounds', () => {
    it('has no bounds for nothing', () => {
      expect(boundsOf([])).toBeNull();
    });

    it('covers every vertex of every geometry, not just anchors', () => {
      const tee = createFeature('tee', pt(-93.1, 44.9));
      const fairway = createFeature('fairway', {
        type: 'line',
        coordinates: [
          [-93.1, 44.9],
          [-93.05, 44.95],
          [-93.12, 44.88],
        ],
      });
      const ob = createFeature('ob', {
        type: 'polygon',
        coordinates: [
          [-93.2, 44.85],
          [-93.19, 44.86],
          [-93.2, 44.86],
        ],
      });

      // The westmost and southmost points live inside the line and the
      // polygon, not on the tee — bounding by anchors alone would clip them.
      expect(boundsOf([tee, fairway, ob])).toEqual([-93.2, 44.85, -93.05, 44.95]);
    });

    it('gives a single point a zero-size box rather than nothing', () => {
      const basket = createFeature('target', pt(-93.1, 44.9));
      expect(boundsOf([basket])).toEqual([-93.1, 44.9, -93.1, 44.9]);
    });
  });

  describe('path crossing', () => {
    const horizontal: Position[] = [
      [0, 0],
      [10, 0],
    ];

    it('detects a plain X', () => {
      expect(
        pathsCross(horizontal, [
          [5, -5],
          [5, 5],
        ]),
      ).toBe(true);
    });

    it('leaves parallel and merely nearby paths alone', () => {
      expect(
        pathsCross(horizontal, [
          [0, 1],
          [10, 1],
        ]),
      ).toBe(false);
      // Stops just short.
      expect(
        pathsCross(horizontal, [
          [5, 1],
          [5, 0.001],
        ]),
      ).toBe(false);
    });

    /**
     * Two routes that legitimately meet at a junction are not crossing, and
     * reporting them as such would make the check noise on any course with a
     * shared landing area.
     */
    it('does not count paths that only touch at an endpoint', () => {
      expect(
        pathsCross(horizontal, [
          [10, 0],
          [10, 5],
        ]),
      ).toBe(false);
    });

    it('checks every segment pair, not just the first', () => {
      const dogleg: Position[] = [
        [0, -5],
        [9, -5],
        [9, 5],
      ];
      expect(pathsCross(horizontal, dogleg)).toBe(true);
    });
  });
});

describe('hole ops', () => {
  it('round-trips through inverses', () => {
    const base = createCourse();
    const hole = createHole(1);
    const withHole = applyOp(base, { type: 'addHole', hole }).course;

    const ops: Op[] = [
      { type: 'addHole', hole: createHole(2) },
      { type: 'removeHole', id: hole.id },
      { type: 'updateHole', id: hole.id, changes: { number: 7, name: 'Signature' } },
      { type: 'setDismissed', ruleIds: ['structural.hole-missing-tee'] },
    ];

    for (const op of ops) {
      const { course: next, inverse } = applyOp(withHole, op);
      const restored = applyOp(next, inverse).course;
      expect({ ...restored, updatedAt: '' }, op.type).toEqual({ ...withHole, updatedAt: '' });
    }
  });

  // The inverse captures only the keys that changed, so undo restores exactly
  // what the op touched rather than clobbering unrelated edits.
  it('undoes a partial hole update without touching other fields', () => {
    const hole = createHole(1, { name: 'Original', notes: 'Blind tee shot' });
    const course = applyOp(createCourse(), { type: 'addHole', hole }).course;

    const { course: renamed, inverse } = applyOp(course, {
      type: 'updateHole',
      id: hole.id,
      changes: { name: 'Renamed' },
    });
    expect(renamed.holes[0]?.name).toBe('Renamed');
    expect(renamed.holes[0]?.notes).toBe('Blind tee shot');

    const undone = applyOp(renamed, inverse).course;
    expect(undone.holes[0]?.name).toBe('Original');
    expect(undone.holes[0]?.notes).toBe('Blind tee shot');
  });

  it('puts hole edits on the undo stack', () => {
    const store = new CourseStore(createCourse());
    store.dispatch({ type: 'addHole', hole: createHole(1) }, 1000);
    expect(store.getSnapshot().course.holes).toHaveLength(1);
    store.undo();
    expect(store.getSnapshot().course.holes).toHaveLength(0);
  });

  it('survives a file round trip', () => {
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    course = applyOp(course, { type: 'addFeature', feature: tee }).course;
    course = applyOp(course, {
      type: 'addHole',
      hole: createHole(1, { teeIds: [tee.id] }),
    }).course;

    const result = deserializeCourse(serializeCourse(course));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.holes).toHaveLength(1);
      expect(result.course.holes[0]?.teeIds).toEqual([tee.id]);
    }
  });

  it('names holes by number when unnamed', () => {
    expect(holeName(createHole(7))).toBe('Hole 7');
    expect(holeName(createHole(7, { name: 'The Chute' }))).toBe('The Chute');
  });

  /**
   * Two tees and three pins is six different shots, and the app has to be able
   * to offer all of them — this is the list the pair picker is built from.
   */
  it('enumerates every tee and target combination', () => {
    const hole = createHole(1, { teeIds: ['t1', 't2'], targetIds: ['a', 'b', 'c'] });
    expect(pairingsOf(hole)).toHaveLength(6);
    expect(pairingsOf(hole)[0]).toEqual({ teeId: 't1', targetId: 'a' });

    // A hole missing either end has no pairings at all, rather than a partial
    // list that would measure against nothing.
    expect(pairingsOf(createHole(2, { teeIds: ['t1'] }))).toEqual([]);
  });
});

describe('design checks', () => {
  it('reports a hole with no tee or basket', () => {
    const course = applyOp(createCourse(), { type: 'addHole', hole: createHole(1) }).course;
    const findings = checkCourse(course);
    expect(findings.map((f) => f.ruleId)).toEqual(
      expect.arrayContaining(['structural.hole-missing-tee', 'structural.hole-missing-basket']),
    );
  });

  it('reports references to deleted features', () => {
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    course = applyOp(course, { type: 'addFeature', feature: tee }).course;
    course = applyOp(course, {
      type: 'addHole',
      hole: createHole(1, { teeIds: [tee.id] }),
    }).course;
    course = applyOp(course, { type: 'removeFeature', id: tee.id }).course;

    const ids = checkCourse(course).map((f) => f.ruleId);
    expect(ids).toContain('structural.dangling-reference');
  });

  it('reports duplicate hole numbers', () => {
    let course = createCourse();
    for (const hole of [createHole(3), createHole(3)]) {
      course = applyOp(course, { type: 'addHole', hole }).course;
    }
    expect(checkCourse(course).map((f) => f.ruleId)).toContain(
      'structural.duplicate-hole-number',
    );
  });

  it('reports tees and baskets that belong to no hole', () => {
    const course = applyOp(createCourse(), {
      type: 'addFeature',
      feature: createFeature('target', pt(-93.1, 44.9)),
    }).course;
    expect(checkCourse(course).map((f) => f.ruleId)).toContain('structural.unassigned-feature');
  });

  it('reports a fairway that turns tighter than its corridor is wide', () => {
    const tee = createFeature('tee', pt(-93.1, 44.9));
    const target = createFeature('target', pt(-93.09996, 44.9));
    const hole = createHole(1, { teeIds: [tee.id], targetIds: [target.id] });
    let course = createCourse({ features: [tee, target], holes: [hole] });

    // Nothing to report out of the box: the hole's fairway is a straight line,
    // and a straight line cannot fold however wide its corridor is.
    expect(checkCourse(course).map((f) => f.ruleId)).not.toContain(
      'structural.corridor-self-intersects',
    );

    /*
     * Bend it into a hairpin and widen the corridor past what the turn can
     * accommodate. The inside edge crosses itself and the polygon stops
     * describing ground.
     */
    course = applyOp(
      course,
      shapeFairway(
        course,
        tee.id,
        target.id,
        [
          [-93.1, 44.9],
          [-93.1, 44.9004],
          [-93.09996, 44.9],
        ],
        hole.id,
      ),
    ).course;

    const fairwayId = course.pairs[0]!.fairwayId!;
    const widen = (value: number) => {
      for (const key of ['widthStart', 'widthEnd']) {
        course = applyOp(course, { type: 'setProp', id: fairwayId, key, value }).course;
      }
    };

    widen(60);
    expect(checkCourse(course).map((f) => f.ruleId)).toContain(
      'structural.corridor-self-intersects',
    );

    // The same turn with a corridor narrow enough to get around it is fine.
    widen(2);
    expect(checkCourse(course).map((f) => f.ruleId)).not.toContain(
      'structural.corridor-self-intersects',
    );
  });

  it('honours dismissals', () => {
    const course = applyOp(createCourse(), { type: 'addHole', hole: createHole(1) }).course;
    const dismissed = checkCourse(course, ['structural.hole-missing-tee']);
    expect(dismissed.map((f) => f.ruleId)).not.toContain('structural.hole-missing-tee');
  });

  it('orders errors before warnings before info', () => {
    let course = createCourse();
    course = applyOp(course, {
      type: 'addFeature',
      feature: createFeature('target', pt(-93.1, 44.9)),
    }).course;
    course = applyOp(course, { type: 'addHole', hole: createHole(1) }).course;

    const severities = checkCourse(course).map((f) => f.severity);
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severities.length; i++) {
      expect(rank[severities[i]!]).toBeGreaterThanOrEqual(rank[severities[i - 1]!]);
    }
  });

  it('finds a clean course clean', () => {
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    const basket = createFeature('target', pt(-93.1, 44.903));
    for (const f of [tee, basket]) {
      course = applyOp(course, { type: 'addFeature', feature: f }).course;
    }
    course = applyOp(course, {
      type: 'addHole',
      hole: createHole(1, { teeIds: [tee.id], targetIds: [basket.id] }),
    }).course;

    expect(checkCourse(course)).toEqual([]);
  });

  /**
   * Guards the integrity commitment in rules.ts: no rule may claim PDGA
   * authority without citing the document it came from. Shipping an invented
   * standard under the PDGA's name is the specific failure this prevents.
   */
  it('never claims PDGA authority without a source', () => {
    for (const rule of PDGA_RULES) {
      expect(rule.source, `${rule.id} must cite its source`).toBeTruthy();
      expect(rule.revision, `${rule.id} must record a revision`).toBeTruthy();
    }
  });
});
