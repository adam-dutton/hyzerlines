import { TextField, cn } from '@hyzerlines/design';
import {
  activeLayout,
  featureName,
  layoutName,
  pairView,
  setPairPar,
  type Course,
  type Feature,
  type Hole,
  type Op,
} from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { Row, SectionTitle, sectionClass, selectClass } from './propertyRow';

/**
 * Properties of the selected hole.
 *
 * The scorecard on the left answers "how does this course read as a round".
 * This answers "what is this hole made of" — which shot you are looking at, the
 * par and the reasoning behind it, and the measurements that produced it.
 *
 * ## The shot is chosen, not assumed
 *
 * A hole with two tees and two pins is four different throws, with four lengths
 * and possibly four pars. Until this panel let you say which one you meant, it
 * showed the first tee to the first pin and called that "the hole" — a number
 * that was right for one of the four and silently wrong for the rest.
 *
 * So the picker comes first, above the par it determines. It appears only when
 * there is genuinely a choice to make; a one-tee, one-pin hole gets the plain
 * links it always had, because a dropdown with one option asks a question that
 * has no other answer.
 */

/** The stored pair a panel is describing. Held by the editor, not the document. */
export interface SelectedPair {
  teeId: string;
  targetId: string;
}

function RevealButton({ feature, onReveal }: { feature: Feature; onReveal: () => void }) {
  return (
    <button
      type="button"
      onClick={onReveal}
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

/**
 * One end of the shot: a picker when there is a choice, a link when there is not.
 *
 * The reveal button survives either way — selecting the tee you are measuring
 * from is the most common next action from here, and it should not disappear
 * just because the hole grew a second pin.
 */
function EndPicker({
  label,
  ids,
  value,
  course,
  onChange,
  onReveal,
}: {
  label: string;
  ids: readonly string[];
  value: string | null;
  course: Course;
  onChange: (id: string) => void;
  onReveal: (id: string) => void;
}) {
  const features = ids
    .map((id) => course.features.find((f) => f.id === id))
    .filter((f): f is Feature => f !== undefined);

  const current = value ? course.features.find((f) => f.id === value) : undefined;

  if (features.length === 0) {
    return (
      <Row label={label}>
        <span className="text-xs text-text-disabled">None</span>
      </Row>
    );
  }

  if (features.length === 1) {
    return (
      <Row label={label}>
        <RevealButton feature={features[0]!} onReveal={() => onReveal(features[0]!.id)} />
      </Row>
    );
  }

  return (
    <Row label={label}>
      <span className="flex min-w-0 items-center gap-1.5">
        <select
          aria-label={`${label} for this hole`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cn(selectClass, 'max-w-[8rem] truncate')}
        >
          {features.map((feature) => (
            <option key={feature.id} value={feature.id}>
              {featureName(feature)}
            </option>
          ))}
        </select>
        {current && (
          <button
            type="button"
            onClick={() => onReveal(current.id)}
            aria-label={`Select ${featureName(current)}`}
            className="shrink-0 text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Show
          </button>
        )}
      </span>
    </Row>
  );
}

export function HoleProperties({
  course,
  hole,
  pair,
  units,
  onOp,
  onSelectPair,
  onDelete,
  onRevealFeature,
}: {
  course: Course;
  hole: Hole;
  /** Which shot the panel is describing. Null when the hole has none yet. */
  pair: SelectedPair | null;
  units: UnitSystem;
  onOp: (op: Op) => void;
  onSelectPair: (pair: SelectedPair) => void;
  onDelete: () => void;
  onRevealFeature: (id: string) => void;
}) {
  const view = pair ? pairView(course, pair.teeId, pair.targetId) : null;
  const measurement = view?.measurement;
  const suggestion = view?.suggestion ?? null;
  const par = view?.par ?? null;
  const overridden = view?.overridden ?? false;

  const fairway = view?.pair?.fairwayId
    ? course.features.find((f) => f.id === view.pair!.fairwayId)
    : undefined;

  /*
   * Whether the routing plays this exact shot.
   *
   * Worth saying out loud: the panel defaults to the routed pair, so a designer
   * who changes the picker is now looking at a shot the layout does not use.
   * Without this line that difference is invisible, and the par they set would
   * seem not to reach the scorecard.
   */
  const layout = activeLayout(course);
  const routed = layout?.plays.find((play) => play.holeId === hole.id);
  const showingRouted =
    routed !== undefined &&
    pair !== null &&
    routed.teeId === pair.teeId &&
    routed.targetId === pair.targetId;

  const update = (changes: Partial<Omit<Hole, 'id'>>) =>
    onOp({ type: 'updateHole', id: hole.id, changes });

  const setPar = (value: number | null) => {
    if (!pair) return;
    onOp(setPairPar(course, pair.teeId, pair.targetId, value));
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
        <SectionTitle>Shot</SectionTitle>
        <EndPicker
          label="Tee"
          ids={hole.teeIds}
          value={pair?.teeId ?? null}
          course={course}
          onChange={(teeId) => pair && onSelectPair({ ...pair, teeId })}
          onReveal={onRevealFeature}
        />
        <EndPicker
          label="Target"
          ids={hole.targetIds}
          value={pair?.targetId ?? null}
          course={course}
          onChange={(targetId) => pair && onSelectPair({ ...pair, targetId })}
          onReveal={onRevealFeature}
        />
        <Row label="Fairway">
          {fairway ? (
            <RevealButton feature={fairway} onReveal={() => onRevealFeature(fairway.id)} />
          ) : (
            <span className="text-xs text-text-disabled">None</span>
          )}
        </Row>
        {routed && layout && (
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            {showingRouted
              ? `Played as this shot in ${layoutName(layout)}.`
              : `${layoutName(layout)} plays a different tee or pin — this shot is not in the routing.`}
          </p>
        )}
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
                selectClass,
                'font-mono tabular-nums',
                overridden && 'text-text-accent',
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
            {measurement?.straight == null ? '—' : formatDistance(measurement.straight, units)}
          </span>
        </Row>
        {/* Only shown when a fairway exists: a routed length identical to the
            straight one would imply a route that isn't there. */}
        {measurement?.routed != null && (
          <Row label="Along the fairway">
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {formatDistance(measurement.routed, units)}
            </span>
          </Row>
        )}
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
