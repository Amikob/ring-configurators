# Changelog

All changes to the Next Diamonds ring configurators. Newest first.

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
