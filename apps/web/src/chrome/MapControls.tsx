import { useMap } from '../map/MapContext';
import { basemaps, basemapById } from '../map/basemaps';
import { shortcutFor } from '@hyzerlines/design';

const buttonClass =
  'grid h-8 w-8 place-items-center rounded-md text-text-secondary transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:pointer-events-none disabled:text-text-disabled';

const panelClass =
  'flex items-center gap-0.5 rounded-lg border border-border-default bg-surface-overlay p-1 shadow-float backdrop-blur-md';

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

  return (
    <div
      className="absolute bottom-4 right-4 flex flex-col items-end gap-2"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      {/* Basemap. A segmented control rather than a dropdown: three options that
          you switch between constantly should not cost a click to reveal. */}
      <div className={panelClass} role="radiogroup" aria-label="Basemap">
        {basemaps.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={b.id === active.id}
            title={`${b.label} — ${b.hint}`}
            onClick={() => onBasemapChange(b.id)}
            className={`rounded-md px-2.5 py-1 text-2xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
              b.id === active.id
                ? 'bg-accent-soft text-text-accent'
                : 'text-text-muted hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div className={panelClass}>
        <button
          type="button"
          className={buttonClass}
          title={`Zoom out  ${shortcutFor('view.zoomOut')}`}
          aria-label="Zoom out"
          onClick={() => map?.zoomOut()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <span className="w-10 text-center font-mono text-2xs tabular-nums text-text-muted">
          z{view.zoom.toFixed(1)}
        </span>

        <button
          type="button"
          className={buttonClass}
          title={`Zoom in  ${shortcutFor('view.zoomIn')}`}
          aria-label="Zoom in"
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
        </button>

        <span className="mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />

        {/* Reset north. Disabled when already north-up, so it reads as state. */}
        <button
          type="button"
          className={buttonClass}
          title="Reset bearing to north"
          aria-label="Reset bearing to north"
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
        </button>
      </div>
    </div>
  );
}
