import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { createCaseCoverWorker } from './cover-worker.js'

export function startCaseCoverWorker() {
  return createCaseCoverWorker({ db:pool,transaction:work => withTransaction(pool,work),
    enabled:() => process.env.CASE_COVER_ENABLED!=='false',
    concurrency:Number(process.env.CASE_COVER_CONCURRENCY ?? 1),
    timeoutMs:Number(process.env.CASE_COVER_TIMEOUT_MS ?? 120_000),
    maxAttempts:Number(process.env.CASE_COVER_MAX_ATTEMPTS ?? 3),
    generate:async input => (await import('../case-covers/cover-generation.js')).generateCaseCover(input),
  }).start(Number(process.env.CASE_COVER_INTERVAL_MS ?? 2_000))
}
