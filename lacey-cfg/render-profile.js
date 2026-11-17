export function renderProfile(touchDevice) {
  return touchDevice ? { maxNormalMapRes: 256, maxRenderScale: 1.5 } : {};
}

export function applyRenderProfile(viewer, profile, preferredScale) {
  if ([1, 1.5, 2].includes(preferredScale)) {
    viewer.renderer.displayCanvasScaling = preferredScale;
    return;
  }
  const scale = viewer.renderer.displayCanvasScaling;
  if (profile.maxRenderScale && scale > profile.maxRenderScale) {
    viewer.renderer.displayCanvasScaling = profile.maxRenderScale;
  }
}
