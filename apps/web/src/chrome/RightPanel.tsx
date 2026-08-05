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
import { CourseProperties } from './CourseProperties';
import { FeatureProperties } from './FeatureProperties';
import { HoleProperties, type SelectedPair } from './HoleProperties';

/**
 * Properties, for whatever is in focus.
 *
 * One panel with three modes rather than three panels that appear and vanish.
 * A column that comes and goes is a column the eye has to re-find every time,
 * and it makes the map jump in peripheral vision even when nothing has moved.
 * Here the panel is always present and only its contents change, so the shape
 * of the workspace is constant.
 *
 * The order of precedence is narrowest-first: a selected feature, else a
 * selected hole, else the course. That matches how selection actually
 * narrows — clicking a tee inside a hole means you want the tee.
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
  const title = feature
    ? featureName(feature)
    : hole
      ? holeName(hole)
      : course.name.trim() || 'Untitled course';

  const subtitle = feature ? KIND_DEFINITIONS[feature.kind].label : hole ? 'Hole' : 'Course';

  return (
    <div
      className="pointer-events-none absolute bottom-20 right-4 top-20 flex w-64 flex-col"
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
          {/* Only when there is a selection to clear. On the course view there
              is nothing to close, and a permanently disabled X is noise. */}
          {(feature || hole) && (
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
          )}
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
          ) : (
            <CourseProperties course={course} units={units} onOp={onOp} />
          )}
        </div>
      </Panel>
    </div>
  );
}
