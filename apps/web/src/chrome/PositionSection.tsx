import { useState } from 'react';
import { TextField } from '@hyzerlines/design';
import {
  anchorOf,
  formatCoordinate,
  moveFeatureTo,
  parseCoordinate,
  parsePosition,
  type Course,
  type Feature,
  type Op,
  type Position,
} from '@hyzerlines/core';

import { Row, SectionTitle, sectionClass } from './propertyRow';

/**
 * Where a feature is, in coordinates, and a way to put it somewhere exact.
 *
 * The map is the right tool for "about here" and the wrong one for "exactly
 * here". A basket surveyed with a handheld GPS, a tee whose position came off a
 * permit drawing, a mando the parks department specified to the foot — all of
 * those arrive as numbers, and until now the only way to enter one was to
 * squint at satellite imagery and click.
 *
 * ## Latitude first, always
 *
 * The document stores `[lng, lat]` because GeoJSON does. Every human-facing
 * surface here is latitude first, because every source a designer copies from
 * writes it that way. The transposition happens in `coordinates.ts` and
 * nowhere else.
 *
 * ## Pasting a pair into one box
 *
 * "Copy coordinates" in Google Maps gives you `44.901234, -93.123457` as one
 * string, and the overwhelmingly likely thing to do with it is paste it into
 * the first field you see. Taking the first number and dropping the second
 * would move the feature a hundred kilometres with nothing on screen to say so
 * — so either field accepts a whole pair and fills in both.
 */

/**
 * What the anchor means for each kind of geometry.
 *
 * Not one label, because it is not one thing: `anchorOf` gives a point's own
 * position, a line's first vertex and an area's centroid. Calling all three
 * "Position" would be vague where it matters — a designer typing coordinates
 * into a boundary needs to know they are placing its middle, not its corner.
 */
const ANCHOR_LABEL = {
  point: 'Position',
  line: 'Start',
  polygon: 'Center',
} as const;

const ANCHOR_HINT = {
  point: null,
  line: 'The first vertex. Setting it moves the whole line.',
  polygon: 'The middle of the shape. Setting it moves the whole area.',
} as const;

/**
 * One coordinate, edited as text and committed only when it parses.
 *
 * A draft while focused, like `DegreeField`: a controlled value formatted to
 * six decimals on every keystroke would fight the cursor, and deleting the
 * minus sign to retype it would immediately snap the feature to the northern
 * hemisphere. So the feature moves on blur or Enter, once, from text that has
 * been read successfully — and text that cannot be read is reverted rather
 * than applied, because there is no sensible half-way position to move to.
 */
function CoordinateField({
  label,
  axis,
  value,
  onCommit,
  onCommitPair,
}: {
  label: string;
  axis: 'latitude' | 'longitude';
  value: number;
  onCommit: (degrees: number) => void;
  /** A whole position pasted into this one field. See the note above. */
  onCommitPair: (position: Position) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const formatted = formatCoordinate(value);

  const commit = (text: string) => {
    setDraft(null);
    if (text.trim() === '') return;

    // A pair wins over a single coordinate: `44.9, -93.1` read as a latitude
    // alone would be a silent, hundred-kilometre error.
    const pair = parsePosition(text);
    if (pair) {
      onCommitPair(pair);
      return;
    }

    const parsed = parseCoordinate(text, axis);
    if (parsed !== null) onCommit(parsed);
  };

  return (
    <TextField
      label={label}
      size="sm"
      type="text"
      inputMode="decimal"
      spellCheck={false}
      value={draft ?? formatted}
      onFocus={() => setDraft(formatted)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        // Escape abandons the edit, matching every other field in the app.
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
      className="text-right tabular-nums"
    />
  );
}

export function PositionSection({
  course,
  feature,
  onOp,
}: {
  course: Course;
  feature: Feature;
  onOp: (op: Op) => void;
}) {
  const anchor = anchorOf(feature);
  const kind = feature.geometry.type;
  const hint = ANCHOR_HINT[kind];

  /*
   * `moveFeatureTo` rather than a raw `setGeometry`, so typing coordinates is
   * the same edit as dragging: a line or an area is translated whole rather
   * than having one vertex yanked, and a tee that moves takes its fairways
   * with it. One path for "this feature is now over there" means a coordinate
   * typed in and a feature dragged cannot disagree about what happens next.
   */
  const moveTo = (position: Position) => {
    const op = moveFeatureTo(course, feature.id, position);
    if (op) onOp(op);
  };

  return (
    <div className={sectionClass}>
      <SectionTitle>{ANCHOR_LABEL[kind]}</SectionTitle>

      <Row label="Latitude">
        <CoordinateField
          label="Latitude"
          axis="latitude"
          value={anchor[1]}
          onCommit={(latitude) => moveTo([anchor[0], latitude])}
          onCommitPair={moveTo}
        />
      </Row>

      <Row label="Longitude">
        <CoordinateField
          label="Longitude"
          axis="longitude"
          value={anchor[0]}
          onCommit={(longitude) => moveTo([longitude, anchor[1]])}
          onCommitPair={moveTo}
        />
      </Row>

      {hint && <p className="mt-1 text-2xs leading-4 text-text-muted">{hint}</p>}
    </div>
  );
}
