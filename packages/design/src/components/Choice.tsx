import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '../cn.js';

/**
 * The two boxes you tick: a checkbox and a radio.
 *
 * One file, because they are one drawing with two corner radii and two marks.
 * Both are 15px, both fill with the accent when set, and both carry their mark
 * in ink — so a form mixing them reads as one control repeated rather than as
 * two families.
 *
 * ## Why not a `Switch`
 *
 * A switch commits the moment the thumb slides; these do not. Everything in
 * this app that takes effect immediately — a corridor's visibility, a layer —
 * is a `Switch`, and everything that is an *answer* to a question the panel
 * asked is one of these. Which end of a hole a measurement runs from is an
 * answer, not a setting, and a row of switches would have implied that turning
 * two of them on was possible.
 *
 * ## The input is real, and it is still the control
 *
 * `appearance-none` on the native input rather than a hidden input with a
 * painted `span` beside it. The visible box *is* the checkbox, so it keeps
 * focus, keyboard behaviour, `:disabled`, form participation and the arrow-key
 * roving a radio group gets for free — every one of which has to be rebuilt,
 * usually badly, by the painted-span approach.
 */

type ChoiceProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'size'> & {
  /** Accessible name. Required — these sit on rows that label them visually. */
  label: string;
};

const base = cn(
  'h-[15px] w-[15px] shrink-0 appearance-none bg-surface-field',
  'transition-colors duration-fast',
  'checked:bg-accent-solid',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
  'focus-visible:ring-offset-2 focus-visible:ring-offset-focus-ring-offset',
  'disabled:cursor-not-allowed disabled:opacity-40',
);

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(function Checkbox(
  { label, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      className={cn(
        base,
        'rounded-[4px] shadow-[inset_0_0_0_1px_var(--color-border-strong)]',
        // The outline goes when the fill arrives: a ticked box is a solid, and
        // an edge on top of it would read as a second border.
        'checked:shadow-none',
        /*
         * The tick is a background image, because an `<input>` cannot have
         * children and `::before` on a replaced element is not reliably drawn.
         * The mark itself lives in `styles.css` as `--hz-check-mark`: it is a
         * data URI, and a data URI cannot read a custom property, so the ink
         * colour is written into it literally. That is safe precisely because
         * this mark only ever sits on the accent fill.
         */
        'bg-center bg-no-repeat checked:bg-[image:var(--hz-check-mark)]',
        className,
      )}
      {...rest}
    />
  );
});

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(function Radio(
  { label, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type="radio"
      aria-label={label}
      className={cn(
        base,
        'rounded-full shadow-[inset_0_0_0_1.5px_var(--color-border-strong)]',
        /*
         * A ring and a dot, not a filled disc.
         *
         * The dot is drawn as an inset shadow rather than a background image,
         * which is what keeps the ring visible around it: the accent ring is
         * 1.5px, the gap is the next 2px, and the dot is the remaining 7px. A
         * filled 15px disc would lose that structure and read as a checkbox
         * with the wrong corners.
         */
        'checked:bg-transparent checked:shadow-[inset_0_0_0_1.5px_var(--color-accent-solid)]',
        'checked:bg-[radial-gradient(circle,var(--color-accent-solid)_3.5px,transparent_3.5px)]',
        className,
      )}
      {...rest}
    />
  );
});
