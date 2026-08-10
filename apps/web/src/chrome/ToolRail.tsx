import type { ReactNode } from 'react';
import { IconButton, Panel, Segmented } from '@hyzerlines/design';
import {
  FOCUSES,
  FOCUS_DEFINITIONS,
  KIND_DEFINITIONS,
  type FeatureKind,
  type Focus,
} from '@hyzerlines/core';

import type { Tool } from '../map/tools';

/**
 * The tool palette.
 *
 * Top centre, horizontal: the map is the product, and the widest thing on
 * screen is the horizon. A vertical rail down the left edge eats into the same
 * column as the course panel and pushes the usable canvas sideways, while a
 * horizontal bar costs only a strip.
 *
 * Top rather than bottom, level with the two panel columns it sits between.
 * The bottom edge is where the land you are working on is — a course runs down
 * and away from you on screen more often than up — and it was already carrying
 * the camera controls and the attribution.
 *
 * Navigation first, then a divider, then the things that create geometry, then
 * a divider and undo/redo. History belongs here rather than up in the document
 * chrome: undo is a drawing action, reached mid-gesture, and the hand is
 * already at the rail when a placement goes wrong.
 *
 * There is no pan tool. A drag pans from every tool except Zoom, so a button
 * for it would be a button for something already happening.
 *
 * ## Icons are drawn in `currentColor`
 *
 * They used to paint from the feature tokens, so that a gold square in the rail
 * and a gold pad on the map were self-evidently the same thing. Two changes
 * killed that: every feature went white in the monochrome pass, and feature
 * tokens are deliberately theme-independent because they sit on imagery. The
 * result was white-on-white — the entire rail invisible in the light theme —
 * and a basket that never drew in either, because it asked for
 * `--hz-feature-basket-stroke` and the token is named for the `target` kind.
 *
 * `currentColor` inherits the button's own text colour, so the icons follow the
 * theme and the active state for free. The shapes still carry the meaning.
 */

/** Rail icons are drawn on a 15-unit grid and scaled by the SVG box. */
const ICON = 22;

function SelectIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M3 2.2 11.4 7 7.6 8.1 6.2 12z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A magnifier. The sign inside follows what a click would actually do. */
function ZoomIcon({ out }: { out: boolean }) {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <circle cx="6.6" cy="6.6" r="4.1" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.7 9.7 13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d={out ? 'M4.6 6.6h4' : 'M4.6 6.6h4M6.6 4.6v4'}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TeeIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <rect
        x="2.5"
        y="5"
        width="10"
        height="5"
        rx="0.8"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

/** A basket in side elevation: the top ring, the band, the pole. */
function BasketIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M7.5 2.2v10.6M4 5.2h7M4.6 5.2 7.5 8l2.9-2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MandoIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M4 12.5V2.5l7 2.6-7 2.6"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PathIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M2.5 12c2.5-1 4-7.5 10-9.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.6 1.8"
      />
    </svg>
  );
}

function BoundaryIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M2.2 4.5 7.5 2l5.3 2.5v6L7.5 13 2.2 10.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeDasharray="1.6 1.4"
      />
    </svg>
  );
}

function ObIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <rect
        x="2.4"
        y="2.4"
        width="10.2"
        height="10.2"
        rx="1"
        fill="currentColor"
        fillOpacity="0.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeDasharray="2.4 1.6"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M3 7.5h6.2a3 3 0 0 1 0 6H7M3 7.5 6 4.5M3 7.5l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M12 7.5H5.8a3 3 0 0 0 0 6H8M12 7.5 9 4.5M12 7.5l-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Tools that get a rail slot, in the order they are used designing a hole.
 *
 * **No fairway tool.** A fairway is the line between a tee and a target, so it
 * exists the moment both do — drawing one by hand would be tracing something
 * the app already knows. Bending it is vertex editing on the line that is
 * already there, not a separate mode to enter.
 *
 * `path` takes the slot. It is the other line a course has — the walk from one
 * green to the next tee — and unlike a fairway it genuinely has to be drawn.
 */
/**
 * Every kind that has an icon, in the order it should appear.
 *
 * The focus decides which of these are shown; this list only decides what can
 * be shown at all. A kind with no entry here has no tool yet — that is the
 * expanded-palette milestone, and it is deliberately an exercise in drawing
 * icons rather than a second argument about which focus owns a drop zone.
 */
const TOOLS: { kind: FeatureKind; icon: () => React.ReactElement }[] = [
  { kind: 'tee', icon: TeeIcon },
  { kind: 'target', icon: BasketIcon },
  { kind: 'mando', icon: MandoIcon },
  { kind: 'ob', icon: ObIcon },
  { kind: 'boundary', icon: BoundaryIcon },
  { kind: 'path', icon: PathIcon },
];

const FOCUS_OPTIONS = FOCUSES.map((focus) => ({
  value: focus,
  label: FOCUS_DEFINITIONS[focus].label,
  hint: FOCUS_DEFINITIONS[focus].summary,
}));

const Divider = () => <span className="mx-1 h-7 w-px bg-border-subtle" aria-hidden="true" />;

export function ToolRail({
  tool,
  focus,
  onFocusChange,
  invertZoom,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  below,
}: {
  /**
   * Which kind of work the editor is set up for.
   *
   * The switcher lives here, at the left of the palette it governs, because
   * the palette is the most visible thing it changes. Putting it in the left
   * column would separate the control from its largest effect.
   */
  focus: Focus;
  onFocusChange: (focus: Focus) => void;
  /**
   * The *effective* tool, not the chosen one.
   *
   * While Z is held the map behaves differently from what was clicked, and the
   * rail has to say so — a highlighted Select button over a map that is about
   * to zoom is the rail lying about the mode.
   */
  tool: Tool;
  /** Alt is down, so the zoom tool would zoom out. Mirrors the cursor. */
  invertZoom: boolean;
  onToolChange: (tool: Tool) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /**
   * Chrome that stacks beneath the rail, in the same centred column.
   *
   * The recenter button lives here rather than positioning itself. It used to
   * pick a `top` that cleared a one-panel rail, and when the rail grew a second
   * panel it landed on the button — visible, and no longer clickable. Anything
   * that has to sit under the rail belongs in the rail's own column, where the
   * clearance is a fact of the layout rather than a number two files agree on.
   */
  below?: ReactNode;
}) {
  const kinds = FOCUS_DEFINITIONS[focus].kinds;
  const tools = TOOLS.filter(({ kind }) => kinds.includes(kind));

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-2"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      {/*
        The focus switcher is its own panel, above the rail it governs.
        Not inside it.

        Both panels are centred, and the rail's width changes with the focus —
        Play offers four tools, Routing none. A switcher sharing that panel
        would slide sideways every time it was used: click Land, the row
        shrinks and re-centres, and Routing is no longer where you were about
        to click. A control must not move because you used it.

        Stacking also says the right thing. The focus governs the tools, so it
        sits above them.
      */}
      <Panel className="flex items-center p-1">
        <Segmented
          label="Focus"
          value={focus}
          onChange={onFocusChange}
          options={FOCUS_OPTIONS}
        />
      </Panel>

      <Panel className="flex items-center gap-0.5" role="toolbar" aria-label="Tools">
        <IconButton
          label="Select"
          command="tool.select"
          size="lg"
          tooltipSide="bottom"
          active={tool === 'select'}
          onClick={() => onToolChange('select')}
        >
          <SelectIcon />
        </IconButton>
        {/* No `command`: Z is a hold, and rendering it as a plain key in the
            tooltip would say "press this", which is not what it does. */}
        <IconButton
          label="Zoom — hold Z, drag a region, Alt to zoom out"
          size="lg"
          tooltipSide="bottom"
          active={tool === 'zoom'}
          onClick={() => onToolChange('zoom')}
        >
          <ZoomIcon out={tool === 'zoom' && invertZoom} />
        </IconButton>

        {/*
          Only the kinds this focus is responsible for.

          The divider goes with them: a focus that draws nothing — routing and
          simulation, so far — should not leave a rule floating against a gap
          where its tools would have been.
        */}
        {tools.length > 0 && <Divider />}

        {tools.map(({ kind, icon: Icon }) => (
          <IconButton
            key={kind}
            label={KIND_DEFINITIONS[kind].label}
            {...(KIND_DEFINITIONS[kind].command
              ? { command: KIND_DEFINITIONS[kind].command }
              : {})}
            size="lg"
            tooltipSide="bottom"
            active={tool === kind}
            onClick={() => onToolChange(kind)}
          >
            <Icon />
          </IconButton>
        ))}

        <Divider />

        <IconButton
          label="Undo"
          command="edit.undo"
          size="lg"
          tooltipSide="bottom"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <UndoIcon />
        </IconButton>
        <IconButton
          label="Redo"
          command="edit.redo"
          size="lg"
          tooltipSide="bottom"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <RedoIcon />
        </IconButton>
      </Panel>

      {below}
    </div>
  );
}
