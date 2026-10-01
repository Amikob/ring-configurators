import { SHAPES, COLORS, GROUPS, label, createCatalog, resolveSelection } from './catalog.js';
import { refreshDiamondCuts, releaseDiamondCuts } from './diamond-cuts.js?v=15.1';
import { renderProfile, applyRenderProfile } from './render-profile.js?v=15.1';
import { needsModelTransition, fadeViewer, paintViewer } from './viewer-transition.js';
import { beginSceneUpdate, refreshSceneShadows } from './scene-refresh.js?v=9';
import { manageTryonSession } from './tryon-session.js?v=11';
import { manageRingPose, normalizePose, POSES } from './ring-pose.js?v=15.1';
import { viewerDiagnostics } from './viewer-diagnostics.js?v=15.1';
import { manageModelResources } from './model-resources.js?v=15.1';
import { captureView, centerView } from './view-controls.js?v=15.1';

const $ = id => document.getElementById(id);
const PROJECT_ID = 'KoYeWRAoRNyz8HNa9FuYZQ';
const profile = renderProfile(window.matchMedia('(pointer: coarse)').matches);
let viewer, ringComponent, bandComponent, materials, catalog, ready = false, initializing = false, busy = false;
let sceneReady = false, tryonSession, savedTryonConfig, tryonLoading = false, vtoDownload, tryonGeneration = 0;
let tryonResuming = false, ringPose;
let modelResources, selectedQuality, initialCamera;
try { selectedQuality = Number(localStorage.getItem('dior-render-quality')) || undefined; } catch {}
let desired = { shape: 'round', carat: 1, band: 'none', headGold: 'white', ringGold: 'yellow', bandGold: 'yellow', pose: 'upright' };
let applied = null;
let loadedRing = null, loadedBand = null;
const groups = {};
const controls = [];
const qualityButtons = [...document.querySelectorAll('#quality button')];
function makeChoice(parent, text, value, key, className) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = text;
  button.setAttribute('aria-label', `${key === 'headGold' ? 'Head ' : key === 'ringGold' ? 'Shank ' : key === 'bandGold' ? 'Band ' : ''}${text}`);
  button.addEventListener('click', () => choose({ [key]: value }));
  controls.push({ button, key, value }); $(parent).append(button); return button;
}
for (const shape of SHAPES) {
  const button = makeChoice('shapes', '', shape, 'shape', 'shape');
  button.title = label(shape);
  const icon = document.createElement('img'); icon.src = `./assets/shapes/${shape}.png`; icon.alt = ''; icon.width = 38; icon.height = 38;
  const text = document.createElement('span'); text.textContent = label(shape); button.append(icon, text); button.setAttribute('aria-label', label(shape));
}
for (let ct = 1; ct <= 5; ct++) makeChoice('carats', `${ct} ct`, ct, 'carat', '');
$('pose-toggle').addEventListener('click', () => choose({pose:desired.pose === 'flat' ? 'upright' : 'flat'}));
$('center-view').addEventListener('click', () => {
  if (ready && !busy && tryonSession?.phase === 'idle') centerView(viewer);
});
for (const [value,text] of [['none','No band'],['plain','Plain'],['pave','Pav\u00e9']]) makeChoice('bands', text, value, 'band', '');
for (const key of ['headGold','ringGold','bandGold']) for (const color of COLORS) {
  const button = makeChoice(key === 'headGold' ? 'head-gold' : key === 'ringGold' ? 'ring-gold' : 'band-gold', label(color), color, key, 'gold');
  const swatch = document.createElement('span'); swatch.className = `swatch ${color}`; swatch.setAttribute('aria-hidden','true'); button.prepend(swatch);
}
function render() {
  for (const {button,key,value} of controls) {
    button.setAttribute('aria-pressed', String(desired[key] === value));
    button.disabled = !ready || tryonLoading || tryonSession?.phase === 'starting' || (key === 'bandGold' && desired.band === 'none');
  }
  $('band-gold-field').hidden = desired.band === 'none';
  $('carat-label').textContent = `${desired.carat} ct`;
  $('shape-label').textContent = label(desired.shape);
  $('update-status').textContent = busy ? 'Updating...' : '';
  if (applied) $('selection-summary').textContent = `${label(applied.shape)} / ${applied.carat} ct${applied.band === 'none' ? '' : ` / ${applied.band === 'pave' ? 'Pav\u00e9' : 'Plain'} band`}`;
  document.body.dataset.ready = String(ready);
  document.body.dataset.busy = String(busy);
  $('viewer').setAttribute('aria-busy', String(busy));
  $('viewer').inert = busy;
  const inTryon = tryonSession?.phase === 'running';
  $('pose').hidden = desired.band !== 'none' || inTryon || tryonLoading || tryonResuming;
  $('pose-toggle').disabled = !ready || busy || tryonLoading || inTryon;
  $('pose-toggle').setAttribute('aria-pressed', String(desired.pose === 'flat'));
  $('pose-toggle').title = desired.pose === 'flat' ? 'Stand ring upright' : 'Rest ring on floor';
  $('pose-toggle').setAttribute('aria-label', $('pose-toggle').title);
  $('pose-toggle').dataset.tooltip = $('pose-toggle').title;
  $('pose-label').textContent = desired.pose === 'flat' ? 'Stand' : 'Rest';
  $('center-view').disabled = !ready || busy || tryonLoading || inTryon;
  $('center-view').hidden = inTryon;
  $('tryon').hidden = !savedTryonConfig?.enabled;
  $('tryon').disabled = !ready || busy || tryonLoading;
  $('tryon').title = tryonResuming ? 'Updating AR...' : tryonLoading ? 'Opening AR...' : inTryon ? 'Exit AR' : 'Try on';
  $('tryon').setAttribute('aria-label', $('tryon').title);
  $('tryon').dataset.tooltip = inTryon ? 'Exit try-on' : 'Try on your hand';
  $('tryon-label').textContent = inTryon ? 'Exit' : 'Try on';
  $('tryon').querySelector('img').src = `./assets/icons/${inTryon ? 'x' : 'hand'}.svg`;
  $('flip-camera').hidden = !inTryon;
  $('finger').hidden = !inTryon;
  $('quality-control').hidden = inTryon || tryonLoading || tryonResuming;
  const scale = selectedQuality || viewer?.renderer.displayCanvasScaling || 1;
  const activeQuality = scale >= 2 ? 2 : scale >= 1.5 ? 1.5 : 1;
  for (const button of qualityButtons) {
    button.disabled = !ready || busy || tryonLoading || inTryon;
    button.setAttribute('aria-pressed', String(Number(button.dataset.quality) === activeQuality));
  }
}
function showError(message) { $('error').textContent = message; $('error').hidden = false; $('retry').hidden = false; }
function showTryonError(message) { showError(message); $('retry').hidden = true; }
function clearError() { $('error').hidden = true; $('retry').hidden = true; }
function groupFor(name, materialName) {
  return materials?.variations?.find(g => g.title?.toLowerCase() === name || String(g.name || '').replace(/\s/g,'').toLowerCase() === materialName);
}
function materialFor(group, color) {
  return group.materials.find(m => {
    const name = `${m.userData?.label || ''} ${m.name || ''}`.toLowerCase().replace(/[^a-z]/g,'');
    return color === 'white' ? name.includes('whitegold') : color === 'rose' ? name.includes('rosegold') : name.includes('gold') && !name.includes('white') && !name.includes('rose');
  });
}
async function applyGold(key, color) {
  const group = groups[key];
  const material = materialFor(group,color);
  if (!material) throw new Error(`${label(color)} gold is missing from ${key === 'ringGold' ? 'Ring' : 'Band'} gold.`);
  await materials.applyVariation(group,material.uuid);
}
async function choose(patch) {
  if (!ready || tryonLoading || tryonSession?.phase === 'starting') return;
  desired = normalizePose({ ...desired, ...patch }); render(); await drain();
}
async function drain() {
  if (busy || !ready) return;
  if (applied && JSON.stringify(applied) === JSON.stringify(desired)) return;
  const resumeView = tryonSession?.captureView();
  const resumeGeneration = tryonGeneration;
  tryonResuming = Boolean(resumeView);
  busy = true; clearError(); render();
  let fading = false, shadowsChanged = false, capturesReleased = false;
  const finishSceneUpdate = beginSceneUpdate(viewer);
  // Never replace meshes or release their textures while Try-On owns the scene.
  try {
    if (resumeView) {
      fading = true;
      await fadeViewer($('viewer'), true);
      await paintViewer();
    }
    await tryonSession?.stop();
  }
  catch (error) {
    console.error('Dior Try-On stop failed', error);
    if (applied) desired = { ...applied };
    showError('Exit AR before changing this selection, then try again.');
    if (fading) await fadeViewer($('viewer'), false);
    finishSceneUpdate();
    tryonResuming = false; busy = false; render(); return;
  }
  try {
    // Serialize SDK calls; rapid clicks settle on the latest complete selection.
    while (!applied || JSON.stringify(applied) !== JSON.stringify(desired)) {
      if (!fading && needsModelTransition(applied, desired)) {
        fading = true;
        await fadeViewer($('viewer'), true);
        await paintViewer();
      }
      const target = { ...desired };
      const restoreView = applied && !resumeView ? captureView(viewer) : () => {};
      const enteringRest = target.pose === 'flat' && applied?.pose !== 'flat';
      const {ring,band} = resolveSelection(catalog,target);
      const ringChanged = loadedRing !== ring.variation;
      const bandChanged = band && loadedBand !== band.variation;
      const bandVisibilityChanged = Boolean(band) !== Boolean(applied && applied.band !== 'none');
      // Material-only changes must retain the resting transform and view.
      if (ringChanged || bandChanged || target.pose !== ringPose.current) {
        shadowsChanged = ringPose.restore() || shadowsChanged;
      }
      shadowsChanged ||= ringChanged || bandChanged || needsModelTransition(applied, target);
      if (ringChanged || bandChanged) {
        applyRenderProfile(viewer, profile, selectedQuality);
        modelResources?.cleanup();
        modelResources?.beginLoad();
        releaseDiamondCuts(viewer);
        capturesReleased = true;
      }
      if (ringChanged || bandChanged || !band) bandComponent.setVisible(false);
      if (ringChanged) {
        const model = await ringComponent.applyVariation(ring.variation,true);
        if (!model) throw new Error('Ring download failed.');
        loadedRing = ring.variation;
      }
      if (bandChanged) {
        const model = await bandComponent.applyVariation(band.variation,true);
        if (!model) throw new Error('Band download failed.');
        loadedBand = band.variation;
      }
      // Presets initialize the diamonds; restore the independently chosen gold afterward.
      if (ringChanged || bandChanged || !applied || applied.headGold !== target.headGold) await applyGold('headGold',target.headGold);
      if (ringChanged || bandChanged || !applied || applied.ringGold !== target.ringGold) await applyGold('ringGold',target.ringGold);
      if (band && (ringChanged || bandChanged || !applied || applied.bandGold !== target.bandGold)) await applyGold('bandGold',target.bandGold);
      bandComponent.setVisible(Boolean(band));
      if (ringChanged || bandChanged || bandVisibilityChanged) {
        refreshDiamondCuts(viewer, profile);
        capturesReleased = false;
      }
      if (target.pose === 'flat' && ringPose.current !== 'flat') ringPose.apply('flat');
      if (ringChanged || bandChanged) {
        modelResources?.endLoad();
        modelResources?.cleanup();
      }
      applyRenderProfile(viewer, profile, selectedQuality);
      restoreView();
      if (!applied && initialCamera) {
        const c = viewer.scene.activeCamera;
        c.getControls()?.stopDamping();
        c.setCameraOptions({position:[initialCamera.position.x,initialCamera.position.y,initialCamera.position.z],target:[initialCamera.target.x,initialCamera.target.y,initialCamera.target.z],fov:initialCamera.camOptions.fov});
        centerView(viewer);
      }
      if (enteringRest || applied && target.pose !== applied.pose) centerView(viewer, {resting:enteringRest});
      shadowsChanged ||= target.pose !== applied?.pose;
      applied = target;
      render();
    }
  } catch (error) {
    console.error('Dior selection failed',error);
    modelResources?.endLoad();
    modelResources?.cleanup();
    if (capturesReleased) {
      try { refreshDiamondCuts(viewer, profile); }
      catch (captureError) { console.warn('Dior diamond recovery failed', captureError); }
    }
    ringPose.restore();
    desired.pose = 'upright';
    bandComponent?.setVisible(false);
    shadowsChanged = true;
    applied = null;
    $('selection-summary').textContent = 'Selection incomplete';
    showError('This selection could not load. Please try again.');
  } finally {
    try {
      if (shadowsChanged) {
        refreshSceneShadows(viewer);
      }
    } catch (error) {
      console.warn('Dior shadow refresh failed', error);
    }
    try {
      if (resumeView && applied && resumeGeneration === tryonGeneration && !document.hidden) {
        // Rebuild the new assembly before resuming the existing AR experience.
        await openTryon({ generation: resumeGeneration, resumeView });
      }
      if (fading) {
        await paintViewer();
        await fadeViewer($('viewer'), false);
      }
    } finally {
      finishSceneUpdate();
      tryonResuming = false;
      busy = false; render();
    }
    // A click during fade-in still needs to reach the serialized selection queue.
    if (applied && JSON.stringify(applied) !== JSON.stringify(desired)) await drain();
  }
}
async function setup() {
  if (!sceneReady || ready || initializing) return;
  const plugin = viewer?.getPluginByType('RingConfigurator');
  ringComponent = plugin?.getComponent('Ring'); bandComponent = plugin?.getComponent('Band');
  materials = viewer?.getPluginByType('MaterialConfiguratorPlugin');
  if (!ringComponent?.variations?.length || !bandComponent?.variations?.length || !materials?.variations?.length) return;
  initializing = true;
  try {
    catalog = createCatalog(ringComponent.variations,bandComponent.variations);
    // Keep background and ground rendering consistent with the saved iJewel scene.
    groups.headGold = groupFor('head gold','metal02'); groups.ringGold = groupFor('shank gold','metal01'); groups.bandGold = groupFor('band gold','metal03');
    if (!groups.ringGold || !groups.bandGold) throw new Error('The saved ring and band gold controls are missing.');
    const presets = viewer.getPluginByType('MaterialPresetPlugin');
    if (presets?.mapping) {
      // Saved configurator references are not downloadable material URLs.
      presets.mapping = presets.mapping.filter(entry=>!/(?:^|\/)MaterialConfiguratorPlugin:\d+$/.test(entry.path || ''));
    }
    for (const key of ['headGold','ringGold','bandGold']) for (const color of COLORS) if (!groups[key] || !materialFor(groups[key],color)) throw new Error(`Missing ${key} ${color}`);
    modelResources = manageModelResources(viewer, [ringComponent, bandComponent]);
    ready = true; clearTimeout(startupTimeout); render(); await drain(); $('startup').hidden = true;
  } catch (error) {
    console.error('Dior setup failed',error);
    $('startup-text').textContent = 'Dior is not available yet.';
    $('startup').querySelector('.spinner').hidden = true;
    showError(`Could not prepare Dior. ${error.message}`);
  } finally { initializing = false; }
}
$('retry').addEventListener('click',()=> ready ? drain() : location.reload());
for (const button of qualityButtons) button.addEventListener('click', () => {
  if (!viewer || busy || tryonLoading || tryonSession?.phase !== 'idle') return;
  selectedQuality = Number(button.dataset.quality);
  viewer.renderer.displayCanvasScaling = selectedQuality;
  try { localStorage.setItem('dior-render-quality', String(selectedQuality)); } catch {}
  viewer.setDirty();
  render();
});
function downloadTryon() {
  if (window.ij_vto?.RingTryonPlugin) return Promise.resolve();
  if (!vtoDownload) vtoDownload = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://releases.ijewel3d.com/libs/web-vto/0.3.3/web-vto.js';
    script.onload = resolve;
    script.onerror = () => { script.remove(); vtoDownload = null; reject(new Error('Try-On could not download. Please try again.')); };
    document.head.append(script);
  });
  return vtoDownload;
}
async function openTryon({ generation = ++tryonGeneration, resumeView = null } = {}) {
  const cancelled = () => generation !== tryonGeneration || document.hidden;
  let prepared;
  tryonLoading = true; clearError(); render();
  try {
    await downloadTryon();
    if (cancelled()) return;
    const tryon = await viewer.getOrAddPlugin(window.ij_vto.RingTryonPlugin, { preload: false });
    await viewer.getOrAddPlugin(window.ij_vto.TryonUIPlugin);
    if (cancelled()) return;
    // An automatic continuation retains the current plugin's fit and camera settings.
    if (!resumeView) await tryon.fromJSON({ ...savedTryonConfig, type: window.ij_vto.RingTryonPlugin.PluginType });
    if (cancelled()) return;
    if (ringPose.restore()) {
      desired.pose = 'upright';
      if (applied) applied.pose = 'upright';
      refreshSceneShadows(viewer);
    }
    prepared = window.ijewelViewer.prepareConfiguratorTryon(viewer, tryon);
    await tryon.start();
    if (cancelled()) { await tryonSession.stop(); prepared.restore(); return; }
    if (!tryon.running) {
      prepared.restore();
      showTryonError('Try-On could not start. Check camera access and try again.');
    } else {
      tryon.finger = $('finger').value;
      tryonSession.restoreView(resumeView);
    }
  } catch (error) {
    try { await tryonSession?.stop(); }
    catch (stopError) { console.warn('Dior Try-On recovery failed', stopError); }
    prepared?.restore();
    console.error('Dior Try-On failed', error);
    showTryonError('Try-On could not start. Check camera access and try again.');
  } finally { tryonLoading = false; render(); }
}
$('tryon').addEventListener('click', async () => {
  if (!ready || busy || tryonLoading) return;
  if (tryonSession?.phase === 'running') {
    tryonGeneration++;
    try { await tryonSession.stop(); }
    catch (error) { showTryonError(error.message); }
    return;
  }
  await openTryon();
});
$('flip-camera').addEventListener('click', async () => {
  const tryon = viewer?.getPluginByType('RingTryonPlugin');
  if (!tryon?.running) return;
  $('flip-camera').disabled = true;
  try { await tryon.flipCamera(); }
  catch (error) { showTryonError('The camera could not switch. Please try again.'); }
  finally { $('flip-camera').disabled = false; }
});
$('finger').addEventListener('change', () => {
  const tryon = viewer?.getPluginByType('RingTryonPlugin');
  if (tryon?.running) tryon.finger = $('finger').value;
});
render();
window.addEventListener('ijewel-file-data', ({ detail }) => {
  const parse = value => typeof value === 'string' ? JSON.parse(value) : value || {};
  try {
    const file = detail.iJewelFileData;
    const config = parse(file?.config);
    savedTryonConfig = (Object.keys(config).length ? config : parse(file?.defaultConfig)).tryonConfig;
    render();
  } catch (error) { console.warn('Dior Try-On configuration could not be read', error); }
}, { once: true });
window.addEventListener('ijewel-scene-ready',()=> { sceneReady = true; setup(); },{once:true});
window.addEventListener('ijewel-viewer-ready',({detail})=> {
  viewer = detail.viewer;
  ringPose = manageRingPose(viewer, window);
  tryonSession = manageTryonSession(viewer, {
    touchDevice: Boolean(profile.maxRenderScale), onChange: render
  });
  viewer.getPluginByType('RingConfigurator')?.addEventListener('componentProcessed',setup);
  viewer.getPluginByType('MaterialConfiguratorPlugin')?.addEventListener('refreshUi',setup);
  setup();
},{once:true});
function stopBackgroundTryon() {
  tryonGeneration++;
  tryonSession?.stop().catch(error => console.warn('Dior background Try-On stop failed', error));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopBackgroundTryon();
});
window.addEventListener('pagehide', stopBackgroundTryon);
const startupTimeout = setTimeout(()=> {
  if (!ready) { $('startup-text').textContent = 'Dior is taking longer than expected.'; showError('The 3D project could not finish loading. Check your connection and try again.'); }
},90000);
async function start() {
  try {
    if (!window.ijewelViewer) throw new Error('The 3D viewer could not be downloaded.');
    const response = await fetch('./project.json');
    if (!response.ok) throw new Error('Dior scene could not be loaded.');
    const baseline = await response.json();
    const savedResponse = await fetch(`https://amikob.ijewel3d.com/api/raw/v1/files/view/${PROJECT_ID}?select=id,name,file,config`, {cache:'no-store'});
    if (!savedResponse.ok) throw new Error('The saved iJewel scene could not be loaded. Please retry.');
    const {applySavedScene} = await import('./saved-project.js?v=2');
    const project = applySavedScene(baseline, await savedResponse.json());
    initialCamera = project.cameraConfig;
    savedTryonConfig = project.tryonConfig;
    const miniViewer = new ijewelViewer.Viewer($('viewer'),project,{
      showConfigurator:false,showCard:false,transparentBg:false,showUiButtons:false,hideTryOn:true,hideCameraViews:true,
      useIjewelLogo:false, brandingSettings:{enable:false,showLoadingScreenLogo:false}
    });
    if (!miniViewer) throw new Error('The iJewel project must be Public before it can open here.');
  } catch(error) { clearTimeout(startupTimeout); $('startup-text').textContent = 'Unable to open Dior'; $('startup').querySelector('.spinner').hidden = true; showError(error.message); }
}
start();

function configuration() {
  const chosen = applied && catalog ? resolveSelection(catalog,applied) : null;
  const bounds = ready ? viewer.scene.getModelBounds(true, true, true) : null;
  return { ready, busy, tryon: tryonSession?.phase || 'idle', pose: ringPose?.current || 'upright', modelBounds: bounds ? {min:bounds.min.toArray(),max:bounds.max.toArray()} : null, renderScale: viewer?.renderer.displayCanvasScaling, requested: { ...desired }, displayed: applied && { ...applied }, ringFile: chosen?.ring.variation.name || null, bandFile: chosen?.band?.variation.name || null, bandGroup: applied ? GROUPS[applied.shape] : null };
}
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const definitions = [
    { name:'get_dior_diagnostics',title:'Read viewer diagnostics',description:'Read resource counts and view transforms for diagnosing repeated model changes. Does not alter the viewer.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>viewerDiagnostics(viewer,window.Cache) },
    { name:'get_dior_configuration',title:'Read Dior selection',description:'Read the current Dior ring and matching-band selection.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>configuration() },
    { name:'configure_dior',title:'Configure Dior',description:'Choose a ring shape, exact carat, optional matching band, independent gold colors, and upright or flat ring-only pose. Updates the visible 3D configurator; does not place an order.',inputSchema:{type:'object',properties:{shape:{type:'string',enum:SHAPES},carat:{type:'integer',minimum:1,maximum:5},band:{type:'string',enum:['none','plain','pave']},headGold:{type:'string',enum:COLORS},ringGold:{type:'string',enum:COLORS},bandGold:{type:'string',enum:COLORS},pose:{type:'string',enum:POSES}},additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=> {
      if (!ready) throw new Error('Dior is not ready.');
      if (busy) throw new Error('A selection is still loading. Please wait.');
      if (tryonLoading || tryonSession?.phase === 'starting') throw new Error('Try-On is still starting. Please wait.');
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key=>!Object.hasOwn(desired,key))) throw new Error('Invalid selection fields.');
      if (input.pose !== undefined && !POSES.includes(input.pose)) throw new Error('Invalid pose.');
      if (input.pose && tryonSession?.phase !== 'idle') throw new Error('Exit AR before changing the pose.');
      resolveSelection(catalog,{...desired,...input});
      await choose(input);
      if (!applied) throw new Error('The selection did not finish loading.');
      return configuration();
    } }
  ];
  for (const tool of definitions) {
    try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn); } catch(error) { console.warn(error); }
  }
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
