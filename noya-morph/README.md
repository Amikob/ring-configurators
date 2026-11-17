# Noya - live carat slider pilot (mesh morph, no iJewel)

Unlisted test page (noindex). One 3 ct oval file; a slider (1.00-6.00 ct, step 0.05) re-shapes the stone and the
head live in the browser. Engine = a copy of `noya-selfhost` v9 (three.js + own diamond shader). Nothing here touches
`noya-selfhost/`, `erica-selfhost/` or any live page.

## How the morph works (`morph-core.js`)
- Stone: uniform scale s = cbrt(ct / 3) (carat ~ volume) about a pivot on the stone axis; the BVH stays in object
  space, so the diamond shader just follows the mesh matrix (no rebuild per frame).
- Metal: every vertex moves by (s - 1) * U(v). U is computed once from the anchors: a smooth head mask
  (smoothstep between "head starts" and "fully moving" heights, holes around FIXED points) times the stone's own
  similarity field; outside the girdle the motion becomes a pure radial translation, and PRONG points move their
  neighbourhood rigidly in the horizontal plane (cross-section kept). Normals use the precomputed Jacobian of U.
- Because the head moves with the same similarity as the stone, stone/metal contact is preserved: measured overlap
  0.000 mm from 1.5 to 7 ct (0.04 mm on 12 vertices at 1 ct). Calibrated on the real 2/4/5/6 ct files.
- Cost: one multiply-add per coordinate (~1-3 ms for 13 k vertices on CPU), then floor re-contact (lowest vertex),
  shadow re-bake and stone cube map debounced 160 ms. The camera never moves.

## Accuracy vs the modeller's real files (head only, symmetric surface distance)
See `anchors/oval-accuracy.json` (regenerate with the Node check). From the 3 ct file:
| ct | morph mean / p95 / max (mm) | no morph (just the 3 ct head) |
|---|---|---|
| 2 | 0.13 / 0.28 / 0.41 | 0.19 / 0.47 / 0.67 |
| 4 | 0.08 / 0.16 / 0.28 | 0.19 / 0.54 / 0.74 |
| 5 | 0.14 / 0.32 / 0.52 | 0.33 / 1.02 / 1.38 |
| 6 | 0.16 / 0.39 / 0.57 | 0.48 / 1.41 / 1.69 |
Stone vs real stone: 0.06-0.26 mm mean (the modellers placed / cut the 2 and 4 ct stones slightly differently).

"Nearest file + morph" uses the closest real file (2-6 ct) and morphs at most +-0.5 ct; switching file at x.5 ct is a
0.08-0.14 mm mean (max 0.42 mm) jump.

## Page options
`?ct=4.25`, `?gold=white|yellow|rose`, `?mode=hybrid`, `?view=ghost|error|weights`, `?real=1` (show the real file of
that carat instead of the morph, for comparisons), `?pose=upright`, `?edit=1` (anchor editor).

## Anchor editor (`?edit=1`)
Tools: Look (orbit), Stone centre, Fixed, Prong, Delete; point radius; head start / fully moving heights; scale
pivot; translate-vs-scale outside the stone. Live overlap readout. "Download anchors JSON" -> save as
`anchors/oval.json`. Anchors are authored on the 3 ct model in mm (model frame) and follow the head onto the other files.
