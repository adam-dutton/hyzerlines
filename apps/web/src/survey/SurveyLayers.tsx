import { useEffect } from 'react';
import type { Overlays } from '@hyzerlines/core';

import { useMap } from '../map/MapContext';
import {
  applySurveyLayers,
  applySurveyStyling,
  applySurveyVisibility,
  removeSurveyLayers,
} from '../map/surveyLayers';
import type { SurveyState } from './useSurvey';
import type { UnitSystem } from '../units';

/**
 * The survey's layers, installed and removed as it comes and goes.
 *
 * Renders nothing. It exists because `useSurvey` deliberately does not touch
 * the map — see the note there — and because these effects have to run inside
 * `MapCanvas`, which is what provides `MapContext`.
 *
 * Three effects, and the split is load-bearing: installing tears down and
 * rebuilds the contour source, which throws away every isoline already
 * computed. Flipping a switch must not do that, so visibility is its own effect
 * and appearance is another, and installation depends on neither.
 *
 * Two settings are exceptions that have to reinstall. Softness sets how deep a
 * DEM the shading reads, and a source's `maxzoom` is fixed at construction.
 * Smoothing averages the elevation grid inside the contour generator's decoder,
 * and the generator caches decoded tiles by url — so the manager it belongs to
 * has to be rebuilt or the old, differently-smoothed grids would be retraced.
 */
export function SurveyLayers({
  state,
  overlays,
  units,
}: {
  state: SurveyState;
  overlays: Overlays;
  units: UnitSystem;
}) {
  const { map } = useMap();
  const ready = state.status === 'ready' ? state.survey : null;

  useEffect(() => {
    if (!map) return;
    if (!ready) {
      removeSurveyLayers(map);
      return;
    }
    applySurveyLayers(map, ready, overlays, units);
    return () => {
      removeSurveyLayers(map);
    };
    /*
     * `overlays` is read on install but is not a dependency: it only decides
     * the layers' starting visibility, and the effect below owns it after that.
     * Listing it here would rebuild the contour source on every switch.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, units, overlays.hillshadeSoftness, overlays.contourSmoothing]);

  useEffect(() => {
    if (map && ready) applySurveyVisibility(map, overlays);
  }, [map, ready, overlays]);

  useEffect(() => {
    if (map && ready) applySurveyStyling(map, overlays);
  }, [map, ready, overlays]);

  return null;
}
