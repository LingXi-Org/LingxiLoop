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
const check=(value:unknown,message:string):void=>{if(!value)throw Error(message)}
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex')
export async function loadRuntimePatchInventory():Promise<Migration[]>{
 const root=new URL('./migrations/',import.meta.url),files=(await readdir(root)).sort()
 check(files.length===54,'Runtime patch requires complete product54 inventory')
 return Promise.all(files.map(async(file,index)=>{
  const match=/^(\d{4})_([a-z0-9_]+)\.sql$/.exec(file)
  check(match&&Number(match[1])===index+1,'Invalid runtime patch inventory')
  return {version:index+1,name:match![2],checksum:hash(await readFile(new URL(file,root)))}
 }))
}
export function assertRuntimePatchDescriptors(source:RuntimePatchDescriptor,target:RuntimePatchDescriptor):void{
 for(const d of [source,target]){
  assertCurrentRuntimeProfile({runtime:d.runtime,schema:d.schema,controlPlane:d.protocol,publicText:currentPublicTextVersion(d.runtime),runTrace:1},d.schemaHash,d.runtime)
  check(d.productVersion===54&&d.migrations?.length===54,'Runtime patch requires complete product54')
 }
 check(Number(target.runtime.split('.')[2])>Number(source.runtime.split('.')[2]),'Runtime patch must advance within the same reviewed major/minor')
 check(equal(source.migrations,target.migrations),'Runtime patch cannot change any product migration')
}
const BARRIER_SQL=`SELECT
 (SELECT rolsuper OR pg_has_role(current_user,'pg_read_all_stats','MEMBER') FROM pg_roles WHERE rolname=current_user) AS visible,
 (SELECT count(*)::int FROM pg_prepared_xacts WHERE database=current_database()) AS prepared,
 (SELECT count(*)::int FROM lingxios.agent_work_items WHERE status='leased' AND lease_expires_at>NOW()) AS "liveWork",
 (SELECT count(*)::int FROM lingxios.agent_os_session_leases WHERE expires_at>NOW()) AS "liveSession",
 (SELECT count(*)::int FROM lingxios.agent_attempts WHERE ended_at IS NULL AND lease_expires_at>NOW()) AS "liveAttempts",
 (SELECT count(*)::int FROM lingxios.agent_memory_capture WHERE completed_at IS NULL AND claim_token IS NOT NULL AND claim_until>NOW()) AS "liveCapture",
 ((SELECT count(*)::int FROM lingxios.agent_delivery_outbox WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*)::int FROM lingxios.agent_run_events WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*)::int FROM lingxios.agent_model_budget_calls WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())+
  (SELECT count(*)::int FROM lingxios.agent_terminal_outbox WHERE delivered_at IS NULL AND claim_token IS NOT NULL AND available_at>NOW())) AS "liveOutbox",
 (SELECT count(*)::int FROM lingxios.agent_work_items w WHERE w.status IN ('queued','leased','waiting')
  AND w.kind IN ('turn','resume','routine','teacher_digest') AND EXISTS(SELECT 1 FROM lingxios.agent_steps s
   WHERE s.work_id=w.id AND s.kind IN ('runtime.binding','runtime.checkpoint'))) AS "incompatibleRuns"`
export async function readRuntimePatchBarrier(database:Pick<PoolClient,'query'>){
 const result=(await database.query(BARRIER_SQL)).rows[0] as Record<string,unknown>
 check(result?.visible===true,'Runtime patch lease visibility unavailable')
 const counters=['prepared','liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','incompatibleRuns'] as const
 check(counters.every(k=>Number.isSafeInteger(result[k])&&Number(result[k])>=0),'Runtime patch barrier unavailable')
 return Object.fromEntries(counters.map(k=>[k,Number(result[k])])) as Record<typeof counters[number],number>
}
/** Transaction core; the executing image entrypoint below independently proves its formal package. */
export async function compareAndSwapRuntimeProvenance(database:Pool,source:RuntimePatchDescriptor,target:RuntimePatchDescriptor){
 assertRuntimePatchDescriptors(source,target)
 check(equal(await loadRuntimePatchInventory(),target.migrations),'Committed inventory differs from runtime patch')
 const schema=await readFile(packageResources().schema,'utf8')
 check(hash(schema)===target.schemaHash,'Executing native schema bytes changed')
 const tables=[...schema.matchAll(/^CREATE TABLE (lingxios\.[a-z_]+)\s*\(/gm)].map(m=>m[1])
 check(tables.length>0,'Executing native schema has no tables')
 const client=await database.connect()
 try{
  await client.query('BEGIN')
  await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='15s'")
  await client.query('SELECT pg_advisory_xact_lock($1)',[LOCK_KEY])
  // Freeze owning rows until the provenance CAS commits; no lease is rewritten.
  await client.query(`LOCK TABLE public.lingxios_installation,public.schema_migrations,lingxios.schema_version,
   lingxios.agent_work_items,lingxios.agent_steps,lingxios.agent_os_session_leases,lingxios.agent_attempts,
   lingxios.agent_memory_capture,lingxios.agent_delivery_outbox,lingxios.agent_run_events,
   lingxios.agent_model_budget_calls,lingxios.agent_terminal_outbox IN SHARE ROW EXCLUSIVE MODE`)
  check(equal((await client.query('SELECT version,name,checksum FROM public.schema_migrations ORDER BY version')).rows,target.migrations),'Installed inventory differs from runtime patch')
  check((await client.query('SELECT version FROM lingxios.schema_version WHERE singleton')).rows[0]?.version===14,'Actual native schema changed')
  check((await client.query('SELECT name FROM unnest($1::text[]) AS name WHERE to_regclass(name) IS NULL',[tables])).rowCount===0,'Required native table missing')
  const barrier=await readRuntimePatchBarrier(client)
  check(Object.values(barrier).every(n=>n===0),'Runtime patch requires zero live leases and no incompatible resumable runs')
  const result=await client.query(`UPDATE public.lingxios_installation SET runtime_version=$1,installed_at=NOW()
   WHERE singleton AND runtime_version=$2 AND schema_version=$3 AND protocol_version=$4 AND schema_sha256=$5`,
  [target.runtime,source.runtime,source.schema,source.protocol,source.schemaHash])
  check(result.rowCount===1,'Runtime patch source CAS failed; do not replay')
  await client.query('COMMIT')
  return {source:source.runtime,target:target.runtime,schema:14,product:54,updated:1}
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}finally{client.release()}
}
export async function applyPublishedRuntimePatch(database:Pool,source:RuntimePatchDescriptor,target:RuntimePatchDescriptor&{integrity:string;tarball:string}){
 const locked=await loadLockedRuntimePackage()
 check(locked.runtime===target.runtime&&locked.integrity===target.integrity&&locked.tarball===target.tarball,'Exact formal runtime patch package/locks required')
 const schemaHash=hash(await readFile(packageResources().schema))
 assertCurrentRuntimeProfile(releaseVersions,schemaHash,target.runtime)
 check(schemaHash===PUBLIC_PURPOSE_SCHEMA_HASH&&schemaHash===target.schemaHash,'Runtime patch native schema bytes changed')
 return compareAndSwapRuntimeProvenance(database,source,target)
}
