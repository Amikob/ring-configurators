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

export function centerView(viewer, { resting = false } = {}) {
  const camera = viewer.scene.activeCamera;
  camera.getControls()?.stopDamping();
  const bounds = viewer.scene.getModelBounds(true, true, true);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(camera.target.clone());
  const size = bounds.getSize(camera.target.clone());
  const direction = camera.cameraObject.position.clone().sub(camera.target).normalize();
  if (resting) {
    // Keep the current azimuth, with a gentle floor-level presentation angle.
    const azimuth = Math.atan2(direction.x, direction.z), elevation = Math.PI / 6;
    direction.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation));
  }
  const object = camera.cameraObject;
  const halfFov = Math.atan(Math.tan((object.fov || 45) * Math.PI / 360) / (object.zoom || 1));
  const limitingFov = Math.min(halfFov, Math.atan(Math.tan(halfFov) * object.aspect));
  const distance = size.length() * 0.5 / Math.sin(limitingFov) * 1.12;
  camera.setCameraOptions({position:center.clone().add(direction.multiplyScalar(distance)).toArray(), target:center.toArray(), fov:object.fov, zoom:object.zoom});
  viewer.setDirty();
}
