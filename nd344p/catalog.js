export const SHAPES = ['round', 'oval', 'elongated_cushion', 'emerald', 'elongated_radiant', 'pear', 'marquise', 'square_cushion'];
export const COLORS = ['white', 'yellow', 'rose'];
export const GROUPS = Object.fromEntries(SHAPES.map(shape => [shape, 'all']));
export const label = value => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const MATERIAL_TARGETS = { headGold: 'Metal 03', ringGold: 'Metal 01', bandGold: 'Metal 02' };

function names(variation) {
  return [variation.name, variation.title, variation.fileName, variation.filename]
    .filter(Boolean).map(value => String(value).replace(/\.(3dm|glb)$/i, '').trim().toLowerCase());
}
export function parseRing(variation) {
  for (const name of names(variation)) {
    const match = name.match(/^([1-5])ct\s+(.+)$/);
    const shape = match?.[2].replaceAll(' ', '_');
    if (match && SHAPES.includes(shape)) return { shape, carat: Number(match[1]), variation };
  }
  return null;
}
export function parseBand(variation) {
  for (const name of names(variation)) {
    const match = name.match(/^(1ct-3ct|4ct-5ct)\s+(plain|pave)$/);
    if (match) return { group: 'all', carat: Number(match[1][0]), style: match[2], variation };
  }
  return null;
}
export function createCatalog(rings, bands) {
  const ringMap = new Map(), bandMap = new Map();
  for (const variation of rings) {
    const item = parseRing(variation);
    if (!item) throw new Error(`Unknown ND344P ring: ${variation.name}`);
    const key = `${item.shape}:${item.carat}`;
    if (ringMap.has(key)) throw new Error(`Duplicate ring: ${key}`);
    ringMap.set(key, item);
  }
  for (const variation of bands) {
    const item = parseBand(variation);
    if (!item) throw new Error(`Unknown ND344P band: ${variation.name}`);
    const key = `all:${item.carat}:${item.style}`;
    if (bandMap.has(key)) throw new Error(`Duplicate band: ${key}`);
    bandMap.set(key, item);
  }
  for (const shape of SHAPES) for (let carat = 1; carat <= 5; carat++) {
    if (!ringMap.has(`${shape}:${carat}`)) throw new Error(`Missing ring: ${shape} ${carat}`);
    for (const style of ['plain', 'pave']) {
      if (!bandMap.has(`all:${carat <= 3 ? 1 : 4}:${style}`)) throw new Error(`Missing ${style} band for ${carat}ct`);
    }
  }
  return { rings: ringMap, bands: bandMap };
}
export function resolveSelection(catalog, selection) {
  const { shape, carat, band, headGold, ringGold, bandGold } = selection;
  if (!SHAPES.includes(shape) || !Number.isInteger(carat) || carat < 1 || carat > 5 ||
      !['none', 'plain', 'pave'].includes(band) || ![headGold, ringGold, bandGold].every(c => COLORS.includes(c))) {
    throw new Error('Invalid ND344P selection');
  }
  const result = { ring: catalog.rings.get(`${shape}:${carat}`),
    band: band === 'none' ? null : catalog.bands.get(`all:${carat <= 3 ? 1 : 4}:${band}`) };
  if (!result.ring || (band !== 'none' && !result.band)) throw new Error('Unavailable matching set');
  return result;
}
