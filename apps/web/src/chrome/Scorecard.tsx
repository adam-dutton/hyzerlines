import { cn } from '@hyzerlines/design';
import { holeName, type Course, type Op, type Scorecard as Card } from '@hyzerlines/core';

import { toFeet, type UnitSystem } from '../units';
import { ParCell } from './ParCell';

/** Which number the cells hold. */
export type CardMode = 'length' | 'par';

/**
 * The course as a card, when a course has more than one tee.
 *
 * A hole with three tees has three lengths, and the list this sits beside shows
 * one of them — the representative pair — with the other two present in the
 * file and visible nowhere. This is the form a real course prints, and the only
 * one that answers the question multiple tees exist to ask: *is the red course
 * too long?*
 *
 * ## Lengths, not pars, and bare numbers
 *
 * The column is 44px wide and a cell cannot legibly hold two numbers. Length is
 * the one that varies most between tees and the one a designer is comparing;
 * par per tee is in the totals row and, per pair, in the hole panel where it is
 * editable.
 *
 * The cells carry no unit, which is how every printed card works and is not
 * only a convention: "1476 ft" wraps onto two lines in this width and turns an
 * eighteen-row card into thirty-six rows of half-numbers. The unit is stated
 * once, on the total.
 *
 * ## Two cards, not one crowded one
 *
 * A printed scorecard has a length row and a par row per hole, which needs
 * twice the width this panel has. So the cells hold one number and a control
 * says which — and switching to par turns every cell into the editor for
 * *that column's* pair, which is the only place a three-tee hole's three pars
 * can be set. The hole panel edits one shot at a time; this edits the shot the
 * column names, which is what makes a par table a thing you can fill in.
 *
 * ## Only when it earns the space
 *
 * One column is one tee per hole, which the plain list already showed correctly.
 * `hasMultipleTees` gates this, so a course nobody has classified keeps the
 * simpler thing rather than getting a table with a single column and a header
 * that says nothing.
 */
export function Scorecard({
  course,
  card,
  units,
  mode,
  selectedHoleId,
  onSelectHole,
  onOp,
}: {
  course: Course;
  card: Card;
  units: UnitSystem;
  mode: CardMode;
  selectedHoleId: string | null;
  onSelectHole: (id: string | null) => void;
  onOp: (op: Op) => void;
}) {
  const cell = 'w-11 text-right text-2xs tabular-nums';
  const suffix = units === 'metric' ? 'm' : 'ft';

  /** Bare, because the unit is on the total. See the note above. */
  const length = (meters: number) =>
    Math.round(units === 'metric' ? meters : toFeet(meters)).toLocaleString();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/*
        A real table, not a grid of divs: this is tabular data, the header cells
        name their columns, and a screen reader reading "Red, 310 ft" depends on
        that association existing rather than being implied by position.
      */}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-t border-border-subtle">
            <th scope="col" className="w-5 pl-3" />
            <th scope="col" className="text-left text-2xs font-normal text-text-muted">
              Hole
            </th>
            {card.columns.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={cn(cell, 'py-1 pr-2 font-normal text-text-muted')}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {card.rows.map(({ hole, cells }) => {
            const selected = hole.id === selectedHoleId;
            return (
              <tr
                key={hole.id}
                onClick={() => onSelectHole(selected ? null : hole.id)}
                className={cn(
                  'cursor-pointer border-t border-border-subtle',
                  'transition-colors duration-fast hover:bg-surface-hover',
                  selected && 'bg-surface-selected',
                )}
              >
                <td className="w-5 py-1.5 pl-3 text-2xs tabular-nums text-text-muted">
                  {hole.number}
                </td>
                <td className="max-w-0 truncate pr-1 text-xs text-text-primary">
                  {holeName(hole)}
                </td>
                {cells.map((view, index) => (
                  <td
                    key={card.columns[index]!.label}
                    className={cn(cell, 'pr-2 text-text-secondary')}
                    /* The par control is a select, and a click on it must not
                       also select the row underneath — it would frame the hole
                       every time somebody set a par. */
                    onClick={mode === 'par' ? (e) => e.stopPropagation() : undefined}
                  >
                    {/* An em dash, not a blank: a hole with no tee at this level
                        is the normal shape of a real course — eighteen whites
                        and nine reds — and an empty cell reads as a bug. */}
                    {mode === 'par' ? (
                      <ParCell
                        course={course}
                        hole={hole}
                        view={view}
                        onOp={onOp}
                        label={`Par for ${holeName(hole)}, ${card.columns[index]!.label}`}
                        className="w-full"
                      />
                    ) : view?.measurement.effective == null ? (
                      '—'
                    ) : (
                      length(view.measurement.effective)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr className="border-t border-border-default">
            <td className="pl-3" />
            <td className="py-1.5 pr-1 text-2xs text-text-muted">
              {mode === 'par' ? 'Total par' : `Total ${suffix}`}
            </td>
            {card.totals.map((total, index) => (
              <td
                key={card.columns[index]!.label}
                className={cn(cell, 'pr-2 text-text-primary')}
              >
                {total.holes === 0 ? '—' : mode === 'par' ? total.par : length(total.length)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="pl-3" />
            <td className="pb-1.5 pr-1 text-2xs text-text-muted">
              {mode === 'par' ? `Total ${suffix}` : 'Par'}
            </td>
            {card.totals.map((total, index) => (
              <td
                key={card.columns[index]!.label}
                className={cn(cell, 'pb-1.5 pr-2 text-text-secondary')}
              >
                {total.holes === 0 ? '—' : mode === 'par' ? length(total.length) : total.par}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      <PartialColumnNote card={card} holes={card.rows.length} />
    </div>
  );
}

/**
 * Say when a column's total is not a whole round.
 *
 * A red tee on six of eighteen holes totals six holes' length, and printing
 * that under a card of eighteen without saying so overstates the course by a
 * factor of three. The card cannot show it — every cell is already a number —
 * so it is said in words, and only when it is true.
 */
function PartialColumnNote({ card, holes }: { card: Card; holes: number }) {
  const partial = card.columns
    .map((column, index) => ({ column, total: card.totals[index]! }))
    .filter(({ total }) => total.holes > 0 && total.holes < holes);

  if (partial.length === 0) return null;

  return (
    <p className="px-3 py-2 text-2xs leading-4 text-text-muted">
      {partial
        .map(({ column, total }) => `${column.label} covers ${total.holes} of ${holes} holes`)
        .join('; ')}
      .
    </p>
  );
}
