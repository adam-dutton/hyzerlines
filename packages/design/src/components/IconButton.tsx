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
 * `lg` is for the tool rail and nothing else, so far.
 *
 * A tool is a target you hit dozens of times an hour without looking, which is
 * a different job from the incidental chrome `md` is sized for. 44px is also
 * the smallest thing most touch guidance will call a target, and the rail is
 * the one piece of this interface a tablet user would need to reach.
 */
const sizes = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-11 w-11',
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
          'grid shrink-0 place-items-center rounded-md',
          'transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          // Disabled controls stay visible but stop accepting hover and pointer
          // events, so a dimmed button never looks momentarily interactive.
          'disabled:pointer-events-none disabled:text-text-disabled',
          sizes[size],
          active
            ? 'bg-accent-soft text-text-accent'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
          className,
        )}
        {...rest}
      />
    </Tooltip>
  );
});
