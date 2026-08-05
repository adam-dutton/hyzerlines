import type { ReactNode } from 'react';

/**
 * The shared shape of a properties row.
 *
 * Three panels render into the same surface — feature, hole and course — and
 * the only thing that makes them read as one inspector rather than three
 * stacked forms is that every row has identical metrics. Keeping the label,
 * spacing and section rule in one place is what stops them drifting the moment
 * someone adds a field to only one of them.
 */

export const rowLabelClass = 'text-xs text-text-secondary';

/** A group of rows, separated from its neighbours by a hairline. */
export const sectionClass = 'border-b border-border-subtle px-3 py-2 last:border-b-0';

/**
 * A native select, dressed to match `TextField`.
 *
 * Native rather than a custom listbox: a `<select>` gets keyboard behaviour,
 * type-ahead and the platform's own touch picker for free, and every one of
 * those is worse in a hand-rolled replacement. The design system will grow a
 * real component when a select needs something native cannot do — icons in
 * options, or a search field — and not before.
 */
export const selectClass = [
  'rounded-md border border-border-default bg-surface-inset px-2 py-1 text-xs text-text-primary',
  'focus:border-border-accent focus:outline-none focus:ring-2 focus:ring-focus-ring/40',
  'disabled:text-text-disabled',
].join(' ');

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className={rowLabelClass}>{label}</span>
      {children}
    </div>
  );
}

/** A section heading, for panels with more than one group of rows. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </p>
  );
}
