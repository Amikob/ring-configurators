// Studio panel for the self-hosted ring builder, laid out like the iJewel Playground "Configuration" panel:
// collapsible sections (Environment, Tone mapping, Bloom, Ground, Metal, Diamond, Render, Presets), label left /
// control right, slider + number. Every setting lives in one JSON object: presets save / load it (browser
// storage, JSON file) and "Copy settings link" puts the changes from the page defaults into the URL (#look=...).
// Shared engine file: identical copy in noya-selfhost/ and erica-selfhost/ (source: tools/selfhost/engine/).
import { GRADE_DEFAULTS, DIAMOND_DEFAULTS, GOLDS } from './viewer.js?v=sh11';

const DEG = Math.PI / 180;
const clone = o => JSON.parse(JSON.stringify(o));
const toHex = lin => '#' + lin.slice(0, 3).map(v => { const c = Math.max(0, Math.min(1, v)); const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(s * 255).toString(16).padStart(2, '0'); }).join('');
const toLin = hex => [1, 3, 5].map(i => { const s = parseInt(hex.slice(i, i + 2), 16) / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }).map(v => +v.toFixed(4));

// Engine defaults (iJewel scene ss-001 / diamond-white-1 where it has a matching setting). Pages override parts.
export const STUDIO_DEFAULTS = {
  // metalIntensity < 1: iJewel's screen-space reflections let much of the ring reflect itself (darker); an env-only
  // lookup cannot, so the metal HDRI is dimmed instead of the global exposure (exposure 0.7 also greyed the diamonds).
  env: { metal: null, diamond: null, metalIntensity: 0.75, diamondIntensity: 1, metalRotation: 0, diamondRotation: 0, lock: false, background: '#ffffff' },
  tone: { toneMapping: 'aces', exposure: 1, ...GRADE_DEFAULTS },
  bloom: { intensity: 0.08, threshold: 5 },   // iJewel 0.2 / 2 haloed every metal edge on our HDR buffer (see README)
  ground: { floor: 1, shadow: 1, softness: 10 },
  metal: { roughness: 0, white: toHex(GOLDS.white), yellow: toHex(GOLDS.yellow), rose: toHex(GOLDS.rose) },
  diamond: { ...DIAMOND_DEFAULTS, bounces: 5 },
  render: { frames: 48 },
};
const merge = (a, b) => { const o = clone(a); for (const [k, v] of Object.entries(b || {})) o[k] = (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object') ? merge(o[k], v) : v; return o; };
const diff = (a, d) => { const o = {}; for (const [k, v] of Object.entries(a)) { if (v && typeof v === 'object') { const x = diff(v, d?.[k] || {}); if (Object.keys(x).length) o[k] = x; } else if (v !== d?.[k]) o[k] = v; } return o; };
const b64 = { enc: s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))) };

// Old query parameters (pilot links) still work.
function fromQuery(params) {
  const q = {}, n = k => Number(params.get(k)), set = (sec, key, v) => { (q[sec] ||= {})[key] = v; };
  if (params.has('tm')) set('tone', 'toneMapping', params.get('tm'));
  if (params.has('exposure')) set('tone', 'exposure', n('exposure'));
  const grade = { gamma: 'gamma', contrast: 'contrast', saturation: 'sat', vibrance: 'vib', burn: 'burn', temperature: 'temp', tint: 'tint', highlights: 'hl', shadows: 'sh' };
  for (const [k, p] of Object.entries(grade)) if (params.has(p)) set('tone', k, n(p));
  if (params.has('bloom')) set('bloom', 'intensity', n('bloom'));
  if (params.has('bloomth')) set('bloom', 'threshold', n('bloomth'));
  if (params.has('floor')) set('ground', 'floor', n('floor'));
  if (params.has('metalenv')) set('env', 'metal', params.get('metalenv'));
  if (params.has('diamondenv')) set('env', 'diamond', params.get('diamondenv'));
  if (params.has('metalrot')) set('env', 'metalRotation', n('metalrot'));
  if (params.has('diamondrot')) set('env', 'diamondRotation', n('diamondrot'));
  for (const [k, p] of [['ior', 'ior'], ['dispersion', 'disp'], ['bounces', 'bounces'], ['envIntensity', 'gemint'], ['exitMix', 'exitmix'], ['metalMix', 'metalstone']]) if (params.has(p)) set('diamond', k, n(p));
  if (params.has('frames')) set('render', 'frames', n('frames'));
  return q;
}

export async function createStudio({ viewer, root, page, defaults = {}, params = new URLSearchParams(location.search), onEnvStatus = () => {} }) {
  const envs = await (await fetch('./env/envs.json?v=' + Date.now().toString(36).slice(0, -3))).json();
  const base = merge(STUDIO_DEFAULTS, { env: { metal: envs.defaults.metal, diamond: envs.defaults.diamond },
    metal: Object.fromEntries(['white', 'yellow', 'rose'].map(g => [g, toHex(viewer.golds[g])])) });
  const DEF = merge(base, defaults);
  let fromHash = {};
  const m = location.hash.match(/look=([\w-]+)/);
  if (m) try { fromHash = JSON.parse(b64.dec(m[1])); } catch { /* ignore a broken link */ }
  const S = merge(merge(DEF, fromQuery(params)), fromHash);
  const storeKey = `ring-studio-presets:${page}`;
  const envSeq = { metal: 0, diamond: 0 };

  // ---- apply to the viewer -----------------------------------------------------------------------------
  const apply = {
    async env(kind) {
      const list = envs[kind], id = S.env[kind];
      const entry = list.find(e => e.id === id) || list.find(e => e.id === envs.defaults[kind]) || list[0];
      S.env[kind] = entry.id;
      const seq = ++envSeq[kind];
      onEnvStatus(`Loading ${entry.id}...`);
      const opts = kind === 'metal'
        ? { saturation: entry.saturation ?? 1, exposure: entry.exposure ?? 1, lift: entry.lift ?? 0, target: 'metal' }
        : { saturation: entry.saturation ?? 0, exposure: entry.exposure ?? 1.6, target: 'gem' };
      try {
        await viewer.loadEnvironment(`./env/${entry.file}`, { ...opts, isCurrent: () => seq === envSeq[kind] });
        if (seq === envSeq[kind]) onEnvStatus(entry.name || entry.id);
      } catch (e) { console.error(e); onEnvStatus(`Could not load ${entry.id}`); }
      ui.refreshThumbs?.();
    },
    rotation() { viewer.setMetalRotation(S.env.metalRotation * DEG); viewer.setDiamondRotation(S.env.diamondRotation * DEG); },
    intensity() { viewer.setMetal({ envIntensity: S.env.metalIntensity }); viewer.setGem({ envIntensity: S.diamond.envIntensity * S.env.diamondIntensity }); },
    background() { viewer.setBackground(S.env.background); },
    look() { viewer.setLook({ ...S.tone, bloom: S.bloom.intensity, bloomThreshold: S.bloom.threshold, floor: S.ground.floor }); },
    shadow() { viewer.setShadow({ strength: S.ground.shadow, softness: S.ground.softness }); },
    metal() { viewer.setMetal({ roughness: S.metal.roughness }); for (const g of ['white', 'yellow', 'rose']) viewer.setGoldColor(g, toLin(S.metal[g])); },
    diamond() { const d = { ...S.diamond, envIntensity: S.diamond.envIntensity * S.env.diamondIntensity }; viewer.setGem(d); },
    render() { viewer.setFrames(S.render.frames); },
    async all() {
      this.look(); this.background(); this.metal(); this.diamond(); this.intensity(); this.rotation(); this.render(); this.shadow();
      await Promise.all([this.env('diamond'), this.env('metal')]);
    },
  };
  const ui = {};

  // ---- DOM helpers ---------------------------------------------------------------------------------------
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of kids) e.append(c); return e; };
  const sync = [];   // functions that refresh controls from S
  root.innerHTML = '';
  root.classList.add('studio');
  const head = el('div', { class: 'st-head' }, el('span', {}, 'Configuration'));
  root.append(head);
  const section = (title, open = false) => { const d = el('details', { class: 'st-sec' }); if (open) d.open = true; d.append(el('summary', {}, title)); root.append(d); return d; };
  const row = (parent, label, ...ctl) => { const r = el('div', { class: 'st-row' }, el('label', {}, label), el('div', { class: 'st-ctl' }, ...ctl)); parent.append(r); return r; };
  const slider = (parent, label, sec, key, min, max, step, onChange) => {
    const r = el('input', { type: 'range', min, max, step }), n = el('input', { type: 'number', min, max, step, class: 'st-num' });
    const set = v => { S[sec][key] = v; r.value = v; n.value = +(+v).toFixed(4); onChange(); };
    r.addEventListener('input', () => set(Number(r.value)));
    n.addEventListener('change', () => set(Number(n.value)));
    sync.push(() => { r.value = S[sec][key]; n.value = +(+S[sec][key]).toFixed(4); });
    row(parent, label, r, n);
  };
  const select = (parent, label, sec, key, options, onChange) => {
    const s = el('select'); for (const [v, t] of options) s.append(new Option(t, v));
    s.addEventListener('change', () => { S[sec][key] = s.value; onChange(); });
    sync.push(() => { s.value = S[sec][key]; }); row(parent, label, s);
  };
  const color = (parent, label, sec, key, onChange) => {
    const c = el('input', { type: 'color' }), t = el('span', { class: 'st-hex' });
    c.addEventListener('input', () => { S[sec][key] = c.value; t.textContent = c.value; onChange(); });
    sync.push(() => { c.value = S[sec][key]; t.textContent = S[sec][key]; }); row(parent, label, c, t);
  };
  const check = (parent, label, sec, key, onChange) => {
    const c = el('input', { type: 'checkbox' });
    c.addEventListener('change', () => { S[sec][key] = c.checked; onChange(); });
    sync.push(() => { c.checked = !!S[sec][key]; }); row(parent, label, c);
  };
  const thumbs = (parent, kind) => {
    const g = el('div', { class: 'st-thumbs', role: 'listbox', 'aria-label': `${kind} HDRI` });
    for (const e of envs[kind]) {
      const b = el('button', { type: 'button', class: 'st-thumb', title: `${e.id} - ${e.name || ''}`, 'data-id': e.id, onclick: () => { S.env[kind] = e.id; apply.env(kind); } },
        el('img', { src: `./env/thumbs/${e.id}.jpg`, alt: '', loading: 'lazy' }), el('span', {}, e.id));
      g.append(b);
    }
    parent.append(g);
    return () => g.querySelectorAll('.st-thumb').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === S.env[kind])));
  };

  // ---- sections ------------------------------------------------------------------------------------------
  const sEnv = section('Environment', true);
  sEnv.append(el('div', { class: 'st-sub' }, 'Metal HDRI'));
  const tMetal = thumbs(sEnv, 'metal');
  slider(sEnv, 'Intensity', 'env', 'metalIntensity', 0, 3, 0.01, () => apply.intensity());
  const rotChange = kind => () => {
    if (S.env.lock) { const other = kind === 'metal' ? 'diamondRotation' : 'metalRotation', mine = kind === 'metal' ? 'metalRotation' : 'diamondRotation';
      const d = S.env[mine] - (ui.lastRot?.[mine] ?? S.env[mine]); S.env[other] = ((S.env[other] + d) % 360 + 360) % 360; }
    ui.lastRot = { metalRotation: S.env.metalRotation, diamondRotation: S.env.diamondRotation };
    apply.rotation(); sync.forEach(f => f());
  };
  slider(sEnv, 'Rotation', 'env', 'metalRotation', 0, 359, 1, rotChange('metal'));
  sEnv.append(el('div', { class: 'st-sub' }, 'Diamond HDRI'));
  const tDiamond = thumbs(sEnv, 'diamond');
  slider(sEnv, 'Intensity', 'env', 'diamondIntensity', 0, 3, 0.01, () => apply.intensity());
  slider(sEnv, 'Rotation', 'env', 'diamondRotation', 0, 359, 1, rotChange('diamond'));
  check(sEnv, 'Lock rotations', 'env', 'lock', () => { ui.lastRot = null; });
  color(sEnv, 'Background', 'env', 'background', () => apply.background());
  const status = el('div', { class: 'st-status', 'aria-live': 'polite' }); sEnv.append(status);
  ui.refreshThumbs = () => { tMetal(); tDiamond(); };
  onEnvStatus = (o => t => { status.textContent = t; o(t); })(onEnvStatus);

  const sTone = section('Tone mapping');
  select(sTone, 'Operator', 'tone', 'toneMapping', [['aces', 'ACES Filmic (iJewel)'], ['neutral', 'Neutral (Khronos PBR)'], ['agx', 'AgX'], ['reinhard', 'Reinhard'], ['linear', 'Linear (clip)'], ['linburn', 'Linear + Burn']], () => apply.look());
  slider(sTone, 'Exposure', 'tone', 'exposure', 0.1, 3, 0.01, () => apply.look());
  slider(sTone, 'Contrast', 'tone', 'contrast', 0.5, 1.6, 0.01, () => apply.look());
  slider(sTone, 'Saturation', 'tone', 'saturation', 0, 2, 0.01, () => apply.look());
  const adv = el('details', { class: 'st-adv' }, el('summary', {}, 'Advanced grade')); sTone.append(adv);
  for (const [k, l, a, b] of [['gamma', 'Gamma', 0.5, 2], ['vibrance', 'Vibrance', -1, 1], ['burn', 'Burn', 0, 1], ['temperature', 'Temperature', -1, 1], ['tint', 'Tint', -1, 1], ['highlights', 'Highlights', -1, 1], ['shadows', 'Shadows', -1, 1]])
    slider(adv, l, 'tone', k, a, b, 0.01, () => apply.look());

  const sBloom = section('Bloom');
  slider(sBloom, 'Intensity', 'bloom', 'intensity', 0, 1, 0.005, () => apply.look());
  slider(sBloom, 'Threshold', 'bloom', 'threshold', 0.5, 12, 0.1, () => apply.look());

  const sGround = section('Ground');
  slider(sGround, 'Floor shade', 'ground', 'floor', 0, 2, 0.01, () => apply.look());
  slider(sGround, 'Shadow', 'ground', 'shadow', 0, 1.5, 0.01, () => apply.shadow());
  slider(sGround, 'Softness', 'ground', 'softness', 1, 30, 0.5, () => apply.shadow());

  const sMetal = section('Metal');
  color(sMetal, 'Yellow gold', 'metal', 'yellow', () => apply.metal());
  color(sMetal, 'Rose gold', 'metal', 'rose', () => apply.metal());
  color(sMetal, 'White gold', 'metal', 'white', () => apply.metal());
  slider(sMetal, 'Roughness', 'metal', 'roughness', 0, 0.5, 0.005, () => apply.metal());
  sMetal.append(el('button', { type: 'button', class: 'st-btn st-small', onclick: () => { for (const g of ['white', 'yellow', 'rose']) S.metal[g] = DEF.metal[g]; apply.metal(); sync.forEach(f => f()); } }, 'Reset colours'));

  const sGem = section('Diamond');
  const mode = el('select'); for (const [v, t] of [['studio', 'Studio (iJewel-like, crisp)'], ['physical', 'Physical (energy split)'], ['custom', 'Custom mix']]) mode.append(new Option(t, v));
  mode.addEventListener('change', () => { if (mode.value === 'studio') S.diamond.exitMix = 0; if (mode.value === 'physical') S.diamond.exitMix = 1; apply.diamond(); sync.forEach(f => f()); });
  sync.push(() => { mode.value = S.diamond.exitMix === 0 ? 'studio' : S.diamond.exitMix === 1 ? 'physical' : 'custom'; });
  row(sGem, 'Light model', mode);
  slider(sGem, 'Exit mix', 'diamond', 'exitMix', 0, 1, 0.01, () => { apply.diamond(); sync.forEach(f => f()); });
  slider(sGem, 'Env intensity', 'diamond', 'envIntensity', 0.2, 4, 0.01, () => apply.diamond());
  slider(sGem, 'Env contrast', 'diamond', 'envContrast', 0.5, 2.5, 0.01, () => apply.diamond());
  slider(sGem, 'IOR', 'diamond', 'ior', 1.5, 3, 0.01, () => apply.diamond());
  slider(sGem, 'Dispersion', 'diamond', 'dispersion', 0, 0.15, 0.001, () => apply.diamond());
  slider(sGem, 'Bounces', 'diamond', 'bounces', 1, 8, 1, () => apply.diamond());
  slider(sGem, 'Reflectivity', 'diamond', 'reflectivity', 0, 2, 0.01, () => apply.diamond());
  slider(sGem, 'Gamma', 'diamond', 'gamma', 0.5, 2, 0.01, () => apply.diamond());
  slider(sGem, 'Boost', 'diamond', 'boost', 0.2, 3, 0.01, () => apply.diamond());
  slider(sGem, 'Metal in stone', 'diamond', 'metalMix', 0, 1, 0.01, () => apply.diamond());

  const sRender = section('Render');
  slider(sRender, 'AA frames', 'render', 'frames', 8, 128, 1, () => apply.render());

  const sPre = section('Presets', true);
  const name = el('input', { type: 'text', placeholder: 'Preset name', class: 'st-name' });
  const list = el('div', { class: 'st-list' });
  const saved = () => { try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { return {}; } };
  const renderList = () => {
    list.innerHTML = '';
    for (const [k, v] of Object.entries(saved())) list.append(el('div', { class: 'st-item' },
      el('button', { type: 'button', class: 'st-btn', onclick: () => load(v) }, k),
      el('button', { type: 'button', class: 'st-btn st-x', title: `Delete ${k}`, onclick: () => { const all = saved(); delete all[k]; localStorage.setItem(storeKey, JSON.stringify(all)); renderList(); } }, '\u00d7')));
  };
  const flash = t => { status2.textContent = t; clearTimeout(ui.ft); ui.ft = setTimeout(() => { status2.textContent = ''; }, 2500); };
  const status2 = el('div', { class: 'st-status', 'aria-live': 'polite' });
  sPre.append(el('div', { class: 'st-row' }, name, el('button', { type: 'button', class: 'st-btn', onclick: () => {
    const k = name.value.trim() || `Preset ${Object.keys(saved()).length + 1}`; const all = saved(); all[k] = clone(S); localStorage.setItem(storeKey, JSON.stringify(all)); name.value = ''; renderList(); flash(`Saved "${k}"`); } }, 'Save')));
  sPre.append(list);
  const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: '' });
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; try { await load(JSON.parse(await f.text())); flash(`Loaded ${f.name}`); } catch { flash('Not a settings file'); } file.value = ''; });
  sPre.append(el('div', { class: 'st-btns' },
    el('button', { type: 'button', class: 'st-btn', onclick: async () => { await navigator.clipboard?.writeText(link()).then(() => flash('Link copied'), () => { prompt('Settings link', link()); }); } }, 'Copy settings link'),
    el('button', { type: 'button', class: 'st-btn', onclick: () => { const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify({ page, ...S }, null, 2)], { type: 'application/json' })), download: `${page}-look.json` }); a.click(); } }, 'Export JSON'),
    el('button', { type: 'button', class: 'st-btn', onclick: () => file.click() }, 'Import JSON'),
    el('button', { type: 'button', class: 'st-btn', onclick: () => load(DEF) }, 'Reset all'), file));
  sPre.append(status2);

  function link() {
    const u = new URL(location.href);
    for (const k of ['tm', 'exposure', 'bloom', 'bloomth', 'floor', 'metalenv', 'diamondenv', 'metalrot', 'diamondrot', 'gamma', 'contrast', 'sat', 'vib', 'burn', 'temp', 'tint', 'hl', 'sh', 'ior', 'disp', 'gemint', 'exitmix', 'metalstone', 'frames', 'bounces']) u.searchParams.delete(k);
    const d = diff(S, DEF); u.hash = Object.keys(d).length ? `look=${b64.enc(JSON.stringify(d))}` : '';
    return u.toString();
  }
  async function load(s) {
    const { page: _p, ...rest } = s || {};
    const prev = { metal: S.env.metal, diamond: S.env.diamond };
    const next = merge(DEF, rest);
    for (const k of Object.keys(S)) S[k] = next[k];
    sync.forEach(f => f());
    apply.look(); apply.background(); apply.metal(); apply.diamond(); apply.intensity(); apply.rotation(); apply.render(); apply.shadow();
    if (prev.metal !== S.env.metal) await apply.env('metal');
    if (prev.diamond !== S.env.diamond) await apply.env('diamond');
    ui.refreshThumbs();
  }
  renderList();
  sync.forEach(f => f());
  ui.lastRot = { metalRotation: S.env.metalRotation, diamondRotation: S.env.diamondRotation };
  await apply.all();
  return { settings: S, defaults: DEF, apply, load, link, envs };
}
