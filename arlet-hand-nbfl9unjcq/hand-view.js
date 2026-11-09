// TEST ONLY: static hand under the configurator ring. Not used by any live page.
// The hand is fitted to the ring automatically for every shape and carat:
//  - finger axis = the ring's thinnest horizontal extent (the finger hole axis)
//  - finger centre = centre of the largest empty circle in the ring's cross-section (the hole)
//  - hand scale = ring inner radius / measured finger radius (snug fit)
// Hand data (glTF Y-up metres, frame 1 of the official iJewel3D hand, f_ring.01.L proximal phalanx):
const ANCHOR = {
  center: [-0.01708476059138775, 0.23979872465133667, 0.0029412354342639446],
  axis: [-0.12544383108615875, 0.8689600229263306, -0.47871944308280945],
  dorsal: [-0.33606773614883423, 0.41678428649902344, 0.8446001410484314],
  radius: 0.00793445778033209
};
const STORAGE_KEY = 'arlet-hand-scene-v1';
export const BUILTIN = {
  version: 1,
  hand: { offsetMm: [0, 0, 0], rotationDeg: [0, 0, 0], rollDeg: 0, scale: 1, fit: 0.95, alongMm: 0, tipDirection: -1 },
  skin: { color: '#e3d3c9', roughness: 1, metalness: 0.29, normalStrength: 1, sheen: 0.25, sheenColor: '#ff9c8a' },
  nails: { color: '#c1aca5', roughness: 0.1 },
  lighting: { environmentIntensity: 1, environmentRotationDeg: 0, exposure: 1, background: '#ffffff' },
  camera: null,
  shadows: { ground: false, groundOffsetMm: 0, contactShadows: false }
};
const clone = value => JSON.parse(JSON.stringify(value));
function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) merge(base[key], value);
    else if (key in base || key === 'camera') base[key] = clone(value);
  }
  return base;
}

export function createHandView(viewer, W = window) {
  const { Vector3, Quaternion, Matrix4, Object3D, Color } = W;
  let settings = clone(BUILTIN), fileSettings = clone(BUILTIN);
  let pivot, handRoot, skinMaterials = [], nailMaterials = [], frame = null, gui = null;
  const listeners = new Set();

  async function load(url = './assets/hand.glb', settingsUrl = './hand-scene.json') {
    try {
      const response = await fetch(settingsUrl, { cache: 'no-cache' });
      if (response.ok) fileSettings = merge(clone(BUILTIN), await response.json());
    } catch (error) { console.warn('hand-scene.json not loaded, using built-in defaults', error); }
    settings = clone(fileSettings);
    try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (saved) merge(settings, saved); } catch {}
    const imported = await viewer.getManager().importer.importSinglePath(url);
    const asset = Array.isArray(imported) ? imported[0] : imported;
    handRoot = asset?.modelObject || asset?._modelObject || (asset?.isObject3D ? asset : null);
    if (!handRoot) throw new Error('The hand model could not load.');
    handRoot.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    pivot = new Object3D();
    pivot.name = 'HandPivot';
    pivot.add(handRoot);
    viewer.scene.modelRoot.parent.add(pivot);
    applyAll();
    return api;
  }

  // Ring frame in world space from the visible ring meshes.
  function ringFrame() {
    const root = viewer.scene.modelRoot;
    root.updateWorldMatrix(true, true);
    const points = [];
    const P = new Vector3();
    root.traverseVisible(node => {
      const position = node.geometry?.attributes?.position;
      if (!node.isMesh || !position) return;
      const step = Math.max(1, Math.floor(position.count / 20000));
      for (let i = 0; i < position.count; i += step) points.push(P.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld).clone());
    });
    if (!points.length) return null;
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const p of points) { min.min(p); max.max(p); }
    const size = max.clone().sub(min);
    const alongX = size.x < size.z;
    const axis = alongX ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    // Cross-section coordinates: u = other horizontal axis, v = up.
    const us = new Float64Array(points.length), vs = new Float64Array(points.length);
    points.forEach((p, i) => { us[i] = alongX ? p.z : p.x; vs[i] = p.y; });
    const uMin = alongX ? min.z : min.x, uMax = alongX ? max.z : max.x;
    const clearance = (u, v) => {
      // The circle must stay inside the ring silhouette box.
      let best = Math.min(u - uMin, uMax - u, v - min.y, max.y - v);
      for (let i = 0; i < us.length; i++) {
        const du = us[i] - u, dv = vs[i] - v;
        const d = du * du + dv * dv;
        if (d < best * best) best = Math.sqrt(d);
      }
      return best;
    };
    let bestU = (uMin + uMax) / 2, bestV = min.y + (uMax - uMin) / 2, bestR = -1;
    let spanU = (uMax - uMin) / 2, spanV = size.y / 2;
    for (let pass = 0; pass < 4; pass++) {
      const cu = bestU, cv = pass ? bestV : (min.y + max.y) / 2;
      for (let a = -8; a <= 8; a++) for (let b = -8; b <= 8; b++) {
        const u = cu + spanU * a / 8, v = cv + spanV * b / 8;
        if (u <= uMin || u >= uMax || v <= min.y || v >= max.y) continue;
        const r = clearance(u, v);
        if (r > bestR) { bestR = r; bestU = u; bestV = v; }
      }
      spanU /= 4; spanV /= 4;
    }
    const along = alongX ? (min.x + max.x) / 2 : (min.z + max.z) / 2;
    const center = alongX ? new Vector3(along, bestV, bestU) : new Vector3(bestU, bestV, along);
    const mmToWorld = root.getWorldScale(new Vector3()).x;
    return { center, axis, innerRadius: bestR, mmToWorld, width: alongX ? size.x : size.z };
  }

  function fit() {
    if (!pivot) return null;
    frame = ringFrame();
    if (!frame) return null;
    const h = settings.hand;
    const tip = frame.axis.clone().multiplyScalar(h.tipDirection >= 0 ? 1 : -1);
    const up = new Vector3(0, 1, 0);
    const side = new Vector3().crossVectors(tip, up).normalize();
    const a = new Vector3(...ANCHOR.axis).normalize();
    const d = new Vector3(...ANCHOR.dorsal).normalize();
    const s = new Vector3().crossVectors(a, d).normalize();
    // Basis change: hand (a, d, a x d) -> world (tip, up, tip x up).
    const from = new Matrix4().makeBasis(a, d, s);
    const to = new Matrix4().makeBasis(tip, up, side);
    const fitRotation = new Quaternion().setFromRotationMatrix(to.multiply(from.invert()));
    const roll = new Quaternion().setFromAxisAngle(tip, (h.rollDeg || 0) * Math.PI / 180);
    const [rx, ry, rz] = h.rotationDeg.map(v => (v || 0) * Math.PI / 180);
    const user = new Quaternion().setFromAxisAngle(side, rx)
      .multiply(new Quaternion().setFromAxisAngle(up, ry))
      .multiply(new Quaternion().setFromAxisAngle(tip, rz));
    const scale = frame.innerRadius * h.fit * h.scale / ANCHOR.radius;
    const offset = side.clone().multiplyScalar(h.offsetMm[0] || 0)
      .add(up.clone().multiplyScalar(h.offsetMm[1] || 0))
      .add(tip.clone().multiplyScalar(h.offsetMm[2] || 0))
      .multiplyScalar(frame.mmToWorld);
    pivot.position.copy(frame.center).add(offset);
    pivot.quaternion.copy(user).multiply(roll).multiply(fitRotation);
    pivot.scale.setScalar(scale);
    // alongMm > 0 slides the ring toward the fingertip.
    const alongHand = (h.alongMm || 0) * frame.mmToWorld / scale;
    handRoot.position.set(...ANCHOR.center).negate().sub(a.clone().multiplyScalar(alongHand));
    pivot.updateMatrixWorld(true);
    viewer.scene.setDirty?.({ sceneUpdate: true });
    viewer.setDirty();
    return { center: frame.center.toArray(), innerRadiusMm: frame.innerRadius / frame.mmToWorld, handScale: scale, axis: frame.axis.toArray() };
  }

  function defaultCamera() {
    // Above the back of the hand, looking across the finger, slightly toward the fingertips.
    const f = frame || ringFrame();
    const mm = f.mmToWorld;
    const tip = f.axis.clone().multiplyScalar(settings.hand.tipDirection >= 0 ? 1 : -1);
    const side = new Vector3().crossVectors(tip, new Vector3(0, 1, 0)).normalize();
    const target = tip.clone().multiplyScalar(-8 * mm).add(new Vector3(0, -4 * mm, 0));
    const position = target.clone().add(side.clone().multiplyScalar(-70 * mm)).add(new Vector3(0, 55 * mm, 0)).add(tip.clone().multiplyScalar(-25 * mm));
    return { position: position.toArray(), target: target.toArray(), fov: 25 };
  }

  function applyCamera() {
    if (!frame) fit();
    if (!frame) return;
    const cam = settings.camera || defaultCamera();
    const camera = viewer.scene.activeCamera;
    camera.getControls()?.stopDamping?.();
    const c = frame.center;
    camera.setCameraOptions({
      position: new Vector3(...cam.position).add(c).toArray(),
      target: new Vector3(...cam.target).add(c).toArray(),
      fov: cam.fov || camera.cameraObject.fov,
      zoom: camera.cameraObject.zoom
    });
    viewer.setDirty();
  }

  function captureCamera() {
    if (!frame) fit();
    const camera = viewer.scene.activeCamera;
    const c = frame.center;
    settings.camera = {
      position: camera.cameraObject.position.clone().sub(c).toArray().map(v => Math.round(v * 1e5) / 1e5),
      target: camera.target.clone().sub(c).toArray().map(v => Math.round(v * 1e5) / 1e5),
      fov: Math.round(camera.cameraObject.fov * 10) / 10
    };
    save();
  }

  function applyMaterials() {
    const sk = settings.skin, nl = settings.nails;
    // Read the live materials each time; the viewer may swap them after import.
    skinMaterials = []; nailMaterials = [];
    handRoot?.traverse(node => {
      if (!node.isMesh) return;
      for (const material of [node.material].flat()) (/nail/i.test(node.name + ' ' + material?.name) ? nailMaterials : skinMaterials).push(material);
    });
    for (const m of skinMaterials) {
      m.color?.set(sk.color); m.roughness = sk.roughness; m.metalness = sk.metalness;
      if (m.normalScale) { m.userData.__normalSignY ??= Math.sign(m.normalScale.y) || 1; m.normalScale.set(sk.normalStrength, sk.normalStrength * m.userData.__normalSignY); }
      if ('sheen' in m) { m.sheen = sk.sheen; m.sheenColor?.set(sk.sheenColor); m.sheenRoughness = 0.6; }
      m.needsUpdate = true; m.setDirty?.();
    }
    for (const m of nailMaterials) { m.color?.set(nl.color); m.roughness = nl.roughness; m.metalness = 0; m.needsUpdate = true; m.setDirty?.(); }
  }

  function applyLighting() {
    const l = settings.lighting;
    const env = viewer.getPluginByType('SimpleBackgroundEnvUiPlugin2');
    const rotation = (l.environmentRotationDeg || 0) * Math.PI / 180;
    if (env) { env.sceneEnvironmentIntensity = l.environmentIntensity; env.sceneEnvironmentRotation = rotation; }
    else {
      viewer.scene.envMapIntensity = l.environmentIntensity;
      if (viewer.scene.environmentRotation?.isEuler) viewer.scene.environmentRotation.y = rotation;
    }
    const tonemap = viewer.getPluginByType('Tonemap');
    if (tonemap) tonemap.exposure = l.exposure;
    viewer.scene.setBackgroundColor?.(l.background);
  }

  function applyShadows() {
    const sh = settings.shadows;
    const ground = viewer.getPluginByType('Ground');
    if (ground) {
      ground.visible = Boolean(sh.ground);
      if ('yOffset' in ground) ground.yOffset = -(sh.groundOffsetMm || 0) * (frame?.mmToWorld || 0.0423);
      ground.refreshTransform?.(); ground.setDirty?.();
    }
    const contact = viewer.getPluginByType('SSContactShadows');
    if (contact) contact.enabled = Boolean(sh.contactShadows);
  }

  function applyAll({ camera = false } = {}) {
    applyMaterials(); applyLighting(); fit(); applyShadows();
    if (camera) applyCamera();
    viewer.setDirty();
    for (const fn of listeners) fn(settings);
  }

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {} }, 200);
  }
  function json() { return JSON.stringify(settings, null, 2); }

  async function openEditor() {
    if (gui) return gui;
    const { GUI } = await import('https://cdn.jsdelivr.net/npm/lil-gui@0.19.2/+esm');
    gui = new GUI({ title: 'Hand scene (test)', width: 300 });
    gui.domElement.style.zIndex = '50';
    const place = () => {
      // Sit under the ring controls so shape and gold stay clickable.
      const bottoms = ['#ring-gold', '#ring-gold-field', '.metal-fields'].map(sel => document.querySelector(sel)?.getBoundingClientRect().bottom || 0);
      const top = Math.round(Math.max(...bottoms) + 12);
      Object.assign(gui.domElement.style, { right: '8px', top: `${top}px`, maxHeight: `calc(100vh - ${top + 8}px)`, overflowY: 'auto' });
    };
    place(); setTimeout(place, 1500); window.addEventListener('resize', place);
    gui.domElement.id = 'hand-editor';
    const changed = (what) => () => { what(); save(); viewer.setDirty(); gui.controllersRecursive().forEach(c => c.updateDisplay()); };
    const refit = changed(() => { fit(); applyShadows(); });
    const h = settings.hand;
    const fh = gui.addFolder('Hand');
    const offset = { x: h.offsetMm[0], y: h.offsetMm[1], z: h.offsetMm[2] };
    const rot = { x: h.rotationDeg[0], y: h.rotationDeg[1], z: h.rotationDeg[2] };
    fh.add(offset, 'x', -60, 60, 0.1).name('Move sideways (mm)').onChange(v => { h.offsetMm[0] = v; refit(); });
    fh.add(offset, 'y', -60, 60, 0.1).name('Move up/down (mm)').onChange(v => { h.offsetMm[1] = v; refit(); });
    fh.add(offset, 'z', -60, 60, 0.1).name('Move along finger (mm)').onChange(v => { h.offsetMm[2] = v; refit(); });
    fh.add(rot, 'x', -180, 180, 0.5).name('Tilt (deg)').onChange(v => { h.rotationDeg[0] = v; refit(); });
    fh.add(rot, 'y', -180, 180, 0.5).name('Turn (deg)').onChange(v => { h.rotationDeg[1] = v; refit(); });
    fh.add(rot, 'z', -180, 180, 0.5).name('Spin (deg)').onChange(v => { h.rotationDeg[2] = v; refit(); });
    fh.add(h, 'rollDeg', -180, 180, 0.5).name('Roll around finger (deg)').onChange(refit);
    fh.add(h, 'scale', 0.7, 1.4, 0.005).name('Hand scale').onChange(refit);
    fh.add(h, 'fit', 0.8, 1.1, 0.005).name('Finger fit (snug)').onChange(refit);
    fh.add(h, 'alongMm', -20, 20, 0.1).name('Ring along finger (mm)').onChange(refit);
    fh.add(h, 'tipDirection', { 'Fingers away': -1, 'Fingers toward': 1 }).name('Finger direction').onChange(v => { h.tipDirection = Number(v); refit(); });
    const fs = gui.addFolder('Skin');
    fs.add(settings.skin, 'color', { 'Very light': '#fff6f6', Light: '#fff7f1', Medium: '#e3d3c9', Tan: '#b7a091', Dark: '#907360' }).name('Skin tone preset').onChange(changed(applyMaterials));
    fs.addColor(settings.skin, 'color').name('Skin color').onChange(changed(applyMaterials));
    fs.add(settings.skin, 'roughness', 0, 1, 0.01).name('Skin roughness').onChange(changed(applyMaterials));
    fs.add(settings.skin, 'metalness', 0, 1, 0.01).name('Skin metalness').onChange(changed(applyMaterials));
    fs.add(settings.skin, 'normalStrength', 0, 3, 0.05).name('Skin detail').onChange(changed(applyMaterials));
    fs.add(settings.skin, 'sheen', 0, 1, 0.01).name('Soft glow (sheen)').onChange(changed(applyMaterials));
    fs.addColor(settings.skin, 'sheenColor').name('Glow color').onChange(changed(applyMaterials));
    fs.addColor(settings.nails, 'color').name('Nail color').onChange(changed(applyMaterials));
    fs.add(settings.nails, 'roughness', 0, 1, 0.01).name('Nail roughness').onChange(changed(applyMaterials));
    const fl = gui.addFolder('Lighting');
    fl.add(settings.lighting, 'environmentIntensity', 0, 4, 0.01).name('Environment intensity').onChange(changed(applyLighting));
    fl.add(settings.lighting, 'environmentRotationDeg', 0, 360, 1).name('Environment rotation').onChange(changed(applyLighting));
    fl.add(settings.lighting, 'exposure', 0.1, 3, 0.01).name('Exposure').onChange(changed(applyLighting));
    fl.addColor(settings.lighting, 'background').name('Background').onChange(changed(applyLighting));
    const fc = gui.addFolder('Camera');
    const camera = viewer.scene.activeCamera;
    const camState = { fov: settings.camera?.fov || camera.cameraObject.fov };
    fc.add(camState, 'fov', 10, 60, 0.5).name('Field of view').onChange(v => {
      camera.setCameraOptions({ position: camera.cameraObject.position.toArray(), target: camera.target.toArray(), fov: v, zoom: camera.cameraObject.zoom });
      captureCamera(); viewer.setDirty();
    });
    const camPos = { x: 0, y: 0, z: 0 };
    const syncPos = () => { if (!frame) return; camState.fov = Math.round(camera.cameraObject.fov * 10) / 10; const p = camera.cameraObject.position.clone().sub(frame.center); camPos.x = p.x; camPos.y = p.y; camPos.z = p.z; for (const c of fc.controllers) c.updateDisplay(); };
    for (const k of ['x', 'y', 'z']) fc.add(camPos, k, -15, 15, 0.01).name(`Camera ${k.toUpperCase()}`).onChange(() => {
      const position = new Vector3(camPos.x, camPos.y, camPos.z).add(frame.center);
      camera.setCameraOptions({ position: position.toArray(), target: camera.target.toArray(), fov: camera.cameraObject.fov, zoom: camera.cameraObject.zoom });
      captureCamera(); viewer.setDirty();
    });
    fc.add({ use: () => { captureCamera(); camState.fov = camera.cameraObject.fov; syncPos(); } }, 'use').name('Use current camera');
    fc.add({ go: () => { applyCamera(); syncPos(); } }, 'go').name('Go to saved camera');
    fc.add({ reset: () => { settings.camera = null; save(); applyCamera(); syncPos(); } }, 'reset').name('Default camera');
    const fsh = gui.addFolder('Shadows');
    fsh.add(settings.shadows, 'ground').name('Ground + shadow').onChange(changed(applyShadows));
    fsh.add(settings.shadows, 'groundOffsetMm', 0, 80, 0.5).name('Ground lower by (mm)').onChange(changed(applyShadows));
    fsh.add(settings.shadows, 'contactShadows').name('Contact shadows').onChange(changed(applyShadows));
    const status = { text: '' };
    gui.add({ copy: async () => {
      captureCamera();
      const text = json();
      try { await navigator.clipboard.writeText(text); status.text = 'Copied'; }
      catch { window.prompt('Copy these settings:', text.replace(/\s+/g, ' ')); status.text = 'Shown'; }
      statusCtl.updateDisplay();
    } }, 'copy').name('Copy settings');
    gui.add({ download: () => {
      captureCamera();
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' })); a.download = 'hand-scene.json'; a.click();
    } }, 'download').name('Download hand-scene.json');
    gui.add({ reset: () => {
      if (!window.confirm('Reset to the saved file defaults?')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      location.reload();
    } }, 'reset').name('Reset to file defaults');
    const statusCtl = gui.add(status, 'text').name('Status').disable();
    viewer.scene.activeCamera.getControls?.()?.addEventListener?.('end', syncPos);
    setTimeout(syncPos, 500);
    return gui;
  }

  const api = { load, fit, applyCamera, captureCamera, applyAll, openEditor, json, get settings() { return settings; }, get frame() { return frame; }, get pivot() { return pivot; }, onChange: fn => listeners.add(fn) };
  return api;
}
