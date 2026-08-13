import { useEffect, useState } from 'react';
import type maplibregl from 'maplibre-gl';

/**
 * The map's zoom, rounded, for geometry that is measured on the screen.
 *
 * Almost nothing needs this. Widths, sizes and offsets are all either screen
 * pixels — which MapLibre keeps constant for us — or metres on the ground,
 * which it projects for us. The exception is geometry whose *positions* come
 * from a screen distance: the lettering over a regulated area is spaced so many
 * pixels apart, and where those points land therefore changes with the zoom.
 *
 * ## Rounded, because the alternative is recomputing on every frame
 *
 * MapLibre reports zoom continuously through a pinch or a scroll — dozens of
 * distinct values a second, each of which would rebuild every derived shape on
 * the map. Rounding to a quarter of a level makes it a handful of values across
 * the whole useful range, so the recompute happens a few times per gesture
 * instead of a few hundred. The cost is that spacing can be up to about a fifth
 * out mid-gesture, which is not a difference anybody can see in a pattern of
 * repeated letters, and it is exact again the moment the movement stops on a
 * step.
 */
const STEP = 4;

const quantise = (zoom: number) => Math.round(zoom * STEP) / STEP;

export function useMapZoom(map: maplibregl.Map | null): number {
  const [zoom, setZoom] = useState(() => (map ? quantise(map.getZoom()) : 16));

  useEffect(() => {
    if (!map) return;

    const update = () => {
      // Set through the updater, so an unchanged step is a no-op rather than a
      // render: React bails out when the next state is identical.
      setZoom(quantise(map.getZoom()));
    };
    update();

    map.on('zoom', update);
    return () => {
      map.off('zoom', update);
    };
  }, [map]);

  return zoom;
}
