import { createContext, useContext } from 'react';
import type maplibregl from 'maplibre-gl';

export interface MapViewState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

interface MapContextValue {
  /** Null until the map finishes constructing. Consumers must handle that. */
  map: maplibregl.Map | null;
  view: MapViewState;
}

export const MapContext = createContext<MapContextValue | null>(null);

export function useMap(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMap must be used inside <MapCanvas>');
  return ctx;
}
