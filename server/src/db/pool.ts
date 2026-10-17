import 'dotenv/config'
import { Pool } from 'pg'
import { observePoolAcquire, observeSqlSubmission, registerPoolMetrics } from '../metrics.js'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('[env] Missing required environment variable: DATABASE_URL')

const databasePoolMax = Number(process.env.DATABASE_POOL_MAX ?? 20)
if (!Number.isInteger(databasePoolMax) || databasePoolMax < 1) {
  throw new Error('[env] DATABASE_POOL_MAX must be an integer >= 1')
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: databasePoolMax,
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

// Instrument the public pg instance without changing overload/callback semantics.
// Pool.query calls connect internally; count acquisition there once. Instrument
// each physical client's query once so transaction and listener SQL also count.
pool.on('connect', (client) => {
  client.query = new Proxy(client.query, {
    apply(target, receiver, args) {
      observeSqlSubmission()
      return Reflect.apply(target, receiver, args)
    },
  })
})
pool.connect = new Proxy(pool.connect, {
  apply(target, receiver, args: unknown[]) {
    const started = performance.now()
    const record = (error?: unknown) => observePoolAcquire(performance.now() - started, error ? 'error' : 'ok')
    const callback = args[0]
    if (typeof callback === 'function') {
      return Reflect.apply(target, receiver, [(...result: unknown[]) => {
        record(result[0])
        return Reflect.apply(callback, undefined, result)
      }])
    }
    return (Reflect.apply(target, receiver, args) as Promise<unknown>).then(
      (client) => { record(); return client },
      (error: unknown) => { record(error); throw error },
    )
  },
})
registerPoolMetrics(() => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: databasePoolMax }))

pool.on('error', (err) => {
  console.error('[pg] idle client error', err)
})

export async function closeDatabasePools(): Promise<void> {
  await pool.end()
}

export function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = (error as Error & { code?: string }).code
  return ['53300', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code ?? '')
    || Boolean(code?.startsWith('08'))
    || /^(timeout exceeded when trying to connect|Connection terminated due to connection timeout)$/.test(error.message)
}
