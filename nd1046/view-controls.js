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

export function centerView(viewer, { resting = false } = {}) {
  const camera = viewer.scene.activeCamera;
  camera.getControls()?.stopDamping();
  const bounds = viewer.scene.getModelBounds(true, true, true);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(camera.target.clone());
  const size = bounds.getSize(camera.target.clone());
  const direction = camera.cameraObject.position.clone().sub(camera.target).normalize();
  if (resting) {
    // Product-shot angle: look at the ring from its head side (stone facing the camera), a little above
    // the floor. If the head side cannot be measured keep the current azimuth.
    const azimuth = headAzimuth(viewer) ?? Math.atan2(direction.x, direction.z), elevation = Math.PI / 9;
    direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  }
  const object = camera.cameraObject;
  const halfFov = Math.atan(Math.tan((object.fov || 45) * Math.PI / 360) / (object.zoom || 1));
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * object.aspect));
  const distance = size.length() * 0.5 / Math.sin(limitingFov) * 1.12;
  camera.setCameraOptions({position:center.clone().add(direction.multiplyScalar(distance)).toArray(), target:center.toArray(), fov:object.fov, zoom:object.zoom});
  viewer.setDirty();
}
