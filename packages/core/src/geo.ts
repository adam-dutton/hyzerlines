import { z } from 'zod';

/**
 * Geographic primitives shared by the document and its features.
 *
 * Separate module so that features.ts and schema.ts can both depend on it
 * without depending on each other — the course contains features, features need
 * positions, and positions belong to neither.
 *
 * COORDINATES ARE ALWAYS [lng, lat]. Not [lat, lng]. GeoJSON and MapLibre are
 * both lng-first, and a document that disagreed would put a silent
 * transposition between the model and everything that draws it. Both are plain
 * numbers, so the type system cannot help — these bounds are the only guard.
 */

export const positionSchema = z.tuple([
  z.number().min(-180).max(180), // longitude
  z.number().min(-90).max(90), // latitude
]);

export type Position = z.infer<typeof positionSchema>;

/**
 * The saved camera.
 *
 * Part of the document rather than a user preference: reopening a course should
 * put you back over the land you were working on, and a course shared with
 * someone else should open framed on the property rather than on the whole US.
 */
export const viewSchema = z.object({
  center: positionSchema,
  zoom: z.number().min(0).max(24),
  bearing: z.number(),
  pitch: z.number().min(0).max(85),
});

export type View = z.infer<typeof viewSchema>;
