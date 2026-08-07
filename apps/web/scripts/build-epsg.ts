import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import proj4 from 'proj4';
import all from 'epsg-index/all.json' with { type: 'json' };

/**
 * Generate the EPSG lookup the survey importer reads.
 *
 * The importer began with a hand-written table of projections — UTM, British
 * National Grid, plain lat/long — which was fine until somebody brought a file
 * in `EPSG:6428`, NAD83(2011) / Colorado Central (ftUS). US State Plane alone is
 * about 120 zones across several datum realizations, and every country has its
 * own grid. A curated list is a list that is always missing the one you need.
 *
 * So the whole registry is compiled in, from `epsg-index` — a devDependency
 * that never ships. This runs by hand rather than on every build: EPSG changes
 * a few times a year, the output is committed, and a fresh clone must typecheck
 * without anyone having run a generator first.
 *
 *     pnpm --filter @hyzerlines/web epsg
 *
 * ## Only what proj4 can actually do, here, with no extra files
 *
 * Two exclusions, and both exist for the same reason: **proj4js does not throw
 * when it cannot do the job.** It returns `NaN`, or coordinates that are simply
 * wrong. A survey that lands in the wrong county looks like bad data rather
 * than like a bug, so anything we cannot do correctly is left out and the
 * importer says plainly that it cannot read that projection — which is true,
 * and tells someone what to do next.
 *
 * 1. **Projection methods proj4js does not implement.** It accepts the string
 *    and then cannot find the projection.
 * 2. **Definitions needing a grid-shift file** (`+nadgrids=` pointing at
 *    something like `NTv2_0.gsb`). These are datum transformations distributed
 *    as binary grids that we do not ship; proj4js logs "Unable to find
 *    mandatory grid" and returns `NaN`. Mostly NAD27-era North American
 *    systems. `@null` is not one of these — it means "no shift", and is how
 *    Web Mercator is written.
 */

const SUPPORTED_PROJECTIONS = new Set([
  'longlat',
  'merc',
  'utm',
  'tmerc',
  'etmerc',
  'lcc',
  'aea',
  'stere',
  'sterea',
  'aeqd',
  'gnom',
  'omerc',
  'eqdc',
  'laea',
  'poly',
  'mill',
  'sinu',
  'moll',
  'eqc',
  'cea',
  'robin',
  'geocent',
  'krovak',
  'cass',
  'gauss',
  'nzmg',
  'somerc',
  'bonne',
  'gstmerc',
  'tpers',
  'vandg',
  'qsc',
  'eqearth',
]);

/**
 * Strip what proj4js genuinely does not read.
 *
 * Only these two. Both are inert to proj4js's parser, and the verification
 * script compares trimmed against untrimmed across a wide sample to keep that
 * claim honest.
 *
 * **`+towgs84=0,0,0,0,0,0,0` is not inert and must stay**, which is not
 * obvious: it looks like an identity transform and is not one. Its presence is
 * what tells proj4js the datum is known, which selects the geodetic →
 * geocentric → geodetic path — and that path still changes the coordinate when
 * the ellipsoid differs from WGS84. Removing it silently moved every Everest,
 * Clarke and Bessel-based system. Caught by the sample comparison, which is the
 * only reason this comment exists rather than a bug.
 */
function trim(proj4: string): string {
  return proj4.replaceAll(' +type=crs', '').replaceAll(' +no_defs', '').trim();
}

interface Entry {
  code: string;
  name?: string;
  proj4?: string;
}

/** True when the definition needs a grid file we do not ship. See the note above. */
function needsGridFile(proj4: string): boolean {
  const grid = /\+nadgrids=([^\s]+)/.exec(proj4)?.[1];
  return grid !== undefined && grid !== '@null';
}

const entries: [string, string, string][] = [];
let skippedProjection = 0;
let skippedGrid = 0;

for (const [code, raw] of Object.entries(all as Record<string, Entry>)) {
  const proj4 = raw.proj4;
  if (typeof proj4 !== 'string' || proj4.length === 0) continue;

  const method = /\+proj=([a-zA-Z0-9]+)/.exec(proj4)?.[1];
  if (!method || !SUPPORTED_PROJECTIONS.has(method)) {
    skippedProjection++;
    continue;
  }

  if (needsGridFile(proj4)) {
    skippedGrid++;
    continue;
  }

  entries.push([code, trim(proj4), raw.name ?? '']);
}

const skipped = skippedProjection + skippedGrid;

entries.sort((a, b) => Number(a[0]) - Number(b[0]));

/*
 * Prove the table before writing it.
 *
 * This file decides where a course lands on the earth, and every way it can be
 * wrong is quiet — proj4js returns NaN or a plausible-looking coordinate in the
 * wrong county rather than raising anything. So the generator refuses to emit a
 * table it cannot verify, which puts the check at the only moment it matters:
 * when the table changes.
 *
 * Stripping an all-zero `+towgs84` was caught here, having looked completely
 * safe. It is not: its presence is what tells proj4js the datum is known, and
 * removing it silently moved every system built on a non-WGS84 ellipsoid.
 */
function verify(): void {
  const problems: string[] = [];
  const table = new Map(entries.map(([code, def]) => [code, def]));

  /*
   * Ground truth, measured against a real USGS 3DEP tile: the south-west corner
   * of `USGS_1M_16_x38y372_AL_11County_B23.tif` in UTM 16N, and where it is.
   */
  const utm = table.get('26916');
  if (!utm) problems.push('26916 (NAD83 / UTM 16N) missing');
  else {
    proj4.defs('VERIFY:26916', utm);
    const [lng, lat] = proj4(
      'VERIFY:26916',
      'EPSG:4326',
      [379993.9996873231, 3709994.00031171],
    );
    if (
      Math.abs(lng! - -88.29227524647786) > 1e-9 ||
      Math.abs(lat! - 33.52279531374064) > 1e-9
    ) {
      problems.push(`26916 reprojected to ${lng}, ${lat} — expected -88.2922752, 33.5227953`);
    }
  }

  /*
   * The code that prompted all this, and the one family most likely to be got
   * wrong: State Plane in US survey feet. Colorado Central's false easting is
   * 3,000,000 ftUS, so a Denver coordinate landing near it is the check that
   * the linear unit is being honoured rather than metres being called feet.
   */
  const coloradoCentral = table.get('6428');
  if (!coloradoCentral) problems.push('6428 (Colorado Central ftUS) missing');
  else {
    proj4.defs('VERIFY:6428', coloradoCentral);
    const [easting, northing] = proj4('EPSG:4326', 'VERIFY:6428', [-104.9903, 39.7392]);
    if (!(easting! > 2_800_000 && easting! < 3_400_000 && northing! > 1_000_000)) {
      problems.push(`6428 put Denver at ${easting}, ${northing} — wrong linear unit?`);
    }
  }

  // Nothing trimmed may change any result, anywhere.
  let compared = 0;
  let drifted = 0;
  const step = Math.max(1, Math.floor(entries.length / 1500));
  for (let i = 0; i < entries.length; i += step) {
    const [code, trimmed] = entries[i]!;
    const original = (all as Record<string, Entry>)[code]?.proj4;
    if (!original) continue;
    try {
      const sample: [number, number] = [500_000, 4_000_000];
      const a = proj4(trimmed, 'EPSG:4326').forward(sample);
      const b = proj4(original, 'EPSG:4326').forward(sample);
      if (!Number.isFinite(a[0]) || !Number.isFinite(b[0])) continue;
      compared++;
      if (Math.abs(a[0]! - b[0]!) > 1e-9 || Math.abs(a[1]! - b[1]!) > 1e-9) {
        drifted++;
        if (drifted <= 3) problems.push(`trimming changed ${code}: ${a} vs ${b}`);
      }
    } catch {
      /* Some CRSs reject the sample point. Not what this is testing. */
    }
  }
  console.log(`  verified: ${compared} compared against untrimmed, ${drifted} differing`);

  if (problems.length > 0) {
    console.error('\nEPSG table failed verification:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
}

verify();

const out = `// GENERATED by scripts/build-epsg.ts — do not edit.
//
// Source: the \`epsg-index\` package (ISC), which is a machine-readable dump of
// the EPSG registry. Regenerate with \`pnpm --filter @hyzerlines/web epsg\`.
//
// ${entries.length} coordinate reference systems. ${skipped} were skipped:
// ${skippedProjection} use a projection method proj4js does not implement, and
// ${skippedGrid} need a grid-shift file we do not ship. Both would return NaN
// or a wrong position rather than an error — see the generator.

/** \`[proj4 definition, human-readable name]\`, keyed by EPSG code. */
export const EPSG_DEFINITIONS: Record<string, readonly [string, string]> = ${JSON.stringify(
  Object.fromEntries(entries.map(([code, proj4, name]) => [code, [proj4, name]])),
  null,
  0,
)};
`;

const target = join(dirname(fileURLToPath(import.meta.url)), '../src/survey/epsg.generated.ts');
writeFileSync(target, out);

console.log(
  `epsg -> ${target}\n  ${entries.length} definitions, ${skipped} skipped, ${Math.round(
    out.length / 1024,
  )} KB`,
);
