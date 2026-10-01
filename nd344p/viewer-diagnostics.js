export function viewerDiagnostics(viewer, cache) {
  const manager = viewer?.getManager();
  const info = viewer?.renderer.rendererObject?.info;
  const camera = viewer?.scene.activeCamera;
  const model = viewer?.scene.modelRoot;
  const controls = camera?.getControls();
  let meshes = 0;
  model?.traverse(node => { if (node.isMesh) meshes++; });
  return {
    meshes,
    geometries: info?.memory.geometries,
    textures: info?.memory.textures,
    programs: info?.programs?.length,
    materials: manager?.materials?.getAllMaterials().length,
    importedAssets: manager?.importer?.cachedAssets.length,
    cachedFiles: Object.keys(cache?.files || {}).length,
    cachedFileBytes: Object.values(cache?.files || {}).reduce((sum, file) => sum + (file?.byteLength || file?.size || 0), 0),
    cameraPosition: camera?.cameraObject.getWorldPosition(model.position.clone()).toArray(),
    cameraTarget: camera?.target.toArray(),
    cameraLimits: controls && {minPolar:controls.minPolarAngle,maxPolar:controls.maxPolarAngle,minDistance:controls.minDistance,maxDistance:controls.maxDistance},
    modelQuaternion: model?.quaternion.toArray()
  };
}
