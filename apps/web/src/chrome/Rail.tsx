import { useMemo, useState, type ReactNode } from 'react';
import { IconButton, Segmented, cn } from '@hyzerlines/design';
import {
  FOCUS_DEFINITIONS,
  hasMultipleTees,
  holeOfFeature,
  pairElevationKey,
  scorecard,
  viewHoles,
  type Course,
  type FairwayChoices,
  type Feature,
  type Focus,
  type Op,
  type Position,
} from '@hyzerlines/core';

import type { UnitSystem } from '../units';
import { useProfiles } from '../survey/useProfiles';
import { FeatureList } from './FeatureList';
import { HoleTile } from './HoleTile';
import { Scorecard, type CardMode } from './Scorecard';
import { StyleList } from './StyleList';
import type { StyleSubject } from './StyleProperties';
import {
  DETAIL_WIDTH,
  RAIL_SHRUNK,
  RAIL_WIDTH,
  SLIDE_EASE,
  SLIDE_MS,
  TOP_BAR_HEIGHT,
} from './layout';

/**
 * The whole course, down the left edge, one level at a time.
 *
 * It replaces two floating columns — a list on the left, properties on the
 * right — with a single rail you drill into. That was not a cosmetic swap. The
 * two columns were a *pair*, and every pair has the same problem: the thing you
 * clicked and the thing that answered were at opposite ends of the screen, with
 * the map you are actually working on squeezed between them. Reading a tee's
 * position meant crossing a thousand pixels, and the hole you clicked to get
 * there stayed lit in a column you were no longer looking at.
 *
 * Here the answer arrives beside the question. Pick a hole and the list gives up
 * its width to the hole; pick one of the hole's features and the feature slides
 * over the hole. Each level keeps the one before it visible and one click away,
 * which is what a breadcrumb is for and what two columns could never do.
 *
 * ## Three levels
 *
 *   1. The list. Holes, or the course's own features, or — in Style — the parts
 *      of the drawing. Shrinks to a number rail when a level 2 is open.
 *   2. The context. A hole and its features, or a style subject's properties.
 *   3. The feature. Slides over level 2 rather than pushing a fourth column, so
 *      the rail never grows past two columns however deep you go.
 *
 * ## It floats, opaquely
 *
 * Every level is absolutely positioned over a full-bleed canvas. It reads as
 * docked and it is not: opening a level must not re-project the map. See the
 * note on `layout.ts`.
 */

/** Which hole a feature is in — membership or scope, as core resolves it. */
const holeIdOf = (course: Course, feature: Feature): string | null =>
  holeOfFeature(course, feature.id)?.id ?? null;

/**
 * How far a routed shot leaves the straight line, as a fraction of its length.
 *
 * The tile's schematic is drawn from this, so a tile showing a dogleg is showing
 * one somebody routed. Measured as the furthest perpendicular departure of the
 * line from its own two ends — the standard sagitta — in degrees, which is fine
 * because it is immediately divided by a length in the same units.
 */
function bendOf(line: readonly Position[] | undefined): number {
  if (!line || line.length < 3) return 0;
  const [from] = line;
  const to = line[line.length - 1];
  if (!from || !to) return 0;

  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const span = Math.hypot(dx, dy);
  if (span === 0) return 0;

  let furthest = 0;
  for (const [x, y] of line.slice(1, -1)) {
    // Signed, so a hole that bends left draws left. The cross product's sign is
    // the side the point falls on.
    const side = ((x - from[0]) * dy - (y - from[1]) * dx) / span;
    if (Math.abs(side) > Math.abs(furthest)) furthest = side;
  }
  return furthest / span;
}

/** One level of the rail: a fixed-width column that animates its width. */
function Level({
  width,
  label,
  children,
  bordered = true,
}: {
  width: number;
  /** Names the column for anything addressing it from outside. */
  label?: string;
  children: ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      {...(label ? { 'aria-label': label, role: 'region' } : {})}
      className="relative h-full shrink-0 overflow-hidden bg-surface-panel"
      style={{
        width,
        transition: `width ${SLIDE_MS}ms ${SLIDE_EASE}`,
        // The border fades with the width, so a closed level does not leave a
        // hairline standing on the map.
        borderRight: width > 0 && bordered ? '1px solid var(--color-border-subtle)' : 'none',
      }}
    >
      {/*
        The contents take the column's width and re-lay out with it.
        
        A shrunk list is meant to be *read* at its new width — a hole tile drops
        its two drawings and keeps its number — so the rows have to reflow
        rather than slide out of frame. The one pixel is a floor: a zero-width
        box makes its children's layout collapse in ways that flash on the way
        back open.
      */}
      <div className="h-full" style={{ width: Math.max(width, 1) }}>
        {children}
      </div>
    </div>
  );
}

/** The rail's own header: a title or a pair of tabs, plus one action. */
function RailHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 pl-2.5 pr-1.5">
      {children}
      {action && <span className="ml-auto flex shrink-0 items-center gap-1">{action}</span>}
    </div>
  );
}

/**
 * Holes or Course, as two titles rather than a switch.
 *
 * The count beside each is what makes them readable as tabs without a track
 * around them: it says these are two lists, and which one you are in. A filled
 * track was the alternative and it competes with the focus switcher directly
 * above it — two segmented controls, one under the other, both saying "pick a
 * mode", when only one of them is about modes at all.
 */
function RailTabs({
  tab,
  onTab,
  holes,
  features,
}: {
  tab: 'holes' | 'course';
  onTab: (tab: 'holes' | 'course') => void;
  holes: number;
  features: number;
}) {
  const item = (id: 'holes' | 'course', label: string, count: number) => (
    <button
      type="button"
      onClick={() => onTab(id)}
      aria-pressed={tab === id}
      /*
       * Named for the list, not for the list plus its size. The count is drawn
       * beside the word and hidden from the accessible name — a list already
       * announces how many items it has, and "Course 7" as a control's name
       * makes it a different control every time somebody draws something.
       */
      aria-label={label}
      className={cn(
        'flex items-baseline gap-1.5 rounded px-0.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
      )}
    >
      <span
        className={cn(
          'text-xs',
          tab === id ? 'font-semibold text-text-primary' : 'text-text-muted',
        )}
      >
        {label}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'text-2xs tabular-nums',
          tab === id ? 'text-text-accent' : 'text-text-disabled',
        )}
      >
        {count}
      </span>
    </button>
  );

  return (
    <div className="flex items-baseline gap-3">
      {item('holes', 'Holes', holes)}
      {item('course', 'Course', features)}
    </div>
  );
}

export function Rail({
  course,
  units,
  choices,
  focus,
  tab,
  onTab,
  hiddenIds,
  selectedFeatureId,
  onSelectFeature,
  onToggleHidden,
  selectedHoleId,
  onSelectHole,
  onOp,
  onAddHole,
  styleSubject,
  onSelectStyleSubject,
  courseProperties,
  findings,
  holeDetail,
  featureDetail,
  styleDetail,
}: {
  course: Course;
  units: UnitSystem;
  choices: FairwayChoices;
  focus: Focus;
  /** Which of the two lists level 1 is showing. Only meaningful in Play. */
  tab: 'holes' | 'course';
  onTab: (tab: 'holes' | 'course') => void;
  hiddenIds: ReadonlySet<string>;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string) => void;
  onToggleHidden: (id: string) => void;
  selectedHoleId: string | null;
  onSelectHole: (id: string | null) => void;
  onOp: (op: Op) => void;
  onAddHole: () => void;
  styleSubject: StyleSubject | null;
  onSelectStyleSubject: (subject: StyleSubject) => void;
  /**
   * The course's own properties, built by the shell.
   *
   * Passed in rather than rendered here because it needs the shell's state —
   * units, elevation smoothing, the file actions — none of which the rail has
   * any business knowing about.
   */
  courseProperties: ReactNode;
  /** Level 2, when a hole is open. */
  holeDetail: ReactNode;
  /** Level 3, or level 2 for a feature with no hole behind it. */
  featureDetail: ReactNode;
  /** Level 2, when the style focus is describing something. */
  styleDetail: ReactNode;
  /**
   * What the course checks have to say, pinned under the list.
   *
   * Under it rather than in it, and in every focus rather than in the Course
   * tab. A finding is a thing to notice while you work — "hole 3 has no tee" is
   * useful exactly while you are looking at the holes — so putting it behind a
   * tab would be filing the warning where nobody is standing.
   */
  findings: ReactNode;
}) {
  // Playing order, not creation order.
  const holes = useMemo(
    () => [...course.holes].sort((a, b) => a.number - b.number),
    [course.holes],
  );

  const { elevations, profiles } = useProfiles();
  const views = useMemo(
    () => viewHoles(course, holes, elevations, choices),
    [course, holes, elevations, choices],
  );

  /*
   * The card, which the tiles give way to only when there is more than one tee.
   *
   * A three-tee hole is three different lengths and a tile has room for one
   * number, so the list would have to pick one and be silently wrong about the
   * other two — which is the exact failure the card exists to fix. Asked before
   * built, so a single-tee course does not pay for a card it will not draw.
   *
   * Only while the rail is wide. Shrunk, there is no room for a column per tee
   * and the tiles are the right answer again: you are stepping through holes,
   * not comparing tee levels.
   */
  const multipleTees = hasMultipleTees(course);
  const card = useMemo(
    () => (multipleTees ? scorecard(course, holes, { elevations, choices }) : null),
    [multipleTees, course, holes, elevations, choices],
  );
  const [cardMode, setCardMode] = useState<CardMode>('length');

  const definition = FOCUS_DEFINITIONS[focus];
  const selectedHole = holes.find((hole) => hole.id === selectedHoleId) ?? null;
  const selectedFeature =
    course.features.find((feature) => feature.id === selectedFeatureId) ?? null;

  /**
   * Every routed fairway, so a tile can draw the shape it was routed into.
   *
   * Read off the stored features rather than recomputed: a hole nobody has bent
   * has no stored fairway and therefore no bend, which is exactly the answer.
   */
  const bends = useMemo(() => {
    const byPair = new Map<string, number>();
    for (const feature of course.features) {
      if (feature.kind !== 'fairway' || feature.geometry.type !== 'line') continue;
      const pair = course.pairs.find((p) => p.fairwayId === feature.id);
      if (pair)
        byPair.set(
          pairElevationKey(pair.teeId, pair.targetId),
          bendOf(feature.geometry.coordinates),
        );
    }
    return byPair;
  }, [course.features, course.pairs]);

  /*
   * What level 1 lists when it is not listing holes.
   *
   * The course's own features — a property line, a road running past four
   * holes, a practice basket — which the model has always allowed: `holeId` is
   * nullable, and null means course-level. Narrowed to the kinds this focus is
   * responsible for, so Land lists the land and Play does not.
   */
  const order = useMemo(
    () => (focus === 'play' ? [...definition.kinds, 'fairway' as const] : definition.kinds),
    [focus, definition.kinds],
  );

  const courseFeatures = useMemo<readonly Feature[]>(
    () =>
      course.features.filter(
        (feature) => holeIdOf(course, feature) === null && order.includes(feature.kind),
      ),
    [course, order],
  );

  /*
   * Which levels are open.
   *
   * Level 2 is the hole, the style subject, or — with no hole in the way — a
   * course-level feature, which needs somewhere to be and has no parent to sit
   * over. Level 3 is a feature that *does* have a hole behind it.
   */
  const detail = selectedHole ?? styleSubject ?? (selectedFeature ? 'feature' : null);
  const detailOpen = detail !== null;
  const overlayOpen = selectedHole !== null && selectedFeature !== null;

  /*
   * The list gives up its width as soon as something opens beside it — except
   * in Style.
   *
   * Everywhere else the rail is over a map you are drawing on, and 532px of
   * chrome down one edge is a third of a laptop screen you cannot click
   * through. A shrunk list is a real cost — a feature row at 104px is an icon
   * and six characters — but the thing you selected is named in full in the
   * column beside it, so the cost is paid where it is least felt.
   *
   * Style is the exception because Style draws nothing: it claims no kinds and
   * offers only the select tool, so the map underneath is being looked at
   * rather than worked on. And its list is the *only* place its subjects are
   * named — "Required relief" and "Property boundary" are how you navigate it.
   */
  const shrunk = detailOpen && focus !== 'style';

  const listOnly = focus !== 'play';

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 flex items-stretch"
      style={{ top: TOP_BAR_HEIGHT, zIndex: 'var(--hz-z-chrome)' }}
    >
      {/* LEVEL 1 — the list. */}
      <Level width={shrunk ? RAIL_SHRUNK : RAIL_WIDTH}>
        <section
          className="flex h-full flex-col"
          aria-label={focus === 'style' ? 'Style' : definition.label}
        >
          <RailHeader
            action={
              focus === 'play' && !shrunk ? (
                <>
                  {/* Only with the card, because the tiles have no second number
                      to switch to — they print par and length at once. */}
                  {card && tab === 'holes' && (
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
              ) : null
            }
          >
            {/*
              The tabs are the header until the rail shrinks, and then the title
              is — 104px has room for one word, and the word that matters is the
              one naming what the column still is.
            */}
            {focus === 'play' && !shrunk ? (
              <RailTabs
                tab={tab}
                onTab={onTab}
                holes={holes.length}
                features={courseFeatures.length}
              />
            ) : (
              <h2 className="text-xs font-semibold text-text-primary">
                {focus === 'style' ? 'Style' : focus === 'play' ? 'Holes' : definition.label}
              </h2>
            )}
          </RailHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {focus === 'style' ? (
              <StyleList
                style={course.style}
                subject={styleSubject}
                onSelectSubject={onSelectStyleSubject}
                onOp={onOp}
              />
            ) : !definition.ready ? (
              <p className="px-2.5 pb-3 text-2xs leading-4 text-text-muted">
                {definition.summary} Coming in a later release.
              </p>
            ) : listOnly || tab === 'course' ? (
              <>
                {/*
                  The course's own properties, at the top of its own tab.

                  They had a panel to themselves and it was the wrong shape for
                  them: a course is not something you select, so a column that
                  only ever showed properties of a selection had to keep a
                  special case open for the one subject that is always there.
                  Here they are simply the head of the list of what the course
                  holds, which is what they describe.
                */}
                {/*
                  In every focus, not only in Play.
                  
                  The course's Analysis section is where the acreage lives, and
                  acreage is the first thing you want while tracing a property
                  line — which is Land. Withholding the course's own properties
                  from the focus most likely to need them would be the interface
                  hiding an answer behind a mode.
                */}
                <div className="pb-1">{courseProperties}</div>
                <FeatureList
                  features={courseFeatures}
                  order={order}
                  units={units}
                  selectedId={selectedFeatureId}
                  hiddenIds={hiddenIds}
                  onSelect={onSelectFeature}
                  onToggleHidden={onToggleHidden}
                  empty={
                    focus === 'land'
                      ? 'Nothing traced yet. Draw the property line first — it is what the acreage check and the site analysis measure against.'
                      : 'Nothing at the course level. A feature drawn with no hole selected lands here.'
                  }
                />
              </>
            ) : holes.length === 0 ? (
              <p className="px-2.5 pb-3 text-2xs leading-4 text-text-muted">
                Add a hole, then draw its tee and basket — anything you place while a hole is
                selected joins it.
              </p>
            ) : card && !shrunk ? (
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
              <ul className="flex flex-col gap-1 px-2 pb-3">
                {holes.map((hole) => {
                  const view = views.get(hole.id) ?? null;
                  const key = view ? pairElevationKey(view.teeId, view.targetId) : null;
                  return (
                    <HoleTile
                      key={hole.id}
                      hole={hole}
                      view={view}
                      profile={(key && profiles.get(key)) || null}
                      bend={(key && bends.get(key)) || 0}
                      units={units}
                      selected={hole.id === selectedHoleId}
                      shrunk={shrunk}
                      onSelect={() => onSelectHole(hole.id === selectedHoleId ? null : hole.id)}
                    />
                  );
                })}
              </ul>
            )}
          </div>

          {/*
            Pinned to the bottom of the list rather than scrolling with it: a
            warning you have to scroll to find is a warning you find later than
            you needed it.
          */}
          <div className="shrink-0">{findings}</div>
        </section>
      </Level>

      {/* LEVEL 2 — the context, and level 3 sliding over it. */}
      <Level width={detailOpen ? DETAIL_WIDTH : 0} label="Properties">
        <div className="relative h-full">
          <div className="flex h-full flex-col">
            {styleSubject ? styleDetail : selectedHole ? holeDetail : featureDetail}
          </div>

          {/*
            Level 3, over level 2 rather than beside it.

            A fourth column would put the rail past 700px on an 18-hole course,
            which is half a laptop screen given over to chrome — and the thing
            it would be showing is a tee's latitude. Sliding over keeps the rail
            at two columns however deep the drill-down goes, and the hole
            underneath stays one click away through the breadcrumb.
          */}
          <div
            aria-hidden={!overlayOpen}
            className="absolute inset-0 flex flex-col bg-surface-panel shadow-float"
            style={{
              transform: `translateX(${overlayOpen ? 0 : 14}%)`,
              opacity: overlayOpen ? 1 : 0,
              pointerEvents: overlayOpen ? 'auto' : 'none',
              transition: `transform ${SLIDE_MS}ms ${SLIDE_EASE}, opacity ${SLIDE_MS}ms ${SLIDE_EASE}`,
            }}
          >
            {overlayOpen && featureDetail}
          </div>
        </div>
      </Level>
    </div>
  );
}
