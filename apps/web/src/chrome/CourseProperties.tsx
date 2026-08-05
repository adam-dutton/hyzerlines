import { TextField } from '@hyzerlines/design';
import {
  activeLayout,
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

import { formatDistance, formatRange, type UnitSystem } from '../units';
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
