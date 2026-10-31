// A portable, authenticated-CI bootstrap for isolated product acceptance. This
// contains no test/user data and preserves the real published SDK's receipts.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Client } from 'pg'
import { releaseVersions } from '@lyyzka/lingxios'

assert.equal(process.env.CI, 'true')
assert.equal(process.env.NODE_ENV, 'test')
assert.equal(process.env.INTEGRATION_DATABASE_URL, process.env.DATABASE_URL)
const target = new URL(process.env.INTEGRATION_DATABASE_URL)
assert.equal(target.hostname, '127.0.0.1')
assert.equal(target.port, '5432')
assert.equal(target.pathname, '/lingxiloop_test')
assert.equal(target.search, '')
assert.equal(target.hash, '')
const database = new Client({ connectionString: target.href })
await database.connect()
let migrations, installation
try {
  for (const table of ['users', 'participants', 'im_channel_bindings', 'im_send_acceptances', 'llm_calls', 'lingxios.agent_work_items']) {
    assert.equal((await database.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, 0, `${table} must be empty`)
  }
  migrations = (await database.query('SELECT version,name,checksum FROM schema_migrations ORDER BY version')).rows
  installation = (await database.query('SELECT runtime_version,schema_version,protocol_version,schema_sha256 FROM lingxios_installation WHERE singleton')).rows[0]
  assert.equal(installation.runtime_version, releaseVersions.runtime)
  assert.equal(installation.schema_version, releaseVersions.schema)
} finally { await database.end() }
const directory = 'artifacts/integration-empty-database'
await mkdir(directory, { recursive: true })
await promisify(execFile)('pg_dump', ['--format=custom', '--no-owner', '--no-acl', `--file=${directory}/empty.dump`], {
  env: { ...process.env, PGHOST: target.hostname, PGPORT: target.port, PGDATABASE: 'lingxiloop_test',
    PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password) }, timeout: 30_000,
})
await writeFile(`${directory}/provenance.json`, JSON.stringify({ commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  scope: 'CI-only database immediately after formal bootstrap, before any test fixtures', installation, migrations }, null, 2) + '\n')
console.info('Exported empty, formally bootstrapped integration database; no user or test records.')
