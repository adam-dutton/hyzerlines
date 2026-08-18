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
   * Which edge the value sits against.
   *
   * `right` is the default, and that is not a stylistic preference: an
   * inspector is a column of quantities, and quantities are compared down their
   * last digit. A left-aligned column of `423`, `1204`, `97` gives the eye
   * three different places to look for the units place. Names are the exception
   * — `left` is for a field holding words rather than a measurement.
   */
  align?: 'left' | 'right';
  /**
   * Marks the value as rejected. Draws the same one-pixel inset the focus state
   * uses, in the danger colour.
   *
   * Sets `aria-invalid` with it, because a red edge is not an error message to
   * anyone not looking at the screen.
   */
  invalid?: boolean;
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

/**
 * Focus draws *inside* the field, not around it.
 *
 * A field is 26px tall in a 236px column with 6px between rows, and an outer
 * ring at any useful width spills into the rows above and below — so focusing
 * one row visibly nudges its neighbours' apparent spacing. An inset edge costs
 * no layout at all. It is also why the ring is one pixel rather than two: a
 * pixel of accent on a filled control is already the loudest thing in the
 * panel.
 *
 * Buttons keep the outer double ring. They sit in bars with room around them,
 * and an inset ring on a solid accent fill would be invisible.
 */
const focusRing = 'focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--color-focus-ring)]';

const invalidRing = 'shadow-[inset_0_0_0_1px_var(--color-status-danger)]';

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
    'rounded-sm border border-transparent bg-surface-field',
    'placeholder:text-text-muted',
    focusRing,
  ),
  bare: cn(
    'rounded-sm border border-transparent bg-transparent',
    'transition-colors duration-fast',
    'hover:bg-surface-hover',
    'focus:bg-surface-field',
    focusRing,
  ),
} as const;

/**
 * Two heights, and the design only draws one of them.
 *
 * `sm` is the inspector field: 26px, 12px type, 8px of side padding, straight
 * off the artboard. `md` exists for the few fields that are not in an
 * inspector — the course title, the location search — where the control is the
 * subject of the panel rather than one row of thirty.
 */
const sizes = {
  sm: 'h-[26px] px-2 text-xs',
  md: 'h-8 px-2.5 text-sm',
} as const;

/** Affix type, so a field with one keeps the same outer metrics as one without. */
const affixSizes = {
  sm: 'text-2xs',
  md: 'text-xs',
} as const;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    label,
    variant = 'bordered',
    size = 'md',
    align = 'right',
    invalid = false,
    prefix,
    suffix,
    className,
    ...rest
  },
  ref,
) {
  const affixed = Boolean(prefix || suffix);

  const input = (
    <input
      ref={ref}
      aria-label={label}
      aria-invalid={invalid || undefined}
      className={cn(
        'min-w-0 text-text-primary',
        align === 'right' ? 'text-right' : 'text-left',
        // With an affix the wrapper owns the fill and the focus edge, so the
        // input drops both and keeps only its metrics — otherwise there would
        // be a box inside a box.
        affixed
          ? cn(
              'flex-1 bg-transparent outline-none',
              'placeholder:text-text-muted',
              'disabled:cursor-not-allowed disabled:text-text-disabled',
            )
          : cn(variants[variant], disabledClass, invalid && invalidRing),
        sizes[size],
        // The affix owns the padding on its own side, so the input gives that
        // side back rather than doubling it.
        prefix ? 'pl-1' : '',
        suffix ? 'pr-1' : '',
        className,
      )}
      {...rest}
    />
  );

  if (!affixed) return input;

  return (
    /*
     * `focus-within` rather than `focus`: the edge belongs to the whole
     * control, and the thing actually taking focus is the input inside it.
     */
    <span
      className={cn(
        'inline-flex items-center',
        variants[variant],
        // The wrapper is sized by the input it holds, so it drops the height
        // and keeps only the fill, the radius and the focus edge.
        'h-auto px-0',
        'focus-within:shadow-[inset_0_0_0_1px_var(--color-focus-ring)]',
        invalid && invalidRing,
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
