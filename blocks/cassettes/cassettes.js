/**
 * Cassette tape block — renders each row as a retro cassette.
 * Expected content per row:
 *   col 1: title text (song/album name)
 *   col 2: subtitle / artist / description (optional)
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row) => {
    const cols = [...row.children];
    const li = document.createElement('li');
    li.className = 'cassette';

    // Build cassette shell
    const shell = document.createElement('div');
    shell.className = 'cassette-shell';

    // Top screw holes
    const screws = document.createElement('div');
    screws.className = 'cassette-screws';
    screws.innerHTML = '<span></span><span></span>';
    shell.append(screws);

    // Reel window
    const window = document.createElement('div');
    window.className = 'cassette-window';
    const reelL = document.createElement('div');
    reelL.className = 'cassette-reel cassette-reel-l';
    const reelR = document.createElement('div');
    reelR.className = 'cassette-reel cassette-reel-r';
    const tape = document.createElement('div');
    tape.className = 'cassette-tape';
    window.append(reelL, tape, reelR);
    shell.append(window);

    // Label area
    const label = document.createElement('div');
    label.className = 'cassette-label';

    const title = cols[0]?.textContent?.trim() || '';
    const subtitle = cols[1]?.textContent?.trim() || '';

    if (title) {
      const titleEl = document.createElement('span');
      titleEl.className = 'cassette-title';
      titleEl.textContent = title;
      label.append(titleEl);
    }
    if (subtitle) {
      const subEl = document.createElement('span');
      subEl.className = 'cassette-subtitle';
      subEl.textContent = subtitle;
      label.append(subEl);
    }

    // Wrap any link from the original content
    const link = cols[0]?.querySelector('a') || cols[1]?.querySelector('a');
    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.className = 'cassette-link';
      a.setAttribute('aria-label', title || 'Play');
      a.append(shell, label);
      li.append(a);
    } else {
      shell.append(label);
      li.append(shell);
    }

    // Bottom guides
    const guides = document.createElement('div');
    guides.className = 'cassette-guides';
    li.append(guides);

    ul.append(li);
  });

  block.replaceChildren(ul);
}
