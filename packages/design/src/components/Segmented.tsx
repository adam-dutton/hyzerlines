import { cn } from '../cn.js';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Secondary line in the tooltip — provenance, units, whatever disambiguates. */
  hint?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required: the group needs an accessible name of its own. */
  label: string;
  /**
   * `ghost` tints the selected option and leaves the rest bare. `solid` sets the
   * whole group in a recessed track and fills the selected option.
   *
   * The distinction is how much of the interface the choice governs. A control
   * that switches which number a cell holds is incidental, and `ghost` keeps it
   * quiet. The focus switcher changes the palette, the left panel and what wins
   * a click — it is the most consequential control on screen, and in the top bar
   * it has to hold its own against a solid `Share` button two columns over.
   */
  variant?: 'ghost' | 'solid';
  /** `md` is for the top bar, where the segments are a primary target. */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A small set of mutually exclusive choices, all visible at once.
 *
 * Deliberately not a dropdown. These are options you switch between constantly
 * while comparing — basemaps, unit systems, layouts — and hiding them behind a
 * click to save a few pixels of chrome trades a frequent action for a rare one.
 * Above about four options this stops being the right control.
 *
 * Implemented as a real radiogroup, so arrow keys move between options and
 * screen readers announce the selected one.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  variant = 'ghost',
  size = 'sm',
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'flex items-center gap-0.5',
        // The track is what makes a solid group read as one control rather than
        // as a row of buttons that happen to be adjacent.
        //
        // 7px is not a rung on the radius ladder and is not meant to be: it is
        // the button's 5px plus the 2px of padding around it, which is what
        // keeps the track's inner corner concentric with the button it holds.
        variant === 'solid' ? 'rounded-[7px] bg-surface-tile p-0.5' : '',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            // Roving tabindex: the group is one tab stop, arrows move within it.
            tabIndex={selected ? 0 : -1}
            title={option.hint ? `${option.label} — ${option.hint}` : option.label}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!delta) return;
              e.preventDefault();

              const i = options.findIndex((o) => o.value === value);
              const nextIndex = (i + delta + options.length) % options.length;
              const next = options[nextIndex];
              if (!next) return;

              onChange(next.value);

              // Focus has to move with the selection. Without this the old button
              // keeps focus while dropping to tabIndex -1, which strands the user
              // on an untabbable element — the next Tab jumps out of the group.
              const sibling = e.currentTarget.parentElement?.children[nextIndex];
              if (sibling instanceof HTMLElement) sibling.focus();
            }}
            className={cn(
              'flex h-6 items-center justify-center rounded-sm transition-colors duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              // Fixed height rather than vertical padding, so a segment lines up
              // with the 26px fields beside it whatever the label's font metrics.
              size === 'md' ? 'px-3 text-xs' : 'px-2.5 text-2xs',
              // Weight carries the selection as well as colour does, so the
              // control still reads as chosen in a screenshot printed in grey.
              selected ? 'font-semibold' : 'font-normal',
              selected
                ? variant === 'solid'
                  ? 'bg-accent-solid text-accent-text-on-solid'
                  : 'bg-accent-soft text-text-accent'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
