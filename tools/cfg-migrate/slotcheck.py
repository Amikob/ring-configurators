#!/usr/bin/env python3
"""Pre-push slot-mapping check for a new-editor iJewel configurator against the staged GLBs.

usage: slotcheck.py <configuratorId> <stagedDir> [--config cfg.json] [--geometry] [--ignore name.glb ...]

For every combination of the part's axes (manifest.parts[0].dependsOn, e.g. Shape x Carat) the expected staged file is
  <carat>_ct_<option>.glb   carat label '0.5' -> '0_5', '3' -> '3';  option label 'Oval North-South' -> 'oval_north_south',
                            'Oval Regular' -> 'oval_regular'  (lowercase, every run of non-alphanumerics -> '_')
Checks: every slot exists, variant name == expected file, its asset URL stem == expected stem, the old-style component
lists that URL with the same fileId, all file ids/URLs distinct, every staged GLB (minus --ignore) used exactly once.
--geometry also downloads the 40/70/120 files and compares them to the staged ones: same material list, identical
bounding boxes and surface area, only zero-area triangles dropped (iJewel welds/cleans uploads), and a cross-match
(each new file is closest to its own staged file). Exit code 1 on any problem.
"""
import json, os, re, sys, subprocess, tempfile, hashlib, urllib.request, concurrent.futures as cf

def slug(s): return re.sub(r'[^a-z0-9]+', '_', str(s).lower()).strip('_')
def carat_part(label):
    s = str(label).strip()
    try:
        f = float(s); s = str(int(f)) if f == int(f) else repr(f)
    except ValueError: pass
    return s.replace('.', '_')
def expected_file(options):  # options: [(axis, option)] in dependsOn order
    carat = [o for a, o in options if re.fullmatch(r'\d+(\.\d+)?', str(o['label']).strip())]
    rest = [o for a, o in options if o not in carat]
    if len(carat) != 1: raise ValueError(f'need exactly one numeric (carat) axis, got {[o["label"] for a, o in options]}')
    return f"{carat_part(carat[0]['label'])}_ct_{'_'.join(slug(o['label']) for o in rest)}.glb"

def main(argv):
    args, flags = [], {'--ignore': []}; i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--geometry': flags['geometry'] = True
        elif a == '--config': flags['config'] = argv[i + 1]; i += 1
        elif a == '--ignore': flags['--ignore'].append(argv[i + 1]); i += 1
        else: args.append(a)
        i += 1
    cfg_id, staged = args
    if flags.get('config'): doc = json.load(open(flags['config']))
    else:
        req = urllib.request.Request(f'https://amikob.ijewel3d.com/api/raw/v1/files/view/{cfg_id}?select=config', headers={'User-Agent': 'Mozilla/5.0'})
        doc = json.load(urllib.request.urlopen(req))
    rc = json.loads(doc['config'])['plugins']['RingConfigurator']; v2 = rc['v2']; man = v2['manifest']
    axes = {a['key']: a for a in man['axes']}; assets = v2['assets']
    comp = {v['modelUrl']: v for c in rc['components'] for v in c['variations']}
    problems, rows = [], []
    for part in man['parts']:
        dep = part['dependsOn']; variants = dict(part['variants']); seen = set()
        combos = [[]]
        for ak in dep: combos = [c + [(ak, o)] for c in combos for o in axes[ak]['options']]
        for combo in combos:
            key = '.'.join(o['key'] for a, o in combo); label = ' / '.join(str(o['label']) for a, o in combo)
            v = variants.get(key)
            if v is None: problems.append(f'missing slot {key} ({label})'); continue
            seen.add(key)
            try: exp = expected_file(combo)
            except ValueError as e: problems.append(str(e)); continue
            a = assets.get(v.get('sha256'))
            if v.get('name') != exp: problems.append(f'{label}: slot holds {v.get("name")}, expected {exp}')
            if not a: problems.append(f'{label}: no asset for slot'); continue
            stem = os.path.basename(a['url']).split('?')[0]
            if not re.fullmatch(re.escape(exp[:-4]) + r'_[0-9a-f]{10}\.glb', stem): problems.append(f'{label}: asset URL {stem} is not {exp}')
            if comp.get(a['url'], {}).get('fileId') != a['file']: problems.append(f'{label}: component list lacks {stem} / {a["file"]}')
            if not os.path.exists(os.path.join(staged, exp)): problems.append(f'{label}: staged file {exp} not found')
            rows.append(dict(slot=key, label=label, file=exp, url=a['url'], fileId=a['file']))
        for extra in set(variants) - seen: problems.append(f'unexpected slot {extra}')
    for k in ('file', 'url', 'fileId'):
        vals = [r[k] for r in rows]
        if len(set(vals)) != len(vals): problems.append(f'duplicate {k}s: {sorted({x for x in vals if vals.count(x) > 1})}')
    staged_glbs = sorted(f for f in os.listdir(staged) if f.endswith('.glb') and f not in flags['--ignore'])
    unused = sorted(set(staged_glbs) - {r['file'] for r in rows})
    if unused: problems.append(f'staged GLBs not in any slot: {unused}')
    print(f'slots {len(rows)}  distinct ids {len({r["fileId"] for r in rows})}  staged GLBs {len(staged_glbs)}')
    if flags.get('geometry') and rows: problems += geometry(rows, staged)
    for p in problems: print('PROBLEM', p)
    print('PASS' if not problems else f'FAIL ({len(problems)})')
    return 1 if problems else 0

def geometry(rows, staged):
    import numpy as np
    tmp = tempfile.mkdtemp(prefix='slotcheck-'); new, sdir = f'{tmp}/new', f'{tmp}/staged'; os.makedirs(new); os.makedirs(sdir)
    def dl(r):
        with urllib.request.urlopen(urllib.request.Request(r['url'], headers={'User-Agent': 'Mozilla/5.0'})) as resp, open(f"{new}/{r['file']}", 'wb') as fh: fh.write(resp.read())
    with cf.ThreadPoolExecutor(8) as ex: list(ex.map(dl, rows))
    for r in rows: os.symlink(os.path.abspath(os.path.join(staged, r['file'])), f"{sdir}/{r['file']}")
    here = os.path.dirname(os.path.abspath(__file__))
    for s in (new, sdir): subprocess.run(['node', f'{here}/glb-dump.mjs', s, s + '-dump'], check=True)
    def sig(d, n):
        out = []
        for m in json.load(open(f'{d}/{n}.json')):
            V = np.fromfile(f"{d}/{n}.{m['k']}.pos", np.float32).reshape(-1, 3).astype(np.float64); I = np.fromfile(f"{d}/{n}.{m['k']}.idx", np.uint32).reshape(-1, 3)
            ar = np.linalg.norm(np.cross(V[I[:, 1]] - V[I[:, 0]], V[I[:, 2]] - V[I[:, 0]]), axis=1) / 2
            out.append((m['material'], V.min(0), V.max(0), ar.sum(), len(I), int((ar < 1e-9).sum())))
        return out
    names = [r['file'] for r in rows]; N = {n: sig(new + '-dump', n) for n in names}; S = {n: sig(sdir + '-dump', n) for n in names}
    def dist(a, b):
        if [x[0] for x in a] != [x[0] for x in b]: return 1e9
        return max(float(np.abs(x[1] - y[1]).max() + np.abs(x[2] - y[2]).max() + abs(x[3] - y[3])) for x, y in zip(a, b))
    probs, worst, margin = [], 0.0, 1e9
    for n in names:
        d = {m: dist(N[n], S[m]) for m in names}; best = min(d, key=d.get); worst = max(worst, d[n])
        margin = min([margin] + [v for k, v in d.items() if k != n])
        if [x[0] for x in N[n]] != [x[0] for x in S[n]]: probs.append(f'{n}: materials {[x[0] for x in N[n]]} != staged {[x[0] for x in S[n]]}'); continue
        if d[best] < d[n]: probs.append(f'{n}: geometry closer to staged {best} than to its own file')
        if d[n] > 0.01: probs.append(f'{n}: bbox/area differs from staged by {d[n]:.4f}')
        for x, y in zip(N[n], S[n]):
            if y[4] - x[4] > y[5] or x[4] > y[4]: probs.append(f'{n}/{x[0]}: {y[4]} -> {x[4]} triangles, only {y[5]} were zero-area')
    near = sorted((min(v for k, v in {m: dist(N[n], S[m]) for m in names}.items() if k != n), n) for n in names)[:2]
    print(f'geometry: worst own distance {worst:.6f}, nearest other file {margin:.4f} {[x[1] for x in near]}, materials {sorted({x[0] for n in names for x in N[n]})}')
    return probs

if __name__ == '__main__': sys.exit(main(sys.argv[1:]))
