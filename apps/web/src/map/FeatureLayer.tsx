import { useEffect, useMemo, useRef } from 'react';
import type {
  GeoJSONSource,
  LayerSpecification,
  MapMouseEvent,
  MapSourceDataEvent,
} from 'maplibre-gl';
import { feature as featureColors } from '@hyzerlines/design';
import {
  byFocus,
  type Feature,
  type FeatureKind,
  type Focus,
  type MapStyle,
} from '@hyzerlines/core';

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
import { addMarkerIcons } from './icons';
import { resolveStyle, type ResolvedStyle } from './mapStyle';
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
  /** Which features answer a click first where two overlap. See `byFocus`. */
  focus: Focus;
  /** How the course is drawn. See `mapStyle`. */
  style: MapStyle;
}

/**
 * Every layer the course scene is made of, in draw order.
 *
 * One list, used to install the scene and to rebuild it when the stylesheet
 * changes. Order is the whole point and it is load-bearing twice over:
 * MapLibre draws in insertion order, and it hit-tests in it too. Derived
 * geometry sits under the features it was computed from, the handles sit over
 * everything because the smallest targets on screen must win a click, and a
 * rebuild that got this wrong would bury the thing you are trying to grab.
 */
function sceneLayers(resolved: ResolvedStyle): LayerSpecification[] {
  return [
    ...derivedLayers(resolved),
    ...featureLayers(resolved),
    // Provisional geometry: dashed, so it never reads as committed.
    {
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
    },
    // Above the geometry they label, below the handles.
    ...holeLabelLayers(resolved),
    // Above everything: the smallest targets on screen must win hit-testing.
    ...vertexLayers(),
    {
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
    },
  ];
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
  focus,
  style,
}: FeatureLayerProps) {
  const { map } = useMap();
  /*
   * The defaults, with the document's overrides folded in.
   *
   * Memoised on the stylesheet rather than recomputed per render: it is read by
   * the install effect and by the effect that re-applies a changed style, and
   * an unstable object would make the second one fire on every keystroke
   * anywhere in the app.
   */
  const resolved = useMemo(() => resolveStyle(style), [style]);
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;
  const readyRef = useRef(false);
  const selectedRef = useRef<readonly string[]>([]);

  /*
   * The live data, for an install that may land after the props have moved on.
   *
   * `install` runs when the style is ready, which is not when this effect
   * runs — so without these it would close over whatever the props were on the
   * first render, which is an empty document, and the `setData` effects below
   * would never fire because `features` had not changed. That is the exact
   * shape of a real bug: switching the basemap used to empty the map until you
   * reloaded, because a `setStyle` reinstall re-added every source with
   * mount-time data.
   *
   * `setStyle` is gone now — see `style.ts` — so this only has to survive the
   * gap before the style parses rather than an arbitrary number of style swaps.
   * The ref covers both, and `basemap switch keeps the course` in the e2e suite
   * is what keeps the old bug from coming back.
   */
  const dataRef = useRef({ features, derived, preview, handles });
  dataRef.current = { features, derived, preview, handles };

  // Install sources and layers, once, as soon as the style can hold them.
  useEffect(() => {
    if (!map) return;

    const install = () => {
      const { features, derived, preview, handles } = dataRef.current;
      // Same reason as `dataRef`: the style may have moved on between this
      // effect running and MapLibre being ready to hold layers.
      const resolved = resolvedRef.current;

      /*
       * Derived geometry goes in first, because MapLibre draws in insertion
       * order and a tee pad must sit under the tee point it was computed from.
       * Installing it after would bury the thing you actually click.
       */
      addMarkerIcons(map, resolved);

      if (!map.getSource(DERIVED_SOURCE)) {
        // promoteId for the same reason the feature source needs it: a tee pad
        // carries its tee's id and has to take selection state.
        map.addSource(DERIVED_SOURCE, {
          type: 'geojson',
          data: derived.collection,
          promoteId: 'id',
        });
      }
      if (!map.getSource(FEATURES_SOURCE)) {
        map.addSource(FEATURES_SOURCE, {
          type: 'geojson',
          data: toGeoJSON(features, derived.withMarker),
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

      for (const layer of sceneLayers(resolved)) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }

      readyRef.current = true;
    };

    if (map.isStyleLoaded()) install();
    else map.once('load', install);
    // Data props and the stylesheet are deliberately not deps: this installs
    // the scene once, reading both from refs. Ordinary data updates go through
    // the `setData` effects below, and a restyle through the one after them.
  }, [map]);

  /*
   * Restyling: drop the course's layers and put them back.
   *
   * Coarse on purpose. The alternative is a table mapping every style field to
   * the layers and paint properties it touches, and calling `setPaintProperty`
   * for each — which is more code, has to be kept in step with the layer
   * definitions by hand, and cannot express the one thing a restyle most often
   * changes: a dash, which decides whether a layer even carries the property.
   *
   * It is also cheap in the way that matters. The **sources** are untouched, so
   * no geometry is re-parsed and no tile is re-fetched; MapLibre re-runs layout
   * for a few dozen layers over data it already holds. A designer dragging a
   * colour picker sees it keep up.
   *
   * Skipped entirely on the first pass, when `install` has just used this same
   * stylesheet.
   */
  const installedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !readyRef.current) return;
    if (installedRef.current === null) {
      installedRef.current = 'installed';
      return;
    }

    const scene = sceneLayers(resolved);
    /*
     * Removed in reverse and re-added forwards, so the scene ends up in the
     * order it was built in. Everything is torn down, including the layers a
     * stylesheet cannot touch: re-adding only *some* of them would append them
     * above the ones that stayed, which is how the vertex handles would end up
     * underneath the shapes they belong to.
     */
    for (const layer of [...scene].reverse()) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    }
    addMarkerIcons(map, resolved);
    for (const layer of scene) {
      if (!map.getLayer(layer.id)) map.addLayer(layer);
    }
  }, [map, resolved]);

  // Push document features to the map.
  useEffect(() => {
    if (!map) return;
    const source = map.getSource<GeoJSONSource>(FEATURES_SOURCE);
    source?.setData(toGeoJSON(features, derived.withMarker));
  }, [map, features, derived.withMarker]);

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
      /*
       * Ranked by focus before anything else reads them.
       *
       * `INTERACTIVE_LAYERS` orders candidates by geometry — a small thing
       * standing on a big one wins — which is right but says nothing about
       * what the designer is working on. In Land, a tree drawn over hole 7's
       * corridor should answer the click; in Play, the hole should. Both stay
       * reachable either way, because this reorders and never filters.
       */
      const hits = byFocus(
        map.queryRenderedFeatures(e.point, { layers: [...INTERACTIVE_LAYERS] }),
        focus,
        (hit) => {
          const kind = hit.properties?.['kind'];
          return typeof kind === 'string' ? (kind as FeatureKind) : null;
        },
      );
      /*
       * `selectAs` wins where a feature has one.
       *
       * A fairway corridor's id has to stay its own key so feature-state
       * highlighting finds it, but clicking one means the hole it belongs to —
       * the corridor is the room that hole's shot has, not an object in its
       * own right. Carrying the answer on the feature keeps the branching in
       * the thing that knows, rather than here.
       */
      const properties = hits[0]?.properties;
      const id = properties?.['selectAs'] ?? properties?.['id'];
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
  }, [map, selectable, onSelect, focus]);

  return null;
}
