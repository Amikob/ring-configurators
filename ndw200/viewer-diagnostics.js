export function viewerDiagnostics(viewer, cache) {
  const manager = viewer?.getManager();
  const info = viewer?.renderer.rendererObject?.info;
  const camera = viewer?.scene.activeCamera;
  const model = viewer?.scene.modelRoot;
  const controls = camera?.getControls();
  let meshes = 0;
  const modelMaterials = new Map();
  model?.traverse(node => { if (node.isMesh) meshes++; });
  model?.traverse(node => {
    if (!node.isMesh) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      modelMaterials.set(material.uuid, {
        name: material.name,
        type: material.type,
        diamond: Boolean(material.isDiamondMaterial),
        color: material.color?.getHexString?.(),
        nodeName: node.name,
        layerName: node.userData?.rhinoLayer?.name
      });
    }
  });
  return {
    meshes,
    geometries: info?.memory.geometries,
    textures: info?.memory.textures,
    programs: info?.programs?.length,
    materials: manager?.materials?.getAllMaterials().length,
    modelMaterials: [...modelMaterials.values()],
    materialGroups: viewer?.getPluginByType('MaterialConfiguratorPlugin')?.variations?.map(group => ({
      uuid: group.uuid, title: group.title, regex: group.regex, selectedIndex: group.selectedIndex,
      materials: group.materials?.map(material => ({name:material.name, label:material.userData?.label, uuid:material.uuid}))
    })),
    importedAssets: manager?.importer?.cachedAssets.length,
    cachedFiles: Object.keys(cache?.files || {}).length,
    cachedFileBytes: Object.values(cache?.files || {}).reduce((sum, file) => sum + (file?.byteLength || file?.size || 0), 0),
    cameraPosition: camera?.cameraObject.getWorldPosition(model.position.clone()).toArray(),
    cameraTarget: camera?.target.toArray(),
    cameraLimits: controls && {minPolar:controls.minPolarAngle,maxPolar:controls.maxPolarAngle,minDistance:controls.minDistance,maxDistance:controls.maxDistance},
    modelQuaternion: model?.quaternion.toArray()
  };
}
