import { TextField, cn } from '@hyzerlines/design';
import {
  activeLayout,
  assignToHole,
  featureName,
  holeOf,
  layoutName,
  pairView,
  setPairPar,
  type Course,
  type Feature,
  type Hole,
  type Op,
} from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { FeatureRow } from './FeatureList';
import { useHoleProfile, useProfiles } from '../survey/useProfiles';
import { ElevationProfileChart } from './ElevationProfile';
import {
  Row,
  SectionTitle,
  ToggleRow,
  fieldWidth,
  rowLabelClass,
  sectionClass,
  selectClass,
} from './propertyRow';

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
 * Every tee, or every basket, as a list rather than a dropdown.
 *
 * A dropdown showed one end at a time, which is what let a hole hold three tees
 * while the interface presented a course of one. Listed, the hole's shape is
 * the panel's shape: three rows means three tees, and the marked one is the
 * shot every number on this panel was measured for.
 *
 * The mark is a radio, and it is the picker. Choosing a tee here is choosing
 * which shot the panel, the card and the map are all showing — the same edit
 * the dropdown made, with the alternatives visible instead of hidden behind it.
 *
 * ## Order is meaningful, so removal is not deletion
 *
 * The first tee and the first target are the hole's representative pair until a
 * layout routes it. Removing one takes it *out of the hole* and leaves it on
 * the ground: the feature is still drawn, still selectable, still somewhere a
 * designer put it deliberately. Deleting it is a different action, and it lives
 * on the feature itself.
 */
function EndList({
  label,
  kind,
  hole,
  ids,
  value,
  course,
  units,
  onChange,
  onReveal,
  onOp,
  onDraw,
}: {
  label: string;
  kind: 'tee' | 'target';
  hole: Hole;
  ids: readonly string[];
  value: string | null;
  course: Course;
  units: UnitSystem;
  onChange: (id: string) => void;
  onReveal: (id: string) => void;
  onOp: (op: Op) => void;
  onDraw: () => void;
}) {
  const features = ids
    .map((id) => course.features.find((f) => f.id === id))
    .filter((f): f is Feature => f !== undefined);

  const free = course.features.filter(
    (f) => f.kind === kind && holeOf(course, f.id) === undefined,
  );

  const one = kind === 'tee' ? 'tee' : 'basket';
  // "Measure from" a tee and "Measure to" a basket: the control picks an end of
  // the shot, and which end it is is the whole meaning of the row.
  const verb = kind === 'tee' ? 'Measure from' : 'Measure to';

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className={rowLabelClass}>{label}</span>
        {/*
          The button arms the tool with this hole selected, which is what makes
          the next click on the map land in this hole. Before it, adding a tee
          meant knowing that drawing one while a hole happened to be selected
          joined it — true, and discoverable by nobody.
        */}
        <button
          type="button"
          onClick={onDraw}
          className="shrink-0 text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          Draw a {one}
        </button>
      </div>

      {features.length === 0 ? (
        <p className="py-1 text-xs text-text-disabled">None</p>
      ) : (
        /*
          A radiogroup rather than a list, and named. Two unnamed baskets are
          two rows reading "Target"; the group is what tells a screen reader
          which set of ends they are, and it is the only name they have.
        */
        <ul role="radiogroup" aria-label={label} className="mt-1">
          {features.map((feature) => {
            const chosen = feature.id === value;
            return (
              <FeatureRow
                key={feature.id}
                feature={feature}
                units={units}
                selected={chosen}
                onSelect={() => onReveal(feature.id)}
                /*
                  The radio leads the row because it answers a different
                  question from the row itself. Clicking the row *opens* the
                  tee; clicking the radio says "measure the hole from this one".
                  Two verbs, so two controls — and a radio even when there is
                  one of them, because a row that loses its mark when a hole
                  drops to a single tee reads as the panel having stopped
                  tracking anything.
                */
                leading={
                  <input
                    type="radio"
                    name={`${hole.id}-${kind}`}
                    // Carried so the choice is identifiable from the DOM: two
                    // unnamed baskets are two identical rows otherwise.
                    value={feature.id}
                    checked={chosen}
                    onChange={() => onChange(feature.id)}
                    aria-label={`${verb} ${featureName(feature)}`}
                    /*
                     * `--hz-accent-solid`, not `--hz-color-accent-solid`. The
                     * generator emits semantic roles as `--hz-<role>` and only
                     * registers the `--color-*` aliases inside `@theme inline`,
                     * so the longer name silently falls back to the browser's
                     * own accent — blue, where ours is teal.
                     */
                    className="mr-1.5 size-3 shrink-0 accent-[var(--hz-accent-solid)]"
                  />
                }
                trailing={
                  <button
                    type="button"
                    onClick={() => {
                      const op = assignToHole(course, feature.id, null);
                      if (op) onOp(op);
                    }}
                    aria-label={`Remove ${featureName(feature)} from this hole`}
                    title="Remove from this hole — the feature stays on the map"
                    className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                      <path
                        d="M1 1l8 8M9 1l-8 8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                }
              />
            );
          })}
        </ul>
      )}

      {/*
        Only unassigned features are offered. Stealing a tee from another hole is
        possible, but it is rarer and more destructive, so it lives in the
        feature panel where the hole you are taking it from is on screen.
      */}
      {free.length > 0 && (
        <select
          aria-label={kind === 'tee' ? 'Add a tee' : 'Add a basket'}
          value=""
          onChange={(e) => {
            const op = assignToHole(course, e.target.value, hole.id);
            if (op) onOp(op);
          }}
          className={cn(selectClass, 'mt-1 w-full truncate')}
        >
          <option value="">Add one already drawn…</option>
          {free.map((feature) => (
            <option key={feature.id} value={feature.id}>
              {featureName(feature)}
            </option>
          ))}
        </select>
      )}
    </div>
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
  onDrawFeature,
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
  /**
   * Arm the tool that draws this kind, with the hole still selected.
   *
   * The editor owns tool state — it is next to the map that uses it — so the
   * panel asks rather than reaches.
   */
  onDrawFeature: (kind: 'tee' | 'target') => void;
}) {
  /*
   * The par is priced with elevation when — and only when — an imported survey
   * supplied it. See `ProfileProvider`: `elevations` is already filtered to the
   * shots whose numbers are good enough to move a stroke, so this passes the
   * whole map and lets core find the one it needs.
   */
  const { elevations, loading } = useProfiles();
  const holeProfile = useHoleProfile(pair);

  const view = pair
    ? pairView(course, pair.teeId, pair.targetId, undefined, undefined, elevations)
    : null;
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
      {/*
        Number, par and the measurements it produced, in that order and without
        section headings between them. This is the answer to "what is this
        hole" — everything else on the panel is about how it is put together —
        and it used to be spread across three titled sections with the shot
        picker in the middle of them.

        The name row is gone: it is the panel's heading now.
      */}
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
            className={cn(fieldWidth, 'text-right tabular-nums')}
          />
        </Row>

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
                fieldWidth,
                'tabular-nums',
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
                You set this. Suggested par is {suggestion.par}.{' '}
                <button
                  type="button"
                  onClick={() => setPar(null)}
                  className="underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                >
                  Reset
                </button>
              </p>
            )}
          </div>
        ) : (
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            Assign a tee and a basket to get a par.
          </p>
        )}
      </div>

      {/*
        The measurements get their own section, under a rule.

        Par carries a paragraph of reasoning beneath it, and with the distances
        in the same block that reasoning read as though it belonged to them —
        the numbers appeared to be a continuation of the argument rather than
        the inputs to it. A hairline is enough to say where one ends.
      */}
      <div className={sectionClass}>
        <Row label="Tee to basket">
          <span className="text-xs tabular-nums text-text-primary">
            {measurement?.straight == null ? '—' : formatDistance(measurement.straight, units)}
          </span>
        </Row>
        {/* Only shown when a fairway exists: a routed length identical to the
            straight one would imply a route that isn't there. */}
        {measurement?.routed != null && (
          <Row label="Along the fairway">
            <span className="text-xs tabular-nums text-text-primary">
              {formatDistance(measurement.routed, units)}
            </span>
          </Row>
        )}
      </div>

      {/*
        The ground the shot is thrown over.

        Directly under the measurements, because that is what it is: the third
        dimension of the same shot, and the one a plan view cannot show. It is
        also the input to the elevation term of the par above, so it belongs
        between the two rather than at the bottom of the panel.

        Absent rather than empty when there is nothing to draw. A hole outside
        the survey with the global overlay unavailable has no profile, and an
        empty chart frame would suggest flat ground.
      */}
      {pair && (holeProfile || loading) && (
        <div className={sectionClass}>
          {holeProfile ? (
            <ElevationProfileChart
              entry={holeProfile}
              length={measurement?.effective ?? null}
              units={units}
            />
          ) : (
            <>
              <SectionTitle>Elevation</SectionTitle>
              <p className="text-2xs leading-4 text-text-muted">Reading the terrain…</p>
            </>
          )}
        </div>
      )}

      {/*
        "Features", not "Shot" — it is the list of things the hole is made of,
        and it grows a real one when a hole can hold several tees, several pins
        and a fairway per pairing. The single-shot picker below is what that
        replaces.
      */}
      <div className={sectionClass}>
        <SectionTitle>Features</SectionTitle>
        <EndList
          label="Tees"
          kind="tee"
          hole={hole}
          ids={hole.teeIds}
          value={pair?.teeId ?? null}
          course={course}
          /*
           * A hole with no basket has no pair yet, and picking a tee still has
           * to mean something — otherwise the first tee on a half-built hole is
           * unselectable until the basket arrives. The target falls back to the
           * hole's first, which is what `chosenPair` would resolve to anyway.
           */
          onChange={(teeId) => {
            const targetId = pair?.targetId ?? hole.targetIds[0];
            if (targetId) onSelectPair({ teeId, targetId });
          }}
          units={units}
          onReveal={onRevealFeature}
          onOp={onOp}
          onDraw={() => onDrawFeature('tee')}
        />
        <EndList
          label="Baskets"
          kind="target"
          hole={hole}
          ids={hole.targetIds}
          value={pair?.targetId ?? null}
          course={course}
          units={units}
          onChange={(targetId) => {
            const teeId = pair?.teeId ?? hole.teeIds[0];
            if (teeId) onSelectPair({ teeId, targetId });
          }}
          onReveal={onRevealFeature}
          onOp={onOp}
          onDraw={() => onDrawFeature('target')}
        />
        {/*
          The fairway is no longer something you find or draw — it is the line
          between the two ends above, from the moment both exist. What is worth
          saying is whether the designer has shaped it, because a straight line
          and a routed one mean different things to every measurement below.
        */}
        <Row label="Fairway">
          {fairway ? (
            <RevealButton feature={fairway} onReveal={() => onRevealFeature(fairway.id)} />
          ) : (
            <span className="text-xs text-text-secondary">
              {pair ? 'Straight' : <span className="text-text-disabled">—</span>}
            </span>
          )}
        </Row>
        {pair && !fairway && hole.showFairway && (
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            Drag a point on the line to route it around something.
          </p>
        )}
        {/*
          Per hole, because the reason to hide one is local: a hole threading a
          tight gap is easier to judge with the canopy visible while every other
          corridor stays up. Hiding takes the handles with it — an aid you cannot
          see must not be one you can edit by accident — and never deletes a line
          that was already routed.
        */}
        <ToggleRow
          label="Show fairway"
          checked={hole.showFairway}
          onChange={(showFairway) => update({ showFairway })}
        />
        {!hole.showFairway && fairway && (
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            The routed line is kept, just not drawn.
          </p>
        )}
        {routed && layout && (
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            {showingRouted
              ? `Played as this shot in ${layoutName(layout)}.`
              : `${layoutName(layout)} plays a different tee or pin — this shot is not in the routing.`}
          </p>
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
