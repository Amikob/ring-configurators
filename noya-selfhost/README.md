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

## v8 (Nov 16 2026)

- Floor: the ring rests on a visible floor plane (y = 0), drawn in the output pass (light grey, lighter around
  the ring, fading toward the horizon). `?floor=0..1.5` or the Floor slider.
- Ground shadow: baked once per ring / pose into a 512² texture (camera independent, so it is always soft,
  even while dragging): 128 jittered area-key-light directions + 128 sky directions (contact / ambient occlusion),
  spread over a few frames, then a small blur. Mobile uses 96 + 96.
- Bloom: soft-threshold bright pass + 5-level down/up blur, added after tone mapping. `?bloom=` (default 0.12).
- Tone mapping: Neutral (default) / ACES / AgX / Reinhard / Linear, plus exposure, in the HDRI panel.
  `?tm=neutral|aces|agx|reinhard|linear&exposure=1.0`. Defaults are left out of the URL.
- Metal inside the stones: a cube map of the ring's metal captured from the stone centre is mixed into the
  diamond's environment lookups (prongs / band show through and reflect). `?metalstone=0..1` (default 0.35).
- Gold F0 colours retuned against the iJewel Noya page (median gold pixel ratios): yellow 1/0.74/0.36, rose 0.98/0.68/0.43.
- Adaptive quality: phones (coarse pointer or small screen, or `?mobile=1`) get 5 bounces, pixel ratio cap 1.5,
  32 accumulation frames, 128² metal cube; while dragging every device drops to 3-4 bounces without accumulation.
