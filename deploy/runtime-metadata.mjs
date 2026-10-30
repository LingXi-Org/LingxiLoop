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
  await client.query('COMMIT')
  console.log(JSON.stringify({ observationOnly: true, runtime: releaseVersions, installed, native,
    product: { count: migrations.length, version: migrations.at(-1)?.version ?? null,
      inventoryHash: createHash('sha256').update(JSON.stringify(migrations)).digest('hex') } }))
} catch (error) {
  console.error(JSON.stringify({ observationOnly: true, status: 'unavailable', code: error.code ?? 'metadata_query_failed' }))
  process.exitCode = 1
} finally {
  await client.end()
}
