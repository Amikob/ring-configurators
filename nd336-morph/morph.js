// MorphViewer: the noya-selfhost viewer + live carat morph of one ring (see morph-core.js for the math).
import * as THREE from 'three';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { RingViewer, exactBounds } from './viewer.js?v=n1';
import { DiamondMaterial } from './diamond-material.js?v=n1';
import * as M from './morph-core.js?v=n1';
import { penetration, vertexErr } from './morph-eval.js?v=n1';

function plainAttr(attr) {
  const n = attr.count, s = attr.itemSize, out = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) out[i * s + j] = attr.getComponent(i, j);
  return new THREE.BufferAttribute(out, s);
}

export class MorphViewer extends RingViewer {
  constructor(container, opts) {
    super(container, opts);
    this.camera.layers.enable(1);   // layer 1 = helpers (ghost, markers): visible on screen, not in the shadow bake / stone cube map
    this.models = new Map();        // carat -> parts
    this.k = 0;
  }

  // Download + parse one GLB into reusable parts (metal geometries keep their original positions / normals).
  async fetchModel(key, url, ct) {
    if (this.models.has(key)) return this.models.get(key);
    const gltf = await this.loader.loadAsync(url);
    const extras = gltf.scene.userData?.extras || gltf.scene.userData || {};
    gltf.scene.updateMatrixWorld(true);
    let gemGeo = null, accGeo = null; const metal = [];
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) g.setAttribute(k, plainAttr(g.attributes[k]));
      g.applyMatrix4(o.matrixWorld);
      const mn = o.material?.name || '';
      if (o.name === 'accent' || /^accent/i.test(mn)) accGeo = g;
      else if (/gem/i.test(mn) || o.name === 'gem') gemGeo = g; else metal.push(g);
    });
    for (const g of metal) {
      if (!g.attributes.normal) g.computeVertexNormals();
      g.userData.basePos = g.attributes.position.array.slice();
      g.userData.baseN = g.attributes.normal.array.slice();
      g.attributes.position.setUsage(THREE.DynamicDrawUsage); g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
    }
    const facet = g => { g.deleteAttribute('normal'); if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); return g; };
    gemGeo = facet(gemGeo);
    const bvh = new MeshBVH(gemGeo, { strategy: SAH, targetLeafSize: 4 });
    let accent = null;
    if (accGeo) {
      accGeo = facet(accGeo);
      const ids = accGeo.attributes._stone?.array || new Float32Array(accGeo.attributes.position.count);
      accGeo.userData.basePos = accGeo.attributes.position.array.slice();
      accGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
      accent = { geo: accGeo, ids, bvh: new MeshBVH(accGeo, { strategy: SAH, targetLeafSize: 4 }) };
    }
    const parts = { key, ct, metal, gemGeo, bvh, accent, gemPos: gemGeo.attributes.position.array.slice(),
      rest: extras.rest ? new THREE.Matrix4().fromArray(extras.rest.flat()).transpose() : new THREE.Matrix4() };
    this.models.set(key, parts);
    return parts;
  }

  // Anchors (authored on the 3 ct file of a shape) -> fields of one model. Built lazily, once per file.
  ensureFields(p, A, baseParts) {
    if (p.fields && p.anchorsSrc === A) return;
    const st0 = M.stoneInfo(baseParts.gemPos, A.center[0], A.center[2]);
    // Anchors follow the head onto the other real files (hybrid mode).
    const Ap = p === baseParts ? A : M.morphAnchors(A, st0, M.scaleFor(p.ct, baseParts.ct) - 1);
    p.anchors = Ap; p.anchorsSrc = A;
    p.st = M.stoneInfo(p.gemPos, Ap.center[0], Ap.center[2]);
    p.pivotY = M.stonePivotY(p.st, Ap);
    p.fields = p.metal.map(g => {
      g.attributes.position.array.set(g.userData.basePos); g.attributes.normal.array.set(g.userData.baseN);   // stale moved vertices
      return M.buildField(g.userData.basePos, p.st, Ap);
    });
    if (p.accent) { p.accent.geo.attributes.position.array.set(p.accent.geo.userData.basePos); p.accent.field = M.buildStoneField(p.accent.geo.userData.basePos, p.accent.ids, p.st, Ap); p.accent.k = null; }
  }

  // Show one model (the holder transform is shared by every model so the ring never jumps when switching).
  install(parts, { fresh = false } = {}) {
    if (this.current === parts && this.holder && !fresh) return;
    const first = !this.holder || fresh;
    const holder = new THREE.Group();
    this.metalMeshes = parts.metal.map(g => { const m = new THREE.Mesh(g, this.metalMaterial); m.castShadow = true; m.frustumCulled = false; holder.add(m); return m; });
    if (!this.diamond) {
      this.diamond = new DiamondMaterial({ bvh: parts.bvh, envMap: this.envHDR, bounces: this.opts.bounces, ...this.gemTuning });
      this.diamond.uniforms.envContrast.value = this.gemTuning.envContrast;
      this.diamond.uniforms.envRotation.value = -(this.envRotation || 0) / (2 * Math.PI);
    } else this.diamond.bvhUniform.updateFrom(parts.bvh);
    const size = new THREE.Box3().setFromBufferAttribute(parts.gemGeo.attributes.position).getSize(new THREE.Vector3()).length();
    this.diamond.uniforms.rayEps.value = size * 2e-5;
    const gm = new THREE.Mesh(parts.gemGeo, this.diamond); gm.castShadow = true; holder.add(gm); this.gemMesh = gm;
    this.accentMesh = null;
    if (parts.accent) {
      if (!this.accentMat) this.accentMat = new DiamondMaterial({ bvh: parts.accent.bvh, envMap: this.envHDR, bounces: 3, ...this.gemTuning });
      else this.accentMat.bvhUniform.updateFrom(parts.accent.bvh);
      this.accentMat.uniforms.rayEps.value = 1e-4;
      this.accentMesh = new THREE.Mesh(parts.accent.geo, this.accentMat); this.accentMesh.castShadow = true; this.accentMesh.frustumCulled = false; holder.add(this.accentMesh);
    }
    this.helpers = new THREE.Group(); this.helpers.userData.noBounds = true; holder.add(this.helpers);
    for (const c of [...this.ringRoot.children]) this.ringRoot.remove(c);   // geometries are kept for re-use
    this.ringRoot.add(holder); this.holder = holder; this.current = parts;
    if (first) {
      this.restMatrix = parts.rest;
      this.applyPose(this.pose || 'flat');
      this.holderMatrix = holder.matrix.clone(); this.rootXZ = [this.ringRoot.position.x, this.ringRoot.position.z];
    } else { holder.matrixAutoUpdate = false; holder.matrix.copy(this.holderMatrix); }
    this.dispatchEvent(new Event('installed'));
  }

  // Morph the shown model to `ct` carats.
  setCarat(ct, { settle = true } = {}) {
    const p = this.current; if (!p?.fields) return;
    const s = M.scaleFor(ct, p.ct), k = s - 1;
    this.ct = ct; this.s = s; this.k = k;
    p.metal.forEach((g, i) => {
      M.applyField(g.userData.basePos, g.userData.baseN, p.fields[i], k, g.attributes.position.array, g.attributes.normal.array);
      g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    });
    // Small stones: rigid moves, then refit their BVH (fast, no rebuild) so the diamond shader sees them where they are.
    const ac = p.accent;
    if (ac?.field && ac.k !== k) {
      M.applyField(ac.geo.userData.basePos, null, ac.field, k, ac.geo.attributes.position.array, null);
      ac.geo.attributes.position.needsUpdate = true;
      if (ac.field.active.length) { ac.bvh.refit(); this.accentMat.bvhUniform.updateFrom(ac.bvh); }
      ac.k = k;
    }
    // Stone: uniform scale about the pivot (the BVH stays in object space, the shader follows the matrix).
    const gm = this.gemMesh, st = p.st;
    gm.scale.setScalar(s);
    gm.position.set(st.cx * (1 - s), p.pivotY * (1 - s), st.cz * (1 - s));
    gm.updateMatrix();
    this.fastFloor();
    this.dispatchEvent(new Event('morphed'));
    clearTimeout(this._settle);
    const done = () => {
      for (const g of [...p.metal, ...(p.accent ? [p.accent.geo] : [])]) { g.computeBoundingBox(); g.computeBoundingSphere(); }
      this.refloor(); this.bakeShadow(); this.cubeDirty = true; this.reset(); this.dispatchEvent(new Event('settled'));
    };
    if (settle) this._settle = setTimeout(done, 160); else done();
  }

  // While dragging: lowest point = min(static vertices, measured once) and the moving ones only.
  fastFloor() {
    const p = this.current, h = this.holder; if (!p || !h) return;
    const m = h.matrix.elements, yh = (a, i) => m[1] * a[i] + m[5] * a[i + 1] + m[9] * a[i + 2] + m[13];
    const all = [...p.metal.map((g, i) => [g, p.fields[i].active]), ...(p.accent ? [[p.accent.geo, p.accent.field.active]] : [])];
    if (p.staticMinFor !== p.fields || p.staticMatrix !== m.join()) {
      let mn = Infinity;
      for (const [g, act] of all) {
        const a = g.userData.basePos, moving = new Uint8Array(a.length / 3); for (const i of act) moving[i] = 1;
        for (let i = 0; i < moving.length; i++) if (!moving[i]) mn = Math.min(mn, yh(a, 3 * i));
      }
      p.staticMin = mn; p.staticMinFor = p.fields; p.staticMatrix = m.join();
    }
    let mn = p.staticMin;
    for (const [g, act] of all) { const a = g.attributes.position.array; for (const i of act) mn = Math.min(mn, yh(a, 3 * i)); }
    const gm = this.gemMesh, s = gm.scale.x, gp = p.gemPos, step = gp.length > 30000 ? 3 : 1;
    for (let i = 0; i < gp.length; i += 3 * step) {
      const x = gm.position.x + s * gp[i], y = gm.position.y + s * gp[i + 1], z = gm.position.z + s * gp[i + 2];
      mn = Math.min(mn, m[1] * x + m[5] * y + m[9] * z + m[13]);
    }
    this.ringRoot.position.set(this.rootXZ?.[0] || 0, -mn, this.rootXZ?.[1] || 0);
    this.ringRoot.updateMatrixWorld(true);
    if (this.gemMesh) this.diamond.syncObject(this.gemMesh);
    this.reset();
  }

  // Keep the lowest real vertex on the floor (the head grows, the band does not); x/z and camera unchanged.
  refloor() {
    const h = this.holder; if (!h) return;
    this.ringRoot.position.set(this.rootXZ?.[0] || 0, 0, this.rootXZ?.[1] || 0);
    this.ringRoot.updateMatrixWorld(true);
    const box = exactBounds(h);
    this.ringRoot.position.y = -box.min.y;
    this.ringRoot.updateMatrixWorld(true);
    this.bounds = exactBounds(this.ringRoot);
    if (this.gemMesh) this.diamond.syncObject(this.gemMesh);
    this.reset();
  }

  // Current stone dimensions (mm) and stone/metal overlap (convex stone vs metal vertices).
  stoneSize() { const p = this.current; return p ? { length: 2 * p.st.b * this.s, width: 2 * p.st.a * this.s } : null; }
  overlap() {
    const p = this.current; if (!p) return null;
    const s = this.s, g = p.gemPos, gp = new Float32Array(g.length);
    for (let i = 0; i < g.length; i += 3) { gp[i] = p.st.cx + s * (g[i] - p.st.cx); gp[i + 1] = p.pivotY + s * (g[i + 1] - p.pivotY); gp[i + 2] = p.st.cz + s * (g[i + 2] - p.st.cz); }
    let worst = { verticesInside: 0, maxDepth: 0 };
    for (const m of [...p.metal, ...(p.accent ? [p.accent.geo] : [])]) { const r = penetration(gp, null, m.attributes.position.array); worst = { verticesInside: worst.verticesInside + r.verticesInside, maxDepth: Math.max(worst.maxDepth, r.maxDepth) }; }
    return worst;
  }

  // The small stones use their own diamond material: keep its lighting in step with the centre stone's.
  renderFrame() {
    if (this.accentMesh && this.diamond) {
      const a = this.accentMat.uniforms, d = this.diamond.uniforms;
      for (const k of ['envMap', 'envRotation', 'envIntensity', 'envContrast', 'ior', 'dispersion', 'tint']) a[k].value = d[k].value;
      this.accentMat.syncObject(this.accentMesh);
    }
    super.renderFrame();
  }
  captureGemCube() {
    const a = this.accentMesh; if (a) a.visible = false;
    super.captureGemCube();
    if (a) a.visible = true;
  }

  // Helper materials ------------------------------------------------------------------------------
  // mode: 'normal' | 'weights' (moving = warm, fixed = blue) | 'error' (distance to the real model at this carat)
  setMetalView(mode, realParts) {
    const p = this.current; if (!p) return;
    this.metalView = mode;
    if (mode === 'normal') { this.metalMeshes.forEach(m => { m.material = this.metalMaterial; }); this.reset(); return null; }
    let info = null;
    this.metalMeshes.forEach((m, i) => {
      const g = m.geometry, n = g.attributes.position.count, col = new Float32Array(n * 3);
      let vals;
      if (mode === 'weights') vals = p.fields[i].W;
      else {
        const ref = realParts.metal.map(rg => ({ pos: rg.attributes.position.array, idx: rg.index?.array }));
        // nearest distance to any of the real model's metal parts
        vals = new Float32Array(n).fill(Infinity);
        for (const r of ref) { const d = vertexErr(g.attributes.position.array, r.pos, r.idx); for (let j = 0; j < n; j++) vals[j] = Math.min(vals[j], d[j]); }
        let sum = 0, cnt = 0, max = 0; for (let j = 0; j < n; j++) if (g.attributes.position.array[3 * j + 1] >= 8) { sum += vals[j]; cnt++; max = Math.max(max, vals[j]); }
        info = { mean: sum / Math.max(1, cnt), max };
      }
      const c = new THREE.Color();
      for (let j = 0; j < n; j++) {
        const v = vals[j];
        if (mode === 'weights') c.setHSL(0.62 - 0.62 * Math.min(1, v), 0.85, 0.5);
        else c.setHSL(Math.max(0, 0.33 - 0.33 * Math.min(1, v / 0.5)), 0.9, 0.5);   // green 0 mm -> red >= 0.5 mm
        col[3 * j] = c.r; col[3 * j + 1] = c.g; col[3 * j + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      m.material = this.debugMaterial || (this.debugMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 }));
    });
    this.reset();
    return info;
  }

  // Translucent real model drawn over the morph (only where a real model exists for this carat).
  setGhost(realParts) {
    if (this.ghost) { this.helpers.remove(this.ghost); this.ghost = null; }
    if (realParts) {
      this.ghost = new THREE.Group(); this.ghost.userData.noBounds = true;
      const mat = this.ghostMaterial || (this.ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x1fa3ff, wireframe: true, transparent: true, opacity: 0.35, depthTest: true }));
      for (const g of realParts.metal) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(g.userData.basePos, 3)); if (g.index) geo.setIndex(g.index);
        const m = new THREE.Mesh(geo, mat); m.layers.set(1); m.userData.noBounds = true; this.ghost.add(m);
      }
      this.helpers.add(this.ghost);
    }
    this.reset();
  }
}
