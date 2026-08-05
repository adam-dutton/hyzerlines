import { describe, expect, it } from 'vitest';

import { createFeature, type Feature } from './features.js';
import { createHole } from './holes.js';
import { createLayout, createPlay } from './layouts.js';
import { createPair } from './pairs.js';
import { distance } from './measure.js';
import { applyOp } from './ops.js';
import { createCourse, type Course } from './schema.js';
import {
  corridorWidthsFor,
  courseCorridors,
  holePairings,
  representativePair,
  setPairFairway,
  setPairPar,
  viewHole,
} from './pairView.js';
import { TEE_PAD_M } from './pdga.js';

/**
 * Choosing which shot a hole is presented as.
 *
 * The whole reason this module exists: a hole with two pins has two lengths and
 * possibly two pars, and something has to decide which one a panel shows. These
 * tests pin down that the routing decides, not the array order.
 */

const AT: [number, number] = [-93.1, 44.9];
const metersPerDegreeLat = distance([0, 44.9], [0, 45.9]);
const north = (meters: number): [number, number] => [
  AT[0],
  AT[1] + meters / metersPerDegreeLat,
];

const point = (coordinates: [number, number]) => ({ type: 'point', coordinates }) as const;

/** A hole with one tee and two pins at different distances. */
function twoPinHole() {
  const tee = createFeature('tee', point(AT), { props: { color: 'blue' } });
  const pinA = createFeature('target', point(north(90)), { props: { pinId: 'A' } });
  const pinB = createFeature('target', point(north(240)), { props: { pinId: 'B' } });
  const hole = createHole(1, { teeIds: [tee.id], targetIds: [pinA.id, pinB.id] });

  const course = createCourse({
    features: [tee, pinA, pinB],
    holes: [hole],
  });

  return { course, hole, tee, pinA, pinB };
}

describe('representativePair', () => {
  it('takes the shot the active layout actually plays', () => {
    const { course, hole, tee, pinA, pinB } = twoPinHole();

    // Unrouted, the first pin stands in — the best guess available.
    expect(representativePair(course, hole)).toEqual({ teeId: tee.id, targetId: pinA.id });

    /*
     * Routed to pin B, the answer changes. This is the bug the old shim had:
     * it always answered with the first target, so a course routed to its long
     * pins reported every hole at its short length — a par table describing a
     * round nobody plays.
     */
    const layout = createLayout('Long', [createPlay(hole.id, tee.id, pinB.id)]);
    const routed: Course = { ...course, layouts: [layout], activeLayoutId: layout.id };

    expect(representativePair(routed, hole)).toEqual({ teeId: tee.id, targetId: pinB.id });
    expect(viewHole(routed, hole)?.measurement.straight).toBeCloseTo(240, 0);
    expect(viewHole(course, hole)?.measurement.straight).toBeCloseTo(90, 0);
  });

  it('is null when the hole has no shot to measure', () => {
    const tee = createFeature('tee', point(AT));
    const hole = createHole(1, { teeIds: [tee.id] });
    const course = createCourse({ features: [tee], holes: [hole] });

    expect(representativePair(course, hole)).toBeNull();
    expect(viewHole(course, hole)).toBeNull();
  });

  it('enumerates every shot a hole contains', () => {
    const { hole } = twoPinHole();
    expect(holePairings(hole)).toHaveLength(2);
  });
});

describe('par on a pair', () => {
  it('materialises a sparse record and removes it again', () => {
    const { course, tee, pinA } = twoPinHole();
    expect(course.pairs).toHaveLength(0);

    const set = applyOp(course, setPairPar(course, tee.id, pinA.id, 4)).course;
    expect(set.pairs).toHaveLength(1);
    expect(set.pairs[0]!.parOverride).toBe(4);

    // Clearing an override on an otherwise empty pair drops the record rather
    // than leaving a row of nulls behind.
    const cleared = applyOp(set, setPairPar(set, tee.id, pinA.id, null)).course;
    expect(cleared.pairs).toHaveLength(0);
  });

  it('keeps the record when the pair still carries a fairway', () => {
    const { course, tee, pinA } = twoPinHole();
    const fairway = createFeature('fairway', {
      type: 'line',
      coordinates: [AT, north(90)],
    });

    const withPair: Course = {
      ...course,
      features: [...course.features, fairway],
      pairs: [createPair(tee.id, pinA.id, { fairwayId: fairway.id, parOverride: 3 })],
    };

    const cleared = applyOp(withPair, setPairPar(withPair, tee.id, pinA.id, null)).course;
    expect(cleared.pairs).toHaveLength(1);
    expect(cleared.pairs[0]!.parOverride).toBeNull();
    expect(cleared.pairs[0]!.fairwayId).toBe(fairway.id);

    // And detaching the fairway from a pair with nothing else on it drops it.
    const detached = applyOp(cleared, setPairFairway(cleared, tee.id, pinA.id, null)).course;
    expect(detached.pairs).toHaveLength(0);
  });
});

describe('corridor widths', () => {
  const fairwayWith = (props: Feature['props']) =>
    createFeature('fairway', { type: 'line', coordinates: [AT, north(150)] }, { props });

  it('starts at the tee pad width and ends at Circle 1', () => {
    const tee = createFeature('tee', point(AT), { props: { width: 4 } });
    expect(corridorWidthsFor(fairwayWith({}), tee)).toEqual({ atStart: 4, atEnd: 10 });
  });

  it('falls back to the typical pad width when the tee has none', () => {
    const tee = createFeature('tee', point(AT));
    expect(corridorWidthsFor(fairwayWith({}), tee).atStart).toBe(TEE_PAD_M.typicalWidth);
    // No tee at all — a fairway drawn before it was attached to anything.
    expect(corridorWidthsFor(fairwayWith({}), undefined).atStart).toBe(TEE_PAD_M.typicalWidth);
  });

  it('lets the fairway override both ends', () => {
    const tee = createFeature('tee', point(AT), { props: { width: 4 } });
    expect(corridorWidthsFor(fairwayWith({ widthStart: 12, widthEnd: 30 }), tee)).toEqual({
      atStart: 12,
      atEnd: 30,
    });
  });

  it('builds a corridor per drawn fairway, against the pair’s own tee', () => {
    const tee = createFeature('tee', point(AT), { props: { width: 6 } });
    const target = createFeature('target', point(north(150)));
    const fairway = createFeature('fairway', {
      type: 'line',
      coordinates: [AT, north(150)],
    });

    const course = createCourse({
      features: [tee, target, fairway],
      pairs: [createPair(tee.id, target.id, { fairwayId: fairway.id })],
    });

    const corridors = courseCorridors(course);
    expect(corridors.size).toBe(1);
    expect(corridors.get(fairway.id)!.widths).toEqual({ atStart: 6, atEnd: 10 });
    expect(corridors.get(fairway.id)!.selfIntersects).toBe(false);
  });
});
