import { ChromeLayer } from '@hyzerlines/design';
import { hasOverlays, type Overlays } from '@hyzerlines/core';

import { basemapById } from '../map/basemaps';
import { TERRAIN_ATTRIBUTION } from '../map/terrain';

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
}: {
  basemapId: string;
  overlays: Overlays;
}) {
  const basemap = basemapById(basemapId);

  // Both terrain overlays read one elevation source, so they credit it once.
  const credits = [basemap.attribution, hasOverlays(overlays) ? TERRAIN_ATTRIBUTION : null]
    .filter(Boolean)
    .join(' &middot; ');

  return (
    <ChromeLayer className="bottom-3 left-4 max-w-sm">
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
