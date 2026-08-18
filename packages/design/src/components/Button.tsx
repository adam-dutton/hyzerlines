import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '../cn.js';

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  /**
   * How much of the interface the action commits.
   *
   * `primary` is the one action a surface is *for* — there is at most one per
   * panel, and often none. `secondary` is a real action that is not the point
   * of the panel. `ghost` is a way out, or a thing you do to the view rather
   * than to the course. `destructive` removes something.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  /** Fills the row it is in. For a `Delete` at the foot of a panel. */
  block?: boolean;
}

/**
 * A labelled action.
 *
 * Text, not a glyph — see `IconButton` for the other half. Every button in the
 * app comes through here so that the four kinds stay four kinds: the app had
 * grown a hand-written `className` per button, and a hand-written button is one
 * that agrees with the design on the day it is written and drifts afterwards.
 *
 * ## The focus ring is on the outside
 *
 * Fields put their focus edge inside themselves, because they are packed six
 * pixels apart in a column and an outer ring would collide with the rows above
 * and below. Buttons are the opposite case: they sit in bars with air around
 * them, and an inset ring on a solid accent fill would have nothing to contrast
 * against. So a button gets the design's outer double ring — two pixels of the
 * canvas colour, then two of accent — which reads on any surface in the app
 * because the inner band matches the darkest thing on screen.
 */
const base = cn(
  'inline-flex h-7 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap',
  'rounded-md px-[13px] text-xs',
  'transition-colors duration-fast',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
  'focus-visible:ring-offset-2 focus-visible:ring-offset-focus-ring-offset',
  // Disabled controls stay visible but stop accepting hover and pointer events,
  // so a dimmed button never looks momentarily interactive.
  'disabled:pointer-events-none',
);

const variants = {
  /*
   * Weight 500 on the accent, 400 on everything else.
   *
   * The one place in the system where a button's weight changes, and it is not
   * decoration: the accent is a light fill carrying dark text, which optically
   * thins the letterforms. Half a step of weight puts it back.
   */
  primary: cn(
    'bg-accent-solid font-medium text-accent-text-on-solid',
    'hover:bg-accent-solid-hover active:bg-accent-solid-active',
    'disabled:bg-accent-disabled disabled:text-accent-text-disabled',
  ),
  secondary: cn(
    'bg-surface-control text-text-primary',
    'hover:bg-surface-control-hover active:bg-surface-control-active',
    'disabled:bg-surface-tile disabled:text-text-disabled',
  ),
  ghost: cn(
    'bg-transparent text-text-secondary',
    'hover:bg-surface-hover hover:text-text-primary active:bg-surface-active',
    'disabled:bg-transparent disabled:text-text-disabled',
  ),
  /*
   * Quiet until it is pressed.
   *
   * `Delete` is not an action anyone is hunting for, and a filled red button in
   * a panel of grey rows draws the eye to the one thing you least want clicked
   * by accident. It stays as text until the pointer is on it — and the design's
   * filled treatment is reserved for the confirm step, which is what
   * `aria-pressed` switches this into.
   */
  destructive: cn(
    'bg-transparent text-status-danger',
    'hover:bg-status-danger-soft',
    'aria-pressed:bg-status-danger aria-pressed:font-medium aria-pressed:text-text-on-danger',
    'disabled:bg-transparent disabled:text-status-danger/30',
  ),
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', block = false, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Defaulted, because a button inside a form that nobody meant to submit
      // is a bug that only shows up once there is a form.
      type={type ?? 'button'}
      className={cn(base, variants[variant], block && 'w-full justify-start px-2', className)}
      {...rest}
    />
  );
});
