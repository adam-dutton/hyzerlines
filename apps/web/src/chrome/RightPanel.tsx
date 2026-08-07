import { IconButton, Panel, TextField } from '@hyzerlines/design';
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

/**
 * Properties, for whatever is selected.
 *
 * Two modes: a selected feature, else a selected hole. The course used to be
 * the fallback here, which was always slightly wrong — the course is not
 * something you select, it is the thing you are working on — and it now has
 * its own panel in the opposite corner where its name already was.
 *
 * With that gone there is nothing to show when nothing is selected, so the
 * panel goes away. It used to be argued that a column which comes and goes is
 * one the eye has to re-find; that argument was about a workspace where this
 * was the only inspector. The course column is now the constant, and an empty
 * card in the other corner would be a permanent placeholder for nothing.
 *
 * The order of precedence is narrowest-first: a selected feature, else a
 * selected hole. That matches how selection actually narrows — clicking a tee
 * inside a hole means you want the tee.
 *
 * ## The name is the heading
 *
 * Every panel here used to open with a Name row under a title that was the
 * same name read back — one value, twice, three pixels apart. The title is the
 * input now, exactly as the course panel's is. A feature with no name shows
 * its kind as a placeholder, which is also what it is called everywhere else.
 */
export function RightPanel({
  course,
  units,
  feature,
  hole,
  pair,
  onOp,
  onDeleteFeature,
  onDeleteHole,
  onSelectFeature,
  onSelectHole,
  onSelectPair,
  onClearSelection,
}: {
  course: Course;
  units: UnitSystem;
  feature: Feature | null;
  hole: Hole | null;
  /** Which of the selected hole's shots the panel describes. */
  pair: SelectedPair | null;
  onOp: (op: Op) => void;
  onDeleteFeature: () => void;
  onDeleteHole: () => void;
  onSelectFeature: (id: string) => void;
  onSelectHole: (id: string) => void;
  onSelectPair: (pair: SelectedPair) => void;
  onClearSelection: () => void;
}) {
  if (!feature && !hole) return null;

  /*
   * Which hole a selected feature belongs to, if any.
   *
   * Selecting a tee inside a hole was a one-way door: the panel swapped to the
   * tee and the hole it came from vanished from the interface, with nothing to
   * click to get back. Clicking the map again would do it, if you could find
   * the right pixel. This is the way back.
   */
  const parent = feature ? holeOfFeature(course, feature.id) : undefined;

  return (
    <div
      /*
       * Top right, mirroring the course column, and the same width as it. Both
       * used to start below a top bar that no longer exists; the corner is the
       * corner, and starting them level is what makes the two columns read as
       * a frame around the map rather than as three unrelated cards.
       *
       * `bottom-48` clears the camera controls stacked in the same corner. The
       * left column only needs `bottom-28` because the tool rail it clears is
       * centred and much shorter.
       */
      className="pointer-events-none absolute bottom-48 right-4 top-4 flex w-72 flex-col"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      <Panel
        as="section"
        elevation="raised"
        padding="none"
        className="flex min-h-0 flex-col overflow-hidden"
        aria-label="Properties"
      >
        <header className="shrink-0 border-b border-border-subtle px-2.5 py-2">
          {parent && (
            <button
              type="button"
              onClick={() => onSelectHole(parent.id)}
              className="mb-0.5 flex max-w-full items-center gap-0.5 truncate rounded px-1 text-2xs text-text-muted transition-colors duration-fast hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
              {holeName(parent)}
            </button>
          )}

          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              {feature ? (
                <TextField
                  label="Feature name"
                  variant="bare"
                  size="sm"
                  value={feature.label}
                  placeholder={KIND_DEFINITIONS[feature.kind].label}
                  onChange={(e) =>
                    onOp({ type: 'setLabel', id: feature.id, label: e.target.value })
                  }
                  className="w-full font-medium"
                />
              ) : hole ? (
                <TextField
                  label="Hole name"
                  variant="bare"
                  size="sm"
                  value={hole.name}
                  placeholder={`Hole ${hole.number}`}
                  onChange={(e) =>
                    onOp({ type: 'updateHole', id: hole.id, changes: { name: e.target.value } })
                  }
                  className="w-full font-medium"
                />
              ) : null}
              {/*
                Only once it would say something the heading does not.

                An unnamed feature's heading already *is* its kind — the
                placeholder is the kind label — so a subtitle repeating it puts
                "Tee pad" above "Tee pad". Named, the subtitle is the only
                thing left saying what kind of object "Long left pad" is.
              */}
              {(feature ? feature.label.trim() : hole?.name.trim()) !== '' && (
                <p className="px-1 text-2xs text-text-muted">
                  {feature ? KIND_DEFINITIONS[feature.kind].label : 'Hole'}
                </p>
              )}
            </div>

            <IconButton
              label="Clear selection"
              size="sm"
              tooltipSide="left"
              onClick={onClearSelection}
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
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {feature ? (
            <FeatureProperties
              course={course}
              feature={feature}
              units={units}
              onOp={onOp}
              onDelete={onDeleteFeature}
            />
          ) : hole ? (
            <HoleProperties
              course={course}
              hole={hole}
              pair={pair}
              units={units}
              onOp={onOp}
              onSelectPair={onSelectPair}
              onDelete={onDeleteHole}
              onRevealFeature={onSelectFeature}
            />
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
