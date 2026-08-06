import type { ImportedTile } from './importer';

/**
 * Where the pixels live.
 *
 * The survey's metadata is in the document, because it describes how the course
 * was designed. Its tiles are here, because a `.hyzer` is a document you email
 * and forty megabytes of elevation is not.
 *
 * Its own database rather than a second store in `hyzerlines`: that one is
 * versioned around the course document and gets an `onupgradeneeded` whenever
 * the document's storage changes, and a schema migration should not have to
 * think about several hundred megabytes of tiles it does not understand.
 * Separate databases can be cleared independently, which is also what you want
 * when someone is reclaiming disk.
 *
 * Written against the raw IndexedDB API for the same reason `persist.ts` is:
 * this is one object store and four operations, and a wrapper would be larger
 * than the code.
 */

const DB_NAME = 'hyzerlines-survey';
const DB_VERSION = 1;
const STORE = 'tiles';

/** `z/x/y`, which is also the shape the protocol handler parses back out. */
const tileKey = (z: number, x: number, y: number): string => `${z}/${x}/${y}`;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open tile storage'));
    request.onblocked = () => reject(new Error('Tile storage blocked by another tab'));
  });
}

/**
 * Replace the stored survey with a new one.
 *
 * Clears first, in the same transaction. A course has one survey, and leaving
 * the old tiles behind would mean the new one is drawn over the top of terrain
 * from a different site wherever the two do not overlap — which looks like the
 * import half-failed rather than like stale data.
 */
export async function storeTiles(tiles: readonly ImportedTile[]): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const tile of tiles) store.put(tile.png, tileKey(tile.z, tile.x, tile.y));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not write tiles'));
      tx.onabort = () => reject(tx.error ?? new Error('Tile write aborted'));
    });
  } finally {
    db.close();
  }
}

export async function clearTiles(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not clear tiles'));
    });
  } finally {
    db.close();
  }
}

/**
 * One tile, or null where the survey has none.
 *
 * Null is a normal answer, not a failure: tiles are only stored where the
 * survey had data, so every request outside its footprint lands here. The
 * protocol handler turns it into a transparent tile.
 */
export async function readTile(z: number, x: number, y: number): Promise<Blob | null> {
  const db = await openDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(tileKey(z, x, y));
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read tile'));
    });
  } finally {
    db.close();
  }
}

/** Whether any tiles are stored, for telling a real survey from a stale record. */
export async function hasTiles(): Promise<boolean> {
  const db = await openDatabase();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).count();
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error ?? new Error('Could not count tiles'));
    });
  } finally {
    db.close();
  }
}
