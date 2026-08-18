import { cn } from '@hyzerlines/design';
import { holeName, type Hole, type PairView, type Position } from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import type { HoleProfile } from '../survey/useProfiles';

/**
 * One hole, as the rail lists it.
 *
 * Four facts, every time: the number, the length and par, the shape of the
 * route, and the ground it runs over. A course is chosen through this list far
 * more often than through the map — you know you want hole 7, and the map is
 * showing you hole 2 — so the tile has to be identifiable without reading it
 * word by word. The number does that at a glance, and the two drawings do it for
 * the holes whose numbers you have not memorised yet.
 *
 * ## It has two sizes, and they are different jobs
 *
 * Open, the rail is a list you scan: the tile is 52px and carries everything.
 * Once a hole is picked, the list becomes a rail you *step through* — the detail
 * column beside it needs the width — so the tile drops to 40px and keeps the
 * number, the length and the par. Nothing else survives that width, and nothing
 * else needs to: you are already looking at the hole.
 *
 * The two are one component rather than two, because they are one row in two
 * states and the transition between them is a width animation. Two components
 * would mean the list re-mounting every time you selected a hole, which loses
 * the scroll position — and losing your place in an eighteen-hole rail is the
 * exact thing this list exists to prevent.
 */

/** The elevation line, drawn to fill its box on both axes. */
function ElevationSpark({ profile }: { profile: HoleProfile | null }) {
  const points = profile?.profile.points ?? [];
  const heights = points
    .map((point) => point.elevation)
    .filter((value): value is number => value !== null);

  // A flat line is a lie about ground nobody has measured. No survey, no line.
  if (heights.length < 2) return null;

  const low = Math.min(...heights);
  const high = Math.max(...heights);
  /*
   * A dead-flat hole would divide by zero, and it is also a real answer: the
   * line sits on the baseline rather than being withheld, because "measured,
   * and flat" is worth saying and looks nothing like "not measured".
   */
  const span = high - low || 1;

  const at = (index: number, value: number) =>
    `${(index / (heights.length - 1)) * 100} ${16 - ((value - low) / span) * 13}`;

  const line = heights.map((value, index) => `${index === 0 ? 'M' : 'L'}${at(index, value)}`);

  return (
    <svg
      viewBox="0 0 100 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="block h-4 w-full"
    >
      <path d={`${line.join(' ')} L100 16 L0 16 Z`} fill="currentColor" opacity="0.16" />
      <path
        d={line.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        /* So the stroke stays a hairline through the non-uniform scale. */
        vectorEffect="non-scaling-stroke"
        opacity="0.75"
      />
    </svg>
  );
}

const TILE_W = 52;
const TILE_H = 30;
/** Room for the pad and the basket, which are drawn *on* the endpoints. */
const TILE_PAD = 5;

/**
 * The routed line, fitted to the tile.
 *
 * Turned so the shot runs left to right, which is the one decision here that is
 * not arithmetic. The tile is landscape and a hole is long and thin, so any
 * other orientation wastes most of the box — and once every hole is drawn along
 * the same axis, the tiles become comparable: the deviation you see above or
 * below the line is the hole's shape rather than its compass bearing. It is also
 * what the map does when you pick the hole, which turns to face down the shot.
 *
 * Longitude is scaled by the cosine of the latitude before anything else. Skip
 * that and every hole outside the tropics is drawn wider than it is, so a
 * straight hole at 45° reads as a shallow dogleg.
 *
 * Returns null when there is nothing to draw, so the caller can fall back to the
 * straight schematic rather than render an empty box.
 */
function fitRoute(
  route: readonly Position[] | null,
): { d: string; start: [number, number]; end: [number, number] } | null {
  if (!route || route.length < 2) return null;
  const first = route[0];
  const last = route[route.length - 1];
  if (!first || !last) return null;

  const lonScale = Math.cos((first[1] * Math.PI) / 180);
  const flat = route.map(([lon, lat]): [number, number] => [
    (lon - first[0]) * lonScale,
    lat - first[1],
  ]);
  const end = flat[flat.length - 1]!;
  const heading = Math.atan2(end[1], end[0]);
  if (!Number.isFinite(heading)) return null;

  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  // Rotated so the tee-to-basket run lies along +x.
  const turned = flat.map(([x, y]): [number, number] => [
    x * cos + y * sin,
    -x * sin + y * cos,
  ]);

  const xs = turned.map(([x]) => x);
  const ys = turned.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  if (spanX <= 0 && spanY <= 0) return null;

  /*
   * One scale for both axes. Fitting each independently would stretch a
   * near-straight hole's few metres of wander across the full height and draw a
   * gentle bend as a hairpin — the tile would be describing a hole that is not
   * there.
   */
  const usableX = TILE_W - TILE_PAD * 2;
  const usableY = TILE_H - TILE_PAD * 2;
  const scale = Math.min(
    spanX > 0 ? usableX / spanX : Infinity,
    spanY > 0 ? usableY / spanY : Infinity,
  );
  if (!Number.isFinite(scale)) return null;

  const offsetX = (TILE_W - spanX * scale) / 2;
  const offsetY = (TILE_H - spanY * scale) / 2;
  const place = ([x, y]: [number, number]): [number, number] => [
    offsetX + (x - minX) * scale,
    // Inverted: SVG y grows downward, and north should be up.
    TILE_H - offsetY - (y - minY) * scale,
  ];

  const points = turned.map(place);
  const d = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  return { d, start: points[0]!, end: points[points.length - 1]! };
}

/**
 * The route: a pad, a dashed flight, a basket.
 *
 * The real routed line now, not a single-bend approximation of it. The old
 * version drew one quadratic curve whose bulge came from the furthest point off
 * the straight line, which collapsed every shape into "bends this much, this
 * way" — a double dogleg and a long gentle arc drew identically, and those are
 * the two holes a designer most wants to tell apart in a list.
 *
 * Still a schematic: at 52 by 30 pixels there is no room for corridor width or
 * for the ground underneath. What it now gets right is the *shape*.
 */
function RouteSchematic({ route }: { route: readonly Position[] | null }) {
  const fitted = fitRoute(route);

  // Nothing routed and nothing to measure: the honest drawing of a hole with no
  // pair yet is the generic one.
  const d = fitted?.d ?? `M6 24 L44 7`;
  const start = fitted?.start ?? [6, 24];
  const end = fitted?.end ?? [44, 7];

  return (
    <svg
      width={TILE_W}
      height={TILE_H}
      viewBox={`0 0 ${TILE_W} ${TILE_H}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2.6 2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      <rect
        x={start[0] - 3}
        y={start[1] - 1.7}
        width="6"
        height="3.4"
        rx="0.8"
        fill="currentColor"
        opacity="0.75"
      />
      <circle cx={end[0]} cy={end[1]} r="2.6" fill="currentColor" />
      <path
        d={`M${end[0]} ${end[1] - 2.6} V${end[1] + 2.6}`}
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

export function HoleTile({
  hole,
  view,
  profile,
  route,
  maxLength,
  units,
  selected,
  shrunk,
  onSelect,
}: {
  hole: Hole;
  view: PairView | null;
  profile: HoleProfile | null;
  /**
   * The shot, as the map draws it: tee, any bends the designer routed, basket.
   *
   * Null for a hole with no pair yet, which draws the generic schematic — there
   * is no route to be accurate about.
   */
  route: readonly Position[] | null;
  /**
   * The longest hole on the course, in the same units the measurements are in.
   *
   * The tile draws its elevation spark to this scale rather than to its own
   * width — see the note by `spark`. Null when nothing on the course is
   * measured yet.
   */
  maxLength: number | null;
  units: UnitSystem;
  selected: boolean;
  /** The rail has given its width to the detail column beside it. */
  shrunk: boolean;
  onSelect: () => void;
}) {
  const length = view?.measurement.effective;
  const par = view?.par;

  /*
   * The spark is as wide as the hole is long, relative to the longest hole.
   *
   * Which makes the bottom of the rail a bar chart nobody had to draw: eighteen
   * tiles stacked, and the one that runs furthest across its tile is the one you
   * walk furthest on. A spark stretched to full width in every tile would throw
   * that away and, worse, would draw a 200ft hole's ground at three times the
   * horizontal scale of a 600ft hole's — so two identical slopes would look
   * nothing alike.
   *
   * Falls back to full width when there is nothing to compare against, which is
   * the honest answer for a one-hole course.
   */
  const spark =
    length != null && maxLength != null && maxLength > 0
      ? Math.max(8, Math.round((length / maxLength) * 100))
      : 100;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        /*
         * Named for the hole, not for the numeral inside it. The tile's visible
         * text is "3" and "par 3" and "412 ft", none of which identifies it out
         * of context — a screen reader reading eighteen of these needs "Hole 3",
         * and `holeName` is what the rest of the interface calls it.
         */
        aria-label={holeName(hole)}
        aria-pressed={selected}
        className={cn(
          'relative flex w-full items-stretch overflow-hidden rounded-md text-left',
          'transition-[height,background-color] duration-normal ease-standard',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          selected
            ? 'bg-accent-soft ring-1 ring-inset ring-border-accent'
            : 'bg-surface-tile hover:bg-surface-hover',
          shrunk ? 'h-10' : 'h-[52px]',
        )}
      >
        {/*
          The number, in its own filled block down the left edge.

          Filled rather than set in the tile, because it is the one part that
          survives the shrink — and something that has to stay legible at 104px
          while two drawings disappear around it cannot be a background
          treatment. Selected, the block itself takes the accent and the numeral
          goes to ink, which is the strongest pair the palette has and therefore
          the one thing findable in a list of eighteen without reading.

          It narrows with the rail rather than holding its width, so the length
          and par keep the room they need in the 104px state.
        */}
        <span
          aria-hidden="true"
          className={cn(
            'grid shrink-0 place-items-center font-bold tabular-nums leading-none',
            'tracking-[-0.03em] transition-[width,font-size] duration-normal ease-standard',
            selected
              ? 'bg-accent-solid text-accent-text-on-solid'
              : 'bg-surface-tile text-text-primary',
            shrunk ? 'w-[30px] text-[15px]' : 'w-11 text-[19px]',
          )}
        >
          {hole.number}
        </span>

        <span
          className={cn(
            'relative flex min-w-0 flex-1 flex-col justify-center gap-0.5 self-stretch',
            shrunk ? 'px-[7px]' : 'px-2.5',
          )}
        >
          {/*
            Side by side while there is room, stacked once there is not. The two
            figures are the tile at 104px — dropping either would leave a number
            rail that says less than the map's own hole badges do.
          */}
          <span
            className={cn(
              'flex min-w-0 gap-1.5',
              // `items-stretch`, not `items-start`. Stacked, the length has to
              // be as wide as the tile before `truncate` has anything to
              // truncate against — packed to the start it sizes to its own text
              // and the tile clips it mid-digit with no ellipsis.
              shrunk ? 'flex-col items-stretch gap-px' : 'items-baseline',
            )}
          >
            <span
              className={cn(
                'min-w-0 truncate tabular-nums leading-[1.1]',
                shrunk ? 'text-[10px]' : 'text-xs',
                selected ? 'text-text-primary' : 'text-text-secondary',
              )}
            >
              {length == null ? '—' : formatDistance(length, units)}
            </span>
            <span
              className={cn(
                'shrink-0 whitespace-nowrap uppercase leading-[1.1] tracking-[0.04em]',
                shrunk ? 'text-[9px]' : 'text-[10px]',
                selected ? 'text-text-secondary' : 'text-text-muted',
              )}
            >
              {par == null ? 'par —' : `par ${par}`}
            </span>
            {/*
              The two drawings are the first thing to go, and they go by being
              hidden rather than by being a different tile. See the note above.
            */}
            {!shrunk && (
              <span
                className={cn(
                  'ml-auto shrink-0 self-center',
                  selected ? 'text-text-accent opacity-90' : 'text-text-primary opacity-45',
                )}
              >
                <RouteSchematic route={route} />
              </span>
            )}
          </span>
          {/*
            Under the figures rather than beside them, and behind them rather
            than below: the ground is context for the numbers, not a third
            column competing with them. At 16px tall against a 52px tile it
            reads as a tint along the bottom edge until you look for it.
          */}
          {!shrunk && (
            <span
              aria-hidden="true"
              style={{ width: `${spark}%` }}
              className={cn(
                'pointer-events-none absolute bottom-0 left-0',
                selected ? 'text-text-accent opacity-80' : 'text-text-primary opacity-30',
              )}
            >
              <ElevationSpark profile={profile} />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
