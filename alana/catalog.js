// Alana: 8 shapes, 40 complete rings (carats [3, 4, 5, 6, 8]) + 3 matching band files chosen by shape group and carat range.
// Bands: Elongated group (oval, elongated cushion, elongated radiant, emerald) 3-5 ct and 6-8 ct; Round/Pear/Asscher 3-5 ct only.
// Marquise and Round/Pear/Asscher at 6/8 ct have NO band (the band option is disabled for them, never an error).
// The orientation field is kept so East-West or band variants can be added later without
// changing the app's state model.
export const SHAPES = ['round', 'oval', 'elongated_cushion', 'elongated_radiant', 'emerald', 'marquise', 'pear', 'asscher'];
export const CARATS = [3, 4, 5, 6, 8];
export const EAST_WEST = new Set();
export const COLORS = ['white', 'yellow', 'rose'];
export const RING_COUNT = 40;
// Shape:carat combinations that were never made.
export const MISSING = new Set([]);
export const available = (shape, carat) => !MISSING.has(`${shape}:${carat}`);
export const label = value => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const MATERIAL_TARGETS = { headGold: 'Metal 01', ringGold: 'Metal 01', bandGold: 'Metal 03' }; // one-piece ring metal; the band (Metal 03) follows it
export const BAND_GROUP = { oval: 'elongated', elongated_cushion: 'elongated', elongated_radiant: 'elongated', emerald: 'elongated', round: 'rpa', pear: 'rpa', asscher: 'rpa' };
export const BAND_FILES = { 'elongated:3-5': 'alana band elongated 3-5ct', 'elongated:6-8': 'alana band elongated 6-8ct', 'rpa:3-5': 'alana band round pear asscher 3-5ct' };
export const bandKey = (shape, carat) => { const g = BAND_GROUP[shape]; if (!g) return null; const k = `${g}:${carat <= 5 ? '3-5' : '6-8'}`; return BAND_FILES[k] ? k : null; };
export const bandAvailable = (shape, carat) => bandKey(shape, carat) !== null;

// iJewel file names look like "1Ct Square Cushion" (optionally with .glb/.3dm and an NS/EW suffix).
export function parseRing(variation) {
  const names = [variation.name, variation.title, variation.fileName, variation.filename]
    .filter(Boolean).map(value => String(value).replace(/\.(3dm|glb)$/i, '').trim().toLowerCase());
  for (const name of names) {
    const match = name.match(/^(\d+(?:\.\d+)?)ct\s+(.+?)(?:\s+(ns|ew))?$/);
    const shape = match?.[2].replaceAll(' ', '_');
    if (match && SHAPES.includes(shape) && CARATS.includes(Number(match[1]))) return {
      shape, carat: Number(match[1]), orientation: match[3] || 'ns', variation
    };
  }
  return null;
}

export function parseBand(variation) {
  const names = [variation.name, variation.title, variation.fileName, variation.filename]
    .filter(Boolean).map(value => String(value).replace(/\.(3dm|glb)$/i, '').trim().toLowerCase());
  for (const name of names) for (const [key, file] of Object.entries(BAND_FILES)) if (name === file) return { key, variation };
  return null;
}

export function createCatalog(rings, bands) {
  const ringMap = new Map(), bandMap = new Map();
  for (const variation of rings) {
    const item = parseRing(variation);
    if (!item) throw new Error(`Unknown Alana ring: ${variation.name}`);
    const key = `${item.shape}:${item.carat}:${item.orientation}`;
    if (ringMap.has(key)) throw new Error(`Duplicate ring: ${key}`);
    ringMap.set(key, item);
  }
  for (const variation of bands) {
    const item = parseBand(variation);
    if (!item) throw new Error(`Unknown Alana band: ${variation.name}`);
    if (bandMap.has(item.key)) throw new Error(`Duplicate band: ${item.key}`);
    bandMap.set(item.key, item);
  }
  for (const key of Object.keys(BAND_FILES)) if (!bandMap.has(key)) throw new Error(`Missing band: ${key}`);
  for (const shape of SHAPES) for (const carat of CARATS) {
    if (!available(shape, carat)) continue;
    for (const orientation of EAST_WEST.has(shape) ? ['ns', 'ew'] : ['ns']) {
      if (!ringMap.has(`${shape}:${carat}:${orientation}`)) throw new Error(`Missing ring: ${shape} ${carat} ${orientation}`);
    }
  }
  if (ringMap.size !== RING_COUNT) throw new Error(`Expected ${RING_COUNT} rings; found ${ringMap.size}`);
  return { rings: ringMap, bands: bandMap };
}

export function resolveSelection(catalog, selection) {
  const { shape, carat, orientation, band, headGold, ringGold, bandGold } = selection;
  if (!SHAPES.includes(shape) || !CARATS.includes(carat) ||
      !['ns', 'ew'].includes(orientation) || (orientation === 'ew' && !EAST_WEST.has(shape)) ||
      !['none', 'band'].includes(band) || ![headGold, ringGold, bandGold].every(color => COLORS.includes(color))) {
    throw new Error('Invalid Alana selection');
  }
  const ring = catalog.rings.get(`${shape}:${carat}:${orientation}`);
  if (!ring) throw new Error('Unavailable ring');
  // A band the shape/carat has no file for is simply not shown (never an error).
  const key = band === 'band' ? bandKey(shape, carat) : null;
  return { ring, band: key ? catalog.bands.get(key) : null };
}
