# Try-On fit status in iJewel

Read-only check on Monday, Nov 23, 2026, about 3:00 PM America/New_York. Nothing was written to iJewel. Live project records were read from the public API `GET https://amikob.ijewel3d.com/api/raw/v1/files/view/<id>`. iJewel `updated` / `created` timestamps have no timezone in the API; they are treated as UTC and shown here in America/New_York.

Koby asked (2:58 PM America/New_York) to save the Try On fit inside every ring project in iJewel, and to do the same for every new set from now on, so his Mac builder (which reads iJewel directly) stops reporting "no Try On fit".

## Update — Monday, Nov 23, 2026, about 8:16 PM America/New_York

Nicolette was rebuilt as a new-editor configurator `WFZUoScmTU6Y6UnumZZJ6A` (her existing 40 files were linked from My Drive; nothing was re-uploaded). The Try On fit is saved in that project (`enabled`, scale `0.057735999944336154`, position `0,0,0`, rotation X ≈ 1.5708, SSR on, SSAO off). Live pages and `configurators.json` now point at this id. The old project `Z4wxrZSJSKuH9vAUOnDviQ` was left in place.

## Counts

| | Count |
|---|---:|
| Unique live ring iJewel projects checked | 47 |
| Public ring pages (Lacey + `lacey-cfg` share one project) | 48 |
| Already have Try On fit saved in iJewel (`config.tryonConfig.enabled` is true) | **3** (Arlet, Dior, Erica) |
| Missing a Try On fit in iJewel | **44** (including Orianna v2 and Serenity) |
| Protected projects already saved | 3 (Arlet, Dior, Erica) |
| Protected projects still missing | 4 (Ada, ND1061, ND336, ND344P) |

Skipped, as requested: the four earring pages (`nd_ear_01`–`nd_ear_04`), Mercury And Sol, the loose MC* GLBs, and the stray Untitled configurator `fQ-jPkGnRn6jz35bmfKMcw`. Private ring pages (the `*-<hash>` folders) only load the public page's code and use the same iJewel project, so they are not separate rows.

`tools/snapshots/*-public.json` is often stale: many snapshots are of older project IDs from before the configurator-folder migration. This table uses the live `PROJECT_ID` from each page's `app.js` (which matches `configurators.json`).

## Where iJewel stores the Try On fit

The public file record has a `config` field (a JSON string). Koby's builder calls this **settings**, and it calls the Try On block **tryon_fit**.

The fit lives at the top level of that parsed object:

```text
record.config (JSON string)
  └── tryonConfig          ← this is the Try On fit
        ├── enabled        ← must be true or the builder / Mini Viewer treat it as missing
        ├── modelScaleFactor
        ├── modelPosition  { x, y, z, isVector3 }
        ├── modelRotation  { x, y, z, isVector3 }
        ├── ssr            { enabled, intensity, radius, tolerance }
        └── ssao           { enabled, intensity, radius, falloff, bias, ... }
```

There is no separate `tryon_fit` or `defaultConfig` field on `files/view`. Our pages also look at `file.defaultConfig` on the Mini Viewer `ijewel-file-data` event, as a fallback; for these Drive projects the fit, when present, is already in `config.tryonConfig`. The record's `file` blob is a dummy 4-byte `test` object; the project itself is stored in `config`.

### Orianna v2 (missing) vs Arlet (saved)

**Orianna v2** (`Yxmb0zf0TFSoDElCJuPoKg`) — last updated Oct 26, 2026, 1:05 PM EDT. `config` has only `plugins.RingConfigurator`. That is exactly what the builder described: settings hold only the ring configurator, `tryon_fit` is none.

**NDB568 Arlet** (`fjrrx7obS2afI0O-XSxDlg`) — last updated Oct 22, 2026, 10:51 AM EDT. `config` is the classic full project object: `plugins`, `version`, `isDefault`, `sceneConfig`, `materialConfig`, `cameraConfig`, `basePath`, and `tryonConfig` with `enabled: true`. Dior and Erica use the same classic shape.

Most of the 44 missing projects (as of the 3:00 PM check) are new-editor configurators: `config` is plugins-only (just `RingConfigurator`). Two older exceptions at that check, **ND1061 Configurator** and the old **Nicolette v2** (`Z4wxrZSJSKuH9vAUOnDviQ`), had scene/camera/material keys but still no `tryonConfig`. Nicolette has since been rebuilt; see the evening update above.

## Why our live pages still work

`saved-project.js` merges the iJewel record with the page's own `project.json`:

```js
tryonConfig: saved.tryonConfig?.enabled ? saved.tryonConfig : project.tryonConfig
```

Arlet has no `project.json`. It reads `tryonConfig` only from iJewel, which is why it already has a fit saved there. Every other ring page carries the fit in `project.json` and falls back to it when iJewel has none.

Almost every page uses the same baseline fit (copied from the ND336 / ND1061 project-build scripts, not a unique per-ring hand calibration):

- `enabled`: true
- `modelScaleFactor`: `0.057735999944336154`
- `modelPosition`: `{ x: 0, y: 0, z: 0, isVector3: true }`
- `modelRotation`: `{ x: 1.5707963267948963, y: -1.0017768124246595e-07, z: 1.017453856186509e-07, isVector3: true }` (90° on X, ~0 on Y and Z)
- SSR on (intensity 1.5, radius 2, tolerance 5); SSAO off (the usual default block)

Dior's and Erica's `project.json` use the same scale, with a tiny position `x: 3.301084264547031e-06` and `y`/`z` as the strings `"0"`. Arlet has no local file; its iJewel fit matches that Dior-like position.

**Do not overwrite Erica's iJewel fit** with the page default. Erica already has a real saved fit in iJewel, and it is different: `modelScaleFactor` `0.0591748834393557`, position at the origin, and a slightly different rotation. Dior is already saved too; its iJewel numbers are the same scale and nearly the same pose (rotation Y/Z are exact 0). Leave both as they are.

## Exact values to enter for Orianna v2

Project: **Orianna v2** — https://amikob.ijewel3d.com/drive/files/Yxmb0zf0TFSoDElCJuPoKg

These are the values our live Orianna page already uses (and that Koby confirmed work). In the Playground Try-On settings they map as: Enable AR = on; Model Size = `0.057735999944336154`; Position = `0, 0, 0`; Rotation ≈ `90°` on X, `0` on Y and Z.

```json
{
  "enabled": true,
  "ssr": {
    "enabled": true,
    "intensity": 1.5,
    "radius": 2,
    "tolerance": 5
  },
  "ssao": {
    "enabled": false,
    "intensity": 0.2,
    "radius": 1.07,
    "falloff": 0.33,
    "bias": 1e-05,
    "smoothEnabled": true,
    "sssAoPower": 1,
    "sssExponents": {
      "x": 0.68,
      "y": 0.88,
      "z": 1.4,
      "isVector3": true
    },
    "sssChromaticity": 0.55
  },
  "modelScaleFactor": 0.057735999944336154,
  "modelPosition": {
    "x": 0,
    "y": 0,
    "z": 0,
    "isVector3": true
  },
  "modelRotation": {
    "x": 1.5707963267948963,
    "y": -1.0017768124246595e-07,
    "z": 1.017453856186509e-07,
    "isVector3": true
  }
}
```

After it is saved, a public `files/view` of `Yxmb0zf0TFSoDElCJuPoKg` should show `config.tryonConfig.enabled === true` with these (or Auto Fit-equivalent) numbers, and the builder should stop flagging Orianna. The other 43 missing projects should get the same treatment. Every one of them already has the identical `tryonConfig` in its page `project.json` (including the protected ones: Ada, ND336, ND344P, and ND1061).

## UI path (new-editor configurator)

The new configurator editor does **not** save the fit. `Manage → Settings → Customer view → Try it on your hand` only shows or hides the customer button. If the project has no fit, that button stays grey and says "Try-On starts on the view page when the project has Try-On" ([new-editor FAQ](https://ijewel3d.com/docs/configurators/beta/faq.html), [Settings](https://ijewel3d.com/docs/configurators/beta/preview-save-and-publish.html)).

The fit is set in Playground / the classic editor, then saved back onto the Drive project. Official Ring Configurator steps ([Prepare a Try-On Project](https://ijewel3d.com/docs/try-on/prepare-a-try-on-project.html)):

1. In My Drive (or from the configurator card / new editor toolbar), open the project with **Open in → Editor** or **Open in → Playground** (in the new editor this publishes first, then opens Playground).
2. Open the **Try-On settings**.
3. Turn on **Enable AR**.
4. Select **Enter Setup**. A cylinder appears for the tracked finger.
5. Select **Auto Fit**, then correct **Model Size**, **Position**, and **Rotation** if needed so the band surrounds the cylinder and the head points with the arrow. For Orianna, the target numbers are listed above (you can Auto Fit and then set them if they differ).
6. Select **Exit Setup**, then **Preview in AR** to check the hand, and correct if needed.
7. **Save the project** to Drive.

If you used Playground from the new editor, go back to the new editor afterwards and choose **Load the latest** if it warns that Playground changed the project. Then confirm `files/view` now has `tryonConfig.enabled: true`.

For every new set from now on: after the iJewel configurator is built, run this Playground save before calling the set done, so the builder and iJewel both see the fit (not only our `project.json` fallback).

## Table of every ring page

`lacey-cfg` is listed under Lacey (same iJewel project `EiSEtivuSsmgccThjvV6sw`).

| Page | iJewel project | Id | Fit in iJewel | iJewel config shape | Page `tryonConfig` (from project.json) | iJewel `tryonConfig` if saved | Protected | Drive path | iJewel updated (America/New_York) |
|---|---|---|---|---|---|---|---|---|---|
| aaron | Aaron Ring | `cwSKXD91QaSAPvY1vy9t2Q` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-18 10:54 AM EST |
| ada | ND334 Ada | `XVul_Ld1QDO2v6zXE0CUgw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — | yes | / | 2026-10-22 9:48 PM EDT |
| aiko | Aiko | `P6KrE9yOTA-YKFiWOdoedA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 1:36 PM EST |
| aimi | Aimi | `PoBrmWzESWitk1_wlTHcRA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 6:54 PM EST |
| alana | Alana Ring | `K4TKhAqRQpmU7jXVwQt8iQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-18 12:21 PM EST |
| ariella | Ariella Ring | `B5d7cjAITNG6jtiYvJKMBg` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-18 12:47 PM EST |
| arlet | NDB568 Arlet | `fjrrx7obS2afI0O-XSxDlg` | saved | full config + tryonConfig (classic) | (no project.json; uses iJewel) | enabled=True; scale=0.0577359999443; pos=(3.30108426455e-06, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | yes | / | 2026-10-22 10:51 AM EDT |
| bn630 | BN630 | `UPI1o_2yROCVAhQtiAzwGA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 2:09 PM EST |
| bn631 | BN631 | `QvakaEQ2T2uvKIMkMc98jw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 3:04 PM EST |
| bn634 | BN634 | `XdbHKxV-RwOd0ROWDn1vww` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 3:26 PM EST |
| bn635 | BN635 | `BqdNWqiTQwCyS85mw06Zyw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 3:53 PM EST |
| dior | ND423 Dior | `KoYeWRAoRNyz8HNa9FuYZQ` | saved | full config + tryonConfig (classic) | enabled=True; scale=0.0577359999443; pos=(3.30108426455e-06, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | enabled=True; scale=0.0577359999443; pos=(3.30108426455e-06, 0, 0); rot=(1.57079632679, 0, 0) | yes | / | 2026-09-21 3:07 PM EDT |
| emi | Emi | `NJPQiLNkQsOj1Ffyl32vNw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 5:14 PM EST |
| erica | Erica | `adW2878KSNyM3S02rbE_gg` | saved | full config + tryonConfig (classic) | enabled=True; scale=0.0577359999443; pos=(3.30108426455e-06, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | enabled=True; scale=0.0591748834394; pos=(0, 0, 0); rot=(1.57079632679, 3.09812957354e-07, -5.44716608687e-07) | yes | / | 2026-09-21 7:33 PM EDT |
| eva | Eva | `EMitq3VTSayVifhYVhjmWQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 4:18 PM EST |
| lacey, lacey-cfg | Lacey | `EiSEtivuSsmgccThjvV6sw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 12:04 PM EST |
| malani | Malani | `cxC14XV_QhaudFkr6KpY5A` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 4:49 PM EST |
| nd1000 | ND1000 v2 | `SMlBPnRsQ8u7m970A-pGNw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-27 11:20 PM EDT |
| nd1040 | ND1040 | `atQJ-NbNSnmEwElqJ0cKuw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 8:12 PM EST |
| nd1041 | ND1041 | `F6fYyuiMTESIgiZO3zWdLg` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 8:44 PM EST |
| nd1042 | ND1042 | `Y2KfQ_lSTSyHnbesvZL5MA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 9:11 PM EST |
| nd1043 | ND1043 | `S01TUvGISVaH6ze4dVCdmA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 9:35 PM EST |
| nd1044 | ND1044 | `RRSP3WuoTgGTg_P-o417jw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 7:26 PM EST |
| nd1045 | ND1045 | `KOfm0VR3TICaDXEAiCaFNA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 7:51 PM EST |
| nd1046 | ND1046 v2 | `GRD9NYbQSz65ryD7LRS7kQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 12:32 PM EDT |
| nd1047 | ND1047 v2 | `ay_dLarRQa6PHatoLAMW_Q` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 12:45 PM EDT |
| nd1048 | ND1048 v2 | `CJnfexgdRzOcUrRujTh8bg` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 12:58 PM EDT |
| nd1049 | ND1049 v2 | `M_jcfiHERf6GbLab_hpXmw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 1:14 PM EDT |
| nd1050 | ND1050 | `BhhCVwYxQ5-UWABxFP0hPQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 6:26 PM EST |
| nd1051 | ND1051 v2 | `WIrhwz7sTdmJXyIgYzczkQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 2:20 PM EDT |
| nd1055 | ND1055 Ring | `FHvY-rGNQVm5HOC7EDMgSw` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-18 10:03 AM EST |
| nd1060 | ND1060 | `TlH0yGxnRV-zNcsAyA9yoQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-18 5:22 PM EST |
| nd1061 | ND1061 Configurator | `X_aH9Y3WTeCE95EBGa_PGQ` | **missing** | scene+camera, no tryonConfig | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — | yes | / | 2026-09-29 3:51 PM EDT |
| nd334ph | ND334PH v2 | `Zc_2AbYzQ8ObjUwhM8iXVg` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 1:44 PM EDT |
| nd336 | ND336 Configurator | `DLVn0aVvScWnnSuKWGzUTg` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — | yes | / | 2026-09-30 11:44 PM EDT |
| nd336ph | ND336PH v2 | `fWKznoJ7T_WVPSXgXZcGsA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 1:35 PM EDT |
| nd344p | ND344P | `XE0n9hw5RjWMfkqA07oA4Q` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — | yes | / | 2026-09-28 11:07 PM EDT |
| nd366p | ND366P v2 | `P4C_7LOLTV6fDK7eAfk4jg` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 2:02 PM EDT |
| nd750 | ND750 | `VTc1ZJKeSd-ePncIGGZDZQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 6:02 PM EST |
| nd801 | ND801 v2 | `UV1bmLVcSPm8ggtdpfZ68A` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 12:39 PM EDT |
| nicolette | Nicolette | `WFZUoScmTU6Y6UnumZZJ6A` | **saved** | new editor (v2) + tryonConfig | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot≈(1.5708, 0, 0); SSR on; SSAO off |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-23 8:12 PM EST |
| noya | Noya | `aCzuAfLXRiipgfWjDBUBRQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 2:37 PM EST |
| orianna | Orianna v2 | `Yxmb0zf0TFSoDElCJuPoKg` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 1:05 PM EDT |
| renie | Renie | `aQpLk_XFRJCKiuBOpeNYSA` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-18 9:18 AM EST |
| romy | Romy | `UjJAC9TDQmeXzJ6wmmplpQ` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 5:40 PM EST |
| serenity | Serenity | `WavPYghvRgGJnBhfiYv--w` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | drive folder `RIBZVJtISLKRmFXFQfS4iQ` | 2026-11-17 10:01 PM EST |
| valeria | Valeria v2 | `ciOCDSKMRhSwpM9C-3oX1w` | **missing** | plugins-only (new editor) | enabled=True; scale=0.0577359999443; pos=(0, 0, 0); rot=(1.57079632679, -1.00177681242e-07, 1.01745385619e-07) | — |  | / | 2026-10-26 10:32 PM EDT |


## Already saved (3 at the 3:00 PM check, plus Nicolette tonight)

- **NDB568 Arlet** (`fjrrx7obS2afI0O-XSxDlg`), used by `arlet`, updated 2026-10-22 10:51 AM EDT. — no local project.json; the live page already reads this iJewel fit.
- **ND423 Dior** (`KoYeWRAoRNyz8HNa9FuYZQ`), used by `dior`, updated 2026-09-21 3:07 PM EDT. — already saved; numbers are effectively the same scale as our page, with rotation Y/Z = 0.
- **Erica** (`adW2878KSNyM3S02rbE_gg`), used by `erica`, updated 2026-09-21 7:33 PM EDT. — iJewel scale/rotation differ from our project.json; keep the iJewel values.
- **Nicolette** (`WFZUoScmTU6Y6UnumZZJ6A`), used by `nicolette`, updated 2026-11-23 8:12 PM EST. — new-editor rebuild; old project `Z4wxrZSJSKuH9vAUOnDviQ` left in place. Fleet Try On fit saved.


## Missing (44)

- `aaron` — **Aaron Ring** (`cwSKXD91QaSAPvY1vy9t2Q`)
- `ada` — **ND334 Ada** (`XVul_Ld1QDO2v6zXE0CUgw`) (protected — save the fit only; do not change models or other settings)
- `aiko` — **Aiko** (`P6KrE9yOTA-YKFiWOdoedA`)
- `aimi` — **Aimi** (`PoBrmWzESWitk1_wlTHcRA`)
- `alana` — **Alana Ring** (`K4TKhAqRQpmU7jXVwQt8iQ`)
- `ariella` — **Ariella Ring** (`B5d7cjAITNG6jtiYvJKMBg`)
- `bn630` — **BN630** (`UPI1o_2yROCVAhQtiAzwGA`)
- `bn631` — **BN631** (`QvakaEQ2T2uvKIMkMc98jw`)
- `bn634` — **BN634** (`XdbHKxV-RwOd0ROWDn1vww`)
- `bn635` — **BN635** (`BqdNWqiTQwCyS85mw06Zyw`)
- `emi` — **Emi** (`NJPQiLNkQsOj1Ffyl32vNw`)
- `eva` — **Eva** (`EMitq3VTSayVifhYVhjmWQ`)
- `lacey` — **Lacey** (`EiSEtivuSsmgccThjvV6sw`)
- `malani` — **Malani** (`cxC14XV_QhaudFkr6KpY5A`)
- `nd1000` — **ND1000 v2** (`SMlBPnRsQ8u7m970A-pGNw`)
- `nd1040` — **ND1040** (`atQJ-NbNSnmEwElqJ0cKuw`)
- `nd1041` — **ND1041** (`F6fYyuiMTESIgiZO3zWdLg`)
- `nd1042` — **ND1042** (`Y2KfQ_lSTSyHnbesvZL5MA`)
- `nd1043` — **ND1043** (`S01TUvGISVaH6ze4dVCdmA`)
- `nd1044` — **ND1044** (`RRSP3WuoTgGTg_P-o417jw`)
- `nd1045` — **ND1045** (`KOfm0VR3TICaDXEAiCaFNA`)
- `nd1046` — **ND1046 v2** (`GRD9NYbQSz65ryD7LRS7kQ`)
- `nd1047` — **ND1047 v2** (`ay_dLarRQa6PHatoLAMW_Q`)
- `nd1048` — **ND1048 v2** (`CJnfexgdRzOcUrRujTh8bg`)
- `nd1049` — **ND1049 v2** (`M_jcfiHERf6GbLab_hpXmw`)
- `nd1050` — **ND1050** (`BhhCVwYxQ5-UWABxFP0hPQ`)
- `nd1051` — **ND1051 v2** (`WIrhwz7sTdmJXyIgYzczkQ`)
- `nd1055` — **ND1055 Ring** (`FHvY-rGNQVm5HOC7EDMgSw`)
- `nd1060` — **ND1060** (`TlH0yGxnRV-zNcsAyA9yoQ`)
- `nd1061` — **ND1061 Configurator** (`X_aH9Y3WTeCE95EBGa_PGQ`) (protected — save the fit only; do not change models or other settings)
- `nd334ph` — **ND334PH v2** (`Zc_2AbYzQ8ObjUwhM8iXVg`)
- `nd336` — **ND336 Configurator** (`DLVn0aVvScWnnSuKWGzUTg`) (protected — save the fit only; do not change models or other settings)
- `nd336ph` — **ND336PH v2** (`fWKznoJ7T_WVPSXgXZcGsA`)
- `nd344p` — **ND344P** (`XE0n9hw5RjWMfkqA07oA4Q`) (protected — save the fit only; do not change models or other settings)
- `nd366p` — **ND366P v2** (`P4C_7LOLTV6fDK7eAfk4jg`)
- `nd750` — **ND750** (`VTc1ZJKeSd-ePncIGGZDZQ`)
- `nd801` — **ND801 v2** (`UV1bmLVcSPm8ggtdpfZ68A`)
- `noya` — **Noya** (`aCzuAfLXRiipgfWjDBUBRQ`)
- `orianna` — **Orianna v2** (`Yxmb0zf0TFSoDElCJuPoKg`)
- `renie` — **Renie** (`aQpLk_XFRJCKiuBOpeNYSA`)
- `romy` — **Romy** (`UjJAC9TDQmeXzJ6wmmplpQ`)
- `serenity` — **Serenity** (`WavPYghvRgGJnBhfiYv--w`)
- `valeria` — **Valeria v2** (`ciOCDSKMRhSwpM9C-3oX1w`)

## What is still not done

This file began as the read-only prep only. Saving the fit into iJewel (starting with Orianna v2, then the other 43 missing projects) was a separate browser/editor step. Do not PATCH the iJewel API as a shortcut unless that path is reviewed; the supported way is Playground / Editor, Enable AR, fit, Save.

After each save, re-fetch `files/view/<id>` and confirm `config.tryonConfig.enabled` is true. For Erica, Dior, and Arlet, no save is needed.

Nicolette is done as of the 8:16 PM America/New_York update above: new project `WFZUoScmTU6Y6UnumZZJ6A`, fit saved, live pages repointed.
