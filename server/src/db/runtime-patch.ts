// Privileged explicit maintenance only. No migration, seed or product imports.
import {createHash} from 'node:crypto'
import {readFile,readdir} from 'node:fs/promises'
import {isDeepStrictEqual as equal} from 'node:util'
import type {Pool,PoolClient} from 'pg'
import {packageResources,releaseVersions} from '@lyyzka/lingxios'
import {assertCurrentRuntimeProfile,currentPublicTextVersion,loadLockedRuntimePackage,PUBLIC_PURPOSE_SCHEMA_HASH} from './runtime-profile.js'

const LOCK_KEY=1_282_006_534
interface Migration {version:number;name:string;checksum:string}
export interface RuntimePatchDescriptor {runtime:string;schema:number;protocol:number;schemaHash:string;productVersion:number;migrations:Migration[]}
export type PublishedRuntimePatchDescriptor=RuntimePatchDescriptor&{integrity:string;tarball:string}
const check=(value:unknown,message:string):void=>{if(!value)throw Error(message)}
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex')
export async function loadRuntimePatchInventory(productVersion:54|57|58=54):Promise<Migration[]>{
 check(productVersion===54||productVersion===57||productVersion===58,'Unreviewed runtime patch product')
 const root=new URL('./migrations/',import.meta.url),files=(await readdir(root)).sort()
 check(files.length===productVersion,`Runtime patch requires complete product${productVersion} inventory`)
 return Promise.all(files.map(async(file,index)=>{
  const match=/^(\d{4})_([a-z0-9_]+)\.sql$/.exec(file)
  check(match&&Number(match[1])===index+1,'Invalid runtime patch inventory')
  return {version:index+1,name:match![2],checksum:hash(await readFile(new URL(file,root)))}
 }))
}
export function assertRuntimePatchDescriptors(source:RuntimePatchDescriptor,target:RuntimePatchDescriptor):void{
 check(source.productVersion===target.productVersion,'Runtime patch cannot change product schema')
 const product=target.productVersion
 check(product===54||product===57||product===58,'Unreviewed runtime patch product')
 if(product===57)check(source.runtime==='3.8.12'&&target.runtime==='3.8.14','Product57 runtime patch is restricted to exact3.8.12 to3.8.14')
 if(product===58)check(source.runtime==='3.8.14'&&target.runtime==='3.8.15'||source.runtime==='3.8.15'&&target.runtime==='3.8.16','Product58 runtime patch is restricted to exact3.8.14 to3.8.15 or3.8.15 to3.8.16')
 for(const d of [source,target]){
  assertCurrentRuntimeProfile({runtime:d.runtime,schema:d.schema,controlPlane:d.protocol,publicText:currentPublicTextVersion(d.runtime),runTrace:1},d.schemaHash,d.runtime)
  check(d.migrations?.length===product,`Runtime patch requires complete product${product}`)
  check(d.migrations.every((m,i)=>m.version===i+1&&/^[a-z0-9_]+$/.test(m.name)&&/^[a-f0-9]{64}$/.test(m.checksum)),'Runtime patch requires complete ordered named migration checksums')
 }
 check(Number(target.runtime.split('.')[2])>Number(source.runtime.split('.')[2]),'Runtime patch must advance within the same reviewed major/minor')
 check(equal(source.migrations,target.migrations),'Runtime patch cannot change any product migration')
}
const BARRIER_SQL=`SELECT
 (SELECT rolsuper OR pg_has_role(current_user,'pg_read_all_stats','MEMBER') FROM pg_roles WHERE rolname=current_user) AS visible,
 (SELECT count(*)::int FROM pg_prepared_xacts WHERE database=current_database()) AS prepared,
 (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend') AS "otherClients",
 (SELECT count(*)::int FROM lingxios.agent_work_items WHERE status='leased' AND lease_expires_at>NOW()) AS "liveWork",
 (SELECT count(*)::int FROM lingxios.agent_os_session_leases WHERE expires_at>NOW()) AS "liveSession",
 (SELECT count(*)::int FROM lingxios.agent_attempts WHERE ended_at IS NULL AND lease_expires_at>NOW()) AS "liveAttempts",
 (SELECT count(*)::int FROM lingxios.agent_memory_capture WHERE completed_at IS NULL AND claim_token IS NOT NULL AND claim_until>NOW()) AS "liveCapture",
 ((SELECT count(*)::int FROM lingxios.agent_delivery_outbox WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*)::int FROM lingxios.agent_run_events WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*)::int FROM lingxios.agent_model_budget_calls WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*)::int FROM lingxios.agent_terminal_outbox WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())) AS "liveOutbox",
 (SELECT count(*)::int FROM lingxios.agent_work_items w WHERE w.status IN ('queued','leased','waiting')
  AND ($1::boolean OR w.kind IN ('turn','resume','routine','teacher_digest')) AND EXISTS(SELECT 1 FROM lingxios.agent_steps s
   WHERE s.work_id=w.id AND s.kind IN ('runtime.binding','runtime.checkpoint'))) AS "incompatibleRuns"`
export async function readRuntimePatchBarrier(database:Pick<PoolClient,'query'>,exclusiveClients=false){
 // Product57 also covers bound native job kinds beyond the historical IM list.
 const result=(await database.query(BARRIER_SQL,[exclusiveClients])).rows[0] as Record<string,unknown>
 check(result?.visible===true,'Runtime patch lease visibility unavailable')
 const counters=['prepared','liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','incompatibleRuns'] as const
 check(counters.every(k=>Number.isSafeInteger(result[k])&&Number(result[k])>=0),'Runtime patch barrier unavailable')
 if(exclusiveClients){
  check(Number.isSafeInteger(result.otherClients)&&Number(result.otherClients)>=0,'Runtime patch client visibility unavailable')
  check(result.otherClients===0,'Runtime patch requires no other database clients')
 }
 return Object.fromEntries(counters.map(k=>[k,Number(result[k])])) as Record<typeof counters[number],number>
}
export function runtimePatchPlanHash(source:RuntimePatchDescriptor,target:PublishedRuntimePatchDescriptor):string{
 const descriptor=(d:RuntimePatchDescriptor)=>({runtime:d.runtime,schema:d.schema,protocol:d.protocol,schemaHash:d.schemaHash,productVersion:d.productVersion,
  migrations:d.migrations.map(({version,name,checksum})=>({version,name,checksum}))})
 return 'sha256:'+hash(JSON.stringify({source:descriptor(source),target:{...descriptor(target),integrity:target.integrity,tarball:target.tarball}}))
}
async function patchResources(source:RuntimePatchDescriptor,target:RuntimePatchDescriptor){
 assertRuntimePatchDescriptors(source,target)
 check(equal(await loadRuntimePatchInventory(target.productVersion as 54|57|58),target.migrations),'Committed inventory differs from runtime patch')
 const schema=await readFile(packageResources().schema,'utf8')
 check(hash(schema)===target.schemaHash,'Executing native schema bytes changed')
 if(target.productVersion>=57){
  check(equal(releaseVersions,{runtime:target.runtime,controlPlane:11,kernel:2,schema:14,assistantMessage:2,publicText:3,runTrace:1}),
   'Runtime patch requires the exact reviewed complete formal public protocol tuple')
 }
 const tables=[...schema.matchAll(/^CREATE TABLE (lingxios\.[a-z_]+)\s*\(/gm)].map(m=>m[1])
 check(tables.length>0,'Executing native schema has no tables')
 return tables
}
async function installedPatchState(client:PoolClient,target:RuntimePatchDescriptor,tables:string[]){
 check(equal((await client.query('SELECT version,name,checksum FROM public.schema_migrations ORDER BY version')).rows,target.migrations),'Installed inventory differs from runtime patch')
 check((await client.query('SELECT version FROM lingxios.schema_version WHERE singleton')).rows[0]?.version===14,'Actual native schema changed')
 check((await client.query('SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NULL',[tables])).rowCount===0,'Required native table missing')
 const rows=(await client.query('SELECT runtime_version,schema_version,protocol_version,schema_sha256 FROM public.lingxios_installation WHERE singleton')).rows
 check(rows.length===1&&rows[0].schema_version===target.schema&&rows[0].protocol_version===target.protocol&&rows[0].schema_sha256===target.schemaHash,'Installed runtime schema/protocol provenance changed')
 return rows[0].runtime_version as string
}
/** Transaction core; the executing image entrypoint below independently proves its formal package. */
export async function compareAndSwapRuntimeProvenance(database:Pool,source:RuntimePatchDescriptor,target:RuntimePatchDescriptor){
 const tables=await patchResources(source,target)
 const client=await database.connect()
 let writeAttempted=false,commitAttempted=false
 try{
  await client.query('BEGIN')
  await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='15s'")
  await client.query('SELECT pg_advisory_xact_lock($1)',[LOCK_KEY])
  // Freeze owning rows until the provenance CAS commits; no lease is rewritten.
  await client.query(`LOCK TABLE public.lingxios_installation,public.schema_migrations,lingxios.schema_version,
   lingxios.agent_work_items,lingxios.agent_steps,lingxios.agent_os_session_leases,lingxios.agent_attempts,
   lingxios.agent_memory_capture,lingxios.agent_delivery_outbox,lingxios.agent_run_events,
   lingxios.agent_model_budget_calls,lingxios.agent_terminal_outbox IN SHARE ROW EXCLUSIVE MODE`)
  check(await installedPatchState(client,target,tables)===source.runtime,'Runtime patch source provenance changed; observe instead of replay')
  const barrier=await readRuntimePatchBarrier(client,target.productVersion>=57)
  check(Object.values(barrier).every(n=>n===0),'Runtime patch requires zero live leases and no incompatible resumable runs')
  writeAttempted=true
  const result=await client.query(`UPDATE public.lingxios_installation SET runtime_version=$1,installed_at=NOW()
   WHERE singleton AND runtime_version=$2 AND schema_version=$3 AND protocol_version=$4 AND schema_sha256=$5`,
  [target.runtime,source.runtime,source.schema,source.protocol,source.schemaHash])
  check(result.rowCount===1,'Runtime patch source CAS failed; do not replay')
  commitAttempted=true
  await client.query('COMMIT')
  return {source:source.runtime,target:target.runtime,schema:14,product:target.productVersion,updated:1}
 }catch(error){
  let rolledBack=false
  try{await client.query('ROLLBACK');rolledBack=true}catch{}
  if(commitAttempted||writeAttempted&&!rolledBack)throw Object.assign(Error('Runtime patch commit unconfirmed; read-only observation required, never replay'),{uncertain:true})
  throw error
 }finally{client.release()}
}
async function assertPublishedPatch(target:PublishedRuntimePatchDescriptor){
 const locked=await loadLockedRuntimePackage()
 check(locked.runtime===target.runtime&&locked.integrity===target.integrity&&locked.tarball===target.tarball,'Exact formal runtime patch package/locks required')
 const schemaHash=hash(await readFile(packageResources().schema))
 assertCurrentRuntimeProfile(releaseVersions,schemaHash,target.runtime)
 check(schemaHash===PUBLIC_PURPOSE_SCHEMA_HASH&&schemaHash===target.schemaHash,'Runtime patch native schema bytes changed')
}
export async function applyPublishedRuntimePatch(database:Pool,source:RuntimePatchDescriptor,target:PublishedRuntimePatchDescriptor){
 await assertPublishedPatch(target)
 return compareAndSwapRuntimeProvenance(database,source,target)
}
/** The host binds this read-only result to its existing manifest/phase intent.
 * A matching target proves the requested state, not which process committed it.
 * Source or unknown states never authorize replay of the same CAS intent. */
export async function observePublishedRuntimePatch(database:Pool,source:RuntimePatchDescriptor,target:PublishedRuntimePatchDescriptor){
 check([57,58].includes(source.productVersion)&&source.productVersion===target.productVersion,'Observation entrypoint supports only reviewed product57/58')
 await assertPublishedPatch(target)
 const tables=await patchResources(source,target),client=await database.connect()
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='15s'")
  const runtime=await installedPatchState(client,target,tables)
  check(runtime===source.runtime||runtime===target.runtime,'Runtime patch observation found unknown provenance')
  const barrier=await readRuntimePatchBarrier(client,true)
  check(Object.values(barrier).every(n=>n===0),'Runtime patch observation requires the complete maintenance barrier')
  await client.query('COMMIT')
  return {complete:runtime===target.runtime,state:runtime===target.runtime?'target':'source',source:source.runtime,target:target.runtime,schema:14,product:target.productVersion,
   planHash:runtimePatchPlanHash(source,target),observationOnly:true}
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
