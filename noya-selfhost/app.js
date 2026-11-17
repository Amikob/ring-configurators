import { RingViewer } from './viewer.js?v=sh6';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHAPES = ['round', 'oval', 'elongated_cushion', 'elongated_radiant', 'emerald', 'old_cut_cushion', 'princess', 'marquise'];
const CARATS = [2, 3, 4, 5, 6];
const COLORS = ['white', 'yellow', 'rose'];
const label = v => v.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

const state = {
  shape: params.get('shape') || 'oval',
  carat: Number(params.get('ct')) || 3,
  gold: params.get('gold') || 'yellow',
  pose: params.get('pose') || 'flat',
};
const quality = Number(params.get('q')) || Number(localStorage.getItem('noya-sh-quality')) || (matchMedia('(pointer:coarse)').matches ? 1 : 1.5);

const manifest = await (await fetch('./models/manifest.json')).json();
const have = new Set(manifest.map(m => `${m.shape}:${m.carat}`));

// Adaptive quality: phones / tablets (coarse pointer or small screen) get fewer internal bounces,
// a lower pixel ratio cap and fewer accumulation frames; everyone drops to fewer bounces while dragging.
const mobile = params.has('mobile') ? params.get('mobile') !== '0' : (matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 600);
const LOOK_DEFAULTS = { toneMapping: 'neutral', exposure: 1.0, bloom: 0.12, floor: 1.0 };
const look = {
  toneMapping: params.get('tm') || LOOK_DEFAULTS.toneMapping,
  exposure: params.has('exposure') ? Number(params.get('exposure')) : LOOK_DEFAULTS.exposure,
  bloom: params.has('bloom') ? Number(params.get('bloom')) : LOOK_DEFAULTS.bloom,
  floor: params.has('floor') ? Number(params.get('floor')) : LOOK_DEFAULTS.floor,
};
const viewer = new RingViewer($('viewer'), {
  pixelRatio: Math.min((window.devicePixelRatio || 1), mobile ? 1.5 : 2) * (quality / 1.5),
  maxFrames: Number(params.get('frames')) || (mobile ? 32 : 48),
  bounces: Number(params.get('bounces')) || (mobile ? 5 : 7),
  motionBounces: Number(params.get('mbounces')) || (mobile ? 3 : 4),
  cubeSize: mobile ? 128 : 256,
  metalInStone: params.has('metalstone') ? Number(params.get('metalstone')) : 0.35,
  shadow: { samples: mobile ? 96 : 128 },
  bakePerFrame: mobile ? 16 : 32,
  preserveDrawingBuffer: params.has('capture'),
  look,
});
window.noyaViewer = viewer;

function button(parent, html, onClick, cls) {
  const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; b.innerHTML = html; b.addEventListener('click', onClick); parent.appendChild(b); return b;
}
const shapeButtons = new Map(SHAPES.map(s => [s, button($('shapes'), `<img src="./assets/shapes/${s}.png" alt=""><span>${label(s)}</span>`, () => choose({ shape: s }), 'shape')]));
const caratButtons = new Map(CARATS.map(c => [c, button($('carats'), `${c} ct`, () => choose({ carat: c }))]));
const goldButtons = new Map(COLORS.map(c => [c, button($('ring-gold'), `<span class="swatch ${c}"></span>${label(c)}`, () => choose({ gold: c }), 'gold')]));
document.querySelectorAll('#quality button').forEach(b => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.quality) === quality));
  b.addEventListener('click', () => { localStorage.setItem('noya-sh-quality', b.dataset.quality); const u = new URL(location.href); u.searchParams.delete('q'); location.href = u; });
});

function render() {
  for (const [s, b] of shapeButtons) b.setAttribute('aria-pressed', String(s === state.shape));
  for (const [c, b] of caratButtons) { b.setAttribute('aria-pressed', String(c === state.carat)); b.disabled = !have.has(`${state.shape}:${c}`); }
  for (const [c, b] of goldButtons) b.setAttribute('aria-pressed', String(c === state.gold));
  $('shape-label').textContent = label(state.shape);
  $('carat-label').textContent = `${state.carat} ct`;
  $('pose-label').textContent = state.pose === 'flat' ? 'Stand' : 'Rest';
  $('selection-summary').textContent = `${label(state.shape)} / ${state.carat} ct`;
}

let loadedKey = '';
async function choose(patch) {
  Object.assign(state, patch);
  if (!have.has(`${state.shape}:${state.carat}`)) state.carat = CARATS.filter(c => have.has(`${state.shape}:${c}`)).sort((a, b) => Math.abs(a - state.carat) - Math.abs(b - state.carat))[0];
  render();
  if (patch.gold) viewer.setGold(state.gold);
  const key = `${state.shape}:${state.carat}`;
  if (key !== loadedKey) {
    $('update-status').textContent = 'Loading...';
    const entry = manifest.find(m => m.shape === state.shape && m.carat === state.carat);
    try {
      const ok = await viewer.loadRing(`./models/${entry.file}`);
      if (ok) loadedKey = key;
      $('error').hidden = true;
    } catch (e) { console.error(e); $('error').textContent = 'This ring could not load. Please try again.'; $('error').hidden = false; }
    $('update-status').textContent = '';
  }
}

function viewParams() {
  return { elevation: params.has('el') ? Number(params.get('el')) : (state.pose === 'flat' ? 24 : 6), azimuth: params.has('az') ? Number(params.get('az')) : (state.pose === 'flat' ? -14 : -30), fill: Number(params.get('fill')) || 0.45, lower: params.has('lower') ? Number(params.get('lower')) : 0.16 };
}
$('pose-toggle').addEventListener('click', () => { state.pose = state.pose === 'flat' ? 'upright' : 'flat'; viewer.applyPose(state.pose); viewer.frontView(viewParams()); render(); });
$('center-view').addEventListener('click', () => viewer.frontView(viewParams()));

// Optional live tuning panel for diamond look: add ?tune=1
if (params.has('tune')) {
  const t = $('tuning'); t.classList.add('on');
  const slider = (name, min, max, step, get, set) => {
    const l = document.createElement('label'); l.innerHTML = `<span>${name}</span>`; const i = document.createElement('input');
    Object.assign(i, { type: 'range', min, max, step, value: get() }); i.oninput = () => set(Number(i.value)); l.appendChild(i); t.appendChild(l);
  };
  slider('Dispersion', 0, 0.15, 0.005, () => viewer.gemTuning.dispersion, v => viewer.setGem({ dispersion: v }));
  slider('Env intensity', 0.3, 3, 0.05, () => viewer.gemTuning.envIntensity, v => viewer.setGem({ envIntensity: v }));
  slider('Env contrast', 0.6, 2.5, 0.05, () => viewer.gemTuning.envContrast, v => viewer.setGem({ envContrast: v }));
  slider('Env rotation', 0, 6.283, 0.01, () => viewer.envRotation || 0, v => viewer.setEnvRotation(v));
  slider('Metal roughness', 0, 0.4, 0.01, () => viewer.metalMaterial.roughness, v => { viewer.metalMaterial.roughness = v; viewer.reset(); });
}

// Look controls (tone mapping / exposure / bloom / floor) live in the HDRI panel; kept in the URL (?tm=&exposure=&bloom=&floor=).
const lookInputs = { exposure: $('exposure'), bloom: $('bloom'), floor: $('floor') };
function renderLook() {
  $('tm-select').value = look.toneMapping;
  for (const [k, el] of Object.entries(lookInputs)) { el.value = look[k]; $(`${k}-val`).textContent = Number(look[k]).toFixed(2); }
}
function setLook(patch) {
  Object.assign(look, patch);
  viewer.setLook(look);
  renderLook();
  const u = new URL(location.href);
  const keys = { toneMapping: 'tm', exposure: 'exposure', bloom: 'bloom', floor: 'floor' };
  for (const [k, p] of Object.entries(keys)) { if (look[k] === LOOK_DEFAULTS[k]) u.searchParams.delete(p); else u.searchParams.set(p, look[k]); }
  history.replaceState(null, '', u);
}
$('tm-select').addEventListener('change', e => setLook({ toneMapping: e.target.value }));
for (const [k, el] of Object.entries(lookInputs)) el.addEventListener('input', () => setLook({ [k]: Number(el.value) }));
$('look-reset').addEventListener('click', () => setLook({ ...LOOK_DEFAULTS }));
viewer.setLook(look);
renderLook();

viewer.applyPose(state.pose);
render();
// Environment maps: separate lists for metal (gold) and diamond lighting, see env/envs.json.
// ?metalenv=mNN / ?diamondenv=dNN pick one; the on-page HDRI picker keeps those params in sync.
const envs = await (await fetch('./env/envs.json?v=' + Date.now().toString(36).slice(0, -3))).json();
const envKinds = { metal: { param: 'metalenv', target: 'metal' }, diamond: { param: 'diamondenv', target: 'gem' } };
const envState = {};
const envSeq = { metal: 0, diamond: 0 };
async function setEnv(kind, id, { sync = true } = {}) {
  const list = envs[kind];
  const entry = list.find(e => e.id === id) || list.find(e => e.id === envs.defaults[kind]) || list[0];
  envState[kind] = entry.id;
  const seq = ++envSeq[kind];
  renderEnvUI();
  $('env-status').textContent = `Loading ${entry.id}...`;
  try {
    const opts = kind === 'metal'
      ? { saturation: params.has('sat') ? Number(params.get('sat')) : (entry.saturation ?? 1), exposure: (Number(params.get('mexp')) || 1) * (entry.exposure ?? 1), lift: entry.lift ?? 0, target: 'metal' }
      : { saturation: params.has('sat') ? Number(params.get('sat')) : (entry.saturation ?? 0), exposure: (Number(params.get('exp')) || 1) * (entry.exposure ?? 1.6), target: 'gem' };
    await viewer.loadEnvironment(`./env/${entry.file}`, { ...opts, isCurrent: () => seq === envSeq[kind] });
    if (seq === envSeq[kind]) $('env-status').textContent = entry.name || '';
  } catch (e) { console.error(e); $('env-status').textContent = `Could not load ${entry.id}`; }
  if (sync) {
    const u = new URL(location.href);
    if (entry.id === envs.defaults[kind]) u.searchParams.delete(envKinds[kind].param); else u.searchParams.set(envKinds[kind].param, entry.id);
    history.replaceState(null, '', u);
  }
}
function renderEnvUI() {
  for (const kind of Object.keys(envKinds)) {
    const row = document.querySelector(`.env-row[data-kind="${kind}"]`), sel = row.querySelector('select');
    if (!sel.options.length) for (const e of envs[kind]) sel.add(new Option(e.name ? `${e.id} - ${e.name}` : e.id, e.id));
    sel.value = envState[kind] || envs.defaults[kind];
    sel.disabled = envs[kind].length < 2;
    row.querySelectorAll('.env-step').forEach(b => { b.disabled = envs[kind].length < 2; });
  }
  $('env-current').textContent = envState.metal || '';
}
for (const kind of Object.keys(envKinds)) {
  const row = document.querySelector(`.env-row[data-kind="${kind}"]`), sel = row.querySelector('select');
  sel.addEventListener('change', () => setEnv(kind, sel.value));
  row.querySelectorAll('.env-step').forEach(b => b.addEventListener('click', () => {
    const list = envs[kind], i = list.findIndex(e => e.id === envState[kind]);
    setEnv(kind, list[(i + Number(b.dataset.dir) + list.length) % list.length].id);
  }));
}
// The lighting / tone panel is docked in the options column (on phones it temporarily replaces the
// shape / carat / gold options), so the ring stays fully visible while adjusting. If the 3D view changes
// size because of it, the ring is re-framed to fit.
function setEnvPanel(open) {
  const before = $('viewer').clientHeight;
  $('env-panel').hidden = !open; $('env-toggle').setAttribute('aria-expanded', String(open));
  document.querySelector('.panel').classList.toggle('look-open', open);
  if (open) $('env-panel').scrollIntoView({ block: 'nearest' });
  requestAnimationFrame(() => requestAnimationFrame(() => { if (Math.abs($('viewer').clientHeight - before) > 8 && viewer.bounds) { viewer.resize(); viewer.frontView(viewParams()); } }));
}
$('env-toggle').addEventListener('click', () => setEnvPanel($('env-panel').hidden));
$('env-close').addEventListener('click', () => setEnvPanel(false));
if (params.has('hdri')) setEnvPanel(true);
// Old pilot params still work: ?env=<file> (diamond) and ?menv=<file> (metal) load a raw file from env/.
if (params.get('env')) await viewer.loadEnvironment(`./env/${params.get('env')}.hdr`, { saturation: 0, exposure: Number(params.get('exp')) || 1.6, target: 'gem' });
else await setEnv('diamond', params.get('diamondenv'), { sync: false });
if (params.get('menv')) await viewer.loadEnvironment(`./env/${params.get('menv')}.hdr`, { saturation: 0, exposure: Number(params.get('mexp')) || 1.3, lift: 0.05, target: 'metal' });
else await setEnv('metal', params.get('metalenv'), { sync: false });
if (params.has('rot')) viewer.setEnvRotation(Number(params.get('rot')));
viewer.setGold(state.gold);
await choose({});
viewer.frontView(viewParams());
$('startup').hidden = true;
viewer.addEventListener('converged', () => { document.documentElement.dataset.converged = '1'; });
