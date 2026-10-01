export const SHAPES = ['elocshn','elordnt','emrld','oldctcshn','oval','mrqs','sqrcshn','sqrrdnt'];
export const COLORS = ['white','yellow','rose'];
export const GROUPS = {elocshn:'A',elordnt:'A',emrld:'A',oldctcshn:'A',oval:'A',mrqs:'B',sqrcshn:'C',sqrrdnt:'C'};
const LABELS = {elocshn:'Elongated cushion',elordnt:'Elongated radiant',emrld:'Emerald',oldctcshn:'Old-cut cushion',oval:'Oval',mrqs:'Marquise',sqrcshn:'Square cushion',sqrrdnt:'Square radiant'};
export const label = value => LABELS[value] || value.charAt(0).toUpperCase()+value.slice(1);
function names(v) { return [v.name,v.title,v.fileName,v.filename,v.modelUrl].filter(Boolean).map(s=>decodeURIComponent(String(s)).toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ')); }
export function parseRing(v) {
  for(const name of names(v)) {
    const ct=name.match(/\b([3-7])\s*ct\b/);
    const shape=SHAPES.find(s=>new RegExp(`\\b${s}\\b`).test(name));
    if(ct&&shape)return {shape,carat:Number(ct[1]),variation:v};
  }
  return null;
}
export function parseBand(v) {
  for(const name of names(v)) {
    const m=name.match(/\bband ([abc]) ([3-7])ct(?: ([3-7])ct)? (plain|half eternity)\b/);
    if(m)return {group:m[1].toUpperCase(),min:Number(m[2]),max:Number(m[3]||m[2]),style:m[4]==='plain'?'plain':'pave',variation:v};
  }
  return null;
}
export function createCatalog(rings,bands) {
  const ringMap=new Map(),bandMap=new Map();
  function add(map,key,item) {if(map.has(key))throw new Error(`Duplicate option: ${key}`);map.set(key,item);}
  for(const v of rings){const p=parseRing(v);if(!p)throw new Error(`Unrecognized ring: ${v.name}`);add(ringMap,`${p.shape}:${p.carat}`,p);}
  for(const v of bands){const p=parseBand(v);if(!p||p.max<p.min)throw new Error(`Unrecognized band: ${v.name}`);for(let ct=p.min;ct<=p.max;ct++)add(bandMap,`${p.group}:${ct}:${p.style}`,{...p,carat:ct});}
  for(const s of SHAPES)for(let ct=3;ct<=7;ct++){
    if(!ringMap.has(`${s}:${ct}`))throw new Error(`Missing ${s} ${ct} ct`);
    for(const style of ['plain','pave'])if(!bandMap.has(`${GROUPS[s]}:${ct}:${style}`))throw new Error(`Missing ${s} ${ct} ct ${style} band`);
  }
  return {rings:ringMap,bands:bandMap};
}
export function resolveSelection(catalog,s) {
  if(!SHAPES.includes(s.shape)||!Number.isInteger(s.carat)||s.carat<3||s.carat>7||!['none','plain','pave'].includes(s.band)||!COLORS.includes(s.ringGold)||!COLORS.includes(s.bandGold))throw new Error('Invalid ring selection.');
  const ring=catalog.rings.get(`${s.shape}:${s.carat}`),band=s.band==='none'?null:catalog.bands.get(`${GROUPS[s.shape]}:${s.carat}:${s.band}`);
  if(!ring||(s.band!=='none'&&!band))throw new Error('This matching set is unavailable.');
  return {ring,band};
}
