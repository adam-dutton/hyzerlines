import { parseCourse, type Course } from './schema.js';

/**
 * Local autosave.
 *
 * The promise the product makes is that you can open the URL and start working
 * with no account, so the work has to survive a reload without one. IndexedDB
 * rather than localStorage: courses will carry thousands of features once
 * drawing lands, localStorage is a synchronous ~5MB string store, and blocking
 * the main thread on every autosave would stutter the map.
 *
 * Written directly against the IndexedDB API rather than pulling a wrapper —
 * this needs one object store and two operations, and the dependency would be
 * larger than the code.
 */

const DB_NAME = 'hyzerlines';
const DB_VERSION = 1;
const STORE = 'courses';
/** Single-document app for now; PR 8 turns this into a real course list. */
const CURRENT_KEY = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB'));
    // Fires when another tab holds an old version open. Surfacing it beats
    // hanging forever on a promise that will never settle.
    request.onblocked = () => reject(new Error('Database blocked by another tab'));
  });
}

function transact<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Persist the current course.
 *
 * Storage failures are reported, never thrown: private browsing, a full disk,
 * or a blocked origin must degrade to "not saved" rather than taking down an
 * editing session whose in-memory state is still perfectly good.
 */
export async function saveCourse(course: Course): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await openDatabase();
    // Structured-clone the plain object; IndexedDB stores it directly.
    await transact(db, 'readwrite', (store) => store.put(course, CURRENT_KEY));
    db.close();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Load the autosaved course, if there is a valid one.
 *
 * Returns null for "nothing saved" and for "what was saved is unusable". A
 * corrupt or stale-format autosave must not be able to prevent the app from
 * opening — the user gets a fresh course instead of a broken session.
 */
export async function loadCourse(): Promise<Course | null> {
  try {
    const db = await openDatabase();
    const raw = await transact<unknown>(db, 'readonly', (store) => store.get(CURRENT_KEY));
    db.close();
    if (raw === undefined) return null;

    const result = parseCourse(raw);
    return result.ok ? result.course : null;
  } catch {
    return null;
  }
}

export async function clearCourse(): Promise<void> {
  try {
    const db = await openDatabase();
    await transact(db, 'readwrite', (store) => store.delete(CURRENT_KEY));
    db.close();
  } catch {
    /* nothing to clean up */
  }
}
