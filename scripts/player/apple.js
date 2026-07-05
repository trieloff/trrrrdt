/*
 * Shared Apple Music backend for the player blocks. Wraps MusicKit v3 (lazy-
 * loaded from Apple's CDN the first time an Apple track is touched), fetches the
 * developer token from the worker's /tools/apple-token, handles listener
 * authorization, cross-storefront song resolution (by ISRC) and cover art.
 */

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

/* Recognise an Apple Music web link and pull the catalog id + kind out of it.
   Songs:    music.apple.com/{sf}/song/{slug}/{id}
             music.apple.com/{sf}/album/{slug}/{albumId}?i={songId}
   Playlists music.apple.com/{sf}/playlist/{slug}/{pl.xxxx}
   Albums    music.apple.com/{sf}/album/{slug}/{albumId}   (no ?i — whole album) */
export function classifyAppleUrl(href) {
  let u;
  try { u = new URL(href); } catch (e) { return null; }
  if (!/(^|\.)music\.apple\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const storefront = /^[a-z]{2}$/.test(parts[0] || '') ? parts[0] : 'us';
  const type = parts[1];
  const last = parts[parts.length - 1] || '';
  const songParam = u.searchParams.get('i');
  if (songParam) return { kind: 'song', id: songParam, storefront };
  if (type === 'song') return { kind: 'song', id: last, storefront };
  if (type === 'playlist') return { kind: 'playlist', id: last, storefront };
  if (type === 'album') return { kind: 'album', id: last, storefront };
  return null;
}

function msToClock(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* Apple artwork is a URL template with {w}/{h} placeholders; fill in a square. */
export function appleArtworkUrl(artwork, size = 600) {
  return artwork && artwork.url
    ? artwork.url.replace('{w}', size).replace('{h}', size).replace('{c}', 'bb').replace('{f}', 'jpg')
    : '';
}

export function appleSongToTrack(song, storefront) {
  const a = song.attributes || {};
  const genre = (a.genreNames && a.genreNames[0]) || '';
  const dur = a.durationInMillis ? msToClock(a.durationInMillis) : '';
  return {
    title: a.name || 'Untitled',
    artist: a.artistName || '',
    image: appleArtworkUrl(a.artwork),
    meta: [genre, dur].filter(Boolean).join(' · '),
    style: (a.genreNames && a.genreNames.join(', ')) || a.artistName || '',
    source: 'apple',
    appleId: song.id,
    storefront,
    audio: '',
    playable: true,
  };
}

export function createAppleBackend(tokenEndpoint) {
  let configurePromise = null;
  let music = null;
  let active = false;
  const listeners = { ended: () => {}, authChange: () => {} };

  async function fetchToken() {
    const res = await fetch(tokenEndpoint, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`apple token ${res.status}`);
    const data = await res.json();
    if (!data.token) throw new Error('apple token missing');
    return data.token;
  }

  function loadScript() {
    return new Promise((resolve, reject) => {
      if (window.MusicKit) { resolve(); return; }
      let s = document.querySelector('script[data-musickit]');
      if (!s) {
        s = document.createElement('script');
        s.src = MUSICKIT_SRC;
        s.async = true;
        s.dataset.musickit = '';
        document.head.append(s);
      }
      document.addEventListener('musickitloaded', () => resolve(), { once: true });
      s.addEventListener('error', () => reject(new Error('musickit failed to load')));
    });
  }

  function configure() {
    if (configurePromise) return configurePromise;
    configurePromise = (async () => {
      await loadScript();
      const token = await fetchToken();
      music = await window.MusicKit.configure({
        developerToken: token,
        app: { name: 'TRRRRDT Records', build: '1.0' },
      }) || window.MusicKit.getInstance();
      music.addEventListener('playbackStateDidChange', ({ state }) => {
        const S = window.MusicKit.PlaybackStates;
        if (active && (state === S.completed || state === S.ended)) listeners.ended();
      });
      music.addEventListener('authorizationStatusDidChange', () => listeners.authChange());
      return music;
    })();
    // a transient token/network failure shouldn't poison the whole session
    configurePromise.catch(() => { configurePromise = null; });
    return configurePromise;
  }

  async function catalog(path, params) {
    const m = await configure();
    const res = await m.api.music(path, params);
    return (res && res.data) || res;
  }

  // Apple song ids are storefront-specific — bridge stores by the recording's
  // global ISRC so authored ids play for any listener. Cached per song.
  const idCache = new Map();
  async function resolveForStorefront(appleId, authoredSF, userSF) {
    if (!userSF || userSF === authoredSF) return appleId;
    const key = `${authoredSF}:${appleId}:${userSF}`;
    if (idCache.has(key)) return idCache.get(key);
    let resolved = appleId;
    try {
      const src = await catalog(`/v1/catalog/${authoredSF}/songs/${appleId}`);
      const isrc = src?.data?.[0]?.attributes?.isrc;
      if (isrc) {
        const hit = await catalog(`/v1/catalog/${userSF}/songs`, { 'filter[isrc]': isrc });
        resolved = hit?.data?.[0]?.id || appleId;
      }
    } catch (e) { /* not in the listener's store — keep authored id, fail loudly later */ }
    idCache.set(key, resolved);
    return resolved;
  }

  return {
    configure,
    onEnded(cb) { listeners.ended = cb; },
    onAuthChange(cb) { listeners.authChange = cb; },
    setActive(v) { active = v; },
    isActive: () => active,
    isConfigured: () => !!music,
    isAuthorized: () => !!(music && music.isAuthorized),
    // must be called synchronously inside a user gesture — MusicKit opens a
    // sign-in popup and Safari blocks it otherwise
    authorize: () => (music ? music.authorize() : Promise.reject(new Error('not configured'))),
    async play(appleId, { userGesture, storefront }) {
      const m = await configure();
      if (!m.isAuthorized) {
        if (!userGesture) {
          const e = new Error('authorization required');
          e.code = 'auth-required';
          throw e;
        }
        await m.authorize();
      }
      const id = await resolveForStorefront(appleId, storefront || 'us', m.storefrontId);
      await m.setQueue({ songs: [id] });
      await m.play();
      active = true;
    },
    pause() { if (music && active) music.pause(); },
    async artwork(ids, storefront) {
      if (!ids.length) return {};
      const body = await catalog(`/v1/catalog/${storefront}/songs`, { ids: ids.join(',') });
      const map = {};
      (body?.data || []).forEach((s) => {
        const url = appleArtworkUrl(s.attributes && s.attributes.artwork);
        if (url) map[s.id] = url;
      });
      return map;
    },
    async expand({ kind, id, storefront }) {
      const rel = kind === 'album' ? 'albums' : 'playlists';
      const body = await catalog(`/v1/catalog/${storefront}/${rel}/${id}`, { include: 'tracks', 'limit[tracks]': 100 });
      const tracks = body?.data?.[0]?.relationships?.tracks?.data || [];
      return tracks
        .filter((s) => s.type === 'songs')
        .map((s) => appleSongToTrack(s, storefront));
    },
  };
}

/* Fill in cover art for Apple tracks lacking an image (authored song rows).
   One batched catalog call per storefront; resolves true if anything changed. */
export async function hydrateArtwork(tracks, apple) {
  if (!apple) return false;
  const bySF = new Map();
  tracks.forEach((t) => {
    if (t.source === 'apple' && t.appleId && !t.image) {
      if (!bySF.has(t.storefront)) bySF.set(t.storefront, []);
      bySF.get(t.storefront).push(t);
    }
  });
  if (!bySF.size) return false;
  let changed = false;
  await Promise.all([...bySF.entries()].map(async ([sf, list]) => {
    try {
      const map = await apple.artwork(list.map((t) => t.appleId), sf);
      list.forEach((t) => { if (map[t.appleId]) { t.image = map[t.appleId]; changed = true; } });
    } catch (e) { /* leave those tracks without a cover */ }
  }));
  return changed;
}
