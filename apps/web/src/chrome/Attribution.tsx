import { ChromeLayer } from '@hyzerlines/design';
import { hasOverlays, type Overlays } from '@hyzerlines/core';

import { basemapById, effectiveBasemap, usingMapbox } from '../map/basemaps';
import { TERRAIN_ATTRIBUTION } from '../map/terrain';
import { MapboxLogo } from './MapboxLogo';

export const SOURCE_URL = 'https://github.com/adam-dutton/hyzerlines';

/** How far the credit sits from the visible map's bottom-right corner. */
const ATTRIBUTION_INSET = 5;

/**
 * Provider credit and the source link. Everything here is an obligation.
 *
 * This is what is left of the status bar. The scale bar, the coordinate
 * readout and the units toggle went — the first two are reference numbers you
 * glance at once an hour and they cost a permanent card in the corner, and the
 * units toggle moved into the course menu where the rest of the preferences
 * are. What could not go is below.
 *
 * **Attribution is not optional.** Every basemap in `basemaps.ts` carries the
 * exact string its provider requires, and Esri and OpenStreetMap both require
 * it to be visible on the map rather than buried in an about box.
 *
 * It composes, because the map does. Turning on hillshade adds a second
 * provider's data to what is on screen, so it adds that provider's credit —
 * and turning it off takes the credit away again, because crediting a source
 * that is not being drawn is its own kind of wrong.
 *
 * **The source link is AGPL section 13 compliance**, not a footer. Anyone
 * interacting with this over a network must be offered the source, so this
 * link is load-bearing in the legal sense. Do not remove it.
 *
 * Not a `Panel` — it is a credit, not a control, and a card would make it look
 * like something to interact with. It does get its own faint backing, though:
 * this is text that has to stay *legible* over whatever imagery is beneath it,
 * and muted grey on a light theme over dark tree canopy is not. The obligation
 * is to display the credit, which means displaying it readably.
 */
export function Attribution({
  basemapId,
  overlays,
  hasSurvey,
  dark,
}: {
  basemapId: string;
  overlays: Overlays;
  /** An imported survey is supplying the elevation instead of the global one. */
  hasSurvey: boolean;
  /**
   * Whether the dark twin of the basemap is the one being drawn.
   *
   * It has its own provider and therefore its own credit. Printing the light
   * map's contributors under a dark map is not a smaller obligation met — it is
   * a specific false statement about where the tiles came from.
   */
  dark: boolean;
}) {
  const basemap = effectiveBasemap(basemapById(basemapId), dark);

  /*
   * Both terrain overlays read one elevation source, so they credit it once —
   * and only while something is actually reading it.
   *
   * An imported survey replaces that source, so the AWS credit goes with it.
   * The survey's own provenance is not ours to state: it is a file the designer
   * supplied, from a publisher we never spoke to, and inventing a credit line
   * for it would be worse than the honest silence. The layers panel names the
   * file and its projection, which is the accurate thing we can say.
   */
  const elevationCredit = hasOverlays(overlays) && !hasSurvey ? TERRAIN_ATTRIBUTION : null;

  const credits = [basemap.attribution, elevationCredit].filter(Boolean).join(' &middot; ');

  return (
    <>
      {/*
        The wordmark, bottom left, and only while Mapbox is drawing.

        Guarded rather than always rendered, for the reason every credit in this
        app is: putting Mapbox's mark over MapTiler's tiles would be a specific
        false claim about where the map came from, and a required attribution
        shown against the wrong provider is worse than none.
      */}
      {usingMapbox && <MapboxLogo />}

      {/*
        The text, bottom right, 5px in.

        Both insets are measured from the *chrome* rather than the viewport —
        `--hz-rail` on one side and `--hz-drawer` on the other. The rail and the
        drawer run the full height of the window, so a credit 5px from the
        window's corner would sit underneath one of them, and an obligation to
        *display* a credit is not met by drawing it behind a panel. Measured
        this way it stays in the visible map at every width, and slides with the
        panels because they publish their widths as custom properties.
      */}
      <ChromeLayer
        className="max-w-lg"
        style={{
          right: `calc(var(--hz-drawer, 0px) + ${ATTRIBUTION_INSET}px)`,
          bottom: ATTRIBUTION_INSET,
        }}
      >
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-x-2 rounded bg-surface-overlay/75 px-1.5 py-0.5 text-2xs leading-4 text-text-secondary backdrop-blur-sm">
          {/* Attribution strings are compile-time constants in basemaps.ts and
              terrain.ts, never user or network input, and providers require the
              embedded links. */}
          <span
            className="[&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-text-secondary"
            dangerouslySetInnerHTML={{ __html: credits }}
          />
          {/* The separator rides with the link so it never dangles at a wrap. */}
          <span className="whitespace-nowrap">
            <span aria-hidden="true" className="mr-2">
              &middot;
            </span>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Source
            </a>
          </span>
        </div>
      </ChromeLayer>
    </>
  );
}
