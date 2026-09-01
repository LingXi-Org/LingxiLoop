import { Pool } from 'pg'
import { env } from '../env.js'

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Defense-in-depth against connection-pool exhaustion. A single slow or stuck
  // query must never pin a pool slot indefinitely — that is exactly how one
  // un-indexed hot query (idle.ts' MAX(created_at) seq-scan) held all 20 slots
  // at ~8s each and 503-ed the entire API. 60s is far above any healthy request
  // (sub-second) but reaps genuine runaways; idle-in-transaction reaps leaked
  // transactions holding a slot open doing nothing. Database migration
  // is a separate one-shot process and does not share this live application pool.
  statement_timeout: 60_000,
  idle_in_transaction_session_timeout: 30_000,
})

pool.on('error', (err) => {
  console.error('[pg] idle client error', err)
})
