// Self-hosted ring viewer: three.js + own diamond shader + progressive anti-aliasing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { DiamondMaterial } from './diamond-material.js';

// Linear-sRGB metal reflectance (F0) for 18k alloys.
export const GOLDS = {
  white: [0.86, 0.85, 0.82],
  yellow: [1.0, 0.70, 0.28],
  rose: [0.98, 0.62, 0.50],
};

const HALTON = Array.from({ length: 64 }, (_, i) => {
  const h = (b, n) => { let f = 1, r = 0; n += 1; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
  return [h(2, i) - 0.5, h(3, i) - 0.5];
});

const fsVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class RingViewer extends EventTarget {
  constructor(container, opts = {}) {
    super();
    this.container = container;
    this.opts = { maxFrames: 48, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), bounces: 7, ...opts };
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
    r.setPixelRatio(this.opts.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
    this.camera.position.set(0, 40, 90);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 25; this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enablePan = false;
    this.controls.addEventListener('change', () => this.reset());

    // Shadow catcher + light used only for the soft ground shadow.
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.36 }));
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 0);
    sun.position.set(-45, 75, -30);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.radius = 14; sun.shadow.blurSamples = 32; sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);
    // Second, overhead shadow: tight contact darkening right under the ring.
    const top = this.topLight = new THREE.DirectionalLight(0xffffff, 0);
    top.position.set(0, 100, 0); top.castShadow = true;
    Object.assign(top.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
    top.shadow.mapSize.set(1024, 1024); top.shadow.radius = 6; top.shadow.blurSamples = 16; top.shadow.bias = -0.0005;
    this.scene.add(top, top.target);

    this.ringRoot = new THREE.Group();
    this.scene.add(this.ringRoot);
    this.gold = 'yellow';
    this.metalMaterial = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.09, envMapIntensity: 1.7 });
    this.metalMaterial.color.setRGB(...GOLDS.yellow, THREE.LinearSRGBColorSpace);
    this.gemTuning = { ior: 2.418, dispersion: 0.025, envIntensity: 1.0, envContrast: 1.0 };

    this.loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.frame = 0; this.pose = 'flat'; this.needsFrame = true;
    this.#setupPipeline();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.#loop();
  }

  #setupPipeline() {
    const opts = { type: THREE.HalfFloatType, depthBuffer: true };
    this.rtFrame = new THREE.WebGLRenderTarget(1, 1, { ...opts, samples: 4 });
    this.rtAcc = [new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }), new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })];
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = g => new THREE.Mesh(new THREE.PlaneGeometry(2, 2), g);
    this.accMat = new THREE.ShaderMaterial({ vertexShader: fsVert, depthTest: false, depthWrite: false,
      uniforms: { tFrame: { value: null }, tPrev: { value: null }, weight: { value: 1 } },
      fragmentShader: `uniform sampler2D tFrame, tPrev; uniform float weight; varying vec2 vUv;
        void main(){ gl_FragColor = mix(texture2D(tPrev, vUv), texture2D(tFrame, vUv), weight); }` });
    this.outMat = new THREE.ShaderMaterial({ vertexShader: fsVert, depthTest: false, depthWrite: false,
      uniforms: { tAcc: { value: null }, exposure: { value: 1.0 }, bg: { value: new THREE.Color(1, 1, 1) } },
      fragmentShader: `uniform sampler2D tAcc; uniform float exposure; uniform vec3 bg; varying vec2 vUv;
        // Khronos PBR Neutral tone mapping (keeps gold colour true, compresses diamond highlights).
        vec3 neutral(vec3 color) {
          const float startCompression = 0.8 - 0.04; const float desaturation = 0.15;
          float x = min(color.r, min(color.g, color.b)); float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
          color -= offset; float peak = max(color.r, max(color.g, color.b));
          if (peak < startCompression) return color;
          const float d = 1. - startCompression; float newPeak = 1. - d * d / (peak + d - startCompression);
          color *= newPeak / peak; float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
          return mix(color, newPeak * vec3(1, 1, 1), g);
        }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec4 a = texture2D(tAcc, vUv);
          vec3 c = a.a > 1e-4 ? neutral(a.rgb / a.a * exposure) : vec3(0.0);
          c = c * a.a + bg * (1.0 - a.a);
          gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
        }` });
    this.accQuad = quad(this.accMat); this.outQuad = quad(this.outMat);
  }

  async loadEnvironment(url, { saturation = 0.15, exposure = 1.0, target = 'both' } = {}) {
    // Load as float, neutralise the room colour (jewellery studios are grey/white), store as half float
    // (half-float linear filtering works on every phone; float does not on iOS).
    const src = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(url);
    const { width, height, data } = src.image;
    const half = new Uint16Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      half[i * 4] = THREE.DataUtils.toHalfFloat((l + (r - l) * saturation) * exposure);
      half[i * 4 + 1] = THREE.DataUtils.toHalfFloat((l + (g - l) * saturation) * exposure);
      half[i * 4 + 2] = THREE.DataUtils.toHalfFloat((l + (b - l) * saturation) * exposure);
      half[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
    }
    src.dispose();
    const hdr = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType);
    hdr.colorSpace = THREE.LinearSRGBColorSpace;
    hdr.flipY = true;
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    hdr.minFilter = THREE.LinearFilter; hdr.magFilter = THREE.LinearFilter; hdr.generateMipmaps = false;
    hdr.needsUpdate = true;
    if (target !== 'gem') {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment?.dispose?.();
      this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
      pmrem.dispose();
      if (target === 'metal') { hdr.dispose(); this.reset(); return; }
    }
    this.envHDR?.dispose?.();
    this.envHDR = hdr;
    if (this.diamond) this.diamond.uniforms.envMap.value = hdr;
    this.reset();
  }

  setEnvRotation(rad) {
    this.envRotation = rad;
    this.scene.environmentRotation.set(0, rad, 0);
    if (this.diamond) this.diamond.uniforms.envRotation.value = -rad / (2 * Math.PI);
    this.reset();
  }

  setGold(name) {
    this.gold = name;
    this.metalMaterial.color.setRGB(...GOLDS[name], THREE.LinearSRGBColorSpace);
    this.reset();
  }

  setGem(patch) {
    Object.assign(this.gemTuning, patch);
    if (this.diamond) for (const [k, v] of Object.entries(patch)) if (this.diamond.uniforms[k]) this.diamond.uniforms[k].value = v;
    this.reset();
  }

  async loadRing(url) {
    const token = (this.loadToken = (this.loadToken || 0) + 1);
    const gltf = await this.loader.loadAsync(url);
    if (token !== this.loadToken) return false;
    const extras = gltf.scene.userData?.extras || gltf.scene.userData || {};
    const holder = new THREE.Group();
    gltf.scene.updateMatrixWorld(true);
    let gemGeo = null; const metalGeos = [];
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (g.attributes[k].isInterleavedBufferAttribute || g.attributes[k].normalized || !(g.attributes[k].array instanceof Float32Array)) g.setAttribute(k, deinterleave(g.attributes[k]));
      g.applyMatrix4(o.matrixWorld);
      if (/gem/i.test(o.material?.name || o.name)) gemGeo = g; else metalGeos.push(g);
    });
    for (const g of metalGeos) {
      const m = new THREE.Mesh(g, this.metalMaterial);
      m.castShadow = true; holder.add(m);
    }
    if (gemGeo) {
      // Faceted stones: flat normals from the triangle itself.
      gemGeo.deleteAttribute('normal');
      gemGeo = gemGeo.index ? gemGeo.toNonIndexed() : gemGeo;
      gemGeo.computeVertexNormals();
      const bvh = new MeshBVH(gemGeo, { strategy: SAH, targetLeafSize: 4 });
      const size = new THREE.Box3().setFromBufferAttribute(gemGeo.attributes.position).getSize(new THREE.Vector3()).length();
      if (!this.diamond) {
        this.diamond = new DiamondMaterial({ bvh, envMap: this.envHDR, bounces: this.opts.bounces, ...this.gemTuning });
        this.diamond.uniforms.envContrast.value = this.gemTuning.envContrast;
        this.diamond.uniforms.envRotation.value = -(this.envRotation || 0) / (2 * Math.PI);
      } else this.diamond.bvhUniform.updateFrom(bvh);
      this.diamond.uniforms.rayEps.value = size * 2e-5;
      const gm = new THREE.Mesh(gemGeo, this.diamond);
      gm.castShadow = true; holder.add(gm); this.gemMesh = gm;
    }
    // Upright (as modelled) and resting (most stable pose, computed offline in the converter).
    this.restMatrix = extras.rest ? new THREE.Matrix4().fromArray(extras.rest.flat()).transpose() : new THREE.Matrix4();
    for (const c of [...this.ringRoot.children]) { this.ringRoot.remove(c); c.traverse(o => o.geometry?.dispose()); }
    this.ringRoot.add(holder);
    this.holder = holder;
    this.applyPose(this.pose, { keepCamera: true });
    this.dispatchEvent(new Event('ringloaded'));
    return true;
  }

  applyPose(pose, { keepCamera = true } = {}) {
    this.pose = pose;
    const h = this.holder; if (!h) return;
    h.matrixAutoUpdate = false;
    h.matrix.copy(pose === 'flat' ? this.restMatrix : new THREE.Matrix4());
    h.position.set(0, 0, 0);
    h.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(h);
    const c = box.getCenter(new THREE.Vector3());
    this.ringRoot.position.set(-c.x, -box.min.y, -c.z);
    this.ringRoot.updateMatrixWorld(true);
    this.bounds = new THREE.Box3().setFromObject(this.ringRoot);
    if (this.gemMesh) this.diamond.syncObject(this.gemMesh);
    this.reset();
  }

  // Front three-quarter view like the iJewel page: head facing the camera, elevated, ring framed
  // so it fills `fill` of the viewer width (screen-space fit, so it is centred whatever the pose).
  frontView({ elevation = 18, azimuth = -24, fill = 0.5 } = {}) {
    if (!this.bounds) return;
    const el = THREE.MathUtils.degToRad(elevation), az = THREE.MathUtils.degToRad(azimuth);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const center = this.bounds.getCenter(new THREE.Vector3());
    // Real silhouette points (every ~40th vertex) rather than the box corners.
    const pts = [];
    this.ringRoot.updateMatrixWorld(true);
    this.ringRoot.traverse(o => {
      if (!o.isMesh) return;
      const a = o.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 1500));
      for (let i = 0; i < a.count; i += step) pts.push(new THREE.Vector3().fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld));
    });
    let target = center.clone(), dist = this.bounds.getSize(new THREE.Vector3()).length() * 2;
    const cam = this.camera;
    for (let it = 0; it < 6; it++) {
      cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target); cam.updateMatrixWorld(); 
      let minX = 1, maxX = -1, minY = 1, maxY = -1;
      for (const p of pts) { const q = p.clone().project(cam); minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
      const w = (maxX - minX) / 2, h = (maxY - minY) / 2 * (1 / cam.aspect);
      const cur = Math.max(w, h * 1.0);
      // pan so the projected box is centred
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist, halfW = halfH * cam.aspect;
      target.addScaledVector(right, (minX + maxX) / 2 * halfW).addScaledVector(up, (minY + maxY) / 2 * halfH);
      dist *= cur / fill;
    }
    cam.position.copy(target).addScaledVector(dir, dist);
    this.controls.target.copy(target);
    cam.lookAt(target);
    this.controls.update();
    this.reset();
  }

  reset() { this.frame = 0; this.needsFrame = true; }

  resize() {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    const pw = Math.floor(w * this.renderer.getPixelRatio()), ph = Math.floor(h * this.renderer.getPixelRatio());
    this.rtFrame.setSize(pw, ph); this.rtAcc.forEach(t => t.setSize(pw, ph));
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.size = [pw, ph];
    this.reset();
  }

  renderFrame() {
    const r = this.renderer, cam = this.camera, [w, h] = this.size;
    if (this.gemMesh) this.diamond.syncObject(this.gemMesh);
    const n = this.frame;
    if (n > 0) { const [jx, jy] = HALTON[n % HALTON.length]; cam.setViewOffset(w, h, jx, jy, w, h); }
    else cam.clearViewOffset();
    r.setRenderTarget(this.rtFrame);
    r.setClearColor(0x000000, 0); r.clear();
    r.render(this.scene, cam);
    cam.clearViewOffset();
    const src = this.rtAcc[n % 2], dst = this.rtAcc[(n + 1) % 2];
    this.accMat.uniforms.tFrame.value = this.rtFrame.texture;
    this.accMat.uniforms.tPrev.value = src.texture;
    this.accMat.uniforms.weight.value = 1 / (n + 1);
    r.setRenderTarget(dst); r.render(this.accQuad, this.quadCam);
    this.outMat.uniforms.tAcc.value = dst.texture;
    r.setRenderTarget(null); r.render(this.outQuad, this.quadCam);
    this.frame++;
  }

  #loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const moved = this.controls.update();
      if (moved) this.reset();
      if (!this.holder || !this.envHDR) return;
      if (this.frame < this.opts.maxFrames) {
        this.renderFrame();
        if (this.frame === this.opts.maxFrames) this.dispatchEvent(new Event('converged'));
      }
    };
    tick();
  }
}

function deinterleave(attr) {
  const n = attr.count, s = attr.itemSize, out = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) out[i * s + j] = attr.getComponent(i, j);
  return new THREE.BufferAttribute(out, s);
}
