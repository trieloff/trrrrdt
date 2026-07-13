import { createOptimizedPicture } from '../../scripts/aem.js';

/*
 * catalog — the back-catalogue index for /playlists.
 *
 * Two visual dialects, chosen by the block variant class:
 *   `catalog`            → The Catalogue: a label archive. The newest release
 *                          (first row) sits large and "still on the spindle";
 *                          the rest run as a numbered ledger. Full playback.
 *   `catalog mixtapes`   → Mixtapes: a dense wall of cover sleeves with an
 *                          explicit Apple-Music preview affordance.
 *
 * Authoring contract is identical to `cards`: one row per release, an image
 * cell and a text cell (title, tagline, and an em-link call to action).
 */

/* decorative play triangle */
function tri() {
  const i = document.createElement('i');
  i.className = 'catalog-play-tri';
  i.setAttribute('aria-hidden', 'true');
  return i;
}

/* the interactive shell: an <a> when the row carries a link, else an inert box */
function shell(entry, label) {
  const a = document.createElement('a');
  a.className = 'catalog-link';
  if (entry.href) {
    a.href = entry.href;
    a.setAttribute('aria-label', label);
  }
  return a;
}

/* cover art as an optimised <picture>, or a stamped blank sleeve (a bare vinyl
   disc carrying the catalogue mark) when a row has no art */
function sleeve(entry, eager, cls) {
  const frame = document.createElement('span');
  frame.className = cls;
  if (entry.img) {
    frame.append(
      createOptimizedPicture(entry.img.src, entry.img.alt || entry.title, eager, [{ width: '750' }]),
    );
  } else {
    frame.classList.add('catalog-blank');
    const disc = document.createElement('span');
    disc.className = 'catalog-disc';
    disc.setAttribute('aria-hidden', 'true');
    const stamp = document.createElement('span');
    stamp.className = 'catalog-stamp';
    stamp.textContent = entry.mark || '';
    frame.append(disc, stamp);
  }
  return frame;
}

/* a small labelled text span */
function span(cls, text) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = text;
  return el;
}

/* The Catalogue — newest release, large, still on the spindle */
function newestItem(entry) {
  const li = document.createElement('li');
  li.className = 'catalog-newest';

  const link = shell(entry, `${entry.title}. Newest pressing, plays in full. ${entry.cta}`);

  const cover = document.createElement('span');
  cover.className = 'catalog-cover-frame';
  const disc = document.createElement('span');
  disc.className = 'catalog-disc catalog-disc-big';
  disc.setAttribute('aria-hidden', 'true');
  cover.append(disc, sleeve(entry, true, 'catalog-art'));

  const body = document.createElement('span');
  body.className = 'catalog-entry';
  body.append(span('catalog-eyebrow', 'Newest pressing'));
  body.append(span('catalog-title', entry.title));
  if (entry.tagline) body.append(span('catalog-tagline', entry.tagline));

  const play = document.createElement('span');
  play.className = 'catalog-play';
  play.append(tri(), document.createTextNode('Plays in full · no sign-in'));
  body.append(play);
  if (entry.cta) body.append(span('catalog-cta', entry.cta));

  link.append(cover, body);
  li.append(link);
  return li;
}

/* The Catalogue — archive ledger row */
function ledgerItem(entry) {
  const li = document.createElement('li');
  li.className = 'catalog-item';

  const link = shell(entry, `${entry.title}. Plays in full. ${entry.cta}`);
  link.append(span('catalog-no', entry.mark));
  link.append(sleeve(entry, false, 'catalog-thumb'));

  const body = document.createElement('span');
  body.className = 'catalog-entry';
  body.append(span('catalog-title', entry.title));
  if (entry.tagline) body.append(span('catalog-tagline', entry.tagline));
  link.append(body);

  const meta = document.createElement('span');
  meta.className = 'catalog-meta';
  const play = document.createElement('span');
  play.className = 'catalog-play';
  play.append(tri(), document.createTextNode('Full'));
  meta.append(play);
  if (entry.cta) meta.append(span('catalog-cta', entry.cta));
  link.append(meta);

  li.append(link);
  return li;
}

/* Mixtapes — a cover sleeve tile with an Apple-Music preview affordance */
function tapeItem(entry, feature) {
  const li = document.createElement('li');
  li.className = feature ? 'catalog-tape catalog-tape-feature' : 'catalog-tape';

  const link = shell(entry, `${entry.title}. Apple Music preview. ${entry.cta}`);

  const cover = sleeve(entry, false, 'catalog-art');
  const badge = document.createElement('span');
  badge.className = 'catalog-preview';
  badge.append(tri(), document.createTextNode('Preview'));
  cover.append(badge);
  link.append(cover);

  const body = document.createElement('span');
  body.className = 'catalog-entry';
  body.append(span('catalog-title', entry.title));
  if (feature && entry.tagline) body.append(span('catalog-tagline', entry.tagline));
  body.append(span('catalog-source', 'Apple Music · 30-sec preview'));
  link.append(body);

  li.append(link);
  return li;
}

/* read a cards-style row into a plain entry */
function readEntry(row) {
  const link = row.querySelector('a');
  const textParas = [...row.querySelectorAll('p')]
    .filter((p) => !p.querySelector('a') && p.textContent.trim());
  return {
    title: textParas[0]?.textContent.trim() || '',
    tagline: textParas[1]?.textContent.trim() || '',
    href: link ? link.getAttribute('href') : null,
    cta: link ? link.textContent.trim() : '',
    img: row.querySelector('img'),
    mark: '',
  };
}

export default function decorate(block) {
  const mixtapes = block.classList.contains('mixtapes');
  const entries = [...block.children].map(readEntry).filter((e) => e.title);

  const ul = document.createElement('ul');

  if (mixtapes) {
    ul.className = 'catalog-wall';
    entries.forEach((entry, i) => {
      entry.mark = `MIX·${String(i + 1).padStart(2, '0')}`;
      // a steady rhythm of larger tiles breaks the monotony without chaos
      const feature = i === 0 || (i + 1) % 5 === 0;
      ul.append(tapeItem(entry, feature));
    });
  } else {
    ul.className = 'catalog-shelf';
    entries.forEach((entry, i) => {
      if (i === 0) {
        entry.mark = 'NEW';
        ul.append(newestItem(entry));
      } else {
        entry.mark = `TRR·${String(i).padStart(2, '0')}`;
        ul.append(ledgerItem(entry));
      }
    });
  }

  block.replaceChildren(ul);
}
