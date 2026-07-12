/**
 * devices — an equipment rack for "The Machines".
 *
 * Accepts the SAME authored structure as `columns`: one row per device, where a
 * row is an image cell plus a body cell (an `h2` name, an italic role line,
 * description paragraphs and a bold CTA link). Every row is rebuilt as a rack
 * unit — a molded faceplate with a model-number plate, a status LED, a VU strip
 * and mounting screws (the screws, bevels and scan lines are CSS). A page can
 * therefore switch from `columns` to `devices` just by renaming the block, with
 * no content rewrite. Missing cells (image-only or text-only rows) are handled
 * gracefully.
 *
 * @param {Element} block the devices block element
 */
export default function decorate(block) {
  [...block.children].forEach((row, index) => {
    row.classList.add('devices-unit');

    const cells = [...row.children];
    const media = cells.find((cell) => cell.querySelector('picture, img'));
    // the panel is the other cell; a lone text cell still becomes the panel
    const panel = cells.find((cell) => cell !== media);

    if (media) media.classList.add('devices-media');
    if (!panel) return;
    panel.classList.add('devices-panel');

    // --- model-number plate: slot id + status cluster, then name and role ---
    const plate = document.createElement('div');
    plate.className = 'devices-plate';

    const bar = document.createElement('div');
    bar.className = 'devices-plate-bar';

    const slot = document.createElement('span');
    slot.className = 'devices-slot';
    slot.setAttribute('aria-hidden', 'true');
    slot.textContent = `Unit ${String(index + 1).padStart(2, '0')}`;

    const led = document.createElement('span');
    led.className = 'devices-led';
    led.setAttribute('aria-hidden', 'true');

    const vu = document.createElement('span');
    vu.className = 'devices-vu';
    vu.setAttribute('aria-hidden', 'true');

    bar.append(slot, led, vu);
    plate.append(bar);

    const heading = panel.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) plate.append(heading);

    // the role line is the first paragraph that is only an <em> (e.g. "The turntable")
    const role = [...panel.querySelectorAll(':scope > p')].find((p) => {
      const em = p.querySelector('em');
      return em && p.textContent.trim() === em.textContent.trim();
    });
    if (role) {
      role.classList.add('devices-role');
      plate.append(role);
    }

    // --- body: whatever is left (description paragraphs + CTA) ---
    const body = document.createElement('div');
    body.className = 'devices-body';
    [...panel.children].forEach((el) => body.append(el));

    // guarantee a primary CTA with a comfortable (>=44px) touch target
    let cta = body.querySelector('a.button');
    if (!cta) {
      const link = body.querySelector('a[href]');
      if (link) {
        link.classList.add('button');
        const wrapper = link.closest('p');
        if (wrapper) wrapper.classList.add('button-wrapper');
        cta = link;
      }
    }
    if (cta
      && !cta.classList.contains('primary')
      && !cta.classList.contains('secondary')
      && !cta.classList.contains('accent')) {
      cta.classList.add('primary');
    }

    panel.append(plate, body);
  });
}
