import { TextField } from '@hyzerlines/design';
import {
  activeLayout,
  courseAcreage,
  featureIndex,
  isLayoutPlayable,
  courseSkillLevel,
  COURSE_LENGTH_FT,
  COURSE_LENGTH_HOLE_COUNT,
  feetToMeters,
  totalLength,
  totalPar,
  viewHoles,
  SKILL_LEVEL_INFO,
  type Course,
  type Op,
} from '@hyzerlines/core';

import { formatArea, formatDistance, formatRange, type UnitSystem } from '../units';
import { Row, SectionTitle, sectionClass } from './propertyRow';

/**
 * The course itself — what the right panel shows when nothing is selected.
 *
 * An inspector that goes blank the moment you deselect wastes the most valuable
 * column on screen exactly when you have stepped back to look at the whole
 * thing. Deselecting is when course-level questions get asked, so that is what
 * this answers.
 */
export function CourseProperties({
  course,
  units,
  onOp,
}: {
  course: Course;
  units: UnitSystem;
  onOp: (op: Op) => void;
}) {
  const holes = course.holes;
  const views = viewHoles(course, holes);
  const length = totalLength(views.values());

  const acreage = courseAcreage(course);
  const layout = activeLayout(course);
  const featureById = featureIndex(course);
  const skill = courseSkillLevel(layout, course.features, featureById);
  const playable = layout ? isLayoutPlayable(layout, featureById) : true;
  const range = skill ? COURSE_LENGTH_FT[skill] : null;

  return (
    <>
      {/*
        No name field here.

        The top bar already owns the course name, it is always visible, and this
        panel's own header shows it. A second editable control for the same
        value, on screen at the same time, only invites the question of which
        one is authoritative.
      */}
      <div className={sectionClass}>
        <Row label="Notes">
          <TextField
            label="Course notes"
            size="sm"
            value={course.notes}
            placeholder="Anything worth remembering"
            onChange={(e) => onOp({ type: 'setNotes', notes: e.target.value })}
            className="w-36"
          />
        </Row>
      </div>

      {/*
        The skill level is read, not chosen.

        It comes from the tee colours — [ELEMENTS] p3 says a tee's colour IS the
        level it was built for — so offering a separate course-wide picker would
        be a second source of truth that could disagree with the tees on the map.
        A layout mixing colours has no level at all, and says so rather than
        averaging two published tables into a number that is in neither.
      */}
      <div className={sectionClass}>
        <SectionTitle>Skill level</SectionTitle>
        <Row label="Plays as">
          <span className="text-xs text-text-primary">
            {skill ? SKILL_LEVEL_INFO[skill].label : 'Mixed'}
          </span>
        </Row>
        <p className="text-2xs leading-4 text-text-muted">
          {skill
            ? `Par bands and length ranges follow the PDGA tables for ${SKILL_LEVEL_INFO[skill].label} — ${SKILL_LEVEL_INFO[skill].ratingDescription} rated players.`
            : 'Tees are set to more than one colour, so no PDGA level applies. Par is still read from each tee’s own colour.'}
        </p>
        {!playable && (
          <p className="mt-1 text-2xs leading-4 text-status-warning">
            Not playable as it stands — a tee or target is marked position only.
          </p>
        )}
      </div>

      <div className={sectionClass}>
        <SectionTitle>Totals</SectionTitle>
        <Row label="Holes">
          <span className="font-mono text-xs tabular-nums text-text-primary">
            {holes.length}
          </span>
        </Row>
        <Row label="Par">
          <span className="font-mono text-xs tabular-nums text-text-primary">
            {holes.length === 0 ? '—' : totalPar(views.values())}
          </span>
        </Row>
        <Row label="Length">
          <span className="font-mono text-xs tabular-nums text-text-primary">
            {holes.length === 0 ? '—' : formatDistance(length, units)}
          </span>
        </Row>
        {/* The PDGA quotes this range for 18 holes and gives no per-hole
            figure, so it is shown as context at any hole count but only
            checked — in the findings list — at eighteen. */}
        {skill && range && (
          <p className="text-2xs leading-4 text-text-muted">
            Typical {SKILL_LEVEL_INFO[skill].label} course over {COURSE_LENGTH_HOLE_COUNT}{' '}
            holes: {formatRange(feetToMeters(range.min), feetToMeters(range.max), units)}.
          </p>
        )}
      </div>

      {/*
        The site, once there is one to measure.

        Hidden entirely until a boundary is drawn rather than showing "0 acres",
        which would read as a measurement of a property rather than the absence
        of one.
      */}
      {acreage.boundaryCount > 0 && (
        <div className={sectionClass}>
          <SectionTitle>Site</SectionTitle>
          <Row label="Area">
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {formatArea(acreage.squareMeters, units)}
            </span>
          </Row>
          {acreage.boundaryCount > 1 && (
            <Row label="Boundaries">
              <span className="font-mono text-xs tabular-nums text-text-secondary">
                {acreage.boundaryCount}
              </span>
            </Row>
          )}

          {/*
            The comparison needs both a skill level and a foliage density, and
            says which is missing rather than going quiet. The chart is indexed
            by density and publishes three columns with none marked typical, so
            guessing one would be inventing guidance — see acreage.ts.
          */}
          {acreage.guidance ? (
            <p className="mt-1 text-2xs leading-4 text-text-muted">
              The PDGA chart gives {acreage.guidance.minAcres}–{acreage.guidance.maxAcres} acres
              for 18 {acreage.skill ? SKILL_LEVEL_INFO[acreage.skill].label : ''} holes in these
              woods
              {acreage.verdict === 'inside' ? ', which this fits.' : '.'}
            </p>
          ) : (
            <p className="mt-1 text-2xs leading-4 text-text-muted">
              {acreage.density === null
                ? 'Set the boundary’s foliage density to compare this against the PDGA acreage chart.'
                : 'Tees are set to more than one colour, so no acreage guidance applies.'}
            </p>
          )}
        </div>
      )}

      <div className={sectionClass}>
        <SectionTitle>Features</SectionTitle>
        <Row label="Drawn">
          <span className="font-mono text-xs tabular-nums text-text-primary">
            {course.features.length}
          </span>
        </Row>
      </div>
    </>
  );
}
