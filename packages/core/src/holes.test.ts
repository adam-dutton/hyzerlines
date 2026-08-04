import { describe, expect, it } from 'vitest';

import { createCourse } from './schema.js';
import { createFeature, type Geometry } from './features.js';
import { applyOp, type Op } from './ops.js';
import { CourseStore } from './store.js';
import { bearing, distance, pathLength } from './measure.js';
import {
  createHole,
  coursePar,
  effectivePar,
  holeName,
  measureHole,
  suggestPar,
  PAR_THRESHOLDS_M,
} from './holes.js';
import { checkCourse, PDGA_RULES } from './rules.js';
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
});

describe('hole measurement', () => {
  const buildHole = (fairway?: Geometry) => {
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    const basket = createFeature('basket', pt(-93.1, 44.903));
    for (const f of [tee, basket]) {
      course = applyOp(course, { type: 'addFeature', feature: f }).course;
    }
    let fairwayId: string | null = null;
    if (fairway) {
      const line = createFeature('fairway', fairway);
      course = applyOp(course, { type: 'addFeature', feature: line }).course;
      fairwayId = line.id;
    }
    const hole = createHole(1, { teeIds: [tee.id], basketIds: [basket.id], fairwayId });
    course = applyOp(course, { type: 'addHole', hole }).course;
    return { course, hole, tee, basket };
  };

  it('measures the straight line tee to basket', () => {
    const { course, hole } = buildHole();
    const m = measureHole(course, hole);
    expect(m.straight).toBeCloseTo(distance([-93.1, 44.9], [-93.1, 44.903]), 6);
    expect(m.routed).toBeNull();
    expect(m.effective).toBe(m.straight);
  });

  // A dogleg plays its route, not its chord.
  it('prefers the routed length when a fairway is drawn', () => {
    const { course, hole } = buildHole({
      type: 'line',
      coordinates: [
        [-93.1, 44.9],
        [-93.095, 44.9015],
        [-93.1, 44.903],
      ],
    });
    const m = measureHole(course, hole);
    expect(m.routed).not.toBeNull();
    expect(m.routed!).toBeGreaterThan(m.straight!);
    expect(m.effective).toBe(m.routed);
  });

  it('reports null rather than guessing when an end is missing', () => {
    const course = createCourse();
    const hole = createHole(1);
    expect(measureHole(course, hole).effective).toBeNull();
    expect(suggestPar(course, hole)).toBeNull();
  });
});

describe('par suggestion', () => {
  /** Build a hole of an exact straight length by walking north from a point. */
  const holeOfLength = (meters: number) => {
    const metersPerDegreeLat = distance([0, 44.9], [0, 45.9]);
    const dLat = meters / metersPerDegreeLat;
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    const basket = createFeature('basket', pt(-93.1, 44.9 + dLat));
    for (const f of [tee, basket]) {
      course = applyOp(course, { type: 'addFeature', feature: f }).course;
    }
    const hole = createHole(1, { teeIds: [tee.id], basketIds: [basket.id] });
    return { course, hole };
  };

  it('assigns par from effective distance', () => {
    for (const [meters, expected] of [
      [80, 3],
      [PAR_THRESHOLDS_M.par3Max - 5, 3],
      [PAR_THRESHOLDS_M.par3Max + 5, 4],
      [PAR_THRESHOLDS_M.par4Max + 5, 5],
      [PAR_THRESHOLDS_M.par5Max + 50, 6],
    ] as const) {
      const { course, hole } = holeOfLength(meters);
      expect(suggestPar(course, hole)?.par, `${meters} m`).toBe(expected);
    }
  });

  /**
   * A bare number nobody can interrogate gets ignored. The reasoning is the
   * feature, so an empty factor list is a bug.
   */
  it('always explains itself', () => {
    const { course, hole } = holeOfLength(200);
    const suggestion = suggestPar(course, hole);
    expect(suggestion?.factors.length).toBeGreaterThan(0);
    expect(suggestion?.factors[0]?.label).toBeTruthy();
  });

  it('flags holes sitting on a threshold as borderline', () => {
    const onEdge = holeOfLength(PAR_THRESHOLDS_M.par3Max);
    expect(suggestPar(onEdge.course, onEdge.hole)?.borderline).toBe(true);

    const clear = holeOfLength(80);
    expect(suggestPar(clear.course, clear.hole)?.borderline).toBe(false);
  });

  /**
   * The override exists so improving the heuristic never silently overwrites a
   * deliberate decision. If this breaks, designers lose work invisibly.
   */
  it('lets the designer override, and never discards the override', () => {
    const { course, hole } = holeOfLength(80);
    expect(effectivePar(course, hole)).toBe(3);

    const overridden = { ...hole, parOverride: 4 };
    expect(effectivePar(course, overridden)).toBe(4);
    // The suggestion is still computed underneath, unchanged.
    expect(suggestPar(course, overridden)?.par).toBe(3);
  });

  it('totals par across holes', () => {
    const a = holeOfLength(80);
    const b = holeOfLength(200);
    const course = { ...a.course, features: [...a.course.features, ...b.course.features] };
    expect(coursePar(course, [a.hole, b.hole])).toBe(3 + 4);
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
    const hole = createHole(1, { name: 'Original', parOverride: 4 });
    const course = applyOp(createCourse(), { type: 'addHole', hole }).course;

    const { course: renamed, inverse } = applyOp(course, {
      type: 'updateHole',
      id: hole.id,
      changes: { name: 'Renamed' },
    });
    expect(renamed.holes[0]?.name).toBe('Renamed');
    expect(renamed.holes[0]?.parOverride).toBe(4);

    const undone = applyOp(renamed, inverse).course;
    expect(undone.holes[0]?.name).toBe('Original');
    expect(undone.holes[0]?.parOverride).toBe(4);
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
      hole: createHole(1, { teeIds: [tee.id], parOverride: 4 }),
    }).course;

    const result = deserializeCourse(serializeCourse(course));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.course.holes).toHaveLength(1);
      expect(result.course.holes[0]?.parOverride).toBe(4);
    }
  });

  it('names holes by number when unnamed', () => {
    expect(holeName(createHole(7))).toBe('Hole 7');
    expect(holeName(createHole(7, { name: 'The Chute' }))).toBe('The Chute');
  });
});

describe('design checks', () => {
  it('reports a hole with no tee or basket', () => {
    const course = applyOp(createCourse(), { type: 'addHole', hole: createHole(1) }).course;
    const findings = checkCourse(course, course.holes);
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

    const ids = checkCourse(course, course.holes).map((f) => f.ruleId);
    expect(ids).toContain('structural.dangling-reference');
  });

  it('reports duplicate hole numbers', () => {
    let course = createCourse();
    for (const hole of [createHole(3), createHole(3)]) {
      course = applyOp(course, { type: 'addHole', hole }).course;
    }
    expect(checkCourse(course, course.holes).map((f) => f.ruleId)).toContain(
      'structural.duplicate-hole-number',
    );
  });

  it('reports tees and baskets that belong to no hole', () => {
    const course = applyOp(createCourse(), {
      type: 'addFeature',
      feature: createFeature('basket', pt(-93.1, 44.9)),
    }).course;
    expect(checkCourse(course, course.holes).map((f) => f.ruleId)).toContain(
      'structural.unassigned-feature',
    );
  });

  it('honours dismissals', () => {
    const course = applyOp(createCourse(), { type: 'addHole', hole: createHole(1) }).course;
    const dismissed = checkCourse(course, course.holes, ['structural.hole-missing-tee']);
    expect(dismissed.map((f) => f.ruleId)).not.toContain('structural.hole-missing-tee');
  });

  it('orders errors before warnings before info', () => {
    let course = createCourse();
    course = applyOp(course, {
      type: 'addFeature',
      feature: createFeature('basket', pt(-93.1, 44.9)),
    }).course;
    course = applyOp(course, { type: 'addHole', hole: createHole(1) }).course;

    const severities = checkCourse(course, course.holes).map((f) => f.severity);
    const rank = { error: 0, warning: 1, info: 2 } as const;
    for (let i = 1; i < severities.length; i++) {
      expect(rank[severities[i]!]).toBeGreaterThanOrEqual(rank[severities[i - 1]!]);
    }
  });

  it('finds a clean course clean', () => {
    let course = createCourse();
    const tee = createFeature('tee', pt(-93.1, 44.9));
    const basket = createFeature('basket', pt(-93.1, 44.903));
    for (const f of [tee, basket]) {
      course = applyOp(course, { type: 'addFeature', feature: f }).course;
    }
    course = applyOp(course, {
      type: 'addHole',
      hole: createHole(1, { teeIds: [tee.id], basketIds: [basket.id] }),
    }).course;

    expect(checkCourse(course, course.holes)).toEqual([]);
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
