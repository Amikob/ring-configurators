# Next Diamonds ring configurators

> **New assistant or developer? Start with [`HANDOFF.md`](HANDOFF.md).**

Static site hosted on GitHub Pages. The root page lists every ring collection; each
collection lives in its own folder and opens a 3D configurator powered by iJewel.

| Folder | Ring | iJewel project | Notes |
| --- | --- | --- | --- |
| `nd336/` | ND336 | `DLVn0aVvScWnnSuKWGzUTg` | 8 shapes, 1-5 ct, head + shank gold. No bands yet. |
| `nd1061/` | ND1061 | `X_aH9Y3WTeCE95EBGa_PGQ` | 8 shapes, 1-5 ct, North-South / East-West. No bands yet. |
| `nd344p/` | ND344P | `XE0n9hw5RjWMfkqA07oA4Q` | 8 shapes, 1-5 ct, 4 shared bands (Plain / Pave). |
| `erica/` | Erica | `adW2878KSNyM3S02rbE_gg` | 8 shapes, 3-7 ct, 22 bands (Plain / Half Eternity). |
| `dior/` | Dior (ND423) | `KoYeWRAoRNyz8HNa9FuYZQ` | 8 shapes, 1-5 ct, 4 shared bands (Plain / Pave). |
| `arlet/` | Arlet (NDB568) | `fjrrx7obS2afI0O-XSxDlg` | 8 shapes, 1-5 ct, 30 bands in 3 groups. |

`configurators.json` is the single list of collections. The portal and the "switch ring"
menu inside every configurator both read it, so a new ring appears everywhere once it is
added there.

## Adding a new ring

1. Prepare the CAD copies (never edit the Dropbox originals) and upload them into a new
   iJewel *Configurator* folder, inside a `Ring` component (and `Band` if it has bands).
   Upload settings: Auto Center OFF, Auto Scale OFF. Then **Make Public**.
2. Copy the closest existing folder (`nd336/` for ring-only, `nd344p/` for shared bands,
   `arlet/` or `erica/` for grouped bands) and adjust `catalog.js`, the project ID in
   `app.js`, and the material mapping in `project.json`.
3. Add the ring to `configurators.json` and a check in `tests/`. Run `python3 tools/apply-portal-settings.py <repo>` so the page reads `portal-settings.json` and has no fade (`redo/newpage.py` does it).
4. `npm test`, commit, push. GitHub Pages redeploys in about a minute.

## Portal start settings (admin page)

`/admin/` (https://amikob.github.io/ring-configurators/admin/) sets how the ring pages open - for all rings, a
filtered group (two-tone / one-tone, with or without band) or a whole collection such as Erica at once: opening scene,
carat, colors, opening angle and standing/lying, plus saved presets. There is no starting-shape setting (shape is chosen on
the store website). Settings live in `portal-settings.json` (global < filter rules < per-collection override; an empty or
missing file changes nothing). The admin page saves it through the GitHub API with a fine-grained token pasted once and kept
only in the browser, or you can download the JSON and commit it. Pages read the file at load through `shared/portal-settings.js`.

Selection changes in the configurator swap rings directly (no white fade): `viewer-transition.js` is a no-fade module in every
page; `python3 tools/apply-portal-settings.py [--check]` re-applies the wiring to a page copied from an older template.

## Conventions

- Default ring on every page: **Oval 3 ct, yellow gold**. Two-tone rings: **white head, yellow shank**. Bands: yellow. Set in `let desired` at the top of each `app.js` (checked by `tests/shared.check.mjs`).
- Try-on uses the original flow (restart AR on a ring change). Live swap experiments live on branch `experiment/live-tryon`; see `CHANGELOG.md`.
- Record every change in `CHANGELOG.md` with what changed and why.

## Notes

- The sites load the pinned iJewel SDK (WebGI 0.22.0, mini-viewer 0.6.18, web-vto 0.3.3).
- Try-on needs HTTPS and camera permission; finger fit is not yet verified on a physical iPhone for ND336, ND1061 or ND344P.
- Nothing here is a sellable SKU yet: no prices, inventory or cart. Shopify integration is the next phase.
