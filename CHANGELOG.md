# Changelog

All changes to the Next Diamonds ring configurators. Newest first.

## 2026-11-24 - NDW200 adds Half Eternity toggle and tips-down pears

- Added an `Eternity` toggle (`Full` | `Half`, default `Full`) to `ndw200/`, backed by `project-half.json` / `saved-config-half.json` from iJewel configurator `KsE7dviHTLiPyTH-usxqIg` (30 half-eternity bands, Metal 01 gold switch, try-on scale `0.06052425738648934`, rot X 90).
- Rebuilt `project.json` / `saved-config.json` from `c5uGqTrFQXabBQW4LX9Zng` so Full NDW210 Pear Small/Medium/Large point at the tips-down GLBs.
- Kept `shared/shape-row.* ?v=shaperow-3` and shape-only model labels. Bumped NDW200 cache query to `?v=ndw200-7`.
- `configurators.json`: kept the single `ndw200` entry (`sku: "NDW200"`, `ijewelProjectId: "c5uGqTrFQXabBQW4LX9Zng"`), added `"halfIjewelProjectId": "KsE7dviHTLiPyTH-usxqIg"`, and updated `bands` to `60` files (`["Full Eternity", "Half Eternity"]`).

## 2026-11-24 - Drag the shape row with the mouse

- On a computer, hold a shape icon and drag left or right to scroll the row. After a drag, the click is ignored so the shape does not change; a plain click still selects it. Images cannot be native-dragged.
- Touch/iPhone swipe is unchanged (native overflow scrolling). A vertical mouse wheel over a row that can scroll moves it sideways.
- The selected shape is scrolled into view only when the selection changes, so a drag or swipe is not undone on the next re-render.
- Cache query bumped to `?v=shaperow-3` on every page that includes the shared assets.

## 2026-11-24 - Diamond shapes scroll in one line

- The shape selector on every ring page is now a single horizontal row you can swipe or scroll sideways (no wrapping). Selected icons and labels are unchanged.
- Shared `shared/shape-row.css` and `shared/shape-row.js` (`?v=shaperow-1`) are included from each page. If the active shape is off-screen on load, it is scrolled into view without jumping the page.
- Mercury And Sol is not in this repo and was not touched. `noya-morph/` has no shape selector, so it was skipped. Per-page models, `project.json`, and `configurators.json` are unchanged.

## 2026-11-24 - NDW200 smoother NURBS metal, hidden ND stamp, flipped pears

- Replaced all 30 bands in iJewel configurator `c5uGqTrFQXabBQW4LX9Zng` with NURBS metal, a hidden ND stamp, and 50% mesh reduction. NDW210 pears now sit on their butts (tips up).
- Rebuilt `project.json` / `saved-config.json` from the published config so every Model×Size points at the new GLBs. Try-on fit, shape-only labels, icons, and the Metal 01 gold switch are unchanged.
- Cache query bumped to `?v=ndw200-6`. `configurators.json` stays one `ndw200` entry with the same project id; thumbnail updated to the new NDW201 Medium icon.

## 2026-11-24 - NDW200 adds NDW210 Pear; NDW201 Large metal fix

- Added NDW210 (Pear) Small/Medium/Large to the existing `ndw200/` page (10 models × 3 sizes, 30 bands).
- Rebuilt `project.json` / `saved-config.json` from the published iJewel config so NDW201 Large points at the replacement file (leftover Medium baskets removed).
- Page Model list and `configurators.json` `ndw200` entry updated in place (no new entry, no other pages changed). Cache query bumped to `?v=ndw200-3`.

## 2026-11-24 - NDW200 adds NDW208 Elongated Radiant and NDW209 Marquise

- Same iJewel configurator `c5uGqTrFQXabBQW4LX9Zng`, now 27 bands (NDW201–209 × Small/Medium/Large). Try-on fit unchanged.
- Page Model list and `configurators.json` `ndw200` entry updated in place (no new entry, no other pages changed).

## 2026-11-24 - NDW200 full-eternity wedding bands

- New band-only page `ndw200/` (Model NDW201–207 × Size Small/Medium/Large, one Metal 01 gold zone). It does not change any existing ring page.
- iJewel configurator `c5uGqTrFQXabBQW4LX9Zng` (21 public GLBs). Stones on `Gem 01`, metal on `Metal 01`. Try-on uses the fit saved on that project.

## 2026-11-23 - Removed Arlet TEST pages

- Removed the unlisted test pages `arlet-test/` and `arlet-hand-nbfl9unjcq/` after Koby asked to take them down and remove their iJewel files. Live `arlet/` and its private page `arlet-kfmjuoxume/` are unchanged.
- `arlet-test` pointed at iJewel project `DqnBsNzCTB2Wd2geOWbcYw` (historically ARLET-TEST / arlet-test, 70% metal-reduced rings). That project already 404s on the public API and was not in the 11 Nov 2026 drive root. `arlet-hand-nbfl9unjcq` used the live Arlet project `fjrrx7obS2afI0O-XSxDlg` (`NDB568 Arlet`) plus a local `assets/hand.glb`; that live iJewel project is not removed.

## 2026-11-16 - Noya self-hosted pilot: Koby's HDRI maps for metal and diamonds

- `noya-selfhost/` only. Added 21 metal maps (`env/metal/m01..m21`, iJewel `env_metal_001..019, 004_a, 004_b, 061` from Koby's IJEWEL folder) and 3 diamond maps (`env/diamond/d01` Diamond, `d02` Enviroment, `d03` env-gem-1 from GrownBrilliance Assets). Sources listed in `env/*/SOURCES.tsv`.
- Web copies: metal maps resampled to 512x256 .hdr (they are blurred by the metal reflections anyway), diamond maps kept at full sharpness (max 1024 wide). Brightness normalised per map (`exposure` in `env/envs.json`). Tools: `tools/selfhost/prep-hdri.py`, `rgbe.py`, `exr2raw.mjs`.
- New defaults: metal `m13` (env_metal_012), diamond `d03` (env-gem-1). The old maps stay as `m00` / `d00`. All maps are in the on-page HDRI picker and in `?metalenv=` / `?diamondenv=`.
- Why: Koby sent these maps to make the gold and the diamonds look like his iJewel renders.

## 2026-11-16 - Noya self-hosted pilot: HDRI picker (metal and diamond lighting)

- `noya-selfhost/` only. New "HDRI" button in the viewer toolbar opens a small picker with two rows, Metal and Diamond (prev / next arrows and a list), that swaps the lighting live. Works on phones.
- Metal and diamond use separate environment maps, listed in `noya-selfhost/env/envs.json` (`m00` and `d00` = the pilot's current maps). URL params `?metalenv=mNN` and `?diamondenv=dNN` select a map and stay in sync with the picker; `?hdri=1` opens the picker.
- Why: Koby is sending his own HDRI maps for gold and for diamonds and wants to compare them himself.

## 2026-11-16 - Noya self-hosted pilot (own engine, own storage, no iJewel)

- New unlisted test folder `noya-selfhost/` (`noindex`, not in `configurators.json`, not linked anywhere). Existing pages, including `noya/`, are unchanged.
- Renders Noya with our own viewer: three.js + three-mesh-bvh (both MIT) and our own diamond shader (ray-traced internal bounces, Fresnel, total internal reflection, dispersion), progressive anti-aliasing, soft ground shadow, white / yellow / rose gold, rest and stand poses.
- All 40 Noya rings (8 shapes x 2-6 ct, including princess, marquise and 6 ct elongated radiant that are not on iJewel yet) are converted from Koby's .3dm files on the box with `tools/selfhost/3dm2glb.py` (no mesh reduction) and compressed with `tools/selfhost/pack-glb.mjs` (about 8 MB total, stored in the repo).
- Environment maps are CC0 Poly Haven HDRIs. Nothing on this page loads from iJewel.
- Why: Koby asked for a replacement for iJewel with our own storage, because iJewel support has not been able to sell more model slots. This is a pilot to compare the diamond look side by side.

## 2026-11-09 - Arlet on a hand: private TEST page (not live)

- New test-only folder `arlet-hand-<random>/` (a copy of `arlet/`): opens Arlet 2 ct Oval on a static hand; Oval and Emerald only, carats 1-5, ring gold. No band, rest pose, Try-On or Share on this page.
- The hand is the free official iJewel3D hand (`Hand-animation.blend`, frame 1, left hand), exported as a static 1.2 MB GLB (`assets/hand.glb`) with its skin and nail textures from the iJewel `skin materials.vjson`.
- The hand is fitted to the ring automatically for every shape and carat (`hand-view.js`): the ring's hole is measured from the loaded model, the ring finger (proximal phalanx) is centered through it, the stone faces the back of the hand, and the hand is scaled so the finger fits the ring's inner diameter.
- `?edit=1` opens a scene editor (hand position/rotation/scale, ring position on the finger, skin, nails, light, exposure, background, camera, shadows) with "Copy settings". Edits are saved in that browser; defaults come from `hand-scene.json`.
- Why: Jacob asked to try a hand scene for all rings. `noindex`, not in `configurators.json`, not linked from anywhere. `arlet/` and all live pages and shared files are unchanged.

## 2026-10-25 - Reset: pages back to earlier iJewel projects

- Dior, ND344P and ND1061 point to their original (early) iJewel projects again; the ND1061 page no longer uses the ND1060 project id.
- Every other page that had been moved to a redone (v2) project points to its previous (v1) project again (stop-gap until the rebuilt sets are verified). Portal settings, admin page and no-fade code are unchanged.
- BN630, BN631, BN635 and BN Alex Lee had no earlier project: removed from `configurators.json` (portal index / "All rings" list) and their page folders, tests and build tools removed. They are restorable from git: tag `pre-reset-20261025` (e.g. `git checkout pre-reset-20261025 -- bn630 tests/bn630.check.mjs tools/build-bn630-project.mjs tools/snapshots/bn630-public.json`).
- Erica and Arlette untouched.

## 2026-10-25 - Portal start settings (admin page) and no white fade between selections

- New admin page `/admin/` (https://amikob.github.io/ring-configurators/admin/): choose rings by filter (tone: two-tone / one-tone, band: has / no band, name search such as "Erica") or by ticking collections, see "N rings in M collections selected", set what the pages should OPEN with, and apply to the whole selection in one action.
- Settings (all optional): opening scene, starting carat, color combination (head / body-shank / band; one-tone rings use body for the whole ring), opening angle (turn + height, with "Use current angle" captured from a live preview), standing or lying. There is deliberately NO "starting shape" setting: the stone shape is chosen on the store website.
- Saved presets: save the form as a named template, load, rename, delete, or apply straight to any selection.
- Central file `portal-settings.json` (global defaults, per-collection overrides, filter rules, presets, custom scenes). Precedence per setting: collection override > filter rule (later rule wins) > global > the page's own default. Missing, empty or broken file = pages open exactly as before. Impossible values for a set (e.g. a carat it does not have) are skipped; an impossible combination falls back to the page defaults.
- Every page reads the file at load via `shared/portal-settings.js` (wired in each `<slug>/app.js`).
- Saving: "Save to GitHub" commits `portal-settings.json` through the GitHub contents API using a fine-grained token (Contents: read and write) that Koby pastes once; it is kept only in the browser's localStorage and sent only to api.github.com. "Download settings JSON" is the fallback. Pages pick up a saved change about a minute after the commit.
- No more white fade: every selection change (carat/size, shape, band, color, scene) now keeps the previous ring on screen until the new one is built and then swaps directly. `viewer-transition.js` no longer animates opacity in any page; `tools/apply-portal-settings.py` (idempotent, `--check`) re-applies the wiring and `redo/newpage.py` runs it for every new page.
- Tests: `tests/portal-settings.check.mjs` (schema, precedence, filters, no fade, all pages wired); Playwright frame captures before/after show no white frames.

## 2026-10-23 - nd336ph: new configurator page, listed

- ND336PH

## 2026-10-23 - nd334ph: new configurator page, listed

- ND334PH

## 2026-10-23 - nd1040: new configurator page, listed

- ND1040

## 2026-10-23 - nd750: new configurator page, listed

- ND750

## 2026-10-23 - nd1055: new configurator page, listed

- ND1055

## 2026-10-23 - nd1041: new configurator page, listed

- ND1041

## 2026-10-23 - alana: new configurator page, listed

- Alana

## 2026-10-23 - valeria: new configurator page, listed

- Valeria with pave band

## 2026-10-23 - nd1060: new configurator page, listed

- ND1060: 70 rings (40 NS + 30 East-West for oval, elongated cushion, emerald, marquise, old cut cushion, pear), no band

## 2026-10-23 - renie: new configurator page, listed

- Renie: 30 rings, one-piece metal (Metal 02 body = Gold control; tiny Metal 01 fragment static white gold); 5Ct Oval/7Ct Emerald marks -2/-4 faces

## 2026-10-23 - aiko: new configurator page, listed

- Aiko: 40 rings, 2-3 gems per ring; 1Ct Emerald + 1Ct Pear unmarked by design

## 2026-10-23 - eva: new configurator page, listed

- Eva: 33 rings (no 3ct Round/Pear); 4 rings unmarked by design; 3Ct Emerald mark -2 faces

## 2026-10-23 - serenity: new configurator page, listed

- Serenity: 40 rings; 5Ct Oval marked (verified vs upload); default 4ct (no 3ct)

## 2026-10-23 - nd1043: new configurator page, listed

- ND1043: 30 rings; 10Ct Oval re-uploaded marked; default 4ct (no 3ct)

## 2026-10-23 - aaron: new configurator page, listed

- Aaron: 40 rings re-verified after re-upload; 2Ct Elongated Cushion head restored

## 2026-10-23 - emi: new configurator page, listed

- Emi: 40 rings, 8 shapes x 1-5ct; 8 rings unmarked by design

## 2026-10-23 - romy: new configurator page, listed

- Romy: 40 rings, 8 shapes x 1-5ct, solitaire

## 2026-10-23 - nicolette: new configurator page, listed

- Nicolette: 40 rings, 8 shapes x 1-5ct, solitaire

## 2026-10-23 - malani: new configurator page, listed

- Malani: 35 rings, 7 shapes x 1-5ct; User 01 side stones mapped to diamond; 1Ct Emerald unmarked (approved); 5Ct Emerald mark -2 faces

## 2026-10-23 - nd1042: new configurator page, listed

- Added `nd1042/` (nd1046 template, no band): iJewel configurator VGa_aop-R8CTUeGDlo2isA, 35 rings (7 shapes x 4/5/6/8/10 ct; no 3 ct so it opens on 4Ct Oval), Head = Metal 01, Shank = Metal 02, Gem 01/02 ND1042 <Shape> mapped to diamond. tests/shared.check: default carat is 3, or the smallest carat when a set has no 3 ct.

## 2026-10-23 - nd1050: new configurator page, listed

- Added `nd1050/` (nd1046 template, no band): iJewel configurator HsUaNsb6Rxm3cd-2hHFwbQ, 40 rings (8 shapes x 1-5 ct), Head = Metal 01, Shank = Metal 02, Gem 01-03 ND1050 <Shape> plus 1Ct Oval left side stones (source material Setting) mapped to diamond.

## 2026-10-23 - nd1044: new configurator page, listed

- Added `nd1044/` (nd1046 template, no band): iJewel configurator clTIGjZcRnCxoME-Uw0exA, 35 rings (7 shapes x 3/4/5/6/8 ct), Head = Metal 01, Shank = Metal 02, Gem 01-03 ND1044 <Shape> mapped to diamond.

## 2026-10-23 - aimi: new configurator page, listed

- Added `aimi/` (nd1046 template, no band): iJewel configurator IsfLSBU8QAuvMyE91yMLug, 35 rings (7 shapes x 3/4/5/6/8 ct), Head = Metal 01, Shank = Metal 02, Gem 01/02 Aimi <Shape> mapped to diamond.

## 2026-10-23 - nd1045: new configurator page, listed

- Added `nd1045/` (nd1046 template, no band): iJewel configurator Z8KCLf3BTOKoRpAxIRoCUg, 35 rings (7 shapes x 3/4/5/6/8 ct), Head = Metal 01, Shank = Metal 02, Gem 01/02 ND1045 <Shape> mapped to diamond.

## 2026-10-23 - lacey: new configurator page, listed

- Added `lacey/` (nd1046 template, no band): iJewel configurator HS4izdbHQyqgC2MblePQUw, 40 rings (8 shapes x 3/4/5/6/8 ct), Head = Metal 01, Shank = Metal 02, Gem 01/02 Lacey <Shape> mapped to diamond.

## 2026-10-23 - nd1051: new configurator page, listed

- Added `nd1051/` (nd1046 template, no band): iJewel configurator QboCIydQQ7O1g26-teg1Lg, 40 rings (8 shapes x 2-6 ct), Head = Metal 01, Shank = Metal 02, Gem 01-03 ND1051 <Shape> plus the right-side side stones (source materials Cutting/Setting/Finger) mapped to diamond.

## 2026-10-23 - nd366p: new configurator page, listed

- Added `nd366p/` (nd1046 template, no band): iJewel configurator PFzcPKloTkONn-4ZwCrF3Q, 40 rings (8 shapes x 1-5 ct), Head = Metal 01, Shank = Metal 02, Gem 01/02 ND366P <Shape> mapped to diamond.

## 2026-10-23 - nd1000: new configurator page, listed

- Added `nd1000/` (Harley, nd1046 template, no band): iJewel configurator N0XWwWgHQjiFpoh3BFyD7A, 40 rings (8 shapes x 1.5/2.5/3/4/5 ct; catalog accepts decimal carats), Head = Metal 01, Shank = Metal 02, Gem 01/02 ND1000 <Shape> mapped to diamond. Listed as Harley (ND1000).

## 2026-10-23 - orianna: new configurator page, listed

- Added `orianna/` (nd1046 template, no band): iJewel configurator Ek8JGA2aQ0SC1KfjmZ250w, 40 rings (8 shapes x 1-5 ct), Head = Metal 01, Shank = Metal 02, Gem 01/02 Orianna <Shape> mapped to diamond. Square Radiant icon reuses the radiant image.

## 2026-10-23 - nd1048: new configurator page, listed

- Added `nd1048/` (nd1046 template, no band): iJewel configurator aq1Mle6ZRFKbKB7WMKoHPA, 40 rings (8 shapes x 2-6 ct), Head = Metal 01, Shank = Metal 02, Gem 01/02 ND1048 <Shape> mapped to diamond. Square Radiant icon reuses the radiant image.

## 2026-10-23 - nd1049: new configurator page, listed

- Added `nd1049/` (nd1046 template, no band): iJewel configurator AO5SX214REyP6y4SWb5vQA, 40 rings (8 shapes x 2-6 ct), Head = Metal 01, Shank = Metal 02 (checked in GLBs), Gem 01/02/03 ND1049 <Shape> mapped to diamond.

## 2026-10-23 - nd801: new configurator page, listed

- Added `nd801/` (Claudia, nd1046 template, no band): iJewel configurator T1-MdGeHQCeJTHXf-TZwWw, 40 rings (8 shapes x 2-6 ct). One-piece metal: everything on Metal 01, so the page shows a single Gold row (head gold row hidden). Gem 01 ND801 <Shape> mapped to diamond. Listed as Claudia (ND801).

## 2026-10-23 - nd1047: new configurator page, listed

- Added `nd1047/` (nd1046 template, no band): iJewel configurator PsLA_p4tS5ehJ0WpbwZa_w, 39 rings (8 shapes x 2-6 ct; 6 ct Old Cut Cushion was never made, so that button is disabled), Head = Metal 01, Shank = Metal 02, Gem 01 ND1047 <Shape> mapped to diamond. Catalog gains a MISSING list. Listed in configurators.json.

## 2026-10-22 - nd1046: new configurator page, listed

- Added `nd1046/` (copied from nd336, no band; ring-pose.js v16.3 from ada): iJewel configurator D8dC3VBDQkCNfUjhbHg9GQ, 40 rings (8 shapes x 3/4/5/6/8 ct, hidden ND mark), Head = Metal 01, Shank = Metal 02, Gem 01 ND1046 <Shape> mapped to diamond. Catalog uses a CARATS list. Built by tools/build-nd1046-project.mjs; listed in configurators.json.

## 2026-10-22 - ada (ND334): new configurator page, not listed yet

- Added `ada/` (copied from nd344p): iJewel project XVul_Ld1QDO2v6zXE0CUgw, 40 rings + 2 Pave bands (1-3 ct, 4-5 ct), Head = Metal 01, Shank = Metal 02, Band = Metal 03, Gem 01/02/03 ND334 <Shape> + Gem 03 ND334 Band mapped to diamond. Band rest pose (ring-pose.js v16.3). Band options: No band / Pave only.
- Why: pilot set for Kobi's review. Not added to configurators.json yet, so the portal does not show it. Needs the iJewel configurator to be Public to load.

## 2026-10-22 - nd344p: ring + band rest pose

- Ported the Arlet ring+band rest pose (ring-pose.js v16.3); Rest now works with a band. No model changes. app.js cache tag 20261022a.

## 2026-10-22 - erica: ring + band rest pose

- Ported the Arlet ring+band rest pose (ring-pose.js v16.3); Rest now works with a band. No model changes. app.js cache tag 20261022a.

## 2026-10-22 - dior: ring + band rest pose

- Ported the Arlet ring+band rest pose (ring-pose.js v16.3): Rest is available with a band; the set lies with the finger axis vertical, rocked onto the head edge and shank. No model changes. app.js cache tag 20261022a.

## 2026-10-22 - arlet: ring + band rest pose
- **What:** Rest (lying) pose now also works with Plain/Pave bands. Ring and band rest together as one set, finger hole vertical, band on top, rocked so the head edge and shank both touch the floor. Ported from arlet-test (no debug overlay). Files: `arlet/ring-pose.js`, `arlet/app.js`, `arlet/index.html` cache tag.
- **Why:** Kobi's request (MatrixGold reference); approved after iPhone testing on arlet-test.

## 2026-10-21 - arlet-test (hidden test page)
- **What:** Added hidden `arlet-test/` page (not in configurators.json) using private-turned-public iJewel project `DqnBsNzCTB2Wd2geOWbcYw` with 70% metal-reduced Arlet rings, for iPhone reload testing. Live Arlet unchanged.

## 2026-10-02 (b): Automatic tests on GitHub

- **What:** Added `.github/workflows/tests.yml`. On every push, GitHub syntax-checks every
  configurator JavaScript file and runs `npm test`. Results show on the repo's Actions page
  and as a green check or red X next to each commit.
- **Why:** The next assistant (Astra) works on Windows without Node.js and could not run the
  tests, so a broken change could have gone live unnoticed. HANDOFF.md section 8 explains it.

## 2026-10-02: Handoff document

- **What:** Added `HANDOFF.md`, a complete guide for the next assistant or developer: how the
  site and each configurator work, exact facts for all six collections, iJewel workflow, how
  to add rings and bands, deploying and testing, the full try-on history with SDK findings and
  a recommended next step, and Jacob's working preferences. `README.md` now points to it.
- **Why:** Jacob is handing the project to another assistant (Astra), which works from GitHub.
  Earlier notes lived outside the repo where it could not see them.

## 2026-10-01 (f): Try-on reverted to the original behavior

- **What:** Try-on code on all six rings is back to exactly the version from the portal
  launch (a). The default ring (Oval 3 ct, yellow / white head) from (b) is kept.
- **Why:** On iPhone, every attempt to change try-on behavior (live swap in (b)-(d), camera
  side memory in (e)) left the page stuck on iJewel's white loading screen after leaving AR.
  The original flow worked well, so it is restored until changes can be tested with
  on-device logging.
- **Where the experiment lives:** branch `experiment/live-tryon` keeps the live-swap,
  camera-side and loading-screen work for a later, properly instrumented attempt.

## 2026-10-01 (e): Try-on back to the stable restart by default; loading screen fix

- **What:** Changing the ring during try-on restarts AR again by default (the behavior before
  (b)), but the camera now **stays on the side the shopper chose**. The live swap still exists
  but is opt-in: add `?tryon=live` to a ring address.
- **Why:** On iPhone the live swap showed iJewel's white loading screen with a progress bar
  over the camera while the next ring downloaded, and after leaving AR the page could stay
  stuck on that white screen. Three fixes in a row could not be verified on a phone from
  here, so the stable flow is the default until the live swap is confirmed on real devices.
- **Loading screen fix (both flows):** after AR ends, the page hides iJewel's loading overlay
  if nothing is still loading. The native iJewel viewer does the same after AR. During a live
  swap the overlay is switched off so it cannot cover the camera.
- **Test:** `tests/shared.check.mjs` checks the overlay is off during a live swap and not left
  on screen after AR, and that live swap is opt-in on every ring.

## 2026-10-01 (d): Ring stuck off-screen after leaving try-on

- **What:** After (c), leaving try-on on iPhone could show an empty scene with only the
  floor visible edge-on (a thin grey bar). The ring was still there, but in the wrong place.
- **Why:** The try-on plugin moves the ring onto the finger and resets it on exit, but it only
  knows the ring it started with. A ring swapped in during AR is a new object, so it kept its
  finger position and rotation when AR ended. Restoring the old camera then pointed at empty
  floor.
- **How:** `shared/tryon-session.js` now records the studio position, rotation and scale of
  the model root and of every ring/band container (including ones swapped in during AR) and
  puts them back after AR ends. The app then refreshes diamonds and shadows, restores the
  pre-AR viewing direction and frames the ring on screen.
- **Comparison switch:** `?tryon=restart` (replaced in (e): live swap is now opt-in with `?tryon=live`).
- **Test:** `tests/shared.check.mjs` simulates a ring swapped in during AR and checks it
  returns to its studio position, rotation and scale.

## 2026-10-01 (c): Fix zoomed-in ring and missing shadow after leaving try-on

- **What:** After a live ring swap in try-on, leaving AR showed the ring hugely zoomed in
  (only the shank visible). Re-centering fixed the framing but the floor shadow was gone and
  the studio scene looked wrong. Now the ring returns at its normal size, the shadow is
  re-baked, diamonds are refreshed, and the camera goes back to the view from before AR.
- **Why it happened:** Yes, the live swap from (b) caused it. iJewel's try-on assembly saves
  the model's scale when it is built and puts it back when AR ends. On a live swap the
  assembly was rebuilt while AR was running, so it saved the finger-fitted scale instead of
  the studio scale, and restored that wrong scale on exit. New models were also loaded
  while the ring sat on the finger, so the floor shadow was baked for the wrong position.
- **How:** `shared/tryon-session.js` records the studio scale before AR starts and uses it
  for every rebuild during AR. After an AR session that had live swaps, it calls the app's
  new `onRestored` step (diamonds, shadows, saved camera) once the SDK has restored the scene.
- **Test:** `tests/shared.check.mjs` now simulates the exit and fails on the previous code.

## 2026-10-01 (b): Live ring swap in try-on, new default ring

### Try-on: change the ring without restarting the camera
- **What:** While try-on (AR) is open, changing the shape, carat, band or gold now swaps the
  ring on the finger in place. The camera keeps running and stays on the side the shopper
  chose (front or back).
- **Why:** Before, every shape or carat change stopped AR, restarted it, and reopened the
  front camera. Shoppers who had switched to the back camera were thrown back to the front
  camera after each change, which made comparing stones on the hand frustrating.
- **How:** `shared/tryon-session.js` now owns the try-on "assembly" (the ring and band
  grouped for finger tracking). The app detaches the assembly, loads the new model, and
  re-attaches it to the same finger. If that ever fails, the app falls back to the old
  restart, and the camera side is restored after the restart.
- One shared `tryon-session.js` now serves all six rings, replacing six identical copies.
- Needs a phone check: confirmed by automated tests, but finger placement after a swap must be
  confirmed on a real iPhone and Android.

### Default ring when a page opens
- **What:** Every collection now opens on **Oval, 3 ct**, in **yellow gold**. Two-tone rings
  (ND336, ND1061, ND344P, Dior) open with a **white gold head and yellow gold shank**.
  Matching bands, when added, default to yellow gold.
- **Why:** One consistent first impression across all collections for colleagues and
  partners. Later, the Shopify product page will decide the starting ring from the filters or
  product the customer came from.
- **How:** The default lives in the `desired` selection at the top of each `app.js`. The
  starting ring is also pre-selected before the 3D viewer loads, so the first visit downloads
  one model instead of loading Round 1 ct and then switching. (Arlet opens through iJewel's
  own project loader, so it still loads its saved ring first and then switches.)

### Tests
- New `tests/shared.check.mjs` checks the defaults on every ring and the live-swap and
  camera-side logic.

## 2026-10-01 (a): Portal launch on GitHub Pages
- New portal home page listing every collection, read from `configurators.json`.
- Added the "All rings" link and ring dropdown to the top bar of every configurator.
- New collection: **ND336**: 40 rings (8 shapes, 1-5 ct), separate head and shank gold, no
  matching bands yet.
- Moved ND1061, ND344P, Erica, Dior (ND423) and Arlet (NDB568) here from the earlier
  ChatGPT Sites hosting, using the 2026-09-30 compact layout.
