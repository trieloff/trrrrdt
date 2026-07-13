/*
 * Quote Block — trrrrdt liner-note pull quote
 *
 * Keeps the Block Collection authoring contract:
 *   row 1  = quotation
 *   row 2  = attribution (optional; italic source names become <cite>)
 *
 * Remix: the quotation is set in Fraunces italic at display size. The first
 * word is ruptured on the WONK axis — the psychedelic crack in an otherwise
 * sober serif — while the oversized quote mark and mono attribution are drawn
 * in CSS. Variant `quote crt` swaps in a phosphor-monitor frame.
 */

/**
 * Wraps the first visible word of a container in a span so a single word can
 * carry the WONK-axis rupture while the rest of the quotation stays sober.
 * @param {Element} container the quotation cell
 */
function ruptureFirstWord(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && !node.nodeValue.trim()) {
    node = walker.nextNode();
  }
  if (!node) return;

  const match = node.nodeValue.match(/^(\s*)(\S+)(.*)$/s);
  if (!match) return;

  const [, lead, word, rest] = match;
  const span = document.createElement('span');
  span.className = 'quote-rupture';
  span.textContent = word;

  const frag = document.createDocumentFragment();
  if (lead) frag.append(document.createTextNode(lead));
  frag.append(span);
  if (rest) frag.append(document.createTextNode(rest));
  node.replaceWith(frag);
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const [quotationRow, attributionRow] = [...block.children];
  const blockquote = document.createElement('blockquote');

  // quotation — first row's cell
  const quotation = quotationRow ? quotationRow.firstElementChild : null;
  if (quotation) {
    quotation.className = 'quote-quotation';
    ruptureFirstWord(quotation);
    blockquote.append(quotation);
  }

  // attribution — optional second row's cell
  const attribution = attributionRow ? attributionRow.firstElementChild : null;
  if (attribution) {
    attribution.className = 'quote-attribution';
    attribution.querySelectorAll('em').forEach((em) => {
      const cite = document.createElement('cite');
      cite.innerHTML = em.innerHTML;
      em.replaceWith(cite);
    });
    blockquote.append(attribution);
  }

  block.innerHTML = '';
  block.append(blockquote);
}
