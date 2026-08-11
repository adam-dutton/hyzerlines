/**
 * The shell's metrics, in one place.
 *
 * Every number here is used by at least two components, and that is the whole
 * reason the file exists. The tool bar has to stay clear of both panel columns;
 * the panels have to start below the top bar; the zoom cluster and the
 * attribution line have to sit inside the same free channel the tool bar
 * centres itself in. Written as literals in each file, those relationships hold
 * until somebody changes one of them — which is how the rail ended up sitting on
 * top of the recenter button: two components had agreed about a `top` that only
 * cleared a one-panel rail.
 *
 * So the derived values below are computed from the primitives rather than
 * measured off the design once. Widen a panel and the tool bar's channel narrows
 * to match, because that is the same fact stated once.
 */

/** The margin between chrome and the edge of the viewport. */
export const GUTTER = 12;

/** Both inspector columns. Wide enough for a label column plus a control. */
export const PANEL_WIDTH = 268;

/** The floating top bar. Sized to a 28px control with 8px of air above and below. */
export const TOP_BAR_HEIGHT = 44;

/** Between stacked chrome — top bar to panel, panel to panel. */
export const GAP = 8;

/**
 * Where the panels start, under the top bar.
 *
 * Derived, so a taller top bar pushes them down instead of overlapping them.
 */
export const PANEL_TOP = GUTTER + TOP_BAR_HEIGHT + GAP;

/**
 * The inside edge of a panel column: everything between the two is free map.
 *
 * The tool bar, the zoom cluster and the attribution line all measure from this
 * rather than from the viewport, which is what keeps them out of the panels at
 * every width. The tool bar additionally *clips* rather than overlapping — see
 * the note on `ToolBar`.
 */
export const COLUMN = GUTTER + PANEL_WIDTH + GAP;

/**
 * Where the panels end.
 *
 * The viewport edge, not the tool bar's line. The bar and the readouts live in
 * the channel *between* the columns, so a full-height panel cannot reach them —
 * and the alternative costs 64px of every panel to protect against a collision
 * that the horizontal arrangement has already ruled out. Eighteen holes and their
 * features need the height.
 */
export const PANEL_BOTTOM = GUTTER;

/**
 * The holes grid, and the case it has to fit.
 *
 * Eighteen holes three-up is six rows, and all eighteen fitting without scrolling
 * is the whole reason the list became a grid — so the cap is that height exactly,
 * derived rather than measured off a screenshot.
 *
 * It was `max-h-[54%]`, which could not work: the panel is sized by its content,
 * so 54% of it was 54% of a height the grid was itself contributing to. The
 * percentage resolved against roughly 400px rather than the column's 800, and an
 * eighteen-hole course showed four and a half rows.
 *
 * A 27-hole course is nine rows, hits this cap and scrolls inside it — which is
 * the right failure, because the features section below keeps its place.
 */
const HOLE_CHIP_HEIGHT = 40;
const HOLE_CHIP_GAP = 6;
const HOLE_GRID_ROWS = 6;
/** The scroll container's own bottom padding, which sits inside the cap. */
const HOLE_GRID_PADDING = 10;

export const HOLES_GRID_MAX_HEIGHT =
  HOLE_GRID_ROWS * HOLE_CHIP_HEIGHT + (HOLE_GRID_ROWS - 1) * HOLE_CHIP_GAP + HOLE_GRID_PADDING;

/**
 * The tool bar's own line, above the attribution and zoom line.
 *
 * The two lines are deliberately separate. They shared a bottom flex row for a
 * while, which kept them from colliding but also meant a narrow viewport
 * squeezed the tool bar sideways as the zoom readout grew. Stacking gives the
 * bar the full channel and puts the readouts on a line of their own, where
 * neither can push the other.
 */
export const TOOL_BAR_BOTTOM = 76;

/** The line the attribution and the zoom cluster share, beneath the tool bar. */
export const READOUT_BOTTOM = 20;
