// Compatibility with the pinned WebGI 0.22.0 importer/material manager.
export function manageModelResources(viewer, components) {
  const manager = viewer.getManager();
  const baseline = new Set(manager.materials.getAllMaterials());
  const owned = new Set();
  let beforeLoad;
  const modelUrls = new Set(components.flatMap(c => c.variations.map(v => v.modelUrl)));
  function beginLoad() { beforeLoad = new Set(manager.materials.getAllMaterials()); }
  function endLoad() {
    if (!beforeLoad) return;
    for (const material of manager.materials.getAllMaterials()) if (!beforeLoad.has(material)) owned.add(material);
    beforeLoad = undefined;
  }
  function cleanup() {
    const protectedMaterials = new Set(baseline);
    viewer.scene.traverse(node => {
      for (const material of [node.material].flat()) if (material) protectedMaterials.add(material);
    });
    for (const group of viewer.getPluginByType('MaterialConfiguratorPlugin')?.variations || []) {
      for (const material of group.materials) protectedMaterials.add(material);
    }
    const registered = new Set(manager.materials.getAllMaterials());
    for (const material of owned) {
      if (!registered.has(material)) { owned.delete(material); continue; }
      if (protectedMaterials.has(material)) continue;
      // The imported originals are replaced by saved presets. Remove their
      // references without disposing textures shared by the current scene.
      manager.materials.unregisterMaterial(material);
      for (const value of [...Object.values(material), ...Object.values(material.userData || {})]) {
        if (value?.isTexture) value.userData?.__appliedMaterials?.delete(material);
      }
      material.dispose();
      owned.delete(material);
    }
    // Components own the active models; browser HTTP caching handles downloads.
    // Do not retain an importer entry for every previously selected GLB.
    const assets = manager.importer.cachedAssets;
    for (let i = assets.length - 1; i >= 0; i--) {
      if (modelUrls.has(assets[i].path)) assets.splice(i, 1);
    }
  }
  return { beginLoad, endLoad, cleanup };
}
