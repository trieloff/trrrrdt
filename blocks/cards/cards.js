import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    const li = document.createElement('li');
    let hasImage = false;
    [...row.children].forEach((col) => {
      const isEmpty = !col.hasChildNodes()
        || (col.children.length === 1 && !col.firstElementChild.textContent.trim());
      if (isEmpty) return;
      if (col.querySelector('picture')) {
        col.className = 'cards-card-image';
        hasImage = true;
      } else {
        col.className = 'cards-card-body';
      }
      li.append(col);
    });
    if (hasImage) li.classList.add('cards-has-image');
    // channel stripe: cards linking to an artist page get that artist's desk color
    const artistLink = li.querySelector('a[href*="/artists/"]');
    if (artistLink) {
      const slug = new URL(artistLink.href, window.location.href).pathname.split('/').pop();
      li.style.setProperty('--channel', `var(--channel-${slug}, var(--accent-color))`);
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
