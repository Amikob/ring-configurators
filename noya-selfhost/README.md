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

## Engine v11: look fixes + Studio panel (17 Nov 2026)
Shared engine: `tools/selfhost/engine/` (viewer.js, diamond-material.js, studio.js, studio.css), copied into
`noya-selfhost/` and `erica-selfhost/` by `tools/selfhost/sync-engine.sh`. Edit there, then sync, so both pages stay identical.

### Why the diamonds looked washed out (root causes found)
Checked and fine: HDR decode (RGBE/EXR values match the source EXRs to 0.02%), env textures are linear half float
(no double sRGB, no 8-bit storage, no clamping), render targets are half float before tone mapping, the diamond samples the
raw equirect (not PMREM), tone mapping is not applied to the background, one sRGB encode at the end.
Actual causes:
1. **Energy-split exit in the diamond shader.** At every internal hit a Fresnel fraction left the stone and the rest
   bounced on, so each pixel was the average of 5+ HDRI directions = mid grey. iJewel/WebGi follow one path and leave at
   the first face the ray can refract through. New default "Studio" light model does that (each facet = one spot of the
   studio: white softbox or dark studio). "Physical" (old behaviour) and a mix stay in the Studio panel.
2. **HDR averaging.** Hardware MSAA resolved raw HDR (a dark facet line next to a 30x-white facet became white), and the
   progressive accumulation averaged raw HDR. Converging frames now render without MSAA and accumulate in Karis
   reversible tone-mapped space (c/(1+max c)).
3. **Metal mixed into the stone** (metal cube map at 35%) tinted stones gold/rose (stone chroma 5.3 vs iJewel 1.3). Off by default.
4. **Bloom 0.2 / threshold 2** spread facet and metal highlights (up to 50-280x) into a haze over the stone. Default now
   0.08 / 5 (keeps glints).
5. **Erica exposure 0.7** (used last round to darken the gold) greyed the diamonds. Exposure is back to 1; the metal is
   dimmed with its own HDRI intensity (scene.environmentIntensity) instead.
6. Gem HDRI (env-gem-001) is now the full 2048x1024 map (was 1024x512).
Diamond env intensity 1.5 x the map's 1.3 and env contrast 1.15: calibrated so the stone's lightness distribution
matches live iJewel (median L* 87 vs live 86, emerald 5 ct, same camera, our exact stone mask registered onto the live shot).

### Gold
Yellow / rose / white are the iJewel material colours converted sRGB -> linear exactly (yellow [0.784, 0.451, 0.185]).
The previous yellow [0.72, 0.37, 0.155] (picked by mean colour deltaE) was 3-4 deg more orange than iJewel in every
lightness band. Hue angle (LCh) of gold pixels per lightness band is checked against live iJewel (README numbers in the report).

### Studio panel (Ring | Studio tab, or the "Studio" button)
iJewel Playground-style configuration panel: Environment (metal and diamond HDRI thumbnails, intensity, rotation, lock,
background), Tone mapping (operator, exposure, contrast, saturation, advanced grade), Bloom, Ground (floor, shadow,
softness), Metal (colour picker per gold, roughness), Diamond (light model, exit mix, env intensity / contrast, IOR,
dispersion, bounces, reflectivity, gamma, boost, metal in stone), Render (AA frames), Presets (save in this browser,
export / import JSON, copy settings link `#look=...`, reset). Old URL params (exposure, bloom, tm, metalenv, ...) still work.
