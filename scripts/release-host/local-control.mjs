#!/usr/bin/env node
// Fixed, independent, read-only database evidence and readiness helper. Never accepts a command or SQL from stdin.
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runDocker, validateContract } from './adapter.mjs'
import { hash, fault } from './journal.mjs'

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
 'prepared',(SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database())
)::text;
COMMIT;`

export function qualifyDatabaseEvidence(actual, database) {
  const profile = database.profiles?.[`${actual.nativeSchema}:${actual.productSchema}:${actual.schemaHash}`]
  if (!profile || actual.readOnly !== true || actual.fullVisibility !== true || actual.nativeSchema !== actual.installedSchema ||
    actual.productSchema !== actual.migrationCount || hash(actual.migrations) !== profile.migrationsHash || String(actual.protocolVersion) !== String(profile.protocolVersion)) {
    throw fault('DATABASE_PROVENANCE_UNQUALIFIED','Installed database schema, migration checksums or capability policy do not match a qualified local profile')
  }
  validateContract(profile.contract)
  if (!Array.isArray(profile.requiredCapabilities) || profile.contract.nativeSchema !== actual.nativeSchema || profile.contract.productSchema !== actual.productSchema) throw fault('DATABASE_PROVENANCE_UNQUALIFIED','Database capability profile has inconsistent schemas')
  return { ...actual, ...profile.contract, requiredCapabilities:profile.requiredCapabilities, verified:true }
}
export async function databaseEvidence(policy, run = (args,options = {}) => runDocker(args,{ ...options,binary:policy.dockerBinary ?? '/usr/bin/docker' })) {
  const database = policy.database
  if (!database || ![database.container,database.user,database.database].every(value => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value ?? ''))) throw fault('DATABASE_NOT_CONFIGURED','Trusted local PostgreSQL identity and qualified profiles are required')
  const raw = await run(['exec','--user','postgres',database.container,'psql','--no-psqlrc','--quiet','--tuples-only','--no-align','--username',database.user,'--dbname',database.database,'--set','ON_ERROR_STOP=1','--set','VERBOSITY=sqlstate','--command',STATE_SQL])
  return qualifyDatabaseEvidence(JSON.parse(raw.trim()),database)
}
export async function localControl(policy, action, op, { run = runDocker, fetcher = fetch } = {}) {
  const local = policy.targets?.[op.target]
  if (!local) throw fault('UNKNOWN_TARGET','Target is not enabled on this host')
  if (action === 'state') return databaseEvidence(policy,run)
  if (action === 'barrier') {
    const state = await databaseEvidence(policy,run)
    const counters = ['liveWork','liveSession','liveAttempts','liveCapture','liveOutbox','prepared','otherClients']
    return { ...Object.fromEntries(counters.map(key => [key,state[key]])),fullVisibility:true,drained:counters.every(key => state[key] === 0) }
  }
  if (action === 'readiness') {
    const db = new DatabaseSync(join(policy.stateDirectory,'journal.sqlite'),{ readOnly:true })
    let manifest, direction
    try {
      const row = db.prepare('SELECT body,hash FROM manifests WHERE release_id=?').get(op.releaseId)
      if (!row || row.hash !== op.manifestHash) throw fault('MANIFEST_REQUIRED','Readiness requires a registered immutable release')
      manifest = JSON.parse(row.body)
      const state = db.prepare('SELECT body FROM node_state WHERE target=?').get(op.target)
      direction = op.direction ?? (state ? JSON.parse(state.body).appliedDirection : null) ?? 'forward'
    } finally { db.close() }
    const plan = manifest.targets[op.target].hostPlan, descriptor = direction === 'recovery' ? plan.recovery : plan
    for (const [service,spec] of Object.entries(local.services)) if (spec.role === 'web') {
      const ids = (await run(['ps','--all','--quiet','--filter',`label=com.docker.compose.project=${local.project}`,'--filter',`label=com.docker.compose.service=${service}`])).trim().split(/\s+/).filter(Boolean)
      if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0])) throw fault('READINESS_UNPROVEN','Expected one local Web container')
      const [container] = JSON.parse(await run(['container','inspect',ids[0]]))
      if (container.Image !== descriptor.images[service].configDigest || !container.State.Running || container.State.Health?.Status !== 'healthy') throw fault('READINESS_UNPROVEN','Actual Web image or health is not qualified')
    }
    const url = new URL(local.readinessUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) throw fault('INVALID_POLICY','Readiness needs a trusted HTTPS or loopback URL')
    const response = await fetcher(url,{ redirect:'error',signal:AbortSignal.timeout(5000) })
    await response.body?.cancel()
    if (!response.ok) throw fault('READINESS_UNPROVEN','Actual Web/control readiness failed')
    return { ready:true,contract:descriptor.contract,manifestHash:op.manifestHash }
  }
  throw fault('UNSUPPORTED_CONTROL','The fixed helper only supports state, barrier and readiness')
}
async function main() {
  const [policyPath,action] = process.argv.slice(2)
  if (!policyPath || !['state','barrier','readiness'].includes(action)) throw Error('Fixed local-control usage: <policy.json> state|barrier|readiness')
  let input = ''
  for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024*1024) throw Error('Input exceeds limit') }
  const result = await localControl(JSON.parse(await readFile(policyPath,'utf8')),action,JSON.parse(input))
  process.stdout.write(JSON.stringify(result))
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { process.stdout.write(JSON.stringify({ error:{ code:error.code ?? 'LOCAL_CONTROL_FAILED',message:error.code ? error.message : 'Trusted local evidence helper failed',...(error.sqlState ? { sqlState:error.sqlState } : {}) } })); process.exitCode = 1 })
