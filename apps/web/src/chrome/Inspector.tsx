import { IconButton, Panel, TextField, shortcutFor } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  pathLength,
  featureName,
  fieldsFor,
  type Feature,
  type FieldDefinition,
  type Op,
} from '@hyzerlines/core';

import { formatDistance, toFeet, toMeters, type UnitSystem } from '../units';

/**
 * Properties of the selected feature.
 *
 * Generated from the field descriptors in core rather than hand-built per kind.
 * That is the whole point: eight bespoke forms would drift apart in spacing,
 * labelling and behaviour, and every new property would mean new UI. Adding a
 * field to `fieldsFor` makes it appear here, correctly styled, with undo and
 * autosave already working.
 */

const rowClass = 'flex items-center justify-between gap-3 py-1.5';
const labelClass = 'text-xs text-text-secondary';

function NumberField({
  field,
  value,
  units,
  onChange,
}: {
  field: FieldDefinition;
  value: number | undefined;
  units: UnitSystem;
  onChange: (value: number | undefined) => void;
}) {
  /*
   * Stored metric, shown in the user's units.
   *
   * The conversion happens only at this boundary — the document never holds
   * feet. Mixed-unit internals are the classic way a measurement tool ends up
   * quietly wrong, and being right about distance is this app's whole premise.
   */
  const display = value === undefined ? '' : units === 'metric' ? value : toFeet(value);
  const suffix = units === 'metric' ? 'm' : 'ft';

  return (
    <div className={rowClass}>
      <span className={labelClass}>{field.label}</span>
      <span className="flex items-center gap-1.5">
        <TextField
          label={field.label}
          size="sm"
          type="number"
          inputMode="decimal"
          value={display === '' ? '' : Number(display.toFixed(1))}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') return onChange(undefined);
            const parsed = Number(raw);
            if (Number.isNaN(parsed)) return;
            onChange(units === 'metric' ? parsed : toMeters(parsed));
          }}
          className="w-20 text-right tabular-nums"
        />
        <span className="w-4 font-mono text-2xs text-text-muted">{suffix}</span>
      </span>
    </div>
  );
}

function Field({
  field,
  feature,
  units,
  onOp,
}: {
  field: FieldDefinition;
  feature: Feature;
  units: UnitSystem;
  onOp: (op: Op) => void;
}) {
  const raw = feature.props[field.key];

  if (field.type === 'number') {
    return (
      <NumberField
        field={field}
        value={typeof raw === 'number' ? raw : undefined}
        units={units}
        onChange={(value) => onOp({ type: 'setProp', id: feature.id, key: field.key, value })}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <div className={rowClass}>
        <span className={labelClass}>{field.label}</span>
        <select
          aria-label={field.label}
          value={typeof raw === 'string' ? raw : ''}
          onChange={(e) =>
            onOp({
              type: 'setProp',
              id: feature.id,
              key: field.key,
              value: e.target.value || undefined,
            })
          }
          className="rounded-md border border-border-default bg-surface-inset px-2 py-1 text-xs text-text-primary focus:border-border-accent focus:outline-none focus:ring-2 focus:ring-focus-ring/40"
        >
          {/* Empty option so a value can be cleared once set. */}
          <option value="">—</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <span className={labelClass}>{field.label}</span>
      <TextField
        label={field.label}
        size="sm"
        value={typeof raw === 'string' ? raw : ''}
        {...(field.placeholder ? { placeholder: field.placeholder } : {})}
        onChange={(e) =>
          onOp({
            type: 'setProp',
            id: feature.id,
            key: field.key,
            value: e.target.value || undefined,
          })
        }
        className="w-36"
      />
    </div>
  );
}

export function Inspector({
  feature,
  units,
  onOp,
  onDelete,
  onClose,
}: {
  feature: Feature;
  units: UnitSystem;
  onOp: (op: Op) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const fields = fieldsFor(feature.kind);
  const kind = KIND_DEFINITIONS[feature.kind];

  return (
    <div
      className="pointer-events-none absolute right-4 top-20 w-64"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      <Panel elevation="raised" padding="none" className="overflow-hidden">
        <header className="flex items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {featureName(feature)}
            </p>
            <p className="text-2xs text-text-muted">{kind.label}</p>
          </div>
          <IconButton label="Close inspector" size="sm" tooltipSide="left" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="m2.5 2.5 7 7m0-7-7 7"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </IconButton>
        </header>

        <div className="px-3 py-2">
          <div className={rowClass}>
            <span className={labelClass}>Name</span>
            <TextField
              label="Feature name"
              size="sm"
              value={feature.label}
              placeholder={kind.label}
              onChange={(e) =>
                onOp({ type: 'setLabel', id: feature.id, label: e.target.value })
              }
              className="w-36"
            />
          </div>

          {fields.map((field) => (
            <Field key={field.key} field={field} feature={feature} units={units} onOp={onOp} />
          ))}

          {/* Measured, not entered. Shown for lines because a fairway's length
              is the number a designer is actually reaching for. */}
          {feature.geometry.type === 'line' && (
            <div className={`${rowClass} border-t border-border-subtle mt-1 pt-2`}>
              <span className={labelClass}>Length</span>
              <span className="font-mono text-xs tabular-nums text-text-primary">
                {formatDistance(pathLength(feature.geometry.coordinates), units)}
              </span>
            </div>
          )}
        </div>

        <footer className="border-t border-border-subtle px-3 py-2">
          <button
            type="button"
            onClick={onDelete}
            className="w-full rounded-md px-2 py-1 text-left text-xs text-status-danger transition-colors duration-fast hover:bg-status-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Delete
            <span className="ml-1.5 text-text-muted">{shortcutFor('edit.delete')}</span>
          </button>
        </footer>
      </Panel>
    </div>
  );
}
