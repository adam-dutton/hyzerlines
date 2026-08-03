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

export const feature = {
  tee: { stroke: primitive.amber[400], fill: 'rgb(255 192 70 / 0.28)', casing: CASING },
  basket: { stroke: '#ff5470', fill: 'rgb(255 84 112 / 0.28)', casing: CASING },
  fairway: { stroke: '#22d3ee', fill: 'rgb(34 211 238 / 0.14)', casing: CASING },
  green: { stroke: primitive.green[400], fill: 'rgb(67 214 127 / 0.20)', casing: CASING },
  ob: { stroke: '#ff3b30', fill: 'rgb(255 59 48 / 0.18)', casing: CASING },
  mando: { stroke: '#ff8c1a', fill: 'rgb(255 140 26 / 0.24)', casing: CASING },
  hazard: { stroke: '#ffd60a', fill: 'rgb(255 214 10 / 0.20)', casing: CASING },
  water: { stroke: '#3b82f6', fill: 'rgb(59 130 246 / 0.30)', casing: CASING },
  path: { stroke: '#d6cfc4', fill: 'rgb(214 207 196 / 0.22)', casing: CASING },
  /** Shot trajectories. Violet reads as "synthetic" — never mistaken for terrain. */
  flight: { stroke: primitive.violet[400], fill: 'rgb(167 139 250 / 0.20)', casing: CASING },
  /** Dispersion / safety envelopes. Deliberately alarming. */
  safety: { stroke: '#ff3b30', fill: 'rgb(255 59 48 / 0.22)', casing: CASING },
  /** Editing affordances: vertex handles, snap indicators, measure lines. */
  handle: { stroke: primitive.neutral[0], fill: primitive.accent[500], casing: CASING },
  snap: { stroke: '#22d3ee', fill: 'rgb(34 211 238 / 0.40)', casing: CASING },
} as const satisfies Record<string, FeatureColor>;

export type FeatureKind = keyof typeof feature;
