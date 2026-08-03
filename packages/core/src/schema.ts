import { z } from 'zod';

import { viewSchema, type View } from './geo.js';
import { featureSchema } from './features.js';

/**
 * The course document.
 *
 * This is the contract everything else is written against: persistence, undo,
 * file import/export, and eventually sync. It is validated with zod at every
 * boundary where data enters the app from somewhere untrusted — IndexedDB and
 * `.hyzer` files both count, because both can hold something written by an
 * older version, a different version, or a corrupted write.
 */

/** Bumped whenever a change requires migrating existing documents. */
export const DOCUMENT_VERSION = 1;

export const courseSchema = z.object({
  /** Format version of this document, for migration on load. */
  version: z.literal(DOCUMENT_VERSION),
  id: z.string().min(1),
  name: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  view: viewSchema,
  basemapId: z.string().min(1),

  features: z.array(featureSchema).default([]),

  /* Reserved for the hole workflow in PR 4. */
  holes: z.array(z.unknown()).default([]),
});

export type Course = z.infer<typeof courseSchema>;

/** Center of the contiguous US — the same framing the empty map opens on. */
const DEFAULT_VIEW: View = {
  center: [-98.5795, 39.8283],
  zoom: 3.4,
  bearing: 0,
  pitch: 0,
};

export function createCourse(overrides: Partial<Course> = {}): Course {
  const now = new Date().toISOString();
  return courseSchema.parse({
    version: DOCUMENT_VERSION,
    id: crypto.randomUUID(),
    name: 'Untitled course',
    createdAt: now,
    updatedAt: now,
    view: DEFAULT_VIEW,
    basemapId: 'esri-imagery',
    features: [],
    holes: [],
    ...overrides,
  });
}

export interface ParseFailure {
  ok: false;
  error: string;
}

export interface ParseSuccess {
  ok: true;
  course: Course;
  /** True when the input was an older version that was migrated on the way in. */
  migrated: boolean;
}

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Validate and migrate arbitrary input into a Course.
 *
 * Never throws. Callers are loading from storage or from a file the user
 * picked, and both should degrade to a readable message rather than a stack
 * trace — a corrupt autosave must not make the app unopenable.
 */
export function parseCourse(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'Not a Hyzerlines course file.' };
  }

  const rawVersion = (input as { version?: unknown }).version;
  if (typeof rawVersion !== 'number') {
    return { ok: false, error: 'Missing format version — this is not a course file.' };
  }

  if (rawVersion > DOCUMENT_VERSION) {
    return {
      ok: false,
      error: `This course was made with a newer version of Hyzerlines (format ${rawVersion}, this build reads ${DOCUMENT_VERSION}). Update and try again.`,
    };
  }

  const migrated = rawVersion < DOCUMENT_VERSION;
  const candidate = migrated ? migrate(input as Record<string, unknown>, rawVersion) : input;

  const result = courseSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join('.') || 'document';
    return {
      ok: false,
      error: `Invalid course data at "${where}": ${issue?.message ?? 'unknown'}`,
    };
  }

  return { ok: true, course: result.data, migrated };
}

/**
 * Step a document forward one version at a time.
 *
 * Sequential rather than jump-to-latest: each step only has to understand the
 * shape immediately before it, which is what keeps migrations reviewable once
 * there are several. There are none yet — version 1 is the first format — so
 * this is the seam, not the logic.
 */
function migrate(input: Record<string, unknown>, from: number): Record<string, unknown> {
  let doc = input;
  let version = from;

  // Each future migration takes the form:
  //   if (version === 1) { doc = { ...doc, version: 2, /* changes */ }; version = 2; }

  if (version !== DOCUMENT_VERSION) {
    // Unreachable today. Left explicit so a forgotten migration surfaces as a
    // validation failure with a clear message rather than a confusing zod error.
    doc = { ...doc, version: DOCUMENT_VERSION };
    version = DOCUMENT_VERSION;
  }

  return doc;
}
