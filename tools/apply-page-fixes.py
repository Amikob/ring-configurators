#!/usr/bin/env python3
"""Idempotent patcher for the three page fixes first made on nd1046 (commits 639500d, f185c9e, daf1fd2).

  python3 tools/apply-page-fixes.py [--check] [--only <slug>] [repo_root]

Fixes (every <slug>/ that has app.js + scene-refresh.js, except PRESERVED):
 1. Swap hold + first-load gem shading + lying default
      app.js          beginSceneUpdate(viewer, { hold: !resumeView }); await whenGemsShaded(viewer) before hiding #startup;
                      default pose 'flat'; scene-refresh.js import (?v=hold-6)
      scene-refresh.js = shared/scene-refresh.template.js
 2. Lying first view from the head side + SDK fit-to-view animation cancelled
      view-controls.js = shared/view-controls.template.js (headAzimuth, settleCameraAnimations, fitDistance, zoomRatio, keepRatio)
      app.js          await settleCameraAnimations(viewer) before restoreView()
 3. Keep the camera on Stand/Rest and other switches (fixed front view on the very first load only)
      app.js          keepRatio = zoomRatio(viewer); `if (!applied) centerView(resting) else if (pose changed) centerView({keepRatio})`;
                      view-controls.js import (?v=keepcam-1)
 4. index.html       ./app.js?v=<FIX_VERSION> so browsers do not serve stale JS

Every anchor must match exactly once; if one is missing (or view-controls.js / scene-refresh.js is a variant that is neither the known
baseline nor the template) the page is left UNTOUCHED and reported (exit 2). --check changes nothing (exit 1 when pages need the fix).
Pages made by /workspace/ijewel/redo/newpage.py inherit the fixes from the patched eva template (/workspace/ijewel/redo/templates/eva-template, outside the repo since the 2026-10-26 live clean).
"""
import re, sys, hashlib, pathlib

FIX_VERSION = '20261026zhold6'
PRESERVED = {'erica', 'arlet', 'arlet-test', 'ada', 'dior', 'nd1061', 'nd336', 'nd344p'}  # live before this work; never touched
# sha256 of the pre-fix files that are known-safe to replace with the templates
VC_BASELINES = {'63638fe8fdb2eeaa0f369debcb1946b72059a601be7891f84a853d83a4a51c18'}  # view-controls.js at 764f696 (all pages)
SR_BASELINES = {'878c1c932a87fe3d6fa067d0220b63136aed5e178c885a7b73c3b0346a5dd16a',  # scene-refresh.js at 764f696 (all pages)
                '73cc099987b363c15a956af91f86071193f6f3d89474020f2194770a6f7bb8e8',  # shared template at 2f09f65 (hold-4: whenGemsShaded without the metal/texture/progressive-frame readiness)
                'bd1edfa8e6c2bfdfda887fffbfbe5bfc6d872aa1bcaf8ba0e735874bb8057a4b'}  # shared template at 20ef0d8 (hold-5: convergence budget 6 s)

class Skip(Exception): pass

def sha(text): return hashlib.sha256(text.encode()).hexdigest()

def sub(text, what, done, pattern, repl, flags=0):
    """done: regex that is present when the edit is already applied; pattern: regex of the old text (must match exactly once)."""
    if re.search(done, text, flags): return text
    found = re.findall(pattern, text, flags)
    if len(found) != 1: raise Skip(f'anchor {"missing" if not found else "ambiguous"}: {what}')
    return re.sub(pattern, lambda m: m.expand(repl), text, count=1, flags=flags)

IMPORT_SR = "import { beginSceneUpdate, refreshSceneShadows, whenGemsShaded } from './scene-refresh.js?v=hold-6';"
IMPORT_VC = "import { captureView, centerView, settleCameraAnimations, zoomRatio } from './view-controls.js?v=keepcam-1';"

def patch_app(t):
    t = sub(t, 'scene-refresh import', re.escape(IMPORT_SR),
            r"import \{ beginSceneUpdate, refreshSceneShadows(?:, whenGemsShaded)? \} from './scene-refresh\.js\?v=[^']*';", IMPORT_SR.replace('\\', '\\\\'))
    t = sub(t, 'view-controls import', re.escape(IMPORT_VC),
            r"import \{ captureView, centerView(?:, settleCameraAnimations, zoomRatio)? \} from './view-controls\.js\?v=[^']*';", IMPORT_VC)
    # (1) swap hold, also on the first load
    t = sub(t, 'beginSceneUpdate call', re.escape('beginSceneUpdate(viewer, { hold: !resumeView })'),
            r"beginSceneUpdate\(viewer(?:, \{ hold: Boolean\(applied\) && !resumeView \})?\);", 'beginSceneUpdate(viewer, { hold: !resumeView });')
    t = sub(t, 'startup hide after first drain', re.escape("await drain(); await whenGemsShaded(viewer); $('startup').hidden = true;"),
            re.escape("await drain(); $('startup').hidden = true;"), "await drain(); await whenGemsShaded(viewer); $('startup').hidden = true;".replace('\\', '\\\\'))
    t = sub(t, 'default pose', r"(?m)^let desired = \{[^\n]*pose: 'flat' \};",
            r"(?m)^(let desired = \{[^\n]*pose: )'upright'( \};)", r"\1'flat'\2")
    # (3) keep the camera: no enteringRest, keepRatio from the current view
    if "const keepRatio = applied && !resumeView ? zoomRatio(viewer) : null;" not in t:
        t = sub(t, 'enteringRest declaration', r"(?!)", r"\n      const enteringRest = target\.pose === 'flat' && applied\?\.pose !== 'flat';", '')
        t = sub(t, 'restoreView declaration', r"(?!)",
                r"(\n      const restoreView = applied && !resumeView \? captureView\(viewer\) : \(\) => \{\};)",
                r"\1\n      const keepRatio = applied && !resumeView ? zoomRatio(viewer) : null;")
    # (2) cancel the SDK fit-to-view animation before our own framing
    t = sub(t, 'settleCameraAnimations before restoreView', re.escape("await settleCameraAnimations(viewer);\n      restoreView();"),
            r"(\n      applyRenderProfile\(viewer, profile, selectedQuality\);)\n      restoreView\(\);", r"\1\n      await settleCameraAnimations(viewer);\n      restoreView();")
    t = sub(t, 'pose centerView', re.escape("if (!applied) centerView(viewer, {resting:target.pose === 'flat'});"),
            r"\n      if \(enteringRest \|\| applied && target\.pose !== applied\.pose\) centerView\(viewer, \{resting:enteringRest\}\);",
            "\n      // The fixed head-side front view is for the very first load only; later pose toggles keep the user's camera direction and zoom."
            "\n      if (!applied) centerView(viewer, {resting:target.pose === 'flat'});"
            "\n      else if (target.pose !== applied.pose) centerView(viewer, {keepRatio});")
    if 'enteringRest' in t: raise Skip('enteringRest still referenced after patch')
    return t

def patch_html(t):
    # Bump the cache-buster unless it is already at/after FIX_VERSION (repoint.sh writes <date>v2, which also sorts after it).
    m = re.findall(r'\./app\.js\?v=([^"]*)"', t)
    if len(m) != 1: raise Skip(f'anchor {"missing" if not m else "ambiguous"}: index.html app.js ?v=')
    if m[0] >= FIX_VERSION: return t
    return t.replace(f'./app.js?v={m[0]}"', f'./app.js?v={FIX_VERSION}"', 1)

def replace_file(cur, template, baselines, what):
    if cur == template or sha(cur) in baselines: return template
    raise Skip(f'{what} is an unknown variant (neither the baseline nor the template); not overwritten')

def plan(page, tpl_sr, tpl_vc):
    """Return {filename: new_text} for files that must change; raises Skip when the page cannot be patched safely."""
    out = {}
    for fname, fn in (('app.js', patch_app), ('index.html', patch_html)):
        old = (page / fname).read_text(); new = fn(old)
        if new != old: out[fname] = new
    for fname, tpl, base in (('scene-refresh.js', tpl_sr, SR_BASELINES), ('view-controls.js', tpl_vc, VC_BASELINES)):
        p = page / fname
        if not p.is_file(): raise Skip(f'{fname} missing')
        old = p.read_text(); new = replace_file(old, tpl, base, fname)
        if new != old: out[fname] = new
    return out

def main(argv):
    check = '--check' in argv
    only = argv[argv.index('--only') + 1] if '--only' in argv else None
    pos = [a for i, a in enumerate(argv) if not a.startswith('--') and not (only and a == only and argv[i - 1] == '--only')]
    root = pathlib.Path(pos[0] if pos else '.').resolve()
    tpl_sr = (root / 'shared' / 'scene-refresh.template.js').read_text()
    tpl_vc = (root / 'shared' / 'view-controls.template.js').read_text()
    pending, failed, ok = [], {}, []
    for d in sorted(root.iterdir()):
        if not ((d / 'app.js').is_file() and (d / 'scene-refresh.js').is_file()) or d.name in PRESERVED or (only and d.name != only): continue
        try: changes = plan(d, tpl_sr, tpl_vc)
        except Skip as e: failed[d.name] = str(e); continue
        if changes:
            pending.append(d.name)
            if not check:
                for fname, text in changes.items(): (d / fname).write_text(text)
        else: ok.append(d.name)
    if only and not (ok or pending or failed): raise SystemExit(f'{only}: not a patchable page (preserved or no app.js + scene-refresh.js)')
    print(f"{'unpatched' if check else 'patched'}: {' '.join(pending) or 'none'}")
    print(f"already patched: {len(ok)}")
    for slug, why in failed.items(): print(f'CANNOT PATCH {slug}: {why}')
    if failed: return 2
    return 1 if (check and pending) else 0

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
