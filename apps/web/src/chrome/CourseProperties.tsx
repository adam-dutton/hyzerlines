import { Accordion } from '@hyzerlines/design';
import {
  activeLayout,
  courseAcreage,
  featureIndex,
  isLayoutPlayable,
  courseSkillLevel,
  COURSE_LENGTH_FT,
  COURSE_LENGTH_HOLE_COUNT,
  feetToMeters,
  SKILL_LEVEL_INFO,
  TARGET_CIRCLES,
  type Course,
  type Display,
  type Op,
} from '@hyzerlines/core';

import { formatArea, formatRange, type UnitSystem } from '../units';
import { Row, SectionTitle, ToggleRow } from './propertyRow';

/**
 * What the app has worked out about the course, and what it draws.
 *
 * Everything here folds. The panel used to be a stack of six sections that
 * only ever grew, and it had reached the point where it filled its column and
 * squeezed the hole list out — a permanent cost for information that is read
 * a few times a session. Folded, each section says what it is holding in one
 * line and opens when you want the rest.
 *
 * The totals that used to sit here are gone. `9 · Par 28 · 2545 ft` is now the
 * course header's subheading, next to the name it describes, which is where
 * you look for it anyway.
 */
export function CourseProperties({
  course,
  units,
  onOp,
  onUnitsChange,
}: {
  course: Course;
  units: UnitSystem;
  onOp: (op: Op) => void;
  onUnitsChange: (units: UnitSystem) => void;
}) {
  const acreage = courseAcreage(course);
  const layout = activeLayout(course);
  const featureById = featureIndex(course);
  const skill = courseSkillLevel(layout, course.features, featureById);
  const playable = layout ? isLayoutPlayable(layout, featureById) : true;
  const range = skill ? COURSE_LENGTH_FT[skill] : null;

  const display = course.display;
  const setDisplay = (changes: Partial<Display>) => onOp({ type: 'setDisplay', changes });

  /*
   * The closed-state summary: the level and the acreage, the two answers
   * anybody opens this for. Without it, "Analysis" is a section you have to
   * open to find out whether it is worth opening.
   */
  const analysisPreview = [
    skill ? SKILL_LEVEL_INFO[skill].label : 'Mixed tees',
    acreage.boundaryCount > 0 ? formatArea(acreage.squareMeters, units) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {/*
        Named for what it is rather than for where it came from. Skill level,
        site and feature count were three sections describing one thing: what
        the app has read off the drawing, none of it typed in.
      */}
      <Accordion title="Analysis" preview={analysisPreview}>
        {/*
          The skill level is read, not chosen.

          It comes from the tee colors — [ELEMENTS] p3 says a tee's color IS
          the level it was built for — so offering a separate course-wide
          picker would be a second source of truth that could disagree with the
          tees on the map. A layout mixing colors has no level at all, and says
          so rather than averaging two published tables into a number that is
          in neither.
        */}
        <SectionTitle>Skill level</SectionTitle>
        <Row label="Plays as">
          <span className="text-xs text-text-primary">
            {skill ? SKILL_LEVEL_INFO[skill].label : 'Mixed'}
          </span>
        </Row>
        <p className="text-2xs leading-4 text-text-muted">
          {skill
            ? `Par bands and length ranges follow the PDGA tables for ${SKILL_LEVEL_INFO[skill].label} — ${SKILL_LEVEL_INFO[skill].ratingDescription} rated players.`
            : 'Tees are set to more than one color, so no PDGA level applies. Par is still read from each tee’s own color.'}
        </p>
        {!playable && (
          <p className="mt-1 text-2xs leading-4 text-status-warning">
            Not playable as it stands — a tee or target is marked position only.
          </p>
        )}
        {/* The PDGA quotes this range for 18 holes and gives no per-hole
            figure, so it is shown as context at any hole count but only
            checked — in the findings list — at eighteen. */}
        {skill && range && (
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            Typical {SKILL_LEVEL_INFO[skill].label} course over {COURSE_LENGTH_HOLE_COUNT}{' '}
            holes: {formatRange(feetToMeters(range.min), feetToMeters(range.max), units)}.
          </p>
        )}

        {/*
          The site, once there is one to measure. Hidden entirely until a
          boundary is drawn rather than showing "0 acres", which would read as
          a measurement of a property rather than the absence of one.
        */}
        {acreage.boundaryCount > 0 && (
          <div className="mt-3">
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
                The PDGA chart gives {acreage.guidance.minAcres}–{acreage.guidance.maxAcres}{' '}
                acres for 18 {acreage.skill ? SKILL_LEVEL_INFO[acreage.skill].label : ''} holes
                in these woods
                {acreage.verdict === 'inside' ? ', which this fits.' : '.'}
              </p>
            ) : (
              <p className="mt-1 text-2xs leading-4 text-text-muted">
                {acreage.density === null
                  ? 'Set the boundary’s foliage density to compare this against the PDGA acreage chart.'
                  : 'Tees are set to more than one color, so no acreage guidance applies.'}
              </p>
            )}
          </div>
        )}

        <div className="mt-3">
          <SectionTitle>Features</SectionTitle>
          <Row label="Drawn">
            <span className="font-mono text-xs tabular-nums text-text-primary">
              {course.features.length}
            </span>
          </Row>
        </div>
      </Accordion>

      {/*
        Settings, not "Show on map" — the drawing aids were the first thing to
        go in here and they will not be the last, and a section named after its
        current contents has to be renamed the moment anything else arrives.
      */}
      <Accordion title="Settings">
        <SectionTitle>Units</SectionTitle>
        {/*
          Not in the document, unlike everything below it. Feet or meters is a
          fact about the reader, not about the course: a US club and a European
          one should be able to open the same file and each see it in the units
          they think in. So it lives in localStorage and travels with the
          browser, while the aids below travel with the file.
        */}
        <ToggleRow
          label="Feet and acres"
          checked={units === 'imperial'}
          onChange={(imperial) => onUnitsChange(imperial ? 'imperial' : 'metric')}
        />

        <div className="mt-3">
          <SectionTitle>Show on map</SectionTitle>
          <ToggleRow
            label="Fairways"
            checked={display.fairways}
            onChange={(fairways) => setDisplay({ fairways })}
          />
          <ToggleRow
            label="Lines"
            indent
            checked={display.fairwayLines}
            disabled={!display.fairways}
            onChange={(fairwayLines) => setDisplay({ fairwayLines })}
          />
          <ToggleRow
            label="Corridors"
            indent
            checked={display.fairwayAreas}
            disabled={!display.fairways}
            onChange={(fairwayAreas) => setDisplay({ fairwayAreas })}
          />

          <ToggleRow
            label="Putting circles"
            checked={display.circles}
            onChange={(circles) => setDisplay({ circles })}
          />
          {/* Named and ordered from TARGET_CIRCLES, so a ring the app draws can
              never be a ring this panel has no switch for. Outermost first,
              which is how they are read on the ground. */}
          {[...TARGET_CIRCLES].reverse().map((circle) => (
            <ToggleRow
              key={circle.id}
              label={circle.label}
              indent
              checked={display[circle.id]}
              disabled={!display.circles}
              onChange={(on) => setDisplay({ [circle.id]: on })}
            />
          ))}
        </div>
      </Accordion>

      {/*
        Notes last, and a textarea rather than a single line.

        It is the one field here that is genuinely open-ended — everything
        above is either derived or a switch — and a one-line input for
        something people write paragraphs into is a field that fights its own
        content. The preview carries the first line, so a closed section still
        says whether there is anything in it.
      */}
      <Accordion title="Notes" preview={course.notes.trim().split('\n')[0] ?? ''}>
        <textarea
          aria-label="Course notes"
          value={course.notes}
          rows={4}
          placeholder="Anything worth remembering — access, permissions, the tree that has to go."
          onChange={(e) => onOp({ type: 'setNotes', notes: e.target.value })}
          className={[
            'w-full resize-y rounded-lg border border-border-default bg-surface-inset',
            'px-2 py-1.5 text-xs leading-5 text-text-primary placeholder:text-text-muted',
            'focus:border-border-accent focus:outline-none focus:ring-2 focus:ring-focus-ring/40',
          ].join(' ')}
        />
      </Accordion>
    </>
  );
}
