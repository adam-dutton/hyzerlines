import { Panel, TextArea, TextField, type ThemeName } from '@hyzerlines/design';
import {
  DESCRIPTION_MAX,
  totalLength,
  totalPar,
  viewHoles,
  type Course,
  type Op,
} from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { useProfiles } from '../survey/useProfiles';
import { CourseMenu } from './CourseMenu';
import { CourseProperties } from './CourseProperties';
import { useAutoLocation } from './useAutoLocation';
import type { SaveStatus } from '../document/CourseProvider';

/**
 * The course, top left, where its name already was.
 *
 * The name used to sit alone in a card at the top of the screen while
 * everything else about the course lived in the right-hand inspector, three
 * feet away and only visible when nothing was selected. They were always one
 * thing described in two places.
 *
 * So the inspector's course view moved here and the name became its heading.
 * The name is still an input — a course name is not important enough to
 * deserve a dialog, and editing it in place keeps the map unobstructed — it is
 * just an input that looks like a title, which is what it is.
 */

/** The wordmark. Inline SVG — a logo request is not worth a network round trip. */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      {/*
        A hyzer line: the arcing, left-finishing flight the app is named for,
        ending at the basket. Drawn in currentColor and the accent rather than
        in feature tokens — those are theme-independent by design because they
        sit on imagery, and every one of them is white since the monochrome
        pass, so the mark was invisible in the light theme and its basket dot
        was invisible in both (it asked for a `basket` token; the kind is
        called `target`).
      */}
      <path
        d="M2.5 4c7 .2 12 4 12.4 8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <circle cx="15" cy="15.2" r="2.6" className="fill-accent-solid" />
    </svg>
  );
}

/**
 * Autosave feedback.
 *
 * Deliberately quiet. A persistent "Saved" badge trains people to ignore it, so
 * the only states worth pixels are the two that carry information: a write in
 * flight, and a write that failed. Success is silent — the absence of a warning
 * is the signal.
 */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="shrink-0 text-2xs text-text-muted" aria-live="polite">
        Saving&hellip;
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="shrink-0 text-2xs text-status-warning" role="status">
        Not saved
      </span>
    );
  }
  return null;
}

export function CoursePanel({
  course,
  units,
  onOp,
  saveStatus,
  theme,
  onToggleTheme,
  onShowShortcuts,
  onOpen,
  onSave,
  onUnitsChange,
  onDrawBoundary,
}: {
  course: Course;
  units: UnitSystem;
  onOp: (op: Op) => void;
  saveStatus: SaveStatus;
  theme: ThemeName;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
  onOpen: () => void;
  onSave: () => void;
  onUnitsChange: (units: UnitSystem) => void;
  onDrawBoundary: () => void;
}) {
  // Same elevations the scorecard and the hole panel read, so the course
  // total is the sum of the pars actually shown beside each hole.
  const { elevations } = useProfiles();
  const views = viewHoles(course, course.holes, elevations);
  const holes = course.holes.length;

  /*
   * The stats line the holes panel used to carry.
   *
   * It describes the course, not the list, so it belongs under the course's
   * name rather than above a scrollable list of holes. Withheld entirely until
   * there is a hole — `0 · Par 0 · 0 ft` is four zeroes pretending to be a
   * measurement.
   */
  const stats =
    holes === 0
      ? 'No holes yet'
      : `${holes} ${holes === 1 ? 'hole' : 'holes'} · Par ${totalPar(views.values())} · ${formatDistance(totalLength(views.values()), units)}`;

  useAutoLocation({
    location: course.location,
    hasFeatures: course.features.length > 0,
    onResolved: (location) => onOp({ type: 'setLocation', location }),
  });

  return (
    <Panel
      as="section"
      elevation="raised"
      padding="none"
      /*
       * Capped at just under half the column, with its body scrolling.
       *
       * The course panel and the holes list share one bounded column, and the
       * course panel's content grows with every section added to it — left
       * unbounded it takes the whole column and the hole list collapses to
       * nothing, which is not a subtle failure: the Add hole button ends up
       * clipped out of reach behind the findings card.
       */
      className="flex max-h-[70%] min-h-0 flex-col overflow-hidden"
      aria-label="Course"
    >
      <header className="shrink-0 border-b border-border-subtle px-2.5 py-2">
        <div className="flex items-start gap-1.5">
          <span className="mt-1 text-text-primary">
            <Mark />
          </span>
          <div className="min-w-0 flex-1">
            <TextField
              label="Course name"
              variant="bare"
              size="sm"
              value={course.name}
              placeholder="Untitled course"
              onChange={(e) => onOp({ type: 'setName', name: e.target.value })}
              spellCheck={false}
              className="w-full font-medium"
            />
            <p className="truncate px-1 font-mono text-2xs tabular-nums text-text-muted">
              {stats}
            </p>
          </div>
          <SaveIndicator status={saveStatus} />
          <CourseMenu
            theme={theme}
            onToggleTheme={onToggleTheme}
            onShowShortcuts={onShowShortcuts}
            onOpen={onOpen}
            onSave={onSave}
          />
        </div>

        {/*
          Location and description, both bare like the name above them.

          A form row apiece would double the height of the header for two
          fields that are usually filled once and then only read. As bare
          inputs they read as the subtitle they are, and the placeholders do
          the work a label would — which is the same trade the course name
          already makes.
        */}
        <div className="mt-0.5 pl-6">
          <TextField
            label="Course location"
            variant="bare"
            size="sm"
            value={course.location}
            placeholder="Add a location"
            onChange={(e) => onOp({ type: 'setLocation', location: e.target.value })}
            className="w-full text-2xs text-text-secondary"
          />
          {/*
            The description is the one that wraps.

            As a single-line input it truncated at the panel's width, so a
            sentence you had just typed became unreadable the moment you left
            the field — the field was hiding its own contents. It grows
            downwards instead; there is room below it, and the 280-character
            cap keeps "grows" from meaning "takes the column". See `TextArea`.
          */}
          <TextArea
            label="Course description"
            variant="bare"
            size="sm"
            value={course.description}
            maxLength={DESCRIPTION_MAX}
            placeholder="Add a description"
            onChange={(e) => onOp({ type: 'setDescription', description: e.target.value })}
            className="w-full text-2xs leading-4 text-text-secondary"
          />
        </div>
      </header>

      <div className="min-h-0 overflow-y-auto">
        <CourseProperties
          course={course}
          units={units}
          onOp={onOp}
          onUnitsChange={onUnitsChange}
          onDrawBoundary={onDrawBoundary}
        />
      </div>
    </Panel>
  );
}
