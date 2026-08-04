import {
  coursePar,
  courseLength,
  COURSE_LENGTH_FT,
  COURSE_LENGTH_HOLE_COUNT,
  feetToMeters,
  SKILL_LEVELS,
  SKILL_LEVEL_INFO,
  type Course,
  type Op,
  type SkillLevel,
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
  const totalLength = courseLength(course, holes);
  const range = COURSE_LENGTH_FT[course.skillLevel];

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
        <Row label="Skill level">
          <select
            aria-label="Skill level this course is designed for"
            value={course.skillLevel}
            onChange={(e) =>
              onOp({ type: 'setSkillLevel', skillLevel: e.target.value as SkillLevel })
            }
            className="rounded-md border border-border-default bg-surface-inset px-2 py-1 text-xs text-text-primary focus:border-border-accent focus:outline-none focus:ring-2 focus:ring-focus-ring/40"
          >
            {SKILL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {SKILL_LEVEL_INFO[level].label}
              </option>
            ))}
          </select>
        </Row>
        {/* The rating band is the thing that actually makes the level mean
            something. "White" is a colour; "875+ rated" is a decision. */}
        <p className="text-2xs leading-4 text-text-muted">
          Par bands and length ranges follow the PDGA tables for{' '}
          {SKILL_LEVEL_INFO[course.skillLevel].label} —{' '}
          {SKILL_LEVEL_INFO[course.skillLevel].ratingDescription} rated players.
        </p>
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
            {holes.length === 0 ? '—' : coursePar(course, holes)}
          </span>
        </Row>
        <Row label="Length">
          <span className="font-mono text-xs tabular-nums text-text-primary">
            {holes.length === 0 ? '—' : formatDistance(totalLength, units)}
          </span>
        </Row>
        {/* The PDGA quotes this range for 18 holes and gives no per-hole
            figure, so it is shown as context at any hole count but only
            checked — in the findings list — at eighteen. */}
        <p className="text-2xs leading-4 text-text-muted">
          Typical {SKILL_LEVEL_INFO[course.skillLevel].label} course over{' '}
          {COURSE_LENGTH_HOLE_COUNT} holes:{' '}
          {formatRange(feetToMeters(range.min), feetToMeters(range.max), units)}.
        </p>
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
