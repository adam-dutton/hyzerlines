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
 * Navigation first, then a divider, then the things that create geometry. The
 * order within each group is the order you use them designing a hole.
 *
 * There is no pan tool. A drag pans from every tool except Zoom, so a button
 * for it would be a button for something already happening.
 *
 * Icons are drawn in the feature's own token color, so the rail and the map
 * agree without a legend — a gold square is a tee pad in both places.
 */

function SelectIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
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
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
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
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <rect
        x="2.5"
        y="5"
        width="10"
        height="5"
        rx="0.8"
        fill="var(--hz-feature-tee-fill)"
        stroke="var(--hz-feature-tee-stroke)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function BasketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M7.5 2.2v10.6M4 5.2h7M4.6 5.2 7.5 8l2.9-2.8"
        fill="none"
        stroke="var(--hz-feature-basket-stroke)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MandoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M4 12.5V2.5l7 2.6-7 2.6"
        fill="var(--hz-feature-mando-fill)"
        stroke="var(--hz-feature-mando-stroke)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PathIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M2.5 12c2.5-1 4-7.5 10-9.4"
        fill="none"
        stroke="var(--hz-feature-path-stroke)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.6 1.8"
      />
    </svg>
  );
}

function BoundaryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M2.2 4.5 7.5 2l5.3 2.5v6L7.5 13 2.2 10.5Z"
        fill="var(--hz-feature-boundary-fill)"
        stroke="var(--hz-feature-boundary-stroke)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ObIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <rect
        x="2.4"
        y="2.4"
        width="10.2"
        height="10.2"
        rx="1"
        fill="var(--hz-feature-ob-fill)"
        stroke="var(--hz-feature-ob-stroke)"
        strokeWidth="1.4"
        strokeDasharray="2.4 1.6"
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

const Divider = () => <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden="true" />;

export function ToolRail({
  tool,
  invertZoom,
  onToolChange,
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
            tooltipSide="top"
            active={tool === kind}
            onClick={() => onToolChange(kind)}
          >
            <Icon />
          </IconButton>
        ))}
      </Panel>
    </div>
  );
}
