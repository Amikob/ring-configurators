# ND336 - live carat slider pilot (no iJewel)

Unlisted test page (noindex). Copy of the `noya-morph` engine (nothing in `noya-morph/`, `noya-selfhost/`,
`erica-selfhost/` or the live `nd336/` page was changed). The 40 ND336 rings (8 shapes x 1-5 ct) were downloaded
read-only from the live page's iJewel file URLs (`nd336/project.json`) and repacked on the box
(`tools/morph/nd336/`: flatten -> rest pose -> meshopt, 0% mesh reduction, ~47 MB).

- Default = **nearest real file + morph**: the slider (1.00-5.00 ct, step 0.05; `?max=6` allows extrapolating past
  5 ct) shows the closest real file and morphs it at most +-0.5 ct. "One file, morphed" = everything from the 3 ct file.
- Every file has 4 parts: head metal, band metal, centre stone, small stones (hidden halo + band pave). Metal uses the
  noya-morph field (similarity about the pivot in the head, smooth mask down to the shank, rigid prong anchors).
  Small stones move rigidly with the field at their own centre (never stretch); their BVH is refit, not rebuilt.
- `morph-core.js` (this copy): the stone outline is the real top-view convex hull (corners / pear tip are "inside"
  the stone), and only vertices that can move are touched per frame (about 5-20 ms per slider step on desktop CPU).
- Anchors: `anchors/<shape>.json`, auto-authored on each shape's 3 ct file (prong tips found above the girdle)
  and calibrated against the real 2 and 4 ct files; editable with `?edit=1`.
- Accuracy / overlap report: `anchors/accuracy.json`.

Options: `?shape=round|oval|elongated_cushion|elongated_radiant|emerald|pear|marquise|square_cushion`, `?ct=2.35`,
`?gold=`, `?mode=single`, `?view=ghost|error|weights`, `?real=1`, `?max=6`, `?edit=1`.
