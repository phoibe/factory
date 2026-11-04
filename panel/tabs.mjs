// Keyboard model of the tabs (WAI-ARIA): arrows move between tabs and wrap, Home/End jump to the ends.
export function nextTabIndex(key, index, count) {
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

// Roving tabindex: only the selected tab is in the Tab order, so Tab goes straight into its panel.
export function setupTabs(list) {
  const tabs = [...list.querySelectorAll('[role=tab]')];
  const sync = () => tabs.forEach((t) => { t.tabIndex = t.getAttribute('aria-selected') === 'true' ? 0 : -1; });
  new MutationObserver(sync).observe(list, { attributes: true, attributeFilter: ['aria-selected'], subtree: true });
  sync();
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    const to = i < 0 ? null : nextTabIndex(e.key, i, tabs.length);
    if (to === null) return;
    e.preventDefault();
    tabs[to].focus();
    tabs[to].click();
  });
}
