import { useMemo } from 'react';
import { IconButton, Panel, Segmented, type SegmentedOption } from '@hyzerlines/design';

import { useMap } from '../map/MapContext';
import { basemaps, basemapById } from '../map/basemaps';

/** Bottom-right cluster: basemap, zoom, north reset. */
export function MapControls({
  basemapId,
  onBasemapChange,
}: {
  basemapId: string;
  onBasemapChange: (id: string) => void;
}) {
  const { map, view } = useMap();
  const active = basemapById(basemapId);

  const options = useMemo<SegmentedOption<string>[]>(
    () => basemaps.map((b) => ({ value: b.id, label: b.label, hint: b.hint })),
    [],
  );

  return (
    <div
      className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-end gap-2"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      <Panel>
        <Segmented
          label="Basemap"
          options={options}
          value={active.id}
          onChange={onBasemapChange}
        />
      </Panel>

      <Panel className="flex items-center gap-0.5">
        <IconButton
          label="Zoom out"
          command="view.zoomOut"
          tooltipSide="top"
          onClick={() => map?.zoomOut()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </IconButton>

        <span className="w-10 text-center font-mono text-2xs tabular-nums text-text-muted">
          z{view.zoom.toFixed(1)}
        </span>

        <IconButton
          label="Zoom in"
          command="view.zoomIn"
          tooltipSide="top"
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

        <span className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />

        {/* Reset north. Disabled when already north-up, so it reads as state. */}
        <IconButton
          label="Reset bearing to north"
          tooltipSide="top"
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
    </div>
  );
}
