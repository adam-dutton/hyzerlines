import { useId } from 'react';
import { axisTicks, STEEP_GRADE, type ElevationProfile as Profile } from '@hyzerlines/core';

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
 * ## It is exaggerated, and the axis is how you find out by how much
 *
 * A hole is a few hundred metres long and falls a few metres. Drawn to scale it
 * would be a horizontal line, so the vertical axis is stretched to fill the
 * frame — which means the *slope you see is not the slope on the ground*. Every
 * chart of terrain does this and most stay quiet about it. Here the elevations
 * are labelled up the left edge, so the exaggeration is something you can read
 * off rather than something you have to be warned about.
 *
 * ## The aspect ratio is uniform, deliberately
 *
 * An earlier version used `preserveAspectRatio="none"` to stretch a fixed
 * viewBox across whatever width the panel had. That is fine for a bare line and
 * impossible once there is type in the drawing: non-uniform scaling stretches
 * glyphs horizontally, so the tick labels would render wider than tall and
 * differently at every panel width.
 */

/*
 * The frame, in user units, at roughly one unit per CSS pixel — the panel is a
 * fixed 18rem wide, so keeping the viewBox near its rendered size means font
 * sizes below read as the pixel sizes they very nearly are.
 */
const WIDTH = 264;
const HEIGHT = 96;

/** Left gutter, holding the elevation labels. */
const GUTTER = 30;

const PLOT_LEFT = GUTTER;
const PLOT_RIGHT = WIDTH - 4;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 74;

/** Where the tee / length / basket row sits, inside the SVG so it stays aligned. */
const FOOT_Y = 90;

/**
 * The smallest elevation span the axis will show, in display units.
 *
 * Ground that is genuinely flat has a range near zero, and an axis divided over
 * that would label a hole falling four centimetres with meaningless precision
 * and draw it as a dramatic hillside. Ten feet, or three metres, is the floor —
 * below it the line sits flat in a frame that says so.
 */
const MIN_SPAN = { imperial: 10, metric: 3 } as const;

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
  toDisplay: (meters: number) => number,
  yFor: (display: number) => number,
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
      x:
        span === 0 ? PLOT_LEFT : PLOT_LEFT + (point.distance / span) * (PLOT_RIGHT - PLOT_LEFT),
      y: yFor(toDisplay(point.elevation)),
    });
  }
  if (run.length > 0) runs.push(run);

  const round = (n: number) => Math.round(n * 100) / 100;

  return runs
    .filter((points) => points.length >= 2)
    .map((points) => {
      const line = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`)
        .join(' ');
      const first = points[0]!;
      const last = points.at(-1)!;
      return {
        line,
        area: `${line} L${round(last.x)} ${PLOT_BOTTOM} L${round(first.x)} ${PLOT_BOTTOM} Z`,
      };
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

/** Tick labels drop their decimals only when the step is whole. */
function formatTick(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return value.toFixed(decimals);
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

  const metric = units === 'metric';
  const toDisplay = (meters: number) => (metric ? meters : toFeet(meters));
  const unitLabel = metric ? 'm' : 'ft';

  /*
   * The axis is computed in the reader's own unit, not in metres and converted
   * afterwards. Round numbers do not survive a unit conversion: a tidy 5 m step
   * relabelled in feet becomes 16.4, which is precisely the arithmetic the
   * whole "nice ticks" exercise exists to spare people.
   */
  const axis = axisTicks(toDisplay(low), toDisplay(high), {
    minSpan: MIN_SPAN[units],
  });
  const step = (axis.ticks[1] ?? axis.high) - axis.low;
  const axisSpan = axis.high - axis.low || 1;

  const yFor = (display: number) =>
    PLOT_BOTTOM - ((display - axis.low) / axisSpan) * (PLOT_BOTTOM - PLOT_TOP);

  const paths = segments(profile, span, toDisplay, yFor);
  const steep = profile.steepestGrade !== null && profile.steepestGrade > STEEP_GRADE;

  return (
    <div>
      <SectionTitle>Elevation</SectionTitle>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full text-text-accent"
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

        {/* The unit, once, above the numbers it belongs to. */}
        <text
          x={GUTTER - 4}
          y={PLOT_TOP - 4}
          textAnchor="end"
          className="fill-text-muted text-[8px]"
        >
          {unitLabel}
        </text>

        {/*
          Gridlines and their labels. Drawn under the profile so the ground
          reads as sitting on the chart rather than behind it.
        */}
        <g aria-hidden="true">
          {axis.ticks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  x1={PLOT_LEFT}
                  y1={y}
                  x2={PLOT_RIGHT}
                  y2={y}
                  /*
                   * `border-default`, not `border-subtle`, and a whole pixel.
                   * Subtle at half a pixel antialiases a 7%-opacity line into
                   * nothing — a gridline you cannot see is not a gridline, and
                   * the labels beside it then have nothing to point at.
                   */
                  className="stroke-border-default"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={GUTTER - 6}
                  y={y + 2.5}
                  textAnchor="end"
                  className="fill-text-muted text-[8px] tabular-nums"
                >
                  {formatTick(tick, step)}
                </text>
              </g>
            );
          })}
        </g>

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
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/*
          The ends, named, and inside the drawing so they line up with the plot
          rather than with the panel. A profile with no tee marked is a squiggle.
        */}
        <g aria-hidden="true" className="fill-text-muted text-[8px]">
          <text x={PLOT_LEFT} y={FOOT_Y}>
            Tee
          </text>
          {length !== null && (
            <text x={(PLOT_LEFT + PLOT_RIGHT) / 2} y={FOOT_Y} textAnchor="middle">
              {formatDistance(length, units)}
            </text>
          )}
          <text x={PLOT_RIGHT} y={FOOT_Y} textAnchor="end">
            Basket
          </text>
        </g>
      </svg>

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
            <dd className="text-2xs tabular-nums text-text-primary">
              {formatChange(profile.netGain, units)}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-2xs text-text-secondary">Climb and descent</dt>
          <dd className="text-2xs tabular-nums text-text-primary">
            {formatChange(profile.totalClimb, units)} /{' '}
            {formatChange(-profile.totalDescent, units)}
          </dd>
        </div>
        {profile.steepestGrade !== null && (
          <div className="flex justify-between gap-3">
            <dt className="text-2xs text-text-secondary">Steepest grade</dt>
            <dd className="text-2xs tabular-nums text-text-primary">
              {Math.round(profile.steepestGrade * 100)}%
            </dd>
          </div>
        )}
      </dl>

      {/*
        The vertical is still exaggerated — the axis says by how much, but only
        if you go and read it, and the one thing a reader must not do is take
        the drawn slope at face value.

        Naming the smoothing here rather than only in Settings is the point:
        climb, descent and the grade above are all read through that window, and
        a filtered number presented as a raw measurement is the dishonest
        version of this feature.
      */}
      <p className="mt-1 text-2xs leading-4 text-text-muted">
        Vertical exaggerated.{' '}
        {profile.smoothingMeters > 0
          ? /*
             * Which numbers are filtered, named individually.
             *
             * Not pedantry: smoothing pulls the ends of the curve inward, so on
             * a strongly filtered hole the climb can read less than the net
             * change and the two will not reconcile. That looks like an
             * arithmetic bug unless the reader knows they are measured
             * differently — one through the window, one not at all.
             */
            `Climb, descent and grade smoothed over ${profile.smoothingMeters} m. Net change is unfiltered.`
          : 'Raw samples, unsmoothed.'}
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
