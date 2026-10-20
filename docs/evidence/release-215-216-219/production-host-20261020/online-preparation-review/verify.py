#!/usr/bin/env python3
"""Local-only evidence verifier: no network, credentials or production actions."""
import json, hashlib, pathlib, datetime, statistics, subprocess
D=pathlib.Path('/tmp/lingxi-358-production')
O=pathlib.Path(__file__).parent
R=pathlib.Path('/workspace/LingxiLoop-maintenance-host-source')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(n): return json.loads((D/n).read_bytes())
def ms(s): return round(datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()*1000)
def check(v,m):
 if not v: raise AssertionError(m)
expected={
'online-direct-host-preparation.json':'feba715e52344e08642b4b01f29358655d8c9ec0ca6ecf88f3bfa97ff73403c7',
'online-direct-host-terminal-receipts.json':'e59574a8496823d113478f792d9677f8013543ff454b84983c6808536e4b307b',
'online-host-preparation.json':'1cb89f3812661b5414b9f812218f60e00f26ff2d78a97b53e9cb3d4411d6c119',
'maintenance-host-plan.json':'7ea3bb53b0e23c0382512193932f18be58d472dc01d14dc588b40cab97d0d9eb',
'prepare-direct-host-sources.mjs':'b9265a1403b818eb5c8ecbb19fd6246c3e4dc09ce90df778c54dd9a512b2e8b7',
'collect-direct-host-receipts.mjs':'1bd7b335551c7929ec28d59a9e95fc586f2b9288e47deae7e694fd9ede48a6c1',
'host-source-cached-image-ci-summary.json':'89964f6d9913876d2f05378cae6fee3151bc3422d282b39a6c014cc8b19c50af'}
for n,h in expected.items(): check(sha(D/n)==h,'Evidence hash drift: '+n)
p=read('online-direct-host-preparation.json'); t=read('online-direct-host-terminal-receipts.json'); plan=read('maintenance-host-plan.json'); prior=read('online-host-preparation.json'); ci=read('host-source-cached-image-ci-summary.json')
planhash='67db9eb7800edda238fb8e9a72dbcb28793f50314a92a731c361874842ac0849'
check(p['planHash']==t['planHash']==plan['planHash']==prior['planHash']==planhash,'Plan bindings')
body={k:v for k,v in plan.items() if k!='planHash'}
check(hashlib.sha256(json.dumps(body,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()==planhash,'Plan seal')
check(t['preparationSha256']==expected['online-direct-host-preparation.json'] and t['verified'] is True and p['complete'] is True,'Success binding')
check(p['prior']['sha256']==expected['online-host-preparation.json'] and p['prior']['updateId']=='6ad7723fe06d5e1f79836d40','Prior binding')
e=p['events']; final=e[-1]; start=ms(p['startedAt']); end=ms(final['at'])
check(final=={'phase':'complete','status':'verified','originalContainersUnchanged':True,'gitCloneSubmissions':0,'at':'2026-10-20T14:08:31.272Z'},'Final assertion')
check(all(ms(a['at'])<=ms(b['at']) for a,b in zip(e,e[1:])),'Event chronology')
check(e[0]['phase']=='prior-action' and e[0]['success'] is False and e[0]['status']=='terminal','Prior outcome unresolved')
check(prior['complete'] is False and prior['events'][-1]['phase']=='stopped','Prior driver unresolved')
check(p['originals']==prior['originals'] and len(p['originals'])==4,'Original inventory')
check(all(x['source']==plan['source']['sha'] and x['imageId']==plan['sourceImageDigest'] and x['running'] is True and x['healthy'] is True and x['restarting'] is False and x['restartCount']==0 for x in p['originals']),'Original health')
rows=plan['hostSource']['stacks']; hashes={x['stack']:x['sha256'] for x in rows}
ids={'lingxiloop-app-a':'6aa8a411b35d27bdd4e12aef','lingxiloop-app-b':'6aa8a414b35d27bdd4e12af1','lingxiloop-core-state':'6aa8a3e8b35d27bdd4e12ae0'}
proofs=[x for x in e if x['phase']=='host-source']
check(len(proofs)==15 and all(x['status']=='verified' and x['sha256']==hashes[x['stack']] for x in proofs),'Host proofs')
configs=[x for x in e if x['phase']=='config']
check(len(configs)==6 and all(x['fields']==['branch','commit','reclone','files_on_host'] for x in configs),'Configuration scope')
check(len([x for x in configs if x['status']=='verified' and x['fullConfigReadback'] is True])==3,'Full configuration readback')
fileevents=[x for x in e if x['phase']=='host-file' and x['status']=='verified']
completed=[x for x in e if (x['phase']=='host-file' and x['status']=='verified') or (x['phase']=='komodo' and x['status']=='complete')]
expectedids=['6ad774ede06d5e1f79836dca','6ad77507e06d5e1f79836dd2','6ad77520e06d5e1f79836dda','6ad7754be06d5e1f79836de4','6ad77565e06d5e1f79836de8','6ad7757ce06d5e1f79836def','6ad77594e06d5e1f79836df6','6ad775ace06d5e1f79836dfa','6ad775c4e06d5e1f79836e01']
check([x['updateId'] for x in completed]==expectedids==[x['id'] for x in t['updates']],'Operation order/identity')
check(len(set(expectedids))==9 and len(fileevents)==3,'Operation inventory')
check(all(x.get('operation')=='RunStackService' for x in e if x['phase']=='komodo'),'Unexpected executable operation')
metadata={k:plan['target'][k] for k in ['sha','runtime','schema','productVersion']}
source={'runtime':plan['source']['runtime']['runtime'],'schema':12,'product':46,'schemaHash':plan['source']['runtime']['schemaHash']}
for n,(event,u) in enumerate(zip(completed,t['updates'])):
 check(u['stack']==event['stack'] and u['target']=={'type':'Stack','id':ids[u['stack']]},'Target mismatch')
 check(u['status']=='Complete' and u['success'] is True,'Unsuccessful terminal')
 check(u['operation']==('WriteStackContents' if n<3 else 'RunStackService'),'Operation mismatch')
 check(u['endTs']-u['startTs']==u['durationMs'] and start<u['startTs']<=u['endTs']<=ms(event['at'])<=end,'Invalid actual timing')
 if n: check(t['updates'][n-1]['endTs']<u['startTs'],'Operations overlap')
 if n>=3: check(u.get('source')==source if u['stack'].endswith('core-state') else u.get('metadata')==metadata,'Version proof mismatch')
rounds=[x for x in e if x['phase'] in ['host-round-1','host-round-2']]
check(len(rounds)==6 and all(x['status']=='verified' and (x.get('source')==source if x['stack'].endswith('core-state') else x.get('metadata')==metadata) for x in rounds),'Round proof mismatch')
for i in range(3): check(t['updates'][i+6]['startTs']-t['updates'][i+3]['endTs']>5000,'Warm cache revalidation delay')
for name in hashes:
 rel='deploy/komodo/'+name+'/compose.yml'
 blob=subprocess.check_output(['git','show',plan['pinCommit']+':'+rel],cwd=R)
 entry=subprocess.check_output(['git','ls-tree',plan['pinCommit'],rel],cwd=R).decode()
 check(entry.startswith('100644 blob ') and hashlib.sha256(blob).hexdigest()==hashes[name],'Public blob mismatch')
# Freeze exactly the nearest bracketing samples. No edits to the growing producer file.
obs_path=O/'availability-preparation-window.jsonl'
if not obs_path.exists():
 raw=(D/'public-host-preparation-proxy-availability.jsonl').read_bytes().splitlines(keepends=True)
 valid=[]
 for line in raw:
  try: valid.append((json.loads(line),line))
  except json.JSONDecodeError: break
 before=[x for x in valid if ms(x[0]['at'])<start]; inside=[x for x in valid if start<=ms(x[0]['at'])<=end]; after=[x for x in valid if ms(x[0]['at'])>end]
 check(before and after,'Missing observation brackets')
 obs_path.write_bytes(b''.join(x[1] for x in [before[-1],*inside,after[0]]))
obs=[json.loads(x) for x in obs_path.read_bytes().splitlines()]; inside=[x for x in obs if start<=ms(x['at'])<=end]
check(len(obs)==50 and len(inside)==48 and ms(obs[0]['at'])<start and ms(obs[-1]['at'])>end,'Availability window inventory')
check(all(x['status']==200 and x['ok'] is True for x in obs),'Observed readiness failure')
old=[json.loads(x) for x in (D/'public-host-preparation-availability.jsonl').read_bytes().splitlines()]
check(len(old)==16 and all(x['status'] is None and x['ok'] is False for x in old),'Old observer classification')
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=R).decode().strip()
check(head==ci['headSha']=='16313a843aa824050e7cfb88f66db80193a88492' and ci['status']=='completed' and ci['conclusion']=='success','Exact tooling CI mismatch')
check(all(ci[x]=='skipped' for x in ['publish','deploy','update-manifests','rollout']),'Unexpected CI deployment')
subprocess.run(['node','--input-type=module','-e',"import {readFile} from 'node:fs/promises'; import {validatePlan} from './scripts/schema-upgrade-maintenance.mjs'; await validatePlan(JSON.parse(await readFile('/tmp/lingxi-358-production/maintenance-host-plan.json','utf8')));"],cwd=R,check=True)
result={'decision':'PASS_ONLINE_HOST_SOURCE_PREPARATION','reviewMode':'local-only; no production API calls','planHash':planhash,'driverSha256':expected['prepare-direct-host-sources.mjs'],'inputSha256':expected,'startedAt':p['startedAt'],'finishedAt':final['at'],'durationMs':end-start,'operationCount':9,'operations':t['updates'],'hostHashVerificationCount':15,'hostComposeSha256':hashes,'hostProofDurationMs':{'min':min(x['durationMs'] for x in proofs),'median':statistics.median(x['durationMs'] for x in proofs),'max':max(x['durationMs'] for x in proofs)},'roundProofs':rounds,'originalContainerCount':4,'originalInventoryMatchesPrior':True,'finalOriginalContainersUnchangedAssertion':True,'originalContainersEvidenceLimit':'Driver performs identity/health checks repeatedly; only baseline rows and final successful assertion are persisted. No independent continuous per-node health series.','availability':{'snapshotSha256':sha(obs_path),'bracketingSampleCount':len(obs),'inWindowSampleCount':len(inside),'allStatus200':True,'first':obs[0],'last':obs[-1],'maximumSampleGapMs':max(ms(b['at'])-ms(a['at']) for a,b in zip(obs,obs[1:])),'oldObserverTransportFailures':len(old),'limit':'HTTP readiness samples only; not continuous uptime or authenticated business smoke.'},'operatorToolingCi':ci,'offlineValidatePlan':'passed','outstandingTerminalReceipts':[],'productionDeploymentOrMigrationAccepted':False,'freshMaintenanceGatesRequired':['assertIdle and exact current configuration/host hashes','verifyImages both nodes exact digest and ImageId','target metadata both nodes and exact source 3.5.6/native12/product46','ordered drain/barrier; fresh final backup and isolated restore validation before DDL','subsequent exact terminal receipts, deployed identity and Web/Worker health'],'credentialEvidenceLimit':'Empty Komodo Git/registry accounts checked; existing host Docker/Git helper/cache state not inspected by this reviewer. Compose always-pull can still contact registry.'}
(O/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'decision':result['decision'],'operationCount':9,'hostProofs':15,'inWindowHttp200':48,'durationMs':end-start,'acceptanceSha256':sha(O/'acceptance.json'),'availabilitySnapshotSha256':sha(obs_path)}))
