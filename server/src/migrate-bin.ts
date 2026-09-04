import { pool } from './db/pool.js'
import { migrateDatabase } from './db/migrate.js'

const startedAt = Date.now()

try {
  const applied = await migrateDatabase()
  console.log(`[db:migrate] ${applied.length > 0 ? `applied ${applied.join(', ')}` : 'already current'} · ${Date.now() - startedAt}ms`)
} catch (error) {
  console.error('[db:migrate] failed:', error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
} finally {
  await pool.end()
}
