import { Accordion, AccordionGroup, TextArea, cn } from '@hyzerlines/design';
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
import { Row, SectionTitle, ToggleRow, fieldWidth, selectClass } from './propertyRow';

/**
 * What the app has worked out about the course, and what it draws.
 *
 * Everything here folds. The panel used to be a stack of six sections that
 * only ever grew, and it had reached the point where it filled its column and
 * squeezed the hole list out — a permanent cost for information that is read
 * a few times a session. Folded, each section says what it is holding in one
 * line and opens when you want the rest.
 *
 * One at a time, because they share a bounded column with the hole list: two
 * open sections is enough to start squeezing it, which is the problem folding
 * was introduced to solve. See `AccordionGroup`.
 *
 * ## No sub-headings
 *
 * Analysis used to be three titled groups — Skill level, Site, Features — of
 * one or two rows each. A heading over a single row says the same word twice
 * in two type sizes, and the nesting made a folded section that opens into
 * more folded-looking structure. The heading is now the row's label: `Plays
 * as` became `Skill level`, `Drawn` became `Features drawn`.
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
  onDrawBoundary,
}: {
  course: Course;
  units: UnitSystem;
  onOp: (op: Op) => void;
  onUnitsChange: (units: UnitSystem) => void;
  /** Arms the boundary tool, for the prompt shown when there is no site yet. */
  onDrawBoundary: () => void;
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
    <AccordionGroup>
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
        <Row label="Skill level">
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
          The site.

          Without a boundary this used to disappear entirely, which was right
          about not printing "0 acres" — that reads as a measurement of a
          property rather than the absence of one — and wrong about everything
          else. Acreage is one of the two headline numbers in this section and
          the preview promises it; a row that vanishes leaves no trace of what
          is missing or how to get it. So the row stays and carries the action
          that fills it, which also happens to be the only place in the app
          that explains why you would draw a boundary at all.
        */}
        {acreage.boundaryCount > 0 ? (
          <>
            <Row label="Site area">
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
          </>
        ) : (
          <>
            <Row label="Site area">
              <button
                type="button"
                onClick={onDrawBoundary}
                className="text-xs text-text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                Draw a property boundary
              </button>
            </Row>
            <p className="mt-1 text-2xs leading-4 text-text-muted">
              Trace the land you have to work with and the app measures it, then compares the
              acreage against the PDGA chart for a course of this level.
            </p>
          </>
        )}

        <Row label="Features drawn">
          <span className="font-mono text-xs tabular-nums text-text-primary">
            {course.features.length}
          </span>
        </Row>
      </Accordion>

      {/*
        Settings, not "Show on map" — the drawing aids were the first thing to
        go in here and they will not be the last, and a section named after its
        current contents has to be renamed the moment anything else arrives.
      */}
      <Accordion title="Settings">
        {/*
          A picker, not a switch. Everything below this is a thing that is
          either drawn or not — a switch is the right control for those — but
          units is a choice between two named systems, and "Feet and acres:
          off" does not name the thing you get instead.

          Not in the document, either. Feet or meters is a fact about the
          reader, not about the course: a US club and a European one should be
          able to open the same file and each see it in the units they think
          in. So it lives in localStorage and travels with the browser, while
          the aids below travel with the file.
        */}
        <Row label="Units">
          <select
            aria-label="Units"
            value={units}
            onChange={(e) => onUnitsChange(e.target.value === 'metric' ? 'metric' : 'imperial')}
            className={cn(selectClass, fieldWidth, 'truncate')}
          >
            <option value="imperial">Feet and acres</option>
            <option value="metric">Meters and hectares</option>
          </select>
        </Row>

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
        <TextArea
          label="Course notes"
          size="sm"
          value={course.notes}
          rows={4}
          placeholder="Anything worth remembering — access, permissions, the tree that has to go."
          onChange={(e) => onOp({ type: 'setNotes', notes: e.target.value })}
          className="w-full text-xs leading-5"
        />
      </Accordion>
    </AccordionGroup>
  );
}
