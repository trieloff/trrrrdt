import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

// One meter segment per channel on the roster — a detail, not a feature.
const VU_SEGMENTS = 10;

/**
 * Builds the live VU meter: a row of segments pulsing on a slow LFO.
 * Purely decorative, so it is hidden from assistive tech. The animation
 * (and its static reduced-motion fallback) lives entirely in CSS.
 * @returns {HTMLElement} the meter element
 */
function buildVuMeter() {
  const vu = document.createElement('div');
  vu.className = 'footer-vu';
  vu.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < VU_SEGMENTS; i += 1) {
    const seg = document.createElement('span');
    seg.className = 'footer-vu-seg';
    // per-segment phase offset → the pulse rolls across the meter
    seg.style.setProperty('--seg', i);
    vu.append(seg);
  }
  return vu;
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  // authored footer content (tagline + fine print) — left side of the panel.
  // We decorate whatever the fragment delivers, so the authoring contract
  // is unchanged; be defensive in case the fragment fails to load.
  const copy = document.createElement('div');
  copy.className = 'footer-copy';
  if (fragment) {
    while (fragment.firstElementChild) copy.append(fragment.firstElementChild);
  }

  // burn-in ghost — decorative phosphor memory layered under the copy.
  // Never announced; its 3% opacity keeps it clear of the real text.
  const ghost = document.createElement('span');
  ghost.className = 'footer-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = 'NO SIGNAL';

  // serial plate — right side. All text is CSS-generated so authors
  // needn't maintain the fictional model metadata.
  const plate = document.createElement('div');
  plate.className = 'footer-plate';

  // asymmetric back panel: copy left, serial plate right
  const panel = document.createElement('div');
  panel.className = 'footer-panel';
  panel.append(ghost, copy, plate);

  // decorate footer DOM
  block.textContent = '';
  const consoleEl = document.createElement('div');
  consoleEl.className = 'footer-console';
  consoleEl.append(buildVuMeter(), panel);

  block.append(consoleEl);
}
