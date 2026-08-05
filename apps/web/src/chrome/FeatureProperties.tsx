import { TextField, shortcutFor } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  assignToHole,
  featureArea,
  holeName,
  holeOf,
  moveToFront,
  pathLength,
  fieldsFor,
  type Course,
  type Feature,
  type FieldDefinition,
  type Op,
} from '@hyzerlines/core';

import { formatArea, formatDistance, toFeet, toMeters, type UnitSystem } from '../units';
import { Row, rowLabelClass, sectionClass, selectClass } from './propertyRow';

/**
 * Properties of the selected feature.
 *
 * Generated from the field descriptors in core rather than hand-built per kind.
 * That is the whole point: eight bespoke forms would drift apart in spacing,
 * labelling and behaviour, and every new property would mean new UI. Adding a
 * field to `fieldsFor` makes it appear here, correctly styled, with undo and
 * autosave already working.
 */

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
    <Row label={field.label}>
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
    </Row>
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

  if (field.type === 'boolean') {
    return (
      <Row label={field.label}>
        <input
          type="checkbox"
          aria-label={field.label}
          checked={raw === true}
          onChange={(e) =>
            onOp({
              type: 'setProp',
              id: feature.id,
              key: field.key,
              // Unset rather than false, so a document does not accumulate
              // every flag anyone ever toggled and toggled back.
              value: e.target.checked ? true : undefined,
            })
          }
          className="h-4 w-4 rounded border-border-default bg-surface-inset accent-accent-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        />
      </Row>
    );
  }

  if (field.type === 'select') {
    return (
      <Row label={field.label}>
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
      </Row>
    );
  }

  return (
    <Row label={field.label}>
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
    </Row>
  );
}

/**
 * Which hole this tee or target belongs to.
 *
 * The one thing the interface could not do until now: `addHole` guessed at the
 * nearest unassigned pair when a hole was created, and after that nothing could
 * change its mind. Placing a second pin meant a target stranded outside every
 * hole, reported forever as unassigned, with no control anywhere to fix it.
 *
 * Only for tees and targets. Other kinds carry a `holeId` too, but for them it
 * is scope rather than membership — an OB line belonging to hole 4 is a
 * different claim from a tee being one of hole 4's tees, and PR 7 gives it its
 * own control rather than overloading this one.
 */
function HoleAssignment({
  course,
  feature,
  onOp,
}: {
  course: Course;
  feature: Feature;
  onOp: (op: Op) => void;
}) {
  if (feature.kind !== 'tee' && feature.kind !== 'target') {
    return <HoleScope course={course} feature={feature} onOp={onOp} />;
  }

  const list = feature.kind === 'tee' ? 'teeIds' : 'targetIds';
  const hole = holeOf(course, feature.id);
  const isFirst = hole?.[list][0] === feature.id;

  const holes = [...course.holes].sort((a, b) => a.number - b.number);

  return (
    <div className={sectionClass}>
      <Row label="Hole">
        <select
          aria-label="Hole this belongs to"
          value={hole?.id ?? ''}
          onChange={(e) => {
            const op = assignToHole(course, feature.id, e.target.value || null);
            if (op) onOp(op);
          }}
          className={selectClass}
        >
          <option value="">Not assigned</option>
          {holes.map((h) => (
            <option key={h.id} value={h.id}>
              {holeName(h)}
            </option>
          ))}
        </select>
      </Row>

      {/*
        The first tee and first pin are the hole's representative pair until a
        layout routes it — they decide what the scorecard prints and what the
        fairway is drawn between. So promoting one is a real edit, not a
        cosmetic reorder, and it needs to be reachable.
      */}
      {hole && !isFirst && (
        <button
          type="button"
          onClick={() => {
            const op = moveToFront(course, feature.id, list);
            if (op) onOp(op);
          }}
          className="mt-0.5 text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Make this the hole&rsquo;s main {feature.kind === 'tee' ? 'tee' : 'pin'}
        </button>
      )}
      {hole && isFirst && (
        <p className="mt-0.5 text-2xs leading-4 text-text-muted">
          {holeName(hole)} is measured from here.
        </p>
      )}
      {!hole && course.holes.length === 0 && (
        <p className="mt-0.5 text-2xs leading-4 text-text-muted">
          No holes yet — add one and it will claim a tee and a basket.
        </p>
      )}
    </div>
  );
}

/**
 * Which hole an OB line, a hazard or a path is *about*.
 *
 * Scope, not membership — a different claim from a tee being one of hole 4's
 * tees. An OB boundary at the course level and one on a single hole are the same
 * shape seen at different ranges, and saying which lets the checks, the exports
 * and eventually the per-hole views talk about the right subset.
 *
 * A single `setFeatureHole`, because nothing else has to move: the hole's arrays
 * list only tees and targets, so there is no second field to keep in step.
 */
function HoleScope({
  course,
  feature,
  onOp,
}: {
  course: Course;
  feature: Feature;
  onOp: (op: Op) => void;
}) {
  if (course.holes.length === 0) return null;
  const holes = [...course.holes].sort((a, b) => a.number - b.number);

  return (
    <div className={sectionClass}>
      <Row label="Belongs to">
        <select
          aria-label="Hole this belongs to"
          value={feature.holeId ?? ''}
          onChange={(e) =>
            onOp({ type: 'setFeatureHole', id: feature.id, holeId: e.target.value || null })
          }
          className={selectClass}
        >
          <option value="">The whole course</option>
          {holes.map((hole) => (
            <option key={hole.id} value={hole.id}>
              {holeName(hole)}
            </option>
          ))}
        </select>
      </Row>
    </div>
  );
}

export function FeatureProperties({
  course,
  feature,
  units,
  onOp,
  onDelete,
}: {
  course: Course;
  feature: Feature;
  units: UnitSystem;
  onOp: (op: Op) => void;
  onDelete: () => void;
}) {
  const fields = fieldsFor(feature.kind);
  const kindLabel = KIND_DEFINITIONS[feature.kind].label;

  return (
    <>
      <div className={sectionClass}>
        <Row label="Name">
          <TextField
            label="Feature name"
            size="sm"
            value={feature.label}
            placeholder={kindLabel}
            onChange={(e) => onOp({ type: 'setLabel', id: feature.id, label: e.target.value })}
            className="w-36"
          />
        </Row>

        {fields.map((field) => (
          <Field key={field.key} field={field} feature={feature} units={units} onOp={onOp} />
        ))}
      </div>

      <HoleAssignment course={course} feature={feature} onOp={onOp} />

      {/* Measured, not entered. A line's length and an area's acreage are the
          numbers a designer is actually reaching for. */}
      {feature.geometry.type === 'line' && (
        <div className={sectionClass}>
          <Row label="Length">
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {formatDistance(pathLength(feature.geometry.coordinates), units)}
            </span>
          </Row>
        </div>
      )}
      {feature.geometry.type === 'polygon' && (
        <div className={sectionClass}>
          <Row label="Area">
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {formatArea(featureArea(feature) ?? 0, units)}
            </span>
          </Row>
          <Row label="Perimeter">
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {formatDistance(
                pathLength([...feature.geometry.coordinates, feature.geometry.coordinates[0]!]),
                units,
              )}
            </span>
          </Row>
        </div>
      )}

      <div className={sectionClass}>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-md px-2 py-1 text-left text-xs text-status-danger transition-colors duration-fast hover:bg-status-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Delete
          <span className={`ml-1.5 ${rowLabelClass}`}>{shortcutFor('edit.delete')}</span>
        </button>
      </div>
    </>
  );
}
