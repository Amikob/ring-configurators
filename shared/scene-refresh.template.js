const UPDATE_KEY = 'arlet-selection';

// While a selection is being built, freeze the canvas on the last frame that was
// drawn (the previous ring, in its own pose and gem materials). The new ring is
// loaded, posed, given its gold and diamond materials and framed while nothing is
// drawn, so no intermediate frame (default upright pose, unprepared metallic
// stones, camera jump) can ever reach the screen. Rendering resumes only when the
// finished assembly is complete. No fade, no overlay, nothing white.
export function holdFrame(viewer) {
  if (!viewer || Object.hasOwn(viewer, 'renderEnabled')) return () => {};
  // The SDK itself switches renderEnabled back on after each model/material load,
  // so pin the flag on this viewer instance and remember what it asked for.
  let wanted = viewer.renderEnabled;
  Object.defineProperty(viewer, 'renderEnabled', {
    configurable: true, enumerable: true,
    get: () => false,
    set: value => { wanted = value; }
  });
  let released = false;
  // Safety net: never leave the canvas frozen if a load stalls.
  const watchdog = setTimeout(() => release(), 60000);
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(watchdog);
    delete viewer.renderEnabled;
    viewer.renderEnabled = wanted !== false;
    viewer.setDirty();
  };
  return release;
}

export function beginSceneUpdate(viewer, { hold = false } = {}) {
  const fade = viewer.getPluginByType('FrameFade');
  // The page owns selection fades; blending the SDK's old frame creates ghosts.
  fade?.disable(UPDATE_KEY);
  fade?.stopTransition();
  const releaseFrame = hold ? holdFrame(viewer) : () => {};
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseFrame();
    fade?.stopTransition();
    fade?.enable(UPDATE_KEY);
  };
}

// The SDK captures a diamond's normal map during the first frame drawn after the stones are
// prepared, so on the very first load that frame shows the stones unshaded (metallic). Keep the
// page's own loading screen up until a frame with every visible stone shaded has been drawn.
// Resolves immediately when nothing needs shading; gives up after timeoutMs so the page never hangs.
export function whenGemsShaded(viewer, timeoutMs = 8000) {
  const shaded = () => {
    let pending = 0;
    viewer.scene.modelRoot.traverseVisible(object => {
      if (!object.isMesh) return;
      for (const material of [object.material].flat()) {
        if (material?.isDiamondMaterial && !material.uniforms?.tCubeMapNormals?.value) pending++;
      }
    });
    return pending === 0;
  };
  return new Promise(resolve => {
    if (!viewer?.scene?.modelRoot || shaded()) { resolve(); return; }
    const done = () => { clearTimeout(timer); viewer.removeEventListener('postFrame', check); resolve(); };
    const check = () => { if (shaded()) done(); };
    const timer = setTimeout(done, timeoutMs);
    viewer.addEventListener('postFrame', check);
    viewer.setDirty();
  });
}

export function refreshSceneShadows(viewer) {
  const ground = viewer.getPluginByType('Ground');
  // Component visibility changes do not emit the geometry event used by auto-bake.
  if (ground?.enabled && ground.bakedShadows) ground.bakeShadows();
  viewer.renderer.resetShadows();
  viewer.setDirty();
}
