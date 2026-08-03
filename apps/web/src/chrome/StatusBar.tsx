import { useMemo } from 'react';
import { useMap } from '../map/MapContext';
import { basemapById } from '../map/basemaps';
import { formatDistance, type UnitSystem } from '../units';

const SOURCE_URL = 'https://github.com/adam-dutton/hyzerlines';

/** Web Mercator ground resolution at a given latitude and zoom. */
function metersPerPixel(latitude: number, zoom: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
}

/**
 * Pick a scale bar length that lands on a readable round number.
 *
 * A bar labelled "137 ft" is useless for estimating; the bar length adapts to
 * the number rather than the other way round.
 */
function scaleBar(mpp: number, units: UnitSystem, maxPx: number) {
  // Both lists must reach world zoom. If every candidate fits within maxPx the
  // largest one wins, so a list that stops too early produces a sub-pixel bar.
  const niceMeters = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000,
    200_000, 500_000, 1_000_000, 2_000_000,
  ];
  // 10/25/50 ft steps mirror how tee and fairway distances are actually discussed;
  // above a mile the list switches to round mile counts.
  const niceFeet = [
    10, 25, 50, 100, 200, 300, 500, 1000, 2000, 5280, 10_560, 26_400, 52_800, 105_600, 264_000,
    528_000, 1_056_000, 2_640_000, 5_280_000,
  ];

  const candidates = units === 'metric' ? niceMeters : niceFeet;
  const toMetersFn = units === 'metric' ? (v: number) => v : (v: number) => v / 3.280839895;

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (toMetersFn(candidate) / mpp <= maxPx) best = candidate;
    else break;
  }

  const meters = toMetersFn(best);
  return { widthPx: Math.round(meters / mpp), label: formatDistance(meters, units) };
}

export function StatusBar({
  basemapId,
  units,
  onUnitsChange,
}: {
  basemapId: string;
  units: UnitSystem;
  onUnitsChange: (u: UnitSystem) => void;
}) {
  const { view } = useMap();
  const basemap = basemapById(basemapId);

  const bar = useMemo(
    () => scaleBar(metersPerPixel(view.center[1], view.zoom), units, 120),
    [view.center, view.zoom, units],
  );

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-2"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border-default bg-surface-overlay px-2.5 py-1.5 shadow-float backdrop-blur-md">
        {/* Scale bar. Ticked at both ends so the extent is unambiguous. */}
        <div className="flex items-center gap-2">
          <div className="relative h-2" style={{ width: `${bar.widthPx}px` }}>
            <span className="absolute inset-x-0 bottom-0 h-px bg-text-secondary" />
            <span className="absolute bottom-0 left-0 h-2 w-px bg-text-secondary" />
            <span className="absolute bottom-0 right-0 h-2 w-px bg-text-secondary" />
          </div>
          <span className="font-mono text-2xs tabular-nums text-text-secondary">
            {bar.label}
          </span>
        </div>

        <span className="h-4 w-px bg-border-subtle" aria-hidden="true" />

        {/* Units. A toggle rather than a setting buried in preferences — it gets
            flipped often enough (US clubs quoting feet, everyone else meters). */}
        <button
          type="button"
          onClick={() => onUnitsChange(units === 'imperial' ? 'metric' : 'imperial')}
          title="Toggle units"
          className="rounded px-1.5 py-0.5 font-mono text-2xs text-text-muted transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          {units === 'imperial' ? 'ft' : 'm'}
        </button>

        <span className="h-4 w-px bg-border-subtle" aria-hidden="true" />

        <span className="font-mono text-2xs tabular-nums text-text-muted">
          {view.center[1].toFixed(5)}, {view.center[0].toFixed(5)}
        </span>
      </div>

      <div className="pointer-events-auto flex max-w-md flex-wrap items-center gap-x-2 text-2xs leading-4 text-text-muted">
        {/* Attribution strings are compile-time constants in basemaps.ts, never
            user or network input, and providers require the embedded links. */}
        <span
          className="[&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-text-secondary"
          dangerouslySetInnerHTML={{ __html: basemap.attribution }}
        />
        {/* AGPL section 13: users interacting with this over a network must be
            offered the source. This link is license compliance, not a footer.
            The separator rides with the link so it never dangles at a wrap. */}
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
    </div>
  );
}
