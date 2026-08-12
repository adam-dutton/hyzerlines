import { describe, expect, it } from 'vitest';

import { createFeature, type Feature } from './features.js';
import { createHole } from './holes.js';
import { createLayout, createPlay } from './layouts.js';
import { createPair } from './pairs.js';
import { distance, pathLength } from './measure.js';
import { applyOp } from './ops.js';
import { createCourse, type Course } from './schema.js';
import { CourseStore } from './store.js';
import {
  alternativeShots,
  chosenPair,
  corridorWidthsFor,
  courseFairways,
  fairwayLine,
  holePairings,
  mandoBearingFor,
  pairElevationKey,
  pairView,
  representativePair,
  setPairFairway,
  setPairPar,
  shapeFairway,
  viewHole,
  viewHoles,
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

/**
 * The designer's pick, and what happens when the document moves under it.
 *
 * A pick is interface state: it is not in the file, nothing validates it on
 * write, and the features it names can be deleted while it is held. Everything
 * that draws or measures a hole goes through here, so this is the one place
 * that has to survive that.
 */
describe('chosenPair', () => {
  it('prefers the designer’s pick over the representative pair', () => {
    const { course, hole, tee, pinA, pinB } = twoPinHole();

    expect(chosenPair(course, hole)).toEqual({ teeId: tee.id, targetId: pinA.id });
    expect(
      chosenPair(course, hole, new Map([[hole.id, { teeId: tee.id, targetId: pinB.id }]])),
    ).toEqual({ teeId: tee.id, targetId: pinB.id });
  });

  /*
   * The failure this guards: pick pin B, delete pin B. Honouring the pick would
   * leave the panel, the card and the map all measuring to a basket that is no
   * longer in the document.
   */
  it('falls back when the pick names a target the hole no longer has', () => {
    const { course, hole, tee, pinA, pinB } = twoPinHole();
    const without = {
      ...course,
      features: course.features.filter((f) => f.id !== pinB.id),
      holes: [{ ...hole, targetIds: [pinA.id] }],
    };

    expect(
      chosenPair(
        without,
        without.holes[0]!,
        new Map([[hole.id, { teeId: tee.id, targetId: pinB.id }]]),
      ),
    ).toEqual({ teeId: tee.id, targetId: pinA.id });
  });

  it('falls back when the pick names a tee belonging to another hole', () => {
    const { course, hole, tee, pinA } = twoPinHole();
    const stranger = createFeature('tee', point(north(-400)));

    expect(
      chosenPair(course, hole, new Map([[hole.id, { teeId: stranger.id, targetId: pinA.id }]])),
    ).toEqual({ teeId: tee.id, targetId: pinA.id });
  });

  /*
   * One resolution, three consumers. The corridor on the map, the length in the
   * panel and the ground the elevation chart samples all come from this — if
   * they resolved separately they could disagree, and nothing on screen would
   * say which was right.
   */
  it('is the resolution the fairways and the views both use', () => {
    const { course, hole, tee, pinB } = twoPinHole();
    const choices = new Map([[hole.id, { teeId: tee.id, targetId: pinB.id }]]);

    const [fairway] = courseFairways(course, choices);
    expect(fairway!.targetId).toBe(pinB.id);

    expect(
      viewHoles(course, [hole], undefined, choices).get(hole.id)?.measurement.straight,
    ).toBeCloseTo(240, 0);
  });
});

/**
 * The shots a hole holds but is not being drawn as.
 *
 * Multiple tees were in the file and invisible on the map: the corridor showed
 * one shot and nothing said the other two existed. These are the lines that say
 * so, and the interesting property is how *few* of them there are.
 */
describe('alternativeShots', () => {
  it('draws every other pin from the tee in play', () => {
    const { course, hole, tee, pinA, pinB } = twoPinHole();

    const shots = alternativeShots(course, undefined);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ holeId: hole.id, teeId: tee.id, targetId: pinB.id });

    // Pick pin B and the alternative becomes pin A — always the shots the hole
    // is *not* being shown as.
    const picked = alternativeShots(
      course,
      new Map([[hole.id, { teeId: tee.id, targetId: pinB.id }]]),
    );
    expect(picked.map((s) => s.targetId)).toEqual([pinA.id]);
  });

  /*
   * The number that matters. Three tees and three pins is nine shots; drawing
   * the eight that are not chosen is not a drawing of anything. Four — one per
   * end that differs — is.
   */
  it('is a cross rather than a grid', () => {
    const tees = [0, 1, 2].map(() => createFeature('tee', point(north(-100))));
    const pins = [0, 1, 2].map((i) => createFeature('target', point(north(i * 10))));
    const hole = createHole(1, {
      teeIds: tees.map((t) => t.id),
      targetIds: pins.map((p) => p.id),
    });
    const course = createCourse({ features: [...tees, ...pins], holes: [hole] });

    const shots = alternativeShots(course);
    expect(shots).toHaveLength(4);
    // Each one differs from the chosen shot at exactly one end.
    for (const shot of shots) {
      const ends = Number(shot.teeId !== tees[0]!.id) + Number(shot.targetId !== pins[0]!.id);
      expect(ends).toBe(1);
    }
  });

  /*
   * A shaped alternative is already on the map in full, with the corridor and
   * width the designer gave it. Listing it here would draw a second, thinner
   * copy of a line that is already there.
   */
  it('leaves out a shot whose fairway has been shaped', () => {
    const { course, tee, pinB } = twoPinHole();
    const shaped = applyOp(
      course,
      shapeFairway(course, tee.id, pinB.id, [AT, north(240)]),
    ).course;

    expect(alternativeShots(shaped)).toEqual([]);
    expect(courseFairways(shaped).map((f) => f.targetId)).toContain(pinB.id);
  });

  it('has nothing to offer a hole with one shot', () => {
    const tee = createFeature('tee', point(AT));
    const target = createFeature('target', point(north(90)));
    const hole = createHole(1, { teeIds: [tee.id], targetIds: [target.id] });
    const course = createCourse({ features: [tee, target], holes: [hole] });

    expect(alternativeShots(course)).toEqual([]);
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
    expect(corridorWidthsFor(fairwayWith({}), tee)).toEqual({ atStart: 4, atEnd: 20 });
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
    expect(fairway!.corridor!.widths).toEqual({ atStart: 6, atEnd: 20 });
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

    /*
     * Tee front to target, in three equal segments rather than one — see
     * `defaultFairwayLine`. Checked by distance rather than by exact
     * coordinates: the interior points are computed on the local tangent
     * plane, and asserting the literal floats would pin an implementation
     * detail rather than the property that actually matters.
     */
    expect(fairway!.line[0]).toEqual(point(AT).coordinates);
    expect(fairway!.line.at(-1)).toEqual(point(north(90)).coordinates);
    expect(fairway!.line.length).toBe(4);
    expect(pathLength(fairway!.line)).toBeCloseTo(
      distance(point(AT).coordinates, point(north(90)).coordinates),
      6,
    );
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

/**
 * The centreline, and the elevation that rides on it.
 *
 * `fairwayLine` is the seam between "what the map draws" and "what the
 * elevation profile samples". If those two ever answered differently, a chart
 * would describe a straight line over a ridge while the map showed a fairway
 * routed around it — and the par computed from that chart would be for a shot
 * nobody throws.
 */
describe('fairwayLine', () => {
  it('is the straight line from tee to target when nothing is shaped', () => {
    const { course, tee, pinA } = twoPinHole();
    const line = fairwayLine(course, tee.id, pinA.id)!;

    expect(line[0]).toEqual(AT);
    expect(line.at(-1)).toEqual(north(90));
    expect(pathLength(line)).toBeCloseTo(distance(AT, north(90)), 6);
  });

  it('is the stored line once the designer has bent it', () => {
    const { course, hole, tee, pinA } = twoPinHole();
    const bend: [number, number] = [AT[0] + 0.0004, north(45)[1]];
    const bent = applyOp(
      course,
      shapeFairway(course, tee.id, pinA.id, [AT, bend, north(90)], hole.id),
    ).course;

    const line = fairwayLine(bent, tee.id, pinA.id)!;
    expect(line).toEqual([AT, bend, north(90)]);
    // Longer than the straight line, which is the entire reason to route one.
    expect(pathLength(line)).toBeGreaterThan(distance(AT, north(90)));
  });

  /*
   * The property that matters: one answer, not two. Whatever `courseFairways`
   * decided to draw for a shot is the same ground a profile samples.
   */
  it('agrees with what courseFairways draws', () => {
    const { course, hole, tee, pinA } = twoPinHole();
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

    for (const fairway of courseFairways(bent)) {
      expect(fairwayLine(bent, fairway.teeId, fairway.targetId)).toEqual(fairway.line);
    }
  });

  it('answers for every pairing, not just the one being drawn', () => {
    const { course, hole, tee, pinA, pinB } = twoPinHole();
    // The map draws one shot for this hole; both are real throws with real ground.
    expect(courseFairways(course)).toHaveLength(1);
    for (const { teeId, targetId } of holePairings(hole)) {
      expect(fairwayLine(course, teeId, targetId)).not.toBeNull();
    }
    expect(fairwayLine(course, tee.id, pinA.id)).not.toEqual(
      fairwayLine(course, tee.id, pinB.id),
    );
  });

  it('is null when an end is missing', () => {
    const { course, tee } = twoPinHole();
    expect(fairwayLine(course, tee.id, 'no-such-target')).toBeNull();
    expect(fairwayLine(course, 'no-such-tee', tee.id)).toBeNull();
  });
});

/**
 * Elevation reaching par, through the view layer.
 *
 * Core cannot read a tile, so the web app hands it a map of gains keyed by
 * pair. These pin that the key is what it claims to be and that a gain for one
 * shot cannot leak into another — a hole silently priced with its neighbour's
 * hill would be very hard to notice and impossible to argue with.
 */
describe('elevations in a pair view', () => {
  it('keys a gain to exactly one shot', () => {
    const { course, tee, pinA, pinB } = twoPinHole();
    const elevations = new Map([[pairElevationKey(tee.id, pinA.id), 12]]);

    const uphill = pairView(course, tee.id, pinA.id, undefined, undefined, elevations);
    const untouched = pairView(course, tee.id, pinB.id, undefined, undefined, elevations);

    expect(uphill.suggestion!.factors.some((f) => /uphill/i.test(f.label))).toBe(true);
    expect(untouched.suggestion!.factors.some((f) => /uphill|downhill/i.test(f.label))).toBe(
      false,
    );
  });

  it('leaves the par alone when no elevations are supplied at all', () => {
    const { course, tee, pinA } = twoPinHole();
    const without = pairView(course, tee.id, pinA.id);
    const withEmpty = pairView(course, tee.id, pinA.id, undefined, undefined, new Map());
    expect(withEmpty.suggestion!.effectiveMeters).toBeCloseTo(
      without.suggestion!.effectiveMeters,
      6,
    );
  });

  it('carries elevation through viewHoles to the scorecard', () => {
    const { course, hole, tee, pinA } = twoPinHole();
    // pinA is the representative shot, so this is the one the scorecard reads.
    const flat = viewHoles(course, course.holes).get(hole.id)!;
    const climbing = viewHoles(
      course,
      course.holes,
      new Map([[pairElevationKey(tee.id, pinA.id), 12]]),
    ).get(hole.id)!;

    expect(climbing.suggestion!.effectiveMeters).toBeCloseTo(
      flat.suggestion!.effectiveMeters + 36,
      6,
    );
  });
});

/**
 * Which way play runs past a mandatory.
 *
 * Everything a mandatory means depends on this. Get it wrong and the wall lands
 * on the side the disc was supposed to go, which is the one failure mode that
 * looks completely deliberate on screen.
 */
describe('mandoBearingFor', () => {
  const mandoOn = (course: Course, at: [number, number], holeId: string | null) => {
    const mando = createFeature('mando', point(at), { holeId });
    return { course: { ...course, features: [...course.features, mando] }, mando };
  };

  it("takes the hole's own shot", () => {
    const { course: base, hole } = twoPinHole();
    // The shot runs due north; a mandatory halfway up it runs north too.
    const { course, mando } = mandoOn(base, north(45), hole.id);
    expect(mandoBearingFor(course, mando.id)).toBeCloseTo(0, 4);
  });

  it('follows the leg nearest the object once the fairway bends', () => {
    const { course: base, hole, tee, pinA } = twoPinHole();
    // A dogleg: north, then east for the last stretch.
    const corner = north(45);
    const east: [number, number] = [corner[0] + 0.0012, corner[1]];
    const bent = applyOp(
      base,
      shapeFairway(base, tee.id, pinA.id, [AT, corner, east], hole.id),
    ).course;

    const nearFirst = mandoOn(bent, north(20), hole.id);
    expect(mandoBearingFor(nearFirst.course, nearFirst.mando.id)).toBeCloseTo(0, 4);

    const nearSecond = mandoOn(bent, [corner[0] + 0.0008, corner[1] + 0.00002], hole.id);
    expect(mandoBearingFor(nearSecond.course, nearSecond.mando.id)).toBeCloseTo(90, 0);
  });

  it('borrows nothing from a neighbouring hole', () => {
    const { course: base } = twoPinHole();
    // Course-level, sitting right beside hole 1's shot. Still no answer: a
    // confident direction taken from somebody else's hole is worse than none.
    const { course, mando } = mandoOn(base, north(45), null);
    expect(mandoBearingFor(course, mando.id)).toBeNull();
  });

  it('has no answer for something that is not a mandatory', () => {
    const { course, tee } = twoPinHole();
    expect(mandoBearingFor(course, tee.id)).toBeNull();
    expect(mandoBearingFor(course, 'no such feature')).toBeNull();
  });
});
