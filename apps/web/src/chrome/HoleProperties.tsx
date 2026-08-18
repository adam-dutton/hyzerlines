import { useMemo } from 'react';
import { Button, IconButton, Menu, MenuItem, TextField, cn } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  activeLayout,
  featureName,
  holeOfFeature,
  layoutName,
  pairView,
  setPairPar,
  type Course,
  type FeatureKind,
  type Hole,
  type Op,
} from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { FeatureList } from './FeatureList';
import { FeatureIcon } from './featureIcons';
import { useHoleProfile, useProfiles } from '../survey/useProfiles';
import { ElevationProfileChart } from './ElevationProfile';
import {
  ReadOnlyValue,
  Row,
  SectionTitle,
  ToggleRow,
  fieldWidth,
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

/**
 * The group order a hole's features are listed in.
 *
 * Outside-in along the shot rather than alphabetical or by when they were
 * drawn: where you throw from, where you throw to, the line between them, then
 * the things that constrain it. It is the order a designer builds a hole in,
 * which makes it the order they look for one of its parts in.
 */
const HOLE_FEATURE_ORDER = [
  'tee',
  'target',
  'fairway',
  'mando',
  'dropzone',
  'ob',
  'hazard',
  'casualArea',
  'requiredRelief',
  'notedArea',
  'notedPoint',
] as const satisfies readonly FeatureKind[];

/**
 * What the `+` offers, which is not everything a hole can hold.
 *
 * A hole can *contain* a noted area or a stretch of water — anything drawn
 * inside it resolves to it — but nobody sets out to add water to hole 4. These
 * are the kinds you draw deliberately as part of a hole, and a menu of eleven
 * options to find the two anybody wants is a worse menu.
 */
const ADDABLE_KINDS = [
  'tee',
  'target',
  'mando',
  'dropzone',
  'ob',
] as const satisfies readonly FeatureKind[];

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
  hiddenIds,
  onToggleHidden,
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
  onDrawFeature: (kind: FeatureKind) => void;
  /** Hidden on the map. Session state, not a document edit — see `FeatureList`. */
  hiddenIds: ReadonlySet<string>;
  onToggleHidden: (id: string) => void;
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
   * Everything that resolves to this hole, membership or scope.
   *
   * `holeOfFeature` rather than reading `teeIds` and `targetIds`: those two
   * lists are the hole's *ends*, and a hole is more than its ends. A mando
   * drawn while the hole was selected is scoped to it and belongs in this list;
   * reading only the id arrays is why the panel used to show two tees and a
   * basket and nothing else, whatever else had been drawn inside it.
   */
  const holeFeatures = useMemo(
    () =>
      course.features.filter((feature) => holeOfFeature(course, feature.id)?.id === hole.id),
    [course, hole.id],
  );

  /*
   * Every shot this hole can play: each tee against each basket.
   *
   * The picker is one control rather than two lists with a radio each, because
   * the answer is one pair. Two controls made you set an end at a time, and
   * between the two clicks the panel showed a shot nobody had asked for.
   */
  const shots = useMemo(() => {
    const named = (id: string) => {
      const feature = course.features.find((f) => f.id === id);
      return feature ? featureName(feature) : id;
    };
    return hole.teeIds.flatMap((teeId) =>
      hole.targetIds.map((targetId) => ({
        teeId,
        targetId,
        key: `${teeId}::${targetId}`,
        label: `${named(teeId)} · ${named(targetId)}`,
      })),
    );
  }, [course.features, hole.teeIds, hole.targetIds]);

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

        {/*
          Which shot every number on this panel was measured for.

          A hole with three tees and two pins is six different throws with six
          lengths and possibly six pars, and until the panel says which one it
          is describing, every figure under it is unattributed. It sits with the
          number and the par because it is a fact about the hole, not about any
          one tee.
        */}
        {shots.length > 1 && (
          <Row label="Playing from">
            <select
              aria-label="Which shot this hole is measured as"
              value={pair ? `${pair.teeId}::${pair.targetId}` : ''}
              onChange={(e) => {
                const next = shots.find((shot) => shot.key === e.target.value);
                if (next) onSelectPair({ teeId: next.teeId, targetId: next.targetId });
              }}
              className={cn(selectClass, fieldWidth, 'truncate')}
            >
              {shots.map((shot) => (
                <option key={shot.key} value={shot.key}>
                  {shot.label}
                </option>
              ))}
            </select>
          </Row>
        )}

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
          <ReadOnlyValue>
            {measurement?.straight == null ? '—' : formatDistance(measurement.straight, units)}
          </ReadOnlyValue>
        </Row>
        {/* Only shown when a fairway exists: a routed length identical to the
            straight one would imply a route that isn't there. */}
        {measurement?.routed != null && (
          <Row label="Along the fairway">
            <ReadOnlyValue>{formatDistance(measurement.routed, units)}</ReadOnlyValue>
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
        Everything the hole is made of, grouped by what it is.

        The same list the course tab draws, over a different scope — which is
        the point. A tee looked at from the hole panel and the same tee looked
        at from the course list were two different rows before this: one had a
        radio and a remove cross, the other had an icon, a measurement and an
        eye. They are one row now, and drilling into it goes to the same panel
        either way.

        What the radio used to do lives in the "Playing from" row above. Which
        shot the panel is describing is a question about the *hole*, not about
        any one tee, and asking it once at the top beats asking it twice — once
        in a column of tees and again in a column of baskets — for an answer
        that is a single pair.
      */}
      <div className={sectionClass}>
        <SectionTitle
          count={holeFeatures.length}
          action={
            <Menu
              label="Add to this hole"
              align="end"
              trigger={
                <IconButton label="Add to this hole" size="sm" tooltipSide="left">
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M6 1.5v9M1.5 6h9"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </IconButton>
              }
            >
              {/*
                Arms the tool with this hole selected, which is what makes the
                next click on the map land in this hole. Before it, adding a tee
                meant knowing that drawing one while a hole happened to be
                selected joined it — true, and discoverable by nobody.
              */}
              {ADDABLE_KINDS.map((kind) => (
                <MenuItem
                  key={kind}
                  onSelect={() => onDrawFeature(kind)}
                  icon={<FeatureIcon kind={kind} size={16} />}
                >
                  {KIND_DEFINITIONS[kind].label}
                </MenuItem>
              ))}
            </Menu>
          }
        >
          Features
        </SectionTitle>

        <FeatureList
          features={holeFeatures}
          order={HOLE_FEATURE_ORDER}
          units={units}
          selectedId={null}
          hiddenIds={hiddenIds}
          onSelect={onRevealFeature}
          onToggleHidden={onToggleHidden}
          placement="section"
          empty="Nothing here yet. Draw a tee and a basket — anything you place while this hole is selected joins it."
        />

        {/*
          The fairway's own controls, under the list rather than in a section of
          their own.

          The fairway is not something you find or draw — it is the line between
          the two ends, from the moment both exist — so it appears in the list
          above only once somebody has bent it and it became a feature. Which is
          why these two say the rest: whether the line is straight, and whether
          it is drawn at all.
        */}
        {pair && !fairway && hole.showFairway && (
          <p className="mt-3 text-2xs leading-4 text-text-muted">
            The fairway runs straight. Drag a point on the line to route it around something.
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
        <Button variant="destructive" block onClick={onDelete}>
          Delete hole
          {/* Says so explicitly, because the features are drawn land and
              deleting the hole that references them must not feel like it
              might take them with it. */}
          <span className="text-2xs text-text-muted">Keeps the drawn features</span>
        </Button>
      </div>
    </>
  );
}
