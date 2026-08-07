import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  fairwayLine,
  featureIndex,
  holePairings,
  pairElevationKey,
  sampleLine,
  summarizeProfile,
  type Course,
  type ElevationProfile,
  type PairElevations,
  type Position,
  type SiteSurvey,
} from '@hyzerlines/core';

import { profilePoints, tileCache, type ElevationSource } from './elevation';
import { MAX_DEM_ZOOM } from '../map/terrain';

/**
 * A ground profile for every shot on the course.
 *
 * Two jobs, and they are the same computation: the chart a designer looks at,
 * and the elevation term the PDGA's effective-length formula has been missing
 * since PR 4.
 *
 * ## Only a survey may move a par
 *
 * The global overlay draws a profile happily, and it is genuinely useful for
 * "does this fall left to right". It does **not** feed par. Its data is roughly
 * 10m posted in the US and 30m elsewhere, with vertical error that can reach
 * ±16m on SRTM — and the PDGA multiplies elevation by three. A par that moved
 * by two strokes because of a number that might be wrong by sixteen metres is
 * exactly the invented figure this project refuses to ship, and a designer
 * could take it to a parks department.
 *
 * An imported LiDAR survey is a different instrument: 10–20cm vertical, posted
 * at a metre. That one is allowed to change par, and the panel says which is in
 * use either way.
 *
 * ## Why a context rather than a hook per panel
 *
 * Three places need this — the scorecard, the course totals and the hole panel —
 * and they sit in different branches of the tree. Calling the hook in each would
 * read every tile three times and, worse, would let them disagree for as long as
 * their three async runs took to settle: a scorecard totalling one par while the
 * panel showed another. One computation, one answer.
 */

export interface HoleProfile {
  profile: ElevationProfile;
  source: ElevationSource;
  /** Whether this profile's elevation is feeding the par suggestion. */
  feedsPar: boolean;
}

export type HoleProfiles = ReadonlyMap<string, HoleProfile>;

export interface ProfileState {
  /** Keyed by `pairElevationKey`. Absent means "not computed", not "flat". */
  profiles: HoleProfiles;
  /** The subset core may price into par. Pass straight to `viewHoles`. */
  elevations: PairElevations;
  /** A pass is in flight. Distinguishes "still reading" from "no data here". */
  loading: boolean;
}

const empty: ProfileState = { profiles: new Map(), elevations: new Map(), loading: false };

/**
 * How long the geometry must hold still before the tiles are read.
 *
 * Dragging a tee dispatches an op per pointer move, and each one changes the
 * line — so without this a single drag would decode the same tiles thirty times
 * a second and throw away all but the last answer. Nobody reads a profile
 * mid-drag; they read it when they let go.
 *
 * Short enough that letting go feels immediate, long enough to cover a drag's
 * frame interval by a wide margin.
 */
const SETTLE_MS = 120;

const ProfileContext = createContext<ProfileState>(empty);

/** The profiles, or empty outside the provider — never a thrown error. */
export function useProfiles(): ProfileState {
  return useContext(ProfileContext);
}

/** One shot's profile, or null. The hole panel's whole interest in this module. */
export function useHoleProfile(
  pair: { teeId: string; targetId: string } | null,
): HoleProfile | null {
  const { profiles } = useProfiles();
  if (!pair) return null;
  return profiles.get(pairElevationKey(pair.teeId, pair.targetId)) ?? null;
}

export function ProfileProvider({
  course,
  survey,
  children,
}: {
  course: Course;
  /**
   * A survey whose tiles are actually on this device, or null.
   *
   * One prop rather than a record plus a ready flag, so there is no state in
   * which the two disagree — "the document names a survey" and "this browser
   * can read it" are different facts, and only the second one may move a par.
   */
  survey: SiteSurvey | null;
  children: React.ReactNode;
}) {
  const [profiles, setProfiles] = useState<HoleProfiles>(empty.profiles);
  const [loading, setLoading] = useState(false);

  /*
   * Every shot, not just the one the map is drawing.
   *
   * `courseFairways` picks one pairing per hole because nine overlapping
   * corridors down one strip of land is unreadable. A profile has no such
   * problem — it is read one at a time — and the pin picker must not have to
   * wait for a fresh tile read every time it moves.
   */
  const lines = useMemo(() => {
    const featureById = featureIndex(course);
    const out: { key: string; line: Position[] }[] = [];
    for (const hole of course.holes) {
      for (const { teeId, targetId } of holePairings(hole)) {
        const line = fairwayLine(course, teeId, targetId, featureById);
        if (line && line.length >= 2)
          out.push({ key: pairElevationKey(teeId, targetId), line });
      }
    }
    return out;
  }, [course]);

  /*
   * Recompute when the geometry moves, not when anything else does.
   *
   * `lines` is a fresh array on every edit, including typing in the notes
   * field — so the effect keys off what the lines *are* rather than off the
   * array's identity. Dragging a tee does re-read the tiles, which is right:
   * the profile is about where the tee is.
   */
  const geometryKey = useMemo(
    () => lines.map((l) => `${l.key}:${l.line.map((p) => p.join(',')).join(';')}`).join('|'),
    [lines],
  );

  const source: ElevationSource = survey ? 'survey' : 'global';
  const zoom = survey ? survey.maxZoom : MAX_DEM_ZOOM;

  /*
   * Superseded work must not land after the work that replaced it.
   *
   * Sampling is asynchronous and a drag emits geometry changes faster than
   * tiles decode, so two runs are routinely in flight. Without the token the
   * slower one wins whenever it happens to finish last, and the profile snaps
   * back to where the tee used to be.
   */
  const runRef = useRef(0);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    // Invalidate immediately, sample later — see SETTLE_MS. Anything in flight
    // is now describing ground the tee has already left.
    const run = ++runRef.current;

    const current = linesRef.current;
    if (current.length === 0) {
      setProfiles(empty.profiles);
      setLoading(false);
      return;
    }

    setLoading(true);

    const timer = setTimeout(() => {
      void (async () => {
        // One cache for the whole pass: eighteen holes over one hillside share
        // most of their tiles, and decoding a tile is the expensive part.
        const cache = tileCache();
        const next = new Map<string, HoleProfile>();

        for (const { key, line } of current) {
          const points = await profilePoints(sampleLine(line), source, zoom, cache);
          if (runRef.current !== run) return;

          const profile = summarizeProfile(points);
          // Nothing came back: outside the survey, or offline with no tiles. An
          // absent entry reads as "no data", which is the truth; an entry full
          // of nulls would read as a chart that failed to draw.
          if (profile.missing === points.length) continue;

          next.set(key, { profile, source, feedsPar: source === 'survey' });
        }

        if (runRef.current !== run) return;
        setProfiles(next);
        setLoading(false);
      })();
    }, SETTLE_MS);

    return () => clearTimeout(timer);
  }, [geometryKey, source, zoom]);

  /*
   * The subset core is allowed to price into par.
   *
   * Built separately from the profiles rather than filtered downstream, so that
   * "shown on a chart" and "changes a number" cannot drift apart — a profile
   * from the global overlay simply never reaches `viewHoles`.
   */
  const value = useMemo<ProfileState>(() => {
    const elevations = new Map<string, number>();
    for (const [key, entry] of profiles) {
      if (entry.feedsPar && entry.profile.netGain !== null) {
        elevations.set(key, entry.profile.netGain);
      }
    }
    return { profiles, elevations, loading };
  }, [profiles, loading]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}
