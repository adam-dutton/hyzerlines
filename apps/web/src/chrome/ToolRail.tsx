import { IconButton, Panel } from '@hyzerlines/design';
import { KIND_DEFINITIONS, type FeatureKind } from '@hyzerlines/core';

import type { Tool } from '../map/useDrawing';

/**
 * The tool palette.
 *
 * Absent until now on purpose: a rail of disabled buttons advertises a roadmap
 * at the cost of making the product look broken. Every tool here works.
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

function FairwayIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M2.5 12c2.5-1 4-7.5 10-9.4"
        fill="none"
        stroke="var(--hz-feature-fairway-stroke)"
        strokeWidth="1.6"
        strokeLinecap="round"
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

/** Tools that get a rail slot, in the order they are used designing a hole. */
const TOOLS: { kind: FeatureKind; icon: () => React.ReactElement }[] = [
  { kind: 'tee', icon: TeeIcon },
  { kind: 'basket', icon: BasketIcon },
  { kind: 'fairway', icon: FairwayIcon },
  { kind: 'mando', icon: MandoIcon },
  { kind: 'ob', icon: ObIcon },
];

export function ToolRail({
  tool,
  onToolChange,
}: {
  tool: Tool;
  onToolChange: (tool: Tool) => void;
}) {
  return (
    <div
      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      <Panel className="flex flex-col gap-0.5">
        <IconButton
          label="Select"
          command="tool.select"
          tooltipSide="right"
          active={tool === 'select'}
          onClick={() => onToolChange('select')}
        >
          <SelectIcon />
        </IconButton>

        <span className="mx-1 my-0.5 h-px bg-border-subtle" aria-hidden="true" />

        {TOOLS.map(({ kind, icon: Icon }) => (
          <IconButton
            key={kind}
            label={KIND_DEFINITIONS[kind].label}
            {...(KIND_DEFINITIONS[kind].command
              ? { command: KIND_DEFINITIONS[kind].command }
              : {})}
            tooltipSide="right"
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
