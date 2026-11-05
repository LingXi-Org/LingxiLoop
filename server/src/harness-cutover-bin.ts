// Fixed read-only gate. Does not load the product runtime or perform migrations.
import { Pool } from 'pg'
import { inspectHarnessCutover } from './db/harness-cutover.js'

async function main() {
  const [action, ...extra] = process.argv.slice(2)
  if (!['preflight', 'barrier'].includes(action) || extra.length) throw new Error('invalid harness observation action')
  const connection = process.env.DATABASE_URL
  if (!connection || !['postgres:', 'postgresql:'].includes(new URL(connection).protocol)) throw new Error('harness observation requires its configured database')
  const database = new Pool({ connectionString: connection, max: 1, application_name: 'lingxi-release-harness-cutover63', connectionTimeoutMillis: 5000, idleTimeoutMillis: 1000 })
  try {
    const result = await inspectHarnessCutover(database, action === 'barrier')
    process.stdout.write(JSON.stringify({ action, ...result }) + '\n')
  } finally { await database.end() }
}
void main().catch(() => {
  process.stdout.write(JSON.stringify({ error: { code: 'HARNESS_CUTOVER_REFUSED', observationOnly: true,
    message: 'The read-only harness barrier did not pass. Keep or restore the pinned source; finish pending work and observe again.' } }) + '\n')
  process.exitCode = 1
})
