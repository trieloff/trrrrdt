/*
 * Accordion Block — trrrrdt service panel
 *
 * Keeps the Block Collection details/summary semantics:
 *   each row = summary cell + body cell -> native <details>
 *
 * Remix (all in CSS): beveled equipment-panel rows with screw corners, a mono
 * uppercase summary label, a status marker that flips from ring to lit dot on
 * open, and an inset "service hatch" body. Native keyboard behaviour is left
 * untouched.
 */

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  [...block.children].forEach((row) => {
    const [label, body] = row.children;

    // summary — the panel's label
    const summary = document.createElement('summary');
    summary.className = 'accordion-item-label';
    if (label) summary.append(...label.childNodes);

    // body — the opened service hatch
    if (body) body.className = 'accordion-item-body';

    // native details preserves keyboard + assistive-tech semantics
    const details = document.createElement('details');
    details.className = 'accordion-item';
    details.append(summary);
    if (body) details.append(body);
    row.replaceWith(details);
  });
}
