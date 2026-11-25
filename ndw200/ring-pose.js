export const POSES = ['upright', 'flat'];

export function normalizePose(selection) {
  // Ring-only and ring+band sets can both rest on the floor.
  return { ...selection, pose: POSES.includes(selection.pose) ? selection.pose : 'upright' };
}

// Presentation only: restore the imported transform before replacement or Try-On.
export function manageRingPose(viewer, { Vector3, Quaternion, Matrix4, Object3D, PosePlugin, Box3 }) {
  let saved;
  const rotations = new Map();
  // Convert a PosePlugin entry to the same Y-up resting quaternion used by
  // PosePlugin.setMostStablePose.
  function poseQuaternion(pose) {
    return new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(new Vector3(), new Vector3(0, 1, 0), new Vector3(0, 0, 1))
        .multiply(pose.xform.clone().invert())
    );
  }
  // World AABB after a candidate resting rotation, sampled from the displayed proxy.
  function measurePose(pose, proxy) {
    const q = poseQuaternion(pose);
    const box = new Box3();
    const v = new Vector3();
    for (const node of proxy.children) {
      const position = node.geometry?.attributes?.position;
      if (!position) continue;
      const step = Math.max(1, Math.floor(position.count / 8000));
      for (let i = 0; i < position.count; i += step) {
        v.fromBufferAttribute(position, i).applyMatrix4(node.matrix).applyQuaternion(q);
        box.expandByPoint(v);
      }
    }
    if (box.isEmpty()) return null;
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    return { size, center, min: box.min.clone(), max: box.max.clone(), q };
  }
  // Half bands: pick a pose that actually lies flat (ring plane horizontal).
  // Hardcoding poses[2] was only correct for Half NDW210 Large; on Medium and
  // Small, poses[2] stands the band on its edge (a vertical column of stones).
  // Among flat poses, NDW210 also prefers the side with more prong extent up,
  // which is the 1-prong pear tips (they stick out farther than the butts).
  function selectFlatPose(poses, proxy, preferTipsUp) {
    const scored = [];
    for (let i = 0; i < poses.length; i++) {
      const measured = measurePose(poses[i], proxy);
      if (!measured) continue;
      const flatness = measured.size.y / Math.max(measured.size.x, measured.size.z, 1e-6);
      const tipUp = (measured.max.y - measured.center.y) - (measured.center.y - measured.min.y);
      // NDW210 pear tips lie along local +Z in the published GLBs.
      const tipDirY = new Vector3(0, 0, 1).applyQuaternion(measured.q).y;
      scored.push({ i, flatness, tipUp, tipDirY });
    }
    if (!scored.length) return 0;
    const flat = scored.filter(item => item.flatness < 0.55);
    const pool = flat.length ? flat : scored;
    if (preferTipsUp) {
      const minFlat = Math.min(...pool.map(item => item.flatness));
      const candidates = pool.filter(item => item.flatness <= minFlat + 0.1);
      candidates.sort((a, b) => b.tipDirY - a.tipDirY || b.tipUp - a.tipUp || a.flatness - b.flatness);
      return candidates[0].i;
    }
    pool.sort((a, b) => a.flatness - b.flatness);
    return pool[0].i;
  }
  function stablePoseIndex(poses, options, proxy) {
    // Only Half lying poses are selected geometrically. Full NDW210 keeps
    // poses[1] (the untilted tips-up face measured on the Full set).
    if (options.eternity === 'half') return selectFlatPose(poses, proxy, options.model === 'NDW210');
    if (options.model === 'NDW210' && poses[1]) return 1;
    return 0;
  }
  function stableRotation(root, options = {}) {
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
    proxy.updateMatrixWorld(true);
    const poses = new PosePlugin().computeStablePoses(proxy);
    if (!poses.length) throw new Error('No stable resting pose was found.');
    const index = stablePoseIndex(poses, options, proxy);
    if (typeof globalThis !== 'undefined') {
      globalThis.__ndwPose = { index, count: poses.length, model: options.model || null, eternity: options.eternity || null };
    }
    const key = `${signature.join(',')}|${options.model || ''}|${options.eternity || ''}|${index}`;
    if (rotations.has(key)) return rotations.get(key).clone();
    // Same Y-up transform used by PosePlugin.setMostStablePose, but on the
    // selected pose rather than always pose zero.
    const transform = new Matrix4().lookAt(new Vector3(), new Vector3(0, 1, 0), new Vector3(0, 0, 1))
      .multiply(poses[index].xform.clone().invert());
    const rotation = new Quaternion().setFromRotationMatrix(transform);
    if (rotations.size >= 8) rotations.delete(rotations.keys().next().value);
    rotations.set(key, rotation.clone());
    return rotation;
  }
  // World direction from the band centre to the diamond cluster (the stone row).
  function stoneHead(root) {
    const bounds = viewer.scene.getModelBounds(true, true, true);
    if (bounds.isEmpty()) return null;
    const center = bounds.getCenter(new Vector3());
    const sum = center.clone().multiplyScalar(0);
    let count = 0;
    const point = center.clone();
    root.updateMatrixWorld(true);
    root.traverseVisible(node => {
      if (!node.isMesh || !node.geometry?.attributes?.position) return;
      if (![node.material].flat().some(material => material?.isDiamondMaterial)) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      node.geometry.boundingBox.getCenter(point).applyMatrix4(node.matrixWorld);
      sum.add(point); count++;
    });
    if (!count) return null;
    const head = sum.divideScalar(count).sub(center);
    return Math.hypot(head.x, head.y, head.z) > 1e-4 ? head : null;
  }
  function cameraAzimuth() {
    const camera = viewer.scene.activeCamera;
    const x = camera.cameraObject.position.x - camera.target.x;
    const z = camera.cameraObject.position.z - camera.target.z;
    return Math.hypot(x, z) > 0.001 ? { x, z } : null;
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
      } else resting = stableRotation(root, options);
      if (root.getWorldQuaternion) {
        // Half bands: yaw about world +Y so the stone row faces the camera as a
        // left-to-right front row (matching how a Full band presents in this view)
        // and does not run diagonally away. Full bands keep the model's fixed
        // forward so orbiting then replacing a ring does not turn its head toward us.
        let yawed = false;
        if (options.eternity === 'half') {
          const stones = stoneHead(root);
          const headed = (stones || new Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(new Quaternion()))).clone().applyQuaternion(resting);
          const view = cameraAzimuth();
          if (view && Math.hypot(headed.x, headed.z) > 0.001) {
            const yaw = Math.atan2(view.x, view.z) - Math.atan2(headed.x, headed.z);
            resting.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
            yawed = true;
          }
        }
        if (!yawed) {
          const head = new Vector3(0, 1, 0).applyQuaternion(root.getWorldQuaternion(new Quaternion())).applyQuaternion(resting);
          const view = new Vector3(0, 0, -1).applyQuaternion(root.getWorldQuaternion(new Quaternion()));
          if (Math.hypot(head.x, head.z) > 0.001 && Math.hypot(view.x, view.z) > 0.001) {
            const yaw = Math.atan2(view.x, view.z) - Math.atan2(head.x, head.z);
            resting.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw));
          }
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
