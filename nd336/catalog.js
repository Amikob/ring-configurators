// ND336: 8 shapes x 1-5 ct = 40 complete rings. No east-west versions and no bands yet.
// The orientation field is kept so East-West or band variants can be added later without
// changing the app's state model.
export const SHAPES = ['round', 'oval', 'elongated_cushion', 'elongated_radiant', 'emerald', 'pear', 'marquise', 'square_cushion'];
export const EAST_WEST = new Set();
export const COLORS = ['white', 'yellow', 'rose'];
export const RING_COUNT = 40;
export const label = value => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const MATERIAL_TARGETS = { headGold: 'Metal 01', ringGold: 'Metal 02' };

// iJewel file names look like "1Ct Square Cushion" (optionally with .glb/.3dm and an NS/EW suffix).
export function parseRing(variation) {
  const names = [variation.name, variation.title, variation.fileName, variation.filename]
    .filter(Boolean).map(value => String(value).replace(/\.(3dm|glb)$/i, '').trim().toLowerCase());
  for (const name of names) {
    const match = name.match(/^([1-5])ct\s+(.+?)(?:\s+(ns|ew))?$/);
    const shape = match?.[2].replaceAll(' ', '_');
    if (match && SHAPES.includes(shape)) return {
      shape, carat: Number(match[1]), orientation: match[3] || 'ns', variation
    };
  }
  return null;
}

export function createCatalog(rings) {
  const ringMap = new Map();
  for (const variation of rings) {
    const item = parseRing(variation);
    if (!item) throw new Error(`Unknown ND336 ring: ${variation.name}`);
    const key = `${item.shape}:${item.carat}:${item.orientation}`;
    if (ringMap.has(key)) throw new Error(`Duplicate ring: ${key}`);
    ringMap.set(key, item);
  }
  for (const shape of SHAPES) for (let carat = 1; carat <= 5; carat++) {
    for (const orientation of EAST_WEST.has(shape) ? ['ns', 'ew'] : ['ns']) {
      if (!ringMap.has(`${shape}:${carat}:${orientation}`)) throw new Error(`Missing ring: ${shape} ${carat} ${orientation}`);
    }
  }
  if (ringMap.size !== RING_COUNT) throw new Error(`Expected ${RING_COUNT} rings; found ${ringMap.size}`);
  return ringMap;
}

export function resolveSelection(catalog, selection) {
  const { shape, carat, orientation, headGold, ringGold } = selection;
  if (!SHAPES.includes(shape) || !Number.isInteger(carat) || carat < 1 || carat > 5 ||
      !['ns', 'ew'].includes(orientation) || (orientation === 'ew' && !EAST_WEST.has(shape)) ||
      ![headGold, ringGold].every(color => COLORS.includes(color))) {
    throw new Error('Invalid ND336 selection');
  }
  const ring = catalog.get(`${shape}:${carat}:${orientation}`);
  if (!ring) throw new Error('Unavailable ring');
  return { ring };
}
