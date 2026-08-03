import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

import { cn } from '../cn.js';

/**
 * A floating chrome surface.
 *
 * This is the single most repeated treatment in the app — every toolbar, readout
 * and control cluster is a translucent, blurred, hairline-bordered card sitting
 * over the map. Before this component the exact class string was copy-pasted
 * into four files, which is how surfaces drift apart.
 *
 * `pointer-events-auto` is baked in because panels are almost always children of
 * a `pointer-events-none` positioning layer: the layer spans the viewport so
 * panels can be placed against its edges, but must not swallow map drags in the
 * gaps between them.
 */
type PanelProps<T extends ElementType> = {
  as?: T;
  /**
   * `float` sits directly on imagery — tighter shadow, heavier border.
   * `raised` is for larger surfaces that carry their own content weight.
   */
  elevation?: 'float' | 'raised';
  /** Default padding suits an icon row; set `none` when children own it. */
  padding?: 'none' | 'tight' | 'comfortable';
  className?: string;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const elevations = {
  float: 'shadow-float border-border-default',
  raised: 'shadow-lg border-border-default',
} as const;

const paddings = {
  none: '',
  tight: 'p-1',
  comfortable: 'px-2.5 py-1.5',
} as const;

export function Panel<T extends ElementType = 'div'>({
  as,
  elevation = 'float',
  padding = 'tight',
  className,
  children,
  ...rest
}: PanelProps<T>) {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component
      className={cn(
        'pointer-events-auto rounded-lg border bg-surface-overlay backdrop-blur-md',
        elevations[elevation],
        paddings[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

/**
 * A viewport-spanning layer that panels are positioned within.
 *
 * Exists to make the "chrome floats, never displaces" rule structural rather
 * than remembered: children are absolutely positioned and the layer itself is
 * transparent to pointer events, so the map keeps every gesture that doesn't
 * land on an actual control.
 */
export function ChromeLayer({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn('pointer-events-none absolute', className)}
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      {children}
    </div>
  );
}
