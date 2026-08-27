/** Bootstrap the immutable LingxiLoop v1 schema in an empty database. */
import { bootstrapV1Schema } from './db/bootstrap.js'
import { pool } from './db/pool.js'

async function main(): Promise<void> {
  const startedAt = Date.now()
  try {
    const result = await bootstrapV1Schema()
    console.log(`[db:bootstrap] LingxiLoop v1 schema ${result === 'created' ? 'created' : 'already ready'} · ${Date.now() - startedAt}ms`)
  } finally {
    await pool.end()
  }
}

void main().catch((error) => {
  console.error('[db:bootstrap] failed:', error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
