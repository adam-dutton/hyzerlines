import { useEffect, useRef } from 'react';
import type { GeoJSONSource, MapMouseEvent, MapSourceDataEvent } from 'maplibre-gl';
import { feature as featureColors } from '@hyzerlines/design';
import type { Feature } from '@hyzerlines/core';

import { useMap } from './MapContext';
import { FEATURES_SOURCE, INTERACTIVE_LAYERS, featureLayers, toGeoJSON } from './featureLayers';

const PREVIEW_SOURCE = 'drawing-preview';

interface FeatureLayerProps {
  features: readonly Feature[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  preview: GeoJSON.FeatureCollection;
  /** Clicks select only when the select tool is active. */
  selectable: boolean;
}

/**
 * Renders course features and the in-progress drawing onto the map.
 *
 * Imperative rather than declarative because MapLibre owns its own scene graph:
 * React's job here is to keep sources in sync, not to re-create layers. Layers
 * are added once and only their data changes, which is what keeps panning
 * smooth with a few thousand features.
 */
export function FeatureLayer({
  features,
  selectedId,
  onSelect,
  preview,
  selectable,
}: FeatureLayerProps) {
  const { map } = useMap();
  const readyRef = useRef(false);
  const selectedRef = useRef<string | null>(null);

  // Install sources and layers. Re-runs after a basemap change, because
  // setStyle() discards everything not in the new style.
  useEffect(() => {
    if (!map) return;

    const install = () => {
      if (!map.getSource(FEATURES_SOURCE)) {
        map.addSource(FEATURES_SOURCE, {
          type: 'geojson',
          data: toGeoJSON(features),
          /*
           * Required for selection to work at all.
           *
           * MapLibre only accepts numeric feature ids on a GeoJSON source, and
           * ours are UUIDs — setFeatureState with a string id is silently
           * ignored, which presents as selection styling that simply never
           * appears. promoteId lifts a property into the feature id and does
           * support strings.
           */
          promoteId: 'id',
        });
      }
      if (!map.getSource(PREVIEW_SOURCE)) {
        map.addSource(PREVIEW_SOURCE, { type: 'geojson', data: preview });
      }

      for (const layer of featureLayers()) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }

      // Provisional geometry: dashed, so it never reads as committed.
      if (!map.getLayer('preview-line')) {
        map.addLayer({
          id: 'preview-line',
          type: 'line',
          source: PREVIEW_SOURCE,
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': featureColors.snap.stroke,
            'line-width': 2,
            'line-dasharray': [2, 1.5],
          },
        });
      }
      if (!map.getLayer('preview-vertex')) {
        map.addLayer({
          id: 'preview-vertex',
          type: 'circle',
          source: PREVIEW_SOURCE,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': featureColors.handle.fill,
            'circle-radius': 4,
            'circle-stroke-color': featureColors.handle.stroke,
            'circle-stroke-width': 1.5,
          },
        });
      }

      readyRef.current = true;
    };

    if (map.isStyleLoaded()) install();
    map.on('styledata', install);
    return () => {
      map.off('styledata', install);
    };
    // `features` and `preview` are intentionally omitted: this installs the
    // scene once. Data updates are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Push document features to the map.
  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(FEATURES_SOURCE);
    source?.setData(toGeoJSON(features));
  }, [map, features]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(PREVIEW_SOURCE);
    source?.setData(preview);
  }, [map, preview]);

  /*
   * Selection is a feature-state flag rather than a property, so selecting
   * doesn't rebuild the whole source.
   *
   * The catch: setFeatureState silently does nothing if the source hasn't
   * ingested that feature id yet. setData is asynchronous internally, so
   * selecting a feature in the same tick it was drawn — which is exactly what
   * happens when a new shape auto-selects — lands before the data does and is
   * dropped. The result looks like selection styling simply not working.
   *
   * So the state is applied now *and* re-applied whenever the source reports
   * itself loaded.
   */
  useEffect(() => {
    if (!map) return;

    const apply = () => {
      const previous = selectedRef.current;
      if (previous && previous !== selectedId) {
        map.removeFeatureState({ source: FEATURES_SOURCE, id: previous }, 'selected');
      }
      if (selectedId) {
        map.setFeatureState({ source: FEATURES_SOURCE, id: selectedId }, { selected: true });
      }
      selectedRef.current = selectedId;
    };

    apply();

    const onSourceData = (e: MapSourceDataEvent) => {
      if (e.sourceId === FEATURES_SOURCE && e.isSourceLoaded) apply();
    };
    map.on('sourcedata', onSourceData);
    return () => {
      map.off('sourcedata', onSourceData);
    };
  }, [map, selectedId, features]);

  // Click to select, click empty space to deselect.
  useEffect(() => {
    if (!map || !selectable) return;

    const handleClick = (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: [...INTERACTIVE_LAYERS] });
      const id = hits[0]?.properties?.['id'];
      onSelect(typeof id === 'string' ? id : null);
    };

    // Pointer feedback on hover, so features read as clickable.
    const handleMove = (e: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: [...INTERACTIVE_LAYERS] });
      map.getCanvas().style.cursor = hits.length > 0 ? 'pointer' : '';
    };

    map.on('click', handleClick);
    map.on('mousemove', handleMove);
    return () => {
      map.off('click', handleClick);
      map.off('mousemove', handleMove);
      map.getCanvas().style.cursor = '';
    };
  }, [map, selectable, onSelect]);

  return null;
}
