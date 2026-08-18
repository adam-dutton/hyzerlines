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

/**
 * Raw scales.
 *
 * Two families, and the split is the whole character of the palette: the dark
 * surfaces are a desaturated blue-green, and the light ones are warm sand. Most
 * systems run one neutral and tint it; this one changes *hue* between themes,
 * because the two are doing different jobs. Dark is an instrument housing —
 * cool, so the map's greens and browns are the only warm thing on screen. Light
 * is paper, and paper is warm.
 *
 * Every step below 300 is a surface the design names directly. They are not
 * interpolated and should not be "regularised": 0D1516 and 1A2223 are a panel
 * and a tool bar, measured off the artboards.
 */
export const primitive = {
  neutral: {
    0: '#ffffff',
    50: '#f5f1e8',
    /** Light theme: a panel on the base below it. */
    100: '#ebe5d8',
    /** Light theme: the page itself. */
    200: '#dcd4c2',
    300: '#b9bdb2',
    400: '#8e948b',
    500: '#6b7270',
    600: '#4a5254',
    700: '#363e40',
    /** Dark theme: popovers and dialogs, the things that float highest. */
    800: '#242c2e',
    /** Dark theme: the tool bar, and anything resting flat above a panel. */
    900: '#1a2223',
    /** Dark theme: panels — the rail, the drawer, the top bar. */
    950: '#0d1516',
    /** Dark theme: the canvas the map is drawn on. */
    1000: '#080d0e',
  },
  /**
   * Brand / interactive. Chartreuse.
   *
   * It replaces a teal, and the reasoning that put teal there — "green over
   * grass disappears" — was right about *green* and wrong about this. Grass
   * photographs mid-dark and desaturated; this sits at the top of the value
   * range and far enough toward yellow that nothing in an aerial competes with
   * it. What does compete with a teal accent is water, which is on a great many
   * of these sites.
   *
   * It is bright enough that text on it must be dark — see `INK`.
   */
  accent: {
    100: '#f2f7c0',
    200: '#e4ee7e',
    /** Link hover. */
    300: '#dce84a',
    /** Button hover. */
    400: '#d3e12a',
    /** The accent. */
    500: '#c6d40e',
    /** Pressed. */
    600: '#afbc0a',
    700: '#8c9808',
    /** Light theme: accent lines and fills, which need to hold against sand. */
    800: '#6e7a08',
  },
  /**
   * Status hues, kept warm and muted so they read as *information* beside a
   * chartreuse accent rather than competing with it. A saturated signal red
   * next to this accent is two shouts.
   */
  red: { 300: '#eba894', 400: '#e0866e', 500: '#c96a50', 600: '#a5462c' },
  amber: { 300: '#ecca8f', 400: '#e0b25e', 500: '#c69640', 600: '#96702a' },
  green: { 300: '#a8cf9a', 400: '#84b573', 500: '#639454', 600: '#476f3b' },
  violet: { 300: '#c9b6ff', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7038e0' },
} as const;

/**
 * What goes on top of the accent.
 *
 * Near-black with a green cast rather than the canvas colour, so a chartreuse
 * button reads as one object rather than as a hole punched through to the page.
 */
const INK = '#12190a';

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
    'surface.overlay': 'rgb(13 21 22 / 0.92)',
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
    'surface.tile': 'rgb(232 235 228 / 0.045)',
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
    'surface.field': 'rgb(232 235 228 / 0.06)',
    'surface.hover': 'rgb(232 235 228 / 0.06)',
    'surface.active': 'rgb(232 235 228 / 0.12)',
    /*
     * The secondary button's own ladder: rest, hover, pressed.
     *
     * Separate from `hover`/`active`, which are what a *row* does under the
     * pointer. A button is an object that is always there, so it starts from a
     * visible fill and has to move further on each step to register at all — a
     * row starts from nothing, so 6% is already a clear change. The design
     * draws them as two ladders and this follows it.
     */
    'surface.control': 'rgb(232 235 228 / 0.08)',
    'surface.control-hover': 'rgb(232 235 228 / 0.13)',
    'surface.control-active': 'rgb(232 235 228 / 0.18)',
    'surface.selected': 'rgb(198 212 14 / 0.15)',
    'surface.scrim': 'rgb(8 13 14 / 0.6)',

    /*
     * Text is one colour at four opacities, not four colours.
     *
     * The design states it that way — `rgba(232,235,228, α)` throughout — and
     * it matters over a translucent panel: an opaque grey step would sit on the
     * imagery instead of dimming against it, so muted text would go *lighter*
     * over dark canopy rather than quieter.
     */
    'text.primary': '#e8ebe4',
    'text.secondary': 'rgb(232 235 228 / 0.85)',
    'text.muted': 'rgb(232 235 228 / 0.5)',
    'text.disabled': 'rgb(232 235 228 / 0.3)',
    'text.inverse': INK,
    'text.accent': primitive.accent[500],

    'border.subtle': 'rgb(232 235 228 / 0.08)',
    'border.default': 'rgb(232 235 228 / 0.14)',
    'border.strong': 'rgb(232 235 228 / 0.22)',
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
    'accent.solid': primitive.accent[500],
    'accent.solid-hover': primitive.accent[400],
    /** Pressed. Down the ramp, not up — a press reads as the surface receding. */
    'accent.solid-active': primitive.accent[600],
    'accent.text-on-solid': INK,
    /*
     * A disabled primary keeps its colour and loses its strength, rather than
     * turning grey. Grey would make it a different button; this makes it the
     * same button, unavailable.
     */
    'accent.disabled': 'rgb(198 212 14 / 0.25)',
    'accent.text-disabled': 'rgb(18 25 10 / 0.5)',
    'accent.soft': 'rgb(198 212 14 / 0.15)',

    'status.danger': primitive.red[400],
    'status.danger-soft': 'rgb(224 134 110 / 0.12)',
    /** What goes on a filled danger button. Near-black with a red cast, as INK is to the accent. */
    'text.on-danger': '#1b0f0b',
    'status.warning': primitive.amber[400],
    'status.warning-soft': 'rgb(224 178 94 / 0.14)',
    'status.success': primitive.green[400],
    'status.success-soft': 'rgb(132 181 115 / 0.15)',

    /** Focus ring. Must clear both chrome and imagery, hence the double ring. */
    'focus.ring': primitive.accent[500],
    'focus.ring-offset': primitive.neutral[1000],
  },
  light: {
    /*
     * Sand, not white. The light theme is the same instrument in daylight, and
     * a white panel beside a full-colour aerial is a hole in the screen.
     */
    'surface.canvas': primitive.neutral[200],
    'surface.base': primitive.neutral[100],
    'surface.raised': primitive.neutral[100],
    'surface.overlay': 'rgb(235 229 216 / 0.94)',
    'surface.sunken': primitive.neutral[200],
    'surface.inset': primitive.neutral[200],
    'surface.tile': 'rgb(18 25 26 / 0.04)',
    'surface.field': 'rgb(18 25 26 / 0.06)',
    'surface.hover': 'rgb(18 25 26 / 0.06)',
    'surface.active': 'rgb(18 25 26 / 0.1)',
    'surface.control': 'rgb(18 25 26 / 0.08)',
    'surface.control-hover': 'rgb(18 25 26 / 0.13)',
    'surface.control-active': 'rgb(18 25 26 / 0.18)',
    'surface.selected': 'rgb(198 212 14 / 0.3)',
    'surface.scrim': 'rgb(18 25 26 / 0.35)',

    'text.primary': '#12191a',
    'text.secondary': 'rgb(18 25 26 / 0.78)',
    'text.muted': 'rgb(18 25 26 / 0.5)',
    'text.disabled': 'rgb(18 25 26 / 0.32)',
    'text.inverse': primitive.neutral[50],
    'text.accent': primitive.accent[800],

    'border.subtle': 'rgb(18 25 26 / 0.1)',
    'border.default': 'rgb(18 25 26 / 0.16)',
    'border.strong': 'rgb(18 25 26 / 0.3)',
    'border.accent': primitive.accent[800],

    /*
     * The same chartreuse, still carrying dark text.
     *
     * The design keeps `#C6D40E` in both themes rather than darkening it for
     * light, so the brand colour is one colour. What darkens is anything drawn
     * *as a line* — see `accent[800]`, which is what a slider track and a
     * selected row icon use against sand.
     */
    'accent.solid': primitive.accent[500],
    'accent.solid-hover': primitive.accent[400],
    'accent.solid-active': primitive.accent[600],
    'accent.text-on-solid': INK,
    'accent.disabled': 'rgb(198 212 14 / 0.35)',
    'accent.text-disabled': 'rgb(18 25 10 / 0.5)',
    'accent.soft': 'rgb(198 212 14 / 0.3)',

    'status.danger': primitive.red[600],
    'status.danger-soft': 'rgb(165 70 44 / 0.12)',
    'text.on-danger': primitive.neutral[50],
    'status.warning': primitive.amber[600],
    'status.warning-soft': 'rgb(150 112 42 / 0.14)',
    'status.success': primitive.green[600],
    'status.success-soft': 'rgb(71 111 59 / 0.12)',

    'focus.ring': primitive.accent[800],
    'focus.ring-offset': primitive.neutral[100],
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
 * The regulated areas are lettered, and the letters carry the identity.
 *
 * Out of bounds used to be red, on the argument that red is what OB looks like
 * on every course map a player has ever seen. True of a *line* with nothing
 * else to go on — and the four regulated areas now carry their own repeating
 * lettering, which says which is which far more exactly than four hues could.
 * OB, HZ, CAS and REL are unambiguous; four reds a shade apart are not.
 *
 * So the colours change job. The fill is transparent black on all four, which
 * is what shades ground on a printed plan without tinting the imagery a
 * designer is reading terrain from, and the line takes a hue that reads against
 * canopy: white for OB, yellow for a hazard, blue for a casual area, red for
 * required relief.
 */
const SHADE = 'rgb(0 0 0 / 0.28)';
const regulated = (stroke: string) => ({ stroke, fill: SHADE, casing: CASING });

/**
 * A mandatory is the other thing that earns red.
 *
 * Cross it and it costs you a throw, and course maps have drawn mandatory
 * arrows in red for as long as they have drawn anything in it — so the colour
 * is read rather than learned. A mandatory line is *specifically* a thing you
 * must not cross, which is exactly what a white line on this map does not say.
 */
const mando = { stroke: primitive.red[400], fill: 'rgb(255 107 100 / 0.22)', casing: CASING };

export const feature = {
  tee: mono,
  target: mono,
  fairway: mono,
  green: mono,
  mando,
  dropzone: mono,

  ob: regulated(WHITE),
  hazard: regulated(primitive.amber[400]),
  casualArea: regulated(primitive.accent[300]),
  requiredRelief: regulated(primitive.red[400]),

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
  handle: { stroke: INK, fill: primitive.accent[500], casing: CASING },
  selected: {
    stroke: primitive.accent[500],
    fill: 'rgb(198 212 14 / 0.28)',
    casing: primitive.accent[500],
  },
  /*
   * Snap stays cyan, and is the one place a second interface colour earns its
   * keep. It fires for a fraction of a second while a drag is in flight, next
   * to the accent-coloured handle doing the dragging — if both were chartreuse
   * there would be nothing to tell "this vertex" from "it will land here".
   */
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
