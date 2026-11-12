#!/usr/bin/env bash
# Finish Noya once tools/snapshots/noya-ids.json (iJewel file ids from folder Ob9B3sx0RuSlIO7rEJ8c9A) exists.
# Files must be public in iJewel (meta.pub true), like Aaron's.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/build-noya-local.mjs
node tools/build-noya-project.mjs
python3 - <<'PY'
import json
s=json.load(open('tools/snapshots/noya-public.json'));cfg=json.loads(s['config'])
vs=cfg['plugins']['RingConfigurator']['components'][0]['variations']; v={x['name']:x for x in vs}
shapes=[]
for x in vs:
    sh=x['name'].split(' ',1)[1]
    if sh not in shapes: shapes.append(sh)
order=['Round','Oval','Elongated Cushion','Elongated Radiant','Emerald','Marquise','Old Cut Cushion','Princess']
shapes=sorted(shapes,key=order.index)
c=json.load(open('configurators.json'))
e=next((e for e in c['configurators'] if e['id']=='noya'),None)
if e is None:
    e={'id':'noya'}; c['configurators'].append(e)
e.update({'name':'Noya','path':'noya/','ijewelProjectId':None,'shapes':shapes,'carats':[2,6],'rings':len(vs),'bands':None,'eastWest':False,'metalZones':['Ring'],
 'thumbnail':(v.get('4Ct Oval') or vs[0])['icon'],'status':'new','ijewelFolderId':'Ob9B3sx0RuSlIO7rEJ8c9A'})
json.dump(c,open('configurators.json','w'),indent=2,ensure_ascii=False); open('configurators.json','a').write('\n')
PY
python3 - <<'PY'
import json,urllib.request
s=json.load(open('tools/snapshots/noya-public.json'));cfg=json.loads(s['config'])
for x in cfg['plugins']['RingConfigurator']['components'][0]['variations']:
    d=urllib.request.urlopen(urllib.request.Request(x['modelUrl'],headers={'User-Agent':'curl/8'}),timeout=60).read()
    assert d[:4]==b'glTF',x['name']; print('glb ok',x['name'],len(d))
PY
