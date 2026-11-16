import { RingViewer } from './viewer.js?v=sh1';

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

const viewer = new RingViewer($('viewer'), {
  pixelRatio: Math.min((window.devicePixelRatio || 1), 2) * (quality / 1.5),
  maxFrames: Number(params.get('frames')) || 48,
  bounces: Number(params.get('bounces')) || 7,
  preserveDrawingBuffer: params.has('capture'),
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
  return { elevation: params.has('el') ? Number(params.get('el')) : (state.pose === 'flat' ? 26 : 6), azimuth: params.has('az') ? Number(params.get('az')) : (state.pose === 'flat' ? -14 : -30), fill: Number(params.get('fill')) || 0.44 };
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

viewer.applyPose(state.pose);
render();
const envOpts = { saturation: params.has('sat') ? Number(params.get('sat')) : 0, exposure: Number(params.get('exp')) || 1.6 };
await viewer.loadEnvironment(params.get('env') ? `./env/${params.get('env')}.hdr` : './env/studio.hdr', { ...envOpts, target: 'gem' });
await viewer.loadEnvironment(params.get('menv') ? `./env/${params.get('menv')}.hdr` : './env/metal.hdr', { saturation: 0, exposure: Number(params.get('mexp')) || 1.3, target: 'metal' });
if (params.has('rot')) viewer.setEnvRotation(Number(params.get('rot')));
viewer.setGold(state.gold);
await choose({});
viewer.frontView(viewParams());
$('startup').hidden = true;
viewer.addEventListener('converged', () => { document.documentElement.dataset.converged = '1'; });
