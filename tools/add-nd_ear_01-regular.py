#!/usr/bin/env python3
"""Append the 42 ND_EAR_01 '<c>Ct <Shape> Regular' GLBs (public file-resolve lookup in folder J4erhy18SICM3XhnmpQKOg)
to nd_ear_01/saved-config.json and tools/snapshots/nd_ear_01-public.json. Idempotent."""
import json, subprocess, urllib.parse, sys
F='J4erhy18SICM3XhnmpQKOg'; H='https://amikob.ijewel3d.com'
SH=['Baguette','Elongated Cushion','Elongated Radiant','Emerald','Marquise','Oval','Pear']; CT=['0.5','1','2','3','4','5']
def res(n):
    u=H+'/api/proxy/file-resolve?'+urllib.parse.urlencode({'name':n+'.glb','scope':F})
    return json.loads(subprocess.check_output(['curl','-sf','--retry','3',u]))
new=[];miss=[]
for c in CT:
    for s in SH:
        n=f'{c}Ct {s} Regular'; r=res(n)
        if not r.get('found') or r.get('path')!=f'/{F}/': miss.append(n); continue
        new.append({'name':n,'title':n,'modelUrl':f"{H}/files/{r['file']}",'icon':f"{H}/files/{r['thumb']}?h=ijewel3d.com",'fileId':r['id'],'tags':[],'_mat':r['meta'].get('materials')})
if miss: sys.exit('missing: '+', '.join(miss))
for v in new: print(v['name'],v['modelUrl'],v.pop('_mat'))
for p in ['nd_ear_01/saved-config.json','tools/snapshots/nd_ear_01-public.json']:
    d=json.load(open(p)); c=json.loads(d['config']); ring=[x for x in c['plugins']['RingConfigurator']['components'] if x['name']=='Ring'][0]
    ring['variations']=[v for v in ring['variations'] if not v['name'].endswith(' Regular')]+new
    d['config']=json.dumps(c); json.dump(d,open(p,'w'))
    print(p,len(ring['variations']))
