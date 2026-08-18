import {
  Button,
  IconButton,
  Segmented,
  TextField,
  cn,
  type ThemeName,
} from '@hyzerlines/design';
import {
  FOCUSES,
  FOCUS_DEFINITIONS,
  totalLength,
  totalPar,
  viewHoles,
  type Course,
  type Focus,
  type Op,
} from '@hyzerlines/core';

import { formatDistance, type UnitSystem } from '../units';
import { useProfiles } from '../survey/useProfiles';
import { useAutoLocation } from './useAutoLocation';
import { CourseMenu } from './CourseMenu';
import { LARGE_ART } from './iconArt';
import { GAP, TOP_BAR_HEIGHT } from './layout';
import type { SaveStatus } from '../document/CourseProvider';

/**
 * The document, across the top.
 *
 * Three columns: what this is, what you are doing to it, and what you can do
 * with it. A grid rather than a flex row with `justify-between`, and that is the
 * whole point of the arrangement — the centre column is `auto` between two
 * `minmax(0, 1fr)` tracks, so the focus switcher is centred on the *viewport*
 * and stays put as the course name grows. Flexed, it drifted left every time
 * somebody typed, and a control that moves because of something unrelated to it
 * is a control you have to re-find.
 *
 * ## Why the course name lives here and not in a panel
 *
 * It used to head a card in the left column, with the course's own properties
 * folded underneath it. That card was doing two jobs — naming the document and
 * inspecting it — and it lost the second one to the right panel, which is where
 * every other kind of properties already lived. What is left is identity, and
 * identity belongs in the frame rather than in one of the columns.
 *
 * Location and description went with the properties, not with the name. They are
 * fields you fill once and then read, and at the top they cost a permanent third
 * line for something nobody looks at twice — see `CourseProperties`.
 *
 * ## The focus switcher moved up out of the tool bar
 *
 * It arrived in its own panel stacked above the rail, deliberately kept out of
 * the rail so that a palette which changes width would not slide the switcher
 * sideways as you used it. The top bar's centre column solves the same problem
 * more strongly: the track is fixed by the grid, so it cannot move for any
 * reason, and the switcher now sits with the other document-level controls
 * instead of floating over the map on a line of its own.
 */

function Mark() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
      {/*
        A hyzer line: the arcing, left-finishing flight the app is named for,
        ending at the basket. Drawn in `currentColor` so it takes the chip's
        on-accent colour rather than naming one — the chip is the only place in
        the interface with a dark foreground on a light fill, and hard-coding
        that would break the moment the accent moved.
      */}
      <path
        d="M2.5 4c7 .2 12 4 12.4 8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="15" cy="15.2" r="2.8" fill="currentColor" />
    </svg>
  );
}

/**
 * Undo and redo: an arrow curling back on itself.
 *
 * Two drawings rather than one flipped, because they are not mirrors — the hook
 * is on opposite ends but the tail curls the same way round in both, which is
 * what keeps them reading as a pair of arrows rather than as one arrow and its
 * reflection.
 *
 * The art is in `iconArt` with everything else. The old pair was a 15-unit
 * stroked path, which is the one thing this icon set does not do: everything
 * else is a filled outline, so a stroke among them reads as a different family
 * at any size.
 */
function ArrowIcon({ name }: { name: 'undo' | 'redo' }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {LARGE_ART[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const FOCUS_OPTIONS = FOCUSES.map((focus) => ({
  value: focus,
  label: FOCUS_DEFINITIONS[focus].label,
  hint: FOCUS_DEFINITIONS[focus].summary,
}));

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

export function TopBar({
  course,
  units,
  focus,
  onFocusChange,
  onOp,
  saveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImport,
  onExport,
  theme,
  onToggleTheme,
  onShowShortcuts,
}: {
  course: Course;
  units: UnitSystem;
  focus: Focus;
  onFocusChange: (focus: Focus) => void;
  onOp: (op: Op) => void;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Open a course file. Named for the button rather than for the file dialog. */
  onImport: () => void;
  onExport: () => void;
  theme: ThemeName;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}) {
  // The same elevations the scorecard and the hole panel read, so the course
  // total is the sum of the pars actually shown beside each hole.
  const { elevations } = useProfiles();
  const views = viewHoles(course, course.holes, elevations);
  const holes = course.holes.length;

  /*
   * One line describing the course, and no more.
   *
   * Withheld entirely until there is a hole: `0 holes · Par 0 · 0 ft` is four
   * zeroes pretending to be a measurement. It ellipsizes rather than wrapping,
   * because the bar is a fixed height and a second line would push the controls
   * out of it.
   */
  const stats =
    holes === 0
      ? 'No holes yet'
      : `${holes} ${holes === 1 ? 'hole' : 'holes'} · Par ${totalPar(views.values())} · ${formatDistance(totalLength(views.values()), units)}`;

  useAutoLocation({
    location: course.location,
    hasFeatures: course.features.length > 0,
    /*
     * `seeded`, so this never lands on the undo stack. It arrives a second or
     * two after the first thing you draw, and without the flag ⌘Z would take
     * back a field you never typed instead of the drawing you did. See
     * `isUndoable`.
     */
    onResolved: (location) => onOp({ type: 'setLocation', location, seeded: true }),
  });

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 top-0 flex"
      style={{ height: TOP_BAR_HEIGHT, zIndex: 'var(--hz-z-chrome)' }}
    >
      {/*
        Edge to edge, and a border rather than a shadow.

        It floated in a rounded card with a gutter around it, which is what every
        other piece of chrome does — and it was the one piece that should not.
        The bar is the frame: it names the document and holds the mode switcher,
        so it has to read as the top of the application rather than as a card
        lying on the map. A card also cost 12px of map on three sides for
        nothing, since nothing can ever be above it.
      */}
      <header
        className={cn(
          'pointer-events-auto grid w-full items-center px-3.5',
          'border-b border-border-subtle bg-surface-raised',
        )}
        /*
         * Symmetric padding, deliberately.
         *
         * Uneven padding puts the focus switcher off the viewport's centre — and
         * a few pixels off is exactly the kind of misalignment you cannot see on
         * its own but can see against the tool bar below, which is centred on the
         * free channel. Equal padding makes the two share a centre line.
         */
        style={{ gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', gap: GAP * 2 }}
        aria-label="Course"
      >
        {/* What this is. */}
        <div className="flex min-w-0 items-center gap-2 pl-1">
          <span
            className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-accent-solid text-accent-text-on-solid"
            aria-hidden="true"
          >
            <Mark />
          </span>
          {/*
            The name is an input that looks like a title, which is what it is. A
            course name is not important enough to deserve a dialog, and editing
            it in place keeps the map unobstructed.
          */}
          <TextField
            label="Course name"
            align="left"
            variant="bare"
            size="sm"
            value={course.name}
            placeholder="Untitled course"
            onChange={(e) => onOp({ type: 'setName', name: e.target.value })}
            spellCheck={false}
            className="min-w-0 max-w-[16rem] shrink font-semibold"
          />
          <span className="min-w-0 truncate text-xs tabular-nums text-text-muted">{stats}</span>
          <SaveIndicator status={saveStatus} />
        </div>

        {/* What you are doing to it. Centred by the grid, not by the content. */}
        <Segmented
          label="Focus"
          variant="solid"
          size="md"
          value={focus}
          onChange={onFocusChange}
          options={FOCUS_OPTIONS}
          className="justify-self-center"
        />

        {/* What you can do with it. */}
        <div className="flex items-center gap-1 justify-self-end">
          {/*
            History sits up here rather than on the tool bar.

            It was on the rail, on the argument that undo is a drawing action
            reached mid-gesture. It is also a document action, and the rail now
            has to fit between two panel columns — seven tools wide is the budget,
            and two of them were history. Up here they are next to Import and
            Export, which is the other thing that reads as "this document" rather
            than "this shape".
          */}
          <IconButton
            label="Undo"
            command="edit.undo"
            tooltipSide="bottom"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <ArrowIcon name="undo" />
          </IconButton>
          <IconButton
            label="Redo"
            command="edit.redo"
            tooltipSide="bottom"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <ArrowIcon name="redo" />
          </IconButton>

          <Button variant="ghost" onClick={onImport}>
            Import
          </Button>
          <Button variant="ghost" onClick={onExport}>
            Export
          </Button>

          {/*
            The overflow, holding what has nowhere better to be: the theme, the
            shortcuts overlay and the source link. The design drew a `Share`
            button in this slot; there is nothing to share to yet, and a button
            that opens nothing is worse than the gap it fills.
          */}
          <CourseMenu
            theme={theme}
            onToggleTheme={onToggleTheme}
            onShowShortcuts={onShowShortcuts}
          />
        </div>
      </header>
    </div>
  );
}
