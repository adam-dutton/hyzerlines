import { useEffect, useState } from 'react';
import { Panel } from '@hyzerlines/design';
import type { Feature } from '@hyzerlines/core';

import { useMap } from '../map/MapContext';
import { courseIsAdrift, frameFeatures } from '../map/frame';

/**
 * A way back, shown only when there is something to come back from.
 *
 * Losing the course is easy and the recovery was not obvious: `Zoom to fit` is
 * a keyboard shortcut and a menu item, neither of which is where you look when
 * the screen has gone blank green. This appears under the tool rail at exactly
 * the moment it is useful and is absent the rest of the time, which is the only
 * reason it can afford to sit in the middle of the map.
 *
 * It animates rather than jumping. A jump from a county away leaves you
 * wondering whether the map moved or the course did; a flight shows you which
 * direction you had wandered, which is worth the half second.
 */
export function RecenterButton({ features }: { features: readonly Feature[] }) {
  const { map } = useMap();
  const [adrift, setAdrift] = useState(false);

  /*
   * Recomputed on every camera frame rather than on a debounce.
   *
   * The check is four `project` calls and some arithmetic — cheaper than the
   * render it would trigger if it changed, and it only changes at the moment
   * the course crosses the edge. Debouncing would leave the button lagging the
   * gesture that made it necessary.
   */
  useEffect(() => {
    if (!map) return;
    const update = () => setAdrift(courseIsAdrift(map, features));

    update();
    map.on('move', update);
    map.on('zoom', update);
    return () => {
      map.off('move', update);
      map.off('zoom', update);
    };
  }, [map, features]);

  if (!adrift) return null;

  /*
   * No position of its own.
   *
   * It used to sit at a fixed `top-20`, chosen to clear a tool rail one panel
   * tall. The rail then grew a second panel and landed on top of it — the
   * button was still there, still visible, and no longer clickable. Two
   * components agreeing about a number is not an agreement, it is a
   * coincidence with a deadline. It is handed to `MapControls` now and shares
   * that cluster's line, so the clearance is structural.
   *
   * It also frames the course itself rather than taking a callback for it. The
   * map is already here — the adrift check above needs it — and the features are
   * the prop, so the only thing a callback added was a second place for the two
   * to be passed to.
   */
  return (
    <Panel padding="none" className="hz-reveal pointer-events-auto">
      <button
        type="button"
        onClick={() => {
          if (map) frameFeatures(map, features, { duration: 400 });
        }}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-text-primary transition-colors duration-fast hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <svg width="13" height="13" viewBox="0 0 15 15" aria-hidden="true">
          <circle
            cx="7.5"
            cy="7.5"
            r="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle cx="7.5" cy="7.5" r="1.4" fill="currentColor" />
          <path
            d="M7.5 1v1.6M7.5 12.4V14M14 7.5h-1.6M2.6 7.5H1"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        Recenter on course
      </button>
    </Panel>
  );
}
