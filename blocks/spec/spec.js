/*
 * spec — a technical panel for Suno style prompts and track metadata. A
 * charcoal, monospace, equipment-panel block. Each row is a spec line: a
 * two-cell row is [label][value]; a one-cell row is a full-width value (e.g. a
 * bare style prompt). Simple and bulletproof — it just tags the authored rows.
 */

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  [...block.children].forEach((row) => {
    row.classList.add('spec-row');
    const cells = [...row.children];
    if (cells.length >= 2) {
      cells[0].classList.add('spec-label');
      cells.slice(1).forEach((cell) => cell.classList.add('spec-value'));
    } else if (cells.length === 1) {
      cells[0].classList.add('spec-value', 'spec-full');
    }
  });
}
