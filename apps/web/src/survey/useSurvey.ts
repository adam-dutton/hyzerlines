import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addSurveySource,
  removeSurveySource,
  type Op,
  type SiteSurvey,
} from '@hyzerlines/core';

import { SurveyImportError, importSurvey, type ImportProgress } from './importer';
import { clearTiles, hasTiles, storeTiles } from './store';

/**
 * The survey, between the document and the map.
 *
 * Two things live here that neither side owns. The import itself, which is a
 * long-running job with progress and failure modes and has to survive the user
 * navigating around while it runs. And the reconciliation: the document says a
 * survey exists, IndexedDB says whether its tiles do, and the map has to be
 * told the truth of both.
 *
 * ## The missing-tiles case is normal, not an error
 *
 * A `.hyzer` carries the survey's metadata and not its pixels — deliberately,
 * because a document you email should not be forty megabytes. So opening a
 * course somebody sent you means having a survey record with nothing behind it,
 * and that is a thing to *say* rather than a thing to crash on. The panel shows
 * the survey greyed with "not on this device", and the map falls back to the
 * global overlay.
 *
 * ## No map in here
 *
 * Deliberately: this runs in the shell, above `MapCanvas`, and the layers it
 * implies are installed by `SurveyLayers` inside it. Doing both here meant
 * React's ordering worked against us — child effects run before parent ones, so
 * the canvas's own overlay effect ran *after* this one and put the global
 * terrain back every time the switches changed. State up top, layers below, and
 * the ordering stops mattering.
 */

export type SurveyState =
  | { status: 'none' }
  | { status: 'importing'; progress: ImportProgress }
  | { status: 'ready'; survey: SiteSurvey }
  /** The document has a survey; this browser does not have its tiles. */
  | { status: 'absent'; survey: SiteSurvey }
  | { status: 'failed'; message: string };

export function useSurvey({
  survey,
  onOp,
}: {
  survey: SiteSurvey | null;
  onOp: (op: Op) => void;
}) {
  const [state, setState] = useState<SurveyState>({ status: 'none' });

  /*
   * An import in flight must not be overwritten by reconciliation.
   *
   * The import dispatches `setSiteSurvey` at the end, which re-runs the effect
   * below — and if that effect were free to set state it would replace the
   * progress readout with a stale answer mid-write.
   */
  const importingRef = useRef(false);

  /** The survey as the document currently has it, for the import to build on. */
  const surveyRef = useRef<SiteSurvey | null>(survey);
  surveyRef.current = survey;

  // Reconcile: does the document's survey actually have tiles behind it?
  useEffect(() => {
    if (importingRef.current) return;
    if (!survey) {
      setState({ status: 'none' });
      return;
    }

    let cancelled = false;
    void hasTiles().then((present) => {
      if (cancelled) return;
      setState(present ? { status: 'ready', survey } : { status: 'absent', survey });
    });
    return () => {
      cancelled = true;
    };
  }, [survey]);

  const importFile = useCallback(
    async (file: File) => {
      importingRef.current = true;
      setState({ status: 'importing', progress: { phase: 'reading', ratio: null } });

      try {
        const result = await importSurvey(file, (progress) =>
          setState({ status: 'importing', progress }),
        );

        setState({ status: 'importing', progress: { phase: 'storing', ratio: null } });

        /*
         * Added to whatever is already there, not swapped for it.
         *
         * A course can be larger than one published LiDAR tile, so importing a
         * second file extends the survey. `existing` is read through the ref
         * rather than closed over, because the import takes seconds and the
         * document may have moved on — closing over it would silently drop a
         * file imported while this one was still tiling.
         */
        const existing = surveyRef.current;
        await storeTiles(result.tiles, { replace: existing === null });

        const record = addSurveySource(
          existing,
          result.source,
          result.zooms,
          new Date().toISOString(),
        );
        importingRef.current = false;
        onOp({ type: 'setSiteSurvey', survey: record });
        setState({ status: 'ready', survey: record });
      } catch (error) {
        importingRef.current = false;
        /*
         * A bad file is the user's problem to fix and the message has to help
         * them do it, so `SurveyImportError` carries prose written for someone
         * who chose a file. Anything else is ours and gets a generic line —
         * the stack is in the console for whoever is debugging.
         */
        if (error instanceof SurveyImportError) {
          setState({ status: 'failed', message: error.message });
        } else {
          console.error('Survey import failed', error);
          setState({
            status: 'failed',
            message: 'That file could not be read as elevation data.',
          });
        }
      }
    },
    [onOp],
  );

  /**
   * Remove the whole survey, or one file from it.
   *
   * Dropping one file leaves its tiles in the store, and that is deliberate:
   * the only way to remove them precisely would be to know which keys came from
   * which file, and a survey's files overlap. The remaining files still cover
   * their own ground, so what is left over is terrain outside the new bounds —
   * which MapLibre never asks for, because the sources carry those bounds.
   * Re-importing rewrites the same keys anyway.
   */
  const remove = useCallback(
    async (name?: string) => {
      const current = surveyRef.current;
      const next = name && current ? removeSurveySource(current, name) : null;

      if (next) {
        onOp({ type: 'setSiteSurvey', survey: next });
        setState({ status: 'ready', survey: next });
        return;
      }

      await clearTiles();
      onOp({ type: 'setSiteSurvey', survey: null });
      setState({ status: 'none' });
    },
    [onOp],
  );

  /** Dismiss a failure without touching the document. */
  const dismissError = useCallback(() => setState({ status: 'none' }), []);

  return { state, importFile, remove, dismissError };
}
