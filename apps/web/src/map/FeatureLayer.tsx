import { useEffect, useRef } from 'react';
import type { GeoJSONSource, MapMouseEvent, MapSourceDataEvent } from 'maplibre-gl';
import { feature as featureColors } from '@hyzerlines/design';
import type { Feature } from '@hyzerlines/core';

import { useMap } from './MapContext';
import {
  DERIVED_SOURCE,
  FEATURES_SOURCE,
  HANDLES_SOURCE,
  INTERACTIVE_LAYERS,
  derivedLayers,
  featureLayers,
  holeLabelLayers,
  toGeoJSON,
  vertexLayers,
} from './featureLayers';
import { VERTEX_LAYERS } from './useVertexEditing';
import { addBasketIcons } from './icons';
import type { DerivedGeometry } from './derived';

const PREVIEW_SOURCE = 'drawing-preview';

interface FeatureLayerProps {
  features: readonly Feature[];
  /**
   * Everything currently highlighted.
   *
   * A set rather than one id, because selecting a *hole* highlights the hole:
   * its label, its tee, its target and its corridor all read as active
   * together. One id would leave the designer to work out which shapes the
   * selected hole was made of by clicking them.
   */
  selectedIds: readonly string[];
  onSelect: (id: string | null) => void;
  preview: GeoJSON.FeatureCollection;
  /** Tee pads, fairway corridors and centrelines, computed from the features. */
  derived: DerivedGeometry;
  /** Vertex and midpoint handles for the shape being reshaped. */
  handles: GeoJSON.FeatureCollection;
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
  selectedIds,
  onSelect,
  preview,
  derived,
  handles,
  selectable,
}: FeatureLayerProps) {
  const { map } = useMap();
  const readyRef = useRef(false);
  const selectedRef = useRef<readonly string[]>([]);

  /*
   * The live data, for the reinstall that follows a basemap change.
   *
   * `install` is bound once, for the lifetime of the map, and runs again on
   * every `styledata` — so without these it would close over whatever the
   * props were on the very first render, which is an empty document. That is
   * not theoretical: `setStyle` discards every source, install re-added them
   * with the mount-time data, and the `setData` effects below never fired
   * because `features` had not changed. Switching the basemap emptied the map
   * and only a reload brought the course back.
   */
  const dataRef = useRef({ features, derived, preview, handles });
  dataRef.current = { features, derived, preview, handles };

  // Install sources and layers. Re-runs after a basemap change, because
  // setStyle() discards everything not in the new style.
  useEffect(() => {
    if (!map) return;

    const install = () => {
      const { features, derived, preview, handles } = dataRef.current;

      /*
       * Derived geometry goes in first, because MapLibre draws in insertion
       * order and a tee pad must sit under the tee point it was computed from.
       * Installing it after would bury the thing you actually click.
       */
      addBasketIcons(map);

      if (!map.getSource(DERIVED_SOURCE)) {
        // promoteId for the same reason the feature source needs it: a tee pad
        // carries its tee's id and has to take selection state.
        map.addSource(DERIVED_SOURCE, {
          type: 'geojson',
          data: derived.collection,
          promoteId: 'id',
        });
      }
      for (const layer of derivedLayers()) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }

      if (!map.getSource(FEATURES_SOURCE)) {
        map.addSource(FEATURES_SOURCE, {
          type: 'geojson',
          data: toGeoJSON(features, derived.withFootprint),
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
      if (!map.getSource(HANDLES_SOURCE)) {
        map.addSource(HANDLES_SOURCE, { type: 'geojson', data: handles });
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
      // Above the geometry they label, below the handles.
      for (const layer of holeLabelLayers()) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }

      // Above everything: the smallest targets on screen must win hit-testing.
      for (const layer of vertexLayers()) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
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
    // Data props are deliberately not deps: this installs the scene once and
    // reinstalls it after a style swap, reading current data from `dataRef`.
    // Ordinary updates go through the `setData` effects below.
  }, [map]);

  // Push document features to the map.
  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(FEATURES_SOURCE);
    source?.setData(toGeoJSON(features, derived.withFootprint));
  }, [map, features, derived.withFootprint]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(PREVIEW_SOURCE);
    source?.setData(preview);
  }, [map, preview]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(DERIVED_SOURCE);
    source?.setData(derived.collection);
  }, [map, derived]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(HANDLES_SOURCE);
    source?.setData(handles);
  }, [map, handles]);

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
   *
   * Both sources get it. A selected tee's highlight lives on its pad, which is
   * in the derived source; a selected fairway's lives on its corridor, which is
   * there too. Setting state for an id a source has never heard of is a no-op,
   * so this needs no per-kind branching.
   */
  useEffect(() => {
    if (!map) return;
    const sources = [FEATURES_SOURCE, DERIVED_SOURCE];

    const apply = () => {
      const now = new Set(selectedIds);
      for (const source of sources) {
        for (const id of selectedRef.current) {
          if (!now.has(id)) map.removeFeatureState({ source, id }, 'selected');
        }
        for (const id of now) {
          map.setFeatureState({ source, id }, { selected: true });
        }
      }
      selectedRef.current = selectedIds;
    };

    apply();

    const onSourceData = (e: MapSourceDataEvent) => {
      if (e.sourceId && sources.includes(e.sourceId) && e.isSourceLoaded) apply();
    };
    map.on('sourcedata', onSourceData);
    return () => {
      map.off('sourcedata', onSourceData);
    };
  }, [map, selectedIds, features]);

  // Click to select, click empty space to deselect.
  useEffect(() => {
    if (!map || !selectable) return;

    /*
     * A handle is never a selection target.
     *
     * Vertex handles sit directly on top of the shape they belong to, so a
     * click that lands on one would otherwise fall through and re-select — or,
     * after Alt-clicking a vertex away, land on empty ground and deselect the
     * feature you were still editing, taking every remaining handle with it.
     */
    const overHandle = (e: MapMouseEvent): boolean =>
      map.getLayer('edit-vertex') !== undefined &&
      map.queryRenderedFeatures(e.point, { layers: [...VERTEX_LAYERS] }).length > 0;

    const handleClick = (e: MapMouseEvent) => {
      if (overHandle(e)) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: [...INTERACTIVE_LAYERS] });
      const id = hits[0]?.properties?.['id'];
      onSelect(typeof id === 'string' ? id : null);
    };

    // Pointer feedback on hover, so features read as clickable. Handles own
    // their own cursor, set by useVertexEditing.
    const handleMove = (e: MapMouseEvent) => {
      if (overHandle(e)) return;
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
