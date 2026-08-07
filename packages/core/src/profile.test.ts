import { describe, expect, it } from 'vitest';

import { PROFILE_SAMPLES, sampleLine, summarizeProfile, type ProfilePoint } from './profile.js';
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
