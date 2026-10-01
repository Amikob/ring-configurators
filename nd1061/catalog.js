export const SHAPES = ['round', 'oval', 'pear', 'asscher', 'emerald', 'marquise', 'old_cut_cushion', 'elongated_cushion'];
export const EAST_WEST = new Set(['oval', 'pear', 'emerald', 'marquise', 'old_cut_cushion', 'elongated_cushion']);
export const COLORS = ['white', 'yellow', 'rose'];
export const label = value => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const MATERIAL_TARGETS = { headGold: 'Metal 01', ringGold: 'Metal 02' };

export function parseRing(variation) {
  const names = [variation.name, variation.title, variation.fileName, variation.filename]
    .filter(Boolean).map(value => String(value).replace(/\.(3dm|glb)$/i, '').trim().toLowerCase());
  for (const name of names) {
    const match = name.match(/^([1-5])ct\s+(.+)\s+(ns|ew)$/);
    const shape = match?.[2].replaceAll(' ', '_');
    if (match && SHAPES.includes(shape)) return {
      shape, carat: Number(match[1]), orientation: match[3], variation
    };
  }
  return null;
}

export function createCatalog(rings) {
  const ringMap = new Map();
  for (const variation of rings) {
    const item = parseRing(variation);
    if (!item) throw new Error(`Unknown ND1061 ring: ${variation.name}`);
    const key = `${item.shape}:${item.carat}:${item.orientation}`;
    if (ringMap.has(key)) throw new Error(`Duplicate ring: ${key}`);
    ringMap.set(key, item);
  }
  for (const shape of SHAPES) for (let carat = 1; carat <= 5; carat++) {
    for (const orientation of EAST_WEST.has(shape) ? ['ns', 'ew'] : ['ns']) {
      if (!ringMap.has(`${shape}:${carat}:${orientation}`)) throw new Error(`Missing ring: ${shape} ${carat} ${orientation}`);
    }
  }
  if (ringMap.size !== 70) throw new Error(`Expected 70 rings; found ${ringMap.size}`);
  return ringMap;
}

export function resolveSelection(catalog, selection) {
  const { shape, carat, orientation, headGold, ringGold } = selection;
  if (!SHAPES.includes(shape) || !Number.isInteger(carat) || carat < 1 || carat > 5 ||
      !['ns', 'ew'].includes(orientation) || (orientation === 'ew' && !EAST_WEST.has(shape)) ||
      ![headGold, ringGold].every(color => COLORS.includes(color))) {
    throw new Error('Invalid ND1061 selection');
  }
  const ring = catalog.get(`${shape}:${carat}:${orientation}`);
  if (!ring) throw new Error('Unavailable ring');
  return { ring };
}
