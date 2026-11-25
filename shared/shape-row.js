// If the selected diamond shape sits off-screen in the single-line scroller, bring it into view without jumping the page.
(() => {
  const ROWS = '.shape-grid, #shapes.shapes';
  const SELECTED = '[aria-pressed="true"], button.on';

  const reveal = (row) => {
    const selected = row.querySelector(SELECTED);
    if (!selected) return;
    selected.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'auto' });
  };

  const watch = (row) => {
    reveal(row);
    new MutationObserver(() => reveal(row)).observe(row, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-pressed', 'class'],
    });
  };

  const start = () => {
    document.querySelectorAll(ROWS).forEach(watch);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
