import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { Tooltip } from '../primitives/Tooltip.js';
import { cn } from '../cn.js';

interface IconButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'title'> {
  /**
   * Required. Becomes both the accessible name and the tooltip text, so an icon
   * button physically cannot ship unlabelled — the commonest a11y failure in
   * exactly this kind of dense, icon-only map chrome.
   */
  label: string;
  /** Command id from the keyboard registry; renders its binding in the tooltip. */
  command?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Reads as "currently on" — for stateful toggles rather than actions. */
  active?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * Three sizes, each with its own corner.
 *
 * The radius is not a constant across them, and that is the design's rule
 * rather than an oversight: a 24px button with an 8px corner is nearly a
 * lozenge, and a 38px one with a 5px corner is nearly a square. The corner
 * grows with the box so all three read as the same shape.
 *
 * `lg` is for the tool rail and nothing else, so far. A tool is a target you
 * hit dozens of times an hour without looking, which is a different job from
 * the incidental chrome `md` is sized for.
 */
const sizes = {
  /** Inline with a row of text — the eye on a feature, the caret on a group. */
  sm: 'h-6 w-6 rounded-sm',
  /** Chrome: the top bar, a panel header, a drawer's close button. */
  md: 'h-7 w-7 rounded-md',
  /** The tool bar. */
  lg: 'h-[38px] w-[38px] rounded-lg',
} as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, command, size = 'md', active = false, tooltipSide = 'bottom', className, ...rest },
  ref,
) {
  return (
    <Tooltip label={label} side={tooltipSide} {...(command ? { command } : {})}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={active || undefined}
        className={cn(
          'grid shrink-0 place-items-center',
          'transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          // Disabled controls stay visible but stop accepting hover and pointer
          // events, so a dimmed button never looks momentarily interactive.
          'disabled:pointer-events-none disabled:text-text-disabled',
          sizes[size],
          // A held-down tool is filled, not tinted. It is the one control on
          // screen whose state changes what a click on the map *does*, so it
          // is the one that gets the full accent rather than a wash of it.
          active
            ? 'bg-accent-solid text-accent-text-on-solid'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          className,
        )}
        {...rest}
      />
    </Tooltip>
  );
});
