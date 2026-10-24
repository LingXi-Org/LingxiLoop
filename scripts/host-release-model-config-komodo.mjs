// Fixed Komodo2.3.3 endpoints. Secret-bearing configurations remain in memory.
import {isDeepStrictEqual as equal} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
import {createTransport,parseMarker,stateCommand,validateStateReceipt} from './schema-upgrade-komodo.mjs'
import {assertImageIdentity} from './host-release.mjs'
import {parsePublicCompose} from './host-release-compose.mjs'
import {MODEL_TARGET,MODEL_APPS,MODEL_CORE,modelHash,patchModelEnvironment,validateModelConfigPlan} from './host-release-model-config.mjs'
const ORIGIN='https://ops.christmas1314.xyz',IMAGE='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'
const actions=['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying']
const hex=/^[a-f0-9]{64}$/,check=(v,m)=>{if(!v)throw Error(m)},key=r=>r.stack+':'+r.service
function environment(rows){check(Array.isArray(rows),'Container environment unavailable');const values=new Map();for(const line of rows){check(typeof line==='string'&&line.indexOf('=')>0,'Invalid container environment');const n=line.indexOf('='),k=line.slice(0,n);check(!values.has(k),'Duplicate container environment key');values.set(k,line.slice(n+1))}return values}
export function modelContainerPolicyHash(c){
 const env=c.Config?.Env;environment(env)
 const normalized=env.filter(x=>!x.startsWith('LINGXILOOP_COMMIT_SHA=')).map(x=>x.startsWith('NODE_VERSION=')?'NODE_VERSION=<audited-image>':x).toSorted()
 const p={env:normalized,host:Object.fromEntries(['ReadonlyRootfs','Privileged','SecurityOpt','CapAdd','CapDrop','PidsLimit','Binds','Tmpfs','PortBindings','Memory','NanoCpus','Devices','DeviceRequests'].map(k=>[k,c.HostConfig?.[k]])),user:c.Config.User,command:c.Config.Cmd,entrypoint:c.Config.Entrypoint,health:c.Config.Healthcheck,mounts:c.Mounts}
 return modelHash(JSON.stringify(p))
}
export function modelTargetPolicyHash(c){const copy=structuredClone(c);copy.Config.Env=copy.Config.Env.map(line=>{const n=line.indexOf('='),k=line.slice(0,n);return Object.hasOwn(MODEL_TARGET,k)?k+'='+MODEL_TARGET[k]:line});return modelContainerPolicyHash(copy)}

export function createModelConfigOperations({plan,imageConfig,knowledgePlan,apiKey,apiSecret,signal,onProgress=async()=>{},transport,fetcher=fetch,wait=delay}){
 validateModelConfigPlan(plan)
 check(apiKey&&apiSecret&&typeof imageConfig==='string'&&'sha256:'+modelHash(imageConfig)===plan.release.image.configDigest,'Existing credentials and audited source image config required')
 const baked=JSON.parse(imageConfig).config?.Env;check(Array.isArray(baked),'Audited image environment unavailable')
 const bakedNode=environment(baked).get('NODE_VERSION');check(/^22\.\d+\.\d+$/.test(bakedNode??''),'Audited Node22 image required')
 check(typeof knowledgePlan==='string'&&modelHash(knowledgePlan)===plan.knowledge.manifestSha256,'Bound shadow plan bytes required for live verification')
 const shadow=JSON.parse(knowledgePlan);check(shadow.complete===true&&shadow.action==='plan'&&shadow.result?.format==='rag-shadow-plan/v1','Exact shadow status plan required')
 let current={stopped:new Set(),configured:new Set(),deployed:new Map()},nativeContext={},refusal=null,fenceVerified=false
 const terminals=new Map(),minimal=u=>({id:u?._id?.$oid,operation:u?.operation,target:u?.target,status:u?.status,success:u?.success,startTs:u?.start_ts,endTs:u?.end_ts})
 const tracedFetcher=async(url,init)=>{
  const r=await fetcher(url,init)
  if([401,403].includes(r.status))refusal={httpStatus:r.status,operation:new URL(url).pathname.split('/').at(-1)}
  if(r.ok&&(/\/execute\//.test(new URL(url).pathname)||new URL(url).pathname==='/read/GetUpdate'))try{const u=await r.clone().json();if(/^[a-f0-9]{24}$/.test(u?._id?.$oid??'')&&u.status==='Complete'&&typeof u.success==='boolean')terminals.set(u._id.$oid,minimal(u))}catch{}
  return r
 }
 const report=async e=>onProgress({...e,...nativeContext,...(['complete','failed'].includes(e.status)&&terminals.has(e.updateId)?{native:terminals.get(e.updateId)}:{})})
 const raw=transport??createTransport({apiKey,apiSecret,signal,fetcher:tracedFetcher,wait,confirmTerminal:true,onProgress:report})
 const guarded=async(fn)=>{refusal=null;try{return await fn()}catch(error){throw Object.assign(error,refusal??{})}}
 const t={read:(op,q)=>guarded(()=>raw.read(op,q)),execute:(op,q)=>guarded(()=>raw.execute(op,q)),refreshStackCache:stack=>guarded(()=>raw.refreshStackCache(stack))}
 const rowFor=stack=>{const r=plan.stacks.find(r=>r.stack===stack);check(r,'Unexpected stack');return r}
 const expectedContainer=(stack,service)=>{const c=plan.containers.find(r=>r.stack===stack&&r.service===service);check(c,'Unexpected service');return c}
 async function request(kind,operation,body){
  const read=kind==='read'&&(['GetStack','GetStackActionState','ListStackServices'].includes(operation)&&body.stack===plan.knowledge.stack||operation==='InspectImage'&&body.server===plan.knowledge.server&&body.image===plan.knowledge.probe.image.reference)
  const write=kind==='write'&&operation==='UpdateStack'&&MODEL_APPS.some(s=>rowFor(s).id===body.id)&&equal(Object.keys(body.config??{}),['environment'])&&typeof body.config.environment==='string'
  const probe=kind==='execute'&&operation==='RunStackService'&&body.stack===plan.knowledge.stack&&body.service==='open-notebook'&&body.entrypoint==='/app/.venv/bin/python'&&body.no_tty===true&&body.no_deps===true&&body.detach===false&&body.service_ports===false&&body.pull===false&&body.command?.[0]==='-c'&&body.command?.length===2
  check(read||write||probe,'Model configuration endpoint or payload not permitted')
  let response
  try{response=await fetcher(`${ORIGIN}/${kind}/${operation}`,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':apiKey,'x-api-secret':apiSecret},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)})}
  catch{throw Object.assign(Error('Model configuration request outcome unavailable'),{uncertain:write||probe,operation})}
  if(!response.ok){await response.body?.cancel();throw Object.assign(Error('Model configuration API rejected request'),{httpStatus:response.status,uncertain:(write||probe)&&response.status>=500,operation})}
  if(write){await response.body?.cancel();return}
  try{return await response.json()}catch{throw Error('Invalid knowledge boundary response')}
 }
 async function knowledge(){
  const k=plan.knowledge,action=await request('read','GetStackActionState',{stack:k.stack});check(actions.every(name=>action[name]===false),'Concurrent knowledge action')
  const d=await request('read','GetStack',{stack:k.stack});check(d?._id?.$oid===k.id&&modelHash(JSON.stringify(d.config))===k.configSha256,'Knowledge stack configuration changed')
  const services=await request('read','ListStackServices',{stack:k.stack}),rows=services.filter(r=>r.service==='open-notebook');check(rows.length===1&&rows[0].container?.id===k.containerId,'Stopped knowledge service identity changed')
  const c=await t.read('InspectContainer',{server:k.server,container:k.containerId});check(c.Id===k.containerId&&c.Image===k.imageId&&c.State?.Running===false&&c.State?.Pid===0&&c.State?.Restarting===false&&c.State?.OOMKilled===false&&c.RestartCount===0,'Knowledge API/worker is not the exact stopped source')
  const remote=d.info?.remote_contents;check(remote?.length===1&&remote[0].path==='compose.yml'&&d.info?.remote_errors?.length===0&&d.info?.missing_files?.length===0&&modelHash(remote[0].contents)===k.probe.composeSha256,'Knowledge probe Compose source changed')
  const compose=parsePublicCompose(remote[0].contents),service=compose.services?.['open-notebook'];check(service?.image===k.probe.image.reference&&service.pull_policy==='never'&&!service.build,'Knowledge status probe requires the exact audited pull-never image')
 }
 async function probeImage(){
  const p=plan.knowledge.probe.image,actual=await request('read','InspectImage',{server:plan.knowledge.server,image:p.reference}),repo=p.reference.slice(0,p.reference.lastIndexOf(':'))
  check([p.indexDigest,p.manifestDigest,p.configDigest].includes(actual.Id)&&actual.RepoDigests?.includes(repo+'@'+p.indexDigest)&&actual.Os==='linux'&&actual.Architecture==='amd64'&&actual.RootFS?.Type==='layers'&&equal(actual.RootFS.Layers,p.diffIds)&&(!actual.Descriptor||[p.indexDigest,p.manifestDigest].includes(actual.Descriptor.digest)),'Knowledge status probe image differs from audited identity/layers')
  return actual.Id
 }
 async function verifyKnowledgeFence(){
  await knowledge();const imageId=await probeImage(),k=plan.knowledge
  const encoded=Buffer.from(knowledgePlan).toString('base64'),code=`import asyncio,base64,contextlib,io,json,sys,tempfile\nfrom pathlib import Path\nfrom open_notebook.rag import shadow\nasync def probe():\n with tempfile.TemporaryDirectory(prefix='model-config-fence-') as d:\n  p=Path(d)/'plan.json';o=Path(d)/'status.json'\n  p.write_bytes(base64.b64decode('${encoded}'))\n  sys.argv=['shadow','status','--scope',${JSON.stringify(k.probe.scopePath)},'--bindings',${JSON.stringify(k.probe.bindingsPath)},'--plan',str(p),'--output',str(o)]\n  with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):\n   await shadow.main()\n  value=json.loads(o.read_text())\n  if value.get('complete') is not True or value.get('action')!='status': raise RuntimeError('status unavailable')\n  print('MODEL_CONFIG_KNOWLEDGE_FENCE='+json.dumps(value,separators=(',',':')))\ntry: asyncio.run(probe())\nexcept BaseException: raise SystemExit('Read-only knowledge fence proof unavailable') from None\n`
  let updateId,complete=false
  await onProgress({phase:'komodo',status:'submitting',operation:'RunStackService',stack:k.stack,service:'open-notebook',commandSha256:modelHash(code)})
  try{
   let u=await request('execute','RunStackService',{stack:k.stack,service:'open-notebook',entrypoint:'/app/.venv/bin/python',command:['-c',code],no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false});updateId=u?._id?.$oid;check(/^[a-f0-9]{24}$/.test(updateId??''),'Knowledge probe update identity unavailable')
   await onProgress({phase:'komodo',status:'pending',operation:'RunStackService',stack:k.stack,service:'open-notebook',updateId});const deadline=Date.now()+180000
   const identity=u=>check(u?._id?.$oid===updateId&&u.operation==='RunStackService'&&u.target?.type==='Stack'&&u.target.id===k.id,'Knowledge native update identity changed')
   while(true){identity(u);if(u.status==='Complete')break;check(['Queued','InProgress'].includes(u.status)&&Date.now()<deadline,'Knowledge probe native result unresolved');await wait(2000,undefined,{signal});u=await t.read('GetUpdate',{id:updateId})}
   const final=await t.read('GetUpdate',{id:updateId});identity(final);check(final.status==='Complete'&&typeof final.success==='boolean'&&final.success===u.success&&Number.isFinite(final.start_ts)&&Number.isFinite(final.end_ts)&&final.end_ts>=final.start_ts&&final.start_ts===u.start_ts&&final.end_ts===u.end_ts,'Fresh knowledge native terminal result changed');complete=true
   await onProgress({phase:'komodo',status:final.success?'complete':'failed',operation:'RunStackService',stack:k.stack,service:'open-notebook',updateId,native:minimal(final)});check(final.success===true,'Live knowledge fence probe failed')
   const lines=(final.logs??[]).flatMap(r=>(r.stdout??'').split(/\r?\n/)).filter(s=>s.startsWith('MODEL_CONFIG_KNOWLEDGE_FENCE='));check(lines.length===1,'Live knowledge fence marker unavailable')
   const value=JSON.parse(lines[0].slice('MODEL_CONFIG_KNOWLEDGE_FENCE='.length)),r=value.result,p=shadow.result
   check(value.complete===true&&value.action==='status'&&r?.format==='rag-shadow-fence/v1'&&r.phase==='fenced'&&r.active_database===p.source_database&&r.source_database===p.source_database&&r.target_database===p.target_database&&r.migration_id===p.migration_id&&r.plan_sha256===p.sha256&&r.source_sha256===p.source_sha256&&r.revision===p.source_revision&&equal(r.counts,p.counts),'Live knowledge fence/pointer/source watermark differs from sealed plan')
   await knowledge();check(await probeImage()===imageId,'Knowledge probe image changed across the read');fenceVerified=true
   await onProgress({phase:'knowledge-fence',status:'verified',updateId,result:r});return r
  }catch(error){
   if(!complete)await onProgress({phase:'komodo',status:error?.httpStatus&&[401,403].includes(error.httpStatus)?'failed':'uncertain',operation:'RunStackService',stack:k.stack,service:'open-notebook',...(updateId?{updateId}:{})}).catch(()=>{})
   throw Object.assign(error,{uncertain:!complete&&!error?.httpStatus||error?.uncertain===true})
  }
 }
 async function stackGuard(configured=current.configured){
  signal?.throwIfAborted()
  const servers=await t.read('ListServers',{});for(const name of ['manager','shanghai-a','shanghai-b'])check(servers.filter(r=>r.name===name&&r.info?.state==='Ok').length===1,'Required host unavailable')
  check((await t.read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running===false,'Concurrent rollout procedure')
  for(const row of plan.stacks){
   const action=await t.read('GetStackActionState',{stack:row.stack});check(actions.every(k=>action[k]===false),'Concurrent application action')
   await t.refreshStackCache(row.stack)
   const d=await t.read('GetStack',{stack:row.stack}),expected=configured.has(row.stack)?row.targetConfigSha256:row.sourceConfigSha256
   check(d?._id?.$oid===row.id&&modelHash(JSON.stringify(d.config))===expected,'Full application stack configuration drift')
   const remote=d.info?.remote_contents;check(remote?.length===1&&remote[0].path==='compose.yml'&&d.info?.remote_errors?.length===0&&d.info?.missing_files?.length===0&&modelHash(remote[0].contents)===row.composeSha256,'Application Compose source changed')
   if(row.stack!==MODEL_CORE)check(d.config.auto_pull===false&&equal(d.config.extra_args,['--no-deps','--pull','never']),'Offline no-dependency application policy required')
  }
  await knowledge()
 }
 async function images(){for(const [i,stack] of MODEL_APPS.entries()){const actual=await t.read('InspectImage',{server:i?'shanghai-b':'shanghai-a',image:IMAGE+plan.release.sha}),imageId=assertImageIdentity(actual,plan.release.image);check(equal(actual.Config?.Env,baked)&&plan.containers.filter(c=>c.stack===stack).every(c=>c.imageId===imageId),'Source image config or identity changed')}}
 async function inspectOne(stack,service){
  const row=rowFor(stack),matches=(await t.read('ListStackServices',{stack})).filter(r=>r.service===service)
  check(matches.length===1&&hex.test(matches[0].container?.id??''),'Ambiguous application container')
  const c=await t.read('InspectContainer',{server:row.server,container:matches[0].container.id}),env=environment(c.Config?.Env)
  check(c.Id===matches[0].container.id&&c.Config.Image===IMAGE+plan.release.sha&&env.get('LINGXILOOP_COMMIT_SHA')===plan.release.sha&&env.get('NODE_VERSION')===bakedNode&&c.State?.OOMKilled===false&&c.State?.Restarting===false&&c.RestartCount===0&&Number.isSafeInteger(c.State.Pid)&&c.State.Pid>=0,'Application image/state changed')
  check(['AGENT_OS_INPUT_COST_MICROS_PER_MILLION','AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION','AGENT_OS_EMBEDDING_INPUT_COST_MICROS_PER_MILLION'].every(k=>!env.get(k)?.trim())&&(!env.get('AGENT_OS_EMBEDDING_DIMENSIONS')?.trim()||env.get('AGENT_OS_EMBEDDING_DIMENSIONS').trim()==='1024'),'Model-only release refuses explicit price overrides or non1024 BGE dimensions')
  return {c,env,policy:modelContainerPolicyHash(c)}
 }
 async function assertBoundary(ctx=current){
  current={stopped:new Set(ctx.stopped),configured:new Set(ctx.configured),deployed:new Map(ctx.deployed)}
  await stackGuard();await images();const result=[]
  for(const stack of MODEL_APPS)for(const service of ['lingxiloop','worker']){
   const old=expectedContainer(stack,service),k=key(old),done=current.deployed.get(k),{c,env,policy}=await inspectOne(stack,service),models=done?MODEL_TARGET:plan.sourceModels
   check(c.Id===(done?.id??old.id)&&c.Image===(done?.imageId??old.imageId)&&policy===(done?old.targetPolicySha256:old.sourcePolicySha256)&&Object.entries(models).every(([name,value])=>env.get(name)===value),'Application container identity/environment/security/volume/startup drift')
   const stopped=current.stopped.has(k)&&!done
   if(stopped)check(c.State.Running===false&&c.State.Pid===0,'Original application writer still running')
   else check(c.State.Running===true&&c.State.Pid>0&&(ctx.allowUnhealthy===k||c.State.Health?.Status==='healthy'),'Application service is not healthy')
   result.push({stack,server:rowFor(stack).server,service,id:c.Id,imageId:c.Image,source:plan.release.sha,running:c.State.Running,pid:c.State.Pid,restarting:false,restartCount:0,healthy:c.State.Health?.Status==='healthy',policy:{configurationSha256:policy},models})
  }
  return result
 }
 async function native(operation,stack,service,params){nativeContext={service};try{return await t.execute(operation,{stack,...params})}finally{nativeContext={}}}
 return {
  assertBoundary,
  verifyKnowledgeFence,
  async state(){await stackGuard();nativeContext={service:'postgres'};try{return validateStateReceipt(parseMarker(await t.execute('RunStackService',{stack:MODEL_CORE,service:'postgres',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,entrypoint:'sh',user:'postgres',command:['-ec',stateCommand]}),'STATE'))}finally{nativeContext={}}},
  async stop(stack,service){check(fenceVerified&&MODEL_APPS.includes(stack)&&['worker','lingxiloop'].includes(service)&&!current.stopped.has(stack+':'+service)&&!current.configured.size&&!current.deployed.size,'Only an uncompleted source stop with a current fence is permitted');await assertBoundary();return native('StopStack',stack,service,{services:[service],stop_time:150})},
  async configure(stack){
   check(MODEL_APPS.includes(stack)&&current.stopped.size===4&&!current.deployed.size&&!current.configured.has(stack),'Model configuration write requires all four stopped writers')
   await assertBoundary();await verifyKnowledgeFence();const row=rowFor(stack),d=await t.read('GetStack',{stack}),next=patchModelEnvironment(d.config.environment)
   check(modelHash(JSON.stringify({...d.config,environment:next}))===row.targetConfigSha256,'Prepared two-model configuration differs from sealed target')
   await onProgress({phase:'configuration-write',status:'submitting',stack})
   await request('write','UpdateStack',{id:row.id,config:{environment:next}})
   await onProgress({phase:'configuration-write',status:'acknowledged',stack})
   try{const after=await t.read('GetStack',{stack});check(after?._id?.$oid===row.id&&modelHash(JSON.stringify(after.config))===row.targetConfigSha256,'Target complete configuration differs')}
   catch(error){await onProgress({phase:'configuration-write',status:'uncertain',stack}).catch(()=>{});throw Object.assign(Error('Configuration acknowledged but full readback is unresolved'),{uncertain:true,...(Number.isInteger(error?.httpStatus)?{httpStatus:error.httpStatus,operation:error.operation}:{})})}
   return {responseAcknowledged:true,fullConfigReadback:true,targetConfigSha256:row.targetConfigSha256}
  },
  async deploy(stack,service){check(fenceVerified&&MODEL_APPS.includes(stack)&&['worker','lingxiloop'].includes(service)&&current.stopped.size===4&&current.configured.size===2&&!current.deployed.has(stack+':'+service),'Only an uncompleted configured service with a current fence may deploy');await assertBoundary();return native('DeployStack',stack,service,{services:[service]})},
  async deploymentIdentity(stack,service){await stackGuard();const old=expectedContainer(stack,service),{c,env,policy}=await inspectOne(stack,service);check(c.Id!==old.id&&c.Image===old.imageId&&policy===old.targetPolicySha256&&Object.entries(MODEL_TARGET).every(([name,value])=>env.get(name)===value),'First configured target identity/policy differs');return {id:c.Id,imageId:c.Image}},
  async healthy(stack,service,identity,ctx){
   const deadline=Date.now()+180000,k=stack+':'+service
   while(Date.now()<deadline){const rows=await assertBoundary({...ctx,allowUnhealthy:k}),r=rows.find(r=>key(r)===k);check(r?.id===identity.id&&r.imageId===identity.imageId,'Observed target identity changed');if(r.healthy)return r;await wait(2000,undefined,{signal})}
   throw Error('Configured service readiness deadline exceeded')
  },
  async verifyPriorOperations(operations){
   for(const e of operations){const u=await t.read('GetUpdate',{id:e.id});check(u?._id?.$oid===e.id&&u.operation===e.operation&&equal(u.target,e.target)&&u.status==='Complete'&&u.success===e.success&&u.start_ts===e.startTs&&u.end_ts===e.endTs,'Previous native operation is not the same terminal update and outcome')}
  },
  wait:ms=>wait(ms,undefined,{signal}),
 }
}
