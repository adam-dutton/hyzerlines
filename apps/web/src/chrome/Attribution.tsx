import { ChromeLayer } from '@hyzerlines/design';
import { hasOverlays, type Overlays } from '@hyzerlines/core';

import { basemapById } from '../map/basemaps';
import { TERRAIN_ATTRIBUTION } from '../map/terrain';
import { COLUMN, READOUT_BOTTOM } from './layout';

export const SOURCE_URL = 'https://github.com/adam-dutton/hyzerlines';

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
}: {
  basemapId: string;
  overlays: Overlays;
  /** An imported survey is supplying the elevation instead of the global one. */
  hasSurvey: boolean;
}) {
  const basemap = basemapById(basemapId);

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
    /*
     * Bottom left of the free channel, not of the viewport.
     *
     * The panel columns run the full height now, so `left-4` put this underneath
     * the left panel — and an obligation to *display* a credit is not met by
     * drawing it behind a card. Measuring from `COLUMN` keeps it in the gap
     * between the columns, on the same line as the zoom cluster at the other end
     * and below the tool bar, so none of the three can reach the others at any
     * viewport width.
     */
    /*
     * Wide enough for two lines, not three.
     *
     * `max-w-sm` wrapped the Esri credit onto a third line, which grew this box
     * upwards into the tool bar's line 56px above it. The channel is much wider
     * than the credit needs, so the cap is a wrapping preference rather than a
     * fit constraint — and the readout line has room to spend.
     */
    <ChromeLayer className="max-w-lg" style={{ left: COLUMN, bottom: READOUT_BOTTOM }}>
      <div className="pointer-events-auto flex flex-wrap items-center gap-x-2 rounded bg-surface-overlay/75 px-1.5 py-0.5 text-2xs leading-4 text-text-secondary backdrop-blur-sm">
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
  );
}
