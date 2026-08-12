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
  /**
   * Brand / interactive. Cyan-leaning: no collision with turf or dirt.
   *
   * Retuned from sky blue towards teal so that step 300 is `#7fd3e0` — the
   * accent the shell design was drawn against. The hue moved about fifteen
   * degrees; the reason for the family did not. Green was rejected here and
   * still is, because a green accent over grass is an accent that disappears
   * exactly where this app is used.
   */
  accent: {
    100: '#dcf5f9',
    200: '#b4e9f1',
    300: '#7fd3e0',
    400: '#4ab8ca',
    500: '#2b9cb0',
    600: '#1c7d90',
    700: '#16626f',
    800: '#124e59',
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
    /**
     * A tile resting on a panel — a hole chip, a card in a grid.
     *
     * Lighter than `inset`, and translucent where `inset` is opaque. The panels
     * are themselves translucent over imagery, so an opaque tile inside one
     * punches a solid hole in the blur and reads as a separate surface floating
     * on top of the panel rather than as part of it.
     */
    'surface.tile': 'rgb(255 255 255 / 0.05)',
    /**
     * A filled control with no border: input, select, segmented track.
     *
     * The interface used to outline every field. At the density this app runs
     * at — a dozen rows in a 268px column — that many hairlines reads as a
     * grid, and the eye spends its effort on the boxes instead of the values.
     * A fill says "you can type here" with no lines at all.
     *
     * Deliberately not `surface.hover`, which happens to carry the same value in
     * the dark theme. A resting control styled from a hover token is a control
     * that changes meaning the first time somebody retunes hover.
     */
    'surface.field': 'rgb(255 255 255 / 0.06)',
    'surface.hover': 'rgb(255 255 255 / 0.06)',
    'surface.active': 'rgb(255 255 255 / 0.10)',
    'surface.selected': 'rgb(127 211 224 / 0.16)',
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

    /*
     * A light accent carrying dark text, not a saturated one carrying white.
     *
     * The chrome floats over imagery at 94% opacity, and a mid-tone fill on a
     * translucent dark panel is the one combination that reads as neither —
     * too dim to be a primary action, too coloured to be a surface. The design
     * settled this by making the solid fill the *light* step: `Share` and the
     * active focus are near-white teal with near-black text, which is the
     * highest-contrast pair the palette can produce.
     */
    'accent.solid': primitive.accent[300],
    'accent.solid-hover': primitive.accent[200],
    'accent.text-on-solid': primitive.neutral[1000],
    'accent.soft': 'rgb(127 211 224 / 0.15)',

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
    'surface.tile': 'rgb(8 9 11 / 0.04)',
    'surface.field': 'rgb(8 9 11 / 0.05)',
    'surface.hover': 'rgb(8 9 11 / 0.05)',
    'surface.active': 'rgb(8 9 11 / 0.09)',
    'surface.selected': 'rgb(43 156 176 / 0.13)',
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
    'accent.soft': 'rgb(43 156 176 / 0.12)',

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

/**
 * A mandatory is the second thing that earns red, and for OB's own reason.
 *
 * The two are the same claim to a player: cross this and it costs you a throw.
 * Course maps have drawn mandatory arrows in red for as long as they have drawn
 * OB in it, so the colour is read rather than learned — and a mandatory line is
 * *specifically* a thing you must not cross, which is exactly what a white line
 * on this map does not say.
 *
 * The same red as OB rather than a second one. Two reds a shade apart would be
 * the map implying a distinction it does not mean.
 */
const mando = { stroke: primitive.red[400], fill: RED_FILL, casing: CASING };

export const feature = {
  tee: mono,
  target: mono,
  fairway: mono,
  green: mono,
  mando,
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
    fill: 'rgb(74 184 202 / 0.28)',
    casing: primitive.accent[500],
  },
  snap: { stroke: '#22d3ee', fill: 'rgb(34 211 238 / 0.40)', casing: CASING },

  /**
   * Contour lines, and the one warm thing on the map.
   *
   * The drawing is white, selection is blue, and out of bounds is red. Terrain
   * is a fourth channel — not part of the design, not the interface talking
   * about the design, but a reading of the ground both are sitting on — so it
   * needs a hue that cannot be mistaken for any of the three.
   *
   * Warm tan, which is also what a topographic sheet has used for a century.
   * It survives being drawn over canopy, sand and water, and it recedes behind
   * white geometry rather than competing with it, which is the right ranking:
   * you are designing the course, not reading the hill.
   */
  contour: { stroke: '#e3b183', fill: 'rgb(227 177 131 / 0.18)', casing: CASING },
} as const satisfies Record<string, FeatureColor>;

export type FeatureKind = keyof typeof feature;
