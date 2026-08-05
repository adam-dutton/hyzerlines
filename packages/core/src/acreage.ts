import type { Feature } from './features.js';
import { featureArea } from './measure.js';
import {
  ACREAGE_HOLE_MIX,
  acreageRange,
  squareMetersToAcres,
  type AcreageRange,
  type FoliageDensity,
  type SkillLevel,
} from './pdga.js';
import { courseSkillLevel } from './layouts.js';
import { activeLayout, featureIndex, type Course } from './schema.js';

/**
 * How much land the course sits on, and what the PDGA says it needs.
 *
 * The [ACREAGE] chart has been transcribed since PR 4 and unused, for one
 * reason: it compares against the size of a property, and nothing in the
 * document described a property. A drawn `boundary` is that thing.
 *
 * ## Why the comparison is a range, not a number
 *
 * Every row of the chart publishes three course scales — Minimum (par ~56),
 * Average (~61) and Championship (~67) — and all three are legitimate. The app
 * cannot know which one a designer is building, so it reports whether the site
 * falls inside the span rather than picking a column and calling the others
 * wrong.
 *
 * ## Why foliage density has no default
 *
 * The chart is indexed by it, and it is the one thing about a property that
 * cannot be seen from the imagery or inferred from the drawing — it takes
 * someone who has walked the land. Three columns are published and none is
 * marked typical, so choosing one would be inventing guidance. With no density
 * set the area is still measured and reported; only the comparison is withheld.
 */

export interface CourseAcreage {
  /** Total enclosed by every boundary drawn, in square metres. */
  squareMeters: number;
  acres: number;
  /** How many boundary polygons that came from. Zero means nothing is drawn. */
  boundaryCount: number;
  /** The density the designer set, when they have set one. */
  density: FoliageDensity | null;
  /** The level the course plays at, from its tee colours. */
  skill: SkillLevel | null;
  /** What [ACREAGE] publishes for that level and density, when both are known. */
  guidance: AcreageRange | null;
  /** Which side of the published span the site falls on, if either. */
  verdict: 'below' | 'inside' | 'above' | null;
}

const densityOf = (feature: Feature): FoliageDensity | null => {
  const value = feature.props['foliage'];
  return value === 'scattered' || value === 'average' || value === 'corridor' ? value : null;
};

export function courseAcreage(course: Course): CourseAcreage {
  const boundaries = course.features.filter((f) => f.kind === 'boundary');
  const squareMeters = boundaries.reduce((total, f) => total + (featureArea(f) ?? 0), 0);
  const acres = squareMetersToAcres(squareMeters);

  /*
   * The density comes from the largest boundary that declares one.
   *
   * A site is usually one polygon, but it can be several — a park split by a
   * road, a parcel plus an easement — and they need not agree. The biggest is
   * the one that describes most of the ground the course sits on, which is the
   * only defensible way to pick without asking a question the interface has not
   * asked.
   */
  const declared = boundaries
    .filter((f) => densityOf(f) !== null)
    .sort((a, b) => (featureArea(b) ?? 0) - (featureArea(a) ?? 0));
  const density = declared[0] ? densityOf(declared[0]) : null;

  const featureById = featureIndex(course);
  const skill = courseSkillLevel(activeLayout(course), course.features, featureById);
  const guidance = skill && density ? acreageRange(skill, density) : null;

  const verdict =
    guidance === null || boundaries.length === 0
      ? null
      : acres < guidance.minAcres
        ? 'below'
        : acres > guidance.maxAcres
          ? 'above'
          : 'inside';

  return {
    squareMeters,
    acres,
    boundaryCount: boundaries.length,
    density,
    skill,
    guidance,
    verdict,
  };
}

/**
 * The hole mix each published column assumes, for explaining a comparison.
 *
 * Worth surfacing: a site "below" the chart is not too small full stop, it is
 * too small for eighteen holes at the mix the chart assumes. A designer fitting
 * twelve holes on it is doing something the chart simply does not cover.
 */
export { ACREAGE_HOLE_MIX };
