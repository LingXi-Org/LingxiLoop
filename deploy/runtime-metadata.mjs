// Fixed metadata-only observation in the already deployed container.
import { createHash } from 'node:crypto'
import { Client } from 'pg'
import { releaseVersions } from '@lyyzka/lingxios'

const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 })
try {
  await client.connect()
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  await client.query("SET LOCAL statement_timeout = '5s'")
  const installed = (await client.query('SELECT runtime_version,schema_version,protocol_version,schema_sha256 FROM public.lingxios_installation WHERE singleton')).rows
  const native = (await client.query('SELECT version FROM lingxios.schema_version WHERE singleton')).rows
  const migrations = (await client.query('SELECT version,name,checksum FROM public.schema_migrations ORDER BY version')).rows
  // Stable identities/provenance and saved-file hashes only; never emit user
  // content, IDs, prompts, credentials or live job payloads. Compare observations
  // around product61 to distinguish its additive DDL from business-data changes.
  const preserved = {}
  if (migrations.at(-1)?.version >= 60) {
    const inventories = {
      artifacts: 'SELECT id,company_id,project_id,conversation_id,kind,created_at FROM artifacts ORDER BY id',
      artifactFiles: 'SELECT artifact_id,path,sha256,size FROM artifact_files ORDER BY artifact_id,path',
      assignments: 'SELECT id,artifact_id,agent_id FROM artifact_agent_assignments ORDER BY id',
      conversations: 'SELECT id,company_id,project_id,created_at FROM conversations ORDER BY id',
      nativeWork: 'SELECT id,tenant_id,agent_id,session_id,kind,lane,trigger_ref FROM lingxios.agent_work_items ORDER BY id',
    }
    for (const [name, sql] of Object.entries(inventories)) {
      const { rows } = await client.query(sql)
      preserved[name] = { count: rows.length, sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') }
    }
    if (migrations.at(-1)?.version >= 61) {
      preserved.slides61 = (await client.query(`SELECT
        (SELECT count(*)::integer FROM slide_workspaces) AS workspaces,
        (SELECT count(*)::integer FROM artifacts WHERE execution_conversation_id IS NOT NULL) AS dedicated_execution,
        (SELECT count(*)::integer FROM artifact_revisions) AS revisions`)).rows[0]
    }
  }
  await client.query('COMMIT')
  console.log(JSON.stringify({ observationOnly: true, runtime: releaseVersions, installed, native,
    observedAt: new Date().toISOString(), preserved,
    product: { count: migrations.length, version: migrations.at(-1)?.version ?? null,
      inventoryHash: createHash('sha256').update(JSON.stringify(migrations)).digest('hex') } }))
} catch (error) {
  console.error(JSON.stringify({ observationOnly: true, status: 'unavailable', code: error.code ?? 'metadata_query_failed' }))
  process.exitCode = 1
} finally {
  await client.end()
}
