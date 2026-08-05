import { z } from 'zod';

import { positionSchema } from './geo.js';
import { SKILL_LEVELS, SKILL_LEVEL_INFO } from './pdga.js';

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

/**
 * Everything that can be drawn.
 *
 * `casualArea` and `requiredRelief` are separate kinds rather than one kind
 * with a flag, because the Rules of Play make them different things: 806.03
 * lets a player *optionally* relocate without penalty, while 806.04 requires
 * it. A designer drawing one is making a specific claim about how the hole
 * plays, and the map styles them differently so the claim is visible.
 */
export const FEATURE_KINDS = [
  // Play
  'tee',
  'target',
  'fairway',
  'mando',
  'dropzone',
  // Regulated areas — see REGULATED_AREAS in pdga.ts
  'ob',
  'hazard',
  'casualArea',
  'requiredRelief',
  // Reference
  'boundary',
  'notedArea',
  'notedPoint',
  'path',
  'water',
  'terrain',
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
   * Which hole this belongs to. Null means course-level.
   *
   * Scope, not a second collection. An OB boundary at the course level and one
   * on a single hole are the same thing seen at different ranges — modelling
   * them as separate arrays would give every rule, renderer and exporter two
   * code paths that drift, and re-scoping later would mean moving between
   * collections rather than editing a field.
   */
  holeId: z.string().nullable().default(null),
  /**
   * Free tags, e.g. `elevated`, `round`, `suspended`.
   *
   * One shared mechanism across every kind that wants them rather than a
   * per-kind list, so a tag means the same thing wherever it appears and
   * filtering by one can work across the whole document.
   */
  tags: z.array(z.string()).default([]),
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
  /**
   * A point whose real extent is a rectangle derived from width, length and
   * bearing — see `TEEING_AREA` in pdga.ts. The stored point is the front
   * centre, and the footprint extends backwards from it.
   */
  placedRectangle?: true;
}

export const KIND_DEFINITIONS: Record<FeatureKind, KindDefinition> = {
  tee: { label: 'Tee pad', geometry: 'point', command: 'tool.tee', placedRectangle: true },
  target: { label: 'Target', geometry: 'point', command: 'tool.basket' },
  fairway: { label: 'Fairway', geometry: 'line', command: 'tool.fairway' },
  mando: { label: 'Mandatory', geometry: 'point', command: 'tool.mando' },
  dropzone: { label: 'Drop zone', geometry: 'point', placedRectangle: true },

  ob: { label: 'Out of bounds', geometry: 'polygon', command: 'tool.ob' },
  hazard: { label: 'Hazard', geometry: 'polygon' },
  casualArea: { label: 'Casual area', geometry: 'polygon' },
  requiredRelief: { label: 'Required relief', geometry: 'polygon' },

  boundary: { label: 'Property boundary', geometry: 'polygon' },
  notedArea: { label: 'Noted area', geometry: 'polygon' },
  notedPoint: { label: 'Noted point', geometry: 'point' },
  path: { label: 'Path', geometry: 'line' },
  water: { label: 'Water', geometry: 'polygon' },
  terrain: { label: 'Terrain feature', geometry: 'polygon' },
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
  type: 'text' | 'number' | 'select' | 'boolean';
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

const MANDO_TYPES = [
  { value: 'tree', label: 'Tree' },
  { value: 'pole', label: 'Pole' },
  { value: 'marker', label: 'Marker' },
] as const;

const TARGET_TYPES = [
  { value: 'basket', label: 'Basket' },
  { value: 'object', label: 'Object' },
] as const;

/**
 * Whether the hardware is actually there.
 *
 * Separate from whether a layout uses the position. A course can have five pin
 * positions with two baskets in the ground, and the difference decides whether
 * a layout can be played today — not whether it is a valid design.
 */
const INSTALL_STATUS = [
  { value: 'installed', label: 'Installed' },
  { value: 'position-only', label: 'Position only' },
] as const;

/**
 * Tee colour is the skill level.
 *
 * [ELEMENTS] p3: "The designated color for each set of tees used for course
 * layout identification on scorecards should match one of the four recognized
 * player skill levels that set of tees was designed for: Gold, Blue, White or
 * Red." Green is included because the par tables cover it even though the
 * design guidelines stop at four.
 *
 * A select rather than free text, because this drives which PDGA par band the
 * hole is read against — a typo would silently re-band the course.
 */
const TEE_COLORS = SKILL_LEVELS.map((level) => ({
  value: level,
  label: SKILL_LEVEL_INFO[level].label,
}));

/** Shared by the two kinds that are a point plus a derived rectangle. */
const placedRectangleFields: readonly FieldDefinition[] = [
  { key: 'surface', label: 'Surface', type: 'select', options: TEE_SURFACES },
  { key: 'width', label: 'Width', type: 'number', unit: 'meters', min: 0, max: 20 },
  { key: 'length', label: 'Length', type: 'number', unit: 'meters', min: 0, max: 20 },
  { key: 'bearing', label: 'Facing', type: 'number', unit: 'degrees', min: 0, max: 360 },
];

/**
 * Fields for a kind.
 *
 * Kept deliberately short. Every field is one more thing to fill in, and an
 * inspector that asks for a basket's serial number before you've routed the
 * hole is asking the wrong question at the wrong time.
 *
 * Elevation is absent everywhere on purpose: it is sampled from terrain, not
 * typed in, and offering a box for it would invite a number nobody measured.
 */
export function fieldsFor(kind: FeatureKind): readonly FieldDefinition[] {
  switch (kind) {
    case 'tee':
      return [
        { key: 'color', label: 'Colour', type: 'select', options: TEE_COLORS },
        ...placedRectangleFields,
        { key: 'status', label: 'Status', type: 'select', options: INSTALL_STATUS },
        { key: 'standalone', label: 'Not part of a hole', type: 'boolean' },
      ];
    case 'dropzone':
      return placedRectangleFields;
    case 'target':
      return [
        { key: 'pinId', label: 'Pin', type: 'text', placeholder: 'A' },
        { key: 'type', label: 'Type', type: 'select', options: TARGET_TYPES },
        { key: 'model', label: 'Model', type: 'text', placeholder: 'e.g. Mach X5' },
        { key: 'color', label: 'Colour', type: 'text', placeholder: 'e.g. white' },
        { key: 'status', label: 'Status', type: 'select', options: INSTALL_STATUS },
        // A practice basket belongs to the course, not to a hole, and should
        // not be reported forever as something you forgot to assign.
        { key: 'standalone', label: 'Not part of a hole', type: 'boolean' },
      ];
    case 'mando':
      return [
        { key: 'side', label: 'Rule', type: 'select', options: MANDO_SIDES },
        { key: 'type', label: 'Object', type: 'select', options: MANDO_TYPES },
        { key: 'height', label: 'Height', type: 'number', unit: 'meters', min: 0, max: 60 },
        { key: 'bearing', label: 'Facing', type: 'number', unit: 'degrees', min: 0, max: 360 },
      ];
    /*
     * The two widths describe the CORRIDOR, not the line.
     *
     * Left empty, they are derived — the tee pad's width at the tee, tapering
     * to Circle 1's radius at the target (see FAIRWAY_CORRIDOR in geometry.ts).
     * They exist because that taper is ours rather than the PDGA's, and a
     * default nobody can argue with is a default nobody should be stuck with.
     */
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
        {
          key: 'widthStart',
          label: 'Width at tee',
          type: 'number',
          unit: 'meters',
          min: 0,
          max: 200,
        },
        {
          key: 'widthEnd',
          label: 'Width at target',
          type: 'number',
          unit: 'meters',
          min: 0,
          max: 200,
        },
      ];
    /*
     * Invert turns the polygon inside out: everything OUTSIDE it is the
     * regulated area. Common for "the course is inside this line", and the
     * reason a property boundary and an inverted OB look so similar on screen
     * while meaning different things.
     */
    case 'ob':
    case 'hazard':
      return [{ key: 'invert', label: 'Everything outside', type: 'boolean' }];
    /*
     * [RULES] 806.03.B — water that is in-bounds and not declared in play is a
     * casual area by default. The flag exists so the document says which it is
     * rather than leaving a drawn pond ambiguous.
     */
    case 'water':
      return [{ key: 'inPlay', label: 'In play', type: 'boolean' }];
    case 'casualArea':
    case 'requiredRelief':
    case 'boundary':
    case 'notedArea':
    case 'notedPoint':
    case 'path':
    case 'terrain':
      return [];
  }
}

/** Display name: the user's label if set, otherwise the kind. */
export function featureName(feature: Feature): string {
  return feature.label.trim() || KIND_DEFINITIONS[feature.kind].label;
}

export function createFeature(
  kind: FeatureKind,
  geometry: Geometry,
  overrides: Partial<Omit<Feature, 'id' | 'kind' | 'geometry'>> = {},
): Feature {
  return featureSchema.parse({
    id: crypto.randomUUID(),
    kind,
    geometry,
    label: '',
    holeId: null,
    tags: [],
    props: {},
    ...overrides,
  });
}

/** Features belonging to a hole. Course-level features have a null holeId. */
export function featuresOfHole(
  features: readonly Feature[],
  holeId: string,
): readonly Feature[] {
  return features.filter((f) => f.holeId === holeId);
}

/**
 * Whether a target is a real pin position or a marker for one.
 *
 * A practice basket has no hole and never becomes a pin; a position-only target
 * is a pin the course does not currently have hardware for. Both are legitimate
 * states, and neither should be reported as a mistake.
 */
export function isInstalled(feature: Feature): boolean {
  return feature.props['status'] !== 'position-only';
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
