/*
 * "Save offline" control — the site-wide affordance for adding songs to the TP1.
 *
 * It appears on players (the current song), cassettes (that song), and artist
 * pages (all their songs). A song descriptor needs at least { url }; title /
 * artist / cover / style / duration are stored so the TP1 crate can show them.
 *
 * Every button reflects live library state via the shared 'tp1:change' event, so
 * saving on one control updates the same song's control everywhere at once.
 */
import * as offline from './offline.js';
import { loadCSS } from '../aem.js';

let cssRequested = false;
function ensureCSS() {
  if (cssRequested) return;
  cssRequested = true;
  loadCSS(`${window.hlx?.codeBasePath || ''}/styles/save-offline.css`);
}

const LABEL = {
  idle: 'Save offline',
  saved: 'On TP1',
  full: 'Storage full',
  fail: 'Try again',
};

/*
 * A toggle button for one song. `song` must carry a `url` (the mp3). Returns the
 * button element; it manages its own label/state and download progress.
 */
export function createSaveButton(song, { compact = false, label = LABEL.idle } = {}) {
  ensureCSS();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = compact ? 'save-offline save-offline-compact' : 'save-offline';
  const id = offline.songId(song);
  let busy = false;

  const setText = (t) => { btn.querySelector('.save-offline-label').textContent = t; };
  btn.innerHTML = '<span class="save-offline-icon" aria-hidden="true"></span><span class="save-offline-label"></span>';

  async function sync() {
    if (busy) return;
    const saved = await offline.has(id);
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', String(saved));
    setText(saved ? LABEL.saved : label);
  }

  btn.addEventListener('click', async () => {
    if (busy) return;
    if (await offline.has(id)) { await offline.remove(id); return; }
    busy = true;
    btn.classList.add('is-busy');
    btn.disabled = false;
    try {
      await offline.add(song, (p) => setText(`Saving ${Math.round(p * 100)}%`));
      busy = false;
      btn.classList.remove('is-busy');
      sync();
    } catch (e) {
      setText(e.code === 'full' ? LABEL.full : LABEL.fail);
      window.setTimeout(() => {
        busy = false;
        btn.classList.remove('is-busy');
        sync();
      }, 2600);
    }
  });

  window.addEventListener(offline.CHANGE_EVENT, sync);
  sync();
  return btn;
}

/*
 * A save control for a player's *current* track, which changes as you scroll. It
 * asks `getSong()` (returning a descriptor or null to hide) on every click and
 * sync, and exposes `.refresh()` for the block to call when the track changes.
 * Returns { el, refresh }.
 */
export function createCurrentTrackButton(getSong, { compact = true, label = LABEL.idle } = {}) {
  ensureCSS();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = compact ? 'save-offline save-offline-compact' : 'save-offline';
  btn.innerHTML = '<span class="save-offline-icon" aria-hidden="true"></span><span class="save-offline-label"></span>';
  const setText = (t) => { btn.querySelector('.save-offline-label').textContent = t; };
  let busy = false;

  async function sync() {
    if (busy) return;
    const song = getSong();
    if (!song) { btn.hidden = true; return; }
    btn.hidden = false;
    // Apple tracks are DRM'd and can't be stored — offer to open them in Apple
    // Music instead, where they can be added/downloaded natively.
    if (song.appleUrl) {
      btn.classList.add('save-offline-apple');
      btn.classList.remove('is-saved');
      btn.removeAttribute('aria-pressed');
      btn.setAttribute('aria-label', `Open ${song.title || 'this song'} in Apple Music`);
      setText('Apple Music');
      return;
    }
    btn.classList.remove('save-offline-apple');
    if (!song.url) { btn.hidden = true; return; }
    const saved = await offline.has(offline.songId(song));
    btn.classList.toggle('is-saved', saved);
    btn.setAttribute('aria-pressed', String(saved));
    setText(saved ? LABEL.saved : label);
  }

  btn.addEventListener('click', async () => {
    if (busy) return;
    const song = getSong();
    if (!song) return;
    if (song.appleUrl) { window.open(song.appleUrl, '_blank', 'noopener'); return; }
    if (!song.url) return;
    const id = offline.songId(song);
    if (await offline.has(id)) { await offline.remove(id); return; }
    busy = true;
    btn.classList.add('is-busy');
    try {
      await offline.add(song, (p) => setText(`Saving ${Math.round(p * 100)}%`));
      busy = false;
      btn.classList.remove('is-busy');
      sync();
    } catch (e) {
      setText(e.code === 'full' ? LABEL.full : LABEL.fail);
      window.setTimeout(() => {
        busy = false;
        btn.classList.remove('is-busy');
        sync();
      }, 2600);
    }
  });

  window.addEventListener(offline.CHANGE_EVENT, sync);
  sync();
  return { el: btn, refresh: sync };
}

/*
 * A "save all" button for a set of songs (an artist's discography, a playlist).
 * `getSongs` returns (or resolves to) an array of song descriptors. Saves the ones
 * not already on the device, showing count progress.
 */
export function createSaveAllButton(getSongs, { label = 'Save all offline' } = {}) {
  ensureCSS();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'save-offline save-offline-all';
  // hidden until sync() confirms there's more than nothing to save — otherwise it
  // flashes as an empty icon-only pill while the player pages are being resolved
  btn.hidden = true;
  btn.innerHTML = `<span class="save-offline-icon" aria-hidden="true"></span><span class="save-offline-label">${label}</span>`;
  const setText = (t) => { btn.querySelector('.save-offline-label').textContent = t; };
  let busy = false;

  async function sync() {
    if (busy) return;
    const songs = await getSongs();
    if (!songs || !songs.length) { btn.hidden = true; return; }
    btn.hidden = false;
    const states = await Promise.all(songs.map((s) => offline.has(offline.songId(s))));
    const missing = states.filter((x) => !x).length;
    btn.classList.toggle('is-saved', missing === 0);
    setText(missing === 0 ? 'All on TP1' : label);
  }

  btn.addEventListener('click', async () => {
    if (busy) return;
    const songs = (await getSongs()) || [];
    const todo = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const s of songs) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await offline.has(offline.songId(s)))) todo.push(s);
    }
    if (!todo.length) { sync(); return; }
    busy = true;
    btn.classList.add('is-busy');
    let done = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const s of todo) {
      setText(`Saving ${done + 1} of ${todo.length}…`);
      try {
        // eslint-disable-next-line no-await-in-loop
        await offline.add(s);
      } catch (e) {
        if (e.code === 'full') { setText(LABEL.full); break; }
      }
      done += 1;
    }
    busy = false;
    btn.classList.remove('is-busy');
    sync();
  });

  window.addEventListener(offline.CHANGE_EVENT, sync);
  sync();
  return btn;
}

/*
 * Resolve every song on a player page (turntable / yunost) into descriptors, by
 * fetching its .plain.html and reading the block's track rows. Used by cassettes
 * and artist pages, where the mp3 URL isn't in the markup — only a link to the
 * player is. Results are cached per page for the session.
 */
const pageCache = new Map();
export function songsFromPlayerPage(pagePath) {
  const path = pagePath.replace(/[#?].*$/, '').replace(/\/$/, '');
  if (pageCache.has(path)) return pageCache.get(path);
  const p = (async () => {
    try {
      const res = await fetch(`${path}.plain.html`);
      if (!res.ok) return [];
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const block = doc.querySelector('.turntable, .yunost');
      if (!block) return [];
      const songs = [];
      // each track is a row of cells: title, artist, meta·duration, audio, style, cover
      [...block.children].forEach((row) => {
        const cellEls = [...row.children];
        const cells = cellEls.map((c) => c.textContent.trim());
        // the audio link isn't always first — rows often lead with a per-song
        // liner-notes link — so pick the anchor that is actually an mp3 / Suno track
        const hrefs = [...row.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '');
        const audio = hrefs.find((h) => /\.mp3(\?|$)/i.test(h) || /cdn1\.suno\.ai/.test(h)) || '';
        if (!audio) return;
        // the title is the title cell's paragraph that ISN'T a link — a "Liner
        // notes" link tucked into the same cell would otherwise corrupt the title
        // (and its slug, breaking the match to a cassette's #slug link), exactly
        // as the turntable's own rowToEntry guards against
        const cell0 = cellEls[0];
        const titleP = cell0 && [...cell0.querySelectorAll('p')].find((para) => !para.querySelector('a'));
        const title = (titleP?.textContent || cells[0] || '').trim();
        const cover = row.querySelector('img')?.getAttribute('src') || '';
        const durMatch = (cells[2] || '').match(/(\d+:\d{2})\s*$/);
        songs.push({
          url: audio,
          title: title || 'Untitled',
          artist: cells[1] || '',
          meta: cells[2] || '',
          duration: durMatch ? durMatch[1] : '',
          style: cells[4] || '',
          cover,
        });
      });
      return songs;
    } catch (e) {
      return [];
    }
  })();
  pageCache.set(path, p);
  return p;
}

/*
 * Find a single song on a player page by its slug (the #anchor a cassette links
 * to). Compares the block's own slugify output.
 */
export async function songFromPlayerLink(href) {
  try {
    const url = new URL(href, window.location);
    const slug = decodeURIComponent(url.hash.replace(/^#/, '')).toLowerCase();
    const songs = await songsFromPlayerPage(url.pathname);
    if (!songs.length) return null;
    if (!slug) return songs[0];
    const { slugify } = await import('./content.js');
    return songs.find((s) => slugify(s.title) === slug) || null;
  } catch (e) {
    return null;
  }
}
