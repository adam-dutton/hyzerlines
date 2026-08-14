import { IconButton, Slider, Switch, cn } from '@hyzerlines/design';
import {
  KIND_DEFINITIONS,
  SWITCHABLE_KINDS,
  TARGET_CIRCLES,
  type Display,
  type OverlayAmount,
  type Overlays,
  type OverlaySwitch,
} from '@hyzerlines/core';

import { basemaps, basemapById, effectiveBasemap, resolveBasemapId } from '../map/basemaps';
import { OVERLAY_DEFINITIONS } from '../map/terrain';
import { SurveySection } from './SurveySection';
import type { SurveyState } from '../survey/useSurvey';
import type { UnitSystem } from '../units';
import { ToggleRow } from './propertyRow';
import { LAYERS_WIDTH, SLIDE_EASE, SLIDE_MS, TOP_BAR_HEIGHT } from './layout';

/**
 * Everything the map is drawing, in one drawer.
 *
 * It was a popover hanging off a button in the bottom corner, which was the
 * right size for what it held when it held three basemaps. It now holds four
 * groups — the imagery, the terrain overlays, the course's own drawing aids and
 * an imported survey — and a popover is the wrong container for all of them at
 * once: it is a transient surface, and this is a place you *work*. Flip
 * hillshade, look at the map, flip contours, look again.
 *
 * So it is a drawer down the right edge, opened from a button that stays put and
 * lights up while it is open. It slides over the map rather than displacing it,
 * like every other piece of chrome — see `layout.ts`.
 *
 * ## The drawing aids moved in here
 *
 * Fairways, corridors and the putting circles used to be switches inside the
 * course's Settings, next to units and elevation smoothing. That grouped them by
 * *where the value is stored* — they travel in the document, and units does not
 * — which is a fact about the file format and not a fact anybody needs while
 * designing. What they have in common with the terrain overlays is the only
 * thing that matters when you reach for one: they decide what is on the map.
 *
 * They keep travelling with the document. Only the control moved.
 */

/**
 * What each overlay can be adjusted by.
 *
 * Keyed by the switch it sits under, so a control can only exist for something
 * that can be turned on — and adding a field to `Overlays` without deciding
 * where it belongs is a compile error rather than a setting only a file can
 * reach.
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

/**
 * A drawing of what each basemap *is*, rather than a swatch of it.
 *
 * A thumbnail would be better and is not available: the tiles are fetched per
 * viewport, so a preview would either be a stale image of somewhere else or a
 * third set of tile requests for a picture the size of a postage stamp. A line
 * drawing says "imagery", "contours" or "streets" at 26px, which is the whole
 * question being asked.
 */
function BasemapIcon({ id }: { id: string }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    'aria-hidden': true,
  } as const;

  if (id === 'topo') {
    return (
      <svg {...common} strokeLinecap="round">
        <path d="M2.5 16.5 C 7 10.5, 17 10.5, 21.5 16.5" />
        <path d="M5.5 18.8 C 8.6 14.6, 15.4 14.6, 18.5 18.8" />
        <path d="M9 20.6 C 10.4 18.9, 13.6 18.9, 15 20.6" />
        <path d="M12 6 L12 11" />
        <circle cx="12" cy="5" r="1.4" />
      </svg>
    );
  }
  if (id === 'street') {
    return (
      <svg {...common} strokeLinecap="round">
        <path d="M4 20.5 L9 3.5" />
        <path d="M20 20.5 L15 3.5" />
        <path d="M12 4 V7" />
        <path d="M12 10.5 V13.5" />
        <path d="M12 17 V20" />
      </svg>
    );
  }
  return (
    <svg {...common} strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 15.5 L8.5 10.5 L13 15" />
      <path d="M11 17.5 L15.5 13 L20.5 18" />
      <circle cx="16.4" cy="9" r="1.7" />
    </svg>
  );
}

function GroupTitle({ children }: { children: string }) {
  return (
    <p className="pb-2 pt-1 text-2xs font-semibold uppercase tracking-wider text-text-muted">
      {children}
    </p>
  );
}

export function LayersDrawer({
  open,
  onClose,
  basemapId,
  overlays,
  display,
  units,
  dark,
  survey,
  onBasemapChange,
  onBasemapDarkChange,
  onOverlaysChange,
  onDisplayChange,
}: {
  open: boolean;
  onClose: () => void;
  basemapId: string;
  overlays: Overlays;
  display: Display;
  units: UnitSystem;
  /**
   * Whether the basemap draws its dark variant.
   *
   * The document's `basemapDark`, not the interface theme. See the field's note
   * in the schema for why the two were separated.
   */
  dark: boolean;
  survey: {
    state: SurveyState;
    status: SurveyState['status'];
    onImport: (file: File) => void;
    onRemove: (name?: string) => void;
    onDismissError: () => void;
  };
  onBasemapChange: (id: string) => void;
  onBasemapDarkChange: (dark: boolean) => void;
  onOverlaysChange: (changes: Partial<Overlays>) => void;
  onDisplayChange: (changes: Partial<Display>) => void;
}) {
  return (
    <aside
      aria-label="Layers"
      aria-hidden={!open}
      className="absolute bottom-0 right-0 flex flex-col border-l border-border-subtle bg-surface-raised shadow-float"
      style={{
        top: TOP_BAR_HEIGHT,
        width: LAYERS_WIDTH,
        transform: `translateX(${open ? 0 : LAYERS_WIDTH}px)`,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: `transform ${SLIDE_MS}ms ${SLIDE_EASE}, opacity ${SLIDE_MS}ms ${SLIDE_EASE}`,
        zIndex: 'var(--hz-z-chrome)',
      }}
    >
      <header className="flex h-11 shrink-0 items-center pl-3.5 pr-1.5">
        <h2 className="text-xs font-semibold text-text-primary">Layers</h2>
        <IconButton
          label="Close"
          size="sm"
          tooltipSide="left"
          className="ml-auto"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="m2.5 2.5 7 7m0-7-7 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-6">
        {/*
          A radiogroup rather than a listbox: three named alternatives with one
          always chosen is exactly what radio semantics describe, and it gets
          "Satellite, selected, 1 of 3" announced for free.
        */}
        <div role="radiogroup" aria-label="Basemap" className="grid grid-cols-3 gap-1.5">
          {basemaps.map((basemap) => {
            // Resolved, never `===`. A course saved under an older
            // provider-named id draws correctly but would light up no radio at
            // all under raw string equality. See `resolveBasemapId`.
            const active = basemap.id === resolveBasemapId(basemapId);
            return (
              <button
                key={basemap.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onBasemapChange(basemap.id)}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1.5 rounded-lg',
                  'transition-colors duration-fast',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
                  active
                    ? 'bg-accent-soft text-text-accent ring-1 ring-inset ring-border-accent'
                    : 'bg-surface-tile text-text-secondary hover:bg-surface-hover',
                )}
              >
                <BasemapIcon id={basemap.id} />
                <span
                  className={cn('text-2xs', active ? 'text-text-primary' : 'text-text-muted')}
                >
                  {basemap.label}
                </span>
              </button>
            );
          })}
        </div>
        {/*
          Light or dark, for the basemap alone.

          Deliberately not the application theme. Those were one control
          briefly, which conflated how bright the panels are with how bright the
          ground under the drawing is — and they are not the same question. A
          designer working at night may still want a light topographic sheet
          because that is what their corridors read best against.

          Absent for imagery, and that is not an omission: a photograph has no
          theme, and the "dark" variant of an aerial is night imagery, which
          throws away the tree lines the aerial is on screen for.
        */}
        {basemapById(basemapId).dark ? (
          <div className="flex items-center justify-between gap-3 pt-2.5">
            <span className="text-xs text-text-secondary">Dark basemap</span>
            <Switch label="Dark basemap" checked={dark} onChange={onBasemapDarkChange} />
          </div>
        ) : null}

        {/*
          The source actually being drawn, which may be the dark twin rather
          than the map it stands in for. Naming the light one under dark tiles
          would be the drawer describing something else.
        */}
        <p className="pt-2 text-2xs text-text-muted">
          {effectiveBasemap(basemapById(basemapId), dark).hint}
        </p>

        <div className="mt-4 border-t border-border-subtle pt-2">
          <GroupTitle>Course feature visibility</GroupTitle>
          {/*
            The course's own drawing aids. They travel in the document, unlike
            everything above them — see the note at the top of this file for why
            that stopped being the organising principle.
          */}
          <ToggleRow
            label="Fairways"
            checked={display.fairways}
            onChange={(fairways) => onDisplayChange({ fairways })}
          />
          <ToggleRow
            label="Lines"
            indent
            checked={display.fairwayLines}
            disabled={!display.fairways}
            onChange={(fairwayLines) => onDisplayChange({ fairwayLines })}
          />
          <ToggleRow
            label="Corridors"
            indent
            checked={display.fairwayAreas}
            disabled={!display.fairways}
            onChange={(fairwayAreas) => onDisplayChange({ fairwayAreas })}
          />
          <ToggleRow
            label="Putting circles"
            checked={display.circles}
            onChange={(circles) => onDisplayChange({ circles })}
          />
          {/*
            Named and ordered from TARGET_CIRCLES, so a ring the app draws can
            never be a ring this drawer has no switch for. Outermost first,
            which is how they are read on the ground.
          */}
          {[...TARGET_CIRCLES].reverse().map((circle) => (
            <ToggleRow
              key={circle.id}
              label={circle.label}
              indent
              checked={display[circle.id]}
              disabled={!display.circles}
              onChange={(on) => onDisplayChange({ [circle.id]: on })}
            />
          ))}

          {/*
            Everything else that can be drawn, one row each.

            Listed from `KIND_DEFINITIONS` rather than written out here, so a
            kind added to the model arrives in this panel with its own switch
            instead of becoming a thing the map draws and nobody can turn off.
            The order is the model's, which groups the playing surface before
            the regulated areas before the site notes — the order they are drawn
            in and the order they are thought about.

            Fairways are absent because they are already above: they are the one
            kind with a master and two halves, and a fourth switch of equal
            standing would be two controls fighting over one geometry.
          */}
          {SWITCHABLE_KINDS.map((kind) => (
            <ToggleRow
              key={kind}
              label={KIND_DEFINITIONS[kind].label}
              checked={display.kinds[kind]}
              onChange={(on) =>
                onDisplayChange({ kinds: { ...display.kinds, [kind]: on } })
              }
            />
          ))}
        </div>

        <div className="mt-4 border-t border-border-subtle pt-2">
          <GroupTitle>Terrain</GroupTitle>
          {OVERLAY_DEFINITIONS.map((overlay) => (
            <div key={overlay.id}>
              <div className="flex items-center justify-between gap-3 py-1">
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
                when it is off — disabled rather than hidden, so the group keeps
                its shape and you can see what turning it back on would restore.
              */}
              <div className="pl-3">
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
            Say what the data is worth, where the switch is. Ten-metre posts
            will show a ridge and a fall line; they will not show the two-metre
            mound behind a green, and a designer who reads a contour as a survey
            line is being misled by our own UI.

            The caveat belongs to the global data, so it goes away once a survey
            supersedes it — repeating "around 10m" under 1m LiDAR would be the
            drawer contradicting itself.
          */}
          {survey.status !== 'ready' && (
            <p className="pt-1.5 text-2xs leading-4 text-text-muted">
              Public elevation data, around 10m detail. Good for reading slope, not for spot
              heights.
            </p>
          )}
        </div>

        <div className="-mx-3.5 mt-4">
          <SurveySection
            state={survey.state}
            units={units}
            onImport={survey.onImport}
            onRemove={survey.onRemove}
            onDismissError={survey.onDismissError}
          />
        </div>
      </div>
    </aside>
  );
}
