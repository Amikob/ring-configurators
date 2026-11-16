"""Convert Next Diamonds .3dm (render meshes on layers Gem*/Metal*) to GLB.
Rhino Z-up mm -> glTF Y-up, units kept in mm (scene extras store unit + resting pose).
No mesh reduction (Koby's cap is 50%; these meshes are small enough at 100%)."""
import sys, json, numpy as np, rhino3dm as r, trimesh
from trimesh.visual.material import PBRMaterial

def mesh_from_rhino(g):
    v = np.array([[p.X, p.Y, p.Z] for p in g.Vertices], dtype=np.float64)
    faces = []
    for i in range(len(g.Faces)):
        f = g.Faces[i]
        a, b, c, d = f
        faces.append((a, b, c))
        if c != d: faces.append((a, c, d))
    m = trimesh.Trimesh(v, np.array(faces), process=False)
    return m

def convert(src, dst):
    f = r.File3dm.Read(src)
    scale = {r.UnitSystem.Millimeters: 1.0, r.UnitSystem.Centimeters: 10.0, r.UnitSystem.Meters: 1000.0}.get(f.Settings.ModelUnitSystem, 1.0)
    parts = {'gem': [], 'metal': []}
    for o in f.Objects:
        g = o.Geometry
        if not isinstance(g, r.Mesh): continue
        lay = f.Layers[o.Attributes.LayerIndex].FullPath.lower()
        kind = 'gem' if lay.startswith('gem') else 'metal' if lay.startswith('metal') else None
        if kind: parts[kind].append(mesh_from_rhino(g))
    R = np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]], float)  # Z-up -> Y-up
    S = np.diag([scale]*3 + [1])
    scene = trimesh.Scene()
    allm = []
    for kind, ms in parts.items():
        if not ms: continue
        m = trimesh.util.concatenate(ms)
        m.apply_transform(R @ S)
        if kind == 'metal':
            m.merge_vertices(merge_tex=True, merge_norm=True)
        allm.append(m)
        mat = PBRMaterial(name='Gem 01' if kind == 'gem' else 'Metal 01',
                          baseColorFactor=[255,255,255,255], metallicFactor=0.0 if kind=='gem' else 1.0, roughnessFactor=0.0 if kind=='gem' else 0.12)
        m.visual = trimesh.visual.TextureVisuals(material=mat)
        scene.add_geometry(m, node_name=kind, geom_name=kind)
    # Resting pose: most probable stable pose of the whole ring (like WebGi PosePlugin pose 0)
    whole = trimesh.util.concatenate(allm)
    hull = whole.convex_hull
    T, P = trimesh.poses.compute_stable_poses(hull, n_samples=1)
    # trimesh poses are Z-up (rests on z=0). Convert to Y-up world: Y-up = R @ T @ inv(R)? T acts in our (Y-up) mesh coords and puts the rest plane at z=0; then rotate z->y.
    Zup2Yup = np.array([[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]], float)
    rest = Zup2Yup @ T[0]
    b = whole.bounds
    scene.metadata['extras'] = {'units': 'mm', 'rest': rest.tolist(), 'restProb': float(P[0]),
        'bounds': b.tolist(), 'source': src.split('/')[-2] + '/' + src.split('/')[-1]}
    glb = scene.export(file_type='glb', include_normals=True)
    # inject extras into scene
    open(dst, 'wb').write(glb)
    return scene.metadata['extras']

if __name__ == '__main__':
    print(json.dumps(convert(sys.argv[1], sys.argv[2]))[:300])
