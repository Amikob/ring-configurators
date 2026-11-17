import trimesh, numpy as np, json, sys
from scipy.spatial import cKDTree
from scipy.optimize import minimize
L={ct:trimesh.load(f'/workspace/selfhost/glb/{ct}_ct_oval.glb').geometry for ct in [2,3,4,5,6]}
HEAD=8.0
def girdle(g): v=g.vertices; return v[:,0].max(), v[:,2].max()
def smooth(e0,e1,x):
    t=np.clip((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)
def deform(v,s,P,a,b):
    # P: y0,y1 falloff; rho0 radial translate threshold; h vertical shift per unit (s-1); kv vertical scale; yc vertical ref
    w=smooth(P['y0'],P['y1'],v[:,1]); x,y,z=v[:,0],v[:,1],v[:,2]
    rho=np.sqrt((x/a)**2+(z/b)**2)+1e-9
    f=np.minimum(1,P['rho0']/rho)
    o=v.copy(); k=s-1
    o[:,0]+=w*k*x*f; o[:,2]+=w*k*z*f
    o[:,1]+=w*k*(P['h']+P['kv']*(y-P['yc']))
    return o
real={}
for ct in L:
    m=L[ct]['metal']; pts,_=trimesh.sample.sample_surface_even(m,120000,seed=1); real[ct]=(cKDTree(pts[pts[:,1]>HEAD]),pts[pts[:,1]>HEAD])
def err(base,ct,P,full=False):
    m=L[base]['metal']; a,b=girdle(L[base]['gem']); s=(ct/base)**(1/3)
    v=deform(m.vertices,s,P,a,b); v=v[v[:,1]>HEAD]
    d1=real[ct][0].query(v)[0]; d2=cKDTree(v).query(real[ct][1])[0]
    if full:
        d=np.concatenate([d1,d2]); return dict(mean=round(float(d.mean()),3),p95=round(float(np.percentile(d,95)),3),max=round(float(d.max()),3))
    return d1.mean()+d2.mean()
names=['y0','y1','rho0','h','kv','yc']
def run(base, targets):
    def f(x):
        P=dict(zip(names,x))
        if P['y1']<P['y0']+0.5: return 9
        return sum(err(base,ct,P) for ct in targets)
    x0=[8.5,12,1.0,2.0,1.0,12]
    r=minimize(f,x0,method='Nelder-Mead',options=dict(maxiter=600,xatol=1e-3,fatol=1e-5))
    P=dict(zip(names,map(float,r.x)))
    return P
if __name__=='__main__':
    base=int(sys.argv[1])
    t=[c for c in [2,3,4,5,6] if c!=base]
    P=run(base,t); print(base,json.dumps(P))
    nod=dict(y0=99,y1=100,rho0=1,h=0,kv=0,yc=0)
    for ct in t: print(' ',ct,'deform',err(base,ct,P,True),'none',err(base,ct,nod,True))
    json.dump(P,open(f'calib_{base}.json','w'))
