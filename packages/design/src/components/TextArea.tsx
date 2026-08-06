import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '../cn.js';

/**
 * A multi-line field that grows with what is in it.
 *
 * A fixed-height box for prose does one of two bad things: it truncates, so the
 * sentence you typed is no longer readable, or it scrolls inside itself, so a
 * three-line description is read three words at a time through a slot. Neither
 * is acceptable for a course description sitting in a panel that has room to
 * spare below it.
 *
 * ## How it grows
 *
 * The wrapper is a one-cell grid holding two things stacked in that cell: the
 * textarea, and a hidden `::after` carrying the same text. The pseudo-element
 * has no fixed height, so the cell is always exactly as tall as the content
 * wants to be, and the textarea stretches to match. No ref, no resize
 * observer, no measuring pass that lags a keystroke behind — see `.hz-autogrow`
 * in `styles.css`.
 *
 * `rows` still works as a floor: a textarea's intrinsic height is its row
 * count, and a grid track is as tall as its tallest item. So notes can open at
 * four lines and still grow to forty.
 *
 * The wrapper owns the border, background and padding; the textarea inside is
 * transparent and unpadded, because the sizer inherits typography but cannot
 * inherit a Tailwind class, and the two have to wrap identically or the box is
 * the wrong height.
 */

interface TextAreaProps extends Omit<ComponentPropsWithoutRef<'textarea'>, 'size' | 'value'> {
  /** Accessible name. Required — map chrome rarely has room for visible labels. */
  label: string;
  /**
   * `bordered` is a conventional field. `bare` reads as text until interacted
   * with, for values that are part of the interface rather than a form.
   */
  variant?: 'bordered' | 'bare';
  size?: 'sm' | 'md';
  /** Controlled only. The sizer needs the text, so there is no uncontrolled mode. */
  value: string;
}

/*
 * `focus-within` rather than `focus`: the ring belongs to the whole control,
 * and the thing actually taking focus is the textarea inside it.
 */
const variants = {
  bordered: cn(
    'rounded-lg border border-border-default bg-surface-inset',
    'focus-within:border-border-accent focus-within:ring-2 focus-within:ring-focus-ring/40',
  ),
  bare: cn(
    'rounded bg-transparent',
    'transition-colors duration-fast',
    'hover:bg-surface-hover',
    'focus-within:bg-surface-inset focus-within:ring-2 focus-within:ring-focus-ring',
  ),
} as const;

const sizes = {
  sm: 'px-1.5 py-0.5 text-sm',
  md: 'px-3.5 py-2.5 text-base',
} as const;

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, variant = 'bordered', size = 'md', value, className, ...rest },
  ref,
) {
  return (
    <div
      // The sizer reads its text from here, so it has to be the same string
      // the textarea is showing — not a truncated or formatted version of it.
      data-value={value}
      className={cn('hz-autogrow', variants[variant], sizes[size], className)}
    >
      <textarea
        ref={ref}
        aria-label={label}
        value={value}
        className={cn(
          'resize-none overflow-hidden border-0 bg-transparent p-0',
          'font-[inherit] text-[inherit] leading-[inherit] text-text-primary',
          'placeholder:text-text-muted focus:outline-none',
        )}
        {...rest}
      />
    </div>
  );
});
