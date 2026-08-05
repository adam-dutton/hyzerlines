import { useEffect } from 'react';
import type maplibregl from 'maplibre-gl';

/**
 * Ctrl+drag — or right-click-drag — orbits and tilts the camera.
 *
 * MapLibre's own `dragRotate` is switched off in favour of this. Its default
 * gesture computes bearing from the ANGLE between the pointer and the map's
 * centre once a drag starts more than 100px from it — a "turn a dial"
 * gesture — and falls back to a horizontal pixel delta close to centre that
 * still flips sign depending on which half of the screen the cursor is on.
 * Both mean the same leftward drag can rotate opposite ways depending on
 * where the course happens to sit on screen, which reads as broken rather
 * than as a control.
 *
 * Bearing here is bound to horizontal pixel movement alone, so left is always
 * the same direction regardless of where the drag happens: left orbits
 * clockwise, right counter-clockwise. Pitch keeps the vertical-drag behaviour
 * users already expect from every 3D map.
 */
const DEGREES_PER_PIXEL = 0.8;
const PITCH_DEGREES_PER_PIXEL = 0.5;

interface OrbitStart {
  x: number;
  y: number;
  bearing: number;
  pitch: number;
}

const startsOrbit = (e: MouseEvent): boolean => (e.button === 0 && e.ctrlKey) || e.button === 2;

export function useOrbit(map: maplibregl.Map | null): void {
  useEffect(() => {
    if (!map) return;
    const canvas = map.getCanvas();
    let start: OrbitStart | null = null;

    const onMove = (e: MouseEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      map.jumpTo({
        // Left (negative dx) increases bearing — clockwise, as a compass rose
        // turns — regardless of where on screen the drag started.
        bearing: start.bearing - dx * DEGREES_PER_PIXEL,
        pitch: start.pitch - dy * PITCH_DEGREES_PER_PIXEL,
      });
    };

    const stop = () => {
      start = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
    };

    const onDown = (e: MouseEvent) => {
      if (!startsOrbit(e)) return;
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY, bearing: map.getBearing(), pitch: map.getPitch() };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', stop);
    };

    // The browser's own menu must not appear over what is now a drag gesture.
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('contextmenu', onContextMenu);
      stop();
    };
  }, [map]);
}
