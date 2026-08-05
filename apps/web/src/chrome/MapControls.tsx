import { IconButton, Menu, MenuRadioGroup, MenuRadioItem, Panel } from '@hyzerlines/design';

import { useMap } from '../map/MapContext';
import { basemaps } from '../map/basemaps';

/**
 * Camera controls, and the choice of what is under them.
 *
 * Vertical, in the corner, in the order the eye reads them: which imagery,
 * then which way is up, then how close. Horizontal versions of this cost a
 * strip of the map's widest dimension for no reason — a corner is dead space
 * either way, and stacking uses it.
 *
 * The zoom level readout is gone. `z16.4` is a number about the tile pyramid,
 * not about the land: it cannot be compared to anything a designer cares
 * about, and the scale bar it sat next to said the same thing in feet.
 *
 * Basemap choice lives here rather than in the document chrome. It was in the
 * top bar as "a statement about what you are looking at", but a designer flips
 * to topographic to read a slope and back to satellite to read canopy — that
 * is a camera gesture, made repeatedly, and it belongs with the camera.
 */

function LayersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
      <path
        d="M7.5 1.8 13.5 5l-6 3.2L1.5 5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="m2.6 7.4-1.1.6 6 3.2 6-3.2-1.1-.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MapControls({
  basemapId,
  onBasemapChange,
}: {
  basemapId: string;
  onBasemapChange: (id: string) => void;
}) {
  const { map, view } = useMap();

  return (
    <div
      className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-end gap-2"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      {/* Its own panel, deliberately: what you are looking at and where the
          camera is pointed are different questions, and a shared card would
          make the layers button read as a third zoom control. */}
      <Panel>
        <Menu
          label="Basemap"
          align="end"
          trigger={
            <IconButton label="Basemap" command="view.toggleBasemap" tooltipSide="left">
              <LayersIcon />
            </IconButton>
          }
        >
          <MenuRadioGroup value={basemapId} onValueChange={onBasemapChange}>
            {basemaps.map((basemap) => (
              <MenuRadioItem key={basemap.id} value={basemap.id} hint={basemap.hint}>
                {basemap.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </Menu>
      </Panel>

      <Panel className="flex flex-col items-center gap-0.5">
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

        <span className="my-0.5 h-px w-5 bg-border-subtle" aria-hidden="true" />

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
