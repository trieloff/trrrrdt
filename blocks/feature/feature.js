/**
 * feature — a spotlighted feature: cover art beside editorial copy.
 * Expected content: one row, two cells — an image cell and a text cell.
 * The text cell holds an optional eyebrow (a short paragraph BEFORE the heading),
 * a heading, an optional subtitle (the line right after the heading), a
 * description, and CTA links. If no eyebrow is authored, a "Featured Release"
 * eyebrow is prepended. The image cell is detected by its <picture>/<img>.
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
    const first = body.firstElementChild;
    if (first && first.tagName === 'P') {
      // an authored line before the heading becomes the eyebrow
      first.classList.add('feature-eyebrow');
    } else if (!body.querySelector('.feature-eyebrow')) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'feature-eyebrow';
      eyebrow.textContent = 'Featured Release';
      body.prepend(eyebrow);
    }
  }
}
