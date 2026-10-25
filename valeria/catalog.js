// Valeria: 8 shapes x 3/4/5/6/7 ct = 40 rings, plus one Pavé matching band that fits every ring.
export const SHAPES = ['round', 'oval', 'elongated_cushion', 'elongated_radiant', 'emerald', 'square_cushion', 'square_radiant', 'asscher'];
export const CARATS = [3, 4, 5, 6, 7];
export const COLORS = ['white', 'yellow', 'rose'];
export const GROUPS = Object.fromEntries(SHAPES.map(shape => [shape, 'all']));
export const label = value => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const MATERIAL_TARGETS = { headGold: 'Metal 01', ringGold: 'Metal 02', bandGold: 'Metal 03' };

function names(variation) {
  return [variation.name, variation.title, variation.fileName, variation.filename]
    .filter(Boolean).map(value => String(value).replace(/\.(3dm|glb)$/i, '').trim().toLowerCase());
}
export function parseRing(variation) {
  for (const name of names(variation)) {
    const match = name.match(/^(\d+)ct\s+(.+)$/);
    const shape = match?.[2].replaceAll(' ', '_');
    if (match && SHAPES.includes(shape) && CARATS.includes(Number(match[1]))) return { shape, carat: Number(match[1]), variation };
  }
  return null;
}
// One band file ("Valeria Pave Band") is shared by every carat.
export function parseBand(variation) {
  for (const name of names(variation)) {
    if (name === 'valeria pave band') return { group: 'all', style: 'pave', variation };
  }
  return null;
}
export function createCatalog(rings, bands) {
  const ringMap = new Map(), bandMap = new Map();
  for (const variation of rings) {
    const item = parseRing(variation);
    if (!item) throw new Error(`Unknown Valeria ring: ${variation.name}`);
    const key = `${item.shape}:${item.carat}`;
    if (ringMap.has(key)) throw new Error(`Duplicate ring: ${key}`);
    ringMap.set(key, item);
  }
  for (const variation of bands) {
    const item = parseBand(variation);
    if (!item) throw new Error(`Unknown Valeria band: ${variation.name}`);
    if (bandMap.has(item.style)) throw new Error(`Duplicate band: ${item.style}`);
    bandMap.set(item.style, item);
  }
  for (const shape of SHAPES) for (const carat of CARATS) {
    if (!ringMap.has(`${shape}:${carat}`)) throw new Error(`Missing ring: ${shape} ${carat}`);
  }
  if (!bandMap.has('pave')) throw new Error('Missing pave band');
  return { rings: ringMap, bands: bandMap };
}
export function resolveSelection(catalog, selection) {
  const { shape, carat, band, headGold, ringGold, bandGold } = selection;
  if (!SHAPES.includes(shape) || !CARATS.includes(carat) ||
      !['none', 'pave'].includes(band) || ![headGold, ringGold, bandGold].every(c => COLORS.includes(c))) {
    throw new Error('Invalid Valeria selection');
  }
  const result = { ring: catalog.rings.get(`${shape}:${carat}`), band: band === 'none' ? null : catalog.bands.get(band) };
  if (!result.ring || (band !== 'none' && !result.band)) throw new Error('Unavailable matching set');
  return result;
}
