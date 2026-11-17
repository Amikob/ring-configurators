// Self-hosted diamond shader (MIT-licensed building blocks only: three.js + three-mesh-bvh).
// Shared engine file: identical copy in noya-selfhost/ and erica-selfhost/ (source: tools/selfhost/engine/).
//
// Per pixel: front-face Fresnel reflection, refraction into the stone, then up to N internal bounces traced
// against the stone's own BVH. The environment is the raw full-resolution equirect HDR (linear half float,
// no PMREM blur, no clamping), so softbox reflections stay razor sharp.
//
// Two ways to let light out of the stone:
//  - "studio" (default, like iJewel / WebGi): each pixel follows ONE path and leaves at the first face it can
//    refract through, with full weight. Every facet maps to one spot of the studio HDRI, so a facet is either
//    a bright softbox (white) or the dark studio (black): high local contrast, crisp facets.
//  - "physical" (exitMix = 1): exact energy split, at every internal hit a Fresnel fraction leaves and the rest
//    reflects. Correct on average, but each pixel becomes the mean of many HDRI directions = mid grey, which is
//    what made our stones look milky / washed out next to iJewel.
// exitMix blends the two (0 = studio, 1 = physical).
// Dispersion: R/G/B leave with their own IOR (fire). Grade: colour = pow(colour, gamma) * boost (WebGi's
// gammaFactor / boostFactors), absorption tints by path length.
import { ShaderMaterial, Matrix4, Vector3 } from 'three';
import { MeshBVHUniformStruct, BVHShaderGLSL } from 'three-mesh-bvh';

export const DIAMOND_DEFAULTS = {
  ior: 2.6, dispersion: 0.012, envIntensity: 1.5, envContrast: 1.15, gamma: 1.0, boost: 1.0, reflectivity: 1.0,
  exitMix: 0.0, absorption: 0.0, metalMix: 0.0,
};

export class DiamondMaterial extends ShaderMaterial {
  constructor({ bvh, envMap, bounces = 7, color = new Vector3(1, 1, 1), ...rest } = {}) {
    const P = { ...DIAMOND_DEFAULTS, ...rest };
    const bvhUniform = new MeshBVHUniformStruct();
    bvhUniform.updateFrom(bvh);
    super({
      defines: { BOUNCES: Math.max(1, bounces | 0) },
      uniforms: {
        bvh: { value: bvhUniform },
        envMap: { value: envMap },
        envRotation: { value: 0 },
        envIntensity: { value: P.envIntensity },
        envContrast: { value: P.envContrast },
        ior: { value: P.ior },
        dispersion: { value: P.dispersion },
        gamma: { value: P.gamma },
        boost: { value: P.boost },
        reflectivity: { value: P.reflectivity },
        exitMix: { value: P.exitMix },
        absorption: { value: P.absorption },
        tint: { value: color },
        objToWorld: { value: new Matrix4() },
        worldToObj: { value: new Matrix4() },
        rayEps: { value: 1e-3 },
        stoneSize: { value: 1 },
        bounceLimit: { value: bounces },
        metalCube: { value: null },
        metalMix: { value: P.metalMix },
      },
      vertexShader: /* glsl */`
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        #include <common>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        precision highp isampler2D;
        precision highp usampler2D;
        ${BVHShaderGLSL.common_functions}
        ${BVHShaderGLSL.bvh_struct_definitions}
        ${BVHShaderGLSL.bvh_ray_functions}
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        uniform BVH bvh;
        uniform sampler2D envMap;
        uniform float envRotation, envIntensity, envContrast, ior, dispersion, rayEps, gamma, boost, reflectivity, exitMix, absorption, stoneSize;
        uniform vec3 tint;
        uniform int bounceLimit;
        uniform samplerCube metalCube;
        uniform float metalMix;
        uniform mat4 objToWorld, worldToObj;
        const float PI_ = 3.14159265359;

        vec3 env(vec3 d) {
          float u = atan(d.z, d.x) / (2.0 * PI_) + 0.5 + envRotation;
          float v = asin(clamp(d.y, -1.0, 1.0)) / PI_ + 0.5;
          vec3 c = textureLod(envMap, vec2(fract(u), v), 0.0).rgb;
          c = pow(max(c, vec3(0.0)), vec3(envContrast)) * envIntensity;
          if (metalMix > 0.0) {   // metal (prongs / band) seen from inside the stone
            vec4 m = textureLod(metalCube, d, 0.0);
            c = mix(c, m.rgb, clamp(m.a, 0.0, 1.0) * metalMix);
          }
          return c;
        }
        // Exact unpolarised Fresnel reflectance. cosi = cos of incident angle, eta = n_from / n_to.
        float fresnel(float cosi, float eta) {
          float sint2 = eta * eta * (1.0 - cosi * cosi);
          if (sint2 >= 1.0) return 1.0;
          float cost = sqrt(1.0 - sint2);
          float rs = (eta * cosi - cost) / (eta * cosi + cost);
          float rp = (cosi - eta * cost) / (cosi + eta * cost);
          return 0.5 * (rs * rs + rp * rp);
        }
        vec3 toWorld(vec3 d) { return normalize(mat3(objToWorld) * d); }
        void main() {
          vec3 V = normalize(vWorldPos - cameraPosition);
          vec3 N = normalize(vWorldNormal);
          if (dot(N, V) > 0.0) N = -N;
          float cosi = clamp(-dot(V, N), 0.0, 1.0);
          float Fr = clamp(fresnel(cosi, 1.0 / ior) * reflectivity, 0.0, 1.0);
          vec3 col = Fr * env(reflect(V, N));

          vec3 iorRGB = vec3(ior - dispersion * 0.5, ior, ior + dispersion * 0.5);
          vec3 d = normalize(mat3(worldToObj) * refract(V, N, 1.0 / ior));
          vec3 o = (worldToObj * vec4(vWorldPos, 1.0)).xyz + d * rayEps;
          vec3 studio = vec3(0.0), phys = vec3(0.0);
          float thr = 1.0, path = 0.0;
          bool out_ = false;
          for (int i = 0; i < BOUNCES; i++) {
            if (i >= bounceLimit) break;
            uvec4 faceIndices = uvec4(0u);
            vec3 faceNormal = vec3(0.0, 0.0, 1.0);
            vec3 bary = vec3(0.0);
            float side = 1.0, dist = 0.0;
            bool hit = bvhIntersectFirstHit(bvh, o, d, faceIndices, faceNormal, bary, side, dist);
            if (!hit) { vec3 e = env(toWorld(d)); studio = e; phys += thr * e; thr = 0.0; out_ = true; break; }
            path += dist;
            vec3 n = normalize(faceNormal);
            if (dot(n, d) < 0.0) n = -n;          // outward w.r.t. travel direction
            vec3 p = o + d * dist;
            float c = dot(d, n);
            float Fg = fresnel(c, ior);
            if (Fg < 1.0) {
              // Light leaving here, per channel (dispersion). A channel past its own critical angle takes the
              // mirror direction instead, so fire never turns into black holes.
              vec3 ex = vec3(0.0);
              for (int k = 0; k < 3; k++) {
                vec3 t = refract(d, -n, iorRGB[k]);
                if (dot(t, t) < 1e-6) t = reflect(d, -n);
                ex[k] = env(toWorld(t))[k];
              }
              if (!out_) { studio = ex; out_ = true; }
              phys += thr * (1.0 - Fg) * ex;
              if (exitMix <= 0.0) { thr = 0.0; break; }
            }
            thr *= Fg;
            d = reflect(d, -n);
            o = p + d * rayEps;
            if (thr < 0.01) break;
          }
          vec3 tail = env(toWorld(d));
          if (!out_) studio = tail;
          phys += thr * tail;
          vec3 inside = mix(studio, phys, clamp(exitMix, 0.0, 1.0));
          inside *= exp(-absorption * path / max(stoneSize, 1e-4) * (vec3(1.0) - tint));
          inside = pow(max(inside, vec3(0.0)), vec3(gamma)) * boost;
          col += (1.0 - Fr) * inside * tint;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.bvhUniform = bvhUniform;
  }
  // Call before render when the object moves.
  syncObject(mesh) {
    this.uniforms.objToWorld.value.copy(mesh.matrixWorld);
    this.uniforms.worldToObj.value.copy(mesh.matrixWorld).invert();
  }
}
