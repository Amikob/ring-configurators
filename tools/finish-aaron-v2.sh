#!/usr/bin/env bash
# Finish the Aaron v2 repoint once tools/snapshots/aaron-v2-ids.json (40 iJewel file ids) exists.
set -euo pipefail
cd "$(dirname "$0")/.."
node tools/build-aaron-local.mjs
node tools/build-aaron-project.mjs
python3 - <<'PY'
import json
s=json.load(open('tools/snapshots/aaron-v2-public.json'));cfg=json.loads(s['config'])
v={x['name']:x for x in cfg['plugins']['RingConfigurator']['components'][0]['variations']}
c=json.load(open('configurators.json'))
for e in c['configurators']:
    if e['id']=='aaron':
        e['ijewelProjectId']=None
        e['ijewelFolderId']='VcOWtWKtQi6vA80XDiyPHQ'
        e['thumbnail']=v['4Ct Oval']['icon']
json.dump(c,open('configurators.json','w'),indent=2,ensure_ascii=False); open('configurators.json','a').write('\n')
PY
# every GLB must download unauthenticated and be a glb
python3 - <<'PY'
import json,urllib.request
s=json.load(open('tools/snapshots/aaron-v2-public.json'));cfg=json.loads(s['config'])
for x in cfg['plugins']['RingConfigurator']['components'][0]['variations']:
    d=urllib.request.urlopen(urllib.request.Request(x['modelUrl'],headers={'User-Agent':'curl/8'}),timeout=60).read()
    assert d[:4]==b'glTF',x['name']; print('glb ok',x['name'],len(d))
PY
