import type { ReactNode } from 'react';
import { IconButton, TextField } from '@hyzerlines/design';
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

/**
 * The rail's second and third levels: whatever you drilled into.
 *
 * Two subjects — a hole, and a feature — sharing a header, because they are the
 * same gesture at two depths. Each one names what you are looking at, offers the
 * way back to the level above, and hands the rest of the column to that
 * subject's own properties.
 *
 * ## The breadcrumb is the way out
 *
 * It is the only route out of a feature that does not involve clicking the map.
 * Selecting a tee inside a hole used to be a one-way door: the panel swapped and
 * the hole it came from vanished from the interface, with nothing to click to
 * get back. Here the hole is still on screen behind the feature — but the
 * breadcrumb still earns its place, because "behind" is not "clickable".
 */

/**
 * The way back up, and the title of what you are looking at.
 *
 * `parent` is the level above. Null when there is none: a hole opened from the
 * rail has the rail above it, and the rail is already visible beside it.
 */
function DetailHeader({
  parent,
  title,
  subtitle,
  icon,
  onClose,
  children,
}: {
  parent: { label: string; onSelect: () => void } | null;
  title: ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  onClose?: () => void;
  /** Trailing controls on the title line — the hole stepper, in practice. */
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 px-2.5 pb-2">
      {(parent || onClose) && (
        <div className="flex h-10 items-center gap-1">
          {parent && (
            <button
              type="button"
              onClick={parent.onSelect}
              /*
               * Named for the journey, not the destination.
               *
               * "Hole 1" is already the accessible name of hole 1's tile in the
               * rail, and two buttons with one name is the ambiguity a screen
               * reader cannot resolve — and that a test resolves by matching two
               * elements and failing. "Back to Hole 1" is also simply the better
               * description of what the control does.
               */
              aria-label={`Back to ${parent.label}`}
              className="flex h-[22px] min-w-0 items-center gap-0.5 rounded-sm px-1 text-xs text-text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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

      {/*
        40px whether or not there is a row above it. A hole opens straight onto
        its name and a feature opens onto a breadcrumb first, and the two panels
        have to put their first field at the same height or switching between
        them shifts the whole form.
      */}
      <div className="flex min-h-10 items-center gap-2">
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
          <span className="shrink-0 text-xs tabular-nums text-text-muted">{subtitle}</span>
        )}
        {children}
      </div>
    </header>
  );
}

/** Step through the holes in playing order, without going back to the rail. */
function HoleStepper({ onPrevious, onNext }: { onPrevious: () => void; onNext: () => void }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <IconButton
        label="Previous hole"
        size="sm"
        tooltipSide="bottom"
        className="bg-surface-field hover:bg-surface-active"
        onClick={onPrevious}
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
      </IconButton>
      <IconButton
        label="Next hole"
        size="sm"
        tooltipSide="bottom"
        className="bg-surface-field hover:bg-surface-active"
        onClick={onNext}
      >
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

export function HoleDetail({
  course,
  hole,
  pair,
  units,
  holeNumber,
  holeCount,
  onOp,
  onSelectPair,
  onDrawFeature,
  onDelete,
  onSelectFeature,
  onStepHole,
}: {
  course: Course;
  hole: Hole;
  pair: SelectedPair | null;
  units: UnitSystem;
  /** Where this hole falls in playing order, for "4 of 18". */
  holeNumber: number | null;
  holeCount: number;
  onOp: (op: Op) => void;
  onSelectPair: (pair: SelectedPair) => void;
  onDrawFeature: (kind: 'tee' | 'target') => void;
  onDelete: () => void;
  onSelectFeature: (id: string) => void;
  /** Move to the previous or next hole in playing order, wrapping. */
  onStepHole: (delta: 1 | -1) => void;
}) {
  return (
    <>
      <DetailHeader
        parent={null}
        title={
          /*
           * The name is the heading, not a row beneath it. Every panel here used
           * to open with a Name row under a title that was the same name read
           * back — one value, twice, three pixels apart.
           */
          <TextField
            label="Hole name"
            align="left"
            variant="bare"
            size="sm"
            value={hole.name}
            placeholder={`Hole ${hole.number}`}
            onChange={(e) =>
              onOp({ type: 'updateHole', id: hole.id, changes: { name: e.target.value } })
            }
            className="w-full text-sm font-semibold"
          />
        }
        {...(holeNumber === null ? {} : { subtitle: `${holeNumber} of ${holeCount}` })}
      >
        {/*
          Stepping through the holes without going back to the list.

          Comparing hole 4 against hole 5 is an ordinary thing to do, and it used
          to mean two trips to the other column for every comparison. There is no
          close button: the way out of a hole is to click its tile again or press
          Escape, and a ✕ here would be a third control for something two already
          do.
        */}
        <HoleStepper onPrevious={() => onStepHole(-1)} onNext={() => onStepHole(1)} />
      </DetailHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <HoleProperties
          course={course}
          hole={hole}
          pair={pair}
          units={units}
          onOp={onOp}
          onSelectPair={onSelectPair}
          onDrawFeature={onDrawFeature}
          onDelete={onDelete}
          onRevealFeature={onSelectFeature}
        />
      </div>
    </>
  );
}

export function FeatureDetail({
  course,
  feature,
  units,
  onOp,
  onDelete,
  onSelectHole,
  onClose,
}: {
  course: Course;
  feature: Feature;
  units: UnitSystem;
  onOp: (op: Op) => void;
  onDelete: () => void;
  onSelectHole: (id: string) => void;
  onClose: () => void;
}) {
  /*
   * Which hole this belongs to, if any. Null for a course-level feature, and
   * the breadcrumb then points at the course.
   */
  const parent = holeOfFeature(course, feature.id) ?? null;

  return (
    <>
      <DetailHeader
        parent={{
          label: parent ? holeName(parent) : 'Whole course',
          onSelect: () => (parent ? onSelectHole(parent.id) : onClose()),
        }}
        onClose={onClose}
        icon={<FeatureIcon kind={feature.kind} size={16} />}
        title={
          <TextField
            label="Feature name"
            align="left"
            variant="bare"
            size="sm"
            value={feature.label}
            placeholder={KIND_DEFINITIONS[feature.kind].label}
            onChange={(e) => onOp({ type: 'setLabel', id: feature.id, label: e.target.value })}
            className="w-full text-sm font-semibold"
          />
        }
        /*
         * Only once it would say something the heading does not. An unnamed
         * feature's heading already *is* its kind, so a subtitle repeating it
         * puts "Tee pad" above "Tee pad".
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
          onDelete={onDelete}
        />
      </div>
    </>
  );
}
