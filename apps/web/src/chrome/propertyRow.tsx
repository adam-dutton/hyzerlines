import { useState, type ReactNode } from 'react';
import { Switch, TextField, cn } from '@hyzerlines/design';

/**
 * The shared shape of a properties row.
 *
 * Three panels render into the same surface — feature, hole and course — and
 * the only thing that makes them read as one inspector rather than three
 * stacked forms is that every row has identical metrics. Keeping the label,
 * spacing and section rule in one place is what stops them drifting the moment
 * someone adds a field to only one of them.
 */

export const rowLabelClass = 'text-xs text-text-muted';

/**
 * A group of rows, separated from its neighbours by a hairline.
 *
 * One hairline between groups, and none around them. The panels used to outline
 * every section as a box, which at this density read as a table of boxes — the
 * eye counted frames instead of values. Spacing does most of the separating now
 * and a single rule does the rest, which is the same trade the fields made when
 * they dropped their borders for a fill.
 */
export const sectionClass = 'border-b border-border-subtle px-3 py-3.5 last:border-b-0';

/**
 * The label column, fixed rather than fitted.
 *
 * Every row in every inspector shares it, so the controls line up down the
 * right-hand edge whether the label is "Par" or "Playing from". The rows were
 * `justify-between` before it, which meant a column of controls that stepped in
 * and out as the labels changed length.
 *
 * 82px is the drawer's figure, and the drawer is where the longest labels are.
 * The rail is narrower and could take less, but a label column that changes
 * width between two panels showing the same kind of thing is worse than one
 * that is four pixels generous in one of them.
 */
export const labelWidth = 'w-[82px]';

/**
 * A native select, dressed to match `TextField`.
 *
 * Native rather than a custom listbox: a `<select>` gets keyboard behaviour,
 * type-ahead and the platform's own touch picker for free, and every one of
 * those is worse in a hand-rolled replacement. The design system will grow a
 * real component when a select needs something native cannot do — icons in
 * options, or a search field — and not before.
 */
/**
 * One width for every control in an inspector.
 *
 * The panels had grown a width per field — `w-20` here, `w-36` there,
 * `max-w-[8rem]` on a select — so a column of controls stepped in and out down
 * the right-hand edge. One value means they line up, and it is the only thing
 * that makes a stack of unrelated fields read as a single form.
 */
export const fieldWidth = 'min-w-0 flex-1';

/**
 * The same box a `TextField` draws, on a native `<select>`.
 *
 * Every metric here is the field's: 26px tall, 5px radius, 12px type, a fill
 * instead of a border, and the one-pixel inset edge on focus. The only
 * difference is the right-hand padding, which leaves room for the caret the
 * platform draws — a select cannot right-align its value the way a field does,
 * because the value would run under that caret.
 */
export const selectClass = [
  'h-[26px] rounded-sm border border-transparent bg-surface-field pl-2 pr-6 text-xs text-text-primary',
  'focus:outline-none focus:shadow-[inset_0_0_0_1px_var(--color-focus-ring)]',
  'disabled:border-dashed disabled:border-border-subtle disabled:bg-transparent disabled:text-text-disabled',
].join(' ');

/**
 * A label and its control, on one line.
 *
 * A fixed label column with the control taking the rest, rather than the two
 * pushed apart by `justify-between`. Under `justify-between` a short label left
 * its control hard against the right edge while a long one pushed it inwards, so
 * a stack of rows had a ragged control column — and the fields inside them had
 * grown a width each to compensate, which is why `fieldWidth` used to be a
 * number and is now simply "the rest of the row".
 */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    // 3px of vertical padding, which puts 6px between two adjacent rows — the
    // drawer's row gap. Padding rather than a gap on the parent, because these
    // rows are dropped into sections that also hold headings and dividers.
    <div className="flex items-center gap-2 py-[3px]">
      <span className={cn(rowLabelClass, labelWidth, 'shrink-0')}>{label}</span>
      {children}
    </div>
  );
}

/**
 * A measured value, printed rather than typed.
 *
 * Right-aligned on the same grid a control would occupy, and the same height, so
 * a read-only row and an editable one line up. It drops the fill and steps the
 * text back one notch, which is the design's read-only field: the value is still
 * the real one, it is simply not yours to change here. Tabular figures without a monospace face: Inter has
 * real tabular numerals, so a distance that updates while you drag holds its
 * width without switching typeface — which is what `font-mono` was doing here.
 */
export function ReadOnlyValue({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[26px] min-w-0 flex-1 items-center justify-end truncate px-2 text-xs tabular-nums text-text-secondary">
      {children}
    </span>
  );
}

/**
 * A labelled switch row.
 *
 * A switch rather than a checkbox because none of these wait for a Save — the
 * corridor leaves the map as the thumb slides. See `Switch`.
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
    <div className={cn('flex items-center gap-2 py-[3px]', indent && 'pl-3')}>
      <span
        className={cn(
          disabled ? 'text-xs text-text-disabled' : rowLabelClass,
          'min-w-0 flex-1',
        )}
      >
        {label}
      </span>
      <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

/**
 * An angle, with the degree sign inside the value.
 *
 * It used to be a field suffix, in the slot that carries `m` and `ft`. But a
 * suffix sits apart from the number in muted type, and `240 °` is not how
 * anybody writes a bearing: feet are a unit *of* a value, degrees are part of
 * how the value is written. So the sign travels with the digits.
 *
 * Which means the field cannot be `type="number"`, and cannot reformat while
 * you are typing in it — a controlled value that re-appends `°` after every
 * keystroke makes backspace delete the sign and nothing else, forever. So the
 * field holds a plain draft while focused and formats on blur, which is the
 * only arrangement where both reading and editing work.
 */
export function DegreeField({
  label,
  value,
  disabled = false,
  onChange,
  className,
}: {
  label: string;
  /** Null shows an empty field: no angle, rather than an angle of zero. */
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | undefined) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const rounded = value === null ? '' : String(Math.round(value));

  return (
    <TextField
      label={label}
      size="sm"
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={draft ?? (rounded === '' ? '' : `${rounded}°`)}
      onFocus={() => setDraft(rounded)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '');
        setDraft(digits);
        if (digits === '') onChange(undefined);
        // Wrapped rather than rejected: 370 is a bearing somebody meant, and
        // refusing the keystroke would look like the field was broken.
        else onChange(Number(digits) % 360);
      }}
      className={cn('tabular-nums', className)}
    />
  );
}

/**
 * A section heading, for panels with more than one group of rows.
 *
 * A word at the panel's own size in a heavier weight, not a small-caps label.
 * The uppercase treatment it used to have made a heading physically smaller
 * than the rows under it and set it in the muted colour — so the one element
 * whose job is to be findable while scrolling was the least visible thing in
 * the panel. Weight and colour carry it now, at the size everything else is.
 *
 * `count` prints beside the word. It is for a heading over a list, where "how
 * many" is a fact you want before you have read any of them.
 */
export function SectionTitle({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  /** A control belonging to the section — an add button, usually. Sits right. */
  action?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center gap-2">
      <h3 className="text-xs font-semibold text-text-primary">{children}</h3>
      {count !== undefined && (
        <span className="text-xs tabular-nums text-text-muted">{count}</span>
      )}
      {action && <span className="ml-auto flex items-center">{action}</span>}
    </div>
  );
}
