#!/usr/bin/env python3
"""Idempotent patcher: wires every ring page (<slug>/app.js) to portal-settings.json and removes the viewer fade.

  python3 tools/apply-portal-settings.py [--check] [--only <slug>] [repo_root]

--check only reports pages that are not patched (exit 1 if any). Used by newpage.py and tests.
Pages created from the `eva` template inherit the patch, so this is only needed when a template is replaced.
"""
import re, sys, pathlib

NOFADE = '''// Selection changes switch directly: the previous ring stays on screen until the new one is fully built, then it is swapped.
// There is no fade and no white stage (this replaces the old 160 ms fade-out / 240 ms fade-in).
export function needsModelTransition(previous, next) {
  return Boolean(previous && ['shape', 'carat', 'band'].some(key => previous[key] !== next[key]));
}

// Kept as no-ops so existing callers keep working; they must never hide the viewer.
export async function fadeViewer(element, hidden) {
  if (!hidden) delete element.dataset.transition;
}

export function paintViewer() {
  return Promise.resolve();
}
'''
PS_IMPORT = "import { loadPortalStart, applyPortalScene, applyPortalDesired, guardDesired, applyStartAngle, installPortalBridge } from '../shared/portal-settings.js?v=1';\n"
START_BLOCK = """    portalStart = await loadPortalStart();
    applyPortalDesired(desired, portalStart, { colors: COLORS, ringVariations: project.plugins?.RingConfigurator?.components?.find(component => component.name === 'Ring')?.variations, parseRing });
"""
START_BLOCK_ARLET = """    portalStart = await loadPortalStart();
    applyPortalDesired(desired, portalStart, { colors: COLORS });
"""

def patch_app(text):
    if 'portal-settings.js' in text:
        return text, False
    out = text
    # 1) import
    out, n = re.subn(r"(?m)^(const \$ = )", lambda m: PS_IMPORT + m.group(1), out, count=1)
    if not n: raise SystemExit('anchor missing: const $ =')
    # 2) state next to `let desired`
    out, n = re.subn(r"(?m)^(let desired = \{[^\n]*\};\n)", lambda m: m.group(1) + "let portalStart = null;\nconst PAGE_DEFAULTS = { ...desired };\n", out, count=1)
    if not n: raise SystemExit('anchor missing: let desired')
    # 3) start(): read settings before the ring is preselected / the viewer is created
    if '    preselectRing(project);\n' in out:
        out = out.replace('    preselectRing(project);\n', START_BLOCK + '    preselectRing(project);\n', 1)
    elif 'ijewelViewer.loadModelById(' in out:
        out = re.sub(r"(?m)^(    const miniViewer = await ijewelViewer\.loadModelById\()", lambda m: START_BLOCK_ARLET + m.group(1), out, count=1)
    else:
        raise SystemExit('anchor missing: start()')
    # 3b) scene: after every merge of the saved iJewel scene, right before the viewer is created
    out, n = re.subn(r"(?m)^(    const miniViewer = new ijewelViewer\.Viewer\()", lambda m: "    applyPortalScene(project, portalStart.scene);\n" + m.group(1), out, count=1)
    if not n and 'loadModelById(' not in out: raise SystemExit('anchor missing: new ijewelViewer.Viewer')
    # 4) impossible combinations fall back to the page defaults
    anchor = 'ready = true; clearTimeout(startupTimeout); render(); await drain();'
    if anchor not in out: raise SystemExit('anchor missing: ready = true')
    out = out.replace(anchor, "desired = guardDesired(desired, PAGE_DEFAULTS, value => resolveSelection(catalog, value));\n    " + anchor, 1)
    # 5) first draw: opening angle
    out, n = re.subn(r"(?m)^(\s*)applied = target;", lambda m: f"{m.group(1)}if (!applied && portalStart?.settings?.angle) applyStartAngle(viewer, portalStart.settings.angle);\n{m.group(0)}", out, count=1)
    if not n: raise SystemExit('anchor missing: applied = target')
    # 6) bridge for the admin preview
    out, n = re.subn(r"(?m)^(\s*)viewer = detail\.viewer;\n", lambda m: m.group(0) + f"{m.group(1)}installPortalBridge(viewer, portalStart);\n", out, count=1)
    if not n: raise SystemExit('anchor missing: viewer = detail.viewer')
    # 7) cache-bust the no-fade transition module
    out = re.sub(r"'\./viewer-transition\.js[^']*'", "'./viewer-transition.js?v=nofade-1'", out)
    return out, True

def main():
    argv = sys.argv[1:]
    only = None
    if '--only' in argv:
        i = argv.index('--only'); only = argv[i + 1]; del argv[i:i + 2]
    args = [a for a in argv if not a.startswith('--')]
    check = '--check' in sys.argv
    root = pathlib.Path(args[0] if args else '.').resolve()
    bad = []
    changed = 0
    for app in sorted(root.glob('*/app.js')):
        if only and app.parent.name != only: continue
        text = app.read_text()
        if 'viewer-transition.js' not in text: continue
        vt = app.parent / 'viewer-transition.js'
        new, did = patch_app(text) if not check else (text, 'portal-settings.js' not in text)
        fade_ok = vt.exists() and vt.read_text() == NOFADE
        if check:
            if did or not fade_ok: bad.append(app.parent.name)
            continue
        if did: app.write_text(new); changed += 1
        if not fade_ok: vt.write_text(NOFADE); changed += 1
    if check:
        print('unpatched pages:', ', '.join(bad) if bad else 'none'); sys.exit(1 if bad else 0)
    print(f'patched files: {changed}')

if __name__ == '__main__':
    main()
