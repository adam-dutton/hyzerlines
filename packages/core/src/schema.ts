import { z } from 'zod';

import { displaySchema } from './display.js';
import { overlaysSchema } from './overlays.js';
import { mapStyleSchema } from './style.js';
import { siteSurveySchema } from './survey.js';
import { viewSchema, type View } from './geo.js';
import { featureSchema, type Feature } from './features.js';
import { holeSchema } from './holes.js';
import { createPair, pairSchema } from './pairs.js';
import { createLayout, createPlay, layoutSchema, type Layout } from './layouts.js';

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
export const DOCUMENT_VERSION = 2;

/**
 * How long a course description may be.
 *
 * Roughly two sentences. Exported so the field that enforces it and the input
 * that counts against it cannot disagree — a limit the interface does not know
 * about is a limit the user discovers by having their typing rejected.
 */
export const DESCRIPTION_MAX = 280;

export const courseSchema = z.object({
  /** Format version of this document, for migration on load. */
  version: z.literal(DOCUMENT_VERSION),
  id: z.string().min(1),
  name: z.string(),
  /**
   * Where the course is, in words.
   *
   * Seeded once from the map's own position and editable to anything after —
   * a park's name, a street address, "the back forty". The coordinates are
   * already in `view`, so this exists for the case coordinates are useless
   * for: telling a landowner, a parks department or your future self which
   * piece of ground this is.
   */
  location: z.string().default(''),
  /**
   * A sentence or two about the course.
   *
   * Capped, and deliberately short. A description that can run to a page
   * becomes the place everything goes, and there is already a notes field for
   * that — this is the line that would sit under the name on a scorecard.
   */
  description: z.string().max(DESCRIPTION_MAX).default(''),
  notes: z.string().default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  view: viewSchema,
  basemapId: z.string().min(1),

  features: z.array(featureSchema).default([]),
  holes: z.array(holeSchema).default([]),

  /**
   * Tee-to-target records, stored sparsely.
   *
   * Only pairs carrying something the geometry cannot derive — an overridden
   * par, a drawn fairway — need a record. See pairs.ts.
   */
  pairs: z.array(pairSchema).default([]),

  /**
   * How the course is played. See layouts.ts.
   *
   * A course always has at least one, created on migration or on first use;
   * without one there is no defined answer to "what is the par".
   */
  layouts: z.array(layoutSchema).default([]),
  activeLayoutId: z.string().nullable().default(null),

  /**
   * Rule ids the designer has silenced for this course.
   *
   * Part of the document rather than a preference: a dismissal is a decision
   * about this course ("the short pad really is that close to the path"), and
   * it should travel with the file to whoever reviews it.
   */
  dismissedRules: z.array(z.string()).default([]),

  /**
   * Which drawing aids the map shows. See display.ts for why it is in here.
   *
   * Additive with defaults, so a document written before this existed parses
   * with everything on and needs no migration.
   */
  display: displaySchema.default({}),

  /**
   * What is drawn over the imagery. See overlays.ts.
   *
   * Additive with defaults for the same reason as `display` — a document
   * written before this existed parses with every overlay off, which is what
   * it was showing.
   */
  overlays: overlaysSchema.default({}),

  /**
   * How this course is drawn. See style.ts.
   *
   * Additive with defaults, like the two above: a document written before this
   * existed parses with an empty stylesheet, which draws exactly what it drew.
   */
  style: mapStyleSchema.default({}),

  /**
   * Elevation the designer brought for this site. See survey.ts.
   *
   * Metadata only — the tiles live in IndexedDB, because a `.hyzer` is a
   * document you email and forty megabytes of elevation is not. Someone opening
   * a course you sent is told it was designed against a 1m survey and which
   * one, even though they do not have the pixels.
   */
  siteSurvey: siteSurveySchema.nullable().default(null),
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
  /*
   * A course is born with one empty layout.
   *
   * Without one there is no defined answer to "what is the par" — every total
   * is computed over a layout's plays, and a document with no layout would make
   * that a special case in the scorecard, the checks and every export.
   */
  const layout = createLayout('Main');
  return courseSchema.parse({
    version: DOCUMENT_VERSION,
    id: crypto.randomUUID(),
    name: 'Untitled course',
    notes: '',
    createdAt: now,
    updatedAt: now,
    view: DEFAULT_VIEW,
    basemapId: 'esri-imagery',
    features: [],
    holes: [],
    pairs: [],
    layouts: [layout],
    activeLayoutId: layout.id,
    ...overrides,
  });
}

/** The layout in force, or the first one. Never null for a valid document. */
export function activeLayout(course: Course): Layout | undefined {
  return course.layouts.find((l) => l.id === course.activeLayoutId) ?? course.layouts[0];
}

/** Features by id — every consumer needs this and none should build it twice. */
export function featureIndex(course: Course): Map<string, Feature> {
  return new Map(course.features.map((f) => [f.id, f]));
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
 * there are several.
 */
function migrate(input: Record<string, unknown>, from: number): Record<string, unknown> {
  let doc = input;
  let version = from;

  if (version === 1) {
    doc = migrateV1ToV2(doc);
    version = 2;
  }

  if (version !== DOCUMENT_VERSION) {
    // Left explicit so a forgotten migration surfaces as a validation failure
    // with a clear message rather than a confusing zod error.
    doc = { ...doc, version: DOCUMENT_VERSION };
    version = DOCUMENT_VERSION;
  }

  return doc;
}

/* ------------------------------------------------------------------------- */
/* v1 → v2                                                                    */
/* ------------------------------------------------------------------------- */

/** The shape of a v1 hole, for the migration to read. */
interface V1Hole {
  id?: unknown;
  number?: unknown;
  name?: unknown;
  teeIds?: unknown;
  basketIds?: unknown;
  fairwayId?: unknown;
  parOverride?: unknown;
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asStrings = (value: unknown): string[] =>
  asArray(value).filter((v): v is string => typeof v === 'string');

/**
 * Version 1 to version 2.
 *
 * What changes, and why each is safe:
 *
 * **`basket` becomes `target`.** A rename only; the geometry and props survive.
 *
 * **Par moves from the hole to the pair.** v1 stored one `parOverride` per
 * hole, which was only ever true of one tee-and-pin combination. It is carried
 * onto the pair formed by the hole's first tee and first target — the pair the
 * v1 app was actually measuring when the designer set it. Overrides on holes
 * with no tee or no target have nothing to attach to and are dropped; that
 * combination was already unmeasurable, so no number is lost.
 *
 * **The fairway moves the same way**, onto the same pair.
 *
 * **`course.skillLevel` disappears.** In v2 the level comes from tee colours,
 * so the v1 value is written onto every tee that has no colour of its own. That
 * preserves the pars the designer was seeing, which a course-level default
 * would not once tees started carrying their own levels.
 *
 * **A default layout is created**, playing every hole in number order using its
 * first tee and first target. Holes that cannot form a pair are skipped rather
 * than added as broken plays — a layout is what is *played*, and a hole with no
 * basket is not.
 *
 * **v1 tee points become front-centre by definition.** They were placed with no
 * defined semantic and carried no bearing, so nothing is being reinterpreted
 * against the designer's intent; the point simply gains a meaning it did not
 * have. Bearing is left unset for PR 6 to seed from the target.
 */
function migrateV1ToV2(input: Record<string, unknown>): Record<string, unknown> {
  const skillLevel = typeof input['skillLevel'] === 'string' ? input['skillLevel'] : null;

  const features = asArray(input['features']).map((raw) => {
    const feature = { ...(raw as Record<string, unknown>) };
    if (feature['kind'] === 'basket') feature['kind'] = 'target';

    // The course-wide level becomes a per-tee one; without it, every par the
    // designer had set would silently re-compute against a different band.
    if (feature['kind'] === 'tee' && skillLevel) {
      const props = { ...((feature['props'] as Record<string, unknown>) ?? {}) };
      if (typeof props['color'] !== 'string') props['color'] = skillLevel;
      feature['props'] = props;
    }
    return feature;
  });

  const pairs: ReturnType<typeof createPair>[] = [];
  const plays: ReturnType<typeof createPlay>[] = [];

  const v1Holes = asArray(input['holes']) as V1Hole[];
  const holes = v1Holes.map((hole) => {
    const teeIds = asStrings(hole.teeIds);
    const targetIds = asStrings(hole.basketIds);
    const teeId = teeIds[0];
    const targetId = targetIds[0];

    if (teeId && targetId) {
      const parOverride = typeof hole.parOverride === 'number' ? hole.parOverride : null;
      const fairwayId = typeof hole.fairwayId === 'string' ? hole.fairwayId : null;

      // Only worth a record if it carries something. A pair with neither is
      // implied by the hole and costs nothing to leave out.
      if (parOverride !== null || fairwayId !== null) {
        pairs.push(createPair(teeId, targetId, { parOverride, fairwayId }));
      }
      if (typeof hole.id === 'string') plays.push(createPlay(hole.id, teeId, targetId));
    }

    return {
      id: hole.id,
      number: hole.number,
      name: typeof hole.name === 'string' ? hole.name : '',
      notes: '',
      teeIds,
      targetIds,
    };
  });

  // Playing order, which in v1 was the only order there was.
  plays.sort((a, b) => {
    const numberOf = (holeId: string) =>
      (holes.find((h) => h.id === holeId)?.number as number | undefined) ?? 0;
    return numberOf(a.holeId) - numberOf(b.holeId);
  });

  const layout = createLayout('Main', plays);

  const migrated: Record<string, unknown> = {
    ...input,
    version: 2,
    notes: '',
    features,
    holes,
    pairs,
    layouts: [layout],
    activeLayoutId: layout.id,
  };
  delete migrated['skillLevel'];
  return migrated;
}
