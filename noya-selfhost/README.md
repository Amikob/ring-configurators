# Noya - self-hosted pilot (no iJewel)

Pilot of a fully self-owned ring viewer. Nothing here calls iJewel: models, environment maps,
engine and shaders are all served from this repo (GitHub Pages).

- Engine: three.js r187 (MIT) + three-mesh-bvh 0.9 (MIT), vendored in `vendor/`.
- Diamonds: `diamond-material.js` - per-pixel ray tracing inside each stone against its own BVH
  (7 internal bounces, exact Fresnel, total internal reflection, per-channel IOR for dispersion).
- Anti-aliasing: progressive jittered accumulation (48 frames when the ring is still), like WebGi's TAA.
- Metals: physically based metal (F0 colours for white / yellow / rose 18k) lit by a CC0 HDRI.
- Environment maps: `env/studio.hdr` (diamonds, Poly Haven "Brown Photostudio 02", CC0) and
  `env/metal.hdr` (metals, Poly Haven "Studio Small 09", CC0).
- Models: `models/*.glb`, converted on the box from Koby's .3dm files
  (`tools/selfhost/3dm2glb.py`, layers `Gem*` = diamond, `Metal*` = gold, 0% mesh reduction),
  then meshopt-compressed (`tools/selfhost/pack-glb.mjs`). 40 rings = about 8 MB.
- Resting pose: most stable pose of the ring, computed offline by the converter.

URL options: `?shape=oval&ct=3&gold=yellow&pose=flat|upright`, `?tune=1` shows diamond sliders,
`?frames=N`, `?bounces=N`, `?q=1|1.5|2`.
