import { createOptimizedPicture } from '../../scripts/aem.js';

// Per-artist Fraunces axis settings (wght / WONK / SOFT) from the label brief.
// Each name wears its own weight and wonk so the roster stops reading as ten
// identical products. Unknown slugs fall back to the default axis in cards.css.
const ARTIST_AXES = {
  'sylvaine-eternelle': { wght: '500', wonk: '1', soft: '70' },
  'helle-raud': { wght: '200', wonk: '0', soft: '0' },
  'natsuko-terada': { wght: '600', wonk: '1', soft: '40' },
  'dmitri-volkov': { wght: '300', wonk: '0', soft: '20' },
  'kevin-mayfield': { wght: '800', wonk: '1', soft: '80' },
  'the-moss-twins': { wght: '400', wonk: '1', soft: '100' },
  'itzik-kagan': { wght: '900', wonk: '1', soft: '100' },
  'ann-francon': { wght: '700', wonk: '1', soft: '60' },
  'cassidy-diane': { wght: '350', wonk: '0', soft: '30' },
};

export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    let hasImage = false;
    [...row.children].forEach((col) => {
      // a cell holding cover art (EDS ingestion delivers a bare <img>, not a
      // <picture>) is never "empty" even though it has no text
      const media = col.querySelector('picture, img');
      const isEmpty = !media && (!col.hasChildNodes()
        || (col.children.length === 1 && !col.firstElementChild.textContent.trim()));
      if (isEmpty) return;
      if (media) {
        col.className = 'cards-card-image';
        hasImage = true;
      } else {
        col.className = 'cards-card-body';
      }
      li.append(col);
    });
    if (hasImage) li.classList.add('cards-has-image');
    // channel stripe + per-artist typography: cards linking to an artist page
    // get that artist's desk colour and their unique Fraunces axis settings
    const artistLink = li.querySelector('a[href*="/artists/"]');
    if (artistLink) {
      const slug = new URL(artistLink.href, window.location.href).pathname.split('/').pop();
      li.style.setProperty('--channel', `var(--channel-${slug}, var(--accent-color))`);
      const axes = ARTIST_AXES[slug];
      if (axes) {
        li.style.setProperty('--card-wght', axes.wght);
        li.style.setProperty('--card-wonk', axes.wonk);
        li.style.setProperty('--card-soft', axes.soft);
      }
    }
    if (li.hasChildNodes()) ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    img.closest('picture').replaceWith(
      createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]),
    );
  });
  block.replaceChildren(ul);
}
