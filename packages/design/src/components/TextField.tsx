import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { cn } from '../cn.js';

interface TextFieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'size'> {
  /** Accessible name. Required — map chrome rarely has room for visible labels. */
  label: string;
  /**
   * `bordered` is a conventional field. `bare` reads as text until interacted
   * with, for values that are part of the interface rather than a form — the
   * course title being the case this exists for.
   */
  variant?: 'bordered' | 'bare';
  size?: 'sm' | 'md';
}

const variants = {
  bordered: cn(
    'rounded-lg border border-border-default bg-surface-inset',
    'placeholder:text-text-muted',
    'focus:border-border-accent focus:outline-none focus:ring-2 focus:ring-focus-ring/40',
  ),
  bare: cn(
    'rounded bg-transparent',
    'transition-colors duration-fast',
    'hover:bg-surface-hover',
    'focus:bg-surface-inset focus:outline-none focus:ring-2 focus:ring-focus-ring',
  ),
} as const;

const sizes = {
  sm: 'px-1.5 py-0.5 text-sm',
  md: 'px-3.5 py-2.5 text-base',
} as const;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, variant = 'bordered', size = 'md', className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-label={label}
      className={cn('text-text-primary', variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
