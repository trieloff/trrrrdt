import { createOptimizedPicture } from '../../scripts/aem.js';

export default function decorate(block) {
  /* change to ul, li — each column becomes its own card */
  const ul = document.createElement('ul');
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      const isEmpty = !col.hasChildNodes()
        || (col.children.length === 1 && !col.firstElementChild.textContent.trim());
      if (isEmpty) return;
      const li = document.createElement('li');
      if (col.children.length === 1 && col.querySelector('picture')) {
        col.className = 'cards-card-image';
        li.append(col);
      } else {
        col.className = 'cards-card-body';
        li.append(col);
      }
      ul.append(li);
    });
  });
  ul.querySelectorAll('picture > img').forEach((img) => img.closest('picture').replaceWith(createOptimizedPicture(img.src, img.alt, false, [{ width: '750' }])));
  block.replaceChildren(ul);
}
