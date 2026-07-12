/**
 * A "model plate" is the italic role line under a heading — a paragraph whose
 * entire content is a single <em> (e.g. "The turntable"). We stamp it like an
 * engraved equipment plate. The text-equality guard keeps inline emphasis
 * inside a longer paragraph (e.g. a stray <em>word</em>) from being plated.
 * @param {Element} col a column element
 */
function markModelPlates(col) {
  [...col.querySelectorAll(':scope > p')].forEach((p) => {
    const em = p.querySelector(':scope > em');
    const isPlate = em
      && p.children.length === 1
      && p.textContent.trim() === em.textContent.trim();
    if (isPlate) p.classList.add('columns-plate');
  });
}

/**
 * loads and decorates the columns block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const cols = [...block.firstElementChild.children];
  block.classList.add(`columns-${cols.length}-cols`);

  // decorate every cell of every row (any row/cell count — backward compatible)
  [...block.children].forEach((row) => {
    [...row.children].forEach((col) => {
      // inset image bays: a column whose only content is a picture
      const pic = col.querySelector('picture');
      if (pic) {
        const picWrapper = pic.closest('div');
        if (picWrapper && picWrapper.children.length === 1) {
          picWrapper.classList.add('columns-img-col');
        }
      }

      // model-plate typography for the italic role line
      markModelPlates(col);
    });
  });
}
