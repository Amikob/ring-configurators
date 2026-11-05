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

// The loading screen may only go away when the first visible frame is final-looking:
//  1. every visible stone has its normal map (the SDK captures it during the first frame drawn after the stones are prepared,
//     so that frame shows the stones unshaded = metallic),
//  2. no texture of any visible material is still loading (metal/diamond maps),
//  3. the progressive renderer has accumulated enough frames. Its first frames after a scene change blend the new image into an
//     empty (white) history, so the ring looks pale/grey without gold for the first ~10 frames and only then reaches its metals,
//  4. all of the above held on two consecutive frames.
// Gives up after timeoutMs so the page never hangs; resolves immediately when there is no model.
const MIN_PROGRESSIVE_FRAMES = 16;
const textureLoaded = texture => {
  if (!texture || texture.isRenderTargetTexture) return true;
  if (texture.isCompressedTexture || texture.isDataTexture || texture.isCubeTexture) return Boolean(texture.image || texture.mipmaps?.length || texture.source?.data);
  const image = texture.image ?? texture.source?.data;
  if (!image) return false;
  if (image.complete === false) return false;
  return !(image.width === 0 && image.height === 0);
};
export function sceneReadiness(viewer) {
  let pendingGems = 0, pendingTextures = 0, metals = 0;
  viewer.scene.modelRoot.traverseVisible(object => {
    if (!object.isMesh) return;
    for (const material of [object.material].flat()) {
      if (!material) continue;
      if (material.isDiamondMaterial) { if (!material.uniforms?.tCubeMapNormals?.value) pendingGems++; }
      else metals++;
      for (const value of Object.values(material)) if (value?.isTexture && !textureLoaded(value)) pendingTextures++;
    }
  });
  const progressive = viewer.getPluginByType?.('Progressive');
  const wanted = Math.min(MIN_PROGRESSIVE_FRAMES, Number(progressive?.maxFrameCount) || MIN_PROGRESSIVE_FRAMES);
  const frames = viewer.renderer?.frameCount;
  return { pendingGems, pendingTextures, metals, frames, wanted, converged: !Number.isFinite(frames) || frames >= wanted };
}
export function whenGemsShaded(viewer, timeoutMs = 8000, convergeMs = 3000) {
  return new Promise(resolve => {
    if (!viewer?.scene?.modelRoot) { resolve(); return; }
    let stable = 0, convergeTimer = 0;
    const done = () => { clearTimeout(timer); clearTimeout(convergeTimer); viewer.removeEventListener('postFrame', check); resolve(); };
    const check = () => {
      const state = sceneReadiness(viewer);
      const loaded = state.pendingGems === 0 && state.pendingTextures === 0;
      // Slow devices draw few frames per second: once stones and textures are in, the progressive frames get their own short budget.
      if (loaded && !convergeTimer) convergeTimer = setTimeout(done, convergeMs);
      stable = loaded && state.converged ? stable + 1 : 0;
      if (stable >= 2) done();
    };
    const timer = setTimeout(() => { if (!convergeTimer) done(); }, timeoutMs); // stones/textures never arrived: give up
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
