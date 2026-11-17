// Self-hosted ring viewer: three.js + own diamond shader + progressive anti-aliasing.
// (noya-morph copy of noya-selfhost/viewer.js v9: exactBounds exported and skips helper meshes; nothing else changed.)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { DiamondMaterial } from './diamond-material.js?v=m1';

// Linear-sRGB metal reflectance (F0) for 18k alloys.
// Metal colours = the iJewel Noya page's materials (packs.ijewel3d.com 1_metal_*_polished.pmat, read from the live
// viewer): sRGB #e5b377 / #f2af83 / #c2c2c3, roughness 0, metalness 1, envMapIntensity 1. Stored as linear sRGB.
export const GOLDS = {
  white: [0.5395, 0.5395, 0.5457],
  // Yellow / rose start from the iJewel colours (in the comments) made deeper and redder. iJewel's screen-space
  // reflections let the gold reflect itself, which deepens it on screen; a pure env reflection cannot, so the base
  // colour carries part of that. Values picked by mean Lab deltaE on the band against live iJewel (white: no change).
  yellow: [0.72, 0.37, 0.155],   // iJewel #e5b377 = [0.7835, 0.4508, 0.1845]
  rose: [0.84, 0.32, 0.20],      // iJewel #f2af83 = [0.8879, 0.4287, 0.227]
};
export const IJEWEL = { metalRoughness: 0, metalEnvIntensity: 1 };

const halton = (b, n) => { let f = 1, r = 0; n += 1; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
const HALTON = Array.from({ length: 64 }, (_, i) => {
  const h = (b, n) => { let f = 1, r = 0; n += 1; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
  return [h(2, i) - 0.5, h(3, i) - 0.5];
});

export const GRADE_DEFAULTS = { gamma: 1, contrast: 1.1, saturation: 1, vibrance: 0, burn: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 };

const fsVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class RingViewer extends EventTarget {
  constructor(container, opts = {}) {
    super();
    this.container = container;
    this.opts = { maxFrames: 48, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), bounces: 5, motionBounces: 5, ...opts };
    this.stats = { frames: 0 };
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
    r.setPixelRatio(this.opts.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
    this.camera.position.set(0, 40, 90);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.1;
    this.controls.minDistance = 25; this.controls.maxDistance = 220;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.enablePan = false;
    

    // Ground: the ring rests on a floor plane. Its shadow is BAKED once per ring/pose (camera-independent):
    // a top-down render of a shadow catcher, averaged over many jittered light directions =
    // (a) a soft key-light shadow (area light, like iJewel's directional shadow) and
    // (b) sky occlusion (cosine-weighted hemisphere) = dark, tight contact shadow where the band touches the floor.
    this.shadowOpts = { key: 0.72, ao: 0.75, keyAzimuth: 225, keyElevation: 34,   // iJewel ground-shadow-backleft light (target -0.593,-0.543,-0.595) seen from our side
      keySoftness: 10, samples: 96, ...(opts.shadow || {}) };
    this.bakeSize = 512;
    this.rtShadow = new THREE.WebGLRenderTarget(this.bakeSize, this.bakeSize, { type: THREE.HalfFloatType, depthBuffer: true });
    this.bakeLight = new THREE.DirectionalLight(0xffffff, 0);
    this.bakeLight.castShadow = false;
    this.bakeLight.layers.enable(2);   // lights are only used when they share a layer with the camera
    this.bakeLight.shadow.mapSize.set(1024, 1024);
    this.bakeLight.shadow.bias = -0.0004; this.bakeLight.shadow.radius = 2.5;
    this.scene.add(this.bakeLight, this.bakeLight.target);
    this.bakeCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.ShadowMaterial({ color: 0xffffff, opacity: 1, transparent: true, depthWrite: false,
        blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }));
    this.bakeCatcher.receiveShadow = true;
    this.bakeCatcher.layers.set(2);
    this.scene.add(this.bakeCatcher);
    this.rtShadowTmp = new THREE.WebGLRenderTarget(this.bakeSize, this.bakeSize, { type: THREE.HalfFloatType, depthBuffer: false });
    this.shadowBlurMat = new THREE.ShaderMaterial({ vertexShader: fsVert, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2() } },
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
        void main(){ float w[5]; w[0]=0.227; w[1]=0.1945; w[2]=0.1216; w[3]=0.054; w[4]=0.0162;
          vec3 c = texture2D(tSrc, vUv).rgb * w[0];
          for (int i = 1; i < 5; i++) { c += (texture2D(tSrc, vUv + dir * float(i)).rgb + texture2D(tSrc, vUv - dir * float(i)).rgb) * w[i]; }
          gl_FragColor = vec4(c, 1.0); }` });
    this.bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
    this.bakeCam.layers.set(2);
    this.bakeCam.layers.enable(0);   // three only casts shadows from objects the rendering camera can see...
    this.bakeHidden = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });   // ...so the ring is drawn invisibly during the bake
    // Visible part of the shadow in the main render: black with alpha = baked darkness.
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { tShadow: { value: this.rtShadow.texture }, strength: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D tShadow; uniform float strength; varying vec2 vUv;
        void main(){ vec2 e = min(vUv, 1.0 - vUv); float edge = smoothstep(0.0, 0.08, min(e.x, e.y));
          gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(texture2D(tShadow, vUv).r * strength, 0.0, 0.95) * edge); }` }));
    this.ground.renderOrder = 1;
    this.scene.add(this.ground);

    this.ringRoot = new THREE.Group();
    this.scene.add(this.ringRoot);
    this.gold = 'yellow';
    this.metalMaterial = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: IJEWEL.metalRoughness, envMapIntensity: IJEWEL.metalEnvIntensity });
    this.metalMaterial.color.setRGB(...GOLDS.yellow, THREE.LinearSRGBColorSpace);
    this.gemTuning = { ior: 2.6, dispersion: 0.02, envIntensity: 1.0, envContrast: 1.0, ...(this.opts.gem || {}) };

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

    // Bloom (glow around highlights): soft-threshold bright pass, then a down/up mip chain (dual filter).
    // Defaults = the iJewel Noya scene (ss-001.vjson): Tonemap ACESFilmic, exposure 1, contrast 1.1, saturation 1;
    // Bloom threshold 2, softThreshold 0.5, intensity 0.2, 4 iterations.
    this.look = { toneMapping: 'aces', exposure: 1.0, bloom: 0.2, bloomThreshold: 2.0, floor: 1.0, ...GRADE_DEFAULTS, ...(this.opts.look || {}) };
    this.bloomLevels = 4;
    const brt = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.rtDown = Array.from({ length: this.bloomLevels }, brt);
    this.rtUp = Array.from({ length: this.bloomLevels }, brt);
    this.brightMat = new THREE.ShaderMaterial({ vertexShader: fsVert, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.6 }, exposure: { value: 1 } },
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold, exposure; varying vec2 vUv;
        vec3 s(vec2 o){ vec4 a = texture2D(tSrc, vUv + o * texel); return a.rgb * exposure; }
        void main(){
          vec3 c = (s(vec2(-1.,-1.)) + s(vec2(1.,-1.)) + s(vec2(-1.,1.)) + s(vec2(1.,1.))) * 0.25;
          float l = max(c.r, max(c.g, c.b));
          float knee = threshold * 0.5 + 1e-4; /* softThreshold 0.5 */ float soft = clamp(l - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
          float w = max(soft, l - threshold) / max(l, 1e-4);
          gl_FragColor = vec4(min(c * w, vec3(32.0)), 1.0); }` });
    this.downMat = new THREE.ShaderMaterial({ vertexShader: fsVert, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, texel: { value: new THREE.Vector2() } },
      fragmentShader: `uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
          c += texture2D(tSrc, vUv + vec2(-1.,-1.) * texel).rgb + texture2D(tSrc, vUv + vec2(1.,-1.) * texel).rgb
             + texture2D(tSrc, vUv + vec2(-1.,1.) * texel).rgb + texture2D(tSrc, vUv + vec2(1.,1.) * texel).rgb;
          gl_FragColor = vec4(c / 8.0, 1.0); }` });
    this.upMat = new THREE.ShaderMaterial({ vertexShader: fsVert, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, tAdd: { value: null }, texel: { value: new THREE.Vector2() } },
      fragmentShader: `uniform sampler2D tSrc, tAdd; uniform vec2 texel; varying vec2 vUv;
        void main(){ vec3 c = vec3(0.0);
          c += texture2D(tSrc, vUv + vec2(-2.,0.) * texel).rgb + texture2D(tSrc, vUv + vec2(2.,0.) * texel).rgb
             + texture2D(tSrc, vUv + vec2(0.,-2.) * texel).rgb + texture2D(tSrc, vUv + vec2(0.,2.) * texel).rgb;
          c += (texture2D(tSrc, vUv + vec2(-1.,-1.) * texel).rgb + texture2D(tSrc, vUv + vec2(1.,-1.) * texel).rgb
             + texture2D(tSrc, vUv + vec2(-1.,1.) * texel).rgb + texture2D(tSrc, vUv + vec2(1.,1.) * texel).rgb) * 2.0;
          gl_FragColor = vec4(c / 12.0 + texture2D(tAdd, vUv).rgb, 1.0); }` });
    this.blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.blackTex.needsUpdate = true;

    // Output: tone mapping (selectable operator + exposure), floor plane, bloom, sRGB.
    this.outMat = new THREE.ShaderMaterial({ vertexShader: fsVert, depthTest: false, depthWrite: false,
      defines: { TM_OP: 4 },
      uniforms: { tAcc: { value: null }, tBloom: { value: this.blackTex }, bloomStrength: { value: 0 }, toneMappingExposure: { value: 1.0 },
        bg: { value: new THREE.Color(1, 1, 1) }, floorNear: { value: new THREE.Color(0.995, 0.995, 0.995) }, floorFar: { value: new THREE.Color(0.94, 0.94, 0.937) },
        floorStrength: { value: 1 }, floorScale: { value: 25 },
        gGamma: { value: 1 }, gContrast: { value: 1 }, gSaturation: { value: 1 }, gVibrance: { value: 0 }, gBurn: { value: 0 },
        gWB: { value: new THREE.Vector3(1, 1, 1) }, gHighlights: { value: 0 }, gShadows: { value: 0 }, invProjView: { value: new THREE.Matrix4() }, camPos: { value: new THREE.Vector3() } },
      fragmentShader: `uniform sampler2D tAcc, tBloom; uniform float bloomStrength; uniform vec3 bg, floorNear, floorFar, camPos;
        uniform float floorStrength, floorScale; uniform mat4 invProjView; varying vec2 vUv;
        uniform float gGamma, gContrast, gSaturation, gVibrance, gBurn, gHighlights, gShadows; uniform vec3 gWB;
        ${THREE.ShaderChunk.tonemapping_pars_fragment}
        vec3 tm(vec3 c) {
          #if TM_OP == 0 || TM_OP == 5
          return LinearToneMapping(c);   // 5 = Linear + Burn (burn is applied before, see main)
          #elif TM_OP == 1
          return ReinhardToneMapping(c);
          #elif TM_OP == 2
          return ACESFilmicToneMapping(c);
          #elif TM_OP == 3
          return AgXToneMapping(c);
          #else
          return clamp(NeutralToneMapping(c), 0.0, 1.0);
          #endif
        }
        vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        // Burn (highlight compression like FStorm / Corona): on the brightest channel so hue is kept.
        // 0 = none; 1 = strong. Shadows / mids untouched; above a knee (lower for more burn) values roll off
        // smoothly toward white instead of clipping.
        vec3 burn(vec3 c, float b) {
          float m = max(c.r, max(c.g, c.b));
          if (b <= 0.0 || m <= 0.0) return c;
          float t = 1.0 - 0.75 * clamp(b, 0.0, 1.0);
          if (m <= t) return c;
          float r = 1.0 - t;
          return c * ((t + r * (1.0 - exp(-(m - t) / r))) / m);
        }
        float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
        // Colour grade after tone mapping (display-referred, linear light in / out). Neutral values = identity.
        vec3 grade(vec3 c) {
          // iJewel / Threepipe TonemapPlugin order: contrast then saturation, right after tone mapping, in linear.
          c = (c - vec3(0.5)) * gContrast + vec3(0.5);
          c = max(vec3(0.0), mix(vec3(dot(c, vec3(0.2125, 0.7154, 0.0721))), c, gSaturation));
          float l = luma(c);
          // highlights / shadows: push luminance up or down in the top / bottom range only
          float hl = gHighlights * smoothstep(0.35, 1.0, l) * 0.35, sw = 1.0 - smoothstep(0.0, 0.45, l);
          c *= max(0.0, l + hl) / max(l, 1e-5);
          // shadows: + lifts dark areas with neutral light (no saturation boost), - crushes them
          c = gShadows >= 0.0 ? c + vec3(gShadows * sw * 0.08) : c * max(0.0, 1.0 + gShadows * 0.7 * sw);
          float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
          float sat = mx > 1e-5 ? (mx - mn) / mx : 0.0;
          c = max(vec3(0.0), mix(vec3(luma(c)), c, 1.0 + gVibrance * (1.0 - sat)));
          // gamma acts on the sRGB-encoded value, like an image editor
          vec3 e = toSRGB(clamp(c, 0.0, 1.0));
          e = pow(e, vec3(1.0 / gGamma));
          return toLin(e);
        }
        void main(){
          // Floor plane y = 0 seen through this pixel: light grey near the ring fading to white far away / at the horizon.
          vec4 pf = invProjView * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
          vec3 rd = normalize(pf.xyz / pf.w - camPos);
          vec3 back = bg;
          if (rd.y < -1e-4) {
            vec3 hit = camPos + rd * (-camPos.y / rd.y);
            float r = length(hit.xz) / floorScale;
            vec3 f = mix(floorNear, floorFar, smoothstep(1.0, 7.0, r));
            back = mix(bg, f, floorStrength * smoothstep(0.0, 0.08, -rd.y));
          }
          vec4 a = texture2D(tAcc, vUv);
          vec3 c = vec3(0.0);
          if (a.a > 1e-4) {
            vec3 h = a.rgb / a.a * gWB;                 // white balance in scene light
            h = burn(h * toneMappingExposure, gBurn) / toneMappingExposure;
            c = grade(tm(h));
          }
          c = c * a.a + toLin(back) * (1.0 - a.a);
          vec3 b = texture2D(tBloom, vUv).rgb * bloomStrength * toneMappingExposure;
          c += 1.0 - exp(-b);
          gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
        }` });
    this.accQuad = quad(this.accMat); this.outQuad = quad(this.outMat); this.fxQuad = quad(this.downMat);
  }

  setLook(patch) {
    Object.assign(this.look, patch);
    const ops = { linear: 0, reinhard: 1, aces: 2, agx: 3, neutral: 4, linburn: 5 };
    const op = ops[this.look.toneMapping] ?? 4;
    if (this.outMat.defines.TM_OP !== op) { this.outMat.defines.TM_OP = op; this.outMat.needsUpdate = true; }
    this.outMat.uniforms.toneMappingExposure.value = this.look.exposure;
    this.outMat.uniforms.floorStrength.value = this.look.floor;
    const u = this.outMat.uniforms, L = this.look;
    u.gGamma.value = L.gamma; u.gContrast.value = L.contrast; u.gSaturation.value = L.saturation; u.gVibrance.value = L.vibrance;
    u.gBurn.value = L.burn; u.gHighlights.value = L.highlights; u.gShadows.value = L.shadows;
    // temperature (-1 cool .. +1 warm) and tint (-1 green .. +1 magenta) as RGB gains, luminance kept
    const t = L.temperature, g = L.tint, wb = new THREE.Vector3(1 + 0.18 * t, 1 - 0.12 * g, 1 - 0.18 * t);
    wb.multiplyScalar(1 / (0.2126 * wb.x + 0.7152 * wb.y + 0.0722 * wb.z)); u.gWB.value.copy(wb);
    this.present();
  }

  // Re-run only the cheap output passes (tone map / bloom / floor) on the current accumulation.
  present() {
    if (!this.lastAcc) { this.needsFrame = true; return; }
    this.#postAndOutput(this.lastAcc);
  }

  #fx(mat, target) { this.fxQuad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.fxQuad, this.quadCam); }

  #postAndOutput(acc) {
    const r = this.renderer, L = this.look;
    let bloomTex = this.blackTex;
    if (L.bloom > 0) {
      this.brightMat.uniforms.tSrc.value = acc.texture;
      this.brightMat.uniforms.texel.value.set(1 / acc.width, 1 / acc.height);
      this.brightMat.uniforms.threshold.value = L.bloomThreshold;
      this.brightMat.uniforms.exposure.value = L.exposure;
      this.#fx(this.brightMat, this.rtDown[0]);
      for (let i = 1; i < this.bloomLevels; i++) {
        this.downMat.uniforms.tSrc.value = this.rtDown[i - 1].texture;
        this.downMat.uniforms.texel.value.set(0.5 / this.rtDown[i - 1].width, 0.5 / this.rtDown[i - 1].height).multiplyScalar(2);
        this.#fx(this.downMat, this.rtDown[i]);
      }
      let src = this.rtDown[this.bloomLevels - 1];
      for (let i = this.bloomLevels - 2; i >= 0; i--) {
        this.upMat.uniforms.tSrc.value = src.texture;
        this.upMat.uniforms.tAdd.value = this.rtDown[i].texture;
        this.upMat.uniforms.texel.value.set(0.5 / src.width, 0.5 / src.height);
        this.#fx(this.upMat, this.rtUp[i]);
        src = this.rtUp[i];
      }
      bloomTex = src.texture;
    }
    const u = this.outMat.uniforms, cam = this.camera;
    u.tAcc.value = acc.texture; u.tBloom.value = bloomTex; u.bloomStrength.value = L.bloom / this.bloomLevels;
    u.invProjView.value.multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
    u.camPos.value.copy(cam.position);
    r.setRenderTarget(null); r.render(this.outQuad, this.quadCam);
  }

  // Soft ground shadow, baked from many light directions into rtShadow (top-down, camera independent).
  bakeShadow() {
    if (!this.bounds) return;
    const r = this.renderer, S = this.shadowOpts;
    const size = this.bounds.getSize(new THREE.Vector3());
    const ringR = Math.max(size.x, size.z) * 0.5 + 1;
    const half = Math.max(ringR * 3.2, 30);
    this.bakeHalf = half;
    for (const m of [this.bakeCatcher, this.ground]) { m.scale.set(half * 2, 1, half * 2); m.position.set(0, 0, 0); }
    this.ground.position.y = 0.0005;
    Object.assign(this.bakeCam, { left: -half, right: half, top: half, bottom: -half });
    this.bakeCam.position.set(0, 100, 0); this.bakeCam.up.set(0, 0, -1); this.bakeCam.lookAt(0, 0, 0);
    this.bakeCam.updateProjectionMatrix();
    const L = this.bakeLight, sc = L.shadow.camera, ext = Math.max(size.x, size.y, size.z) * 0.62 + 1;
    Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 400 }); sc.updateProjectionMatrix();
    const center = this.bounds.getCenter(new THREE.Vector3());
    L.target.position.copy(center); L.target.updateMatrixWorld();
    this.bake = { center, total: S.samples * 2, done: 0 };
    const r0 = this.renderer.getRenderTarget();
    r.setRenderTarget(this.rtShadow); r.setClearColor(0x000000, 0); r.clear(); r.setRenderTarget(r0);
    this.ground.material.uniforms.strength.value = 0;
    this.outMat.uniforms.floorScale.value = Math.max(ringR, 8);
    this.reset();
  }

  // Progressive bake: a few light directions per animation frame so loading a ring never freezes the page.
  bakeStep(count) {
    const B = this.bake; if (!B || B.done >= B.total) return;
    const r = this.renderer, S = this.shadowOpts, L = this.bakeLight, center = B.center, n = S.samples;
    L.castShadow = true;
    this.ground.visible = false;
    const swapped = [];
    this.ringRoot.traverse(o => { if (o.isMesh) { swapped.push([o, o.material]); o.material = this.bakeHidden; } });
    const autoClear = r.autoClear; r.autoClear = false;
    r.setRenderTarget(this.rtShadow);
    const az0 = THREE.MathUtils.degToRad(S.keyAzimuth), el0 = THREE.MathUtils.degToRad(S.keyElevation), soft = THREE.MathUtils.degToRad(S.keySoftness);
    const dir = new THREE.Vector3();
    const end = Math.min(B.total, B.done + count);
    for (let i = B.done; i < end; i++) {
      const key = i % 2 === 0, j = i >> 1;
      const hx = halton(key ? 2 : 5, j), hy = halton(key ? 3 : 7, j);
      if (key) {   // area key light: disc of directions around (azimuth, elevation)
        const rr = Math.sqrt(hx) * soft, th = hy * 2 * Math.PI;
        const el = el0 + rr * Math.sin(th), az = az0 + rr * Math.cos(th) / Math.max(0.2, Math.cos(el0));
        dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      } else {     // sky: cosine-weighted hemisphere, clipped to 75 deg from zenith
        const rr = Math.sqrt(hx) * Math.sin(THREE.MathUtils.degToRad(75)), th = hy * 2 * Math.PI;
        dir.set(rr * Math.cos(th), Math.sqrt(1 - rr * rr), rr * Math.sin(th));
      }
      L.position.copy(center).addScaledVector(dir, 200); L.updateMatrixWorld();
      this.bakeCatcher.material.opacity = (key ? S.key : S.ao) / n;
      r.shadowMap.needsUpdate = true;
      r.render(this.scene, this.bakeCam);
    }
    B.done = end;
    if (B.done >= B.total) {   // finished: one small separable blur hides the sample pattern, contact stays crisp
      const px = (this.opts.shadowBlur ?? 1.2) / this.bakeSize;
      this.shadowBlurMat.uniforms.tSrc.value = this.rtShadow.texture; this.shadowBlurMat.uniforms.dir.value.set(px, 0);
      this.#fx(this.shadowBlurMat, this.rtShadowTmp);
      this.shadowBlurMat.uniforms.tSrc.value = this.rtShadowTmp.texture; this.shadowBlurMat.uniforms.dir.value.set(0, px);
      this.#fx(this.shadowBlurMat, this.rtShadow);
    }
    L.castShadow = false;
    this.ground.visible = true;
    for (const [o, m] of swapped) o.material = m;
    r.autoClear = autoClear;
    r.setRenderTarget(null);
    // Partial bake: scale up so the shadow has its final darkness from the first step (just noisier).
    this.ground.material.uniforms.strength.value = B.total / Math.max(1, B.done);
    this.reset();
  }

  // Metal seen from inside the stone: a small cube map of the ring's metal captured from the stone centre.
  // The diamond shader mixes it over the sharp HDR wherever metal (prongs / band) is in that direction.
  captureGemCube() {
    this.cubeDirty = false;
    if (!this.gemMesh || !this.diamond || !this.opts.metalInStone) return;
    if (!this.cubeRT) {
      this.cubeRT = new THREE.WebGLCubeRenderTarget(this.opts.cubeSize || 256, { type: THREE.HalfFloatType, generateMipmaps: false });
      this.cubeCam = new THREE.CubeCamera(0.05, 500, this.cubeRT);
      this.cubeCam.layers.set(0);
    }
    const r = this.renderer;
    const c = new THREE.Box3().setFromObject(this.gemMesh).getCenter(new THREE.Vector3());
    this.cubeCam.position.copy(c); this.cubeCam.updateMatrixWorld(true);
    const vis = [this.gemMesh, this.ground]; vis.forEach(o => o.visible = false);
    const prevClear = r.getClearColor(new THREE.Color()), prevAlpha = r.getClearAlpha();
    r.setClearColor(0x000000, 0);
    this.cubeCam.update(r, this.scene);
    r.setClearColor(prevClear, prevAlpha);
    vis.forEach(o => o.visible = true);
    this.diamond.uniforms.metalCube.value = this.cubeRT.texture;
    this.diamond.uniforms.metalMix.value = this.opts.metalInStone ?? 0.35;
  }

  async loadEnvironment(url, { saturation = 0.15, exposure = 1.0, target = 'both', lift = 0, isCurrent = () => true } = {}) {
    // Load as float, neutralise the room colour (jewellery studios are grey/white), store as half float
    // (half-float linear filtering works on every phone; float does not on iOS).
    const src = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(url);
    if (!isCurrent()) { src.dispose(); return false; }   // a newer pick replaced this one while it downloaded
    const { width, height, data } = src.image;
    const half = new Uint16Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b + lift;
      half[i * 4] = THREE.DataUtils.toHalfFloat((l + (r + lift - l) * saturation) * exposure);
      half[i * 4 + 1] = THREE.DataUtils.toHalfFloat((l + (g + lift - l) * saturation) * exposure);
      half[i * 4 + 2] = THREE.DataUtils.toHalfFloat((l + (b + lift - l) * saturation) * exposure);
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
      this.cubeDirty = true;
      if (target === 'metal') { hdr.dispose(); this.reset(); return; }
    }
    this.envHDR?.dispose?.();
    this.envHDR = hdr;
    if (this.diamond) this.diamond.uniforms.envMap.value = hdr;
    this.reset();
  }

  setEnvRotation(rad) { this.setMetalRotation(rad); this.setDiamondRotation(rad); }
  // Metal HDRI rotation (radians, about the vertical axis). The ground key light turns with it, so the shadow
  // keeps falling away from the HDRI's main light.
  setMetalRotation(rad) {
    this.metalRotation = rad;
    this.scene.environmentRotation.set(0, rad, 0);
    this.cubeDirty = true;
    const az = this.shadowOpts.baseAzimuth ?? (this.shadowOpts.baseAzimuth = this.shadowOpts.keyAzimuth);
    this.shadowOpts.keyAzimuth = az + THREE.MathUtils.radToDeg(rad - (this.opts.metalRotationRef || 0));
    clearTimeout(this._rebake); this._rebake = setTimeout(() => this.bakeShadow(), 120);
    this.reset();
  }
  setDiamondRotation(rad) {
    this.envRotation = rad;
    if (this.diamond) this.diamond.uniforms.envRotation.value = -rad / (2 * Math.PI);
    this.reset();
  }

  setGold(name) {
    this.gold = name;
    this.metalMaterial.color.setRGB(...GOLDS[name], THREE.LinearSRGBColorSpace);
    this.cubeDirty = true;
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
    if (pose === 'flat' && this.gemMesh) {
      // Turn the resting ring about the vertical so the stone faces the camera (+Z), for every ring.
      // (The converter's rest pose leaves the yaw arbitrary: round 2 ct lay with its head turned away.)
      h.updateMatrixWorld(true);
      const all = exactBounds(h).getCenter(new THREE.Vector3()), gem = exactBounds(this.gemMesh).getCenter(new THREE.Vector3());
      const yaw = Math.atan2(gem.x - all.x, gem.z - all.z);
      if (Math.hypot(gem.x - all.x, gem.z - all.z) > 1e-4) h.matrix.premultiply(new THREE.Matrix4().makeRotationY(-yaw));
    }
    // Measure with the ring root at the origin: the previous ring / pose offset must not leak into the new one
    // (it did before: the old offset was added to the new bounds, so each ring floated or sank by the last one's offset).
    this.ringRoot.position.set(0, 0, 0);
    this.ringRoot.updateMatrixWorld(true);
    // Exact bounds from every vertex after the pose rotation. (Box3.setFromObject without `precise` rotates
    // each mesh's local bounding box, whose corners reach below the real ring: the ring floated ~3-5 mm.)
    const box = exactBounds(h);
    const c = box.getCenter(new THREE.Vector3());
    this.ringRoot.position.set(-c.x, -box.min.y, -c.z);   // lowest real vertex sits exactly on the floor (y = 0)
    this.ringRoot.updateMatrixWorld(true);
    this.bounds = exactBounds(this.ringRoot);
    if (this.gemMesh) this.diamond.syncObject(this.gemMesh);
    this.bakeShadow();
    this.cubeDirty = true;
    this.reset();
  }

  // Front three-quarter view like the iJewel page: head facing the camera, elevated, ring framed
  // so it fills `fill` of the viewer width (screen-space fit, so it is centred whatever the pose).
  frontView({ elevation = 18, azimuth = -24, fill = 0.5, lower = 0.12 } = {}) {
    if (!this.bounds) return;
    const el = THREE.MathUtils.degToRad(elevation), az = THREE.MathUtils.degToRad(azimuth);
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const center = this.bounds.getCenter(new THREE.Vector3());
    // Real silhouette points (every ~40th vertex) rather than the box corners.
    const pts = [];
    this.ringRoot.updateMatrixWorld(true);
    this.ringRoot.traverse(o => {
      if (!o.isMesh || o.userData.noBounds) return;
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
    // Sit the ring a little below the centre like the iJewel page (room for the shadow to fall forward).
    { cam.position.copy(target).addScaledVector(dir, dist); cam.lookAt(target); cam.updateMatrixWorld();
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(up, lower * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist); }
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
    for (let i = 0; i < this.bloomLevels; i++) { const d = 2 ** (i + 1); this.rtDown[i].setSize(Math.max(1, pw / d | 0), Math.max(1, ph / d | 0)); this.rtUp[i].setSize(Math.max(1, pw / d | 0), Math.max(1, ph / d | 0)); }
    this.lastAcc = null;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.size = [pw, ph];
    this.reset();
  }

  renderFrame() {
    const r = this.renderer, cam = this.camera, [w, h] = this.size;
    if (this.gemMesh) this.diamond.syncObject(this.gemMesh);
    if (this.cubeDirty) this.captureGemCube();
    if (this.diamond) this.diamond.uniforms.bounceLimit.value = this.moving ? this.opts.motionBounces : this.opts.bounces;
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
    this.lastAcc = dst;
    this.#postAndOutput(dst);
    // While the user drags, keep re-rendering frame 0 (no accumulation) at reduced bounces.
    if (!this.moving) this.frame++;
  }

  #loop() {
    const tick = () => {
      requestAnimationFrame(tick);
      const moved = this.controls.update();
      const now = performance.now();
      // Ignore the last, invisible part of the damping tail (it can last seconds on slow GPUs).
      const cp = this.camera.position, lp = this._lastCam || (this._lastCam = cp.clone());
      const visible = moved && cp.distanceTo(lp) > cp.distanceTo(this.controls.target) * 4e-4;
      lp.copy(cp);
      if (visible) { this.lastMove = now; if (!this.moving) { this.moving = true; } this.reset(); }
      else if (this.moving && now - this.lastMove > 140) { this.moving = false; this.reset(); }
      if (!this.holder || !this.envHDR) return;
      if (this.bake && this.bake.done < this.bake.total) this.bakeStep(this.opts.bakePerFrame || 32);
      if (this.moving || this.frame < this.opts.maxFrames) {
        this.renderFrame();
        this.stats.frames++; this.stats.last = now - (this.stats.prev || now); this.stats.prev = now;
        if (this.frame === this.opts.maxFrames) this.dispatchEvent(new Event('converged'));
      }
    };
    tick();
  }
}

export function exactBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse(o => {
    if (!o.isMesh || o.userData.noBounds || !o.visible) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) box.expandByPoint(v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld));
  });
  return box;
}

function deinterleave(attr) {
  const n = attr.count, s = attr.itemSize, out = new Float32Array(n * s);
  for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) out[i * s + j] = attr.getComponent(i, j);
  return new THREE.BufferAttribute(out, s);
}
