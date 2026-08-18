import { useRef } from 'react';
import { cn } from '@hyzerlines/design';
import { VERTICAL_UNIT_LABELS } from '@hyzerlines/core';

import type { SurveyState } from '../survey/useSurvey';
import { formatDistance, type UnitSystem } from '../units';

/**
 * Importing elevation for this site.
 *
 * The section that turns the terrain overlays from "roughly ten metres,
 * everywhere" into "one metre, here". It sits under the terrain switches
 * because that is what it changes: the switches stay where they are and the
 * data behind them gets better.
 *
 * ## Why this exists as an import rather than a service
 *
 * Nobody is going to host a global 1m tileset. But USGS 3DEP publishes 1m
 * LiDAR for most of the United States and the Environment Agency does for all
 * of England, both public domain, and a course is about a square kilometre. So
 * the file comes from the designer and the tiling happens in this tab — no
 * backend, no API key, no per-request cost, and it works anywhere LiDAR is
 * published rather than only where we built an integration.
 *
 * The hint names the two places to get a file. A drop target with no answer to
 * "where do I get one of these" is a dead end dressed as a feature.
 */

const PHASE_LABEL: Record<string, string> = {
  reading: 'Reading the file',
  projecting: 'Reprojecting',
  tiling: 'Building tiles',
  storing: 'Saving',
};

export function SurveySection({
  state,
  units,
  onImport,
  onRemove,
  onDismissError,
}: {
  state: SurveyState;
  units: UnitSystem;
  onImport: (file: File) => void;
  onRemove: (name?: string) => void;
  onDismissError: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border-t border-border-subtle px-3 pb-2 pt-2">
      <p className="pb-1 text-xs font-semibold text-text-primary">Site survey</p>

      {/* Hidden and driven by a button: a bare file input cannot be styled to
          match anything, and its "No file chosen" is a caption nobody asked
          for. The button carries the accessible name. */}
      <input
        ref={inputRef}
        type="file"
        accept=".tif,.tiff,image/tiff"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so choosing the same file twice fires again — otherwise a
          // failed import cannot be retried without picking something else.
          e.target.value = '';
          if (file) onImport(file);
        }}
      />

      {state.status === 'importing' && (
        <div role="status" aria-live="polite">
          <p className="text-xs text-text-secondary">
            {PHASE_LABEL[state.progress.phase] ?? 'Working'}
            {state.progress.ratio !== null && ` — ${Math.round(state.progress.ratio * 100)}%`}
          </p>
          {/* A determinate bar only once there is a real ratio. A bar that
              guesses is worse than a sentence that does not. */}
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-inset">
            <div
              className={cn(
                'h-full rounded-full bg-accent-solid transition-[width] duration-normal',
                state.progress.ratio === null && 'w-1/3 animate-pulse',
              )}
              style={
                state.progress.ratio === null
                  ? undefined
                  : { width: `${Math.round(state.progress.ratio * 100)}%` }
              }
            />
          </div>
        </div>
      )}

      {state.status === 'ready' && (
        <div>
          {/*
            The survey as a whole, then the files it is made of.

            A course is routinely larger than one published LiDAR tile — county
            downloads arrive as a grid — so this is a list rather than a line.
            The summary above it is what is true of all of them together, which
            is what the designer is actually measuring on.
          */}
          <p className="text-2xs text-text-muted">
            {/* The resolution actually achieved, and the coarsest of them: a
                survey is only as good as its worst tile where that tile is. */}
            {formatDistance(state.survey.resolutionMeters, units)} detail
            {state.survey.sources.length > 1 && ` · ${state.survey.sources.length} files`}
          </p>

          <ul className="mt-1 space-y-1.5">
            {state.survey.sources.map((source) => (
              <li key={source.name} className="border-l border-border-subtle pl-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs text-text-primary" title={source.name}>
                    {source.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRemove(source.name)}
                    aria-label={`Remove ${source.name}`}
                    className="shrink-0 text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    Remove
                  </button>
                </div>
                {/* The projection's published name where we have it — the thing
                    a designer can check against what they exported, and it says
                    outright when a survey came in feet. */}
                <p className="truncate text-2xs text-text-muted" title={source.crsName}>
                  {source.crsName || source.crs}
                </p>
                {/*
                  The vertical unit, and whether the file said so.

                  Worth its own line because it is the one thing here that can
                  be wrong while everything else looks right. A GeoTIFF need not
                  declare `VerticalUnitsGeoKey` and most do not, so a file whose
                  coordinates are in feet has its heights read as feet — correct
                  essentially always, and still an inference worth checking
                  against ground you know. Read as metres instead, a 6,700 ft
                  Colorado course reports 22,000.
                */}
                <p className="truncate text-2xs text-text-muted">
                  Heights in {VERTICAL_UNIT_LABELS[source.verticalUnit]}
                  {source.verticalUnitDeclared ? '' : ', inferred from its coordinates'}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-1.5 flex items-center gap-3">
            {/*
              Adding is the primary action now, and removing everything is the
              secondary one — a survey grows a file at a time, and the common
              next step after importing one tile of a county grid is importing
              the one next to it.
            */}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-2xs text-text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Add another GeoTIFF
            </button>
            <button
              type="button"
              onClick={() => onRemove()}
              className="text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {state.survey.sources.length > 1 ? 'Remove all' : 'Remove survey'}
            </button>
          </div>
        </div>
      )}

      {state.status === 'absent' && (
        <div>
          {/* Named individually, because getting them back means finding them
              again — and a survey of four county tiles is four downloads. */}
          <ul className="space-y-0.5">
            {state.survey.sources.map((source) => (
              <li
                key={source.name}
                className="truncate text-xs text-text-disabled"
                title={source.name}
              >
                {source.name}
              </li>
            ))}
          </ul>
          {/*
            Not an error. A `.hyzer` carries the survey's metadata and not its
            pixels, so opening a course somebody sent you lands here every time
            — the right response is to say what is missing and how to supply it.
          */}
          <p className="mt-0.5 text-2xs leading-4 text-text-muted">
            This course was designed against{' '}
            {state.survey.sources.length > 1 ? 'surveys that are' : 'a survey that is'} not on
            this device. Import the same {state.survey.sources.length > 1 ? 'files' : 'file'} to
            see it again.
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1 text-2xs text-text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Choose a GeoTIFF
          </button>
        </div>
      )}

      {state.status === 'failed' && (
        <div role="alert">
          <p className="text-2xs leading-4 text-status-warning">{state.message}</p>
          <button
            type="button"
            onClick={onDismissError}
            className="mt-1 text-2xs text-text-muted underline-offset-2 hover:text-text-secondary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Try another file
          </button>
        </div>
      )}

      {state.status === 'none' && (
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs text-text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Import a GeoTIFF
          </button>
          <p className="mt-1 text-2xs leading-4 text-text-muted">
            LiDAR at 1m, for this site only. Free from{' '}
            <a
              href="https://apps.nationalmap.gov/downloader/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-text-secondary"
            >
              The National Map
            </a>{' '}
            in the US, or the{' '}
            <a
              href="https://environment.data.gov.uk/survey"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-text-secondary"
            >
              Environment Agency
            </a>{' '}
            in England.
          </p>
        </div>
      )}
    </div>
  );
}
