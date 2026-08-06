import { useEffect } from 'react';
import type { Overlays } from '@hyzerlines/core';

import { useMap } from '../map/MapContext';
import {
  applySurveyLayers,
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
 * Two effects rather than one, and the split is load-bearing: installing tears
 * down and rebuilds the contour source, which throws away every isoline already
 * computed. Flipping a switch must not do that, so visibility is its own effect
 * with `overlays` as a dependency and installation is not.
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
  }, [map, ready, units]);

  useEffect(() => {
    if (map && ready) applySurveyVisibility(map, overlays);
  }, [map, ready, overlays]);

  return null;
}
