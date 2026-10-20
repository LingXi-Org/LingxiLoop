// Komodo2.3.3 public API only. Fixed destinations/actions; never emit raw replies.
import {setTimeout as delay} from 'node:timers/promises'
import {readFile} from 'node:fs/promises'
import {assertEffectiveComposePin} from './schema-upgrade-compose.mjs'
const ORIGIN='https://ops.christmas1314.xyz'
const APPS=['lingxiloop-app-a','lingxiloop-app-b'],CORE='lingxiloop-core-state'
const SERVERS=['shanghai-a','shanghai-b'],SERVICES=['lingxiloop','worker']
const IMAGE='accel.way2api.fun/ghcr.io/lingxi-org/lingxiloop-server:'
const HEX40=/^[a-f0-9]{40}$/,HEX64=/^[a-f0-9]{64}$/,ID=/^[a-f0-9]{24}$/
const READS=new Set(['GetStack','GetStackActionState','ListStackServices','InspectContainer','InspectImage','GetUpdate','GetProcedureActionState','ListServers'])
const ACTIONS=['pulling','deploying','starting','restarting','pausing','unpausing','stopping','destroying']
const check=(yes,message)=>{if(!yes)throw Error(message)}
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`
// Root applies these reviewed partial writes separately. A successful empty
// UpdateStack body is possible; read GetStack and verify before any retry.
export function releasePinPayload(stackId,commit) {
 check(ID.test(stackId??'')&&(commit===''||HEX40.test(commit??'')),'Exact stack id and commit required')
 return {id:stackId,config:{commit}}
}
export function parseMarker(update,name) {
 check(['STATE','METADATA','MIGRATED'].includes(name)&&update?.status==='Complete'&&update.success===true,'Unsuccessful receipt')
 const prefix=`SCHEMA_UPGRADE_${name}=`,lines=(update.logs??[]).flatMap(x=>typeof x.stdout==='string'?x.stdout.split(/\r?\n/):[]).filter(x=>x.startsWith(prefix))
 check(lines.length===1&&lines[0].length<=100000,'Missing or ambiguous receipt marker')
 try{return JSON.parse(lines[0].slice(prefix.length))}catch{throw Error('Invalid receipt JSON')}
}
export function createTransport({apiKey,apiSecret,signal,fetcher=fetch,wait=delay,onProgress=async()=>{}}) {
 check(apiKey&&apiSecret,'Existing authorization required')
 async function request(kind,operation,params) {
  signal?.throwIfAborted()
  try{
   const response=await fetcher(`${ORIGIN}/${kind}/${operation}`,{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':apiKey,'x-api-secret':apiSecret},body:JSON.stringify(params),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)})
   if(!response.ok){await response.body?.cancel();throw Error('HTTP failure')}
   const reader=response.body?.getReader();check(reader,'Missing response');let bytes=0;const chunks=[]
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2*1024*1024){await reader.cancel();throw Error('Response limit')};chunks.push(value)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}finally{reader.releaseLock()}
  }catch{throw Error('Komodo request failed or response invalid')}
 }
 async function read(operation,params){
  check(READS.has(operation),'Read operation not allowed')
  if(['GetStack','GetStackActionState','ListStackServices'].includes(operation))check([...APPS,CORE].includes(params.stack),'Stack not allowed')
  if(operation==='InspectContainer')check(SERVERS.includes(params.server)&&/^[a-f0-9]{64}$/.test(params.container),'Exact container identity required')
  if(operation==='InspectImage')check(SERVERS.includes(params.server)&&params.image.startsWith(IMAGE)&&HEX40.test(params.image.slice(IMAGE.length)),'Exact image required')
  if(operation==='ListServers')check(Object.keys(params).length===0,'No server query overrides')
  if(operation==='GetUpdate')check(ID.test(params.id??''),'Exact update identity required')
  if(operation==='GetProcedureActionState')check(params.procedure==='lingxiloop-production-rollout','Procedure not allowed')
  return request('read',operation,params)
 }
 async function execute(operation,params){
  check(['PullStack','StopStack','DeployStack','RunStackService'].includes(operation),'Mutation not allowed')
  check([...APPS,CORE].includes(params.stack),'Stack not allowed')
  if(operation!=='RunStackService')check(APPS.includes(params.stack)&&Array.isArray(params.services)&&params.services.length>0&&params.services.every(x=>['lingxiloop','worker',...(operation==='PullStack'?['db-migrate']:[])].includes(x)),'Service not allowed')
  else check((params.stack===CORE&&params.service==='postgres'||APPS.includes(params.stack)&&params.service==='db-migrate')&&params.no_deps===true&&params.detach===false&&params.service_ports===false&&params.no_tty===true&&params.pull===false,'One-off isolation required')
  if(operation==='StopStack')check(params.stop_time===150,'Bounded drain grace required')
  // Komodo2.3.3 helpers/update.rs maps nonempty services to the service enum.
  // All permitted Pull/Stop/Deploy requests above require nonempty services.
  const expectedOperation=operation==='RunStackService'?operation:{
   PullStack:'PullStackService',StopStack:'StopStackService',DeployStack:'DeployStackService',
  }[operation]
  const stack=await read('GetStack',{stack:params.stack}),stackId=stack?._id?.$oid
  check(ID.test(stackId??''),'Stack identity unavailable')
  let id,submitted=false,complete=false
  try{
   await onProgress({phase:'komodo',status:'submitting',operation,stack:params.stack});signal?.throwIfAborted();submitted=true
   let update=await request('execute',operation,params);id=update?._id?.$oid
   check(ID.test(id??''),'Missing update identity')
   await onProgress({phase:'komodo',status:'pending',operation,stack:params.stack,updateId:id})
   const deadline=Date.now()+(operation==='PullStack'||operation==='DeployStack'?15:7)*60000
   while(true){
    check(update?._id?.$oid===id&&update.operation===expectedOperation&&update.target?.type==='Stack'&&update.target.id===stackId,'Receipt identity mismatch')
    if(update.status==='Complete'){check(typeof update.success==='boolean','Incomplete terminal receipt');complete=true;check(update.success===true,'Komodo operation failed');await onProgress({phase:'komodo',status:'complete',operation,stack:params.stack,updateId:id});return update}
    check(['InProgress','Queued'].includes(update.status)&&Date.now()<deadline,'Komodo operation did not reach terminal state')
    await wait(2000,undefined,{signal});update=await read('GetUpdate',{id})
   }
  }catch{
   const uncertain=submitted&&!complete
   await onProgress({phase:'komodo',status:uncertain?'uncertain':'failed',operation,stack:params.stack,...(ID.test(id??'')?{updateId:id}:{})}).catch(()=>{})
   throw Object.assign(Error(uncertain?'Komodo operation outcome uncertain':'Komodo operation failed'),{uncertain})
  }
 }
 return {read,execute}
}
export function validateStateReceipt(value) {
 const numbers=['schema','installedSchema','protocol','count','product','liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','otherClients','prepared','queued','pendingCapture']
 const keys=[...numbers,'runtime','schemaHash','migrations','readOnly','fullVisibility'].sort()
 check(value&&Object.keys(value).sort().join()===keys.join()&&numbers.every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)
  &&/^\d+\.\d+\.\d+$/.test(value.runtime??'')&&HEX64.test(value.schemaHash??'')&&value.readOnly===true&&value.fullVisibility===true,'Invalid SQL state receipt')
 check(Array.isArray(value.migrations)&&value.migrations.every(m=>m&&Object.keys(m).sort().join()==='checksum,name,version'
  &&Number.isSafeInteger(m.version)&&m.version>0&&/^[a-z0-9_]+$/.test(m.name??'')&&HEX64.test(m.checksum??'')),'Invalid migration metadata')
 return value
}
// Fixed metadata only: no event data, prompts, IDs, claims, secrets or SQL text.
export const STATE_SQL=`BEGIN READ ONLY;
SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='10s';
SELECT 'SCHEMA_UPGRADE_STATE='||jsonb_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'fullVisibility',(SELECT rolsuper OR pg_has_role(current_user,'pg_read_all_stats','MEMBER') FROM pg_roles WHERE rolname=current_user),
 'schema',(SELECT version FROM lingxios.schema_version WHERE singleton),
 'installedSchema',(SELECT schema_version FROM public.lingxios_installation WHERE singleton),
 'runtime',(SELECT runtime_version FROM public.lingxios_installation WHERE singleton),
 'protocol',(SELECT protocol_version FROM public.lingxios_installation WHERE singleton),
 'schemaHash',(SELECT schema_sha256 FROM public.lingxios_installation WHERE singleton),
 'count',(SELECT count(*) FROM public.schema_migrations),'product',(SELECT max(version) FROM public.schema_migrations),
 'migrations',(SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'checksum',checksum) ORDER BY version) FROM public.schema_migrations),
 'liveWork',(SELECT count(*) FROM lingxios.agent_work_items WHERE status='leased' AND lease_expires_at>NOW()),
 'liveSession',(SELECT count(*) FROM lingxios.agent_os_session_leases WHERE expires_at>NOW()),
 'liveAttempts',(SELECT count(*) FROM lingxios.agent_attempts WHERE ended_at IS NULL AND lease_expires_at>NOW()),
 'liveCapture',(SELECT count(*) FROM lingxios.agent_memory_capture WHERE completed_at IS NULL AND claim_token IS NOT NULL AND claim_until>NOW()),
 'liveOutbox',((SELECT count(*) FROM lingxios.agent_delivery_outbox WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*) FROM lingxios.agent_run_events WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*) FROM lingxios.agent_model_budget_calls WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*) FROM lingxios.agent_terminal_outbox WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())),
 'otherClients',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()),
 'prepared',(SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database()),
 'queued',(SELECT count(*) FROM lingxios.agent_work_items WHERE status='queued'),
 'pendingCapture',(SELECT count(*) FROM lingxios.agent_memory_capture WHERE completed_at IS NULL)
)::text;
COMMIT;`
const stateCommand=`set -eu; set +x; export PGPASSWORD="$POSTGRES_PASSWORD" PGCONNECT_TIMEOUT=10; exec timeout -k 5 30 psql -X -qAt -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c ${quote(STATE_SQL)}`
export const METADATA_CODE=`import{readFile,readdir}from'node:fs/promises';import{createHash}from'node:crypto';import{releaseVersions,packageResources}from'@lyyzka/lingxios';
const hash=x=>createHash('sha256').update(x).digest('hex');
const lock=JSON.parse(await readFile('package-lock.json','utf8')).packages['node_modules/@lyyzka/lingxios'];
const names=(await readdir('server/src/db/migrations')).sort();if(names.some((n,i)=>!new RegExp('^'+String(i+1).padStart(4,'0')+'_[a-z0-9_]+\\\\.sql$').test(n)))throw Error('inventory');
const migrations=await Promise.all(names.map(async n=>({version:Number(n.slice(0,4)),name:n.slice(5,-4),checksum:hash(await readFile('server/src/db/migrations/'+n))})));
const metadata={sha:process.env.LINGXILOOP_COMMIT_SHA,runtime:releaseVersions.runtime,schema:releaseVersions.schema,protocol:releaseVersions.controlPlane,schemaHash:hash(await readFile(packageResources().schema)),integrity:lock.integrity,tarball:lock.resolved,productVersion:migrations.length,migrations};
if(lock.version!==metadata.runtime)throw Error('package');`
const oneOff=(stack,service,extra)=>({stack,service,no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,...extra})
export function createOperations({plan,apiKey,apiSecret,signal,onProgress=async()=>{},transport}) {
 const t=transport??createTransport({apiKey,apiSecret,signal,onProgress}),imageIds=new Map()
 const target=plan?.target
 async function inspect(){
  const result=[]
  for(const [i,stack] of APPS.entries()){
   const services=await t.read('ListStackServices',{stack});check(Array.isArray(services),'Service inventory missing')
   for(const service of SERVICES){
    const matches=services.filter(x=>x.service===service);check(matches.length===1&&HEX64.test(matches[0].container?.id??''),'Ambiguous writer identity')
    const c=await t.read('InspectContainer',{server:SERVERS[i],container:matches[0].container.id})
    const source=c.Config?.Env?.find(x=>x.startsWith('LINGXILOOP_COMMIT_SHA='))?.slice('LINGXILOOP_COMMIT_SHA='.length)
    check(HEX40.test(source??'')&&c.Id===matches[0].container.id&&/^sha256:[a-f0-9]{64}$/.test(c.Image??'')&&c.Config?.Image===IMAGE+source&&typeof c.State?.Running==='boolean'&&typeof c.State?.Restarting==='boolean'&&Number.isSafeInteger(c.RestartCount)&&Number.isSafeInteger(c.State.Pid)&&c.State.Pid>=0,'Invalid container metadata')
    if(plan&&source===plan.source.sha){const image=await t.read('InspectImage',{server:SERVERS[i],image:IMAGE+source});check(image.Id===c.Image&&image.RepoDigests?.some(x=>x.endsWith('@'+plan.sourceImageDigest)),'Source image digest mismatch')}
    result.push({stack,server:SERVERS[i],service,id:c.Id,source,imageId:c.Image,running:c.State.Running,restarting:c.State.Restarting,restartCount:c.RestartCount,pid:c.State.Pid,healthy:c.State.Health?.Status==='healthy'})
   }
  }
  return result
 }
 async function assertIdle(){
  check((await t.read('GetProcedureActionState',{procedure:'lingxiloop-production-rollout'})).running===false,'Concurrent rollout procedure')
  const servers=await t.read('ListServers',{});check(Array.isArray(servers),'Server inventory missing')
  for(const stack of APPS){
   const expected=servers.filter(x=>x.name===SERVERS[APPS.indexOf(stack)]);check(expected.length===1&&expected[0].info?.state==='Ok'&&ID.test(expected[0].id??''),'Expected host not available')
   const action=await t.read('GetStackActionState',{stack});check(ACTIONS.every(k=>action[k]===false),'Concurrent stack action')
   const details=await t.read('GetStack',{stack}),c=details.config
   check(c&&c.server_id===expected[0].id&&c.repo==='LingXi-Org/LingxiLoop'&&c.branch==='main'&&c.run_directory===`deploy/komodo/${stack}`&&c.auto_update===false&&c.auto_update_all_services===false&&!c.linked_repo&&!c.files_on_host&&!c.file_contents,'Unexpected stack source or automatic deployment configuration')
   if(plan)check(c.commit===plan.pinCommit,'Maintenance requires exact temporary release commit pin')
   else check(!c.commit,'Ordinary rollout cannot clear an active maintenance release pin')
   const services=await t.read('ListStackServices',{stack});check(Array.isArray(services),'Service inventory missing')
   const jobs=services.filter(x=>x.service==='db-migrate');check(jobs.length<=1,'Ambiguous migration container')
   if(jobs[0]?.container){
    const row=await t.read('InspectContainer',{server:SERVERS[APPS.indexOf(stack)],container:jobs[0].container.id})
    check(row.State?.Running===false&&row.State?.Restarting===false,'Existing migration job must be resolved before release')
   }
  }
 }
 async function verifyImages(){
  for(const [i] of APPS.entries()){
   const image=await t.read('InspectImage',{server:SERVERS[i],image:IMAGE+target.sha})
   check(/^sha256:[a-f0-9]{64}$/.test(image.Id??'')&&image.RepoDigests?.some(x=>x.endsWith('@'+target.imageDigest)),'Pinned image digest mismatch')
   if(imageIds.has(SERVERS[i]))check(imageIds.get(SERVERS[i])===image.Id,'Image changed during maintenance')
   imageIds.set(SERVERS[i],image.Id)
  }
 }
 async function metadata(){return parseMarker(await t.execute('RunStackService',oneOff(APPS[0],'db-migrate',{command:['timeout','-k','5','30','node','--input-type=module','-e',METADATA_CODE+`console.log('SCHEMA_UPGRADE_METADATA='+JSON.stringify(metadata));`]})),'METADATA')}
 async function state(){const result=parseMarker(await t.execute('RunStackService',oneOff(CORE,'postgres',{entrypoint:'sh',user:'postgres',command:['-ec',stateCommand]})),'STATE');
  return validateStateReceipt(result)}
 return {assertIdle,inspect,verifyImages,metadata,state,
  pull:stack=>t.execute('PullStack',{stack,services:['db-migrate','lingxiloop','worker']}),
  stop:(stack,service)=>t.execute('StopStack',{stack,services:[service],stop_time:150}),
  async migrate(){
   const expected=Object.fromEntries(['sha','runtime','schema','protocol','schemaHash','integrity','tarball','productVersion','migrations'].map(k=>[k,target[k]]))
   // Check the executing image before importing any application/DB code.
   const code=METADATA_CODE+`import{isDeepStrictEqual}from'node:util';if(!isDeepStrictEqual(metadata,${JSON.stringify(expected)}))throw Error('target drift');await import('./server/src/migrate-bin.ts');if(process.exitCode)throw Error('migration failed');console.log('SCHEMA_UPGRADE_MIGRATED='+JSON.stringify({sha:metadata.sha,schema:metadata.schema}));`
   const receipt=parseMarker(await t.execute('RunStackService',oneOff(APPS[0],'db-migrate',{env:{LINGXIOS_SCHEMA_UPGRADE_DRAINED:'true'},command:['timeout','-k','30','300','node','--import','tsx','--input-type=module','-e',code]})),'MIGRATED')
   check(receipt.sha===target.sha&&receipt.schema===target.schema,'Migration marker mismatch')
  },
  deploy:(stack,service)=>t.execute('DeployStack',{stack,services:[service]}),
  async verifyHealthy(stack,service){
   const deadline=Date.now()+180000
   while(Date.now()<deadline){const row=(await inspect()).find(x=>x.stack===stack&&x.service===service)
    check(row.source===target.sha&&row.imageId===imageIds.get(row.server),'Deployed image is not the qualified target')
    if(row.running&&!row.restarting&&row.healthy)return
    await delay(2000,undefined,{signal})
   }
   throw Error('Target readiness deadline exceeded')
  },wait:ms=>delay(ms,undefined,{signal})}
}
export async function preflightOrdinaryRollout({apiKey,apiSecret,transport}) {
 const ops=createOperations({apiKey,apiSecret,transport})
 // All of this precedes resource synchronization, historical migration handling,
 // webhook and StopStack. One-offs use no dependencies/ports and no product write.
 await ops.assertIdle()
 const expected=[]
 for(const side of ['a','b']){
  const source=await readFile(new URL(`../deploy/komodo/lingxiloop-app-${side}/compose.yml`,import.meta.url),'utf8')
  expected.push(assertEffectiveComposePin(source))
 }
 check(expected[0]===expected[1],'App target pins disagree')
 const metadata=await ops.metadata();check(metadata.sha===expected[0]&&Number.isSafeInteger(metadata.schema),'Metadata does not match checked-out manifest pin')
 const state=await ops.state()
 // Dynamic import avoids a module initialization cycle with the engine exports.
 const {assertOrdinarySchema}=await import('./schema-upgrade-maintenance.mjs');assertOrdinarySchema(state,metadata)
 return {sourceSchema:state.schema,targetSchema:metadata.schema,targetSha:metadata.sha}
}
