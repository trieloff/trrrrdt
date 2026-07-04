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
    if (li.hasChildNodes()) ul.append(li);
  });
  ul.querySelectorAll('picture > img').forEach((img) => {
    img.closest('picture').replaceWith(
      createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }]),
    );
  });
  block.replaceChildren(ul);
}
