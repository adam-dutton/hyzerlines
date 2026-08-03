import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

import { shortcutsById } from '../keymap.js';
import { Kbd } from '../components/Kbd.js';
import { cn } from '../cn.js';

/**
 * Mount once, near the root. Radix shares open/close timing across every tooltip
 * beneath it, which is what produces the "first one waits, the rest are instant"
 * behavior you expect when sweeping across a toolbar.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    // 400ms is long enough not to fire on a pointer merely crossing the toolbar,
    // short enough to feel like an answer rather than a delay.
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={300}>
      {children}
    </RadixTooltip.Provider>
  );
}

interface TooltipProps {
  label: string;
  /**
   * Command id from the keyboard registry. The binding is looked up and rendered
   * as a key chip, so a tooltip can never advertise a shortcut that isn't real —
   * an unknown or unbound id simply renders no chip.
   */
  command?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  children: ReactNode;
}

/**
 * Replaces the native `title` attribute.
 *
 * `title` is unstyleable, ~1s late, invisible to keyboard users, and can't hold a
 * key chip. Radix gives us focus-triggered tooltips with real markup, correctly
 * associated for screen readers.
 */
export function Tooltip({ label, command, side = 'bottom', children }: TooltipProps) {
  const combo = command ? shortcutsById.get(command)?.keys[0] : undefined;

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'flex items-center gap-2 rounded-md border border-border-default',
            'bg-surface-overlay px-2 py-1 shadow-md backdrop-blur-md',
            'text-2xs text-text-primary',
            'select-none',
            // Animation lives in styles.css, keyed off Radix's data-state and
            // timed from motion tokens — so prefers-reduced-motion zeroes it
            // along with everything else.
            'hz-pop',
          )}
          style={{ zIndex: 'var(--hz-z-tooltip)' }}
        >
          {label}
          {combo && <Kbd combo={combo} />}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
