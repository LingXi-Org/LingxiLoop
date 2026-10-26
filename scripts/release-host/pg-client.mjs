#!/usr/bin/env node
// Single-file observer mounted into an existing cached application image. No sqlite, runtime imports, remote SQL or argv.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const STATE_SQL = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='10s';
SELECT jsonb_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'fullVisibility',(SELECT rolsuper OR pg_has_role(current_user,'pg_read_all_stats','MEMBER') FROM pg_roles WHERE rolname=current_user),
 'nativeSchema',(SELECT version FROM lingxios.schema_version WHERE singleton),
 'installedSchema',(SELECT schema_version FROM public.lingxios_installation WHERE singleton),
 'runtime',(SELECT runtime_version FROM public.lingxios_installation WHERE singleton),
 'protocolVersion',(SELECT protocol_version FROM public.lingxios_installation WHERE singleton),
 'schemaHash',(SELECT schema_sha256 FROM public.lingxios_installation WHERE singleton),
 'migrationCount',(SELECT count(*) FROM public.schema_migrations),
 'productSchema',(SELECT max(version) FROM public.schema_migrations),
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
 'incompatibleRuns',(SELECT count(*) FROM lingxios.agent_work_items w WHERE w.status IN ('queued','leased','waiting')
  AND EXISTS(SELECT 1 FROM lingxios.agent_steps s WHERE s.work_id=w.id AND s.kind IN ('runtime.binding','runtime.checkpoint'))),
 'prepared',(SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database())
)::text AS state;
COMMIT;`

export const MAX_STATE_BYTES = 1024 * 1024
const failure = error => Object.assign(new Error('Fixed read-only database observer failed'),{code:'PG_CLIENT_FAILED',...(/^[A-Z0-9]{5}$/.test(error?.code??'')?{sqlState:error.code}:{})})
export async function readPgState({ env = process.env, loadPg = () => createRequire('/app/package.json')('pg') } = {}) {
  let connection
  try {
    if (typeof env.DATABASE_URL !== 'string' || env.DATABASE_URL.length > 8192) throw Error('Unavailable connection')
    const url = new URL(env.DATABASE_URL)
    if (!['postgres:','postgresql:'].includes(url.protocol)) throw Error('Unsupported connection')
    const { Client } = loadPg()
    connection = new Client({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000,application_name:'lingxi-release-observer'})
    await connection.connect()
    const results = await connection.query(STATE_SQL)
    const rows = (Array.isArray(results)?results:[results]).flatMap(result=>result?.rows??[]).filter(row=>Object.hasOwn(row,'state'))
    if (rows.length !== 1) throw Error('Unproven result')
    const state = typeof rows[0].state === 'string' ? JSON.parse(rows[0].state) : rows[0].state
    if (state?.readOnly !== true || state.fullVisibility !== true || Buffer.byteLength(JSON.stringify(state)) > MAX_STATE_BYTES) throw Error('Unproven result')
    return state
  } catch (error) { throw failure(error) }
  finally { if(connection) { try { await connection.end() } catch {} } }
}
async function main() {
  if (process.argv.length !== 2) throw failure()
  process.stdout.write(JSON.stringify(await readPgState()))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{process.stdout.write(JSON.stringify({error:{code:'PG_CLIENT_FAILED',message:'Fixed read-only database observer failed',...(error.sqlState?{sqlState:error.sqlState}:{})}}));process.exitCode=1})
