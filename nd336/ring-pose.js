export const POSES = ['upright', 'flat'];

export function normalizePose(selection) {
  return selection;
}

// Presentation only: restore the imported transform before replacement or Try-On.
export function manageRingPose(viewer, { Vector3, Quaternion, Matrix4, Object3D, PosePlugin }) {
  let saved;
  const rotations = new Map();
  function stableRotations(root) {
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
    if (rotations.has(key)) return rotations.get(key).map(rotation => rotation.clone());
    const poses = new PosePlugin().computeStablePoses(proxy);
    if (!poses.length) throw new Error('No stable resting pose was found.');
    // Same Y-up transform used by PosePlugin.setMostStablePose (pose zero).
    // Apply it ourselves to preserve the saved ground and AR configuration.
    // Every stable pose is kept (most stable first) so a pear or heart can pick the one with its point up.
    const list = poses.map(pose => new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(new Vector3(), new Vector3(0, 1, 0), new Vector3(0, 0, 1)).multiply(pose.xform.clone().invert())));
    if (rotations.size >= 8) rotations.delete(rotations.keys().next().value);
    rotations.set(key, list.map(rotation => rotation.clone()));
    return list;
  }
  function stableRotation(root) {
    return stableRotations(root)[0];
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
  let lastTip = null;
  // Diagnostic only: open the page with ?tipdebug to show whether the pear/heart tip-up step ran.
  function tipDebug(requested) {
    try {
      if (typeof location === 'undefined' || !/[?&]tipdebug/.test(location.search)) return;
      let el = document.getElementById('tipdebug');
      if (!el) { el = document.createElement('pre'); el.id = 'tipdebug'; document.body.appendChild(el); }
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:#fff;border:1px solid #000;padding:4px 6px;font:11px monospace;max-width:70vw;white-space:pre-wrap';
      el.textContent = 'tip-up v6 requested=' + Boolean(requested) + ' ' + JSON.stringify(lastTip);
    } catch { /* diagnostic only */ }
  }
  // Which end of the local Z (finger) axis is the narrow end of the centre stone: +1, -1, or 1 if it cannot be measured.
  function narrowEndSign(root) {
    try {
      root.updateWorldMatrix(true, true);
      const toRoot = new Matrix4().copy(root.matrixWorld).invert();
      const v = new Vector3();
      let best = null, bestVolume = 0;
      root.traverse(mesh => {
        const position = mesh.geometry?.attributes?.position;
        if (!mesh.isMesh || !position) return;
        for (let node = mesh; node; node = node.parent) if (node.visible === false) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (!materials.some(material => material?.isDiamondMaterial)) return;
        const m = new Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
        const points = new Float32Array(position.count * 3);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < position.count; i++) {
          v.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(m);
          points[i * 3] = v.x; points[i * 3 + 1] = v.y; points[i * 3 + 2] = v.z;
          for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], points[i * 3 + k]); hi[k] = Math.max(hi[k], points[i * 3 + k]); }
        }
        const volume = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
        if (volume > bestVolume) { bestVolume = volume; best = { points, zMin: lo[2], zMax: hi[2] }; }
      });
      if (!best) return 1;
      const band = (best.zMax - best.zMin) * 0.25;
      const spread = side => {
        let n = 0, sum = 0, sumSq = 0;
        for (let i = 0; i < best.points.length; i += 3) {
          const z = best.points[i + 2];
          if (side > 0 ? z < best.zMax - band : z > best.zMin + band) continue;
          const x = best.points[i]; n++; sum += x; sumSq += x * x;
        }
        return n > 3 ? Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2)) : Infinity;
      };
      const top = spread(1), bottom = spread(-1);
      if (!Number.isFinite(top) || !Number.isFinite(bottom) || Math.abs(top - bottom) < 1e-6) return 1;
      return top < bottom ? 1 : -1;
    } catch { return 1; }
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
      let resting = stableRotation(root);
      lastTip = null;
      if (options.tipUp && root.getWorldQuaternion) {
        // Pear and heart: the point is the narrow end of the centre stone along the finger axis (local Z). Lying on its
        // side the finger axis is vertical, and the hull pose may stand the ring either way up, which put the point on
        // the floor for some carats. Measure which end of the stone is the narrow one, and if it faces the floor turn
        // the ring 180 degrees about its head axis so the point is up.
        const rootQ = root.getWorldQuaternion(new Quaternion());
        const sign = narrowEndSign(root);
        const tip = new Vector3(0, 0, sign).applyQuaternion(rootQ).applyQuaternion(resting);
        let flipped = false, rest = 0;
        if (tip.y < 0.5) {
          // Lie the ring the way it would really rest with the point up: pick the steadiest stable pose (a real
          // floor contact, the shank plus the round end of the stone) whose point faces up.
          const candidates = stableRotations(root);
          for (let i = 1; i < candidates.length; i++) {
            const candidateTip = new Vector3(0, 0, sign).applyQuaternion(rootQ).applyQuaternion(candidates[i]);
            if (candidateTip.y >= 0.5) { resting = candidates[i]; tip.copy(candidateTip); rest = i; flipped = true; break; }
          }
        }
        const headAxis = new Vector3(0, 1, 0).applyQuaternion(rootQ).applyQuaternion(resting);
        if (tip.y < -0.05) {
          headAxis.y = 0;
          if (headAxis.lengthSq() < 1e-6) headAxis.set(1, 0, 0);
          resting.premultiply(new Quaternion().setFromAxisAngle(headAxis.normalize(), Math.PI));
          tip.applyQuaternion(new Quaternion().setFromAxisAngle(headAxis, Math.PI));
          flipped = true;
        }
        if (tip.y < 0.5) {
          // The hull picked an unusual resting pose in which the point is not clearly up: stand the point straight up.
          const lift = new Quaternion().setFromUnitVectors(tip.clone().normalize(), new Vector3(0, 1, 0));
          resting.premultiply(lift);
          tip.applyQuaternion(lift);
          flipped = true;
        }
        lastTip = { sign, tipY: Number(tip.y.toFixed(3)), flipped, rest };
      }
      tipDebug(options.tipUp);
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
  return { apply, restore, get lastTip() { return lastTip; }, get current() { return saved ? 'flat' : 'upright'; } };
}
