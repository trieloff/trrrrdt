/**
 * broadcast — the homepage "on air now" power-on ritual.
 *
 * Frames what is currently on air (the newest playlist) as a piece of broadcast
 * equipment: a CRT feed of the cover art beside a console with a channel readout,
 * an on-air tally light, a VU meter, and ONE dominant primary CTA (tune in).
 * No WebGL, no player bundle — pure CSS/JS chrome. The cover stays the authored,
 * server-optimized <picture> so it can serve as the LCP image.
 *
 * AUTHORING CONTRACT — one row, two cells:
 *
 *   | <cover picture>  | ON AIR · CH 01        (1st paragraph → channel readout / eyebrow)
 *   |                  | ## La Toile           (heading    → on-air title)
 *   |                  | Sylvaine Éternelle …  (paragraph after heading → subtitle)
 *   |                  | **Tune in** (link)    (bold link  → primary CTA — the drop-needle)
 *   |                  | *Liner notes* (link)  (italic link → secondary CTA, optional)
 *   |                  | *Sony PS-F9*          (italic text, no link → machine label, optional)
 *
 * The framework's button decoration runs before this block, so by the time we
 * decorate: bold links are `a.button.primary` and italic links `a.button.secondary`,
 * each inside a `p.button-wrapper`; a link-less `*…*` stays a plain `<p><em>` and is
 * read as the machine label. Ordering defines the roles, so authoring is:
 *   channel line (before heading) · heading · subtitle · CTAs · machine label.
 * Everything except the heading and primary CTA is optional and degrades gracefully.
 *
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;

  const cells = [...row.children];
  const screenCell = cells.find((c) => c.querySelector('picture, img'));
  const body = cells.find((c) => c !== screenCell) || null;

  // --- the CRT feed --------------------------------------------------------
  const media = screenCell
    ? (screenCell.querySelector('picture') || screenCell.querySelector('img'))
    : null;

  let screen = null;
  if (media) {
    screen = document.createElement('div');
    screen.className = 'broadcast-screen';

    const scanlines = document.createElement('div');
    scanlines.className = 'broadcast-scanlines';
    scanlines.setAttribute('aria-hidden', 'true');

    const glass = document.createElement('div');
    glass.className = 'broadcast-glass';
    glass.setAttribute('aria-hidden', 'true');

    const bug = document.createElement('span');
    bug.className = 'broadcast-bug';
    bug.setAttribute('aria-hidden', 'true');
    const bugDot = document.createElement('span');
    bugDot.className = 'broadcast-bug-dot';
    bug.append(bugDot, document.createTextNode('Live'));

    screen.append(media, scanlines, glass, bug);
  }

  // --- the console ---------------------------------------------------------
  const panel = document.createElement('div');
  panel.className = 'broadcast-console';

  const heading = body && body.querySelector('h1, h2, h3, h4, h5, h6');

  // classify the body's paragraphs by their position relative to the heading
  let eyebrow = null;
  let subtitle = null;
  let machine = null;
  const actions = [];

  if (body) {
    let seenHeading = false;
    [...body.children].forEach((el) => {
      if (el === heading) { seenHeading = true; return; }
      if (el.classList.contains('button-wrapper')) { actions.push(el); return; }
      if (el.tagName !== 'P') return;
      if (!seenHeading) {
        if (!eyebrow) eyebrow = el;
      } else if (!subtitle) {
        subtitle = el;
      } else if (!machine) {
        machine = el;
      }
    });
  }

  // channel readout / eyebrow with a live tally light
  const channel = eyebrow || document.createElement('p');
  channel.classList.add('broadcast-channel');
  if (!eyebrow) channel.textContent = 'On Air';
  const tally = document.createElement('span');
  tally.className = 'broadcast-tally';
  tally.setAttribute('aria-hidden', 'true');
  channel.prepend(tally);

  // on-air VU meter — decorative, animated in CSS, gated by reduced motion
  const SEGMENTS = 14;
  const meter = document.createElement('div');
  meter.className = 'broadcast-meter';
  meter.setAttribute('aria-hidden', 'true');
  Array.from({ length: SEGMENTS }).forEach((_, i) => {
    const segment = document.createElement('span');
    segment.className = 'broadcast-segment';
    segment.style.setProperty('--i', String(i));
    meter.append(segment);
  });

  if (subtitle) subtitle.classList.add('broadcast-subtitle');
  if (machine) machine.classList.add('broadcast-machine');

  const actionRow = document.createElement('div');
  actionRow.className = 'broadcast-actions';
  actions.forEach((a) => actionRow.append(a));

  panel.append(channel, meter);
  if (heading) panel.append(heading);
  if (subtitle) panel.append(subtitle);
  if (actions.length) panel.append(actionRow);
  if (machine) panel.append(machine);

  // --- reassemble ----------------------------------------------------------
  block.textContent = '';
  if (screen) block.append(screen);
  else block.classList.add('broadcast-no-screen');
  block.append(panel);
}
