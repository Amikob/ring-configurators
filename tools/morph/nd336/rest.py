import trimesh, numpy as np, json, glob, os
from multiprocessing import Pool
Zup2Yup = np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]], float)
def work(f):
    s = trimesh.load(f, force='mesh')
    T, P = trimesh.poses.compute_stable_poses(s.convex_hull, n_samples=1)
    return os.path.basename(f), (Zup2Yup @ T[0]).round(6).tolist(), round(float(P[0]), 3)
with Pool(8) as p: res = p.map(work, sorted(glob.glob('flat/*.glb')))
json.dump({f: {'rest': R, 'restProb': pr} for f, R, pr in res}, open('rest.json', 'w'), indent=1)
for f, R, pr in res[:6]: print(f, pr, np.round(np.array(R)[:3,:3],2).tolist())
