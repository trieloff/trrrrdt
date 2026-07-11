/*
 * Offline song storage for the TP1 player — the site's "offline mode".
 *
 * Songs added while online are fetched (cdn1.suno.ai sends ACAO:* so we can read
 * the bytes) and stored in IndexedDB, keyed by the Suno clip id. They then play
 * with no network at all: we hand the block a blob: URL built from the stored
 * bytes. Audio never touches the service worker — this is the whole offline story
 * for playback.
 *
 * Bytes are stored as an ArrayBuffer, not a Blob: Safari/WebKit has a long history
 * of mishandling Blobs inside IndexedDB, whereas ArrayBuffers are bulletproof
 * everywhere. We rebuild a Blob (and an object URL) on read.
 *
 * A single 'tp1:change' event on window fires whenever the library changes, so
 * every "save offline" control on the page and the TP1 track list stay in sync.
 */

const DB_NAME = 'trrrrdt-offline';
const DB_VERSION = 1;
const STORE = 'songs';
export const BUDGET = 1024 * 1024 * 1024; // 1 GiB, per the product cap
export const CHANGE_EVENT = 'tp1:change';

let dbPromise;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function emitChange(detail) {
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail }));
}

const CLIP_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/* A stable id for a song: the Suno clip UUID when present (survives slug/title
   edits), otherwise a provided id/slug. */
export function songId(song) {
  const m = CLIP_RE.exec(song.url || song.audio || '');
  return m ? m[1].toLowerCase() : (song.id || song.slug || song.url || '');
}

export async function has(id) {
  const rec = await run('readonly', (s) => s.get(id));
  return !!rec;
}

/* Library metadata (no audio/cover bytes), oldest-first. */
export async function list() {
  const all = await run('readonly', (s) => s.getAll());
  return all
    .map(({ data, coverData, ...meta }) => ({ ...meta, hasCover: !!coverData }))
    .sort((a, b) => a.addedAt - b.addedAt);
}

/* An object URL for the stored cover art, or null. Caller revokes when done. */
export async function coverURL(id) {
  const rec = await run('readonly', (s) => s.get(id));
  if (!rec?.coverData) return null;
  return URL.createObjectURL(new Blob([rec.coverData], { type: rec.coverType || 'image/jpeg' }));
}

export async function usage() {
  const all = await run('readonly', (s) => s.getAll());
  const bytes = all.reduce((a, r) => a + (r.bytes || 0), 0);
  return { bytes, budget: BUDGET, count: all.length };
}

/* An object URL for the stored audio, or null if not downloaded. Caller must
   URL.revokeObjectURL when done. */
export async function objectURL(id) {
  const rec = await run('readonly', (s) => s.get(id));
  if (!rec) return null;
  return URL.createObjectURL(new Blob([rec.data], { type: rec.type || 'audio/mpeg' }));
}

export async function remove(id) {
  await run('readwrite', (s) => s.delete(id));
  emitChange({ id, removed: true });
}

/* Best-effort persistent storage so the OS is less likely to evict us. iOS may
   ignore this (returns false) — harmless. */
let persistTried = false;
async function requestPersist() {
  if (persistTried || !navigator.storage?.persist) return;
  persistTried = true;
  try { await navigator.storage.persist(); } catch { /* not supported */ }
}

/*
 * Download a song and store it for offline. `song` needs at least { url }; the
 * title/artist/cover/meta/style/duration are stored for the TP1 track list.
 * onProgress(fraction 0..1) fires while streaming. Throws Error with code:
 *   'full'     — would exceed the 1 GB budget (or the browser quota)
 *   'network'  — fetch failed / offline
 */
export async function add(song, onProgress) {
  const id = songId(song);
  if (!id) throw new Error('song has no id/url');
  if (await has(id)) return { id, already: true };

  await requestPersist();
  const { bytes: used } = await usage();

  let res;
  try {
    res = await fetch(song.url, { mode: 'cors', cache: 'no-store' });
  } catch (e) {
    const err = new Error('could not download — check your connection');
    err.code = 'network';
    throw err;
  }
  if (!res.ok || !res.body) {
    const err = new Error(`download failed (${res.status})`);
    err.code = 'network';
    throw err;
  }

  const total = Number(res.headers.get('content-length')) || 0;
  if (total && used + total > BUDGET) {
    const err = new Error('offline storage is full — remove a song first');
    err.code = 'full';
    throw err;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (used + received > BUDGET) {
      const err = new Error('offline storage is full — remove a song first');
      err.code = 'full';
      throw err;
    }
    if (onProgress) onProgress(total ? received / total : 0);
  }

  const data = new Uint8Array(received);
  let at = 0;
  chunks.forEach((c) => { data.set(c, at); at += c.length; });

  // grab the cover too so the library shows art with no network (best-effort)
  let coverData = null;
  let coverType = '';
  if (song.cover) {
    try {
      const cr = await fetch(song.cover, { mode: 'cors', cache: 'force-cache' });
      if (cr.ok) { coverData = await cr.arrayBuffer(); coverType = cr.headers.get('content-type') || 'image/jpeg'; }
    } catch { /* cover is optional — fall back to a disc icon offline */ }
  }

  const rec = {
    coverData,
    coverType,
    id,
    url: song.url,
    data: data.buffer,
    type: res.headers.get('content-type') || 'audio/mpeg',
    bytes: received,
    title: song.title || 'Untitled',
    artist: song.artist || '',
    cover: song.cover || '',
    meta: song.meta || '',
    style: song.style || '',
    duration: song.duration || '',
    source: song.source || 'suno',
    addedAt: Date.now(),
  };

  try {
    await run('readwrite', (s) => s.put(rec));
  } catch (e) {
    // QuotaExceededError from the browser's own limit (esp. iOS < 1 GB)
    const err = new Error('this device is out of storage for offline songs');
    err.code = 'full';
    throw err;
  }
  emitChange({ id, added: true });
  return { id, bytes: received };
}

/* Convenience: current state for one song id. */
export async function state(id) {
  return (await has(id)) ? 'saved' : 'none';
}
