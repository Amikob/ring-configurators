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
