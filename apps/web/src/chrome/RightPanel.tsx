import type { ReactNode } from 'react';
import { IconButton, Panel, TextField, cn } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  holeName,
  holeOfFeature,
  type Course,
  type Feature,
  type Hole,
  type Op,
} from '@hyzerlines/core';

import type { UnitSystem } from '../units';
import { FeatureProperties } from './FeatureProperties';
import { HoleProperties, type SelectedPair } from './HoleProperties';
import { FeatureIcon } from './featureIcons';
import { GAP, GUTTER, PANEL_BOTTOM, PANEL_TOP, PANEL_WIDTH } from './layout';

/**
 * Properties, for whatever is selected.
 *
 * Three modes, narrowest first: a selected feature, else a selected hole, else
 * the course. That matches how selection narrows — clicking a tee inside a hole
 * means you want the tee — and the order has not changed.
 *
 * What changed is that the course is a mode again rather than an absence. It used
 * to be the fallback here, then moved out to a card of its own in the left
 * column on the grounds that a course is not something you select. True, and it
 * turned out to cost more than it bought: the card and this panel were two
 * inspectors with two sets of metrics, and the course's own properties were the
 * only ones that lived somewhere else. The name went to the top bar, which is
 * where identity belongs, and everything that was *inspection* came back here.
 *
 * So the column is now permanent, and that is the point. It used to appear and
 * disappear with the selection, which meant the panel you were about to read
 * moved the layout as it arrived.
 *
 * ## A selected feature takes the whole panel
 *
 * Not a section appended below the hole's properties, which is what it was. A
 * feature and the hole it belongs to are different subjects, and showing both at
 * once made the panel claim two answers to "what am I looking at" — the reader
 * had to work out which half of the column was live. The feature takes over, and
 * a breadcrumb goes back up to its parent.
 */

/**
 * The way back up, and the title of what you are looking at.
 *
 * The breadcrumb is the only route out of a feature that does not involve
 * clicking the map. Selecting a tee inside a hole used to be a one-way door: the
 * panel swapped and the hole it came from vanished from the interface, with
 * nothing to click to get back.
 */
function EditorHeader({
  parent,
  title,
  subtitle,
  icon,
  onClose,
  children,
}: {
  /** What the breadcrumb points at. Null for a course-level feature. */
  parent: { label: string; onSelect: () => void } | null;
  title: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  onClose?: () => void;
  /** Trailing controls on the title line — the hole stepper, in practice. */
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 px-2.5 pb-1.5 pt-2">
      {(parent || onClose) && (
        <div className="flex items-center gap-1">
          {parent && (
            <button
              type="button"
              onClick={parent.onSelect}
              /*
               * Named for the journey, not the destination.
               *
               * "Hole 1" is already the accessible name of hole 1's chip in the
               * grid, and two buttons with one name is the ambiguity a screen
               * reader cannot resolve — and that a test resolves by matching two
               * elements and failing. "Back to Hole 1" is also simply the better
               * description of what the control does.
               */
              aria-label={`Back to ${parent.label}`}
              className={cn(
                'flex min-w-0 items-center gap-0.5 rounded px-1 py-0.5 text-2xs text-text-muted',
                'transition-colors duration-fast hover:text-text-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              )}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M6.5 1.5 3 5l3.5 3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="min-w-0 truncate">{parent.label}</span>
            </button>
          )}
          {onClose && (
            <IconButton
              label="Close"
              size="sm"
              tooltipSide="left"
              className="ml-auto"
              onClick={onClose}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="m2.5 2.5 7 7m0-7-7 7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </IconButton>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {icon && (
          <span
            aria-hidden="true"
            className="grid w-4 shrink-0 place-items-center text-text-secondary"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">{title}</div>
        {/*
          The subtitle sits on the title line rather than under it, which is what
          keeps the header to two rows instead of three. It only appears when it
          would say something the title does not — see the call sites.
        */}
        {subtitle && (
          <span className="shrink-0 text-2xs tabular-nums text-text-muted">{subtitle}</span>
        )}
        {children}
      </div>
    </header>
  );
}

/** Step through the holes in playing order, without going back to the grid. */
function HoleStepper({ onPrevious, onNext }: { onPrevious: () => void; onNext: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <IconButton label="Previous hole" size="sm" tooltipSide="bottom" onClick={onPrevious}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M6.5 1.5 3 5l3.5 3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </IconButton>
      <IconButton label="Next hole" size="sm" tooltipSide="bottom" onClick={onNext}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path
            d="M3.5 1.5 7 5 3.5 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </IconButton>
    </span>
  );
}

export function RightPanel({
  course,
  units,
  feature,
  hole,
  pair,
  holeNumber,
  holeCount,
  onOp,
  onDeleteFeature,
  onDeleteHole,
  onSelectFeature,
  onSelectHole,
  onSelectPair,
  onClearSelection,
  onStepHole,
  onDrawFeature,
  courseProperties,
  styleSubject,
}: {
  course: Course;
  units: UnitSystem;
  feature: Feature | null;
  hole: Hole | null;
  /** Which of the selected hole's shots the panel describes. */
  pair: SelectedPair | null;
  /** Where the selected hole falls in playing order, for "4 of 18". */
  holeNumber: number | null;
  holeCount: number;
  onOp: (op: Op) => void;
  onDeleteFeature: () => void;
  onDeleteHole: () => void;
  onSelectFeature: (id: string) => void;
  onSelectHole: (id: string) => void;
  onSelectPair: (pair: SelectedPair) => void;
  onClearSelection: () => void;
  /** Move to the previous or next hole in playing order, wrapping. */
  onStepHole: (delta: 1 | -1) => void;
  /** Arm the tee or basket tool with the hole still selected. */
  onDrawFeature: (kind: 'tee' | 'target') => void;
  /**
   * The course's own properties, built by the shell.
   *
   * Passed in rather than rendered here because it needs the shell's state —
   * units, elevation smoothing, the file actions — none of which the editor has
   * any business knowing about. The same arrangement the course card used, with
   * the panel it lands in changed.
   */
  courseProperties: ReactNode;
  /**
   * What the style focus is describing, when it is describing anything.
   *
   * It takes the panel ahead of a selected feature, which is the same rule the
   * rest of this component follows — narrowest subject wins — read one level
   * up: while you are styling, the thing you are working on is the stylesheet.
   */
  styleSubject: ReactNode;
}) {
  /*
   * Which hole a selected feature belongs to, if any.
   *
   * Null for a course-level feature, and the breadcrumb then points at the
   * course — which is a real destination now that the course has a mode in this
   * panel rather than a card in the other column.
   */
  const parent = feature ? (holeOfFeature(course, feature.id) ?? null) : null;

  return (
    <div
      className="pointer-events-none absolute flex flex-col overflow-hidden"
      style={{
        top: PANEL_TOP,
        right: GUTTER,
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
        aria-label="Properties"
      >
        {styleSubject ? (
          styleSubject
        ) : feature ? (
          <>
            <EditorHeader
              parent={{
                label: parent ? holeName(parent) : 'Whole course',
                onSelect: () => (parent ? onSelectHole(parent.id) : onClearSelection()),
              }}
              onClose={onClearSelection}
              icon={<FeatureIcon kind={feature.kind} size={16} />}
              title={
                /*
                 * The name is the heading, not a row beneath it.
                 *
                 * Every panel here used to open with a Name row under a title
                 * that was the same name read back — one value, twice, three
                 * pixels apart. A feature with no name shows its kind as the
                 * placeholder, which is also what it is called everywhere else.
                 */
                <TextField
                  label="Feature name"
                  variant="bare"
                  size="sm"
                  value={feature.label}
                  placeholder={KIND_DEFINITIONS[feature.kind].label}
                  onChange={(e) =>
                    onOp({ type: 'setLabel', id: feature.id, label: e.target.value })
                  }
                  className="w-full font-semibold"
                />
              }
              /*
               * Only once it would say something the heading does not. An
               * unnamed feature's heading already *is* its kind, so a subtitle
               * repeating it puts "Tee pad" above "Tee pad".
               */
              {...(feature.label.trim() !== ''
                ? { subtitle: KIND_DEFINITIONS[feature.kind].label }
                : {})}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FeatureProperties
                course={course}
                feature={feature}
                units={units}
                onOp={onOp}
                onDelete={onDeleteFeature}
              />
            </div>
          </>
        ) : hole ? (
          <>
            <EditorHeader
              parent={null}
              title={
                <TextField
                  label="Hole name"
                  variant="bare"
                  size="sm"
                  value={hole.name}
                  placeholder={`Hole ${hole.number}`}
                  onChange={(e) =>
                    onOp({ type: 'updateHole', id: hole.id, changes: { name: e.target.value } })
                  }
                  className="w-full font-semibold"
                />
              }
              {...(holeNumber === null ? {} : { subtitle: `${holeNumber} of ${holeCount}` })}
            >
              {/*
                Stepping through the holes without going back to the grid.

                Comparing hole 4 against hole 5 is an ordinary thing to do, and
                it used to mean two trips to the left column for every
                comparison. The close button is gone from this header: the way
                out of a hole is to click its chip again or press Escape, and a
                ✕ here was a third control for something two already did.
              */}
              <HoleStepper onPrevious={() => onStepHole(-1)} onNext={() => onStepHole(1)} />
            </EditorHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <HoleProperties
                course={course}
                hole={hole}
                pair={pair}
                units={units}
                onOp={onOp}
                onSelectPair={onSelectPair}
                onDrawFeature={onDrawFeature}
                onDelete={onDeleteHole}
                onRevealFeature={onSelectFeature}
              />
            </div>
          </>
        ) : (
          <>
            <EditorHeader
              parent={null}
              title={<h2 className="px-1 text-sm font-semibold text-text-primary">Course</h2>}
              subtitle={`${holeCount} ${holeCount === 1 ? 'hole' : 'holes'}`}
            />
            <div className="min-h-0 flex-1 overflow-y-auto">{courseProperties}</div>
          </>
        )}
      </Panel>
    </div>
  );
}
