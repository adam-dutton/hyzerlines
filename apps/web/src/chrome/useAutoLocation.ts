import { useEffect, useRef } from 'react';

import { useMap } from '../map/MapContext';

/**
 * Fill in a course's location once, from wherever the map is pointed.
 *
 * The document already knows exactly where the course is — `view.center` is
 * two numbers accurate to a metre. What it does not know is what that place is
 * *called*, and a name is the only form of "where" that is any use to a parks
 * department, a landowner or yourself in six months.
 *
 * ## Once, and only into an empty field
 *
 * The camera moves constantly and almost none of those moves mean the course
 * has moved. So this fires on one condition — the field is empty and there is
 * something drawn to be located — and then never again. Anything the designer
 * types afterwards stands, including clearing it back to nothing: `attempted`
 * is what makes this a seed rather than a value that keeps growing back.
 *
 * Reverse geocoding via Photon (Komoot), the same keyless, CORS-enabled,
 * explicitly public service `LocationSearch` uses for the forward direction.
 * A failure is silent: this is a convenience, and an error toast about a
 * field nobody asked to fill in would be worse than an empty field.
 */
export function useAutoLocation({
  location,
  hasFeatures,
  onResolved,
}: {
  location: string;
  /** Nothing drawn means nothing to locate — an empty course is not anywhere. */
  hasFeatures: boolean;
  onResolved: (location: string) => void;
}): void {
  const { map } = useMap();
  const attempted = useRef(false);
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;

  useEffect(() => {
    if (attempted.current || !map || !hasFeatures || location.trim() !== '') return;
    attempted.current = true;

    const { lng, lat } = map.getCenter();
    const controller = new AbortController();

    const url = new URL('https://photon.komoot.io/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('limit', '1');

    void fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { features?: { properties?: Record<string, string> }[] } | null) => {
        const p = data?.features?.[0]?.properties;
        if (!p) return;

        /*
         * A place, then the administrative names around it.
         *
         * `name` is a park or a named site when there is one, which is the
         * best possible answer here; `street` is the fallback for a course on
         * unnamed ground. City and state locate it for anyone who does not
         * know the first part.
         */
        const parts = [p['name'] ?? p['street'], p['city'] ?? p['county'], p['state']];
        const resolved = [...new Set(parts.filter(Boolean))].join(', ');
        if (resolved) onResolvedRef.current(resolved);
      })
      .catch(() => {
        // Offline, blocked, rate-limited. The field stays empty and typeable.
      });

    return () => controller.abort();
  }, [map, hasFeatures, location]);
}
