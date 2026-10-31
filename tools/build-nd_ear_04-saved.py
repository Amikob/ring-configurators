#!/usr/bin/env python3
"""Build nd_ear_04/saved-config.json + tools/snapshots/nd_ear_04-public.json for ND_EAR_04 (84 GLBs in the plain iJewel folder
GKtyAeYSSqyWCf6CpswpyQ), via public /api/proxy/file-resolve. Scene settings are copied from nd_ear_01/saved-config.json."""
import json, subprocess, urllib.parse, sys
F='GKtyAeYSSqyWCf6CpswpyQ'; H='https://amikob.ijewel3d.com'
ALL=['Asscher','Elongated Cushion','Elongated Radiant','Emerald','Marquise','Oval','Pear','Princess','Round','Square Cushion','Square Radiant','Old Cut Cushion']
CT=['0.5','1','2','3','4','5']
names=[f'{c}Ct {s}' for c in CT for s in ALL]
out=[];bad=[]
for n in names:
    r=json.loads(subprocess.check_output(['curl','-sf','--retry','3',H+'/api/proxy/file-resolve?'+urllib.parse.urlencode({'name':n+'.glb','scope':F})]))
    shape=n.split(' ',1)[1].removesuffix(' Regular')
    if not r.get('found') or r.get('path')!=f'/{F}/': bad.append(n+' (not found)'); continue
    mats=r['meta'].get('materials') or []
    if f'Gem 01 ND_EAR_04 {shape}' not in mats: bad.append(f'{n} gem layer {mats}')
    out.append({'name':n,'title':n,'modelUrl':f"{H}/files/{r['file']}",'icon':f"{H}/files/{r['thumb']}?h=ijewel3d.com",'fileId':r['id'],'tags':[]})
if bad: sys.exit('PROBLEMS:\n'+'\n'.join(bad))
d=json.load(open('nd_ear_01/saved-config.json')); c=json.loads(d['config'])
ring=[x for x in c['plugins']['RingConfigurator']['components'] if x['name']=='Ring'][0]
ring['variations']=out; ring['selectedIndex']=names.index('1Ct Round')
d.update(id=F,name='ND_EAR_04 earrings',config=json.dumps(c))
for p in ['nd_ear_04/saved-config.json','tools/snapshots/nd_ear_04-public.json']: json.dump(d,open(p,'w'))
print('ok',len(out))
