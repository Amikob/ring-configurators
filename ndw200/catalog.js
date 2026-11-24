// NDW200 full-eternity wedding bands: 10 models × 3 sizes (Small / Medium / Large).
// One metal zone (Metal 01). Gold is switched on this page, not as an iJewel list.
export const MODELS = [
  { id: 'NDW201', shape: 'round', label: 'NDW201', shapeLabel: 'Round' },
  { id: 'NDW202', shape: 'princess', label: 'NDW202', shapeLabel: 'Princess' },
  { id: 'NDW203', shape: 'oval', label: 'NDW203', shapeLabel: 'Oval' },
  { id: 'NDW204', shape: 'cushion', label: 'NDW204', shapeLabel: 'Cushion' },
  { id: 'NDW205', shape: 'asscher', label: 'NDW205', shapeLabel: 'Asscher' },
  { id: 'NDW206', shape: 'radiant', label: 'NDW206', shapeLabel: 'Radiant' },
  { id: 'NDW207', shape: 'emerald', label: 'NDW207', shapeLabel: 'Emerald' },
  { id: 'NDW208', shape: 'elongated_radiant', label: 'NDW208', shapeLabel: 'Elongated Radiant' },
  { id: 'NDW209', shape: 'marquise', label: 'NDW209', shapeLabel: 'Marquise' },
  { id: 'NDW210', shape: 'pear', label: 'NDW210', shapeLabel: 'Pear' },
];
export const MODEL_IDS = MODELS.map(m => m.id);
export const SIZES = ['Small', 'Medium', 'Large'];
export const COLORS = ['white', 'yellow', 'rose'];
export const BAND_COUNT = 30;
export const label = value => String(value).replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
export const modelMeta = id => MODELS.find(m => m.id === id);
export const modelTitle = id => {
  const m = modelMeta(id);
  return m ? `${m.label} ${m.shapeLabel}` : id;
};
export const MATERIAL_TARGETS = { ringGold: 'Metal 01' };

// iJewel variation names look like "NDW201_Small" or "NDW210_Large" (optionally with .glb / .3dm).
export function parseBand(variation) {
  const names = [variation.name, variation.title, variation.fileName, variation.filename]
    .filter(Boolean).map(value => String(value).replace(/\.(3dm|glb)$/i, '').trim());
  for (const name of names) {
    // Inner group is non-capturing so match[1] stays the full id (NDW201–NDW210).
    const match = name.match(/^(NDW2(?:0[1-9]|10))[_\s-]+(Small|Medium|Large)$/i);
    if (!match) continue;
    const model = match[1].toUpperCase();
    const size = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
    if (MODEL_IDS.includes(model) && SIZES.includes(size)) return { model, size, variation };
  }
  return null;
}
// Kept so shared portal-settings can still be called with parseRing.
export const parseRing = parseBand;

export function createCatalog(rings) {
  const bandMap = new Map();
  for (const variation of rings) {
    const item = parseBand(variation);
    if (!item) throw new Error(`Unknown NDW200 band: ${variation.name}`);
    const key = `${item.model}:${item.size}`;
    if (bandMap.has(key)) throw new Error(`Duplicate band: ${key}`);
    bandMap.set(key, item);
  }
  for (const model of MODEL_IDS) for (const size of SIZES) {
    if (!bandMap.has(`${model}:${size}`)) throw new Error(`Missing band: ${model} ${size}`);
  }
  if (bandMap.size !== BAND_COUNT) throw new Error(`Expected ${BAND_COUNT} bands; found ${bandMap.size}`);
  return bandMap;
}

export function resolveSelection(catalog, selection) {
  const { model, size, ringGold } = selection;
  if (!MODEL_IDS.includes(model) || !SIZES.includes(size) || !COLORS.includes(ringGold)) {
    throw new Error('Invalid NDW200 selection');
  }
  const band = catalog.get(`${model}:${size}`);
  if (!band) throw new Error('Unavailable band');
  return { ring: band, band };
}
