import { TextField, cn, shortcutFor } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  assignToHole,
  featureArea,
  holeName,
  holeOf,
  moveToFront,
  pathLength,
  fairwayBearingFor,
  fieldsFor,
  type Course,
  type Feature,
  type FieldDefinition,
  type Op,
} from '@hyzerlines/core';

import { formatArea, formatDistance, toFeet, toMeters, type UnitSystem } from '../units';
import {
  Row,
  SectionTitle,
  checkboxClass,
  fieldWidth,
  rowLabelClass,
  sectionClass,
  selectClass,
} from './propertyRow';

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
  const degrees = field.unit === 'degrees';
  const display =
    value === undefined ? '' : degrees || units === 'metric' ? value : toFeet(value);
  const suffix = degrees ? '°' : units === 'metric' ? 'm' : 'ft';

  return (
    <Row label={field.label}>
      <TextField
        label={field.label}
        size="sm"
        type="number"
        inputMode="decimal"
        suffix={suffix}
        value={display === '' ? '' : Number(display.toFixed(1))}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) return;
          onChange(degrees || units === 'metric' ? parsed : toMeters(parsed));
        }}
        className={cn(fieldWidth, 'text-right tabular-nums')}
      />
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
          className={checkboxClass}
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
          className={cn(selectClass, fieldWidth, 'truncate')}
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
        className={fieldWidth}
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
  const standalone = feature.props['standalone'] === true;

  const holes = [...course.holes].sort((a, b) => a.number - b.number);

  /*
   * One control, three states — and the third used to be a checkbox.
   *
   * "Not assigned" and "Not part of a hole" sound alike and are not: the first
   * is a tee waiting to be given to a hole, and the second is a practice
   * basket that will never belong to one, which is why `standalone` exists —
   * `rules.ts` reads it to stop reporting the same thing forever. As a
   * separate checkbox it could contradict the picker beside it. As the third
   * option in that picker it cannot.
   */
  const STANDALONE = 'standalone';
  const value = hole?.id ?? (standalone ? STANDALONE : '');

  const choose = (next: string) => {
    const ops: Op[] = [];
    if (hole) {
      const detach = assignToHole(course, feature.id, null);
      if (detach) ops.push(detach);
    }
    if (next !== '' && next !== STANDALONE) {
      const attach = assignToHole(course, feature.id, next);
      if (attach) ops.push(attach);
    }
    // Only written when true, so a document does not accumulate the flag for
    // every feature anybody ever pointed this control at.
    if (standalone !== (next === STANDALONE)) {
      ops.push({
        type: 'setProp',
        id: feature.id,
        key: 'standalone',
        value: next === STANDALONE ? true : undefined,
      });
    }
    if (ops.length === 1) onOp(ops[0]!);
    else if (ops.length > 1) onOp({ type: 'batch', ops });
  };

  return (
    <div className={sectionClass}>
      <Row label="Belongs to">
        <select
          aria-label="Hole this belongs to"
          value={value}
          onChange={(e) => choose(e.target.value)}
          className={cn(selectClass, fieldWidth, 'truncate')}
        >
          <option value="">Not assigned</option>
          {holes.map((h) => (
            <option key={h.id} value={h.id}>
              {holeName(h)}
            </option>
          ))}
          <option value={STANDALONE}>Not part of a hole</option>
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
          className={cn(selectClass, fieldWidth, 'truncate')}
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

/**
 * The rectangle a tee or drop zone occupies, and which way it points.
 *
 * Pulled out of the generic field list because these three are not three
 * independent properties — they are one shape, and laying them out as three
 * stacked rows with their own labels hid that. Width and length sit side by
 * side under one heading because that is how a pad is quoted, and the bearing
 * gets its own because facing is a different question from size.
 */
function LayoutSection({
  course,
  feature,
  units,
  onOp,
}: {
  course: Course;
  feature: Feature;
  units: UnitSystem;
  onOp: (op: Op) => void;
}) {
  const set = (key: string, value: number | undefined) =>
    onOp({ type: 'setProp', id: feature.id, key, value });

  const stored = feature.props['bearing'];
  const hasOwnBearing = typeof stored === 'number' && Number.isFinite(stored);

  /*
   * "Align to fairway" is the absence of a stored bearing, not a flag.
   *
   * `footprintOf` already prefers a stored `bearing` and falls back to the
   * fairway's, so the behaviour exists — what was missing was any way to see
   * or set it. A second boolean saying which mode you are in could disagree
   * with the geometry; this cannot, because it *is* the geometry.
   */
  const derived = fairwayBearingFor(course, feature.id);
  const effective = hasOwnBearing ? stored : derived;

  const dimension = (key: 'width' | 'length', prefix: string) => {
    const raw = feature.props[key];
    const meters = typeof raw === 'number' ? raw : undefined;
    const display = meters === undefined ? '' : units === 'metric' ? meters : toFeet(meters);

    return (
      <TextField
        label={key === 'width' ? 'Pad width' : 'Pad length'}
        size="sm"
        type="number"
        inputMode="decimal"
        prefix={prefix}
        suffix={units === 'metric' ? 'm' : 'ft'}
        value={display === '' ? '' : Number(display.toFixed(1))}
        onChange={(e) => {
          const value = e.target.value;
          if (value === '') return set(key, undefined);
          const parsed = Number(value);
          if (Number.isNaN(parsed)) return;
          set(key, units === 'metric' ? parsed : toMeters(parsed));
        }}
        className="min-w-0 flex-1 text-right tabular-nums"
      />
    );
  };

  return (
    <div className={sectionClass}>
      <SectionTitle>Layout</SectionTitle>

      <p className={`${rowLabelClass} mb-1 mt-1`}>Dimensions</p>
      <div className="flex items-center gap-1.5">
        {dimension('width', 'W')}
        {dimension('length', 'L')}
      </div>

      <p className={`${rowLabelClass} mb-1 mt-3`}>Orientation</p>
      <div className="flex items-center gap-2">
        <TextField
          label="Facing"
          size="sm"
          type="number"
          inputMode="numeric"
          min={0}
          max={360}
          suffix="°"
          disabled={!hasOwnBearing}
          value={effective === null ? '' : Math.round(effective)}
          onChange={(e) => {
            const value = e.target.value;
            if (value === '') return set('bearing', undefined);
            const parsed = Number(value);
            if (Number.isNaN(parsed)) return;
            set('bearing', ((parsed % 360) + 360) % 360);
          }}
          className="w-24 text-right tabular-nums"
        />
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-2xs text-text-secondary">
          <input
            type="checkbox"
            aria-label="Align to fairway"
            checked={!hasOwnBearing}
            onChange={(e) => {
              // Unticking writes the angle it was already facing, so the field
              // opens on a real number rather than empty — you are taking over
              // a value, not inventing one.
              set('bearing', e.target.checked ? undefined : (derived ?? 0));
            }}
            className={checkboxClass}
          />
          Align to fairway
        </label>
      </div>
      {!hasOwnBearing && derived === null && (
        <p className="mt-1 text-2xs leading-4 text-text-muted">
          No fairway to face yet, so the pad is not drawn.
        </p>
      )}
    </div>
  );
}

/** Width, length and bearing are laid out by `LayoutSection`, not generically. */
const LAYOUT_KEYS = new Set(['width', 'length', 'bearing']);

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
  const placedRectangle = KIND_DEFINITIONS[feature.kind].placedRectangle === true;
  const fields = fieldsFor(feature.kind).filter(
    (field) => !placedRectangle || !LAYOUT_KEYS.has(field.key),
  );

  return (
    <>
      {/*
        Which hole this belongs to comes first, on every kind.

        It is the question that places the feature in the course, and it used
        to sit below whatever kind-specific properties happened to exist — so
        where it appeared depended on how many fields a tee had. First is a
        position that does not move.
      */}
      <HoleAssignment course={course} feature={feature} onOp={onOp} />

      {/* Measured, not entered. A line's length and an area's acreage are the
          numbers a designer is actually reaching for, so they sit above the
          things that were typed in. */}
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

      {fields.length > 0 && (
        <div className={sectionClass}>
          {fields.map((field) => (
            <Field key={field.key} field={field} feature={feature} units={units} onOp={onOp} />
          ))}
        </div>
      )}

      {placedRectangle && (
        <LayoutSection course={course} feature={feature} units={units} onOp={onOp} />
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
