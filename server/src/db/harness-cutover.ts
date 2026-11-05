// Read-only maintenance barrier for a product harness change after the explicit formal4.0.0 bridge.
// The host must stop both source APIs/Workers before requesting exclusivity.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import type { Pool } from 'pg'
import { packageResources, releaseVersions } from '@lingxi-org/lingxios'
import { assertCurrentRuntimeProfile, loadLockedRuntimePackage } from './runtime-profile.js'
import { readRuntimePatchBarrier } from './runtime-patch.js'

export async function inspectHarnessCutover(database: Pool, exclusiveClients: boolean) {
  const locked = await loadLockedRuntimePackage()
  assert.equal(locked.runtime, '4.0.0', 'harness cutover requires the exact formal4.0.0 package')
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
  const schemaHash = hash(await readFile(packageResources().schema))
  assertCurrentRuntimeProfile(releaseVersions, schemaHash, locked.runtime)
  const root = new URL('./migrations/', import.meta.url), files = (await readdir(root)).sort()
  assert.equal(files.length, 63)
  assert.equal(files[62], '0063_native_artifact_documents.sql')
  const inventory = await Promise.all(files.map(async (file, index) => {
    const match = /^(\d{4})_([a-z0-9_]+)\.sql$/.exec(file)
    assert.equal(Number(match?.[1]), index + 1, 'complete ordered migration inventory required')
    return { version: index + 1, name: match![2], checksum: hash(await readFile(new URL(file, root))) }
  }))
  const client = await database.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await client.query("SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='15s'")
    const installed = (await client.query('SELECT runtime_version,schema_version,protocol_version,schema_sha256 FROM public.lingxios_installation WHERE singleton')).rows
    assert.deepEqual(installed, [{ runtime_version: locked.runtime, schema_version: 14, protocol_version: 11, schema_sha256: schemaHash }], 'harness cutover cannot change installed SDK provenance')
    assert.equal((await client.query('SELECT version FROM lingxios.schema_version WHERE singleton')).rows[0]?.version, 14, 'installed native schema changed')
    const ledger = (await client.query('SELECT version,name,checksum FROM public.schema_migrations ORDER BY version')).rows
    assert.ok(ledger.length === 62 || ledger.length === 63, 'harness cutover requires exact product62 or63')
    assert.deepEqual(ledger, inventory.slice(0, ledger.length), 'harness cutover requires immutable product history')
    // Includes every kind, future queued work, waiting approvals, and expired
    // leases without runtime steps. Never mutate a pinned work item to pass.
    const counts = await readRuntimePatchBarrier(client, exclusiveClients, true, true)
    assert.ok(Object.values(counts).every(count => count === 0), 'harness cutover requires all nonterminal work to finish on the pinned source')
    await client.query('COMMIT')
    return { observationOnly: true, runtime: locked.runtime, product: ledger.length, exclusiveClients, counts }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { client.release() }
}
