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
 * Write a file's tiles into the store.
 *
 * **Additive, and that is the whole of multi-file support.** A course can be
 * larger than one published LiDAR tile — most county downloads come as a grid
 * of them — so a second import extends the survey rather than replacing it.
 * Tiles are keyed by z/x/y, so files that abut write different keys and files
 * that overlap resolve last-writer-wins, which is the right answer for the
 * overlapping strip either way: both cover it, and one of them has to draw it.
 *
 * `replace` clears first, for the case that used to be the only one — a
 * designer swapping in a corrected file for the same site, where leaving the
 * old tiles would draw terrain from the wrong survey wherever the two do not
 * overlap.
 */
export async function storeTiles(
  tiles: readonly ImportedTile[],
  { replace = false }: { replace?: boolean } = {},
): Promise<void> {
  const merged = replace ? tiles : await mergeWithStored(tiles);

  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      if (replace) store.clear();
      for (const tile of merged) store.put(tile.png, tileKey(tile.z, tile.x, tile.y));
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

/**
 * Combine incoming tiles with whatever is already stored at the same key.
 *
 * **Writing by key alone loses data, and quietly.** Every file is tiled with a
 * one-tile skirt so the contour generator has its 3×3 neighbourhood, and those
 * skirt tiles are entirely absent ground. Two abutting county tiles therefore
 * write the *same keys* along their shared edge — one with real elevation, one
 * with a skirt — and the second import simply overwrote the first. The survey
 * kept both files in its record and lost the first one's ground where they met.
 *
 * So overlapping tiles are composited rather than replaced: the incoming pixel
 * wins where it has data, and the stored one shows through where it does not.
 * That is also the right answer for the genuinely overlapping case, where two
 * files both cover a strip and one of them has to draw it.
 *
 * Only keys that already exist are decoded, so a file landing on empty ground —
 * the common case — costs nothing.
 */
async function mergeWithStored(tiles: readonly ImportedTile[]): Promise<ImportedTile[]> {
  const out: ImportedTile[] = [];
  for (const tile of tiles) {
    const existing = await readTile(tile.z, tile.x, tile.y);
    out.push(existing ? { ...tile, png: await compositeTiles(existing, tile.png) } : tile);
  }
  return out;
}

/** `over` where it has data, `under` where it does not. Alpha is the mask. */
async function compositeTiles(under: Blob, over: Blob): Promise<Blob> {
  const [a, b] = await Promise.all([toImageData(under), toImageData(over)]);
  if (!a || !b || a.width !== b.width || a.height !== b.height) return over;

  for (let i = 3; i < b.data.length; i += 4) {
    if (b.data[i] !== 0) continue;
    // This pixel of the incoming tile is absent; take the stored one whole,
    // including its own alpha — which may itself be absent, and that is fine.
    b.data[i - 3] = a.data[i - 3]!;
    b.data[i - 2] = a.data[i - 2]!;
    b.data[i - 1] = a.data[i - 1]!;
    b.data[i] = a.data[i]!;
  }

  const canvas = new OffscreenCanvas(b.width, b.height);
  const context = canvas.getContext('2d');
  if (!context) return over;
  context.putImageData(b, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function toImageData(blob: Blob): Promise<ImageData | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    return context.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
