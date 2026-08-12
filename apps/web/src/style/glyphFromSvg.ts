import type { CustomGlyph } from '@hyzerlines/core';

/**
 * Turning an uploaded SVG into a glyph.
 *
 * **Path data and nothing else survives.** An SVG file is a document format: it
 * can carry scripts, external references, embedded images and stylesheets, and
 * a designer dropping an icon on this app has no reason to expect any of that
 * to come along. What is kept is the `d` attribute of its paths — a string of
 * coordinates — and the box they were drawn in.
 *
 * That is a property of the pipeline rather than a filter bolted onto it. The
 * map draws markers by handing path data to `Path2D`, which turns coordinates
 * into a shape and can do nothing else; the file is never inserted into the
 * document, never fetched from, and never rendered as markup.
 *
 * `DOMParser` is used rather than a regular expression because it is the thing
 * that actually knows SVG, and parsing with it does not execute anything: a
 * document parsed as `image/svg+xml` and never inserted runs no script and
 * loads no external reference.
 */

/** What went wrong, in words a designer can act on. */
export type GlyphImport = { ok: true; glyph: CustomGlyph } | { ok: false; error: string };

/**
 * How many paths a glyph may have.
 *
 * Generous for an icon and firm about the difference between an icon and a
 * traced illustration. A map marker is thirty pixels across; a drawing with a
 * thousand subpaths in it will read as a smudge and cost a redraw on every
 * restyle, so the honest answer is to refuse it with a reason rather than to
 * accept it and disappoint.
 */
const MAX_PATHS = 200;

const DEFAULT_BOX: [number, number, number, number] = [0, 0, 24, 24];

/** `viewBox="0 0 24 24"`, or the width and height, or the box we draw in. */
function boxOf(svg: SVGElement): [number, number, number, number] {
  const raw = svg.getAttribute('viewBox');
  if (raw) {
    const parts = raw
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const [minX, minY, width, height] = parts;
    if (
      parts.length === 4 &&
      parts.every(Number.isFinite) &&
      width !== undefined &&
      height !== undefined &&
      width > 0 &&
      height > 0
    ) {
      return [minX ?? 0, minY ?? 0, width, height];
    }
  }

  const width = Number(svg.getAttribute('width'));
  const height = Number(svg.getAttribute('height'));
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return [0, 0, width, height];
  }

  return DEFAULT_BOX;
}

/**
 * Read an uploaded file into a glyph.
 *
 * Only `<path>` is read. Circles, rects and polygons are legitimate SVG and are
 * *not* converted, because converting them means reimplementing a chunk of the
 * spec to serve a case that barely arises — every icon set worth uploading
 * exports paths. A file made entirely of primitives is refused with a message
 * that says what to do about it rather than silently importing an empty
 * drawing.
 */
export function glyphFromSvg(name: string, source: string): GlyphImport {
  let document: Document;
  try {
    document = new DOMParser().parseFromString(source, 'image/svg+xml');
  } catch {
    return { ok: false, error: 'That file could not be read as SVG.' };
  }

  // `DOMParser` reports malformed XML as a document containing this element
  // rather than by throwing, which is the one thing about it worth knowing.
  if (document.querySelector('parsererror')) {
    return { ok: false, error: 'That file is not valid SVG.' };
  }

  const svg = document.querySelector('svg');
  if (!svg) return { ok: false, error: 'That file has no <svg> in it.' };

  const paths = [...document.querySelectorAll('path')]
    .map((path) => path.getAttribute('d')?.trim() ?? '')
    .filter((d) => d.length > 0);

  if (paths.length === 0) {
    return {
      ok: false,
      error:
        'No paths in that file. Circles and rectangles are not read — flatten the artwork to paths and try again.',
    };
  }
  if (paths.length > MAX_PATHS) {
    return {
      ok: false,
      error: `That drawing has ${paths.length} paths. A map marker is about thirty pixels across; ${MAX_PATHS} is the limit.`,
    };
  }

  return {
    ok: true,
    glyph: {
      id: crypto.randomUUID(),
      // Named for the file, trimmed of its extension, because that is what the
      // designer already calls it.
      name: name.replace(/\.svg$/i, '').slice(0, 60) || 'Glyph',
      paths,
      viewBox: boxOf(svg),
    },
  };
}
