import { TextField, cn } from '@hyzerlines/design';
import { DASHES, type Dash } from '@hyzerlines/core';

import { Row, ReadOnlyValue, fieldWidth, selectClass } from './propertyRow';

/**
 * The style panel's controls, built from the inspector's own primitives.
 *
 * Every row here is a `Row` with a `fieldWidth` control in it, the same as the
 * feature, hole and course panels. That is not consistency for its own sake: an
 * inspector reads as one form only while its rows share a label column and a
 * control column, and the style panel's first pass — hand-rolled selects, a
 * slider under its own label, a bare colour input — broke both and looked like a
 * different application bolted on.
 *
 * What is different here is that every value has a *default underneath it*, so
 * a row can be either the designer's answer or the app's. See `Overridden`.
 */

/**
 * A dot saying this value was chosen rather than inherited.
 *
 * It replaced a `Reset` button on every row, and the reason is width. The rows
 * are 86 pixels of label and whatever is left for the control; a word sitting
 * beside each one squeezed the colour wells, the number fields and the selects
 * into a column too narrow to use, so the panel was hardest to operate exactly
 * where it had been customised most. Undoing is not a per-row job anyway — it
 * is something you go and do — so it moved to a menu in the panel header, and
 * what stays on the row is the one thing that has to be visible at a glance:
 * which of these are yours.
 */
export function Overridden({ show }: { show: boolean }) {
  return (
    <span
      aria-hidden={!show}
      {...(show ? { title: 'Customised' } : {})}
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        show ? 'bg-accent-solid' : 'bg-transparent',
      )}
    />
  );
}

/**
 * `input type="color"` only accepts `#rrggbb`.
 *
 * The schema allows three digits and eight, because a document can carry either.
 * Handing one of those to the input makes it silently fall back to black — which
 * reads as the app losing the colour rather than the control refusing to show
 * it. The tokens' own alpha is split off before it gets here; see `splitAlpha`.
 */
export function normalizeHex(value: string): string {
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = [value[1], value[2], value[3]];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return value.slice(0, 7);
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff';
}

/**
 * A colour, its opacity, and the palette.
 *
 * The three belong on one row because they are one decision. A colour picked
 * without its opacity is half an answer on a map where almost everything is
 * drawn over imagery, and a palette that lived somewhere else would be a trip
 * away from the control that needs it.
 *
 * `Keep` adds the current colour to the course's palette. Building the palette
 * *from the colours you are already choosing* is the version that gets used —
 * a separate palette editor is a form to fill in before the work starts, which
 * is the wrong moment to ask.
 */
export function ColorRow({
  label,
  value,
  opacity,
  inherited,
  palette,
  onColor,
  onOpacity,
  onKeep,
}: {
  label: string;
  value: string;
  /** Null for a colour with no opacity of its own — a numeral, say. */
  opacity: number | null;
  inherited: boolean;
  palette: readonly string[];
  onColor: (value: string) => void;
  onOpacity: (value: number) => void;
  onKeep: (value: string) => void;
}) {
  const hex = normalizeHex(value);
  const kept = palette.includes(hex);

  return (
    <>
      <Row label={label}>
        <span className={cn(fieldWidth, 'flex items-center gap-1.5')}>
          <input
            type="color"
            aria-label={label}
            value={hex}
            onChange={(e) => onColor(e.target.value)}
            className={cn(
              'h-6 w-9 shrink-0 cursor-pointer rounded-md border border-transparent bg-surface-field p-0.5',
              'focus:outline-none focus:ring-2 focus:ring-focus-ring/50',
            )}
          />
          {opacity !== null && (
            <TextField
              label={`${label} opacity`}
              size="sm"
              type="number"
              inputMode="decimal"
              suffix="%"
              value={Math.round(opacity * 100)}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (!Number.isNaN(parsed)) onOpacity(Math.min(1, Math.max(0, parsed / 100)));
              }}
              className="min-w-0 flex-1 tabular-nums"
            />
          )}
          <button
            type="button"
            onClick={() => onKeep(hex)}
            disabled={kept}
            aria-label={kept ? `${label} is in the palette` : `Keep ${label} in the palette`}
            title={kept ? 'Already in the palette' : 'Keep this colour'}
            className={cn(
              'shrink-0 rounded px-1 text-2xs transition-colors duration-fast',
              kept
                ? 'text-text-disabled'
                : 'text-text-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
            )}
          >
            Keep
          </button>
          <Overridden show={!inherited} />
        </span>
      </Row>

      {palette.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pb-1 pl-[86px]">
          {palette.map((colour) => (
            <button
              key={colour}
              type="button"
              onClick={() => onColor(colour)}
              aria-label={`Use ${colour}`}
              title={colour}
              className={cn(
                'size-4 rounded border',
                colour.toLowerCase() === hex.toLowerCase()
                  ? 'border-accent-solid'
                  : 'border-border-subtle',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              )}
              style={{ backgroundColor: colour }}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** A number, typed, in the units the map uses. */
export function NumberRow({
  label,
  value,
  inherited,
  suffix,
  step = 0.5,
  onChange,
}: {
  label: string;
  value: number;
  inherited: boolean;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <Row label={label}>
      <span className={cn(fieldWidth, 'flex items-center gap-1.5')}>
        <TextField
          label={label}
          size="sm"
          type="number"
          inputMode="decimal"
          step={step}
          {...(suffix ? { suffix } : {})}
          value={Math.round(value * 100) / 100}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (!Number.isNaN(parsed)) onChange(parsed);
          }}
          className="min-w-0 flex-1 tabular-nums"
        />
        <Overridden show={!inherited} />
      </span>
    </Row>
  );
}

/** A choice from a fixed list, in the inspector's own select. */
export function SelectRow<T extends string>({
  label,
  value,
  options,
  inherited,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  inherited: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Row label={label}>
      <span className={cn(fieldWidth, 'flex items-center gap-1.5')}>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className={cn(selectClass, 'min-w-0 flex-1 truncate')}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Overridden show={!inherited} />
      </span>
    </Row>
  );
}

/** A measured fact about what is being styled, printed rather than typed. */
export function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Row label={label}>
      <ReadOnlyValue>{children}</ReadOnlyValue>
    </Row>
  );
}

const DASH_LABELS: Record<Dash, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
  dotDash: 'Dot-dash',
  longDash: 'Long dash',
};

export const DASH_OPTIONS = DASHES.map((dash) => ({ value: dash, label: DASH_LABELS[dash] }));
