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
  const camera = viewer.scene.activeCamera;
  const position = camera.cameraObject.position.clone(), target = camera.target.clone();
  const {fov, zoom} = camera.cameraObject;
  return () => {
    camera.getControls()?.stopDamping();
    camera.setCameraOptions({position:position.toArray(), target:target.toArray(), fov, zoom});
    viewer.setDirty();
  };
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

// ---- First-load front-view guard -------------------------------------------------------------------------
// On some devices (iOS Safari, slow GPUs) something can still move the camera after the page framed the ring:
// the SDK's fit-to-view animation, or a head measurement taken before the stones were ready (which falls back
// to the default camera azimuth = the ring seen from behind). Until the person first touches the canvas, or the
// ring/pose changes, or 20 s pass, keep the camera on the intended first view and re-measure the head side.
let frontHold = null;

export function endFrontHold() {
  if (!frontHold) return;
  frontHold.stop(); frontHold = null;
}

// Call right after the very first framing (and any portal start angle). `remeasure` false = a fixed portal angle is in force.
export function holdFrontView(viewer, { remeasure = true, maxMs = 20000 } = {}) {
  endFrontHold();
  const camera = viewer.scene.activeCamera;
  let want = { position: camera.cameraObject.position.clone(), target: camera.target.clone() };
  const wantAzimuth = () => { const d = want.position.clone().sub(want.target); return Math.atan2(d.x, d.z); };
  const started = performance.now();
  let lastCheck = 0, busy = false;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const apply = () => {
    const cam = viewer.scene.activeCamera, object = cam.cameraObject;
    try { viewer.getPluginByType('CameraViews')?.stopAllAnimations?.(); } catch (error) { /* best effort */ }
    cam.getControls()?.stopDamping();
    cam.setCameraOptions({ position: want.position.toArray(), target: want.target.toArray(), fov: object.fov, zoom: object.zoom });
    viewer.setDirty();
  };
  const onFrame = () => {
    if (busy) return;
    const now = performance.now();
    if (now - started > maxMs) { endFrontHold(); return; }
    if (now - lastCheck < 150) return;
    lastCheck = now;
    const cam = viewer.scene.activeCamera, object = cam.cameraObject;
    if (remeasure) {
      const head = headAzimuth(viewer);
      if (head != null && Math.abs(wrap(head - wantAzimuth())) > 0.09) {  // head side was unknown or wrong (> ~5 deg)
        busy = true; try { centerView(viewer, { resting: true }); want = { position: object.position.clone(), target: cam.target.clone() }; } finally { busy = false; }
        return;
      }
    }
    const moved = object.position.distanceTo(want.position), scale = Math.max(want.position.distanceTo(want.target), 1e-6);
    if (moved > scale * 0.01 || cam.target.distanceTo(want.target) > scale * 0.01) { busy = true; try { apply(); } finally { busy = false; } }
  };
  const users = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
  const onUser = event => { if (event.type === 'keydown' || event.target?.closest?.('canvas, #viewer')) endFrontHold(); };
  users.forEach(type => document.addEventListener(type, onUser, { capture: true, passive: true }));
  viewer.addEventListener('postFrame', onFrame);
  frontHold = { stop() { viewer.removeEventListener('postFrame', onFrame); users.forEach(type => document.removeEventListener(type, onUser, { capture: true })); } };
}
