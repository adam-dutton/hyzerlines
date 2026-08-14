import type { ReactNode } from 'react';
import { IconButton, Panel, cn } from '@hyzerlines/design';

import { useMap } from '../map/MapContext';
import { GAP, GUTTER, LAYERS_WIDTH, SLIDE_EASE, SLIDE_MS, TOP_BAR_HEIGHT } from './layout';

/**
 * The camera, down the top-right corner.
 *
 * What is under the map, then which way is up, then how close — the order the
 * eye reads them, stacked because that is the shape of the space they are in.
 *
 * It was a horizontal row in the bottom channel, which was right while the
 * chrome floated in the middle of the screen and the corners were dead. The
 * corners are not dead now: the rail runs down the left edge and the drawer down
 * the right, so the free space is the map itself and the top-right corner is the
 * one part of it nothing else claims. The bottom channel belongs to the tool bar
 * and the readouts.
 *
 * The whole cluster steps aside when the layers drawer opens. It has to: the
 * button that opens the drawer is in it, and a control that disappears under the
 * thing it opened is one you cannot use to close it again.
 */

function LayersIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5 L21 8 L12 12.5 L3 8 Z" />
      <path d="M4.6 11.6 L12 15.3 L19.4 11.6" />
      <path d="M4.6 15.3 L12 19 L19.4 15.3" />
    </svg>
  );
}

export function MapControls({
  layersOpen,
  onToggleLayers,
  recenter,
}: {
  layersOpen: boolean;
  onToggleLayers: () => void;
  /**
   * The recenter affordance, which appears only when the course is off screen.
   *
   * Passed in rather than positioned by itself. It used to pick a `top` that
   * cleared a rail one panel tall, and when the rail grew a second panel it
   * landed on the button — visible, and no longer clickable. Anything that has
   * to share this cluster's line belongs inside the cluster, where the clearance
   * is a fact of the layout rather than a number two files agree on.
   */
  recenter?: ReactNode;
}) {
  const { map, view } = useMap();

  return (
    <div
      className="pointer-events-none absolute flex flex-col items-end gap-2"
      style={{
        top: TOP_BAR_HEIGHT + GAP + GUTTER / 2,
        right: (layersOpen ? LAYERS_WIDTH : 0) + GUTTER,
        transition: `right ${SLIDE_MS}ms ${SLIDE_EASE}`,
        zIndex: 'var(--hz-z-chrome)',
      }}
    >
      {/*
        Its own button rather than a panel of one, because it is a toggle with a
        lit state and a `Panel` around it would put a surface behind a control
        that becomes a surface of its own when it is on.
      */}
      <button
        type="button"
        onClick={onToggleLayers}
        aria-label="Layers"
        aria-expanded={layersOpen}
        title="Layers"
        className={cn(
          'pointer-events-auto grid h-9 w-9 place-items-center rounded-lg shadow-float backdrop-blur-md',
          'transition-colors duration-fast',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          layersOpen
            ? 'bg-accent-solid text-accent-text-on-solid'
            : 'bg-surface-overlay text-text-secondary hover:text-text-primary',
        )}
      >
        <LayersIcon />
      </button>

      {recenter}

      <Panel className="pointer-events-auto flex flex-col items-center gap-0.5 p-0.5">
        {/* Reset north. Disabled when already north-up, so it reads as state. */}
        <IconButton
          label="Reset bearing to north"
          tooltipSide="left"
          disabled={view.bearing === 0 && view.pitch === 0}
          onClick={() => map?.easeTo({ bearing: 0, pitch: 0, duration: 300 })}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            aria-hidden="true"
            style={{ transform: `rotate(${-view.bearing}deg)` }}
          >
            <path d="M7 1.5 9.5 12 7 9.8 4.5 12z" fill="currentColor" />
          </svg>
        </IconButton>
      </Panel>

      <Panel className="pointer-events-auto flex flex-col items-center gap-0.5 p-0.5">
        {/* In above out, reading top to bottom as a scale that grows upwards —
            which is the direction the map's own zoom runs. */}
        <IconButton
          label="Zoom in"
          command="view.zoomIn"
          tooltipSide="left"
          onClick={() => map?.zoomIn()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M7 2v10M2 7h10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>

        <span className="mx-1 h-px w-4 bg-border-subtle" aria-hidden="true" />

        <IconButton
          label="Zoom out"
          command="view.zoomOut"
          tooltipSide="left"
          onClick={() => map?.zoomOut()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>
      </Panel>
    </div>
  );
}
