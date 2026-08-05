import { describe, expect, it } from 'vitest';

import { createFeature, type Feature } from './features.js';
import { createHole } from './holes.js';
import { createLayout, createPlay } from './layouts.js';
import { createPair } from './pairs.js';
import { distance } from './measure.js';
import { applyOp } from './ops.js';
import { createCourse, type Course } from './schema.js';
import { CourseStore } from './store.js';
import {
  corridorWidthsFor,
  courseFairways,
  holePairings,
  representativePair,
  setPairFairway,
  setPairPar,
  shapeFairway,
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

  it('builds a corridor against the pair’s own tee', () => {
    const tee = createFeature('tee', point(AT), { props: { width: 6 } });
    const target = createFeature('target', point(north(150)));
    const hole = createHole(1, { teeIds: [tee.id], targetIds: [target.id] });
    const course = createCourse({ features: [tee, target], holes: [hole] });

    const [fairway, ...rest] = courseFairways(course);
    expect(rest).toHaveLength(0);
    expect(fairway!.corridor!.widths).toEqual({ atStart: 6, atEnd: 10 });
    expect(fairway!.corridor!.selfIntersects).toBe(false);
  });
});

describe('fairways are automatic', () => {
  it('exists as a straight line the moment a hole has both ends', () => {
    const { course, hole, tee, pinA } = twoPinHole();

    const fairways = courseFairways(course);
    expect(fairways).toHaveLength(1);

    const [fairway] = fairways;
    expect(fairway!.holeId).toBe(hole.id);
    expect(fairway!.teeId).toBe(tee.id);
    // Nothing stored: the line is derived, and the document carries no feature
    // for it until somebody bends it.
    expect(fairway!.fairwayId).toBeNull();
    expect(course.features.some((f) => f.kind === 'fairway')).toBe(false);

    // Tee front to target, which is exactly what the pair measures.
    expect(fairway!.line).toEqual([point(AT).coordinates, point(north(90)).coordinates]);
    expect(fairway!.targetId).toBe(pinA.id);
  });

  /*
   * The reason this is one per hole and not one per pairing: a three-tee,
   * three-pin hole contains nine shots, and nine overlapping corridors down one
   * corridor of land is unreadable.
   */
  it('draws one shot per hole, not every pairing', () => {
    const { course, hole, tee, pinB } = twoPinHole();
    expect(courseFairways(course)).toHaveLength(1);

    // …but follows the caller's choice, so the map agrees with the panel.
    const chosen = courseFairways(
      course,
      new Map([[hole.id, { teeId: tee.id, targetId: pinB.id }]]),
    );
    expect(chosen).toHaveLength(1);
    expect(chosen[0]!.targetId).toBe(pinB.id);
  });

  it('keeps a shaped line visible even when the picker moves off it', () => {
    const { course, hole, tee, pinA, pinB } = twoPinHole();

    // Bend pin A's fairway, then point the picker at pin B.
    const bent = applyOp(
      course,
      shapeFairway(
        course,
        tee.id,
        pinA.id,
        [AT, [AT[0] + 0.0004, north(45)[1]], north(90)],
        hole.id,
      ),
    ).course;

    const fairways = courseFairways(
      bent,
      new Map([[hole.id, { teeId: tee.id, targetId: pinB.id }]]),
    );
    expect(fairways.map((f) => f.targetId).sort()).toEqual([pinA.id, pinB.id].sort());
    // The shaped one carries a feature; the derived one does not.
    expect(fairways.find((f) => f.targetId === pinA.id)!.fairwayId).not.toBeNull();
    expect(fairways.find((f) => f.targetId === pinB.id)!.fairwayId).toBeNull();
  });

  it('materialises the feature and the pair together, so one undo takes both', () => {
    const { course, hole, tee, pinA } = twoPinHole();
    const line = [AT, [AT[0] + 0.0004, north(45)[1]], north(90)] as [number, number][];

    const shaped = applyOp(course, shapeFairway(course, tee.id, pinA.id, line, hole.id));
    expect(shaped.course.features.filter((f) => f.kind === 'fairway')).toHaveLength(1);
    expect(shaped.course.pairs[0]!.fairwayId).toBe(
      shaped.course.features.find((f) => f.kind === 'fairway')!.id,
    );

    /*
     * The undo has to reverse both halves. A pair pointing at a feature that no
     * longer exists is a dangling reference the designer never created, and it
     * is what dispatching these as two ops would leave behind.
     */
    const undone = applyOp(shaped.course, shaped.inverse).course;
    expect(undone.features.some((f) => f.kind === 'fairway')).toBe(false);
    expect(undone.pairs).toHaveLength(0);
  });

  /*
   * One drag, one undo entry — across two different op types.
   *
   * The first pointer move materialises the fairway (a batch); every move after
   * it is a plain geometry edit. Without coalescing across that boundary, ⌘Z
   * takes back the bend and leaves behind a fairway feature the designer never
   * asked to create, plus the pair record pointing at it.
   */
  it('folds the whole first bend into one undo step', () => {
    const { course, hole, tee, pinA } = twoPinHole();
    const store = new CourseStore(course);

    const bendTo = (offset: number) =>
      shapeFairway(
        store.getSnapshot().course,
        tee.id,
        pinA.id,
        [AT, [AT[0] + offset, north(45)[1]], north(90)],
        hole.id,
        'drag-1',
      );

    /*
     * A drag: the creating batch, then a run of geometry updates — with a stall
     * in the middle far longer than the coalescing window.
     *
     * That stall is the point. Timing alone would split the entry here, and on a
     * loaded machine a real drag does exactly this. The gesture id says the
     * whole run is one action regardless.
     */
    store.dispatch(bendTo(0.0002), 1000);
    store.dispatch(bendTo(0.0004), 1016);
    store.dispatch(bendTo(0.0006), 9000);

    expect(
      store.getSnapshot().course.features.filter((f) => f.kind === 'fairway'),
    ).toHaveLength(1);

    store.undo();
    const undone = store.getSnapshot().course;
    expect(undone.features.some((f) => f.kind === 'fairway')).toBe(false);
    expect(undone.pairs).toHaveLength(0);
    expect(store.getSnapshot().canUndo).toBe(false);

    /*
     * And redo has to bring back all of it. Replaying only the last geometry
     * edit would target a feature undo had just removed, so the whole bend
     * would silently disappear — which is why a coalesced batch keeps its steps
     * rather than being replaced by the newest op.
     */
    store.redo();
    const redone = store.getSnapshot().course;
    expect(redone.features.filter((f) => f.kind === 'fairway')).toHaveLength(1);
    expect(redone.pairs).toHaveLength(1);
    expect(
      (
        redone.features.find((f) => f.kind === 'fairway')!.geometry as {
          coordinates: number[][];
        }
      ).coordinates[1]?.[0],
    ).toBeCloseTo(AT[0] + 0.0006, 8);
  });

  it('reshapes in place once the feature exists', () => {
    const { course, hole, tee, pinA } = twoPinHole();
    const first = applyOp(
      course,
      shapeFairway(
        course,
        tee.id,
        pinA.id,
        [AT, [AT[0] + 0.0004, north(45)[1]], north(90)],
        hole.id,
      ),
    ).course;

    const again = applyOp(
      first,
      shapeFairway(
        first,
        tee.id,
        pinA.id,
        [AT, [AT[0] + 0.0008, north(45)[1]], north(90)],
        hole.id,
      ),
    ).course;

    // Still one feature and one pair — a second bend must not create a second
    // fairway and orphan the first.
    expect(again.features.filter((f) => f.kind === 'fairway')).toHaveLength(1);
    expect(again.pairs).toHaveLength(1);
  });
});
