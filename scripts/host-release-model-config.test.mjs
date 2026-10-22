import test from 'node:test'
import assert from 'node:assert/strict'
import {patchModelEnvironment,MODEL_TARGET,sealModelConfigPlan,validateModelConfigPlan,runModelConfigRelease,modelConfigBoundary} from './host-release-model-config.mjs'
import {createModelConfigOperations,modelContainerPolicyHash} from './host-release-model-config-komodo.mjs'
import {createHash} from 'node:crypto'
const h='a'.repeat(64),id='b'.repeat(24),sha='c'.repeat(40),apps=['lingxiloop-app-a','lingxiloop-app-b'],core='lingxiloop-core-state'
const sourceModels={OPENAI_MODEL:'zai-org/GLM-5.3-Flash',OPENAI_EMBEDDING_MODEL:'BAAI/bge-m3'}
function plan(){return sealModelConfigPlan({format:'model-configuration-release/v1',createdAt:'2026-10-22T00:00:00Z',sourceAcceptanceSha256:h,sourceAuditSha256:h,release:{sha,runtime:'3.8.2',schema:14,protocol:11,schemaHash:'c56818613b8c1c03a525334bc66f2a5f1534f1dad3b80bbe46f76ffc4bd7b50f',integrity:'sha512-'+Buffer.alloc(64,1).toString('base64'),tarball:'https://npm.pkg.github.com/download/@lyyzka/lingxios/3.8.2/fixture',productVersion:54,migrations:Array.from({length:54},(_,i)=>({version:i+1,name:'migration_'+(i+1),checksum:h})),image:{indexDigest:'sha256:'+h,configDigest:'sha256:'+h,manifestDigest:'sha256:'+h,diffIds:['sha256:'+h],auditSha256:h}},sourceModels,targetModels:MODEL_TARGET,stacks:[...apps,core].map((stack,i)=>({stack,server:i===1?'shanghai-b':'shanghai-a',id:String(i+1).repeat(24),sourceConfigSha256:h,targetConfigSha256:i===2?h:'d'.repeat(64),composeSha256:h})),containers:apps.flatMap((stack,i)=>['lingxiloop','worker'].map((service,j)=>({stack,service,id:String(i*2+j+1).repeat(64),imageId:'sha256:'+h,sourcePolicySha256:h,targetPolicySha256:'e'.repeat(64)}))),knowledge:{mode:'stopped',stack:'lingxiloop-knowledge-agent',server:'shanghai-b',id,configSha256:h,containerId:'f'.repeat(64),imageId:'sha256:'+h,manifestSha256:h,fenceSha256:h}})}
// Use real reviewed full54 invariants, not invented package/schema claims.
const inventory=(await import('./public-text-release.mjs'))
function validPlan(){const p=plan();Object.assign(p.release.migrations[48],{name:'conversation_list_removals',checksum:'d7d52a20d4b093910083524ae324d3e865012d791c7eecd2340d82b51528e15d'});for(const [i,v] of [[50,inventory.MIGRATION51],[51,inventory.MIGRATION52],[52,inventory.MIGRATION53],[53,inventory.MIGRATION54]])p.release.migrations[i]=v;return sealModelConfigPlan(p)}
test('model environment patch changes only two complete values and retains all secret/unrelated bytes',()=>{
 const before='PASSWORD = fixture-secret\r\nOPENAI_MODEL = zai-org/GLM-5.3-Flash\r\nOPENAI_EMBEDDING_MODEL = [[EXISTING_BGE]]\r\nOTHER = value\r\n'
 const after=patchModelEnvironment(before)
 assert.equal(after,'PASSWORD = fixture-secret\r\nOPENAI_MODEL = deepseek-ai/DeepSeek-V4.1-Flash\r\nOPENAI_EMBEDDING_MODEL = Pro/BAAI/bge-m3\r\nOTHER = value\r\n')
 for(const bad of ['',before+'OPENAI_MODEL = duplicate\n',before.replace('OPENAI_MODEL','export OPENAI_MODEL'),before.replace('OPENAI_MODEL = zai-org/GLM-5.3-Flash','OPENAI_MODEL = one\\\ntwo')])assert.throws(()=>patchModelEnvironment(bad))
 assert.throws(()=>patchModelEnvironment(before,{...MODEL_TARGET,NEW_SECRET:'not-permitted'}))
})
test('sealed plan admits only unchanged formal full54 and the exact model pair',()=>{
 const p=validPlan();assert.doesNotThrow(()=>validateModelConfigPlan(p))
 for(const change of [p=>p.targetModels.OPENAI_MODEL='other',p=>p.targetModels.OPENAI_EMBEDDING_MODEL='BAAI/bge-m3',p=>p.targetModels.SECRET='x',p=>p.release.schema=15,p=>p.release.productVersion=53,p=>p.containers.pop(),p=>p.knowledge.mode='running',p=>p.stacks[0].stack='other']){const q=structuredClone(p);change(q);assert.throws(()=>validateModelConfigPlan(sealModelConfigPlan(q)))}
 const q=structuredClone(p);q.release.sha='0'.repeat(40);assert.throws(()=>validateModelConfigPlan(q))
})
function fixture(fault={}){
 const p=validPlan(),events=[],calls=[],rows=p.containers.map(c=>({...c,running:true,pid:1,healthy:true,restarting:false,restartCount:0}));let observed=0,reads=0,nativeId=0;
 const native=(stack,operation)=>({_id:{$oid:String(++nativeId).padStart(24,'0')},operation,target:{type:'Stack',id:p.stacks.find(r=>r.stack===stack).id},status:'Complete',success:true,start_ts:1,end_ts:2});
 const state=()=>({runtime:p.release.runtime,schema:14,installedSchema:14,protocol:11,schemaHash:p.release.schemaHash,count:54,product:54,migrations:p.release.migrations,readOnly:true,fullVisibility:true,liveWork:0,liveSession:0,liveAttempts:0,liveCapture:0,liveOutbox:0,prepared:0,otherClients:8,queued:0,pendingCapture:0});
 const ops={
  async assertBoundary(ctx){calls.push('boundary');if(fault.boundary)throw Error('drift');return rows.map(r=>({...r}))},
  async state(){calls.push('state');const s=state();if(fault.provenance)s.migrations=s.migrations.slice(1);if(rows.every(r=>!r.running)&&reads++<2&&fault.expiring)s.liveWork=1;if(fault.busy)s.liveWork=1;return s},
  async stop(stack,service){calls.push('stop:'+stack+':'+service);if(fault.stopUnknown)throw Object.assign(Error('unknown'),{uncertain:true});const r=rows.find(r=>r.stack===stack&&r.service===service);r.running=false;r.pid=0;return native(stack,'StopStackService')},
  async configure(stack){calls.push('configure:'+stack);if(fault.configUnknown)throw Object.assign(Error('unknown'),{uncertain:true});return {responseAcknowledged:true,fullConfigReadback:true,targetConfigSha256:p.stacks.find(r=>r.stack===stack).targetConfigSha256}},
  async deploy(stack,service){calls.push('deploy:'+stack+':'+service);const r=rows.find(r=>r.stack===stack&&r.service===service);Object.assign(r,{id:String(++observed+5).repeat(64),running:true,pid:2,healthy:true});if(fault.deployFailure)throw Error('terminal failure');return native(stack,'DeployStackService')},
  async deploymentIdentity(stack,service){const r=rows.find(r=>r.stack===stack&&r.service===service);return {id:r.id,imageId:r.imageId}},
  async healthy(stack,service,identity){calls.push('healthy:'+stack+':'+service);if(fault.health){fault.health=false;throw Error('health failed')}return rows.find(r=>r.stack===stack&&r.service===service)},
  async verifyPriorOperations(){calls.push('verify-prior')},
  async wait(){calls.push('wait')},
 }
 return {plan:p,ops,events,calls,run:()=>runModelConfigRelease({plan:p,ops,onProgress:async e=>events.push(e)})}
}
test('config release drains all writers, naturally waits twice, changes two stacks and deploys Web before Worker',async()=>{
 const f=fixture({expiring:true});const r=await f.run();assert.equal(r.status,'complete')
 assert.deepEqual(f.calls.filter(x=>x.startsWith('stop:')),['worker','lingxiloop'].flatMap(service=>apps.map(stack=>'stop:'+stack+':'+service)))
 assert.deepEqual(f.calls.filter(x=>x.startsWith('configure:')),apps.map(s=>'configure:'+s))
 assert.deepEqual(f.calls.filter(x=>x.startsWith('deploy:')),['lingxiloop','worker'].flatMap(service=>apps.map(stack=>'deploy:'+stack+':'+service)))
 assert.equal(f.events.filter(e=>e.phase==='drain'&&e.status==='waiting-for-lease-expiry').length,2)
 assert.equal(f.calls.some(c=>/migrat|backup|pull|stage/.test(c)),false)
})
test('uncertain operations stop without another write or automatic recovery',async()=>{
 for(const key of ['stopUnknown','configUnknown']){const f=fixture({[key]:true});await assert.rejects(f.run());assert.equal(f.events.at(-1).status,'uncertain');assert.equal(f.calls.some(x=>x.startsWith('deploy:')),false);assert.equal(f.events.at(-1).noAutomaticRetry,true)}
})
test('source/schema drift rejects before configuration or deployment',async()=>{
 for(const key of ['boundary','provenance']){const f=fixture({[key]:true});await assert.rejects(f.run());assert.equal(f.calls.some(x=>/^(stop|configure|deploy):/.test(x)),false)}
})
test('known observed target health failure continues without replaying stop/config/deployment',async()=>{
 const f=fixture({health:true});await assert.rejects(f.run());const receipt={planHash:f.plan.planHash,mode:f.plan.format,complete:false,events:f.events};const b=modelConfigBoundary(f.plan,receipt);assert.equal(b.deployed.size,1)
 const offset=f.calls.length;await runModelConfigRelease({plan:f.plan,ops:f.ops,receipt,onProgress:async()=>{}})
 const resumed=f.calls.slice(offset);assert.equal(resumed.some(x=>/^(stop|configure):/.test(x)),false);assert.equal(resumed.filter(x=>x==='deploy:lingxiloop-app-a:lingxiloop').length,0);assert.equal(resumed.filter(x=>x.startsWith('deploy:')).length,3)
})
test('continuation rejects completed, unknown, incomplete native pairs and altered plan receipts',async()=>{
 const f=fixture({health:true});await assert.rejects(f.run());const receipt={planHash:f.plan.planHash,mode:f.plan.format,complete:false,events:f.events}
 for(const mutate of [r=>r.complete=true,r=>r.planHash=h,r=>r.events.push({phase:'komodo',status:'uncertain'}),r=>r.events.push({phase:'komodo',status:'submitting',operation:'DeployStack',stack:apps[0],service:'worker'})]){const r=structuredClone(receipt);mutate(r);assert.throws(()=>modelConfigBoundary(f.plan,r))}
})
function liveFixture(){
 const hash=x=>createHash('sha256').update(x).digest('hex'),p=validPlan(),writes=[],configs=new Map(),containers=new Map(),rawImage=JSON.stringify({config:{Env:['NODE_VERSION=22.23.4','LINGXILOOP_COMMIT_SHA='+sha]}})
 p.release.image.configDigest='sha256:'+hash(rawImage)
 for(const row of p.stacks){const environment='SECRET = synthetic-private-value\nOPENAI_MODEL = zai-org/GLM-5.3-Flash\nOPENAI_EMBEDDING_MODEL = BAAI/bge-m3\n',config={environment,auto_pull:false,extra_args:['--no-deps','--pull','never'],branch:'release/current',commit:sha};const detail={_id:{$oid:row.id},config,info:{remote_contents:[{path:'compose.yml',contents:'public '+row.stack}],remote_errors:[],missing_files:[]}};configs.set(row.stack,detail);row.sourceConfigSha256=hash(JSON.stringify(config));row.targetConfigSha256=row.stack===core?row.sourceConfigSha256:hash(JSON.stringify({...config,environment:patchModelEnvironment(environment)}));row.composeSha256=hash('public '+row.stack)}
 for(const row of p.containers){const c={Id:row.id,Image:row.imageId,Config:{Image:'accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'+sha,Env:['NODE_VERSION=22.23.4','LINGXILOOP_COMMIT_SHA='+sha,'NODE_ENV=production','SECRET=synthetic-private-value',...Object.entries(sourceModels).map(([k,v])=>k+'='+v)],User:'',Cmd:['npm','run',row.service==='worker'?'worker:start':'server:start'],Entrypoint:['/usr/bin/tini','--'],Healthcheck:{Test:['CMD','node','probe']}},HostConfig:{ReadonlyRootfs:true,Privileged:false,Memory:640*1024*1024},Mounts:[],State:{Running:true,Pid:2,Restarting:false,OOMKilled:false,Health:{Status:'healthy'}},RestartCount:0};containers.set(row.id,c);row.sourcePolicySha256=modelContainerPolicyHash(c);const d=structuredClone(c);d.Config.Env=d.Config.Env.map(x=>{const i=x.indexOf('=');return Object.hasOwn(MODEL_TARGET,x.slice(0,i))?x.slice(0,i)+'='+MODEL_TARGET[x.slice(0,i)]:x});row.targetPolicySha256=modelContainerPolicyHash(d)}
 const knowledge={_id:{$oid:p.knowledge.id},config:{environment:'private synthetic knowledge'},info:{}};p.knowledge.configSha256=hash(JSON.stringify(knowledge.config));const kb={Id:p.knowledge.containerId,Image:p.knowledge.imageId,State:{Running:false,Pid:0,Restarting:false,OOMKilled:false},RestartCount:0};containers.set(kb.Id,kb)
 const transport={
  async read(op,q){if(op==='ListServers')return ['manager','shanghai-a','shanghai-b'].map(name=>({name,info:{state:'Ok'}}));if(op==='GetProcedureActionState')return {running:false};if(op==='GetStack')return structuredClone(configs.get(q.stack));if(op==='GetStackActionState')return Object.fromEntries(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].map(x=>[x,false]));if(op==='ListStackServices')return p.containers.filter(r=>r.stack===q.stack).map(r=>({service:r.service,container:{id:r.id}}));if(op==='InspectContainer')return structuredClone(containers.get(q.container));if(op==='InspectImage')return {Id:'sha256:'+h,RepoDigests:['accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server@'+p.release.image.indexDigest],Os:'linux',Architecture:'amd64',RootFS:{Type:'layers',Layers:p.release.image.diffIds},Config:{Env:JSON.parse(rawImage).config.Env}};throw Error('Unexpected test read')},async refreshStackCache(){},
 }
 const fetcher=async(url,o)=>{const body=JSON.parse(o.body);if(url.endsWith('/read/GetStack'))return Response.json(knowledge);if(url.endsWith('/read/GetStackActionState'))return Response.json(Object.fromEntries(['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying'].map(x=>[x,false])));if(url.endsWith('/read/ListStackServices'))return Response.json([{service:'open-notebook',container:{id:kb.Id}}]);if(url.endsWith('/write/UpdateStack')){writes.push(body);const row=p.stacks.find(r=>r.id===body.id);Object.assign(configs.get(row.stack).config,body.config);return new Response('',{status:200})}throw Error('Unexpected test endpoint')}
 const sealed=sealModelConfigPlan(p),ops=createModelConfigOperations({plan:sealed,imageConfig:rawImage,apiKey:'synthetic-key',apiSecret:'synthetic-secret',transport,fetcher});return {plan:sealed,ops,writes,configs,containers,kb}
}
test('live configuration adapter emits only the two-model environment patch and verifies full configuration',async()=>{
 const f=liveFixture(),ctx={stopped:new Set(f.plan.containers.map(r=>r.stack+':'+r.service)),configured:new Set(),deployed:new Map()};for(const r of f.plan.containers)Object.assign(f.containers.get(r.id).State,{Running:false,Pid:0})
 await f.ops.assertBoundary(ctx);const proof=await f.ops.configure(apps[0]);assert.equal(proof.fullConfigReadback,true);assert.equal(f.writes.length,1);assert.deepEqual(Object.keys(f.writes[0].config),['environment']);assert.match(f.writes[0].config.environment,/SECRET = synthetic-private-value/);assert.match(f.writes[0].config.environment,/OPENAI_MODEL = deepseek-ai\/DeepSeek-V4.1-Flash/);assert.match(f.writes[0].config.environment,/OPENAI_EMBEDDING_MODEL = Pro\/BAAI\/bge-m3/)
})
test('live configuration adapter rejects stopped knowledge identity, unrelated config and container policy drift',async()=>{
 for(const change of [f=>f.kb.State.Running=true,f=>f.configs.get(apps[0]).config.environment+='OTHER = drift\n',f=>f.containers.get(f.plan.containers[0].id).Config.Env.push('OTHER=drift'),f=>f.containers.get(f.plan.containers[0].id).Image='sha256:'+'0'.repeat(64),f=>f.containers.get(f.plan.containers[0].id).Config.Env[0]='NODE_VERSION=22.99.0']){const f=liveFixture();change(f);await assert.rejects(f.ops.assertBoundary({stopped:new Set(),configured:new Set(),deployed:new Map()}));assert.equal(f.writes.length,0)}
})
