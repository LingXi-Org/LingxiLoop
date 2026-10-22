// Fixed Komodo2.3.3 endpoints. Secret-bearing configurations remain in memory.
import {isDeepStrictEqual as equal} from 'node:util'
import {setTimeout as delay} from 'node:timers/promises'
import {createTransport,parseMarker,stateCommand,validateStateReceipt} from './schema-upgrade-komodo.mjs'
import {assertImageIdentity} from './host-release.mjs'
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

export function createModelConfigOperations({plan,imageConfig,apiKey,apiSecret,signal,onProgress=async()=>{},transport,fetcher=fetch,wait=delay}){
 validateModelConfigPlan(plan)
 check(apiKey&&apiSecret&&typeof imageConfig==='string'&&'sha256:'+modelHash(imageConfig)===plan.release.image.configDigest,'Existing credentials and audited source image config required')
 const baked=JSON.parse(imageConfig).config?.Env;check(Array.isArray(baked),'Audited image environment unavailable')
 let current={stopped:new Set(),configured:new Set(),deployed:new Map()},nativeContext={}
 const t=transport??createTransport({apiKey,apiSecret,signal,fetcher,wait,confirmTerminal:true,onProgress:e=>onProgress({...e,...nativeContext})})
 const rowFor=stack=>{const r=plan.stacks.find(r=>r.stack===stack);check(r,'Unexpected stack');return r}
 const expectedContainer=(stack,service)=>{const c=plan.containers.find(r=>r.stack===stack&&r.service===service);check(c,'Unexpected service');return c}
 async function request(kind,operation,body){
  const read=kind==='read'&&['GetStack','GetStackActionState','ListStackServices'].includes(operation)&&body.stack===plan.knowledge.stack
  const write=kind==='write'&&operation==='UpdateStack'&&MODEL_APPS.some(s=>rowFor(s).id===body.id)&&equal(Object.keys(body.config??{}),['environment'])&&typeof body.config.environment==='string'
  check(read||write,'Model configuration endpoint or payload not permitted')
  let response
  try{response=await fetcher(`${ORIGIN}/${kind}/${operation}`,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':apiKey,'x-api-secret':apiSecret},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)})}
  catch{throw Object.assign(Error('Model configuration request outcome unavailable'),{uncertain:write,operation})}
  if(!response.ok){await response.body?.cancel();throw Object.assign(Error('Model configuration API rejected request'),{httpStatus:response.status,uncertain:write&&response.status>=500,operation})}
  if(write){await response.body?.cancel();return}
  try{return await response.json()}catch{throw Error('Invalid knowledge boundary response')}
 }
 async function knowledge(){
  const k=plan.knowledge,action=await request('read','GetStackActionState',{stack:k.stack});check(actions.every(name=>action[name]===false),'Concurrent knowledge action')
  const d=await request('read','GetStack',{stack:k.stack});check(d?._id?.$oid===k.id&&modelHash(JSON.stringify(d.config))===k.configSha256,'Knowledge stack configuration changed')
  const services=await request('read','ListStackServices',{stack:k.stack}),rows=services.filter(r=>r.service==='open-notebook');check(rows.length===1&&rows[0].container?.id===k.containerId,'Stopped knowledge service identity changed')
  const c=await t.read('InspectContainer',{server:k.server,container:k.containerId});check(c.Id===k.containerId&&c.Image===k.imageId&&c.State?.Running===false&&c.State?.Pid===0&&c.State?.Restarting===false&&c.State?.OOMKilled===false&&c.RestartCount===0,'Knowledge API/worker is not the exact stopped source')
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
  check(c.Id===matches[0].container.id&&c.Config.Image===IMAGE+plan.release.sha&&env.get('LINGXILOOP_COMMIT_SHA')===plan.release.sha&&c.State?.OOMKilled===false&&c.State?.Restarting===false&&c.RestartCount===0&&Number.isSafeInteger(c.State.Pid)&&c.State.Pid>=0,'Application image/state changed')
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
  async state(){await stackGuard();nativeContext={service:'postgres'};try{return validateStateReceipt(parseMarker(await t.execute('RunStackService',{stack:MODEL_CORE,service:'postgres',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,entrypoint:'sh',user:'postgres',command:['-ec',stateCommand]}),'STATE'))}finally{nativeContext={}}},
  async stop(stack,service){check(MODEL_APPS.includes(stack)&&['worker','lingxiloop'].includes(service)&&!current.stopped.has(stack+':'+service)&&!current.configured.size&&!current.deployed.size,'Only an uncompleted source stop is permitted');await assertBoundary();return native('StopStack',stack,service,{services:[service],stop_time:150})},
  async configure(stack){
   check(MODEL_APPS.includes(stack)&&current.stopped.size===4&&!current.deployed.size&&!current.configured.has(stack),'Model configuration write requires all four stopped writers')
   await assertBoundary();const row=rowFor(stack),d=await t.read('GetStack',{stack}),next=patchModelEnvironment(d.config.environment)
   check(modelHash(JSON.stringify({...d.config,environment:next}))===row.targetConfigSha256,'Prepared two-model configuration differs from sealed target')
   await onProgress({phase:'configuration-write',status:'submitting',stack})
   await request('write','UpdateStack',{id:row.id,config:{environment:next}})
   await onProgress({phase:'configuration-write',status:'acknowledged',stack})
   try{const after=await t.read('GetStack',{stack});check(after?._id?.$oid===row.id&&modelHash(JSON.stringify(after.config))===row.targetConfigSha256,'Target complete configuration differs')}
   catch{await onProgress({phase:'configuration-write',status:'uncertain',stack}).catch(()=>{});throw Object.assign(Error('Configuration acknowledged but full readback is unresolved'),{uncertain:true})}
   return {responseAcknowledged:true,fullConfigReadback:true,targetConfigSha256:row.targetConfigSha256}
  },
  async deploy(stack,service){check(MODEL_APPS.includes(stack)&&['worker','lingxiloop'].includes(service)&&current.stopped.size===4&&current.configured.size===2&&!current.deployed.has(stack+':'+service),'Only an uncompleted configured service may deploy');await assertBoundary();return native('DeployStack',stack,service,{services:[service]})},
  async deploymentIdentity(stack,service){await stackGuard();const old=expectedContainer(stack,service),{c,env,policy}=await inspectOne(stack,service);check(c.Id!==old.id&&c.Image===old.imageId&&policy===old.targetPolicySha256&&Object.entries(MODEL_TARGET).every(([name,value])=>env.get(name)===value),'First configured target identity/policy differs');return {id:c.Id,imageId:c.Image}},
  async healthy(stack,service,identity,ctx){
   const deadline=Date.now()+180000,k=stack+':'+service
   while(Date.now()<deadline){const rows=await assertBoundary({...ctx,allowUnhealthy:k}),r=rows.find(r=>key(r)===k);check(r?.id===identity.id&&r.imageId===identity.imageId,'Observed target identity changed');if(r.healthy)return r;await wait(2000,undefined,{signal})}
   throw Error('Configured service readiness deadline exceeded')
  },
  async verifyPriorOperations(operations){
   for(const e of operations){const u=await t.read('GetUpdate',{id:e.id});check(u?._id?.$oid===e.id&&u.operation===e.operation&&equal(u.target,e.target)&&u.status==='Complete'&&u.success===true&&u.start_ts===e.startTs&&u.end_ts===e.endTs,'Previous native operation is not the same successful terminal update')}
  },
  wait:ms=>wait(ms,undefined,{signal}),
 }
}
