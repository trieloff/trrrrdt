/**
 * Cassette tape block — renders each row as a Compact Cassette.
 * Expected content per row:
 *   col 1: title text (song/album name)
 *   col 2: subtitle / genre / description (optional)
 * An <a> in either cell turns the whole cassette into a link.
 *
 * @param {Element} block
 */
export default function decorate(block) {
  const ul = document.createElement('ul');

  [...block.children].forEach((row, i) => {
    const cols = [...row.children];
    const title = cols[0]?.textContent?.trim() || '';
    const subtitle = cols[1]?.textContent?.trim() || '';
    const link = cols[0]?.querySelector('a') || cols[1]?.querySelector('a');

    const li = document.createElement('li');
    li.className = 'cassette';

    const shell = document.createElement('div');
    shell.className = 'cassette-shell';
    shell.innerHTML = `
      <span class="cassette-screw cassette-screw-tl"></span>
      <span class="cassette-screw cassette-screw-tr"></span>
      <span class="cassette-screw cassette-screw-bl"></span>
      <span class="cassette-screw cassette-screw-br"></span>
      <div class="cassette-label">
        <div class="cassette-label-head">
          <span class="cassette-side">Side A</span>
          <span class="cassette-index">Nº ${String(i + 1).padStart(2, '0')}</span>
        </div>
        <span class="cassette-title"></span>
        <span class="cassette-subtitle"></span>
      </div>
      <div class="cassette-window">
        <div class="cassette-reel cassette-reel-l"><span class="cassette-hub"></span></div>
        <div class="cassette-tape"></div>
        <div class="cassette-reel cassette-reel-r"><span class="cassette-hub"></span></div>
      </div>
      <div class="cassette-mouth"><span></span><span></span><span></span></div>
    `;
    shell.querySelector('.cassette-title').textContent = title;
    shell.querySelector('.cassette-subtitle').textContent = subtitle;
    if (!subtitle) shell.querySelector('.cassette-subtitle').remove();

    if (link) {
      const a = document.createElement('a');
      a.href = link.href;
      a.className = 'cassette-link';
      a.setAttribute('aria-label', title || 'Play');
      a.append(shell);
      li.append(a);
    } else {
      li.append(shell);
    }
    ul.append(li);
  });

  block.replaceChildren(ul);
}
