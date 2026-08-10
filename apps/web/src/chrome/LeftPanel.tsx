import { useMemo, useState, type ReactNode } from 'react';
import { IconButton, Panel, Segmented, Tabs, cn, type TabDefinition } from '@hyzerlines/design';
import {
  hasMultipleTees,
  holeName,
  scorecard,
  viewHoles,
  type Course,
  type FairwayChoices,
  type Finding,
  type Op,
} from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { useProfiles } from '../survey/useProfiles';
import { FindingsList } from './FindingsList';
import { ParCell } from './ParCell';
import { Scorecard, type CardMode } from './Scorecard';

/**
 * The course: its holes, in order, and what is wrong with it.
 *
 * A course is a sequence, not a bag of shapes, and this is the only place that
 * reads as one. It doubles as navigation — selecting a hole frames it, which is
 * how you move around a course once there are eighteen of them.
 *
 * Docked to the left edge as a single column rather than two floating cards.
 * The findings used to sit in the bottom-right corner, which put them next to
 * the zoom controls and nowhere near the holes they were about; here they are
 * beneath the list they annotate, and the count is readable without opening
 * anything.
 *
 * ## Tabs, with one of them empty
 *
 * Holes and layouts are two readings of the same course — the corridors that
 * exist, and the order somebody plays them in — so they are peers, and a tab
 * strip is what says so. The layouts tab is here before layouts are, on
 * purpose: it is the frame the next PR fills, and standing it up now means
 * that PR does not also have to relitigate this panel's shape.
 *
 * It renders a sentence rather than being disabled. A disabled tab is a door
 * that does not open and does not say why.
 */

export function LeftPanel({
  course,
  units,
  findings,
  choices,
  selectedHoleId,
  onSelectHole,
  onOp,
  onAddHole,
  onRevealFinding,
  onDismissRule,
  header,
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
  selectedHoleId: string | null;
  onSelectHole: (id: string | null) => void;
  onOp: (op: Op) => void;
  onAddHole: () => void;
  onRevealFinding: (finding: Finding) => void;
  onDismissRule: (ruleId: string) => void;
  /**
   * The course panel, stacked above the holes.
   *
   * Passed in rather than rendered here so that this column owns the layout —
   * the two panels have to share a width and a gap, and that is a fact about
   * the column, not about either card.
   */
  header: ReactNode;
}) {
  // Playing order, not creation order.
  const holes = useMemo(
    () => [...course.holes].sort((a, b) => a.number - b.number),
    [course.holes],
  );

  // Elevation reaches the scorecard the same way it reaches the hole panel, so
  // a par that moved because of a hill moves in both places or in neither.
  const { elevations } = useProfiles();
  const views = useMemo(
    () => viewHoles(course, holes, elevations, choices),
    [course, holes, elevations, choices],
  );

  /*
   * The card, which replaces the list only when there is more than one tee.
   *
   * A course nobody has classified has one column, and the plain list already
   * showed that correctly — a table with a single column would be new machinery
   * for an unchanged answer, and it would cost the inline par control, which is
   * the fastest way to fix a par that exists.
   *
   * Asked before built, so the single-tee course does not pay for a card it
   * will not draw.
   */
  const multipleTees = hasMultipleTees(course);
  const card = useMemo(
    () => (multipleTees ? scorecard(course, holes, { elevations, choices }) : null),
    [multipleTees, course, holes, elevations, choices],
  );

  /*
   * Which number the card's cells hold.
   *
   * A printed card carries a length row and a par row for every hole, which
   * needs twice the width this panel has. One number per cell and a control to
   * say which is the honest trade; par is the mode you switch to when you are
   * filling the card in rather than reading it.
   */
  const [cardMode, setCardMode] = useState<CardMode>('length');

  const [tab, setTab] = useState('holes');
  const tabs = useMemo<TabDefinition[]>(
    () => [
      { id: 'holes', label: 'Holes', badge: holes.length },
      { id: 'layouts', label: 'Layouts' },
    ],
    [holes.length],
  );

  return (
    <div
      /*
       * Bounded to the viewport and scrolling internally, so a 27-hole course
       * cannot push the findings off the bottom of the screen. The gap at the
       * bottom clears the attribution line.
       */
      className="pointer-events-none absolute bottom-10 left-4 top-4 flex w-72 flex-col gap-2 overflow-hidden"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      {header}

      <Panel
        as="section"
        elevation="raised"
        padding="none"
        /*
         * Sized to its content, not to the column.
         *
         * It used to take every pixel the course panel and findings did not,
         * which left a one-hole course with a card of empty space below its
         * single row. `min-h-0` without `flex-1` lets it shrink when a 27-hole
         * course needs more room than there is — the list scrolls inside it —
         * while never growing past what it actually holds.
         */
        className="flex min-h-0 flex-col overflow-hidden"
        aria-label="Holes and layouts"
      >
        <Tabs tabs={tabs} value={tab} onChange={setTab} label="Holes and layouts">
          {tab === 'layouts' ? (
            <p className="px-3 py-3 text-2xs leading-4 text-text-muted">
              A layout is the order a course is played in — which can skip a hole, or play one
              twice. Coming in the next release.
            </p>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between px-3 py-1.5">
                <span className="text-2xs text-text-muted">
                  {holes.length === 0 ? 'None yet' : 'In playing order'}
                </span>
                {/* Only with the card, because the list has its par control in
                    every row already — there is nothing to switch to. */}
                {card && (
                  <Segmented
                    label="Card shows"
                    value={cardMode}
                    onChange={setCardMode}
                    options={[
                      { value: 'length', label: 'Length' },
                      { value: 'par', label: 'Par' },
                    ]}
                    className="ml-auto mr-1"
                  />
                )}
                <IconButton label="Add hole" size="sm" tooltipSide="right" onClick={onAddHole}>
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M6 2v8M2 6h8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </IconButton>
              </div>

              {holes.length === 0 ? (
                <p className="px-3 pb-3 text-2xs leading-4 text-text-muted">
                  Add a hole, then draw its tee and basket — anything you place while a hole is
                  selected joins it.
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
                <ul className="min-h-0 flex-1 overflow-y-auto">
                  {holes.map((hole) => {
                    const view = views.get(hole.id) ?? null;
                    const selected = hole.id === selectedHoleId;
                    return (
                      <li
                        key={hole.id}
                        className={cn(
                          'flex items-center gap-2 border-t border-border-subtle pr-2',
                          'transition-colors duration-fast hover:bg-surface-hover',
                          selected && 'bg-surface-selected',
                        )}
                      >
                        {/* The row selects; the par control inside it must not,
                            so they are siblings rather than nested — a select
                            inside a button is invalid and swallows its own
                            clicks. */}
                        <button
                          type="button"
                          onClick={() => onSelectHole(selected ? null : hole.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          <span className="w-5 shrink-0 font-mono text-2xs tabular-nums text-text-muted">
                            {hole.number}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                            {holeName(hole)}
                          </span>
                          <span className="shrink-0 font-mono text-2xs tabular-nums text-text-secondary">
                            {view?.measurement.effective == null
                              ? '—'
                              : formatDistance(view.measurement.effective, units)}
                          </span>
                        </button>
                        <ParCell course={course} hole={hole} view={view} onOp={onOp} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </Tabs>
      </Panel>

      <FindingsList
        findings={findings}
        onReveal={onRevealFinding}
        onDismissRule={onDismissRule}
      />
    </div>
  );
}
