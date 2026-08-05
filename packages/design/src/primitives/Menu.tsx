import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

import { shortcutsById } from '../keymap.js';
import { Kbd } from '../components/Kbd.js';
import { cn } from '../cn.js';

/**
 * A dropdown menu, on Radix.
 *
 * Hand-rolling this was the alternative and it is not worth it. A menu that
 * behaves has to do roving focus, typeahead, Escape, outside-click, focus
 * return to the trigger, correct `role`/`aria-*` wiring and portal collision
 * handling — every one of which is invisible when right and a bug report when
 * wrong. `Dialog` and `Tooltip` are already Radix for the same reason.
 *
 * Styling matches `Panel`: the same translucent, blurred, hairline-bordered
 * surface, so a menu reads as chrome floating over the map rather than as
 * something the browser drew.
 */

export function Menu({
  trigger,
  label,
  align = 'start',
  children,
}: {
  /** The button that opens it. Rendered as the trigger via `asChild`. */
  trigger: ReactNode;
  /** Accessible name for the menu itself, distinct from the trigger's. */
  label: string;
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
}) {
  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          aria-label={label}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'min-w-[11rem] rounded-lg border border-border-default p-1',
            'bg-surface-overlay shadow-float backdrop-blur-md',
            // Same animation hook as the tooltip, so reduced-motion zeroes both.
            'hz-pop',
          )}
          style={{ zIndex: 'var(--hz-z-tooltip)' }}
        >
          {children}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}

const itemClass = cn(
  'flex w-full cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5',
  'text-xs text-text-primary outline-none',
  'data-[highlighted]:bg-surface-hover',
  'data-[disabled]:pointer-events-none data-[disabled]:text-text-disabled',
);

export function MenuItem({
  onSelect,
  command,
  icon,
  disabled,
  children,
}: {
  onSelect: () => void;
  /** Command id from the keyboard registry; renders its binding as a chip. */
  command?: string;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  const combo = command ? shortcutsById.get(command)?.keys[0] : undefined;

  return (
    <RadixMenu.Item
      onSelect={onSelect}
      // Spread rather than passed: `exactOptionalPropertyTypes` means an
      // explicit `undefined` is not the same as an absent prop.
      {...(disabled === undefined ? {} : { disabled })}
      className={itemClass}
    >
      {icon && (
        <span className="grid h-4 w-4 place-items-center text-text-secondary">{icon}</span>
      )}
      <span className="flex-1">{children}</span>
      {combo && <Kbd combo={combo} />}
    </RadixMenu.Item>
  );
}

/**
 * An item that reports which of a set is chosen.
 *
 * Radix's own `RadioItem` rather than a checkmark bolted onto `MenuItem`: it
 * carries `role="menuitemradio"` and `aria-checked`, which is the difference
 * between a screen reader announcing "Satellite, selected, 1 of 3" and
 * announcing nothing at all.
 */
export function MenuRadioGroup({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <RadixMenu.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </RadixMenu.RadioGroup>
  );
}

export function MenuRadioItem({
  value,
  hint,
  children,
}: {
  value: string;
  /** A second line, for saying what a choice actually is. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <RadixMenu.RadioItem value={value} className={itemClass}>
      <span className="grid h-4 w-4 shrink-0 place-items-center">
        <RadixMenu.ItemIndicator>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="m2.5 6.2 2.4 2.4 4.6-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </RadixMenu.ItemIndicator>
      </span>
      <span className="flex-1">
        {children}
        {hint && <span className="block text-2xs text-text-muted">{hint}</span>}
      </span>
    </RadixMenu.RadioItem>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-border-subtle" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <RadixMenu.Label className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </RadixMenu.Label>
  );
}
