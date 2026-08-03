import { useEffect, useRef, useState } from 'react';
import { useMap } from '../map/MapContext';

interface Place {
  label: string;
  detail: string;
  center: [number, number];
  /** Present for areas; lets us frame the whole property rather than a point. */
  bbox?: [number, number, number, number];
}

/** "44.9778, -93.2650" and friends. Designers routinely have raw GPS coords. */
function parseCoordinates(input: string): Place | null {
  const match = input.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return {
    label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    detail: 'Coordinates',
    center: [lng, lat],
  };
}

/**
 * Geocoding via Photon (Komoot). Keyless, CORS-enabled and explicitly public,
 * which keeps the "open the URL and start working" promise intact. If it is
 * unreachable the coordinate path still works, so search never hard-blocks.
 */
async function geocode(query: string, signal: AbortSignal): Promise<Place[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '6');

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);

  const data = (await res.json()) as {
    features: Array<{
      geometry: { coordinates: [number, number] };
      properties: Record<string, string | number | undefined> & { extent?: number[] };
    }>;
  };

  return data.features.map((f) => {
    const p = f.properties;
    const detail = [p['city'], p['state'], p['country']].filter(Boolean).join(', ');
    const extent = p.extent;
    const place: Place = {
      label: String(p['name'] ?? p['street'] ?? 'Unnamed place'),
      detail: detail || String(p['osm_value'] ?? ''),
      center: f.geometry.coordinates,
    };
    // Photon's extent is [minLon, maxLat, maxLon, minLat] — not the usual order.
    if (extent?.length === 4) {
      const [minLon, maxLat, maxLon, minLat] = extent as [number, number, number, number];
      place.bbox = [minLon, minLat, maxLon, maxLat];
    }
    return place;
  });
}

/**
 * The first-run surface. This is the whole onboarding: find your land, and the
 * map flies there. No account, no project setup, no modal chain.
 */
export function LocationSearch({ onDismiss }: { onDismiss: () => void }) {
  const { map } = useMap();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }

    const coords = parseCoordinates(trimmed);
    if (coords) {
      setResults([coords]);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    // 250ms: long enough to skip most intermediate keystrokes, short enough that
    // results feel attached to typing rather than arriving after a pause.
    const timer = setTimeout(() => {
      setStatus('loading');
      geocode(trimmed, controller.signal)
        .then((places) => {
          setResults(places);
          setStatus('idle');
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setResults([]);
          setStatus('error');
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function goTo(place: Place) {
    if (!map) return;
    if (place.bbox) {
      map.fitBounds(place.bbox, { padding: 80, maxZoom: 17, duration: 1400 });
    } else {
      // 16.5 frames roughly a property-sized parcel — close enough to read tree
      // lines, wide enough to see what you're working with.
      map.flyTo({ center: place.center, zoom: 16.5, duration: 1400 });
    }
    onDismiss();
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center p-4"
      style={{ zIndex: 'var(--hz-z-chrome)' }}
    >
      <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-border-default bg-surface-overlay p-6 shadow-xl backdrop-blur-xl">
        <h1 className="text-2xl font-semibold text-text-primary">Design a disc golf course</h1>
        <p className="mt-1.5 text-base text-text-secondary">
          Find the land you&rsquo;re working with. Search an address, a park, or paste
          coordinates.
        </p>

        <div className="relative mt-5">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) goTo(results[0]);
            }}
            placeholder="Kaposia Park, South St Paul"
            aria-label="Search for a location"
            className="w-full rounded-lg border border-border-default bg-surface-inset px-3.5 py-2.5 text-base text-text-primary placeholder:text-text-muted focus:border-border-accent focus:outline-none focus:ring-2 focus:ring-focus-ring/40"
          />
          {status === 'loading' && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
              Searching&hellip;
            </span>
          )}
        </div>

        {status === 'error' && (
          <p className="mt-3 text-xs text-status-warning">
            Search is unavailable right now. You can still paste coordinates (&ldquo;44.9778,
            -93.2650&rdquo;) or pan the map by hand.
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border-subtle">
            {results.map((place, i) => (
              <li key={`${place.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => goTo(place)}
                  className="flex w-full flex-col items-start gap-0.5 border-b border-border-subtle px-3.5 py-2.5 text-left last:border-b-0 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none"
                >
                  <span className="text-sm text-text-primary">{place.label}</span>
                  {place.detail && (
                    <span className="text-xs text-text-muted">{place.detail}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 text-xs text-text-muted underline-offset-4 hover:text-text-secondary hover:underline focus:outline-none focus:ring-2 focus:ring-focus-ring/40"
        >
          Skip &mdash; I&rsquo;ll find it on the map
        </button>
      </div>
    </div>
  );
}
