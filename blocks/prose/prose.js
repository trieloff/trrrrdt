/*
 * prose — a light section-level decorator for long-form essay copy. The author
 * drops a single-cell block holding the flow (h2 chapters, paragraphs, pull
 * quotes) and it gets the reading rhythm: equipment (VU) dividers between
 * chapters and small-caps for bold personal names. Styling lives in prose.css;
 * this only sets up the DOM. Cheap and idempotent.
 */

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  if (block.dataset.prose) return; // idempotent — decorate once
  block.dataset.prose = 'on';

  // flatten the EDS single-row/single-cell table wrapper so the essay flows
  // directly inside .prose (simpler measure + divider insertion)
  const row = block.children.length === 1 ? block.firstElementChild : null;
  const cell = row && row.children.length === 1 ? row.firstElementChild : null;
  if (cell && !cell.matches('picture, img, a')) {
    block.replaceChildren(...cell.childNodes);
  }

  // equipment divider before every chapter heading except a leading one
  block.querySelectorAll('h2, h3').forEach((h) => {
    if (!h.previousElementSibling || h.previousElementSibling.classList.contains('prose-divider')) return;
    const divider = document.createElement('div');
    divider.className = 'prose-divider';
    divider.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 7; i += 1) divider.append(document.createElement('span'));
    h.before(divider);
  });

  // author bold → small-caps personal name (skip bolded links / buttons)
  block.querySelectorAll('strong').forEach((strong) => {
    if (strong.querySelector('a') || strong.closest('a')) return;
    strong.classList.add('pn');
  });
}
