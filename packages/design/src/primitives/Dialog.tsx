import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

import { cn } from '../cn.js';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Optional supporting line under the title. */
  description?: string;
  /** Constrains the panel. Dialogs over a map should never fill the viewport. */
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

/**
 * Modal dialog.
 *
 * Radix supplies the parts that are tedious to get right and unacceptable to get
 * wrong: focus trap, focus restore on close, `aria-modal` wiring, scroll lock,
 * Escape, and outside-click. The hand-rolled version this replaces handled
 * initial focus and Escape and nothing else — tabbing could walk straight out of
 * it into the map behind.
 *
 * The title is required and always rendered into the accessible name, so a
 * dialog cannot ship without one.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className="hz-scrim fixed inset-0 bg-surface-scrim backdrop-blur-sm"
          style={{ zIndex: 'var(--hz-z-dialog)' }}
        />
        <RadixDialog.Content
          className={cn(
            'hz-dialog fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
            sizes[size],
            'max-h-[80vh] overflow-y-auto rounded-2xl border border-border-default',
            'bg-surface-raised p-6 shadow-xl',
            'focus:outline-none',
          )}
          style={{ zIndex: 'var(--hz-z-dialog)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <RadixDialog.Title className="text-lg font-semibold text-text-primary">
                {title}
              </RadixDialog.Title>
              {description && (
                <RadixDialog.Description className="mt-1 text-xs text-text-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>

            <RadixDialog.Close
              aria-label="Close"
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted',
                'transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              )}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                <path
                  d="m2.5 2.5 8 8m0-8-8 8"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </RadixDialog.Close>
          </div>

          <div className="mt-5">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
