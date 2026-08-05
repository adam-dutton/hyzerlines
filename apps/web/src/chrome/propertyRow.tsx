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

export const checkboxClass = [
  'h-4 w-4 rounded border-border-default bg-surface-inset accent-accent-solid',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
  'disabled:opacity-40',
].join(' ');

/**
 * A labelled checkbox row.
 *
 * `indent` is for a switch that only means anything while its master is on —
 * the parts of a group sit under the switch that governs them, and go disabled
 * rather than disappearing so the group keeps its shape and you can see what
 * turning the master back on would restore.
 */
export function ToggleRow({
  label,
  checked,
  disabled = false,
  indent = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  indent?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 ${indent ? 'pl-3' : ''}`}>
      <span className={disabled ? 'text-xs text-text-disabled' : rowLabelClass}>{label}</span>
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className={checkboxClass}
      />
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
