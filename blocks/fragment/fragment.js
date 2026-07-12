/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 *
 * Remix pattern (trrrrdt): this block is infrastructure — it loads a
 * `.plain.html` fragment and splices its sections/blocks into the host DOM. We
 * deliberately keep its JS and CSS empty of styling. Instead, a fragment
 * inherits its look from the *consuming context*:
 *   - The `nav` fragment is loaded by `header` (see blocks/header/header.js),
 *     so blocks/header/header.css styles that content as the mixing-desk nav
 *     (channel LEDs, active-route segment, mobile service panel).
 *   - The footer tagline fragment is styled by blocks/footer/footer.css
 *     (serial-plate / VU-strip typography).
 * Author guidance: to trrrrdt-ify a fragment, style it where it is consumed —
 * do not add rules here. For a standalone authored insert that should read as
 * equipment chrome on its own, an optional `fragment--panel` section class can
 * be introduced (screw-corner rack styling) without touching this loader.
 */

// eslint-disable-next-line import/no-cycle
import {
  decorateMain,
} from '../../scripts/scripts.js';

import {
  loadSections,
} from '../../scripts/aem.js';

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {HTMLElement} The root element of the fragment
 */
export async function loadFragment(path) {
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    const resp = await fetch(`${path}.plain.html`);
    if (resp.ok) {
      const main = document.createElement('main');
      main.innerHTML = await resp.text();

      // reset base path for media to fragment base
      const resetAttributeBase = (tag, attr) => {
        main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
          elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
        });
      };
      resetAttributeBase('img', 'src');
      resetAttributeBase('source', 'srcset');

      decorateMain(main);
      await loadSections(main);
      return main;
    }
  }
  return null;
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  if (fragment) block.replaceChildren(...fragment.childNodes);
}
