import { cn } from '@hyzerlines/design';
import { holeName, type Hole, type PairView } from '@hyzerlines/core';

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
      className="h-4 w-full"
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

/**
 * The route, as a schematic: a pad, a dashed flight, a basket.
 *
 * Not the real geometry — at 52 by 30 pixels a real fairway is a smudge — but
 * the same three marks the map draws, in the same order. It says "tee here,
 * basket there" and, once fairways are shaped, roughly which way the hole bends.
 */
function RouteSchematic({ bend }: { bend: number }) {
  // Clamped, so a hairpin dogleg draws as a strong curve rather than a knot.
  const pull = Math.max(-14, Math.min(14, bend));
  return (
    <svg width="52" height="30" viewBox="0 0 52 30" fill="none" aria-hidden="true">
      <path
        d={`M6 24 Q ${26 + pull} ${16 + pull / 2} 44 7`}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2.6 2.6"
        strokeLinecap="round"
        opacity="0.6"
      />
      <rect x="2" y="23" width="6" height="3.4" rx="0.8" fill="currentColor" opacity="0.75" />
      <circle cx="46" cy="6" r="2.6" fill="currentColor" />
      <path d="M46 3.4 V9.6" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export function HoleTile({
  hole,
  view,
  profile,
  bend,
  units,
  selected,
  shrunk,
  onSelect,
}: {
  hole: Hole;
  view: PairView | null;
  profile: HoleProfile | null;
  /**
   * How far the shot leaves the straight line, as a fraction of its length.
   *
   * Measured off the fairway the map is drawing, so a tile showing a dogleg is
   * showing one the designer routed. Zero for a hole nobody has bent, which is
   * the honest schematic for a straight line between two points.
   */
  bend: number;
  units: UnitSystem;
  selected: boolean;
  /** The rail has given its width to the detail column beside it. */
  shrunk: boolean;
  onSelect: () => void;
}) {
  const length = view?.measurement.effective;
  const par = view?.par;

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
          'flex w-full items-stretch overflow-hidden rounded-md text-left',
          'transition-[height,background-color] duration-normal ease-standard',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          selected
            ? 'bg-accent-soft ring-1 ring-inset ring-border-accent'
            : 'bg-surface-tile hover:bg-surface-hover',
          shrunk ? 'h-10' : 'h-[52px]',
        )}
      >
        {/*
          The number, in its own block down the left edge.

          Its own block rather than bled across the tile, because it is the one
          part that survives the shrink — and something that has to stay legible
          at 104px while two drawings disappear around it cannot be a background
          treatment. It takes the accent when selected, which is the only strong
          colour in the rail and therefore unmistakable in a list of eighteen.
        */}
        <span
          aria-hidden="true"
          className={cn(
            'grid w-8 shrink-0 place-items-center text-base font-bold tabular-nums leading-none',
            selected ? 'text-text-accent' : 'text-text-secondary',
          )}
        >
          {hole.number}
        </span>

        <span className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-1 pr-2">
          {/*
            Side by side while there is room, stacked once there is not. The two
            figures are the tile at 104px — dropping either would leave a number
            rail that says less than the map's own hole badges do.
          */}
          <span
            className={cn(
              'flex min-w-0 gap-1.5',
              shrunk ? 'flex-col items-start gap-0.5' : 'items-center',
            )}
          >
            <span
              className={cn(
                'min-w-0 truncate text-[11px] tabular-nums leading-none',
                selected ? 'text-text-primary' : 'text-text-secondary',
              )}
            >
              {length == null ? '—' : formatDistance(length, units)}
            </span>
            <span className="shrink-0 text-[9px] uppercase leading-none tracking-[0.04em] text-text-muted">
              {par == null ? 'par —' : `par ${par}`}
            </span>
            {/*
              The two drawings are the first thing to go, and they go by being
              hidden rather than by being a different tile. See the note above.
            */}
            {!shrunk && (
              <span className="ml-auto shrink-0 text-text-muted">
                <RouteSchematic bend={bend * 28} />
              </span>
            )}
          </span>
          {!shrunk && (
            <span className={selected ? 'text-text-accent' : 'text-text-muted'}>
              <ElevationSpark profile={profile} />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
