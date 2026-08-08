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

/**
 * How hard to smooth a profile before reading its shape.
 *
 * A reading preference, not a property of the course — see `prefs.ts` in the
 * web app. It changes what the chart draws and the shape statistics below it.
 * It **cannot** change `netGain`, and therefore cannot change a par.
 */
export type Smoothing = 'off' | 'light' | 'medium' | 'strong';

/**
 * Smoothing windows, in metres of ground.
 *
 * Metres rather than samples, because a profile is always 64 points however
 * long the hole is: a 100m hole samples every 1.6m and a 400m hole every 6.3m,
 * so a window counted in samples would smooth a short hole savagely and a long
 * one barely. In metres it means the same thing on every hole.
 *
 * The sizes are pinned to the data rather than picked for feel. `light` is one
 * posting of the global model (~10m) — the width of the sampling staircase and
 * nothing wider, so it removes the artifact and leaves the terrain: measured
 * against ground truly falling at 8%, it takes a raw reading of 16.8% down to
 * 8.6%. `medium` spans a few postings, which is what a long hole needs once 64
 * samples no longer resolve a 10m grid. `strong` is for reading the shape of a
 * hillside rather than a hole.
 *
 * These are display choices and are labelled as such wherever they are applied.
 * Nothing here is a PDGA figure and nothing here reaches par.
 */
export const SMOOTHING_METERS: Record<Smoothing, number> = {
  off: 0,
  light: 10,
  medium: 25,
  strong: 50,
};

/**
 * Smooth the elevations along a profile, leaving gaps as gaps.
 *
 * ## Why this is removing an artifact rather than hiding data
 *
 * Elevation is read by nearest neighbour from a raster — the same rule the
 * resampler used to write it, because bilinear would smear a nodata cell into
 * its neighbours. That means consecutive samples inside one DEM cell come back
 * *identical*, and the sample that crosses into the next cell carries the whole
 * step. On the global model, 10m cells sampled every 4.7m produce grades that
 * alternate between 0% and 17% down ground that genuinely falls at 8%.
 *
 * So the raw series is not the ground: it is the ground plus a staircase whose
 * width we know. Averaging over that width is what recovers the terrain.
 *
 * Gaussian rather than a box average, so a real ridge keeps its height instead
 * of being clipped — a 20m mound survives light smoothing at 118 of its 120m.
 *
 * `windowMeters` is the width of the kernel's ±1σ band: the filter averages
 * over about that much ground, and is truncated at twice it, which captures
 * ~95% of the mass. Getting this relationship wrong is easy and quiet — with
 * sigma a quarter of the window the kernel barely reaches its own neighbours at
 * 4.7m sample spacing and leaves a 16% staircase reading 12.7%, which looks
 * like smoothing and is not.
 *
 * **The limit is sampling, not filtering.** A profile is 64 points however long
 * the hole, so a 450m hole samples every 7m — which under-samples a 10m DEM,
 * and no window recovers what was never measured. Long holes need `medium`.
 */
export function smoothProfile(
  points: readonly ProfilePoint[],
  windowMeters: number,
): ProfilePoint[] {
  if (windowMeters <= 0 || points.length < 3) return [...points];

  const sigma = windowMeters / 2;
  const limit = windowMeters;
  const twoSigmaSquared = 2 * sigma * sigma;

  /*
   * The window stops at a gap rather than reaching over it.
   *
   * The chart already refuses to draw a line across missing data, on the
   * grounds that the ground there is unknown. Averaging across it would be the
   * same claim made quietly, so the filter obeys the same rule: a run of known
   * samples is smoothed against itself and nothing else.
   */
  const accumulate = (from: number, step: -1 | 1, at: ProfilePoint) => {
    let sum = 0;
    let weight = 0;
    for (let i = from; i >= 0 && i < points.length; i += step) {
      const other = points[i]!;
      if (other.elevation === null) break;
      const gap = Math.abs(other.distance - at.distance);
      if (gap > limit) break;
      const w = Math.exp(-(gap * gap) / twoSigmaSquared);
      sum += w * other.elevation;
      weight += w;
    }
    return { sum, weight };
  };

  return points.map((point, i) => {
    if (point.elevation === null) return point;
    const back = accumulate(i, -1, point);
    const forward = accumulate(i + 1, 1, point);
    const weight = back.weight + forward.weight;
    return weight === 0 ? point : { ...point, elevation: (back.sum + forward.sum) / weight };
  });
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
  /** The smoothing window these numbers were read through, in metres. 0 is raw. */
  smoothingMeters: number;
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

/**
 * Summarise sampled elevations into the numbers a designer reads.
 *
 * `smoothingMeters` widens a window over the raw samples first — see
 * `smoothProfile`. Everything about the *shape* of the hole is then read
 * through that window, because the shape is what the sampling artifact
 * corrupts: total climb counts every noise wiggle twice, and steepest grade is
 * simply the largest artifact on the hole.
 *
 * **`netGain` is the exception, and deliberately so.** It is read from the raw
 * endpoints, always, whatever the smoothing is set to. It is the term that
 * reaches the PDGA's effective-length formula and can move a par by two
 * strokes, and a par that changed because somebody adjusted a chart preference
 * would be indefensible. Smoothing is for reading; this number is for
 * measuring.
 */
export function summarizeProfile(
  raw: readonly ProfilePoint[],
  smoothingMeters = 0,
): ElevationProfile {
  const points = smoothProfile(raw, smoothingMeters);
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
      smoothingMeters,
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
   *
   * Read from `raw`, never from the smoothed series. A tee's elevation is the
   * height of one specific patch of ground, and the smoothing window at an
   * endpoint is one-sided — it can only pull the value towards the hole, which
   * on a hole that starts on a knoll would quietly shave metres off the rise.
   * The chart may be filtered; the measurement may not.
   */
  const teeElevation = raw[0]?.elevation ?? null;
  const targetElevation = raw.at(-1)?.elevation ?? null;

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
    smoothingMeters,
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

/* ------------------------------------------------------------------------- */
/* Axis ticks                                                                 */
/* ------------------------------------------------------------------------- */

/** Steps a reader can do arithmetic in, per decade. */
const NICE_STEPS = [1, 2, 2.5, 5, 10];

/**
 * A round step covering `span` in roughly `count` divisions.
 *
 * The reason an axis is labelled 980, 1000, 1020 rather than 983.4, 1006.7:
 * the numbers on a chart are there to be read off and subtracted, and nobody
 * subtracts 983.4 from 1006.7 in their head.
 */
export function niceStep(span: number, count = 4): number {
  if (!(span > 0)) return 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = NICE_STEPS.find((s) => s * magnitude >= rough) ?? 10;
  return step * magnitude;
}

/**
 * Round tick values spanning `[low, high]`, with the bounds they imply.
 *
 * The axis is widened out to whole steps rather than clipped to the data, so
 * the first and last gridlines land exactly on the top and bottom of the plot.
 * An axis whose end labels float slightly inside the frame reads as a mistake.
 *
 * `minSpan` is a floor for ground that is genuinely flat: without it the axis
 * would divide a range of zero, and a hole that falls four centimetres would be
 * drawn as a dramatic hillside with an axis of meaningless precision.
 */
export function axisTicks(
  low: number,
  high: number,
  { count = 4, minSpan = 1 }: { count?: number; minSpan?: number } = {},
): { ticks: number[]; low: number; high: number } {
  let from = low;
  let to = high;

  if (to - from < minSpan) {
    const middle = (from + to) / 2;
    from = middle - minSpan / 2;
    to = middle + minSpan / 2;
  }

  const step = niceStep(to - from, count);
  const axisLow = Math.floor(from / step) * step;
  const axisHigh = Math.ceil(to / step) * step;

  const ticks: number[] = [];
  // Stepped by index rather than by repeated addition: accumulating a float
  // step drifts, and the drift shows up as a label reading 1019.9999999.
  const steps = Math.round((axisHigh - axisLow) / step);
  for (let i = 0; i <= steps; i++) ticks.push(axisLow + i * step);

  return { ticks, low: axisLow, high: axisHigh };
}
