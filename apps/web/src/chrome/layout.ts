import { useEffect } from 'react';

/**
 * The shell's metrics, in one place.
 *
 * Every number here is used by at least two components, and that is the whole
 * reason the file exists. The tool bar has to stay clear of the rail and the
 * drawer; the rail has to start below the top bar; the zoom cluster and the
 * attribution line have to sit inside the same free channel the tool bar
 * centres itself in. Written as literals in each file, those relationships hold
 * until somebody changes one of them — which is how the rail once ended up
 * sitting on top of the recenter button: two components had agreed about a `top`
 * that only cleared a one-panel rail.
 *
 * So the derived values below are computed from the primitives rather than
 * measured off the design once. Widen a column and the tool bar's channel
 * narrows to match, because that is the same fact stated once.
 *
 * ## Docked, and still floating
 *
 * The chrome now reads as docked — a full-width bar across the top, a rail down
 * the left edge, a drawer down the right — and none of it displaces the map.
 * Every piece is absolutely positioned over a full-bleed canvas, opaque enough
 * to look built in. That is deliberate and it is the one rule this layout keeps
 * from the last one: a map that reflows loses your place, and losing your place
 * while measuring a fairway is the difference between a tool and a toy. Opening
 * the layers drawer must not re-project the hole you were looking at.
 */

/** The full-width bar across the top. Sized to a 28px control plus air. */
export const TOP_BAR_HEIGHT = 48;

/** The margin between floating chrome and the edge of the viewport. */
export const GUTTER = 12;

/** Between stacked chrome. */
export const GAP = 8;

/**
 * The rail's first level: the list you choose a context from.
 *
 * Two widths, because it holds two things at two moments. Open, it is the list
 * — a hole tile carries its number, its length, its par, a route schematic and
 * an elevation profile, and 236 is what those need side by side. Once you pick
 * one, the list has done its job and the detail beside it needs the room, so it
 * shrinks to the number and the two figures that identify a hole at a glance.
 * Nothing is lost: the rail is still the whole course, still scrollable, still
 * one click to any other hole.
 */
export const RAIL_WIDTH = 236;
export const RAIL_SHRUNK = 104;

/** The rail's second level: whatever you picked in the first. */
export const DETAIL_WIDTH = 296;

/**
 * The layers drawer, down the right edge.
 *
 * Wide enough for three basemap tiles across, which is what sets it: they are
 * the only fixed-width thing in it, and a fourth column of nothing would be
 * worse than a drawer sized to its own content.
 */
export const LAYERS_WIDTH = 264;

/**
 * How long a level takes to open, and on what curve.
 *
 * Shared by every sliding part of the shell, so the rail, its detail column and
 * the drawer move as one mechanism rather than as three animations that happen
 * to be near each other. The curve is the one the design uses: fast out of the
 * gate and long on the settle, which reads as weight rather than as a transition.
 */
export const SLIDE_MS = 190;
export const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/**
 * Every level of the rail, which is what the tool bar has to clear.
 *
 * The list shrinks only when what it is listing can still be identified at
 * 104px — which means holes, and only holes. A hole is a number; a style
 * subject is "Required relief" and a land feature is whatever somebody named
 * it, and neither survives being cut to two words and an ellipsis. So those
 * lists keep their width and the rail is simply wider while they are open.
 */
export const railWidth = (detailOpen: boolean, shrunk: boolean): number =>
  (shrunk ? RAIL_SHRUNK : RAIL_WIDTH) + (detailOpen ? DETAIL_WIDTH : 0);

/**
 * How much of each edge the chrome is currently covering.
 *
 * The rail and the drawer both change width, and four things have to stay clear
 * of them: the tool bar, the attribution, the camera cluster and the map's own
 * framing. Prop-drilling two numbers through four unrelated components would
 * couple all of them to the rail's internal state; publishing the numbers once
 * is the same fact stated in one place.
 *
 * It is published twice, deliberately, because it is read two ways. CSS custom
 * properties let a component write `left: var(--hz-rail)` and get the slide
 * animation for free. The plain record is for `frame.ts`, which needs a number
 * in JavaScript to compute a padding box — and which runs after paint, so the
 * effect below has always set it by then.
 */
export const shellEdges = { rail: RAIL_WIDTH as number, drawer: 0 as number };

export function useShellEdge(edge: 'rail' | 'drawer', px: number): void {
  useEffect(() => {
    shellEdges[edge] = px;
    document.documentElement.style.setProperty(`--hz-${edge}`, `${px}px`);
  }, [edge, px]);
}

/**
 * The tool bar's own line, above the attribution and zoom line.
 *
 * The two lines are deliberately separate. They shared a bottom flex row for a
 * while, which kept them from colliding but also meant a narrow viewport
 * squeezed the tool bar sideways as the zoom readout grew. Stacking gives the
 * bar the full channel and puts the readouts on a line of their own, where
 * neither can push the other.
 */
export const TOOL_BAR_BOTTOM = 66;

/** A tool slot: the palette's 38px target. See the note on `ToolBar`. */
export const TOOL_SLOT = 38;

/**
 * The tool bar's own height — a slot, plus 7px of air above and below it.
 *
 * Here because framing needs it. `TOOL_BAR_BOTTOM` is where the bar's *bottom*
 * edge sits, so anything subtracting only that from the safe area leaves the bar
 * itself lying over the map, and a hole fitted to the full box put its tee
 * underneath the palette.
 */
export const TOOL_BAR_HEIGHT = TOOL_SLOT + 14;

/** The line the attribution and the zoom cluster share, beneath the tool bar. */
export const READOUT_BOTTOM = 22;
