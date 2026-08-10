import { cn } from '@hyzerlines/design';
import {
  holeName,
  setPairPar,
  type Course,
  type Hole,
  type Op,
  type PairView,
} from '@hyzerlines/core';

export function ParCell({
  course,
  hole,
  view,
  onOp,
  label,
  className,
}: {
  course: Course;
  hole: Hole;
  view: PairView | null;
  onOp: (op: Op) => void;
  /**
   * The accessible name, when the hole alone does not identify the shot.
   *
   * A three-tee hole has three of these in one row, and "Par for Hole 4" three
   * times is a screen reader reading the same control three times over.
   */
  label?: string;
  className?: string;
}) {
  const { suggestion = null, par = null, overridden = false } = view ?? {};

  if (view === null || par === null) {
    return (
      <span className={cn('text-right text-2xs text-text-disabled', className ?? 'w-10')}>
        —
      </span>
    );
  }

  /*
   * The reasoning is the point.
   *
   * A par number with no visible basis is either accepted blindly or ignored
   * entirely; neither is useful. The tooltip carries why, and says plainly when
   * the call is close enough to a band boundary to be arguable.
   */
  const why = suggestion
    ? [
        ...suggestion.factors.map((f) => f.label),
        suggestion.borderline ? 'Close to a band boundary — could go either way' : null,
        overridden ? `You set this to ${par}; suggested ${suggestion.par}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : undefined;

  return (
    <span
      className={cn('flex items-center justify-end gap-1', className ?? 'w-10')}
      {...(why ? { title: why } : {})}
    >
      {suggestion?.borderline && !overridden && (
        <span className="text-2xs text-text-muted" aria-hidden="true">
          ~
        </span>
      )}
      <select
        aria-label={label ?? `Par for ${holeName(hole)}`}
        value={par}
        onChange={(e) => {
          const value = Number(e.target.value);
          // Choosing the suggested value clears the override rather than
          // pinning it, so the pair keeps tracking the model unless the
          // designer actually disagrees with it.
          onOp(
            setPairPar(
              course,
              view.teeId,
              view.targetId,
              value === suggestion?.par ? null : value,
            ),
          );
        }}
        className={cn(
          'rounded bg-transparent px-1 py-0.5 font-mono text-xs tabular-nums',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
          overridden ? 'text-text-accent' : 'text-text-primary',
        )}
      >
        {[2, 3, 4, 5, 6].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </span>
  );
}
