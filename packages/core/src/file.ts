import { parseCourse, type Course, type ParseResult } from './schema.js';

/**
 * `.hyzer` files.
 *
 * Deliberately plain, pretty-printed JSON rather than anything compact or
 * binary. A course is small, and the file being readable and diffable means it
 * survives in version control, can be inspected when something goes wrong, and
 * can be repaired by hand. Compression would buy kilobytes and cost all of that.
 */

export const FILE_EXTENSION = '.hyzer';
export const FILE_MIME = 'application/json';

export function serializeCourse(course: Course): string {
  return `${JSON.stringify(course, null, 2)}\n`;
}

export function deserializeCourse(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  return parseCourse(raw);
}

/**
 * A filesystem-safe name derived from the course title.
 *
 * Users name courses things like "Kaposia / Lower 9 (draft)", and those
 * characters are illegal or awkward on at least one major platform.
 */
export function suggestedFilename(course: Course): string {
  const base =
    course.name
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'course';
  return `${base}${FILE_EXTENSION}`;
}
