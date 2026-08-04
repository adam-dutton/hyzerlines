import { z } from 'zod';

import { positionSchema } from './geo.js';

/**
 * Course features — everything you draw on the land.
 *
 * Geometry is deliberately a small closed set rather than full GeoJSON. A course
 * needs points, open lines and simple closed areas; supporting MultiPolygons and
 * interior rings would add real complexity to every consumer (rendering,
 * editing, area calculation, export) to serve a case disc golf doesn't have.
 * KML/GeoJSON import in PR 10 converts into this, not the reverse.
 *
 * Coordinates are [lng, lat] and metric throughout — see schema.ts.
 */

export const pointGeometrySchema = z.object({
  type: z.literal('point'),
  coordinates: positionSchema,
});

export const lineGeometrySchema = z.object({
  type: z.literal('line'),
  // Two points is the minimum that has direction; one is a point.
  coordinates: z.array(positionSchema).min(2),
});

export const polygonGeometrySchema = z.object({
  type: z.literal('polygon'),
  /**
   * Exterior ring, stored *open* — the closing point is implied.
   *
   * Storing it closed means every edit has to keep first and last in sync, and
   * every consumer has to remember whether it's looking at a closed ring. The
   * renderer closes it; nothing else has to think about it.
   */
  coordinates: z.array(positionSchema).min(3),
});

export const geometrySchema = z.discriminatedUnion('type', [
  pointGeometrySchema,
  lineGeometrySchema,
  polygonGeometrySchema,
]);

export type Geometry = z.infer<typeof geometrySchema>;
export type GeometryType = Geometry['type'];

export const FEATURE_KINDS = [
  'tee',
  'basket',
  'mando',
  'fairway',
  'path',
  'ob',
  'hazard',
  'water',
] as const;

export const featureKindSchema = z.enum(FEATURE_KINDS);
export type FeatureKind = z.infer<typeof featureKindSchema>;

export const featureSchema = z.object({
  id: z.string().min(1),
  kind: featureKindSchema,
  geometry: geometrySchema,
  /** User-visible name. Empty means "fall back to the kind's label". */
  label: z.string().default(''),
  /**
   * Kind-specific values, described by `fieldsFor` below.
   *
   * Loosely typed on purpose: the inspector is generated from field
   * descriptors, so adding a property to a kind must not require a schema
   * change plus a migration plus a new form component. Values are validated on
   * write by the field definitions, not by the document schema.
   */
  props: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),
});

export type Feature = z.infer<typeof featureSchema>;

/** Which geometry each kind is drawn with, and how it presents in the UI. */
export interface KindDefinition {
  label: string;
  geometry: GeometryType;
  /** Command id in the keyboard registry, when the kind has a dedicated tool. */
  command?: string;
}

export const KIND_DEFINITIONS: Record<FeatureKind, KindDefinition> = {
  tee: { label: 'Tee pad', geometry: 'point', command: 'tool.tee' },
  basket: { label: 'Basket', geometry: 'point', command: 'tool.basket' },
  mando: { label: 'Mandatory', geometry: 'point', command: 'tool.mando' },
  fairway: { label: 'Fairway line', geometry: 'line', command: 'tool.fairway' },
  path: { label: 'Path', geometry: 'line' },
  ob: { label: 'Out of bounds', geometry: 'polygon', command: 'tool.ob' },
  hazard: { label: 'Hazard', geometry: 'polygon' },
  water: { label: 'Water', geometry: 'polygon' },
};

/**
 * A property the inspector should render.
 *
 * The inspector is generated from these rather than hand-built per kind. That
 * is what keeps one consistent surface for every feature type — the alternative
 * is eight bespoke forms that drift apart in spacing, labelling and behaviour.
 */
export interface FieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  /** For `select`. */
  options?: readonly { value: string; label: string }[];
  /** For `number`. Values are stored metric; the UI converts for display. */
  unit?: 'meters' | 'degrees';
  min?: number;
  max?: number;
  placeholder?: string;
}

const TEE_SURFACES = [
  { value: 'concrete', label: 'Concrete' },
  { value: 'rubber', label: 'Rubber' },
  { value: 'gravel', label: 'Gravel' },
  { value: 'natural', label: 'Natural' },
] as const;

const MANDO_SIDES = [
  { value: 'left', label: 'Pass left' },
  { value: 'right', label: 'Pass right' },
  { value: 'over', label: 'Pass over' },
] as const;

/**
 * Fields for a kind.
 *
 * Kept deliberately short. Every field is one more thing to fill in, and an
 * inspector that asks for a basket's serial number before you've routed the
 * hole is asking the wrong question at the wrong time. Hole assignment, par and
 * tee positions arrive with the hole workflow in PR 4, where they belong.
 */
export function fieldsFor(kind: FeatureKind): readonly FieldDefinition[] {
  switch (kind) {
    case 'tee':
      return [
        { key: 'surface', label: 'Surface', type: 'select', options: TEE_SURFACES },
        // Pad dimensions are what the PDGA checks in PR 4, so they are stored
        // in meters now rather than retrofitted later.
        { key: 'width', label: 'Width', type: 'number', unit: 'meters', min: 0, max: 20 },
        { key: 'length', label: 'Length', type: 'number', unit: 'meters', min: 0, max: 20 },
      ];
    case 'basket':
      return [
        { key: 'model', label: 'Target model', type: 'text', placeholder: 'e.g. Mach X5' },
      ];
    case 'mando':
      return [
        { key: 'side', label: 'Rule', type: 'select', options: MANDO_SIDES },
        { key: 'height', label: 'Height', type: 'number', unit: 'meters', min: 0, max: 60 },
      ];
    case 'fairway':
      return [
        {
          key: 'shape',
          label: 'Shot shape',
          type: 'select',
          options: [
            { value: 'straight', label: 'Straight' },
            { value: 'hyzer', label: 'Hyzer' },
            { value: 'anhyzer', label: 'Anhyzer' },
          ],
        },
      ];
    case 'ob':
      return [
        {
          key: 'rule',
          label: 'Penalty',
          type: 'select',
          options: [
            { value: 'stroke', label: 'One stroke' },
            { value: 'rethrow', label: 'Rethrow' },
          ],
        },
      ];
    case 'path':
    case 'hazard':
    case 'water':
      return [];
  }
}

/** Display name: the user's label if set, otherwise the kind. */
export function featureName(feature: Feature): string {
  return feature.label.trim() || KIND_DEFINITIONS[feature.kind].label;
}

export function createFeature(kind: FeatureKind, geometry: Geometry): Feature {
  return featureSchema.parse({
    id: crypto.randomUUID(),
    kind,
    geometry,
    label: '',
    props: {},
  });
}

/**
 * Whether a kind can be drawn with a geometry.
 *
 * Guards the seam between the tool layer and the document: a bug that stored a
 * polygon as a basket would render as nothing at all and be very hard to trace
 * back from.
 */
export function geometryMatchesKind(kind: FeatureKind, geometry: Geometry): boolean {
  return KIND_DEFINITIONS[kind].geometry === geometry.type;
}
