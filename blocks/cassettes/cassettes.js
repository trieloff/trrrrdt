import { createSaveButton, createSaveAllButton, songFromPlayerLink } from '../../scripts/player/save-offline.js';

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

  [...block.children].forEach((row, i) => {
    const cols = [...row.children];
    const title = cols[0]?.textContent?.trim() || '';
    const subtitle = cols[1]?.textContent?.trim() || '';
    const cover = cols.map((c) => c.querySelector('img')).find(Boolean);
    const link = cols.map((c) => c.querySelector('a')).find(Boolean);

    const li = document.createElement('li');
    li.className = 'cassette';

    const shell = document.createElement('div');
    shell.className = 'cassette-shell';
    shell.innerHTML = `
      <span class="cassette-screw cassette-screw-tl"></span>
      <span class="cassette-screw cassette-screw-tr"></span>
      <span class="cassette-screw cassette-screw-bl"></span>
      <span class="cassette-screw cassette-screw-br"></span>
      <div class="cassette-label">
        <div class="cassette-label-head">
          <span class="cassette-side">Side A</span>
          <span class="cassette-index">Nº ${String(i + 1).padStart(2, '0')}</span>
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
      // sampling canvas untainted; on failure we keep the alternating default)
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
        const dark = lum < 128;
        li.style.setProperty('--cassette-color', dark ? 'var(--cassette-ivory)' : 'var(--cassette-black)');
        li.style.setProperty('--cassette-ink', dark ? 'var(--text-color)' : 'var(--light-color)');
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
