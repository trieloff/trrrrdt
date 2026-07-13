/**
 * feature — a liner-note spread: a record sleeve laid on parchment beside
 * typewritten editorial copy. A physical insert, not an editorial card.
 *
 * Expected content: one row, two cells — an image cell and a text cell.
 * The text cell holds an optional eyebrow (a short paragraph BEFORE the
 * heading, rendered as a stamped archive mark), a heading, an optional
 * subtitle (the poetic line right after the heading), a description, and CTA
 * links. If no eyebrow is authored, a "From the Archive" mark is stamped. The
 * image cell is detected by its <picture>/<img>.
 *
 * Content contract is unchanged from the editorial-card version — the same
 * authored table renders in either dialect. Two visual dialects are available
 * via a block class: default parchment (liner) and `feature (dark)` /
 * `feature (stage)` charcoal for player-adjacent contexts.
 *
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

    // an authored line before the heading becomes the stamped eyebrow;
    // otherwise stamp a default archive mark (re-worded from the generic
    // "Featured Release" — this is a label archive, not a SaaS promo)
    const first = body.firstElementChild;
    if (first && first.tagName === 'P') {
      first.classList.add('feature-eyebrow');
    } else if (!body.querySelector('.feature-eyebrow')) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'feature-eyebrow';
      eyebrow.textContent = 'From the Archive';
      body.prepend(eyebrow);
    }

    // the line right after the heading is the multilingual / poetic subtitle —
    // the one Fraunces rupture in an otherwise typewritten manual
    const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
    const sub = heading && heading.nextElementSibling;
    if (sub && sub.tagName === 'P' && !sub.classList.contains('button-wrapper')) {
      sub.classList.add('feature-subtitle');
    }

    // collect the CTAs into a single actions row at the foot of the copy
    const actions = [...body.querySelectorAll(':scope > .button-wrapper')];
    if (actions.length) {
      const group = document.createElement('div');
      group.className = 'feature-actions';
      actions[0].before(group);
      actions.forEach((btn) => group.append(btn));
    }
  }
}
