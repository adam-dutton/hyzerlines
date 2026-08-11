import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { cn } from '../cn.js';

/*
 * `prefix` is also an RDFa attribute React declares on every element, typed as
 * a string. Ours shadows it deliberately — nothing in this app uses RDFa, and
 * `prefix`/`suffix` are the names that describe what these are.
 */
interface TextFieldProps extends Omit<
  ComponentPropsWithoutRef<'input'>,
  'size' | 'prefix' | 'suffix'
> {
  /** Accessible name. Required — map chrome rarely has room for visible labels. */
  label: string;
  /**
   * `bordered` is a conventional field. `bare` reads as text until interacted
   * with, for values that are part of the interface rather than a form — the
   * course title being the case this exists for.
   */
  variant?: 'bordered' | 'bare';
  size?: 'sm' | 'md';
  /**
   * Sits inside the field, before the value. For the `W`/`L` that tell two
   * adjacent dimension boxes apart without spending a label row on each.
   */
  prefix?: ReactNode;
  /**
   * Sits inside the field, after the value — units, mostly.
   *
   * Inside rather than beside, which is where these used to live. A unit
   * floating outside the box reads as a separate thing on the row, drifts out
   * of alignment the moment two fields sit side by side, and leaves the field
   * itself claiming to be a bare number. `12 ft` is one value.
   */
  suffix?: ReactNode;
}

/*
 * Disabled has to look disabled.
 *
 * A greyed value alone is not enough on a dark surface — it reads as a low
 * contrast choice rather than a locked control. The dashed border is the tell:
 * it says the field still exists and is still showing you a real number, it is
 * just not yours to type in right now. Which is exactly the state a tee's
 * facing is in while it is aligned to the fairway.
 *
 * The border it dashes is transparent at rest, which is what lets a *filled*
 * field still have a locked state to switch into. Dropping the border outright
 * with the outlines would have taken this with it.
 */
const disabledClass = cn(
  'disabled:cursor-not-allowed disabled:text-text-disabled',
  'disabled:border-dashed disabled:border-border-subtle disabled:bg-transparent',
);

const variants = {
  /**
   * Filled, not outlined.
   *
   * Named `bordered` still, because what it is *for* has not changed — this is
   * the conventional field, the one a form row holds — and renaming it would
   * churn every call site to say the same thing. What changed is the treatment:
   * a fill instead of a hairline. See `surface.field` for why.
   */
  bordered: cn(
    'rounded-md border border-transparent bg-surface-field',
    'placeholder:text-text-muted',
    'focus:outline-none focus:ring-2 focus:ring-focus-ring/50',
  ),
  bare: cn(
    'rounded border border-transparent bg-transparent',
    'transition-colors duration-fast',
    'hover:bg-surface-hover',
    'focus:bg-surface-field focus:outline-none focus:ring-2 focus:ring-focus-ring',
  ),
} as const;

const sizes = {
  sm: 'px-1.5 py-0.5 text-sm',
  md: 'px-3.5 py-2.5 text-base',
} as const;

/** Affix type, so a field with one keeps the same outer metrics as one without. */
const affixSizes = {
  sm: 'text-2xs',
  md: 'text-sm',
} as const;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, variant = 'bordered', size = 'md', prefix, suffix, className, ...rest },
  ref,
) {
  const input = (
    <input
      ref={ref}
      aria-label={label}
      className={cn(
        'text-text-primary',
        // With an affix the wrapper owns the border and background, so the
        // input drops both and keeps only its own focus behaviour — otherwise
        // there would be a box inside a box.
        prefix || suffix
          ? 'min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed disabled:text-text-disabled'
          : cn(variants[variant], disabledClass),
        sizes[size],
        prefix ? 'pl-1' : '',
        suffix ? 'pr-1' : '',
        className,
      )}
      {...rest}
    />
  );

  if (!prefix && !suffix) return input;

  return (
    /*
     * `focus-within` rather than `focus`: the ring belongs to the whole
     * control, and the thing actually taking focus is the input inside it.
     */
    <span
      className={cn(
        'inline-flex items-center',
        variants[variant],
        'focus-within:ring-2 focus-within:ring-focus-ring/50',
        className,
      )}
    >
      {prefix && (
        <span aria-hidden="true" className={cn('pl-2 text-text-muted', affixSizes[size])}>
          {prefix}
        </span>
      )}
      {input}
      {suffix && (
        <span aria-hidden="true" className={cn('pr-2 text-text-muted', affixSizes[size])}>
          {suffix}
        </span>
      )}
    </span>
  );
});
