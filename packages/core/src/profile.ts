import type { Position } from './geo.js';
import { distance, pathLength } from './measure.js';

/**
 * The shape of the ground a hole is thrown over.
 *
 * A plan view says a hole is 280 feet. It cannot say that the last eighty of
 * those fall fifteen metres, which is the difference between a par 3 and a hole
 * everybody aces — and it is the term the PDGA's own effective-length formula
 * has been missing since PR 4. See `docs/PDGA.md`, "Effective length".
 *
 * Everything here is pure: given a line and a way to look up elevation, it
 * produces a profile. Where the elevation comes from — an imported LiDAR survey
 * or the global overlay — is the web app's problem, and the accuracy of the
 * answer is a property of that source rather than of this arithmetic.
 */

/** How many points a profile is sampled at, whatever the hole's length. */
export const PROFILE_SAMPLES = 64;

export interface ProfilePoint {
  /** Metres from the tee, along the line. */
  distance: number;
  position: Position;
  /** Metres above sea level, or null where the source had no data. */
  elevation: number | null;
}

export interface ElevationProfile {
  points: readonly ProfilePoint[];
  /**
   * Target elevation minus tee elevation, in metres.
   *
   * The PDGA's term, and deliberately the endpoints rather than anything about
   * the path between them: `[PAR]` p7 says "add three times the difference in
   * elevation from the target to the tee". A hole that climbs a ridge and comes
   * back down is flat by this measure, which is what the formula intends —
   * the throw ends where it ends.
   */
  netGain: number | null;
  /** Total climb and total descent along the line. Context, not par input. */
  totalClimb: number;
  totalDescent: number;
  minElevation: number | null;
  maxElevation: number | null;
  /**
   * Steepest run over the whole line, as a fraction (0.1 is 10%).
   *
   * `[SKILL]` p2 warns that past 10% "the multiplier is likely greater than 3.
   * Only testing and experience can provide a good estimate" — so the app keeps
   * using 3 and says when a hole is steep enough for that to be understating
   * it. Reporting the slope is the honest half of a figure we cannot correct.
   */
  steepestGrade: number | null;
  /** How many samples came back with no data. A profile can be partial. */
  missing: number;
}

/**
 * Evenly spaced positions along a polyline.
 *
 * By arc length rather than per segment: a routed fairway has segments of very
 * different lengths, and sampling each one equally would crowd the samples into
 * the short ones and step over the long ones — which is exactly where a long
 * open run of ground is.
 */
export function sampleLine(
  coordinates: readonly Position[],
  count: number = PROFILE_SAMPLES,
): { distance: number; position: Position }[] {
  if (coordinates.length === 0) return [];
  const first = coordinates[0]!;
  if (coordinates.length === 1) return [{ distance: 0, position: first }];

  const total = pathLength(coordinates);
  if (total === 0) return [{ distance: 0, position: first }];

  // Cumulative distance at each vertex, so a sample can be placed by walking
  // once rather than re-measuring the line for every point.
  const cumulative: number[] = [0];
  for (let i = 1; i < coordinates.length; i++) {
    cumulative.push(cumulative[i - 1]! + distance(coordinates[i - 1]!, coordinates[i]!));
  }

  const samples: { distance: number; position: Position }[] = [];
  let vertex = 0;

  for (let i = 0; i < count; i++) {
    const along = (total * i) / (count - 1);

    // Advance to the segment this sample falls in. Monotonic, so the whole loop
    // is linear rather than a search per sample.
    while (vertex < cumulative.length - 2 && cumulative[vertex + 1]! < along) vertex++;

    const segmentStart = cumulative[vertex]!;
    const segmentLength = cumulative[vertex + 1]! - segmentStart;
    const from = coordinates[vertex]!;
    const to = coordinates[vertex + 1]!;

    if (segmentLength === 0) {
      samples.push({ distance: along, position: from });
      continue;
    }

    /*
     * Interpolated linearly in degrees, which is right at this scale and wrong
     * at continental ones. A hole is a few hundred metres: the divergence from
     * the great circle over that distance is well under a millimetre, far below
     * the metre-scale posting of any elevation source this will sample. The
     * *measurements* are all spherical — see `distance` — this is only choosing
     * where to take a sample.
     */
    const fraction = (along - segmentStart) / segmentLength;
    samples.push({
      distance: along,
      position: [
        from[0] + (to[0] - from[0]) * fraction,
        from[1] + (to[1] - from[1]) * fraction,
      ],
    });
  }

  return samples;
}

/** Summarise sampled elevations into the numbers a designer reads. */
export function summarizeProfile(points: readonly ProfilePoint[]): ElevationProfile {
  const known = points.filter((p) => p.elevation !== null);

  if (known.length === 0) {
    return {
      points,
      netGain: null,
      totalClimb: 0,
      totalDescent: 0,
      minElevation: null,
      maxElevation: null,
      steepestGrade: null,
      missing: points.length,
    };
  }

  let totalClimb = 0;
  let totalDescent = 0;
  let steepestGrade: number | null = null;

  for (let i = 1; i < known.length; i++) {
    const previous = known[i - 1]!;
    const current = known[i]!;
    const rise = current.elevation! - previous.elevation!;
    const run = current.distance - previous.distance;

    if (rise > 0) totalClimb += rise;
    else totalDescent -= rise;

    if (run > 0) {
      const grade = Math.abs(rise / run);
      if (steepestGrade === null || grade > steepestGrade) steepestGrade = grade;
    }
  }

  /*
   * Net gain needs the *real* endpoints, not the first and last samples that
   * happened to carry data. A profile missing its tee would otherwise report
   * the gain from wherever the data started, which describes a different hole —
   * and this number goes on to change par, so a plausible wrong value is the
   * worst outcome available.
   */
  const teeElevation = points[0]?.elevation ?? null;
  const targetElevation = points.at(-1)?.elevation ?? null;

  return {
    points,
    netGain:
      teeElevation !== null && targetElevation !== null ? targetElevation - teeElevation : null,
    totalClimb,
    totalDescent,
    minElevation: Math.min(...known.map((p) => p.elevation!)),
    maxElevation: Math.max(...known.map((p) => p.elevation!)),
    steepestGrade,
    missing: points.length - known.length,
  };
}

/**
 * Past this, the PDGA's multiplier of 3 is likely an understatement.
 *
 * `[SKILL]` p2: "In cases where the slope is greater than 10% up or down, the
 * multiplier is likely greater than 3. Only testing and experience can provide
 * a good estimate." So the app keeps using 3 and flags the hole rather than
 * inventing a bigger number.
 */
export const STEEP_GRADE = 0.1;
