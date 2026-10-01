const UPDATE_KEY = 'arlet-selection';

export function beginSceneUpdate(viewer) {
  const fade = viewer.getPluginByType('FrameFade');
  // The page owns selection fades; blending the SDK's old frame creates ghosts.
  fade?.disable(UPDATE_KEY);
  fade?.stopTransition();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fade?.stopTransition();
    fade?.enable(UPDATE_KEY);
  };
}

export function refreshSceneShadows(viewer) {
  const ground = viewer.getPluginByType('Ground');
  // Component visibility changes do not emit the geometry event used by auto-bake.
  if (ground?.enabled && ground.bakedShadows) ground.bakeShadows();
  viewer.renderer.resetShadows();
  viewer.setDirty();
}
