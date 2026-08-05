import { IconButton, Panel } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  featureName,
  holeName,
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
 * Two modes now, not three: a selected feature, else a selected hole. The
 * course used to be the fallback here, which was always slightly wrong — the
 * course is not something you select, it is the thing you are working on — and
 * it now has its own panel in the opposite corner where its name already was.
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
  onSelectPair: (pair: SelectedPair) => void;
  onClearSelection: () => void;
}) {
  if (!feature && !hole) return null;

  const title = feature ? featureName(feature) : hole ? holeName(hole) : '';
  const subtitle = feature ? KIND_DEFINITIONS[feature.kind].label : 'Hole';

  return (
    <div
      /*
       * Top right, mirroring the course column, and the same width as it. Both
       * used to start below a top bar that no longer exists; the corner is the
       * corner, and starting them level is what makes the two columns read as
       * a frame around the map rather than as three unrelated cards.
       */
      // `bottom-48` clears the camera controls stacked in the same corner. The
      // left column only needs `bottom-28` because the tool rail it clears is
      // centred and much shorter.
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
        <header className="flex shrink-0 items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{title}</p>
            <p className="text-2xs text-text-muted">{subtitle}</p>
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
