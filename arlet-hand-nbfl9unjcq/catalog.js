export const SHAPES = ['round', 'oval', 'cushion', 'emerald', 'radiant', 'pear', 'marquise', 'asscher'];
export const COLORS = ['white', 'yellow', 'rose'];
export const GROUPS = { cushion: 'A', emerald: 'A', oval: 'A', radiant: 'A', pear: 'A', marquise: 'B', round: 'C', asscher: 'C' };
export const label = value => value.charAt(0).toUpperCase() + value.slice(1);

function names(variation) {
  return [variation.name, variation.title, variation.fileName, variation.filename, variation.modelUrl]
    .filter(Boolean).map(value => decodeURIComponent(String(value)).toLowerCase().replace(/[_-]/g, ' '));
}
export function parseRing(variation) {
  for (const name of names(variation)) {
    const carat = name.match(/(?:^|[^\d])([1-5])\s*ct\b/);
    const shape = SHAPES.find(s => new RegExp(`\\b${s}\\b`).test(name));
    if (carat && shape) return { shape, carat: Number(carat[1]), variation };
  }
  return null;
}
export function parseBand(variation) {
  for (const name of names(variation)) {
    const match = name.match(/\bband\s+([abc])\s+([1-5])\s*ct\s+(plain|pave)\b/);
    if (match) return { group: match[1].toUpperCase(), carat: Number(match[2]), style: match[3], variation };
  }
  return null;
}
export function createCatalog(rings, bands) {
  const ringMap = new Map(), bandMap = new Map();
  function add(map, key, value) {
    if (map.has(key)) throw new Error(`Duplicate option: ${key}`);
    map.set(key, value);
  }
  for (const v of rings) { const item = parseRing(v); if (!item) throw new Error(`Unrecognized ring: ${v.name || v.title}`); add(ringMap, `${item.shape}:${item.carat}`, item); }
  for (const v of bands) { const item = parseBand(v); if (!item) throw new Error(`Unrecognized band: ${v.name || v.title}`); add(bandMap, `${item.group}:${item.carat}:${item.style}`, item); }
  for (const shape of SHAPES) for (let carat = 1; carat <= 5; carat++) {
    if (!ringMap.has(`${shape}:${carat}`)) throw new Error(`Missing ${shape} ${carat} ct ring`);
    for (const style of ['plain','pave']) if (!bandMap.has(`${GROUPS[shape]}:${carat}:${style}`)) throw new Error(`Missing ${shape} ${carat} ct ${style} band`);
  }
  return { rings: ringMap, bands: bandMap };
}
export function resolveSelection(catalog, selection) {
  if (!SHAPES.includes(selection.shape) || !Number.isInteger(selection.carat) || selection.carat < 1 || selection.carat > 5 || !['none','plain','pave'].includes(selection.band) || !COLORS.includes(selection.ringGold) || !COLORS.includes(selection.bandGold)) throw new Error('Invalid ring selection.');
  const ring = catalog.rings.get(`${selection.shape}:${selection.carat}`);
  const band = selection.band === 'none' ? null : catalog.bands.get(`${GROUPS[selection.shape]}:${selection.carat}:${selection.band}`);
  if (!ring || (selection.band !== 'none' && !band)) throw new Error('This matching set is unavailable.');
  return { ring, band };
}
