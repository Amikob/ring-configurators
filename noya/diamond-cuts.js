// Compatibility with the pinned WebGI 0.22.0 Diamond plugin.
export function releaseDiamondCuts(viewer) {
  // Release cube render targets before the SDK imports the next model. The
  // existing geometry and orientation metadata remain available for retries.
  viewer.getPluginByType('Diamond')?.disposeAllCacheMaps();
}

export function refreshDiamondCuts(viewer, { maxNormalMapRes = Infinity } = {}) {
  const diamond = viewer.getPluginByType('Diamond');
  if (!diamond?.unprepareDiamondMesh || !diamond?.prepareDiamondMesh || !diamond?.disposeAllCacheMaps) {
    throw new Error('Diamond rendering is unavailable.');
  }
  const geometries = new Map();
  viewer.scene.modelObject.traverse(mesh => {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mesh.isMesh || !mesh.geometry || !list.some(material => material?.isDiamondMaterial)) return;
    let visible = true;
    for (let node = mesh; node; node = node.parent) if (node.visible === false) visible = false;
    if (geometries.has(mesh.geometry.uuid)) {
      if (visible) Object.assign(geometries.get(mesh.geometry.uuid), {mesh, visible:true});
      return;
    }
    geometries.set(mesh.geometry.uuid, {
      mesh,
      visible,
      offsets: mesh.geometry.userData.normalsCaptureOffsets,
      normalMapRes: mesh.userData._diamondNormalMapRes,
      normalMapPrecision: mesh.userData._diamondNormalMapPrecision
    });
  });

  // Detach every active geometry before rebuilding any maps. Disposal of a
  // shared map can otherwise invalidate a newly prepared neighbouring stone.
  for (const { mesh } of geometries.values()) diamond.unprepareDiamondMesh(mesh);
  // unprepare removes textures but leaves secondary geometry aliases in 0.22.0.
  // Those aliases point at disposed textures and make diamonds look metallic.
  diamond.disposeAllCacheMaps();
  for (const [uuid, { mesh, visible, offsets, normalMapRes, normalMapPrecision }] of geometries) {
    // Preserve the SDK's orientation and any one-time mirrored-normal correction.
    if (offsets) mesh.geometry.userData.normalsCaptureOffsets = offsets;
    if (!visible) {
      mesh.userData._diamondNormalMapRes = normalMapRes;
      mesh.userData._diamondNormalMapPrecision = normalMapPrecision;
      continue;
    }
    diamond.prepareDiamondMesh(mesh, {
      cacheKey: uuid,
      normalMapRes: Number.isFinite(maxNormalMapRes) ? Math.min(normalMapRes || 512, maxNormalMapRes) : normalMapRes,
      normalMapPrecision
    });
  }
  viewer.setDirty();
}
