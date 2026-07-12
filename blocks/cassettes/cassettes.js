import { createSaveButton, createSaveAllButton, songFromPlayerLink } from '../../scripts/player/save-offline.js';

/* Cassettes remembered as "played" on this device get a subtle oxide patina.
   Purely local — no network, no cross-device sync. Keys are normalised to
   pathname+hash so they survive preview/live/localhost host differences. */
const PLAYED_KEY = 'trrrrdt-played';

function keyFor(href) {
  try {
    const u = new URL(href, window.location.href);
    return u.pathname + u.hash;
  } catch (e) {
    return href;
  }
}

function readPlayed() {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(PLAYED_KEY) || '[]'));
  } catch (e) {
    return new Set();
  }
}

function markPlayed(href) {
  try {
    const set = readPlayed();
    set.add(keyFor(href));
    window.localStorage.setItem(PLAYED_KEY, JSON.stringify([...set]));
  } catch (e) {
    /* localStorage unavailable (private mode / quota) — patina is best-effort */
  }
}

/* The side heading ("Side A — L'Ambassade") lives outside the block, in the
   section that precedes it. Read it defensively and return just the letter. */
function readSideLetter(block) {
  const section = block.closest('.section');
  if (!section) return '';
  const scopes = [section, section.previousElementSibling].filter(Boolean);
  let letter = '';
  scopes.some((scope) => {
    const heading = scope.querySelector('h1, h2, h3, h4');
    const match = heading && heading.textContent.match(/\bside\s+([a-z])\b/i);
    if (match) {
      letter = match[1].toUpperCase();
      return true;
    }
    return false;
  });
  return letter;
}

/* Deterministic "one wrong tape per section" pick — a fract() hash of the
   section seed, so the same tape is the defect on every visit (no randomness,
   no storage). */
function pickWrong(seed, count) {
  if (count <= 0) return -1;
  const x = Math.sin(seed * 12.9898 + 4.1337) * 43758.5453;
  return Math.floor((x - Math.floor(x)) * count);
}

/* A cassette links to a player page (…/player#slug); resolve that to the song and
   mount a compact "save offline" button on the tile once it scrolls into view, so
   we only fetch the player page(s) that are actually looked at. */
function mountCassetteSave(li, href, title, cover) {
  if (!/\/player(\/|#|$)/.test(href)) return;
  const obs = new IntersectionObserver((entries, o) => {
    if (!entries[0].isIntersecting) return;
    o.disconnect();
    songFromPlayerLink(href).then((song) => {
      if (!song || !song.url) return;
      const btn = createSaveButton({
        url: song.url,
        title: song.title || title,
        artist: song.artist,
        cover: song.cover || cover,
        style: song.style,
        duration: song.duration,
        source: 'suno',
      }, { compact: true, label: 'Save' });
      btn.classList.add('cassette-save');
      li.append(btn);
    });
  });
  obs.observe(li);
}

/**
 * Cassette tape block — renders each row as a Compact Cassette.
 * Expected content per row:
 *   col 1: title text (song/album name)
 *   col 2: subtitle / genre / description (optional)
 *   any col: an <img> cover — printed onto the cassette's paper label (optional)
 * An <a> in any cell turns the whole cassette into a link.
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const ul = document.createElement('ul');
  const playerLinks = [];
  const rows = [...block.children];

  // side letter derived from the preceding "Side X — …" heading, else A;
  // used for the side badge and the A1…An within-section track numbers
  const sideLetter = readSideLetter(block);
  const letter = sideLetter || 'A';

  // one deliberately "wrong" tape per section (inverted shell + crooked label).
  // seed from the side letter when present, else this block's ordinal on the page
  const seed = sideLetter
    ? sideLetter.charCodeAt(0) - 65
    : Math.max(0, [...document.querySelectorAll('.cassettes')].indexOf(block));
  const wrongIndex = pickWrong(seed, rows.length);

  // previously-played tapes wear an oxide patina (read once for the whole block)
  const played = readPlayed();

  rows.forEach((row, i) => {
    const cols = [...row.children];
    const title = cols[0]?.textContent?.trim() || '';
    const subtitle = cols[1]?.textContent?.trim() || '';
    const cover = cols.map((c) => c.querySelector('img')).find(Boolean);
    const link = cols.map((c) => c.querySelector('a')).find(Boolean);

    const li = document.createElement('li');
    li.className = 'cassette';

    const isWrong = i === wrongIndex;
    if (isWrong) li.classList.add('cassette-wrong');

    // reel spin duration varies per tape (title length + index) — a hand-wound,
    // never-quite-uniform feel; consumed by the CSS animation via a custom prop
    const reelDuration = (1.35 + ((title.length + i) % 9) * 0.11).toFixed(2);
    li.style.setProperty('--reel-duration', `${reelDuration}s`);

    const shell = document.createElement('div');
    shell.className = 'cassette-shell';
    shell.innerHTML = `
      <span class="cassette-screw cassette-screw-tl"></span>
      <span class="cassette-screw cassette-screw-tr"></span>
      <span class="cassette-screw cassette-screw-bl"></span>
      <span class="cassette-screw cassette-screw-br"></span>
      <div class="cassette-label">
        <div class="cassette-label-head">
          <span class="cassette-side">Side ${letter}</span>
          <span class="cassette-index">${letter}${i + 1}</span>
        </div>
        <span class="cassette-title"></span>
        <span class="cassette-subtitle"></span>
      </div>
      <div class="cassette-window">
        <div class="cassette-reel cassette-reel-l"><span class="cassette-hub"></span></div>
        <div class="cassette-tape"></div>
        <div class="cassette-reel cassette-reel-r"><span class="cassette-hub"></span></div>
      </div>
      <div class="cassette-mouth"><span></span><span></span><span></span></div>
    `;
    shell.querySelector('.cassette-title').textContent = title;
    shell.querySelector('.cassette-subtitle').textContent = subtitle;
    if (!subtitle) shell.querySelector('.cassette-subtitle').remove();

    // print the cover onto the paper label, if the row carries one
    if (cover) {
      shell.classList.add('cassette-has-art');
      const art = document.createElement('img');
      art.className = 'cassette-art';
      art.src = cover.src;
      art.alt = '';
      art.loading = 'lazy';
      shell.querySelector('.cassette-label').prepend(art);

      // invert the body from the cover's dominant tone: a dark cover gets an
      // ivory body, a light cover a black one (same-origin art keeps the
      // sampling canvas untainted; on failure we keep the alternating default).
      // The "wrong" tape flips this on purpose — a mispressed shell.
      const probe = new Image();
      probe.crossOrigin = 'anonymous';
      probe.addEventListener('load', () => {
        let lum;
        try {
          const c = document.createElement('canvas');
          c.width = 8;
          c.height = 8;
          const cx = c.getContext('2d');
          cx.drawImage(probe, 0, 0, 8, 8);
          const d = cx.getImageData(0, 0, 8, 8).data;
          let sum = 0;
          for (let j = 0; j < d.length; j += 4) {
            sum += 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
          }
          lum = sum / (d.length / 4);
        } catch (e) {
          return;
        }
        const bodyDark = isWrong ? lum >= 128 : lum < 128;
        li.style.setProperty('--cassette-color', bodyDark ? 'var(--cassette-ivory)' : 'var(--cassette-black)');
        li.style.setProperty('--cassette-ink', bodyDark ? 'var(--text-color)' : 'var(--light-color)');
      });
      probe.src = cover.src;
    }

    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.className = 'cassette-link';
      a.setAttribute('aria-label', title || 'Play');
      a.append(shell);
      li.append(a);
      if (played.has(keyFor(a.href))) li.classList.add('cassette-played');
      a.addEventListener('click', () => {
        markPlayed(a.href);
        li.classList.add('cassette-played');
      });
      mountCassetteSave(li, link.href, title, cover?.src);
      playerLinks.push(link.href);
    } else {
      li.append(shell);
    }
    ul.append(li);
  });

  block.replaceChildren(ul);

  // "Save all offline" for a crate of songs (an artist's discography, a playlist),
  // resolving each cassette's player link. Only when there's more than one to save.
  const savable = playerLinks.filter((h) => /\/player(\/|#|$)/.test(h));
  if (savable.length > 1) {
    const saveAll = createSaveAllButton(() => Promise.all(
      savable.map((h) => songFromPlayerLink(h)),
    ).then((songs) => songs.filter(Boolean).map((s) => ({ ...s, source: 'suno' }))));
    saveAll.classList.add('cassettes-save-all');
    block.prepend(saveAll);
  }
}
