import { IconButton, Panel } from '@hyzerlines/design';
import { KIND_DEFINITIONS, type FeatureKind } from '@hyzerlines/core';

import type { Tool } from '../map/tools';

/**
 * The tool palette.
 *
 * Bottom centre, horizontal: the map is the product, and the widest thing on
 * screen is the horizon. A vertical rail down the left edge eats into the same
 * column as the course panel and pushes the usable canvas sideways, while a
 * bottom bar costs only a strip of sky.
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
const TOOLS: { kind: FeatureKind; icon: () => React.ReactElement }[] = [
  { kind: 'tee', icon: TeeIcon },
  { kind: 'target', icon: BasketIcon },
  { kind: 'path', icon: PathIcon },
  { kind: 'mando', icon: MandoIcon },
  { kind: 'ob', icon: ObIcon },
  { kind: 'boundary', icon: BoundaryIcon },
];

const Divider = () => <span className="mx-1 h-7 w-px bg-border-subtle" aria-hidden="true" />;

export function ToolRail({
  tool,
  invertZoom,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
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
}) {
  return (
    <div
      className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      <Panel className="flex items-center gap-0.5" role="toolbar" aria-label="Tools">
        <IconButton
          label="Select"
          command="tool.select"
          size="lg"
          tooltipSide="top"
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
          tooltipSide="top"
          active={tool === 'zoom'}
          onClick={() => onToolChange('zoom')}
        >
          <ZoomIcon out={tool === 'zoom' && invertZoom} />
        </IconButton>

        <Divider />

        {TOOLS.map(({ kind, icon: Icon }) => (
          <IconButton
            key={kind}
            label={KIND_DEFINITIONS[kind].label}
            {...(KIND_DEFINITIONS[kind].command
              ? { command: KIND_DEFINITIONS[kind].command }
              : {})}
            size="lg"
            tooltipSide="top"
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
          tooltipSide="top"
          disabled={!canUndo}
          onClick={onUndo}
        >
          <UndoIcon />
        </IconButton>
        <IconButton
          label="Redo"
          command="edit.redo"
          size="lg"
          tooltipSide="top"
          disabled={!canRedo}
          onClick={onRedo}
        >
          <RedoIcon />
        </IconButton>
      </Panel>
    </div>
  );
}
