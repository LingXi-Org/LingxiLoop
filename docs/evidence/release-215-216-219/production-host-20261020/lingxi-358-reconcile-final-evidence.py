"""Reconcile existing local evidence only; no production calls or new system tests."""
import json,pathlib,hashlib
D=pathlib.Path('/tmp/lingxi-358-production');A=pathlib.Path('/tmp/lingxi-225-219-preparation/final-image-audit-result-d107')
def get(n):return json.loads((D/n).read_bytes())
def h(n):return hashlib.sha256((D/n).read_bytes()).hexdigest()
p=get('maintenance-host-plan.json');ex=get('maintenance-host-execution.json');v1=get('maintenance-host-continuation.json');co=get('maintenance-host-continuation-v2.json');t=get('host-continuation-komodo-terminal-receipts.json');after=get('production-host-after-v2.json');before=get('production-before.json');state=get('host-target-state-postflight.json');assets=get('public-host-assets-after.json');final=get('production-host-final-acceptance.json');old=get('production-host-continuation-acceptance.json');audit=json.loads((A/'receipt.json').read_bytes());inv=json.loads((A/'rootfs-inventory.json').read_bytes())
assert h('maintenance-host-plan.json')=='7ea3bb53b0e23c0382512193932f18be58d472dc01d14dc588b40cab97d0d9eb'
assert h('maintenance-host-execution.json')=='1abf04ec0bd4bf9af1f4883a33189d70f65764c787f6e674c0de2c36f6f623fa'
assert final['passed'] is True and len(final['checks'])==18 and all(v is True for v in final['checks'].values())
assert final['priorAcceptanceSha256']==h('production-host-continuation-acceptance.json')=='cb227dcf878ea76b010e6174ecbbcfb58d50d5b5963042dabfd693512ba5a589'
assert old['passed'] is False and [k for k,v in old['checks'].items() if v is not True]==['workerStartupSelfChecksInferred']
assert co['complete'] is True and co['planHash']==p['planHash'] and co['continuationOf']['sha256']==h('maintenance-host-execution.json') and co['continuationOf']['updateId']=='6ad778a1e06d5e1f79836ea6'
assert co['failedValidation']['sha256']==h('maintenance-host-continuation.json') and co['failedValidation']['noExecute'] is True and not v1['complete'] and all(x['phase']!='komodo' for x in v1['events'])
assert t['verified'] is True and t['planHash']==p['planHash'] and t['executionSha256']==h('maintenance-host-execution.json') and t['continuationSha256']==h('maintenance-host-continuation-v2.json')
expected={};opmap={'RunStackService':'RunStackService','StopStack':'StopStackService','DeployStack':'DeployStackService'}
for e in [*ex['events'],*co['events'],*state['events']]:
 if e.get('phase')=='komodo' and e.get('status') in ['complete','failed']:
  assert e['updateId'] not in expected
  expected[e['updateId']]={'stack':e['stack'],'operation':opmap[e['operation']],'success':e['status']=='complete'}
 if e.get('phase')=='backup' and e.get('status')=='verified':
  b=e['backup'];expected[b['updateId']]={'stack':'lingxiloop-core-state','operation':'RunStackService','success':True}
assert len(expected)==len(t['updates'])==27 and len(set(u['id'] for u in t['updates']))==27
ids={'lingxiloop-app-a':'6aa8a411b35d27bdd4e12aef','lingxiloop-app-b':'6aa8a414b35d27bdd4e12af1','lingxiloop-core-state':'6aa8a3e8b35d27bdd4e12ae0'}
for u in t['updates']:
 assert {k:u[k] for k in ['stack','operation','success']}==expected[u['id']] and u['status']=='Complete' and u['target']=={'type':'Stack','id':ids[u['stack']]}
 assert u['endTs']-u['startTs']==u['durationMs'] and u['durationMs']>0
assert [u['id'] for u in t['updates'] if not u['success']]==['6ad778a1e06d5e1f79836ea6']
assert [u['id'] for u in t['updates'] if u['expectedFailure']]==['6ad778a1e06d5e1f79836ea6']
assert all(x['endTs']<y['startTs'] for x,y in zip(t['updates'],t['updates'][1:]))
b=next(e['backup'] for e in ex['events'] if e.get('phase')=='backup' and e.get('status')=='verified')
assert b['success'] and b['restoreCountsEqual'] and b['restoreProvenanceEqual'] and b['isolatedDatabaseRemoved'] and b['attempt']==p['backup']['attempt'] and b['commandHash']==p['backup']['commandHash'] and b['source']==p['source'] and b['countsBefore']==b['countsRestored'] and len(b['countsBefore'])==173
backupReceipt=next(u for u in t['updates'] if u['id']==b['updateId']);migrationReceipt=next(u for u in t['updates'] if u['id']=='6ad77847e06d5e1f79836e91');assert backupReceipt['endTs']<migrationReceipt['startTs']
for s in [state['state'],co['events'][-1]['state']]:
 assert s['runtime']==p['target']['runtime']=='3.5.8' and s['schema']==s['installedSchema']==13 and s['count']==s['product']==48 and s['protocol']==p['target']['protocol'] and s['schemaHash']==p['target']['schemaHash'] and s['migrations']==p['target']['migrations'] and s['readOnly'] and s['fullVisibility']
assert state['verified'] and after['verified'] and after['errors']==[] and after['counts']=={'read':16,'write':0,'execute':0,'sql':0,'provider':0}
assert len(after['containers'])==4 and len({x['id'] for x in after['containers']})==4
assert {(x['stack'],x['service']) for x in after['containers']}=={(s,v) for s in ['lingxiloop-app-a','lingxiloop-app-b'] for v in ['lingxiloop','worker']}
preserved=next(e['preservedWebA'] for e in co['events'] if 'preservedWebA' in e)
for x in after['containers']:
 assert x['imageSource']==x['declaredSource']==p['target']['sha'] and x['imageId']==p['target']['imageDigest'] and x['running'] and x['healthy'] and not x['restarting'] and not x['oomKilled'] and x['restartCount']==0 and x['healthFailingStreak']==0
 assert x['id']==next(y['id'] for y in state['containers'] if y['stack']==x['stack'] and y['service']==x['service'])
 assert x['policy']==next(y['policy'] for y in before['containers'] if y['stack']==x['stack'] and y['service']==x['service'])
 if x['stack']=='lingxiloop-app-a' and x['service']=='lingxiloop':assert x['id']==preserved['id']
 else:assert x['id']==next(e['containerId'] for e in co['events'] if e.get('phase')=='recovery' and e.get('status')=='healthy' and e['stack']==x['stack'] and e['service']==x['service'])
 if x['service']=='worker':assert x['workerEntrypoint']==['/usr/bin/tini','--'] and x['workerEntrypointMatches'] and x['workerCommandMatches'] and x['workerReadyzCheckMatches']
assert len(after['images'])==2 and {i['server'] for i in after['images']}=={'shanghai-a','shanghai-b'}
for i in after['images']:
 assert i['id']==i['descriptor']['digest']==audit['indexDigest']==p['target']['imageDigest'] and i['architecture']=='amd64' and i['os']=='linux' and i['rootFS']['Layers']==[x['diffId'] for x in audit['layers']]
 assert 'accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server@'+p['target']['imageDigest'] in i['repoDigests']
assert hashlib.sha256((A/'rootfs-inventory.json').read_bytes()).hexdigest()==audit['inventorySha256']
assert assets['verified'] and len(assets['requests'])==3
for x in assets['requests']:
 reference=inv['app/dist/index.html' if x['path']=='/' else 'app/dist'+x['path']]
 assert x['status']==200 and x['matchesAuditedImage'] and x['sha256']==reference['sha256']
assert len(after['public'])==4 and all(x['status']==200 and x['ok'] for x in after['public'])
meta=next(x['meta'] for x in after['public'] if x['path']=='/api/meta');assert meta['commitSha']==p['target']['sha'] and meta['reasoningRuntime']['runtime']=='3.5.8' and meta['reasoningRuntime']['schema']==13
names=['production-host-final-acceptance.json','production-host-after-v2.json','host-target-state-postflight.json','public-host-assets-after.json','host-continuation-komodo-terminal-receipts.json','maintenance-host-continuation-v2.json','maintenance-host-continuation.json','maintenance-host-execution.json','production-host-continuation-acceptance.json','maintenance-host-plan.json']
result={'decision':'PASS_FINAL_DEPLOYMENT_EVIDENCE','reviewMode':'local-only evidence reconciliation, no production requests or new isolation tests','candidate':p['target']['sha'],'runtime':'3.5.8','nativeSchema':13,'productMigration':48,'acceptedAt':final['at'],'checks':18,'terminals':{'total':27,'success':26,'retainedExpectedFailure':'6ad778a1e06d5e1f79836ea6','inventoryExactlyMatchesExecutionEvents':True,'strictlySequential':True},'backupTables':173,'containers':[{k:x[k] for k in ['stack','service','id','startedAt','restartCount','healthy','oomKilled']} for x in after['containers']],'webAPreserved':True,'entrypointCorrectedAgainstFrozenSource':True,'publicStatus200':4,'publicAssetsMatchAuditedInventory':3,'inputSha256':{n:h(n) for n in names},'limits':['Authenticated business/chat/provider smoke not run','Startup self-check success inferred from frozen source, command and native readiness; not full isolation/fault-injection coverage','Point-in-time evidence, no long-soak or continuous zero-outage claim','Existing 3.5.3 soak untouched by this reviewer','Historical expected 522 and validation failures retained; recovery does not erase them']}
pathlib.Path('/tmp/lingxi-358-final-evidence-independent-acceptance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'decision':result['decision'],'terminals':result['terminals'],'checks':18,'containers':4,'backupTables':173,'assets':3,'output':'/tmp/lingxi-358-final-evidence-independent-acceptance.json'}))
