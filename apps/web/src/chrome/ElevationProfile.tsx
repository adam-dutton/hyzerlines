import { useId } from 'react';
import { STEEP_GRADE, type ElevationProfile as Profile } from '@hyzerlines/core';

import { formatDistance, toFeet, type UnitSystem } from '../units';
import type { HoleProfile } from '../survey/useProfiles';
import { SectionTitle } from './propertyRow';

/**
 * The shape of the ground a hole is thrown over.
 *
 * A plan view answers where a hole goes. It cannot answer which way it falls,
 * and on real land that is half the design: a 280ft hole that drops fifteen
 * metres plays like 130ft, and a 280ft hole that climbs the same fifteen plays
 * like a par 4. This is that second dimension, drawn from the elevation source
 * the map is already reading.
 *
 * ## It is exaggerated, and it says so
 *
 * A hole is a few hundred metres long and falls a few metres. Drawn to scale it
 * would be a horizontal line, so the vertical axis is stretched to fill the
 * frame — which means the *slope you see is not the slope on the ground*. Every
 * chart of terrain does this and most of them stay quiet about it. This one puts
 * the elevation range under the drawing, so the picture is read against real
 * numbers rather than mistaken for them.
 */

/* A tall, thin frame in user units. Rendered at whatever width the panel is. */
const WIDTH = 240;
const HEIGHT = 64;

/** Room above and below the line, so the extremes are not clipped to the edge. */
const PAD_Y = 6;

/**
 * The drawing, as one or more polyline segments.
 *
 * More than one because a profile can be partial: a survey may not cover the
 * whole hole, and drawing straight across the gap would invent ground. Each run
 * of consecutive known samples becomes its own path and the gaps stay empty,
 * which reads correctly as "no data here" rather than "flat here".
 */
function segments(
  profile: Profile,
  span: number,
  low: number,
  range: number,
): { line: string; area: string }[] {
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];

  for (const point of profile.points) {
    if (point.elevation === null) {
      if (run.length > 0) runs.push(run);
      run = [];
      continue;
    }
    run.push({
      x: span === 0 ? 0 : (point.distance / span) * WIDTH,
      // SVG y grows downward; elevation grows upward.
      y: HEIGHT - PAD_Y - ((point.elevation - low) / range) * (HEIGHT - PAD_Y * 2),
    });
  }
  if (run.length > 0) runs.push(run);

  return runs
    .filter((points) => points.length >= 2)
    .map((points) => {
      const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
      const first = points[0]!;
      const last = points.at(-1)!;
      return { line, area: `${line} L${last.x} ${HEIGHT} L${first.x} ${HEIGHT} Z` };
    });
}

/** A rise or fall, signed, in the reader's unit. Not `formatDistance`: sign matters. */
function formatChange(meters: number, units: UnitSystem): string {
  const value = units === 'metric' ? meters : toFeet(meters);
  const rounded = Math.round(value);
  const suffix = units === 'metric' ? 'm' : 'ft';
  // An explicit sign on both directions. "3 ft" beside a hole that drops is the
  // kind of ambiguity that puts the wrong par on a scorecard.
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)} ${suffix}`;
}

export function ElevationProfileChart({
  entry,
  length,
  units,
}: {
  entry: HoleProfile;
  /** The shot's own measured length, for the horizontal axis label. */
  length: number | null;
  units: UnitSystem;
}) {
  const gradientId = useId();
  const { profile, feedsPar } = entry;

  const low = profile.minElevation;
  const high = profile.maxElevation;
  const span = profile.points.at(-1)?.distance ?? 0;

  if (low === null || high === null) return null;

  /*
   * A floor under the vertical range.
   *
   * Genuinely flat ground has a range of zero, and scaling to it would put the
   * line at an arbitrary height and amplify centimetres of sampling noise into
   * a dramatic hillside. A metre of headroom makes flat ground *look* flat,
   * which is the honest drawing.
   */
  const range = Math.max(high - low, 1);
  const paths = segments(profile, span, low, range);

  const steep = profile.steepestGrade !== null && profile.steepestGrade > STEEP_GRADE;

  return (
    <div>
      <SectionTitle>Elevation</SectionTitle>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full text-text-accent"
        preserveAspectRatio="none"
        role="img"
        aria-label={
          profile.netGain === null
            ? 'Ground profile from tee to basket'
            : `Ground profile from tee to basket, ${formatChange(profile.netGain, units)} net`
        }
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {paths.map((path) => (
          <path key={path.line} d={path.area} fill={`url(#${gradientId})`} />
        ))}
        {paths.map((path) => (
          <path
            key={path.line}
            d={path.line}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            /*
             * Without this the non-uniform scale — a 240-unit box stretched to
             * whatever the panel is wide, and 64 units tall — would make the
             * stroke thicker on one axis than the other.
             */
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* The ends, named. A profile with no tee marked is just a squiggle. */}
      <div className="flex justify-between text-2xs text-text-muted">
        <span>Tee</span>
        {length !== null && <span>{formatDistance(length, units)}</span>}
        <span>Basket</span>
      </div>

      <dl className="mt-1.5 space-y-0.5">
        {profile.netGain !== null && (
          <div className="flex justify-between gap-3">
            {/*
              "Net change", not "Tee to basket" — which is what the row a few
              inches above this one is called, and it holds a distance. Two rows
              with one label reading `1476 ft` and `+202 ft` is a panel arguing
              with itself.
            */}
            <dt className="text-2xs text-text-secondary">Net change</dt>
            <dd className="font-mono text-2xs tabular-nums text-text-primary">
              {formatChange(profile.netGain, units)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-2xs text-text-secondary">Climb and descent</dt>
          <dd className="font-mono text-2xs tabular-nums text-text-primary">
            {formatChange(profile.totalClimb, units)} /{' '}
            {formatChange(-profile.totalDescent, units)}
          </dd>
        </div>
        {profile.steepestGrade !== null && (
          <div className="flex justify-between gap-3">
            <dt className="text-2xs text-text-secondary">Steepest grade</dt>
            <dd className="font-mono text-2xs tabular-nums text-text-primary">
              {Math.round(profile.steepestGrade * 100)}%
            </dd>
          </div>
        )}
      </dl>

      {/*
        The vertical scale, spelled out, because the drawing above is stretched.
        See the note at the top of this file.
      */}
      <p className="mt-1 text-2xs leading-4 text-text-muted">
        Vertical exaggerated. The chart spans {formatChange(high - low, units)} of elevation.
      </p>

      {/*
        `[SKILL]` p2: past a 10% slope "the multiplier is likely greater than 3.
        Only testing and experience can provide a good estimate." So the app keeps
        using 3 and says the number is probably conservative, rather than
        inventing a bigger multiplier nobody published.
      */}
      {steep && (
        <p className="mt-1 text-2xs leading-4 text-status-warning">
          Steeper than 10%. The PDGA&rsquo;s ×3 elevation multiplier likely understates this
          hole; only testing on the ground can say by how much.
        </p>
      )}

      {profile.missing > 0 && (
        <p className="mt-1 text-2xs leading-4 text-text-muted">
          {profile.missing} of {profile.points.length} samples had no data — the gaps are left
          empty rather than drawn across.
        </p>
      )}

      {/*
        Where the numbers came from, always, and whether they moved the par.

        The global model is roughly 10m posted in the US and 30m elsewhere, and
        the PDGA multiplies elevation by three — so a par that moved on it could
        be two strokes wrong from vertical error alone. It draws the chart and
        stops there, and this is the line that says so.
      */}
      <p className="mt-1 text-2xs leading-4 text-text-muted">
        {feedsPar
          ? 'From your imported survey. This elevation is included in the par above.'
          : 'From global elevation data, accurate to roughly 10m. Too coarse to set par — import a survey to include elevation.'}
      </p>
    </div>
  );
}
