import {
  deserializeCourse,
  serializeCourse,
  suggestedFilename,
  FILE_EXTENSION,
  FILE_MIME,
  type Course,
} from '@hyzerlines/core';

/**
 * Browser plumbing for `.hyzer` files.
 *
 * Kept out of components so the download/upload mechanics stay testable and the
 * UI just calls a function.
 */

export function downloadCourse(course: Course): void {
  const blob = new Blob([serializeCourse(course)], { type: FILE_MIME });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedFilename(course);
  link.click();

  // Revoking synchronously can cancel the download in some browsers; a frame is
  // enough for the click to be handled.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

export interface OpenResult {
  ok: boolean;
  course?: Course;
  error?: string;
}

/**
 * Prompt for a file and parse it.
 *
 * Resolves with `ok: false` when the user cancels, so callers can treat cancel
 * and failure the same way — neither should change the open document.
 */
export function openCourseFile(): Promise<OpenResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // JSON too: files often arrive renamed by mail clients and chat apps.
    input.accept = `${FILE_EXTENSION},application/json,.json`;

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ ok: false });
        return;
      }
      void file
        .text()
        .then((text) => {
          const result = deserializeCourse(text);
          resolve(
            result.ok
              ? { ok: true, course: result.course }
              : { ok: false, error: result.error },
          );
        })
        .catch(() => resolve({ ok: false, error: 'Could not read that file.' }));
    };

    // Chrome fires nothing on cancel in some versions, so this promise can stay
    // pending. That is acceptable: nothing is awaiting it in a blocking way.
    input.click();
  });
}
