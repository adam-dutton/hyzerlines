import { IconButton, Panel, Popover, Slider, Switch, cn } from '@hyzerlines/design';
import type { OverlayAmount, Overlays, OverlaySwitch } from '@hyzerlines/core';

import { useMap } from '../map/MapContext';
import { basemaps } from '../map/basemaps';
import { OVERLAY_DEFINITIONS } from '../map/terrain';
import { SurveySection } from './SurveySection';
import type { SurveyState } from '../survey/useSurvey';
import type { UnitSystem } from '../units';

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

/** A section heading inside the layers panel. */
function GroupTitle({ children }: { children: string }) {
  return (
    <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </p>
  );
}

/**
 * What each overlay can be adjusted by.
 *
 * Keyed by the switch it sits under, so a control can only exist for something
 * that can be turned on — and adding a field to `Overlays` without deciding
 * where it belongs is a compile error rather than a setting only a file can
 * reach, which is the same discipline `OVERLAY_DEFINITIONS` enforces.
 *
 * ## Why softness is a count of steps rather than a blur radius
 *
 * MapLibre has no blur for a hillshade, and a screen-space blur is not the
 * remedy anyway: 1m LiDAR shading looks like gravel because it is resolving
 * tree crowns, and the answer is to read the terrain at a coarser step. Each
 * step halves the grid, so there are three settings and not a continuum —
 * offering tenths of a step would be a control that mostly does nothing.
 */
const SLIDERS: Record<
  OverlaySwitch,
  readonly {
    field: OverlayAmount;
    label: string;
    min: number;
    max: number;
    step: number;
    format: (value: number) => string;
  }[]
> = {
  hillshade: [
    {
      field: 'hillshadeOpacity',
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.05,
      format: (v) => `${Math.round(v * 100)}%`,
    },
    {
      field: 'hillshadeSoftness',
      label: 'Softness',
      min: 0,
      max: 2,
      step: 1,
      format: (v) => (v === 0 ? 'Sharp' : v === 1 ? 'Soft' : 'Softest'),
    },
  ],
  contours: [
    {
      field: 'contourOpacity',
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.05,
      format: (v) => `${Math.round(v * 100)}%`,
    },
    {
      field: 'contourSmoothing',
      label: 'Smoothing',
      min: 0,
      max: 2,
      step: 1,
      format: (v) => (v === 0 ? 'Off' : v === 1 ? 'Some' : 'More'),
    },
  ],
};

export function MapControls({
  basemapId,
  overlays,
  units,
  survey,
  onBasemapChange,
  onOverlaysChange,
}: {
  basemapId: string;
  overlays: Overlays;
  units: UnitSystem;
  /**
   * The imported-elevation controls, passed whole.
   *
   * One object rather than five props because they are one feature and this
   * component does nothing with them but hand them on — see `SurveySection`.
   */
  survey: {
    state: SurveyState;
    status: SurveyState['status'];
    onImport: (file: File) => void;
    onRemove: (name?: string) => void;
    onDismissError: () => void;
  };
  onBasemapChange: (id: string) => void;
  onOverlaysChange: (changes: Partial<Overlays>) => void;
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
        {/*
          A popover, not a menu. It used to be a menu with a radio group, which
          was right while picking one of three was all it did. Now there are two
          groups and you work in it — flip hillshade, look at the map, flip
          contours, look again — and a menu that closes on select is fighting
          that. See `Popover`.
        */}
        <Popover
          label="Layers"
          trigger={
            <IconButton label="Layers" command="view.toggleBasemap" tooltipSide="left">
              <LayersIcon />
            </IconButton>
          }
        >
          {/*
            Base first, overlays second, in the order they stack on the map.
            A radiogroup rather than a listbox: three named alternatives with
            one always chosen is exactly what radio semantics describe, and it
            gets "Satellite, selected, 1 of 3" announced for free.
          */}
          <div role="radiogroup" aria-label="Basemap" className="p-1">
            {basemaps.map((basemap) => {
              const active = basemap.id === basemapId;
              return (
                <button
                  key={basemap.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onBasemapChange(basemap.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                    'transition-colors duration-fast hover:bg-surface-hover',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  )}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center text-text-accent">
                    {active && (
                      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                        <path
                          d="m2.5 6.2 2.4 2.4 4.6-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-text-primary">{basemap.label}</span>
                    <span className="block truncate text-2xs text-text-muted">
                      {basemap.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-border-subtle pb-2">
            <GroupTitle>Terrain</GroupTitle>
            {OVERLAY_DEFINITIONS.map((overlay) => (
              <div key={overlay.id}>
                <div className="flex items-center justify-between gap-3 px-3 py-1">
                  <span className="min-w-0">
                    <span className="block text-xs text-text-secondary">{overlay.label}</span>
                    <span className="block truncate text-2xs text-text-muted">
                      {overlay.hint}
                    </span>
                  </span>
                  <Switch
                    label={overlay.label}
                    checked={overlays[overlay.id]}
                    onChange={(on) => onOverlaysChange({ [overlay.id]: on })}
                  />
                </div>

                {/*
                  The adjustments belong to the switch above them, and stay put
                  when it is off — disabled rather than hidden, so the group
                  keeps its shape and you can see what turning it back on would
                  restore. The same rule the inspector's indented toggles follow.
                */}
                <div className="pl-6 pr-3">
                  {SLIDERS[overlay.id].map((slider) => (
                    <div
                      key={slider.field}
                      className="flex items-center justify-between gap-2 py-0.5"
                    >
                      <span
                        className={cn(
                          'text-2xs',
                          overlays[overlay.id] ? 'text-text-muted' : 'text-text-disabled',
                        )}
                      >
                        {slider.label}
                      </span>
                      <Slider
                        label={`${overlay.label} ${slider.label.toLowerCase()}`}
                        value={overlays[slider.field]}
                        min={slider.min}
                        max={slider.max}
                        step={slider.step}
                        disabled={!overlays[overlay.id]}
                        format={slider.format}
                        onChange={(value) => onOverlaysChange({ [slider.field]: value })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {/*
              Say what the data is worth, where the switch is.
              Ten-metre posts will show a ridge and a fall line; they will not
              show the two-metre mound behind a green, and a designer who reads
              a contour as a survey line is being misled by our own UI.
            */}
            {/* The caveat belongs to the global data, so it goes away once a
                survey supersedes it — repeating "around 10m" under 1m LiDAR
                would be the panel contradicting itself. */}
            {survey.status !== 'ready' && (
              <p className="px-3 pt-1.5 text-2xs leading-4 text-text-muted">
                Public elevation data, around 10m detail. Good for reading slope, not for spot
                heights.
              </p>
            )}
          </div>

          <SurveySection
            state={survey.state}
            units={units}
            onImport={survey.onImport}
            onRemove={survey.onRemove}
            onDismissError={survey.onDismissError}
          />
        </Popover>
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
