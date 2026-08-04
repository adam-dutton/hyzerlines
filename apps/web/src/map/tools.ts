import type { FeatureKind } from '@hyzerlines/core';

/**
 * What a click on the map means right now.
 *
 * Navigation tools and drawing tools share one slot because they are mutually
 * exclusive in the same way: at any moment a drag either zooms the camera or
 * does whatever the current tool does. Modelling them as one union means the
 * cursor, the MapLibre handler config and the rail all read from a single value
 * and cannot disagree about which mode the map is in.
 *
 * There is no separate pan tool. Dragging pans from every tool except Zoom,
 * which is what a map is expected to do — an earlier version made panning its
 * own mode with a Space-to-pan hold, and borrowing that from design tools was
 * the wrong instinct for a canvas that is a map first.
 */
export const NAV_TOOLS = ['select', 'zoom'] as const;
export type NavTool = (typeof NAV_TOOLS)[number];

export type Tool = NavTool | FeatureKind;

export const isNavTool = (tool: Tool): tool is NavTool =>
  (NAV_TOOLS as readonly string[]).includes(tool);

/** A drawing tool is anything that is not navigation. */
export const isDrawingTool = (tool: Tool): tool is FeatureKind => !isNavTool(tool);
