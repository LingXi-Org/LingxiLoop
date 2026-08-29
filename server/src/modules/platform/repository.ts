import type { Queryable } from '../../db/queryable.js'

export async function assertDatabaseReady(db: Queryable): Promise<void> {
  await db.query('SELECT 1')
}
