export const POSES = ['upright', 'flat'];

export function normalizePose(selection) {
  return { ...selection, pose: selection.band === 'none' ? selection.pose : 'upright' };
}

// Presentation only: restore the imported transform before replacement or Try-On.
export function manageRingPose(viewer, { Vector3, Quaternion, Matrix4, Object3D, PosePlugin }) {
  let saved;
  const rotations = new Map();
  function stableRotation(root) {
    // The SDK hull includes hidden geometry. Supply only the displayed ring,
    // borrowing geometry without allocating GPU meshes or changing the scene.
    const proxy = new Object3D();
    const signature = [];
    function collect(node) {
      if (!node.visible || node.userData?.bboxVisible === false) return;
      if (node.geometry?.attributes.position) {
        const item = new Object3D();
        item.geometry = node.geometry;
        item.matrixAutoUpdate = false;
        item.matrix.copy(node.matrixWorld);
        proxy.add(item);
        signature.push(node.geometry.uuid, node.geometry.attributes.position.version,
          ...node.matrixWorld.elements);
      }
      for (const child of node.children) collect(child);
    }
    collect(root);
    const key = signature.join(',');
    if (rotations.has(key)) return rotations.get(key).clone();
    const poses = new PosePlugin().computeStablePoses(proxy);
    if (!poses.length) throw new Error('No stable resting pose was found.');
    // Same Y-up transform used by PosePlugin.setMostStablePose (pose zero).
    // Apply it ourselves to preserve the saved ground and AR configuration.
    const transform = new Matrix4().lookAt(new Vector3(), new Vector3(0, 1, 0), new Vector3(0, 0, 1))
      .multiply(poses[0].xform.clone().invert());
    const rotation = new Quaternion().setFromRotationMatrix(transform);
    if (rotations.size >= 8) rotations.delete(rotations.keys().next().value);
    rotations.set(key, rotation.clone());
    return rotation;
  }
  function refresh() {
    viewer.scene.modelRoot.updateMatrixWorld(true);
    viewer.scene.setDirty({ sceneUpdate: true });
    viewer.getPluginByType('Ground')?.refreshTransform();
    viewer.setDirty();
  }
  function restore() {
    if (!saved) return false;
    const { root, position, quaternion } = saved;
    root.position.copy(position);
    root.quaternion.copy(quaternion);
    saved = undefined;
    refresh();
    return true;
  }
  function apply(pose) {
    if (!POSES.includes(pose)) throw new Error('Unknown ring pose.');
    restore();
    if (pose === 'upright') return;
    const root = viewer.scene.modelRoot;
    root.updateWorldMatrix(true, true);
    const bounds = viewer.scene.getModelBounds(true, true, true);
    if (bounds.isEmpty()) throw new Error('The ring is not ready to pose.');
    const center = bounds.getCenter(new Vector3());
    saved = { root, position: root.position.clone(), quaternion: root.quaternion.clone() };
    try {
      const parentRotation = root.parent?.getWorldQuaternion(new Quaternion()) || new Quaternion();
      const resting = stableRotation(root);
      if (root.getWorldQuaternion) {
        // Use the model's fixed forward direction, never the current camera.
        // Orbiting then replacing a ring must not turn its head toward us.
        const head = new Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(new Quaternion())).applyQuaternion(resting);
        const view = new Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new Quaternion()));
        if (Math.hypot(head.x, head.z) > 0.001 && Math.hypot(view.x, view.z) > 0.001) {
          const yaw = Math.atan2(view.x, view.z) - Math.atan2(head.x, head.z);
          resting.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
        }
      }
      const rotation = parentRotation.clone().invert()
        .multiply(resting)
        .multiply(parentRotation);
      root.quaternion.premultiply(rotation);
      root.updateWorldMatrix(true, true);
      const rotated = viewer.scene.getModelBounds(true, true, true);
      const nextCenter = rotated.getCenter(new Vector3());
      const ground = viewer.getPluginByType('Ground');
      // An automatic ground follows the model. A fixed ground retains its height.
      if (ground?.enabled && !ground.autoAdjustTransform) center.y = nextCenter.y + bounds.min.y - rotated.min.y;
      if (root.parent) {
        root.parent.worldToLocal(center);
        root.parent.worldToLocal(nextCenter);
      }
      root.position.add(center.sub(nextCenter));
      refresh();
    } catch (error) { restore(); throw error; }
  }
  return { apply, restore, get current() { return saved ? 'flat' : 'upright'; } };
}
