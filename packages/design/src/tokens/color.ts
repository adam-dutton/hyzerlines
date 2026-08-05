/**
 * Color tokens.
 *
 * Three tiers, and the tiers matter:
 *
 *   primitive  raw scales. Never referenced directly by a component.
 *   semantic   role-named (`surface.raised`, `text.muted`). What components use.
 *   feature    map geometry. Separate tier because it has different rules —
 *              see the note on casings below.
 *
 * Hyzerlines is dark-first. Satellite imagery is dark, saturated and busy;
 * light chrome floating over it is unreadable, so the dark theme is the
 * designed default and light is the alternate.
 *
 * FEATURE COLOR RULE: every vector drawn on the map carries a dark `casing`
 * underneath its `stroke`. Imagery ranges from near-black tree canopy to blown-out
 * snow and sand, and no single stroke color survives that range on its own. The
 * casing gives every feature a guaranteed contrast floor regardless of what is
 * underneath it. This is not decoration — dropping it makes features vanish over
 * roughly a third of real basemaps.
 */

/** Raw scales. Cool-neutral: reads as "instrument" rather than "document". */
export const primitive = {
  neutral: {
    0: '#ffffff',
    50: '#f6f7f9',
    100: '#eaedf1',
    200: '#d3d8e0',
    300: '#aeb6c2',
    400: '#8a94a3',
    500: '#666f7d',
    600: '#4a525e',
    700: '#343b45',
    800: '#242a32',
    900: '#191d23',
    950: '#101318',
    1000: '#08090b',
  },
  /** Brand / interactive. Cyan-leaning blue: no collision with turf or dirt. */
  accent: {
    100: '#d5f1ff',
    200: '#a9e2ff',
    300: '#7fd4ff',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
  },
  red: { 300: '#ff9b96', 400: '#ff6b64', 500: '#f5352b', 600: '#cf1d14' },
  amber: { 300: '#ffd98a', 400: '#ffc046', 500: '#f0a010', 600: '#c47c04' },
  green: { 300: '#8ce7b0', 400: '#43d67f', 500: '#1eb45f', 600: '#128a48' },
  violet: { 300: '#c9b6ff', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7038e0' },
} as const;

/**
 * Semantic roles. These are what components reference, and the only tier that
 * changes between themes — a component written against `surface.raised` is
 * theme-correct by construction.
 */
export const semantic = {
  dark: {
    'surface.canvas': primitive.neutral[1000],
    'surface.base': primitive.neutral[950],
    'surface.raised': primitive.neutral[900],
    'surface.overlay': 'rgb(25 29 35 / 0.92)',
    'surface.sunken': primitive.neutral[1000],
    'surface.inset': primitive.neutral[800],
    'surface.hover': 'rgb(255 255 255 / 0.06)',
    'surface.active': 'rgb(255 255 255 / 0.10)',
    'surface.selected': 'rgb(14 165 233 / 0.16)',
    'surface.scrim': 'rgb(8 9 11 / 0.6)',

    'text.primary': primitive.neutral[50],
    'text.secondary': primitive.neutral[300],
    'text.muted': primitive.neutral[400],
    'text.disabled': primitive.neutral[600],
    'text.inverse': primitive.neutral[950],
    'text.accent': primitive.accent[300],

    'border.subtle': 'rgb(255 255 255 / 0.07)',
    'border.default': 'rgb(255 255 255 / 0.12)',
    'border.strong': 'rgb(255 255 255 / 0.22)',
    'border.accent': primitive.accent[500],

    'accent.solid': primitive.accent[500],
    'accent.solid-hover': primitive.accent[400],
    'accent.text-on-solid': primitive.neutral[1000],
    'accent.soft': 'rgb(14 165 233 / 0.15)',

    'status.danger': primitive.red[400],
    'status.danger-soft': 'rgb(245 53 43 / 0.15)',
    'status.warning': primitive.amber[400],
    'status.warning-soft': 'rgb(240 160 16 / 0.15)',
    'status.success': primitive.green[400],
    'status.success-soft': 'rgb(30 180 95 / 0.15)',

    /** Focus ring. Must clear both chrome and imagery, hence the double ring. */
    'focus.ring': primitive.accent[400],
    'focus.ring-offset': primitive.neutral[950],
  },
  light: {
    'surface.canvas': primitive.neutral[100],
    'surface.base': primitive.neutral[50],
    'surface.raised': primitive.neutral[0],
    'surface.overlay': 'rgb(255 255 255 / 0.94)',
    'surface.sunken': primitive.neutral[100],
    'surface.inset': primitive.neutral[100],
    'surface.hover': 'rgb(8 9 11 / 0.05)',
    'surface.active': 'rgb(8 9 11 / 0.09)',
    'surface.selected': 'rgb(14 165 233 / 0.13)',
    'surface.scrim': 'rgb(8 9 11 / 0.35)',

    'text.primary': primitive.neutral[950],
    'text.secondary': primitive.neutral[600],
    'text.muted': primitive.neutral[500],
    'text.disabled': primitive.neutral[300],
    'text.inverse': primitive.neutral[0],
    'text.accent': primitive.accent[700],

    'border.subtle': 'rgb(8 9 11 / 0.08)',
    'border.default': 'rgb(8 9 11 / 0.14)',
    'border.strong': 'rgb(8 9 11 / 0.28)',
    'border.accent': primitive.accent[600],

    'accent.solid': primitive.accent[600],
    'accent.solid-hover': primitive.accent[700],
    'accent.text-on-solid': primitive.neutral[0],
    'accent.soft': 'rgb(14 165 233 / 0.12)',

    'status.danger': primitive.red[600],
    'status.danger-soft': 'rgb(245 53 43 / 0.12)',
    'status.warning': primitive.amber[600],
    'status.warning-soft': 'rgb(240 160 16 / 0.14)',
    'status.success': primitive.green[600],
    'status.success-soft': 'rgb(30 180 95 / 0.12)',

    'focus.ring': primitive.accent[600],
    'focus.ring-offset': primitive.neutral[0],
  },
} as const;

export type SemanticColorToken = keyof (typeof semantic)['dark'];

/**
 * Map feature colors. Identical in both themes — these sit on imagery, not on
 * chrome, so they must not follow the UI theme. A tee pad is gold over a light
 * basemap and gold over a dark one.
 */
export interface FeatureColor {
  /** Line color / icon color. */
  stroke: string;
  /** Area fill, already at working opacity. */
  fill: string;
  /** Dark outline drawn beneath the stroke. The contrast floor. */
  casing: string;
}

const CASING = 'rgb(8 9 11 / 0.85)';

/**
 * Every feature is white, for now — except out of bounds.
 *
 * A deliberate monochrome pass. The palette below had a hue per kind, which
 * reads well on a legend and badly on satellite imagery: fifteen saturated
 * colours over tree canopy, sand, water and grass is a lot of noise for
 * information that is mostly carried by shape and position anyway. White with a
 * dark casing has the highest contrast available over every basemap, and it
 * forces the drawing itself to do the work of telling a tee from a basket.
 *
 * Hue comes back when there is something worth spending it on — a routed layout,
 * a safety envelope, a skill level. Keeping the per-kind entries rather than
 * collapsing them to one means that is a values change here and nothing else.
 */
const WHITE = '#ffffff';
const WHITE_FILL = 'rgb(255 255 255 / 0.18)';
const mono = { stroke: WHITE, fill: WHITE_FILL, casing: CASING };

/**
 * Out of bounds is the one exception, and it earns it.
 *
 * Red for OB is not a styling choice this project gets to make — it is what OB
 * looks like on every course map, every tournament handout and every rulebook
 * diagram a player has ever seen. Drawing it in the same white as a path would
 * be withholding the one piece of information the map can convey without a
 * label, on the only kind of area that costs a throw to land in.
 *
 * The other regulated areas stay white for now. They are penalties too, but
 * they have no established colour, and inventing three more would put the map
 * back where the monochrome pass started.
 */
const RED_FILL = 'rgb(255 107 100 / 0.22)';
const ob = { stroke: primitive.red[400], fill: RED_FILL, casing: CASING };

export const feature = {
  tee: mono,
  target: mono,
  fairway: mono,
  green: mono,
  mando: mono,
  dropzone: mono,

  ob,
  hazard: mono,
  casualArea: mono,
  requiredRelief: mono,

  water: mono,
  path: mono,
  boundary: mono,
  notedArea: mono,
  notedPoint: mono,
  terrain: mono,
  flight: mono,
  safety: mono,

  /**
   * Editing affordances stay coloured, and have to.
   *
   * Handles, snap indicators and the selection halo are the interface talking
   * about the drawing rather than part of it. If they were white too there
   * would be no way to tell a selected feature from an unselected one, or a
   * vertex you can grab from the line it sits on.
   */
  handle: { stroke: primitive.neutral[0], fill: primitive.accent[500], casing: CASING },
  selected: {
    stroke: primitive.accent[400],
    fill: 'rgb(56 189 248 / 0.28)',
    casing: primitive.accent[500],
  },
  snap: { stroke: '#22d3ee', fill: 'rgb(34 211 238 / 0.40)', casing: CASING },
} as const satisfies Record<string, FeatureColor>;

export type FeatureKind = keyof typeof feature;
