// Self-hosted diamond shader (MIT-licensed building blocks only: three.js + three-mesh-bvh).
// Per pixel: front-face Fresnel reflection, refraction into the stone, then up to N internal
// bounces traced against the stone's own BVH. At every internal hit the light that leaves the
// stone is added with exact dielectric Fresnel, per colour channel (R/G/B use different IORs,
// so the exit rays split = dispersion / "fire"); the rest reflects (total internal reflection
// when the angle is past critical). The environment is sampled from the raw equirect HDR (no blur)
// so softbox reflections stay razor sharp like a jewellery studio photo.
import { ShaderMaterial, Matrix4, Vector3, Vector2 } from 'three';
import { MeshBVHUniformStruct, BVHShaderGLSL } from 'three-mesh-bvh';

export class DiamondMaterial extends ShaderMaterial {
  constructor({ bvh, envMap, bounces = 7, ior = 2.418, dispersion = 0.035, envIntensity = 1.0, color = new Vector3(1, 1, 1) } = {}) {
    const bvhUniform = new MeshBVHUniformStruct();
    bvhUniform.updateFrom(bvh);
    super({
      defines: { BOUNCES: bounces },
      uniforms: {
        bvh: { value: bvhUniform },
        envMap: { value: envMap },
        envRotation: { value: 0 },
        envIntensity: { value: envIntensity },
        envContrast: { value: 1.0 },
        ior: { value: ior },
        dispersion: { value: dispersion },
        tint: { value: color },
        objToWorld: { value: new Matrix4() },
        worldToObj: { value: new Matrix4() },
        rayEps: { value: 1e-3 },
        bounceLimit: { value: bounces },
        metalCube: { value: null },
        metalMix: { value: 0 },
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
        uniform float envRotation, envIntensity, envContrast, ior, dispersion, rayEps;
        uniform vec3 tint;
        uniform int bounceLimit;
        uniform samplerCube metalCube;
        uniform float metalMix;
        uniform mat4 objToWorld, worldToObj;
        const float PI_ = 3.14159265359;

        vec3 env(vec3 d) {
          float u = atan(d.z, d.x) / (2.0 * PI_) + 0.5 + envRotation;
          float v = asin(clamp(d.y, -1.0, 1.0)) / PI_ + 0.5;
          vec3 c = pow(textureLod(envMap, vec2(fract(u), v), 0.0).rgb, vec3(envContrast)) * envIntensity;
          // Metal (prongs / band) seen from inside the stone, from the cube map captured at the stone centre.
          vec4 m = textureLod(metalCube, d, 0.0);
          return mix(c, m.rgb, clamp(m.a, 0.0, 1.0) * metalMix);
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
        void main() {
          vec3 V = normalize(vWorldPos - cameraPosition);
          vec3 N = normalize(vWorldNormal);
          if (dot(N, V) > 0.0) N = -N;
          float cosi = clamp(-dot(V, N), 0.0, 1.0);
          float Fr = fresnel(cosi, 1.0 / ior);
          vec3 col = Fr * env(reflect(V, N));

          vec3 iorRGB = vec3(ior - dispersion * 0.5, ior, ior + dispersion * 0.5);
          // Refract in (green IOR), continue in object space.
          vec3 d = normalize(mat3(worldToObj) * refract(V, N, 1.0 / ior));
          vec3 o = (worldToObj * vec4(vWorldPos, 1.0)).xyz + d * rayEps;
          vec3 inside = vec3(0.0);
          float thr = 1.0;
          for (int i = 0; i < BOUNCES; i++) {
            if (i >= bounceLimit) break;
            uvec4 faceIndices = uvec4(0u);
            vec3 faceNormal = vec3(0.0, 0.0, 1.0);
            vec3 bary = vec3(0.0);
            float side = 1.0, dist = 0.0;
            bool hit = bvhIntersectFirstHit(bvh, o, d, faceIndices, faceNormal, bary, side, dist);
            if (!hit) { inside += thr * env(normalize(mat3(objToWorld) * d)); thr = 0.0; break; }
            vec3 n = normalize(faceNormal);
            if (dot(n, d) < 0.0) n = -n;          // outward w.r.t. travel direction
            vec3 p = o + d * dist;
            float c = dot(d, n);
            // Light leaving the stone here, per channel (dispersion).
            for (int k = 0; k < 3; k++) {
              float e = iorRGB[k];
              float Fk = fresnel(c, e);
              if (Fk < 1.0) {
                vec3 t = refract(d, -n, e);
                vec3 w = normalize(mat3(objToWorld) * t);
                inside[k] += thr * (1.0 - Fk) * env(w)[k];
              }
            }
            thr *= fresnel(c, ior);
            d = reflect(d, -n);
            o = p + d * rayEps;
            if (thr < 0.01) break;
          }
          inside += thr * env(normalize(mat3(objToWorld) * d));
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
