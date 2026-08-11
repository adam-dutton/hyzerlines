import { cn } from '@hyzerlines/design';
import { holeName, type Hole, type PairView } from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';

/**
 * Every hole at once, as a grid of chips.
 *
 * ## Why a grid and not a list
 *
 * A course is nine or eighteen holes; nine is the practical minimum. As a
 * single-column list that is eighteen rows of about 28px, which does not fit a
 * panel that also has to hold the features of whichever hole you picked — so the
 * list scrolled, and the thing you use to *navigate* eighteen holes could only
 * show eleven of them. Three columns of 40px chips fits all eighteen in six
 * rows, and the panel keeps room for everything below it.
 *
 * It flows left to right and wraps, so 1–18 reads in playing order the way a
 * paragraph does. A front-nine / back-nine pair of columns was tried and reads
 * worse: it puts hole 10 at the top of the screen next to hole 1, which is only
 * correct if you already know the convention.
 *
 * ## The numeral bleeds off the corner
 *
 * 40px of bold type in a 40px box, positioned past the bottom-left corner and
 * clipped by it. The overflow is the design, not an accident of sizing — a
 * number that runs off its own tile reads as a label *on* the tile rather than
 * as a value *in* it, which is what lets it be this large without competing with
 * the par and distance sitting on top of it. It is set low-contrast for the same
 * reason, and brightens to the accent when the hole is selected.
 *
 * Anything that changes the chip height has to change the type size with it, or
 * the glyph stops being clipped and starts being cut off, which looks like a bug
 * rather than a bleed.
 */

/** Bold enough to read as a label at 22% opacity, and clipped by the chip. */
const NUMERAL =
  'pointer-events-none absolute -bottom-3 -left-1 text-[40px] font-bold leading-none tracking-[-0.04em]';

export function HolesGrid({
  holes,
  views,
  units,
  selectedHoleId,
  onSelectHole,
}: {
  /** In playing order. Sorted by the caller, which already had to. */
  holes: readonly Hole[];
  views: ReadonlyMap<string, PairView | null>;
  units: UnitSystem;
  selectedHoleId: string | null;
  onSelectHole: (id: string | null) => void;
}) {
  return (
    <ul className="grid min-h-0 grid-cols-3 gap-1.5 overflow-y-auto px-2.5 pb-2.5">
      {holes.map((hole) => {
        const view = views.get(hole.id) ?? null;
        const selected = hole.id === selectedHoleId;
        const length = view?.measurement.effective;

        return (
          <li key={hole.id}>
            <button
              type="button"
              onClick={() => onSelectHole(selected ? null : hole.id)}
              /*
               * Named for the hole, not for the numeral inside it. The chip's
               * visible text is "3" and "par 3" and "412 ft", none of which
               * identifies it out of context — a screen reader reading eighteen
               * of these needs "Hole 3" and `holeName` is what the rest of the
               * interface calls it.
               */
              aria-label={holeName(hole)}
              aria-pressed={selected}
              className={cn(
                'relative flex h-10 w-full items-center justify-end overflow-hidden rounded-lg px-2',
                'transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                selected
                  ? 'bg-accent-soft ring-1 ring-inset ring-border-accent'
                  : 'bg-surface-tile hover:bg-surface-hover',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  NUMERAL,
                  selected ? 'text-text-accent opacity-90' : 'text-text-primary opacity-20',
                )}
              >
                {hole.number}
              </span>

              {/*
                Par above distance, both right-aligned and both quiet. They sit
                over the numeral, so the contrast between the two layers is
                doing the work a divider would otherwise do.
              */}
              <span className="relative flex flex-col items-end gap-px">
                <span
                  className={cn(
                    'text-[9px] uppercase leading-none tracking-[0.04em]',
                    selected ? 'text-text-secondary' : 'text-text-muted',
                  )}
                >
                  {view?.par == null ? 'par —' : `par ${view.par}`}
                </span>
                <span
                  className={cn(
                    'text-[10px] leading-tight tabular-nums',
                    selected ? 'text-text-primary' : 'text-text-secondary',
                  )}
                >
                  {/*
                    The unit is dropped, and only here. Three chips to a 268px
                    column leaves about 70px each, and "412 ft" in a chip that
                    also holds a 40px numeral is the one place in this app where
                    a unit does not fit. Every other distance carries it, and the
                    hole panel one click away prints the same number in full.
                  */}
                  {length == null ? '—' : formatDistance(length, units).replace(/ (ft|m)$/, '')}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
