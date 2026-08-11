import { useMemo, useState, type ReactNode } from 'react';
import { IconButton, Panel, Segmented, cn } from '@hyzerlines/design';
import {
  FOCUS_DEFINITIONS,
  hasMultipleTees,
  holeName,
  holeOfFeature,
  scorecard,
  viewHoles,
  type Course,
  type FairwayChoices,
  type Feature,
  type Finding,
  type Focus,
  type Hole,
  type Op,
} from '@hyzerlines/core';

import type { UnitSystem } from '../units';
import { useProfiles } from '../survey/useProfiles';
import { FindingsList } from './FindingsList';
import { FeatureList } from './FeatureList';
import { HolesGrid } from './HolesGrid';
import { Scorecard, type CardMode } from './Scorecard';
import {
  GAP,
  GUTTER,
  HOLES_GRID_MAX_HEIGHT,
  PANEL_BOTTOM,
  PANEL_TOP,
  PANEL_WIDTH,
} from './layout';

/**
 * The course, and what is in whichever part of it you are looking at.
 *
 * Two sections under one roof, split by a hairline, in Figma's pages-over-layers
 * arrangement: the holes on top choose a context, and the features below show
 * what is in it. That is the whole structure, and it replaces a tab strip that
 * was making one column mean three different things.
 *
 * ## The scope
 *
 * A hole selected in the grid scopes the features to that hole. No hole selected
 * scopes them to the course, which is a real place features live — a property
 * line, a road running past four holes, a practice basket — and the model has
 * always said so: `holeId` is nullable, and null means course-level.
 *
 * The scope is stated as a pill in the Features header rather than left implicit
 * in which chip happens to be lit. There was briefly a "Whole course" row above
 * the holes to get back out, which became redundant the moment the pill could
 * clear itself: two controls for one piece of state, and the row was costing a
 * line of a panel that needed the room.
 *
 * ## What the focus changes here
 *
 * Everything. `play` is holes and their features. `land` has no holes to show — a
 * pond and forty trees are not a sequence — so it drops the grid and the feature
 * list becomes the whole panel. That is the strongest argument for the focus
 * mechanism: a scorecard and an inventory are different answers, and without a
 * focus they would have to share one column.
 *
 * A focus with nothing behind it renders a frame that names itself, inherited
 * from the empty Layouts tab this replaced. A control that vanishes until its
 * milestone lands leaves the structure invisible exactly when somebody is trying
 * to learn it.
 */

/**
 * Which hole a feature is in, by either of the two routes the model has.
 *
 * A hole owns its tees and targets by *listing* them — `hole.teeIds`,
 * `hole.targetIds` — and `holeOfFeature` resolves that, fairways included, by
 * looking through the pairs. Everything else carries its own `holeId`, which is
 * scope rather than membership: an OB line belonging to hole 4 is a different
 * claim from a tee being one of hole 4's tees.
 *
 * Both have to be consulted, and reading only one is a wrong answer rather than a
 * partial one. `addHole` claims a loose tee and basket by putting their ids in the
 * hole's arrays and never touches `holeId`, so a `holeId`-only filter shows a
 * freshly built hole as empty *and* files its tee under the whole course — the
 * feature list contradicting the hole panel about the same two shapes.
 */
const holeIdOf = (course: Course, feature: Feature): string | null =>
  holeOfFeature(course, feature.id)?.id ?? feature.holeId;

/** A section heading inside the panel: a title, a count, and an action. */
function SectionHeader({
  title,
  count,
  children,
  action,
}: {
  title: string;
  count?: number;
  /** Sits after the count — the scope pill, in practice. */
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 pl-2.5 pr-1.5">
      <h2 className="shrink-0 text-xs font-semibold text-text-primary">{title}</h2>
      {count !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-text-muted">{count}</span>
      )}
      {children}
      {action && <span className="ml-auto flex shrink-0 items-center gap-1">{action}</span>}
    </div>
  );
}

/**
 * Which scope the features below are in, and the way back out of it.
 *
 * Reads as a value rather than as a button, because that is what it is: a
 * statement of where you are, carrying an affordance to leave. The ✕ exists only
 * when there is somewhere to go — in course scope the pill is a plain label, and
 * a clear button that clears nothing is a control lying about being live.
 */
function ScopePill({ hole, onClear }: { hole: Hole | null; onClear: () => void }) {
  if (!hole) {
    return (
      <span className="flex h-5 min-w-0 items-center rounded-full bg-surface-field px-2 text-2xs text-text-muted">
        Whole course
      </span>
    );
  }

  return (
    <span className="flex h-5 min-w-0 items-center gap-0.5 rounded-full bg-accent-soft pl-2 pr-0.5 text-2xs text-text-accent">
      <span className="min-w-0 truncate">{holeName(hole)}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label="Show the whole course"
        title="Show the whole course"
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center rounded-full',
          'transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
        )}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
          <path
            d="M1 1l6 6M7 1L1 7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </span>
  );
}

export function LeftPanel({
  course,
  units,
  findings,
  choices,
  focus,
  hiddenIds,
  selectedFeatureId,
  onSelectFeature,
  onToggleHidden,
  selectedHoleId,
  onSelectHole,
  onOp,
  onAddHole,
  onRevealFinding,
  onDismissRule,
}: {
  course: Course;
  units: UnitSystem;
  findings: readonly Finding[];
  /**
   * Which shot each hole is being looked at as.
   *
   * Passed in rather than resolved here so that a length in this panel is the
   * length of the corridor on the map. The two used to agree only for the
   * selected hole.
   */
  choices: FairwayChoices;
  /** Which kind of work the editor is set up for. Decides this panel's content. */
  focus: Focus;
  /** Features the designer has hidden for this session. See `FeatureList`. */
  hiddenIds: ReadonlySet<string>;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string) => void;
  onToggleHidden: (id: string) => void;
  selectedHoleId: string | null;
  onSelectHole: (id: string | null) => void;
  onOp: (op: Op) => void;
  onAddHole: () => void;
  onRevealFinding: (finding: Finding) => void;
  onDismissRule: (ruleId: string) => void;
}) {
  // Playing order, not creation order.
  const holes = useMemo(
    () => [...course.holes].sort((a, b) => a.number - b.number),
    [course.holes],
  );

  // Elevation reaches the grid the same way it reaches the hole panel, so a par
  // that moved because of a hill moves in both places or in neither.
  const { elevations } = useProfiles();
  const views = useMemo(
    () => viewHoles(course, holes, elevations, choices),
    [course, holes, elevations, choices],
  );

  const definition = FOCUS_DEFINITIONS[focus];
  const scopedHole = holes.find((hole) => hole.id === selectedHoleId) ?? null;

  /*
   * The card, which the grid gives way to only when there is more than one tee.
   *
   * A three-tee hole is three different lengths and a chip has room for one
   * number, so the grid would have to pick one and be silently wrong about the
   * other two — which is the exact failure the card exists to fix. On a
   * multi-tee course the card replaces the grid rather than sitting beside it.
   *
   * Asked before built, so a single-tee course does not pay for a card it will
   * not draw.
   */
  const multipleTees = hasMultipleTees(course);
  const card = useMemo(
    () => (multipleTees ? scorecard(course, holes, { elevations, choices }) : null),
    [multipleTees, course, holes, elevations, choices],
  );

  const [cardMode, setCardMode] = useState<CardMode>('length');

  /*
   * What the feature list holds, and in what order the groups come.
   *
   * Scoped by hole when one is selected and by the course otherwise, then
   * narrowed to the kinds this focus is responsible for. Both halves matter: the
   * scope answers "which part of the course" and the focus answers "which kind
   * of work" — a pond belongs to the land whether or not hole 4 is selected.
   */
  /*
   * The kinds the list shows, and the order its groups come in.
   *
   * The focus's own kinds, plus `fairway` in Play — which is not in any focus
   * because no palette draws one, and that is a statement about *tools* rather
   * than about what a hole contains. A shaped fairway is a real feature with real
   * properties, and leaving it out of the inventory would make the list disagree
   * with the hole panel, which has always listed it. Last, because it is the thing
   * between the two ends above it.
   */
  const order = useMemo(
    () => (focus === 'play' ? [...definition.kinds, 'fairway' as const] : definition.kinds),
    [focus, definition.kinds],
  );

  const scopedFeatures = useMemo<readonly Feature[]>(() => {
    const wanted = scopedHole?.id ?? null;
    return course.features.filter(
      (feature) => holeIdOf(course, feature) === wanted && order.includes(feature.kind),
    );
  }, [course, scopedHole, order]);

  const showHoles = focus === 'play';

  return (
    <div
      className="pointer-events-none absolute flex flex-col overflow-hidden"
      style={{
        top: PANEL_TOP,
        left: GUTTER,
        /*
         * Full height. The tool bar and the readouts sit in the channel between
         * the two columns, so there is nothing down here to clear — and the
         * column needs every pixel, because eighteen holes and their features
         * share it.
         *
         * Bounded rather than sized to content, so a course with more features
         * than fit scrolls inside its panel instead of running off the screen.
         */
        bottom: PANEL_BOTTOM,
        width: PANEL_WIDTH,
        gap: GAP,
        zIndex: 'var(--hz-z-chrome)',
      }}
    >
      <Panel
        as="section"
        elevation="raised"
        padding="none"
        className="flex min-h-0 flex-col overflow-hidden"
        aria-label={definition.label}
      >
        {!definition.ready ? (
          <>
            <SectionHeader title={definition.label} />
            <p className="px-2.5 pb-3 text-2xs leading-4 text-text-muted">
              {definition.summary} Coming in a later release.
            </p>
          </>
        ) : (
          <>
            {showHoles && (
              <>
                <SectionHeader
                  title="Holes"
                  count={holes.length}
                  action={
                    <>
                      {/* Only with the card, because the grid has no second
                          number to switch to — it prints par and length at
                          once. */}
                      {card && (
                        <Segmented
                          label="Card shows"
                          value={cardMode}
                          onChange={setCardMode}
                          options={[
                            { value: 'length', label: 'Length' },
                            { value: 'par', label: 'Par' },
                          ]}
                        />
                      )}
                      <IconButton
                        label="Add hole"
                        size="sm"
                        tooltipSide="right"
                        onClick={onAddHole}
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                          <path
                            d="M6 2v8M2 6h8"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </IconButton>
                    </>
                  }
                />

                {holes.length === 0 ? (
                  <p className="px-2.5 pb-3 text-2xs leading-4 text-text-muted">
                    Add a hole, then draw its tee and basket — anything you place while a hole
                    is selected joins it.
                  </p>
                ) : card ? (
                  <Scorecard
                    course={course}
                    card={card}
                    units={units}
                    mode={cardMode}
                    selectedHoleId={selectedHoleId}
                    onSelectHole={onSelectHole}
                    onOp={onOp}
                  />
                ) : (
                  /*
                   * Its own height, up to six rows, and it does not give it up.
                   *
                   * `shrink-0` is load-bearing: without it the features list
                   * below — which is `flex-1`, because it should take whatever is
                   * left — wins the flex negotiation and squeezes the grid. The
                   * cap is `HOLES_GRID_MAX_HEIGHT`, in pixels, for the reason
                   * recorded there: a percentage could not work against a panel
                   * the grid is itself sizing.
                   */
                  <div
                    className="flex min-h-0 shrink-0 flex-col"
                    style={{ maxHeight: HOLES_GRID_MAX_HEIGHT }}
                  >
                    <HolesGrid
                      holes={holes}
                      views={views}
                      units={units}
                      selectedHoleId={selectedHoleId}
                      onSelectHole={onSelectHole}
                    />
                  </div>
                )}

                <div className="mx-2.5 h-px shrink-0 bg-border-subtle" aria-hidden="true" />
              </>
            )}

            {/*
              No add button on this header, and the design's one is deliberately
              dropped. A feature is drawn rather than created — there is no
              default position for a basket — so "add" has no meaning that does
              not reduce to "arm a tool", which is what the palette is. A + that
              only pointed at the tool bar would be a second, worse tool bar.
            */}
            <SectionHeader title="Features">
              <ScopePill hole={scopedHole} onClear={() => onSelectHole(null)} />
            </SectionHeader>

            <FeatureList
              features={scopedFeatures}
              order={order}
              units={units}
              selectedId={selectedFeatureId}
              hiddenIds={hiddenIds}
              onSelect={onSelectFeature}
              onToggleHidden={onToggleHidden}
              empty={
                scopedHole
                  ? `Nothing on ${holeName(scopedHole)} yet. Draw a tee and a basket — anything placed while a hole is selected joins it.`
                  : focus === 'land'
                    ? 'Nothing traced yet. Draw the property line first — it is what the acreage check and the site analysis measure against.'
                    : 'Nothing at the course level. A feature drawn with no hole selected lands here.'
              }
            />
          </>
        )}
      </Panel>

      <FindingsList
        findings={findings}
        onReveal={onRevealFinding}
        onDismissRule={onDismissRule}
      />
    </div>
  );
}
