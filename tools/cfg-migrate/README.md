# cfg-migrate: move a page onto a new iJewel configurator

For each set: build the new-editor configurator in iJewel (diamond icon), then:

```bash
# 1. repoint (fetches https://amikob.ijewel3d.com/api/raw/v1/files/view/<id>?select=config with a browser UA)
node tools/cfg-migrate/repoint.mjs <configuratorId> <slug> <slug>-<privateSuffix> \
     --old-folder-id <oldFolderId> --new-name "<Title>" --verify-urls
#   --dry-run to preview, --allow-partial if some page rings are not in the new configurator,
#   --config file.json to use a saved copy of the configurator JSON instead of fetching.
# Matching is by name stem (3_ct_oval_<hash>.glb == 3_ct_oval.glb == "3Ct Oval"-style names via modelUrl stem).
# Only exact URL / fileId strings are swapped in project.json + saved-config.json (+ app.js PROJECT_ID and the
# configurators.json entry with --old-folder-id), so materials/scene/HDRI/camera/title stay byte-identical.
# A private folder holding only index.html with <base href="../slug/"> is resolved to that slug automatically.
# The command prints the OLD file ids that are now unreferenced by these pages.

# 2. serve + verify headless (5 shape/carat switches per page, all GLBs must be new-configurator files)
(python3 -m http.server 8800 --bind 127.0.0.1 &)
node tools/cfg-migrate/verify.mjs http://127.0.0.1:8800 <configuratorId> /tmp/v <slug>/ <slug>-<suffix>/

# 3. before declaring old ids safe to delete, grep the repo (incl. configurators.json thumbnails):
git grep -n -e <oldFolderId> -e <oldFileId> ; node tests/<slug>.check.mjs
# 4. commit, push, then run verify.mjs with base https://amikob.github.io/ring-configurators once Pages is live.
```
Note: tools/snapshots/<slug>-public.json and tools/build-<slug>-project.mjs are old build inputs; they still name the old
files (builder is marked SUPERSEDED for Lacey: do not re-run it).

## Pre-push slot check (new-editor configurators)
```bash
python3 tools/cfg-migrate/slotcheck.py <configuratorId> /workspace/cfg-migrate/<set> --geometry [--ignore <band>.glb ...]
```
Every Shape x Carat slot must hold `<carat>_ct_<option>.glb` (option label slugged: "Oval North-South" -> oval_north_south,
"Oval Regular" -> oval_regular; carat "0.5" -> 0_5). --geometry downloads the new files and compares them to the staged ones
(materials, bbox, area, only zero-area triangles dropped, cross-match). Needs GT_DIR (default /workspace/gt) with
@gltf-transform/core, @gltf-transform/extensions, draco3dgltf (used by glb-dump.mjs).
Layout for orientation sets (ND1060, ND_EAR_01/02): one Shape option per orientation, Carat list inside; see
/workspace/cfg-migrate/<set>/layout-plan.md. verify.mjs --all also tests orientation 'ew' where the page has it, and
--config <saved-config.json> baselines a page that is not migrated yet.
