// Adds a small "switch ring" menu to the top bar of every configurator.
// The list comes from /configurators.json, so a new ring appears everywhere once it is registered there.
(async () => {
  const brand = document.querySelector('.stage-brand');
  if (!brand) return;
  const segments = location.pathname.split('/').filter(Boolean);
  const current = segments.at(-1)?.includes('.') ? segments.at(-2) : segments.at(-1);
  let list = [];
  try {
    const response = await fetch('../configurators.json', { cache: 'no-cache' });
    if (response.ok) list = (await response.json()).configurators || [];
  } catch { /* The configurator still works without the menu. */ }
  if (!list.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'ring-switch';
  const back = document.createElement('a');
  back.href = '../';
  back.className = 'ring-switch-home';
  back.textContent = 'All rings';
  back.setAttribute('aria-label', 'Back to all rings');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Switch ring');
  for (const item of list) {
    const option = document.createElement('option');
    option.value = item.path;
    option.textContent = item.sku ? `${item.name} (${item.sku})` : item.name;
    option.selected = item.id === current;
    select.append(option);
  }
  select.addEventListener('change', () => { location.href = `../${select.value}`; });
  wrap.append(back, select);

  const label = brand.querySelector('span');
  if (label) label.replaceWith(wrap); else brand.append(wrap);
})();
