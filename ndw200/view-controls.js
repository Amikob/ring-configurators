// The SDK starts a "fit to view" camera animation every time a model is imported. It only moves the camera
// on later rendered frames, so on the first load it finished AFTER our framing and put the camera back on
// its default (behind a resting ring). Cancel it before the page frames the ring itself.
export async function settleCameraAnimations(viewer) {
  const views = viewer.getPluginByType('CameraViews');
  if (!views?.stopAllAnimations) return;
  try { await Promise.race([views.stopAllAnimations(), new Promise(resolve => setTimeout(resolve, 2000))]); }
  catch (error) { console.warn('Camera animation could not be stopped', error); }
}

export function captureView(viewer) {
  const view = readView(viewer);
  const restore = () => applyView(viewer, view);
  restore.view = view;
  return restore;
}

// Write a captured camera onto the current active camera (the SDK may have
// replaced the camera object during a model import). Also sync orbit-control
// target/spherical so the next controls tick cannot snap back to FRONT.
export function applyView(viewer, view) {
  if (!viewer || !view?.position || !view?.target) return;
  const camera = viewer.scene.activeCamera;
  if (!camera) return;
  try { viewer.getPluginByType('CameraViews')?.stopAllAnimations?.(); } catch (error) { /* best effort */ }
  camera.getControls()?.stopDamping?.();
  camera.setCameraOptions({
    position: view.position.slice(),
    target: view.target.slice(),
    fov: view.fov,
    zoom: view.zoom
  });
  if (camera.position?.set) camera.position.set(...view.position);
  if (camera.target?.set) camera.target.set(...view.target);
  camera.cameraObject?.position?.set?.(...view.position);
  const controls = camera.getControls?.();
  if (controls?.target?.set) controls.target.set(...view.target);
  const spherical = controls?.spherical || controls?._spherical;
  if (spherical?.setFromVector3 && controls?.target) {
    const offset = controls.target.clone();
    offset.set(
      view.position[0] - view.target[0],
      view.position[1] - view.target[1],
      view.position[2] - view.target[2]
    );
    spherical.setFromVector3(offset);
    controls.sphericalDelta?.set?.(0, 0, 0);
    controls._sphericalDelta?.set?.(0, 0, 0);
  }
  camera.positionUpdated?.(false);
  viewer.setDirty();
}

// Horizontal direction (azimuth, radians, 0 = +Z) from the ring's centre to its head (the diamonds).
// Used so a resting ring is first shown from the head side. Null when it cannot be measured.
export function headAzimuth(viewer) {
  const bounds = viewer.scene.getModelBounds(true, true, true);
  if (bounds.isEmpty()) return null;
  const center = bounds.getCenter(bounds.min.clone());
  const sum = center.clone().multiplyScalar(0);
  let count = 0;
  const point = center.clone();
  viewer.scene.modelRoot.updateMatrixWorld(true);
  viewer.scene.modelRoot.traverseVisible(node => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    if (![node.material].flat().some(material => material?.isDiamondMaterial)) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    node.geometry.boundingBox.getCenter(point).applyMatrix4(node.matrixWorld);
    sum.add(point); count++;
  });
  if (!count) return null;
  const head = sum.divideScalar(count).sub(center);
  return Math.hypot(head.x, head.z) > 1e-4 ? Math.atan2(head.x, head.z) : null;
}

function fitDistance(viewer, camera, size) {
  const object = camera.cameraObject;
  const halfFov = Math.atan(Math.tan((object.fov || 45) * Math.PI / 360) / (object.zoom || 1));
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * object.aspect));
  return size.length() * 0.5 / Math.sin(limitingFov) * 1.12;
}

// How far the camera currently is from the ring, relative to the distance that frames it exactly (1 = framed).
// Read before a pose change so the same relative zoom (including a manual zoom) can be kept afterwards.
export function zoomRatio(viewer) {
  const camera = viewer.scene.activeCamera, bounds = viewer.scene.getModelBounds(true, true, true);
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(camera.target.clone());
  const fit = fitDistance(viewer, camera, size), distance = camera.cameraObject.position.distanceTo(camera.target);
  return fit > 0 && distance > 0 ? distance / fit : null;
}

// resting: the one-time product-shot angle (head side, 20 deg above the floor), only for the very first load.
// keepRatio: after a pose change keep the camera direction (azimuth + elevation) and the user's relative zoom;
// only the target and distance follow the ring's new bounds so it stays framed.
export function centerView(viewer, { resting = false, keepRatio = null } = {}) {
  const camera = viewer.scene.activeCamera;
  camera.getControls()?.stopDamping();
  const bounds = viewer.scene.getModelBounds(true, true, true);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(camera.target.clone());
  const size = bounds.getSize(camera.target.clone());
  const direction = camera.cameraObject.position.clone().sub(camera.target).normalize();
  if (resting) {
    // If the head side cannot be measured keep the current azimuth.
    const azimuth = headAzimuth(viewer) ?? Math.atan2(direction.x, direction.z), elevation = Math.PI / 9;
    direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  }
  const object = camera.cameraObject;
  const distance = fitDistance(viewer, camera, size) * (keepRatio > 0 ? keepRatio : 1);
  camera.setCameraOptions({position:center.clone().add(direction.multiplyScalar(distance)).toArray(), target:center.toArray(), fov:object.fov, zoom:object.zoom});
  viewer.setDirty();
}

// ---- Camera hold -------------------------------------------------------------------------
// The SDK starts a "fit to view" animation when a model is imported; it can run after we restore the
// user's camera and snap the view back to the default front framing. Hold the intended camera until
// that animation dies, the person orbits, or the timeout elapses.
let viewHold = null;

export function endFrontHold() {
  if (!viewHold) return;
  viewHold.stop(); viewHold = null;
}

function startViewHold(viewer, applyWant, { maxMs } = {}) {
  endFrontHold();
  const started = performance.now();
  let lastCheck = 0, busy = false;
  const users = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
  const onUser = event => {
    if (event.type === 'keydown' || event.target?.closest?.('canvas, #viewer, #center-view')) endFrontHold();
  };
  const onFrame = () => {
    if (busy) return;
    const ar = viewer.getPluginByType?.('RingTryonPlugin');
    if (ar && (ar.running || ar._starting)) { endFrontHold(); return; }
    const now = performance.now();
    if (now - started > maxMs) { endFrontHold(); return; }
    if (now - lastCheck < 50) return;
    lastCheck = now;
    busy = true;
    try { applyWant(); } finally { busy = false; }
  };
  users.forEach(type => document.addEventListener(type, onUser, { capture: true, passive: true }));
  viewer.addEventListener('postFrame', onFrame);
  viewHold = { stop() { viewer.removeEventListener('postFrame', onFrame); users.forEach(type => document.removeEventListener(type, onUser, { capture: true })); } };
}

export function readView(viewer) {
  const camera = viewer.scene.activeCamera;
  const { fov, zoom } = camera.cameraObject;
  // Prefer the controller position/target (webgi source of truth) when present.
  const position = (camera.position?.toArray?.() || camera.cameraObject.position.toArray()).slice();
  const target = (camera.target?.toArray?.() || camera.getCameraOptions?.().target).slice();
  return { position, target, fov, zoom };
}

// Call right after the very first framing (and any portal start angle). `remeasure` false = a fixed portal angle is in force.
export function holdFrontView(viewer, { remeasure = true, maxMs = 20000 } = {}) {
  const camera = viewer.scene.activeCamera;
  let want = { position: camera.cameraObject.position.clone(), target: camera.target.clone() };
  const wantAzimuth = () => { const d = want.position.clone().sub(want.target); return Math.atan2(d.x, d.z); };
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  startViewHold(viewer, () => {
    try { viewer.getPluginByType('CameraViews')?.stopAllAnimations?.(); } catch (error) { /* best effort */ }
    const cam = viewer.scene.activeCamera, object = cam.cameraObject;
    if (remeasure) {
      const head = headAzimuth(viewer);
      if (head != null && Math.abs(wrap(head - wantAzimuth())) > 0.09) {
        centerView(viewer, { resting: true });
        want = { position: object.position.clone(), target: cam.target.clone() };
        return;
      }
    }
    const moved = object.position.distanceTo(want.position), scale = Math.max(want.position.distanceTo(want.target), 1e-6);
    if (moved > scale * 0.01 || cam.target.distanceTo(want.target) > scale * 0.01) {
      cam.getControls()?.stopDamping();
      cam.setCameraOptions({ position: want.position.toArray(), target: want.target.toArray(), fov: object.fov, zoom: object.zoom });
      viewer.setDirty();
    }
  }, { maxMs, remeasureHead: remeasure });
}

// After a variant swap (or a pose change that already chose its framing), keep the camera
// the page just set so a late SDK fit-to-view cannot snap back to the default front view.
export function holdCapturedView(viewer, restore, { maxMs = 4000 } = {}) {
  const want = (typeof restore === 'function' && restore.view)
    ? restore.view
    : (restore?.position ? restore : readView(viewer));
  if (!want?.position || !want?.target) return;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  startViewHold(viewer, () => {
    try { viewer.getPluginByType('CameraViews')?.stopAllAnimations?.(); } catch (error) { /* best effort */ }
    const now = readView(viewer);
    const scale = Math.max(dist(want.position, want.target), 1e-6);
    if (dist(now.position, want.position) > scale * 0.01 || dist(now.target, want.target) > scale * 0.01) {
      applyView(viewer, want);
    }
    if (typeof globalThis !== 'undefined') {
      globalThis.__ndwView = { ...readView(viewer), pose: globalThis.__ndwView?.pose };
    }
  }, { maxMs });
}
