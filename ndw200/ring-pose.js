export const POSES = ['upright', 'flat'];

export function normalizePose(selection) {
  // Ring-only and ring+band sets can both rest on the floor.
  return { ...selection, pose: POSES.includes(selection.pose) ? selection.pose : 'upright' };
}

// Presentation only: restore the imported transform before replacement or Try-On.
export function manageRingPose(viewer, { Vector3, Quaternion, Matrix4, Object3D, PosePlugin, Box3 }) {
  let saved;
  const rotations = new Map();
  // Upright NDW200 bands are built with the 3dm ring plane in X-Z, mapped to
  // glTF as V=[X, Z, -Y]: the imported ring stands in the world X-Y plane and
  // the band axis (finger / thickness, and NDW210 pear tips) is local +Z.
  // PosePlugin ranks convex-hull faces, and elongated stones (oval, radiant,
  // emerald, elongated radiant, marquise, pear, and elongated cushions) tilt
  // those faces by several degrees. Lie the band by sending that known axis
  // to world +Y so every size and shape rests identically: ring plane
  // horizontal, axis vertical, pear tips up.
  function axisRotation(root, options = {}) {
    const world = root.getWorldQuaternion
      ? root.getWorldQuaternion(new Quaternion())
      : root.quaternion.clone();
    const axis = new Vector3(0, 0, 1).applyQuaternion(world);
    if (axis.lengthSq() < 1e-8) axis.set(0, 0, 1);
    else axis.normalize();
    const rotation = new Quaternion().setFromUnitVectors(axis, new Vector3(0, 1, 0));
    if (typeof globalThis !== 'undefined') {
      globalThis.__ndwPose = {
        method: 'axis',
        model: options.model || null,
        eternity: options.eternity || null,
        size: options.size || null,
        axisBefore: [+axis.x.toFixed(4), +axis.y.toFixed(4), +axis.z.toFixed(4)]
      };
    }
    return rotation;
  }
  function tiltDegrees(root) {
    root.updateMatrixWorld(true);
    const axis = new Vector3(0, 0, 1);
    if (root.getWorldQuaternion) axis.applyQuaternion(root.getWorldQuaternion(new Quaternion()));
    else axis.applyQuaternion(root.quaternion);
    const axisLen = axis.length() || 1;
    const axisTilt = Math.acos(Math.min(1, Math.abs(axis.y) / axisLen)) * (180 / Math.PI);
    const points = [];
    const point = new Vector3();
    root.traverseVisible(node => {
      const position = node.geometry?.attributes?.position;
      if (!position || node.userData?.bboxVisible === false) return;
      const step = Math.max(1, Math.floor(position.count / 4000));
      for (let i = 0; i < position.count; i += step) {
        points.push(point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld).clone());
      }
    });
    let geomTilt = null;
    if (points.length >= 3) {
      const center = new Vector3();
      for (const p of points) center.add(p);
      center.divideScalar(points.length);
      let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
      for (const p of points) {
        const x = p.x - center.x, y = p.y - center.y, z = p.z - center.z;
        xx += x * x; yy += y * y; zz += z * z; xy += x * y; xz += x * z; yz += y * z;
      }
      const a = xx, b = xy, c = xz, d = yy, e = yz, f = zz;
      const A = d * f - e * e, B = c * e - b * f, Cc = b * e - c * d;
      const D = c * e - b * f, E = a * f - c * c, F = b * c - a * e;
      const G = b * e - c * d, H = b * c - a * e, I = a * d - b * b;
      const det = a * A + b * B + c * Cc;
      let vx = 0, vy = 1, vz = 0;
      if (Math.abs(det) > 1e-18) {
        for (let i = 0; i < 16; i++) {
          const x = (A * vx + D * vy + G * vz) / det;
          const y = (B * vx + E * vy + H * vz) / det;
          const z = (Cc * vx + F * vy + I * vz) / det;
          const n = Math.hypot(x, y, z) || 1;
          vx = x / n; vy = y / n; vz = z / n;
        }
      }
      geomTilt = Math.acos(Math.min(1, Math.abs(vy))) * (180 / Math.PI);
    }
    return { axisTilt: +axisTilt.toFixed(3), geomTilt: geomTilt == null ? null : +geomTilt.toFixed(3), axisY: +(axis.y / axisLen).toFixed(4) };
  }
  // World direction from the band centretion from the band centre to the diamond cluster (the stone row).
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
      } else resting = axisRotation(root, options);
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
      if (typeof globalThis !== 'undefined') {
        const tilt = tiltDegrees(root);
        globalThis.__ndwPose = { ...(globalThis.__ndwPose || {}), ...tilt };
      }
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
