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
