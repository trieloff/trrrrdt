/*
 * hero — a hi-fi receiver powering on.
 *
 * The block is auto-created from a leading <picture> + <h1> (see buildHeroBlock in
 * scripts.js) or authored as a table with body copy and CTAs. This decorator never
 * touches that contract: it reads the heading and injects decorative "on-air" chrome
 * (an ON AIR sign, a channel readout and a segmented VU meter), then triggers a
 * one-time CRT warm-up on first paint. The warm-up animation is disabled under
 * prefers-reduced-motion in CSS, so toggling the class is a no-op for visitors who
 * have asked to reduce motion.
 */

const METER_SEGMENTS = 12;

/**
 * Derives a stable two-digit channel number from a string.
 * @param {string} text source text (heading or document title)
 * @returns {string} zero-padded channel, e.g. "07"
 */
function channelFromText(text) {
  const source = (text || '').trim() || 'trrrrdt';
  let sum = 0;
  for (let i = 0; i < source.length; i += 1) {
    sum = (sum + source.charCodeAt(i)) % 98;
  }
  return String(sum + 1).padStart(2, '0');
}

/**
 * Derives a stable meter level (lit segments) — a receiver at mid-to-high signal,
 * never silent and never fully pinned.
 * @param {string} text source text
 * @param {number} segments total segment count
 * @returns {number} number of lit segments
 */
function levelFromText(text, segments) {
  const source = (text || '').trim() || 'trrrrdt';
  let sum = 0;
  for (let i = 0; i < source.length; i += 1) {
    sum += source.charCodeAt(i);
  }
  const min = Math.ceil(segments * 0.55);
  const span = segments - min;
  return span ? min + (sum % (span + 1)) : min;
}

/**
 * Builds the segmented VU meter — green through amber to a red peak.
 * @param {number} level number of lit segments
 * @returns {Element} the meter element
 */
function buildMeter(level) {
  const meter = document.createElement('span');
  meter.className = 'hero-meter';
  for (let i = 0; i < METER_SEGMENTS; i += 1) {
    const segment = document.createElement('i');
    if (i < level) segment.classList.add('is-lit');
    if (i >= METER_SEGMENTS - 2) segment.dataset.zone = 'peak';
    else if (i >= METER_SEGMENTS - 5) segment.dataset.zone = 'high';
    meter.append(segment);
  }
  return meter;
}

/**
 * loads and decorates the block
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const heading = block.querySelector('h1, h2');
  const label = (heading && heading.textContent) || document.title;

  const onair = document.createElement('div');
  onair.className = 'hero-onair';
  // decorative equipment marking — keep it out of the accessibility tree
  onair.setAttribute('aria-hidden', 'true');

  const sign = document.createElement('span');
  sign.className = 'hero-sign';
  sign.textContent = 'On Air';

  const channel = document.createElement('span');
  channel.className = 'hero-channel';
  channel.textContent = `CH ${channelFromText(label)}`;

  onair.append(sign, channel, buildMeter(levelFromText(label, METER_SEGMENTS)));
  block.prepend(onair);

  // CRT warm-up: one focal moment on first paint. CSS runs the animation only when
  // the visitor has not asked to reduce motion; clear the class once it finishes so
  // no filter lingers on the block.
  block.classList.add('hero-warmup');
  const clear = (event) => {
    if (event.animationName === 'hero-crt-warmup') {
      block.classList.remove('hero-warmup');
      block.removeEventListener('animationend', clear);
    }
  };
  block.addEventListener('animationend', clear);
}
