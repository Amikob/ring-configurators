"""Copy Koby's HDR/EXR maps, convert to web .hdr (Radiance RLE, max 1024x512), register in envs.json.
usage: prep-hdri.py metal|diamond <prefix-or-path>... (order = m01.. / d01..)"""
import os, sys, glob, json, shutil, cv2, numpy as np
os.environ['OPENCV_IO_ENABLE_OPENEXR'] = '1'
kind, items = sys.argv[1], sys.argv[2:]
A = '/home/box/agent-data/agents/92a0d903-723b-492d-b9cd-dde2aed54e74/attachments'
src_dir = f'/workspace/selfhost/hdri/{kind}'; os.makedirs(src_dir, exist_ok=True)
web_dir = f'/workspace/rc-hand/noya-selfhost/env/{kind}'; os.makedirs(web_dir, exist_ok=True)
envs_path = '/workspace/rc-hand/noya-selfhost/env/envs.json'
envs = json.load(open(envs_path))
letter = 'm' if kind == 'metal' else 'd'
mapping = []
for i, it in enumerate(items, 1):
    f = it if os.path.exists(it) else glob.glob(f'{A}/{it}*')[0]
    nid = f'{letter}{i:02d}'; ext = f.rsplit('.', 1)[1].lower()
    shutil.copy(f, f'{src_dir}/{nid}.{ext}')
    if ext == 'exr':   # this OpenCV build has no EXR codec: decode with three.js EXRLoader in node
        import subprocess
        subprocess.run(['node', '/workspace/selfhost/build/exr2raw.mjs', f, '/tmp/exr.raw'], check=True, cwd='/workspace/selfhost/build', capture_output=True)
        raw = open('/tmp/exr.raw', 'rb').read(); nl = raw.index(b'\n'); meta = json.loads(raw[:nl])
        rgb = np.frombuffer(raw[nl + 1:], dtype=np.float32).reshape(meta['height'], meta['width'], 3)
        im = rgb[::-1, :, ::-1].copy()   # EXRLoader rows are bottom-up; cv2 wants top-down BGR
    else:
        im = cv2.imread(f, cv2.IMREAD_UNCHANGED).astype(np.float32)[..., :3]   # BGR
    h, w = im.shape[:2]
    maxw = 512 if kind == 'metal' else 1024   # metal is blurred by PMREM anyway; diamonds need sharp facets
    # Equirect lookup is by UV, so square maps can be resampled to 2:1 without changing the look.
    if kind == 'metal' and (w > 512 or h > 256): im = cv2.resize(im, (512, 256), interpolation=cv2.INTER_AREA)
    elif w > maxw: im = cv2.resize(im, (maxw, round(maxw * h / w)), interpolation=cv2.INTER_AREA)
    im = np.nan_to_num(np.clip(im, 0, 65000))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from rgbe import write_hdr_rle
    write_hdr_rle(f'{web_dir}/{nid}.hdr', im[..., ::-1].astype(np.float32))
    lum = 0.0722 * im[..., 0] + 0.7152 * im[..., 1] + 0.2126 * im[..., 2]
    # Normalise brightness so every map starts at a comparable level (median-weighted mean -> 0.6 for metal).
    target = 0.93 if kind == 'metal' else 1.14   # = effective mean of the pilot's m00 / d00
    exposure = float(np.clip(target / max(lum.mean(), 1e-4), 0.05, 50))
    entry = {'id': nid, 'file': f'{kind}/{nid}.hdr', 'name': os.path.splitext(os.path.basename(f))[0] if os.path.exists(it) else f'Koby {nid}', 'exposure': round(exposure, 3), 'saturation': 1 if kind == 'metal' else 0, 'source': os.path.basename(f), 'size': f'{w}x{h}'}
    envs[kind] = [e for e in envs[kind] if e['id'] != nid] + [entry]
    mapping.append(f"{nid}\t{os.path.basename(f)}\t{w}x{h}\tmean={lum.mean():.3f}\tweb={os.path.getsize(f'{web_dir}/{nid}.hdr')//1024}KB")
envs[kind].sort(key=lambda e: e['id'])
json.dump(envs, open(envs_path, 'w'), indent=2)
open(f'{src_dir}/mapping.tsv', 'w').write('\n'.join(mapping) + '\n')
print('\n'.join(mapping))
