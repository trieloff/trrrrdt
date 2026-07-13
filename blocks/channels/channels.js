import { createOptimizedPicture } from '../../scripts/aem.js';

/*
 * Per-artist desk assignments, transcribed from the homepage briefing's
 * channel table (stardust/briefings/homepage.md):
 *   - ch:              the artist's fixed slot on the desk (channel number)
 *   - wght/wonk/soft:  the Fraunces axes that give each name its own face
 * Artists absent from the table (a new signing) fall back to their row order
 * for the number and to DEFAULT_AXES for the name — so the strip never breaks.
 */
const DESK = {
  'sylvaine-eternelle': {
    ch: 1, wght: 500, wonk: 1, soft: 70,
  },
  'helle-raud': {
    ch: 2, wght: 200, wonk: 0, soft: 0,
  },
  'natsuko-terada': {
    ch: 3, wght: 600, wonk: 1, soft: 40,
  },
  'dmitri-volkov': {
    ch: 4, wght: 300, wonk: 0, soft: 20,
  },
  'kevin-mayfield': {
    ch: 5, wght: 800, wonk: 1, soft: 80,
  },
  'the-moss-twins': {
    ch: 6, wght: 400, wonk: 1, soft: 100,
  },
  'itzik-kagan': {
    ch: 7, wght: 900, wonk: 1, soft: 100,
  },
  'ann-francon': {
    ch: 8, wght: 700, wonk: 1, soft: 60,
  },
  'cassidy-diane': {
    ch: 9, wght: 350, wonk: 0, soft: 30,
  },
};

const DEFAULT_AXES = { wght: 460, wonk: 0, soft: 20 };

/** create a <span> with a class and optional text */
function span(className, text) {
  const el = document.createElement('span');
  el.className = className;
  if (text) el.textContent = text;
  return el;
}

/** derive the artist slug from a link, same pattern as cards.js */
function slugFromLink(link) {
  if (!link) return '';
  const { pathname } = new URL(link.href, window.location.href);
  return pathname.split('/').filter(Boolean).pop() || '';
}

/**
 * loads and decorates the channels block — the roster as a mixing-desk patch bay
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const list = document.createElement('ul');
  list.className = 'channels-desk';

  [...block.children].forEach((row, index) => {
    // the whole strip becomes this single artist-page link
    const link = row.querySelector('a[href]');

    // first paragraph is the name, second the tagline, the link's own text the
    // "cue" (patch label). guard every field so a missing tagline/image is fine.
    const paras = [...row.querySelectorAll('p')];
    const textParas = paras.filter((p) => !link || !p.contains(link));
    const name = textParas[0] ? textParas[0].textContent.trim() : '';
    const tagline = textParas[1] ? textParas[1].textContent.trim() : '';
    const cue = link ? link.textContent.trim() : '';

    // nothing renderable (e.g. an empty spacer row) → skip
    if (!name && !link) return;

    // slug → channel color + Fraunces axes + fixed channel number
    const slug = slugFromLink(link);
    const desk = DESK[slug];
    const axes = desk || DEFAULT_AXES;
    const channelNo = String(desk ? desk.ch : index + 1).padStart(2, '0');

    const strip = document.createElement(link ? 'a' : 'div');
    strip.className = 'channels-strip';
    if (link) {
      strip.href = link.getAttribute('href');
      strip.setAttribute(
        'aria-label',
        tagline ? `Channel ${channelNo}: ${name} — ${tagline}` : `Channel ${channelNo}: ${name}`,
      );
    }
    strip.style.setProperty('--channel', `var(--channel-${slug}, var(--accent-color))`);
    strip.style.setProperty('--fr-wght', String(axes.wght));
    strip.style.setProperty('--fr-wonk', String(axes.wonk));
    strip.style.setProperty('--fr-soft', String(axes.soft));

    // colored channel stripe (decorative — the color is meaning, not the shape)
    const stripe = span('channels-stripe');
    stripe.setAttribute('aria-hidden', 'true');
    strip.append(stripe);

    // channel number — amber panel marking
    const num = span('channels-number', channelNo);
    num.setAttribute('aria-hidden', 'true');
    strip.append(num);

    // optional scribble-strip thumbnail (image cell), kept small
    const media = row.querySelector('picture, img');
    if (media) {
      const img = media.tagName === 'IMG' ? media : media.querySelector('img');
      if (img && img.src) {
        const thumb = span('channels-thumb');
        thumb.setAttribute('aria-hidden', 'true');
        thumb.append(createOptimizedPicture(img.src, '', false, [{ width: '160' }]));
        strip.append(thumb);
      }
    }

    // name (Fraunces at the artist's axes) + tagline (mono caption)
    const label = span('channels-label');
    label.append(span('channels-name', name));
    if (tagline) label.append(span('channels-tagline', tagline));
    strip.append(label);

    // cue / patch label on the right (the CTA text) with a jack arrow
    const cueEl = span('channels-cue');
    cueEl.setAttribute('aria-hidden', 'true');
    if (cue) cueEl.append(span('channels-cue-text', cue));
    cueEl.append(span('channels-arrow', '→'));
    strip.append(cueEl);

    const item = document.createElement('li');
    item.append(strip);
    list.append(item);
  });

  block.replaceChildren(list);
}
