import { useMemo, useState, type ReactNode } from 'react';
import { IconButton, Panel, Tabs, cn, type TabDefinition } from '@hyzerlines/design';
import {
  holeName,
  setPairPar,
  viewHoles,
  type Course,
  type Finding,
  type Hole,
  type Op,
  type PairView,
} from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { FindingsList } from './FindingsList';

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

function ParCell({
  course,
  hole,
  view,
  onOp,
}: {
  course: Course;
  hole: Hole;
  view: PairView | null;
  onOp: (op: Op) => void;
}) {
  const { suggestion = null, par = null, overridden = false } = view ?? {};

  if (view === null || par === null) {
    return <span className="w-10 text-right text-2xs text-text-disabled">—</span>;
  }

  /*
   * The reasoning is the point.
   *
   * A par number with no visible basis is either accepted blindly or ignored
   * entirely; neither is useful. The tooltip carries why, and says plainly when
   * the call is close enough to a band boundary to be arguable.
   */
  const why = suggestion
    ? [
        ...suggestion.factors.map((f) => f.label),
        suggestion.borderline ? 'Close to a band boundary — could go either way' : null,
        overridden ? `You set this to ${par}; suggested ${suggestion.par}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : undefined;

  return (
    <span className="flex w-10 items-center justify-end gap-1" {...(why ? { title: why } : {})}>
      {suggestion?.borderline && !overridden && (
        <span className="text-2xs text-text-muted" aria-hidden="true">
          ~
        </span>
      )}
      <select
        aria-label={`Par for ${holeName(hole)}`}
        value={par}
        onChange={(e) => {
          const value = Number(e.target.value);
          // Choosing the suggested value clears the override rather than
          // pinning it, so the pair keeps tracking the model unless the
          // designer actually disagrees with it.
          onOp(
            setPairPar(
              course,
              view.teeId,
              view.targetId,
              value === suggestion?.par ? null : value,
            ),
          );
        }}
        className={cn(
          'rounded bg-transparent px-1 py-0.5 font-mono text-xs tabular-nums',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          overridden ? 'text-text-accent' : 'text-text-primary',
        )}
      >
        {[2, 3, 4, 5, 6].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </span>
  );
}

export function LeftPanel({
  course,
  units,
  findings,
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

  const views = useMemo(() => viewHoles(course, holes), [course, holes]);

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
       * bottom clears the tool rail.
       */
      className="pointer-events-none absolute bottom-28 left-4 top-4 flex w-72 flex-col gap-2 overflow-hidden"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      {header}

      <Panel
        as="section"
        elevation="raised"
        padding="none"
        // `flex-1` so the list takes whatever the course panel above and the
        // findings below do not, rather than sizing to its own content and
        // pushing the findings off the bottom of a 27-hole course.
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
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
