import { TextField, cn } from '@hyzerlines/design';
import { featureName, type Course, type Hole, type Op } from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { setHolePar, viewHole } from '../document/holeView';
import { Row, SectionTitle, sectionClass } from './propertyRow';

/**
 * Properties of the selected hole.
 *
 * The scorecard on the left answers "how does this course read as a round".
 * This answers "what is this hole made of" — the number, the par and the
 * reasoning behind it, the measurements, and which drawn features it claims.
 *
 * Par gets more room here than the scorecard can give it. In the list it is a
 * digit with a tooltip; here the effective length, the band it fell into and
 * the skill level it was read against are all on screen at once, because that
 * is the difference between a number you can argue with and one you either
 * accept blindly or ignore.
 */

function AssignedFeature({
  course,
  id,
  fallback,
  onReveal,
}: {
  course: Course;
  id: string | null | undefined;
  fallback: string;
  onReveal: (id: string) => void;
}) {
  const feature = id ? course.features.find((f) => f.id === id) : undefined;

  if (!feature) {
    return <span className="text-xs text-text-disabled">{fallback}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onReveal(feature.id)}
      /*
       * Named for the action, not just the feature. An unnamed tee reads as
       * "Tee pad", which is also the name of the rail button that draws one —
       * two controls with the same accessible name doing very different
       * things, which is exactly the ambiguity a screen reader cannot resolve.
       */
      aria-label={`Select ${featureName(feature)}`}
      className="max-w-[9rem] truncate text-right text-xs text-text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      {featureName(feature)}
    </button>
  );
}

export function HoleProperties({
  course,
  hole,
  units,
  onOp,
  onDelete,
  onRevealFeature,
}: {
  course: Course;
  hole: Hole;
  units: UnitSystem;
  onOp: (op: Op) => void;
  onDelete: () => void;
  onRevealFeature: (id: string) => void;
}) {
  const { measurement, suggestion, par, overridden, pair } = viewHole(course, hole);

  const update = (changes: Partial<Omit<Hole, 'id'>>) =>
    onOp({ type: 'updateHole', id: hole.id, changes });

  /*
   * Par is set on the PAIR, not the hole — a hole with three tees and three
   * pins has nine of them. This panel still shows the first tee to the first
   * pin, which is what the app did before; the pair picker in PR 6 turns that
   * into a choice.
   */
  const setPar = (value: number | null) => {
    const op = setHolePar(course, hole, value);
    if (op) onOp(op);
  };

  return (
    <>
      <div className={sectionClass}>
        <Row label="Number">
          <TextField
            label="Hole number"
            size="sm"
            type="number"
            inputMode="numeric"
            value={hole.number}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              // Out-of-range values are refused rather than clamped: silently
              // turning 0 into 1 makes it look like the keystroke was ignored.
              if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) return;
              update({ number: parsed });
            }}
            className="w-20 text-right tabular-nums"
          />
        </Row>
        <Row label="Name">
          <TextField
            label="Hole name"
            size="sm"
            value={hole.name}
            placeholder={`Hole ${hole.number}`}
            onChange={(e) => update({ name: e.target.value })}
            className="w-36"
          />
        </Row>
      </div>

      <div className={sectionClass}>
        <SectionTitle>Par</SectionTitle>
        <Row label="Par">
          <span className="flex items-center gap-1.5">
            <select
              /* Distinct from the scorecard's "Par for Hole 1": two comboboxes
                 that set the same value need names a screen reader can tell
                 apart, and so does a test. */
              aria-label="Par for the selected hole"
              value={par ?? ''}
              disabled={par === null}
              onChange={(e) => {
                const value = Number(e.target.value);
                setPar(value === suggestion?.par ? null : value);
              }}
              className={cn(
                'rounded-md border border-border-default bg-surface-inset px-2 py-1 font-mono text-xs tabular-nums',
                'focus:border-border-accent focus:outline-none focus:ring-2 focus:ring-focus-ring/40',
                'disabled:text-text-disabled',
                overridden ? 'text-text-accent' : 'text-text-primary',
              )}
            >
              {par === null && <option value="">—</option>}
              {[2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {overridden && (
              <button
                type="button"
                onClick={() => setPar(null)}
                className="text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Reset
              </button>
            )}
          </span>
        </Row>

        {suggestion ? (
          <div className="mt-1 space-y-0.5">
            {suggestion.factors.map((factor) => (
              <p key={factor.label} className="text-2xs leading-4 text-text-muted">
                {factor.label}
              </p>
            ))}
            <p className="text-2xs leading-4 text-text-muted">
              Effective length {formatDistance(suggestion.effectiveMeters, units)}
            </p>
            {suggestion.borderline && (
              <p className="text-2xs leading-4 text-status-warning">
                Close to a band boundary — could go either way.
              </p>
            )}
            {overridden && (
              <p className="text-2xs leading-4 text-text-accent">
                You set this. Suggested par is {suggestion.par}.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            Assign a tee and a basket to get a par.
          </p>
        )}
      </div>

      <div className={sectionClass}>
        <SectionTitle>Measurements</SectionTitle>
        <Row label="Tee to basket">
          <span className="font-mono text-xs tabular-nums text-text-primary">
            {measurement.straight === null ? '—' : formatDistance(measurement.straight, units)}
          </span>
        </Row>
        {/* Only shown when a fairway exists: a routed length identical to the
            straight one would imply a route that isn't there. */}
        {measurement.routed !== null && (
          <Row label="Along the fairway">
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {formatDistance(measurement.routed, units)}
            </span>
          </Row>
        )}
      </div>

      <div className={sectionClass}>
        <SectionTitle>Features</SectionTitle>
        {/* Short labels, because the value beside them is usually the kind's
            own name — "Tee pad: Tee pad" is a row that says nothing twice. */}
        <Row label="Tee">
          <AssignedFeature
            course={course}
            id={hole.teeIds[0]}
            fallback="None"
            onReveal={onRevealFeature}
          />
        </Row>
        <Row label="Basket">
          <AssignedFeature
            course={course}
            id={hole.targetIds[0]}
            fallback="None"
            onReveal={onRevealFeature}
          />
        </Row>
        <Row label="Fairway">
          <AssignedFeature
            course={course}
            id={pair?.fairwayId}
            fallback="None"
            onReveal={onRevealFeature}
          />
        </Row>
      </div>

      <div className={sectionClass}>
        <button
          type="button"
          onClick={onDelete}
          className="w-full rounded-md px-2 py-1 text-left text-xs text-status-danger transition-colors duration-fast hover:bg-status-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Delete hole
          {/* Says so explicitly, because the features are drawn land and
              deleting the hole that references them must not feel like it
              might take them with it. */}
          <span className="ml-1.5 text-2xs text-text-muted">Keeps the drawn features</span>
        </button>
      </div>
    </>
  );
}
