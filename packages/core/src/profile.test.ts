import { describe, expect, it } from 'vitest';

import {
  axisTicks,
  niceStep,
  PROFILE_SAMPLES,
  sampleLine,
  SMOOTHING_METERS,
  smoothProfile,
  summarizeProfile,
  type ProfilePoint,
} from './profile.js';
import { distance, pathLength } from './measure.js';
import type { Position } from './geo.js';

/**
 * Sampling and summarising a hole's ground profile.
 *
 * `netGain` is the number that matters most here: it feeds the PDGA's
 * effective-length formula and can therefore change par. Everything about it
 * that could be plausibly wrong — reading the wrong end, surviving a gap in the
 * data, mistaking a hill-and-back-down for a climb — gets its own case.
 */

/**
 * A line running east from a point, in `count` steps of roughly `metres`.
 *
 * "Roughly" is load-bearing: the degrees-per-metre below is an approximation,
 * so the line is within a fraction of a percent of the requested length rather
 * than exactly it. Assertions that care about length therefore measure the line
 * they were given rather than trusting this — which is the right habit anyway,
 * since it means they are testing the code and not this helper.
 */
function eastward(count: number, metres: number, from: Position = [-93.1, 44.9]): Position[] {
  // At this latitude a degree of longitude is about 78.7 km.
  const degreesPerMetre = 1 / (111_320 * Math.cos((from[1] * Math.PI) / 180));
  return Array.from({ length: count }, (_, i) => [
    from[0] + i * metres * degreesPerMetre,
    from[1],
  ]);
}

const withElevations = (
  samples: { distance: number; position: Position }[],
  elevation: (index: number) => number | null,
): ProfilePoint[] => samples.map((s, i) => ({ ...s, elevation: elevation(i) }));

describe('sampleLine', () => {
  it('returns the requested number of samples', () => {
    expect(sampleLine(eastward(2, 100))).toHaveLength(PROFILE_SAMPLES);
    expect(sampleLine(eastward(2, 100), 10)).toHaveLength(10);
  });

  it('starts at the tee and ends at the target', () => {
    const line = eastward(2, 200);
    const samples = sampleLine(line, 8);
    expect(samples[0]!.position[0]).toBeCloseTo(line[0]![0], 9);
    expect(samples.at(-1)!.position[0]).toBeCloseTo(line.at(-1)![0], 9);
  });

  it('spaces samples evenly by distance', () => {
    const samples = sampleLine(eastward(2, 300), 7);
    const total = samples.at(-1)!.distance;
    for (let i = 0; i < samples.length; i++) {
      expect(samples[i]!.distance).toBeCloseTo((total * i) / 6, 6);
    }
  });

  /*
   * The reason sampling is by arc length rather than per segment. A routed
   * fairway has a long straight and a short kink; sampling each segment equally
   * would crowd points into the kink and step over the straight, which is
   * exactly the open ground whose slope matters.
   */
  it('does not crowd samples into short segments', () => {
    // 400m, then 20m: one long run and a short kink.
    const from: Position = [-93.1, 44.9];
    const degreesPerMetre = 1 / (111_320 * Math.cos((44.9 * Math.PI) / 180));
    const line: Position[] = [
      from,
      [from[0] + 400 * degreesPerMetre, from[1]],
      [from[0] + 420 * degreesPerMetre, from[1]],
    ];

    const samples = sampleLine(line, 21);
    const inKink = samples.filter((s) => s.distance > 400).length;
    // Proportional would be one of twenty-one; per-segment would be about half.
    expect(inKink).toBeLessThanOrEqual(2);
  });

  it('reports distances that match the line it sampled', () => {
    const line = eastward(4, 120);
    const samples = sampleLine(line, 16);
    expect(samples.at(-1)!.distance).toBeCloseTo(pathLength(line), 3);
  });

  it('places samples on the line rather than near it', () => {
    const line = eastward(3, 150);
    for (const sample of sampleLine(line, 12)) {
      // Every sample is due east of the start, so latitude never moves.
      expect(sample.position[1]).toBeCloseTo(line[0]![1], 12);
    }
  });

  it('survives a degenerate line', () => {
    expect(sampleLine([])).toEqual([]);
    const single: Position = [-93.1, 44.9];
    expect(sampleLine([single])).toEqual([{ distance: 0, position: single }]);
    // A line whose ends coincide has no length to sample along.
    expect(sampleLine([single, single])).toHaveLength(1);
  });

  it('samples a real distance, checked against the measurement helpers', () => {
    const line = eastward(2, 250);
    const samples = sampleLine(line, 5);
    // Against the line's own measured length, not the nominal 250.
    expect(distance(samples[0]!.position, samples.at(-1)!.position)).toBeCloseTo(
      pathLength(line),
      6,
    );
  });
});

describe('summarizeProfile', () => {
  const samples = sampleLine(eastward(2, 300), 11);

  it('reads net gain from the endpoints, target minus tee', () => {
    // Climbs steadily from 100m to 110m.
    const profile = summarizeProfile(withElevations(samples, (i) => 100 + i));
    expect(profile.netGain).toBe(10);
  });

  it('reports a downhill hole as a negative gain', () => {
    const profile = summarizeProfile(withElevations(samples, (i) => 100 - i));
    expect(profile.netGain).toBe(-10);
  });

  /*
   * The PDGA's term is the difference between the ends, not anything about the
   * path — "the difference in elevation from the target to the tee". A hole
   * that climbs a ridge and drops back to where it started is flat by that
   * measure, and the formula means it to be.
   */
  it('treats a hill and back down as no net gain', () => {
    const profile = summarizeProfile(
      withElevations(samples, (i) => 100 + (i <= 5 ? i : 10 - i)),
    );
    expect(profile.netGain).toBe(0);
    // But the climb and descent are still reported, because they are real.
    expect(profile.totalClimb).toBeCloseTo(5, 6);
    expect(profile.totalDescent).toBeCloseTo(5, 6);
  });

  it('separates climb from descent', () => {
    const profile = summarizeProfile(withElevations(samples, (i) => (i % 2 === 0 ? 100 : 102)));
    expect(profile.totalClimb).toBeGreaterThan(0);
    expect(profile.totalDescent).toBeGreaterThan(0);
    expect(profile.netGain).toBe(0);
  });

  it('reports the range the ground covers', () => {
    const profile = summarizeProfile(withElevations(samples, (i) => 100 + i * 2));
    expect(profile.minElevation).toBe(100);
    expect(profile.maxElevation).toBe(120);
  });

  /*
   * Steepness is what tells a designer the 3× multiplier is understating the
   * hole — see `[SKILL]` p2 — so it has to be a real gradient rather than a
   * per-sample difference that changes with the sample count.
   */
  it('measures grade as rise over run', () => {
    // 30m of climb spread evenly over the line: one uniform grade throughout.
    const profile = summarizeProfile(withElevations(samples, (i) => 100 + i * 3));
    const length = samples.at(-1)!.distance;
    expect(profile.steepestGrade).toBeCloseTo(30 / length, 9);
    // And that grade is about 10%, which is the case this stands in for.
    expect(profile.steepestGrade).toBeGreaterThan(0.09);
    expect(profile.steepestGrade).toBeLessThan(0.11);
  });

  it('finds the steepest run rather than averaging', () => {
    // Flat except for one abrupt step in the middle.
    const profile = summarizeProfile(withElevations(samples, (i) => (i < 5 ? 100 : 115)));
    expect(profile.steepestGrade).toBeGreaterThan(0.3);
  });

  /*
   * A profile can be partial — the survey may not cover the whole hole. Net
   * gain goes on to change par, so it must refuse rather than report the gain
   * between whichever samples happened to have data.
   */
  it('withholds net gain when an endpoint has no data', () => {
    const noTee = summarizeProfile(withElevations(samples, (i) => (i === 0 ? null : 100 + i)));
    expect(noTee.netGain).toBeNull();

    const noTarget = summarizeProfile(
      withElevations(samples, (i) => (i === samples.length - 1 ? null : 100 + i)),
    );
    expect(noTarget.netGain).toBeNull();
  });

  it('still reports the shape when the middle is missing', () => {
    const profile = summarizeProfile(
      withElevations(samples, (i) => (i > 3 && i < 7 ? null : 100 + i)),
    );
    expect(profile.netGain).toBe(10);
    expect(profile.missing).toBe(3);
    expect(profile.maxElevation).toBe(110);
  });

  it('gives up cleanly when nothing has data', () => {
    const profile = summarizeProfile(withElevations(samples, () => null));
    expect(profile.netGain).toBeNull();
    expect(profile.minElevation).toBeNull();
    expect(profile.steepestGrade).toBeNull();
    expect(profile.missing).toBe(samples.length);
  });

  it('handles an empty profile', () => {
    const profile = summarizeProfile([]);
    expect(profile.netGain).toBeNull();
    expect(profile.missing).toBe(0);
  });

  it('handles elevation below sea level', () => {
    const profile = summarizeProfile(withElevations(samples, (i) => -50 + i));
    expect(profile.netGain).toBe(10);
    expect(profile.minElevation).toBe(-50);
  });
});

/**
 * Smoothing, and why it is not hiding data.
 *
 * The fixture here is the real artifact rather than invented jitter: elevation
 * is read by nearest neighbour from a raster, so samples taken every 4.7m from
 * 10m cells come back as a staircase. Ground that falls steadily at 8% is
 * reported as a run of identical values and then a step, which reads as a grade
 * of 17% at the step and 0% either side of it.
 *
 * That is what these tests are about: the filter's job is to recover the 8%,
 * and to be unable to touch the one number that reaches par.
 */

/** Ground falling at a steady grade, quantised to DEM cells the way sampling does. */
function staircase(
  count: number,
  { spacing = 4.7, cell = 10, grade = 0.08, base = 100 } = {},
): ProfilePoint[] {
  return Array.from({ length: count }, (_, i) => {
    const along = i * spacing;
    // The cell's centre, which is the value nearest-neighbour returns for every
    // sample that lands anywhere in it.
    const center = Math.floor(along / cell) * cell + cell / 2;
    return {
      distance: along,
      position: [-93.1, 44.9] as Position,
      elevation: base + grade * center,
    };
  });
}

describe('smoothProfile', () => {
  it('is the identity when switched off', () => {
    const points = staircase(20);
    expect(smoothProfile(points, 0)).toEqual(points);
    expect(smoothProfile(points, SMOOTHING_METERS.off)).toEqual(points);
  });

  /*
   * The complaint that prompted this, stated as a test: the raw series reports
   * a grade more than twice the truth, and one posting of smoothing recovers it.
   */
  it('recovers the true grade from the sampling staircase', () => {
    const points = staircase(64);

    const raw = summarizeProfile(points);
    expect(raw.steepestGrade!).toBeGreaterThan(0.15);

    const smoothed = summarizeProfile(points, SMOOTHING_METERS.light);
    expect(smoothed.steepestGrade!).toBeLessThan(0.1);
    // And it is the real grade, not merely a smaller number.
    expect(smoothed.steepestGrade!).toBeCloseTo(0.08, 1);
  });

  /*
   * Every step of the staircase is a rise and the flats between them contribute
   * nothing, so total climb over-counts too. Less dramatic than the grade, but
   * the same cause.
   */
  it('stops noise being counted as climb', () => {
    const wobbly: ProfilePoint[] = staircase(40).map((p, i) => ({
      ...p,
      elevation: p.elevation! + (i % 2 === 0 ? 0.15 : -0.15),
    }));

    const raw = summarizeProfile(wobbly);
    const smoothed = summarizeProfile(wobbly, SMOOTHING_METERS.light);
    expect(smoothed.totalClimb).toBeLessThan(raw.totalClimb);
  });

  /*
   * THE rule. `netGain` reaches the PDGA's effective-length formula and can move
   * a par by two strokes; smoothing is a chart preference chosen in a dropdown.
   * A preference that moved a par would be indefensible, so this is checked at
   * every strength rather than trusted to the one line that implements it.
   */
  it('cannot change net gain, at any strength', () => {
    const points = staircase(64);
    const expected = summarizeProfile(points).netGain;

    for (const level of ['off', 'light', 'medium', 'strong'] as const) {
      expect(summarizeProfile(points, SMOOTHING_METERS[level]).netGain).toBe(expected);
    }
  });

  it('reads net gain from the raw ends even when the ends are extreme', () => {
    // A tee on a knoll: the one shape where a one-sided window would shave the
    // rise, because it can only pull the endpoint towards the rest of the hole.
    const points = staircase(32);
    points[0] = { ...points[0]!, elevation: points[0]!.elevation! + 5 };

    const raw = summarizeProfile(points).netGain!;
    expect(summarizeProfile(points, SMOOTHING_METERS.strong).netGain).toBe(raw);
  });

  it('leaves gaps as gaps', () => {
    const points = staircase(20).map((p, i) =>
      i >= 8 && i <= 10 ? { ...p, elevation: null } : p,
    );
    const smoothed = smoothProfile(points, SMOOTHING_METERS.medium);

    expect(smoothed.map((p) => p.elevation === null)).toEqual(
      points.map((p) => p.elevation === null),
    );
    expect(summarizeProfile(points, SMOOTHING_METERS.medium).missing).toBe(3);
  });

  /*
   * The window stops at a gap rather than reaching over it. A sample just
   * before missing ground must not be pulled towards ground on the far side —
   * that is the same claim the chart refuses to make when it declines to draw
   * a line across the gap.
   */
  it('does not average across missing ground', () => {
    const flatThenHigh: ProfilePoint[] = Array.from({ length: 21 }, (_, i) => ({
      distance: i * 5,
      position: [-93.1, 44.9] as Position,
      // 100 up to the gap, nothing in it, 200 after. Nothing may leak across.
      elevation: i >= 9 && i <= 11 ? null : i < 9 ? 100 : 200,
    }));

    const smoothed = smoothProfile(flatThenHigh, 50);
    // Close rather than exact: a normalised weighted mean of identical values
    // still accumulates float error. What matters is that nothing leaked.
    expect(smoothed[8]!.elevation!).toBeCloseTo(100, 9);
    expect(smoothed[12]!.elevation!).toBeCloseTo(200, 9);
  });

  /*
   * Gaussian rather than a box average, so a real feature keeps its height. A
   * box would clip the top of a ridge, which on this chart would mean a mound a
   * designer needs to see disappearing as they turned smoothing up.
   */
  it('keeps most of a real ridge', () => {
    const ridge: ProfilePoint[] = Array.from({ length: 41 }, (_, i) => ({
      distance: i * 5,
      position: [-93.1, 44.9] as Position,
      // A broad 20m rise in the middle — terrain, not noise.
      elevation: 100 + Math.max(0, 20 - Math.abs(i - 20) * 2),
    }));

    const peak = summarizeProfile(ridge, SMOOTHING_METERS.light).maxElevation!;
    expect(peak).toBeGreaterThan(118);
  });

  it('survives a profile too short to smooth', () => {
    expect(smoothProfile([], 25)).toEqual([]);
    const one = staircase(1);
    expect(smoothProfile(one, 25)).toEqual(one);
  });

  it('reports the window it was read through', () => {
    expect(summarizeProfile(staircase(20)).smoothingMeters).toBe(0);
    expect(summarizeProfile(staircase(20), 25).smoothingMeters).toBe(25);
  });
});

/**
 * Axis ticks.
 *
 * The numbers on a chart exist to be read off and subtracted, so they have to
 * be numbers a person does arithmetic in.
 */
describe('axisTicks', () => {
  it('picks round steps', () => {
    expect(niceStep(100)).toBe(25);
    expect(niceStep(40)).toBe(10);
    expect(niceStep(8)).toBe(2);
    expect(niceStep(0.4)).toBeCloseTo(0.1, 9);
  });

  it('covers the data and lands on whole steps', () => {
    const { ticks, low, high } = axisTicks(983.4, 1006.7);
    expect(low).toBeLessThanOrEqual(983.4);
    expect(high).toBeGreaterThanOrEqual(1006.7);
    expect(ticks[0]).toBe(low);
    expect(ticks.at(-1)).toBe(high);
    // Every label is a number somebody would write down.
    for (const tick of ticks) expect(tick).toBe(Math.round(tick * 100) / 100);
  });

  it('is evenly spaced', () => {
    const { ticks } = axisTicks(0, 97);
    const step = ticks[1]! - ticks[0]!;
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]! - ticks[i - 1]!).toBeCloseTo(step, 9);
    }
  });

  /*
   * Genuinely flat ground. Without a floor the axis would divide a range of
   * zero and label a hole that falls four centimetres with meaningless
   * precision — the chart equivalent of inventing detail.
   */
  it('opens out a flat range rather than dividing zero', () => {
    const { ticks, low, high } = axisTicks(250, 250, { minSpan: 10 });
    expect(high - low).toBeGreaterThanOrEqual(10);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });

  it('handles ground below sea level', () => {
    const { ticks, low } = axisTicks(-40, -12);
    expect(low).toBeLessThanOrEqual(-40);
    expect(ticks.every(Number.isFinite)).toBe(true);
  });
});
