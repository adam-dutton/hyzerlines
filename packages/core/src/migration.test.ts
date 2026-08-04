import { describe, expect, it } from 'vitest';

import { parseCourse, DOCUMENT_VERSION } from './schema.js';
import { findPair } from './pairs.js';

/**
 * The v1 → v2 migration.
 *
 * This is the first migration this project has written, and it reinterprets
 * existing documents rather than merely adding fields: par moves from the hole
 * to the pair, the course-wide skill level becomes a per-tee colour, and a
 * layout is invented where there was none. Every one of those is a chance to
 * silently lose a designer's work, so each is asserted separately rather than
 * through one round-trip that would pass on an average.
 */

/** A v1 document, loosely typed so a test can delete or corrupt any part of it. */
const v1 = (): Record<string, unknown> => ({
  version: 1,
  id: 'course-1',
  name: 'Kaposia',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  view: { center: [-93.1, 44.9], zoom: 16, bearing: 0, pitch: 0 },
  basemapId: 'esri-imagery',
  skillLevel: 'blue',
  features: [
    { id: 'tee-1', kind: 'tee', geometry: { type: 'point', coordinates: [-93.1, 44.9] } },
    {
      id: 'basket-1',
      kind: 'basket',
      geometry: { type: 'point', coordinates: [-93.1, 44.903] },
    },
    {
      id: 'fairway-1',
      kind: 'fairway',
      geometry: {
        type: 'line',
        coordinates: [
          [-93.1, 44.9],
          [-93.1, 44.903],
        ],
      },
    },
  ],
  holes: [
    {
      id: 'hole-1',
      number: 1,
      name: 'The Chute',
      teeIds: ['tee-1'],
      basketIds: ['basket-1'],
      fairwayId: 'fairway-1',
      parOverride: 4,
    },
  ],
  dismissedRules: ['structural.hole-missing-tee'],
});

const migrate = (doc: Record<string, unknown>) => {
  const result = parseCourse(doc);
  if (!result.ok) throw new Error(result.error);
  return result;
};

describe('v1 to v2 migration', () => {
  it('reports that it migrated, and lands on the current version', () => {
    const result = migrate(v1());
    expect(result.migrated).toBe(true);
    expect(result.course.version).toBe(DOCUMENT_VERSION);
  });

  it('renames baskets to targets, keeping their geometry', () => {
    const { course } = migrate(v1());
    const target = course.features.find((f) => f.id === 'basket-1');
    expect(target?.kind).toBe('target');
    expect(target?.geometry).toEqual({ type: 'point', coordinates: [-93.1, 44.903] });
    expect(course.features.some((f) => f.kind === ('basket' as never))).toBe(false);
  });

  /**
   * The par a designer set is the single most expensive thing to lose here: it
   * is a decision, not a derived value, and nothing would announce its absence.
   */
  it('carries the hole par override onto the pair it was set for', () => {
    const { course } = migrate(v1());
    const pair = findPair(course.pairs, 'tee-1', 'basket-1');
    expect(pair?.parOverride).toBe(4);
    expect(pair?.fairwayId).toBe('fairway-1');
  });

  /**
   * v2 reads the skill level from tee colours. Dropping the course-wide value
   * without writing it onto the tees would silently re-band every par against
   * a different table.
   */
  it('turns the course skill level into a colour on every tee', () => {
    const { course } = migrate(v1());
    expect(course.features.find((f) => f.id === 'tee-1')?.props['color']).toBe('blue');
    expect('skillLevel' in course).toBe(false);
  });

  it('does not overwrite a tee that already has a colour', () => {
    const doc = v1();
    (doc['features'] as Record<string, unknown>[])[0]!['props'] = { color: 'red' };
    const { course } = migrate(doc);
    expect(course.features.find((f) => f.id === 'tee-1')?.props['color']).toBe('red');
  });

  it('creates one layout that plays every hole in number order', () => {
    const doc = v1();
    doc['holes'] = [
      { id: 'h2', number: 2, teeIds: ['tee-1'], basketIds: ['basket-1'] },
      { id: 'h1', number: 1, teeIds: ['tee-1'], basketIds: ['basket-1'] },
    ];
    const { course } = migrate(doc);

    expect(course.layouts).toHaveLength(1);
    expect(course.activeLayoutId).toBe(course.layouts[0]!.id);
    // Number order, not document order.
    expect(course.layouts[0]!.plays.map((p) => p.holeId)).toEqual(['h1', 'h2']);
  });

  /**
   * A layout is what gets played. A hole with no basket cannot be, and adding
   * it as a play would put a broken entry in the scorecard rather than leaving
   * the designer's incomplete hole visibly incomplete.
   */
  it('leaves unplayable holes out of the layout but keeps the holes', () => {
    const doc = v1();
    doc['holes'] = [
      { id: 'h1', number: 1, teeIds: ['tee-1'], basketIds: ['basket-1'] },
      { id: 'h2', number: 2, teeIds: ['tee-1'], basketIds: [] },
    ];
    const { course } = migrate(doc);

    expect(course.holes).toHaveLength(2);
    expect(course.layouts[0]!.plays.map((p) => p.holeId)).toEqual(['h1']);
  });

  /** A pair with nothing on it is implied by its hole and costs nothing to omit. */
  it('does not create pair records for pairs carrying no data', () => {
    const doc = v1();
    doc['holes'] = [{ id: 'h1', number: 1, teeIds: ['tee-1'], basketIds: ['basket-1'] }];
    const { course } = migrate(doc);
    expect(course.pairs).toEqual([]);
  });

  it('keeps dismissals, the name, the camera and the basemap', () => {
    const { course } = migrate(v1());
    expect(course.dismissedRules).toEqual(['structural.hole-missing-tee']);
    expect(course.name).toBe('Kaposia');
    expect(course.basemapId).toBe('esri-imagery');
    expect(course.view.zoom).toBe(16);
  });

  it('scopes every migrated feature to the course, with no tags', () => {
    const { course } = migrate(v1());
    for (const feature of course.features) {
      expect(feature.holeId).toBeNull();
      expect(feature.tags).toEqual([]);
    }
  });

  /* --------------------------------------------------------------------- */
  /* Degenerate documents — the ones a real autosave actually contains       */
  /* --------------------------------------------------------------------- */

  it('migrates a course with no holes and no features', () => {
    const doc = v1();
    doc['features'] = [];
    doc['holes'] = [];
    const { course } = migrate(doc);
    expect(course.layouts).toHaveLength(1);
    expect(course.layouts[0]!.plays).toEqual([]);
  });

  it('migrates a hole whose references point at deleted features', () => {
    const doc = v1();
    doc['holes'] = [
      {
        id: 'h1',
        number: 1,
        teeIds: ['gone'],
        basketIds: ['also-gone'],
        fairwayId: 'long-gone',
        parOverride: 3,
      },
    ];
    const { course } = migrate(doc);
    // The dangling ids survive so the structural check can still report them.
    expect(course.holes[0]!.teeIds).toEqual(['gone']);
    expect(findPair(course.pairs, 'gone', 'also-gone')?.parOverride).toBe(3);
  });

  /**
   * An override on a hole with no tee had nothing to attach to in v1 either —
   * it could not be measured, so no par was ever shown for it. Dropping it
   * loses nothing a designer could see.
   */
  it('drops an override that has no pair to land on', () => {
    const doc = v1();
    doc['holes'] = [{ id: 'h1', number: 1, teeIds: [], basketIds: [], parOverride: 5 }];
    const { course } = migrate(doc);
    expect(course.pairs).toEqual([]);
    expect(course.holes[0]!.targetIds).toEqual([]);
  });

  it('migrates a document with no skillLevel at all', () => {
    const doc = v1();
    delete doc['skillLevel'];
    const { course } = migrate(doc);
    expect(course.features.find((f) => f.id === 'tee-1')?.props['color']).toBeUndefined();
  });

  it('survives holes and features arrays that are not arrays', () => {
    const doc = v1();
    doc['holes'] = null;
    doc['features'] = 'nope';
    const { course } = migrate(doc);
    expect(course.holes).toEqual([]);
    expect(course.features).toEqual([]);
  });

  it('produces a document that parses again unchanged', () => {
    const { course } = migrate(v1());
    const again = parseCourse(course);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.migrated).toBe(false);
      expect(again.course).toEqual(course);
    }
  });
});
