# Changelog

All changes to the Next Diamonds ring configurators. Newest first.

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
