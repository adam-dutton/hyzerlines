import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';

import { cn } from '../cn.js';

/**
 * A floating panel anchored to a button.
 *
 * The distinction from `Menu` is what happens after a click. A menu is a list of
 * things you pick one of, and picking closes it; this is a small surface you
 * *work in* — several switches you flip in a row, watching the map change under
 * each one. Radix's menu closes on select and moves focus with the arrow keys,
 * both of which are wrong for that, and both of which have to be fought rather
 * than configured.
 *
 * It arrived for the layers control. That started as a menu with a radio group
 * and grew a second group of switches and a unit-dependent readout, at which
 * point it was a panel being rendered as a menu — you keep it open, you flip
 * hillshade on, you look, you flip contours on, you look again.
 *
 * Styling matches `Panel` and `Menu`: the same translucent, blurred,
 * hairline-bordered surface, so everything floating over the map reads as one
 * material.
 */
export function Popover({
  trigger,
  label,
  align = 'end',
  side = 'left',
  className,
  children,
}: {
  /** The button that opens it. Rendered as the trigger via `asChild`. */
  trigger: ReactNode;
  /** Accessible name for the panel itself, distinct from the trigger's. */
  label: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  children: ReactNode;
}) {
  return (
    <RadixPopover.Root>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          aria-label={label}
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'w-60 rounded-lg border border-border-default',
            'bg-surface-overlay shadow-float backdrop-blur-md',
            // Same animation hook as the menu and the tooltip, so
            // prefers-reduced-motion zeroes all three together.
            'hz-pop',
            className,
          )}
          style={{ zIndex: 'var(--hz-z-tooltip)' }}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
