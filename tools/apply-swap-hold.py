#!/usr/bin/env python3
"""Idempotent patcher: no intermediate frame when the ring changes (every <slug>/app.js + scene-refresh.js).

  python3 tools/apply-swap-hold.py [--check] [--only <slug>] [repo_root]

While a selection loads, the canvas stays frozen on the previous ring (pose + gem materials intact).
The new ring is loaded, posed (lying/standing), given gold + diamond materials and framed while nothing is drawn;
rendering resumes only when it is complete. Also makes lying ("Rest") the default start pose.
--check reports unpatched pages (exit 1). Pages made from the template inherit this.
"""
import re, sys, pathlib
args = [a for a in sys.argv[1:] if not a.startswith('--')]
only = None
if '--only' in sys.argv:
    only = sys.argv[sys.argv.index('--only') + 1]; args = [a for a in args if a != only]
root = pathlib.Path(args[0] if args else '.').resolve()
check = '--check' in sys.argv
template = (root / 'shared' / 'scene-refresh.template.js').read_text()
CALL_OLD = 'const finishSceneUpdate = beginSceneUpdate(viewer);'
CALL_NEW = 'const finishSceneUpdate = beginSceneUpdate(viewer, { hold: !resumeView });'
# The first load: keep the loading screen up until a frame with every stone shaded has been drawn.
START_OLD = 'await drain(); $(\'startup\').hidden = true;'
START_NEW = 'await drain(); await whenGemsShaded(viewer); $(\'startup\').hidden = true;'
PRESERVED = {'erica','arlet','arlet-test','ada','dior','nd1061','nd336','nd344p'}  # live before this work; never touched
bad = []
for d in sorted(root.iterdir()):
    app = d / 'app.js'; sr = d / 'scene-refresh.js'
    if not (app.is_file() and sr.is_file()) or (only and d.name != only) or d.name in PRESERVED: continue
    text = app.read_text(); new = text
    new = new.replace('{ hold: Boolean(applied) && !resumeView }', '{ hold: !resumeView }')
    if CALL_NEW not in new:
        if CALL_OLD not in new: raise SystemExit(f'{d.name}: anchor missing: beginSceneUpdate call')
        new = new.replace(CALL_OLD, CALL_NEW, 1)
    if START_NEW not in new:
        if START_OLD not in new: raise SystemExit(f'{d.name}: anchor missing: startup hide after first drain')
        new = new.replace(START_OLD, START_NEW, 1)
    new = new.replace('import { beginSceneUpdate, refreshSceneShadows } from', 'import { beginSceneUpdate, refreshSceneShadows, whenGemsShaded } from')
    new = re.sub(r"(from './scene-refresh\.js\?v=)[^']*'", r"\1hold-4'", new, count=1)
    new = re.sub(r"(?m)^(let desired = \{[^\n]*pose: )'upright'( \};)", r"\1'flat'\2", new, count=1)
    if "pose: 'flat' }" not in new: raise SystemExit(f'{d.name}: anchor missing: desired pose')
    if new != text or sr.read_text() != template: bad.append(d.name)
    if not check:
        if new != text: app.write_text(new)
        if sr.read_text() != template: sr.write_text(template)
if check:
    print('unpatched:', ' '.join(bad) or 'none'); sys.exit(1 if bad else 0)
print('patched:', ' '.join(bad) or 'nothing to do')
