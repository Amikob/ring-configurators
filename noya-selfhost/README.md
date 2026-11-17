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

## v9 — iJewel defaults + HDRI rotation

- **HDRI rotation** (Lighting & tone panel): `Metal rot.` / `Diam. rot.` sliders, 0–359°, optional *Lock rotations
  together*; stored in the URL as `?metalrot=&diamondrot=` (degrees; defaults 120 / 0 are left out of the URL).
  The baked floor shadow's key light turns with the metal HDRI (re-baked 120 ms after the slider stops). `?rot=`
  (old, radians, both) still works.
- **Defaults copied from the iJewel Noya scene** (live viewer probe + `ss-001.vjson`, `*.pmat`, `*.dmat`,
  `ground-shadow-backleft.json`): ACES Filmic, exposure 1, contrast 1.1 and saturation 1 applied in linear right after
  the tone map (Threepipe TonemapPlugin order, Apache-2.0 — our own GLSL, no code copied); bloom 0.2, threshold 2, soft
  knee 0.5, 4 levels; metal env `env_metal_002` at intensity 1, roughness 0; diamond env `env-gem-001` at 1.3,
  IOR 2.6, 5 bounces; floor shadow light from the iJewel randomized light (azimuth 225°, elevation 34° on our side).
- Metal colours start from the iJewel hex values (#e5b377 / #f2af83 / #c2c2c3); yellow and rose are deeper (see
  viewer.js) because iJewel's SSR gold-in-gold reflections are not reproduced.
- Rest pose: every ring is turned so the stone faces the camera (fixes round 2 ct lying head-away); flat view is now
  el 20°, az 0° like iJewel's camera.
- Test overrides: `?ior=`, `?disp=`, `?keyaz=`, `?mcolor=<gold>:r,g,b` (linear).
