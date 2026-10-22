export const POSES = ['upright', 'flat'];

export function normalizePose(selection) {
  // Ring-only and ring+band sets can both rest on the floor.
  return { ...selection, pose: POSES.includes(selection.pose) ? selection.pose : 'upright' };
}

// Presentation only: restore the imported transform before replacement or Try-On.
export function manageRingPose(viewer, { Vector3, Quaternion, Matrix4, Object3D, PosePlugin, Box3 }) {
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
  function apply(pose, options = {}) {
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
      let resting;
      if (options.band) {
        // Ring+band set lies like a set dropped on a table: finger-hole axis
        // vertical, band stacked on top of the ring, head pointing sideways.
        // The finger axis is the thinnest horizontal extent of the upright set.
        const size = bounds.getSize(new Vector3());
        const axis = size.x < size.z ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
        let side = 1;
        const band = [options.band, options.band?.modelObject, options.band?.object, options.band?.scene, options.band?.model]
          .find(o => o?.isObject3D);
        if (Box3 && band) {
          const bandBox = new Box3().setFromObject(band);
          if (!bandBox.isEmpty()) side = bandBox.getCenter(new Vector3()).dot(axis) >= center.dot(axis) ? 1 : -1;
        }
        resting = new Quaternion().setFromUnitVectors(axis.multiplyScalar(side), new Vector3(0, 1, 0));
      } else resting = stableRotation(root);
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
      if (options.band) {
        // A set lying on its side rests on the head edge AND the shank, like a
        // ring dropped on a table. Tip it about the horizontal axis across the
        // head until the shank side touches the same floor plane as the head.
        const h = new Vector3(0, 1, 0).applyQuaternion(resting); h.y = 0;
        if (h.lengthSq() > 1e-6) {
          h.normalize();
          const points = [];
          const P = new Vector3();
          root.traverseVisible(node => {
            const position = node.geometry?.attributes?.position;
            if (!position || node.userData?.bboxVisible === false) return;
            const step = Math.max(1, Math.floor(position.count / 20000));
            for (let i = 0; i < position.count; i += step) points.push(P.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld).clone());
          });
          // Rock about the horizontal axis across the head until the centre
          // of the set lies between two floor contacts (head edge + shank).
          const up = new Vector3(0, 1, 0);
          const total = new Quaternion();
          const centre = new Vector3();
          for (const point of points) centre.add(point);
          centre.divideScalar(points.length || 1);
          for (let pass = 0; pass < 16 && points.length; pass++) {
            let minY = Infinity;
            for (const point of points) minY = Math.min(minY, point.y);
            const floor = points.filter(point => point.y - minY < 1e-5);
            const along = point => point.clone().sub(centre).dot(h);
            const lo = Math.min(...floor.map(along)), hi = Math.max(...floor.map(along));
            // Stable once the floor contacts surround the centre.
            if (lo <= 0 && hi >= 0) break;
            const dir = h.clone().multiplyScalar(hi < 0 ? 1 : -1);
            let low = floor[0];
            for (const point of floor) if (point.clone().sub(low).dot(dir) > 0) low = point;
            const offset = centre.clone().sub(low).dot(dir);
            let tilt = Infinity, reach = 0;
            for (const point of points) {
              const d = point.clone().sub(low).dot(dir);
              if (d > 1e-6) {
                const angle = Math.atan2(point.y - low.y, d);
                if (angle < tilt) { tilt = angle; reach = d; }
              }
            }
            if (!Number.isFinite(tilt) || tilt <= 1e-5) break;
            const step = new Quaternion().setFromAxisAngle(new Vector3().crossVectors(up, dir).normalize(), tilt);
            for (const point of points) point.applyQuaternion(step);
            centre.applyQuaternion(step);
            total.premultiply(step);
          }
          const tiltDeg = 2 * Math.acos(Math.min(1, Math.abs(total.w))) * 180 / Math.PI;
          if (tiltDeg < 60) {
            root.quaternion.premultiply(parentRotation.clone().invert().multiply(total).multiply(parentRotation));
            root.updateWorldMatrix(true, true);
          }
        }
      }
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
