/**
 * Keyboard- and tab-accessible deck navigation for scroll-snap players.
 */

export function scrollToDeckIndex(feed, index, reducedMotion, rowClass) {
  const el = feed.querySelector(`.${rowClass}[data-index="${index}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  return true;
}

export function mountDeckTabs(container, {
  prefix, tracks, tablistLabel, tabLabel, onSelect,
}) {
  container.setAttribute('role', 'tablist');
  container.setAttribute('aria-label', tablistLabel);
  container.textContent = '';
  tracks.forEach((track, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `${prefix}-dot`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-label', tabLabel(track, i));
    tab.setAttribute('aria-selected', 'false');
    tab.dataset.index = String(i);
    tab.addEventListener('click', () => onSelect(i));
    container.append(tab);
  });
}

export function updateDeckTabs(container, prefix, activeIndex) {
  container.querySelectorAll(`.${prefix}-dot`).forEach((tab, i) => {
    const active = i === activeIndex;
    tab.setAttribute('aria-selected', String(active));
    tab.classList.toggle(`${prefix}-dot-active`, active);
    tab.tabIndex = active ? 0 : -1;
  });
}

export function bindDeckRegion(block, {
  regionLabel, getCurrent, getCount, onGo, shortcuts = 'ArrowUp ArrowDown PageUp PageDown Home End',
}) {
  block.setAttribute('role', 'region');
  block.setAttribute('aria-label', regionLabel);
  block.setAttribute('tabindex', '0');
  if (shortcuts) block.setAttribute('aria-keyshortcuts', shortcuts);

  block.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
    const cur = getCurrent();
    const last = getCount() - 1;
    const next = {
      ArrowDown: cur + 1,
      PageDown: cur + 1,
      ArrowUp: cur - 1,
      PageUp: cur - 1,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined || next < 0 || next > last || next === cur) return;
    e.preventDefault();
    onGo(next);
  });
}

export function bindDeckStepButtons(prevBtn, nextBtn, { getCurrent, getCount, onGo }) {
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const i = getCurrent() - 1;
      if (i >= 0) onGo(i);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const i = getCurrent() + 1;
      if (i < getCount()) onGo(i);
    });
  }
}

export function refreshDeckStepButtons(prevBtn, nextBtn, current, count) {
  if (prevBtn) prevBtn.disabled = current <= 0;
  if (nextBtn) nextBtn.disabled = current >= count - 1;
}
