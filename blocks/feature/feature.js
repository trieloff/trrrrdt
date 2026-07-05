/**
 * feature — a spotlighted featured release: cover art beside editorial copy.
 * Expected content: one row, two cells — an image cell and a text cell
 * (heading, optional subtitle, description, and CTA links). The image cell is
 * detected by its <picture>/<img>; a "Featured Release" eyebrow is prepended to
 * the copy so authors only supply the title, text, and links.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;
  const cells = [...row.children];
  const art = cells.find((c) => c.querySelector('picture, img'));
  const body = cells.find((c) => c !== art) || cells[1] || cells[0];

  if (art) art.classList.add('feature-art');

  if (body && body !== art) {
    body.classList.add('feature-body');
    if (!body.querySelector('.feature-eyebrow')) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'feature-eyebrow';
      eyebrow.textContent = 'Featured Release';
      body.prepend(eyebrow);
    }
  }
}
