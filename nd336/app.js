import { SHAPES, EAST_WEST, COLORS, label, createCatalog, resolveSelection, parseRing } from './catalog.js?v=nd336-1';
import { refreshDiamondCuts, releaseDiamondCuts } from './diamond-cuts.js?v=nd336-1';
import { renderProfile, applyRenderProfile } from './render-profile.js?v=nd336-1';
import { needsModelTransition, fadeViewer, paintViewer } from './viewer-transition.js?v=nd336-1';
import { beginSceneUpdate, refreshSceneShadows } from './scene-refresh.js?v=nd336-1';
import { manageTryonSession } from '../shared/tryon-session.js?v=3';
import { manageRingPose, normalizePose, POSES } from './ring-pose.js?v=nd336-1';
import { viewerDiagnostics } from './viewer-diagnostics.js?v=nd336-1';
import { manageModelResources } from './model-resources.js?v=nd336-1';
import { captureView, centerView } from './view-controls.js?v=nd336-1';

const $ = id => document.getElementById(id);
const PROJECT_ID = 'DLVn0aVvScWnnSuKWGzUTg';
const profile = renderProfile(window.matchMedia('(pointer: coarse)').matches);
let viewer, ringComponent, materials, catalog, ready = false, initializing = false, busy = false;
let sceneReady = false, tryonSession, savedTryonConfig, tryonLoading = false, vtoDownload, tryonGeneration = 0;
let tryonResuming = false, ringPose;
let modelResources, selectedQuality, initialCamera;
try { selectedQuality = Number(localStorage.getItem('nd336-render-quality')) || undefined; } catch {}
let desired = { shape: 'oval', carat: 3, orientation: 'ns', headGold: 'white', ringGold: 'yellow', pose: 'upright' };
let applied = null;
let loadedRing = null;
const groups = {};
const controls = [];
const qualityButtons = [...document.querySelectorAll('#quality button')];
function makeChoice(parent, text, value, key, className) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = className; button.textContent = text;
  button.setAttribute('aria-label', `${key === 'headGold' ? 'Head ' : key === 'ringGold' ? 'Shank ' : ''}${text}`);
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
for (const [value, text] of [['ns', 'North-South'], ['ew', 'East-West']]) makeChoice('orientations', text, value, 'orientation', '');
$('pose-toggle').addEventListener('click', () => choose({pose:desired.pose === 'flat' ? 'upright' : 'flat'}));
$('center-view').addEventListener('click', () => {
  if (ready && !busy && tryonSession?.phase === 'idle') centerView(viewer);
});
for (const key of ['headGold','ringGold']) for (const color of COLORS) {
  const button = makeChoice(key === 'headGold' ? 'head-gold' : 'ring-gold', label(color), color, key, 'gold');
  const swatch = document.createElement('span'); swatch.className = `swatch ${color}`; swatch.setAttribute('aria-hidden','true'); button.prepend(swatch);
}
function render() {
  for (const {button,key,value} of controls) {
    button.setAttribute('aria-pressed', String(desired[key] === value));
    button.disabled = !ready || tryonLoading || tryonSession?.phase === 'starting' || (key === 'orientation' && value === 'ew' && !EAST_WEST.has(desired.shape));
  }
  $('orientation-field').hidden = !EAST_WEST.has(desired.shape);
  $('carat-label').textContent = `${desired.carat} ct`;
  $('shape-label').textContent = label(desired.shape);
  $('update-status').textContent = busy ? 'Updating...' : '';
  if (applied) $('selection-summary').textContent = `${label(applied.shape)} / ${applied.carat} ct${EAST_WEST.has(applied.shape) ? ` / ${applied.orientation.toUpperCase()}` : ''}`;
  document.body.dataset.ready = String(ready);
  document.body.dataset.busy = String(busy);
  $('viewer').setAttribute('aria-busy', String(busy));
  $('viewer').inert = busy;
  const inTryon = tryonSession?.phase === 'running';
  $('pose').hidden = inTryon || tryonLoading || tryonResuming;
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
  if (!material) throw new Error(`${label(color)} gold is missing from ${key === 'ringGold' ? 'Shank' : 'Head'} gold.`);
  await materials.applyVariation(group,material.uuid);
}
async function choose(patch) {
  if (!ready || tryonLoading || tryonSession?.phase === 'starting') return;
  if (patch.shape && !EAST_WEST.has(patch.shape)) patch.orientation = 'ns';
  desired = normalizePose({ ...desired, ...patch }); render(); await drain();
}
async function drain() {
  if (busy || !ready) return;
  if (applied && JSON.stringify(applied) === JSON.stringify(desired)) return;
  const resumeView = tryonSession?.captureView();
  const resumeGeneration = tryonGeneration;
  // In AR, swap the model on the finger instead of restarting the camera.
  let liveTryon = Boolean(resumeView) && tryonSession.detach();
  tryonResuming = Boolean(resumeView) && !liveTryon;
  busy = true; clearError(); render();
  let fading = false, shadowsChanged = false, capturesReleased = false;
  const finishSceneUpdate = beginSceneUpdate(viewer);
  // Never replace meshes or release their textures while Try-On owns the scene.
  try {
    if (resumeView && !liveTryon) {
      fading = true;
      await fadeViewer($('viewer'), true);
      await paintViewer();
    }
    if (!liveTryon) await tryonSession?.stop();
  }
  catch (error) {
    console.error('ND336 Try-On stop failed', error);
    if (applied) desired = { ...applied };
    showError('Exit AR before changing this selection, then try again.');
    if (fading) await fadeViewer($('viewer'), false);
    finishSceneUpdate();
    tryonResuming = false; busy = false; render(); return;
  }
  try {
    // Serialize SDK calls; rapid clicks settle on the latest complete selection.
    while (!applied || JSON.stringify(applied) !== JSON.stringify(desired)) {
      if (!fading && !liveTryon && needsModelTransition(applied, desired)) {
        fading = true;
        await fadeViewer($('viewer'), true);
        await paintViewer();
      }
      const target = { ...desired };
      const restoreView = applied && !resumeView ? captureView(viewer) : () => {};
      const enteringRest = target.pose === 'flat' && applied?.pose !== 'flat';
      const {ring} = resolveSelection(catalog,target);
      const ringChanged = loadedRing !== ring.variation;
      // Material-only changes must retain the resting transform and view.
      if (ringChanged || target.pose !== ringPose.current) {
        shadowsChanged = ringPose.restore() || shadowsChanged;
      }
      shadowsChanged ||= ringChanged || needsModelTransition(applied, target);
      if (ringChanged) {
        applyRenderProfile(viewer, profile, selectedQuality);
        modelResources?.cleanup();
        modelResources?.beginLoad();
        releaseDiamondCuts(viewer);
        capturesReleased = true;
      }
      if (ringChanged) {
        const model = await ringComponent.applyVariation(ring.variation,true);
        if (!model) throw new Error('Ring download failed.');
        loadedRing = ring.variation;
      }
      // Presets initialize the diamonds; restore the independently chosen gold afterward.
      if (ringChanged || !applied || applied.headGold !== target.headGold) await applyGold('headGold',target.headGold);
      if (ringChanged || !applied || applied.ringGold !== target.ringGold) await applyGold('ringGold',target.ringGold);
      if (ringChanged) {
        refreshDiamondCuts(viewer, profile);
        capturesReleased = false;
      }
      if (target.pose === 'flat' && ringPose.current !== 'flat') ringPose.apply('flat');
      if (ringChanged) {
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
    console.error('ND336 selection failed',error);
    modelResources?.endLoad();
    modelResources?.cleanup();
    if (capturesReleased) {
      try { refreshDiamondCuts(viewer, profile); }
      catch (captureError) { console.warn('ND336 diamond recovery failed', captureError); }
    }
    ringPose.restore();
    desired.pose = 'upright';
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
      console.warn('ND336 shadow refresh failed', error);
    }
    try {
      if (liveTryon && !(applied && tryonSession.attach(window.ijewelViewer, resumeView))) {
        // Live swap failed: fall back to restarting AR on the same camera side.
        liveTryon = false;
        try { await tryonSession.stop(); } catch (stopError) { console.warn('Try-On restart after live swap failed', stopError); }
      }
      if (!liveTryon && resumeView && applied && resumeGeneration === tryonGeneration && !document.hidden) {
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
  ringComponent = plugin?.getComponent('Ring');
  materials = viewer?.getPluginByType('MaterialConfiguratorPlugin');
  if (!ringComponent?.variations?.length || !materials?.variations?.length) return;
  initializing = true;
  try {
    catalog = createCatalog(ringComponent.variations);
    // Keep background and ground rendering consistent with the saved iJewel scene.
    groups.headGold = groupFor('head gold','metal01'); groups.ringGold = groupFor('shank gold','metal02');
    if (!groups.headGold || !groups.ringGold) throw new Error('The saved head and shank gold controls are missing.');
    const presets = viewer.getPluginByType('MaterialPresetPlugin');
    if (presets?.mapping) {
      // Saved configurator references are not downloadable material URLs.
      presets.mapping = presets.mapping.filter(entry=>!/(?:^|\/)MaterialConfiguratorPlugin:\d+$/.test(entry.path || ''));
    }
    for (const key of ['headGold','ringGold']) for (const color of COLORS) if (!groups[key] || !materialFor(groups[key],color)) throw new Error(`Missing ${key} ${color}`);
    modelResources = manageModelResources(viewer, [ringComponent]);
    ready = true; clearTimeout(startupTimeout); render(); await drain(); $('startup').hidden = true;
  } catch (error) {
    console.error('ND336 setup failed',error);
    $('startup-text').textContent = 'ND336 is not available yet.';
    $('startup').querySelector('.spinner').hidden = true;
    showError(`Could not prepare ND336. ${error.message}`);
  } finally { initializing = false; }
}
$('retry').addEventListener('click',()=> ready ? drain() : location.reload());
for (const button of qualityButtons) button.addEventListener('click', () => {
  if (!viewer || busy || tryonLoading || tryonSession?.phase !== 'idle') return;
  selectedQuality = Number(button.dataset.quality);
  viewer.renderer.displayCanvasScaling = selectedQuality;
  try { localStorage.setItem('nd336-render-quality', String(selectedQuality)); } catch {}
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
let preTryonView = null;
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
    // Remember the studio camera so it can come back after AR.
    if (!resumeView) preTryonView = captureView(viewer);
    if (!resumeView) await tryon.fromJSON({ ...savedTryonConfig, type: window.ij_vto.RingTryonPlugin.PluginType });
    if (cancelled()) return;
    if (ringPose.restore()) {
      desired.pose = 'upright';
      if (applied) applied.pose = 'upright';
      refreshSceneShadows(viewer);
    }
    prepared = tryonSession.prepare(window.ijewelViewer, tryon);
    await tryon.start();
    if (cancelled()) { await tryonSession.stop(); prepared.restore(); return; }
    if (!tryon.running) {
      prepared.restore();
      showTryonError('Try-On could not start. Check camera access and try again.');
    } else {
      tryon.finger = $('finger').value;
      await tryonSession.restoreView(resumeView);
    }
  } catch (error) {
    try { await tryonSession?.stop(); }
    catch (stopError) { console.warn('ND336 Try-On recovery failed', stopError); }
    prepared?.restore();
    console.error('ND336 Try-On failed', error);
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
  try { await tryonSession.flipCamera(); }
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
  } catch (error) { console.warn('ND336 Try-On configuration could not be read', error); }
}, { once: true });
window.addEventListener('ijewel-scene-ready',()=> { sceneReady = true; setup(); },{once:true});
window.addEventListener('ijewel-viewer-ready',({detail})=> {
  viewer = detail.viewer;
  ringPose = manageRingPose(viewer, window);
  tryonSession = manageTryonSession(viewer, {
    touchDevice: Boolean(profile.maxRenderScale), onChange: render,
    // After an AR session with live ring swaps: rebuild diamonds, shadows and the studio view.
    onRestored: () => {
      if (busy || !ready) return;
      try { refreshDiamondCuts(viewer, profile); } catch (error) { console.warn('Diamond refresh after AR failed', error); }
      refreshSceneShadows(viewer);
      if (preTryonView) preTryonView(); else centerView(viewer);
      render();
    }
  });
  viewer.getPluginByType('RingConfigurator')?.addEventListener('componentProcessed',setup);
  viewer.getPluginByType('MaterialConfiguratorPlugin')?.addEventListener('refreshUi',setup);
  setup();
},{once:true});
function stopBackgroundTryon() {
  tryonGeneration++;
  tryonSession?.stop().catch(error => console.warn('ND336 background Try-On stop failed', error));
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopBackgroundTryon();
});
window.addEventListener('pagehide', stopBackgroundTryon);
const startupTimeout = setTimeout(()=> {
  if (!ready) { $('startup-text').textContent = 'ND336 is taking longer than expected.'; showError('The 3D project could not finish loading. Check your connection and try again.'); }
},90000);
// Start on the default ring directly, so the first visit downloads one model instead of two.
function preselectRing(project) {
  const ring = project.plugins?.RingConfigurator?.components?.find(component => component.name === 'Ring');
  const index = ring?.variations?.findIndex(variation => {
    const item = parseRing(variation);
    return item && item.shape === desired.shape && item.carat === desired.carat && (item.orientation || 'ns') === (desired.orientation || 'ns');
  }) ?? -1;
  if (index >= 0) ring.selectedIndex = index;
}
async function start() {
  try {
    if (!window.ijewelViewer) throw new Error('The 3D viewer could not be downloaded.');
    const response = await fetch('./project.json?v=2', {cache:'no-store'});
    if (!response.ok) throw new Error('ND336 scene could not be loaded.');
    const baseline = await response.json();
    const savedResponse = await fetch(`https://amikob.ijewel3d.com/api/raw/v1/files/view/${PROJECT_ID}?select=id,name,file,config`, {cache:'no-store'});
    if (!savedResponse.ok) throw new Error('The saved iJewel scene could not be loaded. Please retry.');
    const {applySavedScene} = await import('./saved-project.js?v=nd336-1');
    const project = applySavedScene(baseline, await savedResponse.json());
    preselectRing(project);
    initialCamera = project.cameraConfig;
    savedTryonConfig = project.tryonConfig;
    const miniViewer = new ijewelViewer.Viewer($('viewer'),project,{
      showConfigurator:false,showCard:false,transparentBg:false,showUiButtons:false,hideTryOn:true,hideCameraViews:true,
      useIjewelLogo:false, brandingSettings:{enable:false,showLoadingScreenLogo:false}
    });
    if (!miniViewer) throw new Error('The iJewel project must be Public before it can open here.');
  } catch(error) { clearTimeout(startupTimeout); $('startup-text').textContent = 'Unable to open ND336'; $('startup').querySelector('.spinner').hidden = true; showError(error.message); }
}
start();

function configuration() {
  const chosen = applied && catalog ? resolveSelection(catalog,applied) : null;
  const bounds = ready ? viewer.scene.getModelBounds(true, true, true) : null;
  return { ready, busy, tryon: tryonSession?.phase || 'idle', pose: ringPose?.current || 'upright', modelBounds: bounds ? {min:bounds.min.toArray(),max:bounds.max.toArray()} : null, renderScale: viewer?.renderer.displayCanvasScaling, requested: { ...desired }, displayed: applied && { ...applied }, ringFile: chosen?.ring.variation.name || null };
}
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const definitions = [
    { name:'get_nd336_diagnostics',title:'Read viewer diagnostics',description:'Read resource counts and view transforms for diagnosing repeated model changes. Does not alter the viewer.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>viewerDiagnostics(viewer,window.Cache) },
    { name:'get_nd336_configuration',title:'Read ND336 selection',description:'Read the current ND336 ring selection.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>configuration() },
    { name:'configure_nd336',title:'Configure ND336',description:'Choose a ring shape, carat, head gold, shank gold, and upright or resting pose.',inputSchema:{type:'object',properties:{shape:{type:'string',enum:SHAPES},carat:{type:'integer',minimum:1,maximum:5},orientation:{type:'string',enum:['ns','ew']},headGold:{type:'string',enum:COLORS},ringGold:{type:'string',enum:COLORS},pose:{type:'string',enum:POSES}},additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=> {
      if (!ready) throw new Error('ND336 is not ready.');
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
