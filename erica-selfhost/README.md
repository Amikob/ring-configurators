# Erica — self-hosted pilot (experimental, unlisted, noindex)

Erica ring set **with its matching bands** running on our own engine (a copy of the `noya-selfhost` v9 engine:
three.js + BVH ray-traced diamonds, baked floor shadow, HDRI picker / rotation, tone map, advanced colour).
Everything is served from this repo (GitHub Pages). **Nothing is uploaded to iJewel and it uses no iJewel storage.**
The live Erica page (`/erica/`) and its iJewel project are untouched.

## Catalogue (same as `/erica/`)
- 8 shapes (elongated cushion, elongated radiant, emerald, old-cut cushion, oval, marquise, square cushion,
  square radiant) x 3-7 ct = 40 rings (centre stone + 4 side stones).
- Matching band: none / Plain / Half Eternity. Band group by shape: A (elocshn, elordnt, emrld, oldctcshn, oval),
  B (mrqs), C (sqrcshn, sqrrdnt); 22 band files cover group x carat x style.
- Ring gold and band gold are independent (white / yellow / rose).
- Pose: upright (default, like `/erica/`) or Rest. Ring alone rests in its most stable pose; ring + band lies like
  the live page: finger axis vertical, band on top, tipped onto head edge + shank (most stable pose of the set
  closest to "band up").
- URL: `?shape=oval&ct=3&band=plain|pave|none&gold=yellow&bgold=rose&pose=flat` (+ all noya-selfhost look params:
  `hdri=1`, `metalrot`, `diamondrot`, `tm`, `exposure`, `bloom`, `floor`, grade params, `q`, ...).

## Models (`models/`)
- Source: the 62 GLBs the live Erica page loads (its saved iJewel project, `RingConfigurator` Ring / Band
  components), downloaded read-only. No original .3dm was on the box.
- Repacked by `/workspace/erica-sh/repack.mjs` (kept outside the repo): Draco -> meshopt, every material renamed
  `Metal 01` / `Gem 01` so our engine applies its own metal and diamond materials, stone normals dropped (flat facet
  normals are computed at load). **No mesh reduction.** Instanced prongs / pave stones stay instanced.
- `manifest.json`: rings (+ offline resting pose), bands, band groups, and `setRest` (resting pose of every
  ring + band combination). Built by `flatten.mjs` + `rest.py` + `setrest.py` (trimesh stable poses).
- No separate ND-mark mesh exists in the Erica GLBs (nothing to hide).

## Engine differences from noya-selfhost
- `viewer.loadSet(ringUrl, bandUrl, { rest, setRest })` loads ring and band in place (same model frame); all stones
  (centre, side stones, pave) are merged into one geometry traced by one diamond material.
- Separate band metal material (`setBandGold`).
- Defaults: env rotations 0 / 0 and floor-shadow light azimuth 45 / elevation 34 deg (the iJewel ground light in the
  Erica frame), upright camera from the band side (el 50, az 155).

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
