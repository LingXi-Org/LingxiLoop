import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { createServer } from 'node:net'
import { mkdir, writeFile } from 'node:fs/promises'
import { releaseVersions } from '@lyyzka/lingxios'
import { createCallbackRunner } from '../agent-runtime/callback-scope.js'

// A separate database is required even when this file is run outside the suite.
const url = new URL(process.env.INTEGRATION_DATABASE_URL ?? '')
assert.match(url.pathname, /(?:_|-)test(?:$|[_-])/)
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname))
const pool = new Pool({ connectionString: url.href, max: 4, connectionTimeoutMillis: 300,
  application_name: 'callback-deadline-fixture', statement_timeout: 5000 })
const monitor = new Pool({ connectionString: url.href, max: 2 })
const run = createCallbackRunner(pool, { concurrency: 2, timeoutMs: 1000 })
const measurements: Record<string, unknown>[] = []
const context = (signal: AbortSignal, ms = 1000) => ({ signal, deadlineAt: new Date(Date.now() + ms).toISOString() })
async function until(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await delay(10) }
  assert.fail(message)
}
async function waiting(count: number) {
  await until(async () => (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
    WHERE application_name='callback-deadline-fixture' AND wait_event_type='Lock'`)).rows[0].n === count,
  `expected ${count} real blocked statements`)
}
before(async () => { await monitor.query('DROP TABLE IF EXISTS callback_scope_receipts'); await monitor.query('CREATE TABLE callback_scope_receipts(id text PRIMARY KEY, value int NOT NULL)') })
after(async () => {
  const postgres = (await monitor.query('SHOW server_version')).rows[0].server_version
  await mkdir('artifacts/callback-deadlines', { recursive: true })
  await writeFile('artifacts/callback-deadlines/scope.json', JSON.stringify({ runtime: releaseVersions.runtime,
    postgres,synthetic: true,realProvider: false,measurements }, null, 2))
  await Promise.all([pool.end(), monitor.end()])
})

test('shared callback admission preserves foreground capacity and destroys cancelled lock waiters', async () => {
  const lock = await monitor.connect(), abort = new AbortController()
  await lock.query('SELECT pg_advisory_lock(153161)')
  let entered = 0
  const tasks = Array.from({ length: 8 }, () => run(context(abort.signal), async scope => {
    entered++
    await scope.database.query('SELECT pg_advisory_lock(153161)')
    assert.fail('blocker must remain held')
  }))
  const settled = Promise.allSettled(tasks)
  try {
    await waiting(2)
    assert.equal(entered, 2, 'all three lanes must share one admission limit')
    assert.equal((await pool.query('SELECT 42 AS n')).rows[0].n, 42)
    const abortedAt = performance.now()
    abort.abort(new Error('fixture cancellation'))
    assert.ok((await settled).every(result => result.status === 'rejected'))
    await waiting(0)
    assert.equal(entered, 2, 'cancelled queued callbacks must never start')
    assert.equal(pool.waitingCount, 0)
    assert.equal(await run(undefined, async scope => (await scope.database.query('SELECT 43 AS n')).rows[0].n), 43)
    measurements.push({ scenario: 'shared-admission-early-abort',submitted: 8,entered,actualBlocked: 2,remainingBlocked: 0,
      abortThroughBackendExitAndNextCallbackMs: performance.now() - abortedAt,blockerStillHeld: true })
  } finally { abort.abort(); await lock.query('SELECT pg_advisory_unlock_all()'); lock.release(); await settled }
})

test('deadlineAt alone cancels SQL, and omitted context has a finite fallback', async () => {
  for (const supplied of [true, false]) {
    const bounded = createCallbackRunner(pool, { concurrency: 2, timeoutMs: 150 })
    let pid = 0
    const started = performance.now()
    await assert.rejects(bounded(supplied ? context(new AbortController().signal, 150) : undefined, async scope => {
      pid = (await scope.database.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      await scope.database.query('SELECT pg_sleep(5)')
    }))
    assert.ok(pid, 'deadline must expire during a statement, not before acquisition')
    assert.ok(performance.now() - started < 1000)
    await until(async () => !(await monitor.query('SELECT 1 FROM pg_stat_activity WHERE pid=$1', [pid])).rowCount,
      'cancelled SQL backend did not exit')
    measurements.push({ scenario: supplied ? 'deadline-only' : 'context-omitted',deadlineMs: 150,actualStatementEntered: true,
      startThroughBackendExitMs: performance.now() - started })
  }
})

test('cancellation rolls back an open transaction and forbids subsequent queries', async () => {
  const abort = new AbortController()
  await assert.rejects(run(context(abort.signal), async scope => {
    await scope.database.query('BEGIN')
    await scope.database.query("INSERT INTO callback_scope_receipts VALUES('rollback',1)")
    abort.abort(new Error('cancel before commit'))
    await assert.rejects(scope.database.query('COMMIT'))
    await assert.rejects(scope.database.query("INSERT INTO callback_scope_receipts VALUES('after-cancel',1)"))
  }))
  assert.deepEqual((await monitor.query("SELECT * FROM callback_scope_receipts WHERE id IN ('rollback','after-cancel')")).rows, [])
})

test('autocommitted writes with cancelled acknowledgements reject and recover once by stable identity', async () => {
  const abort = new AbortController()
  const write = async (db: { query: Pool['query'] }) => db.query("INSERT INTO callback_scope_receipts VALUES('stable-call-id',1) ON CONFLICT(id) DO NOTHING")
  await assert.rejects(run(context(abort.signal), async scope => {
    await write(scope.database as unknown as { query: Pool['query'] })
    abort.abort(new Error('acknowledgement lost after durable write'))
  }))
  await run(undefined, async scope => { await write(scope.database as unknown as { query: Pool['query'] }) })
  assert.equal((await monitor.query("SELECT COUNT(*)::int AS n FROM callback_scope_receipts WHERE id='stable-call-id'")).rows[0].n, 1)
})

test('cancelled acquisition does not run late SQL or retain an admission slot', async () => {
  const clients = await Promise.all(Array.from({ length: 4 }, () => pool.connect()))
  const abort = new AbortController()
  let entered = false
  const task = run(context(abort.signal), async scope => { entered = true; await scope.database.query('SELECT 1') })
  const rejected = assert.rejects(task)
  await delay(20); abort.abort()
  await rejected
  clients.forEach(client => { client.release() })
  await delay(30)
  assert.equal(entered, false)
  assert.equal(pool.waitingCount, 0)
  assert.equal(await run(undefined, async scope => (await scope.database.query('SELECT 44 AS n')).rows[0].n), 44)
})

test('scope rejects use after completion and errors do not poison the next callback', async () => {
  let captured: Parameters<Parameters<typeof run>[1]>[0] | undefined
  await assert.rejects(run(undefined, async scope => { captured = scope; await scope.database.query('SELECT * FROM callback_missing_table') }))
  await assert.rejects(captured!.database.query('SELECT 1'))
  await run(undefined, async scope => { await scope.database.query('SELECT 1') })
})

test('a cancelled connection handshake settles promptly and late clients are destroyed without SQL', async () => {
  let started!: () => void, queries = 0
  const handshake = new Promise<void>(resolve => { started = resolve })
  const server = createServer(socket => {
    let startup = true
    socket.on('error', () => {})
    socket.on('data', bytes => {
      if (!startup) { if ([81,80].includes(bytes[0])) queries++; return }
      startup = false; started()
      setTimeout(() => socket.write(Buffer.from([82,0,0,0,8,0,0,0,0,90,0,0,0,5,73])), 200)
    })
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const slow = new Pool({ host: '127.0.0.1',port: address.port,user: 'fixture',database: 'fixture',max: 4,connectionTimeoutMillis: 400 })
  const abort = new AbortController(), pending = createCallbackRunner(slow)(context(abort.signal), async () => { assert.fail('cancelled acquisition ran work') })
  const rejected = assert.rejects(pending)
  try {
    await handshake
    const start = performance.now(); abort.abort(); await rejected
    assert.ok(performance.now() - start < 100, 'cancelled acquire waited for handshake completion')
    await until(async () => slow.totalCount === 0, 'late acquired connection was retained')
    assert.equal(queries, 0)
  } finally { await slow.end(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('callback session settings restore on success and a terminated active backend rejects without process errors', async () => {
  const settings = async () => (await pool.query("SELECT name,setting FROM pg_settings WHERE name IN ('statement_timeout','client_connection_check_interval') ORDER BY name")).rows
  const original = await settings()
  await run(undefined, async scope => { await scope.database.query('SELECT 1') })
  assert.deepEqual(await settings(), original)
  let pid = 0
  const failed = run(undefined, async scope => {
    pid = (await scope.database.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    await scope.database.query('SELECT pg_sleep(5)')
  })
  const rejected = assert.rejects(failed)
  await until(async () => pid > 0 && !!(await monitor.query("SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event='PgSleep'", [pid])).rowCount,
    'active query did not start')
  await monitor.query('SELECT pg_terminate_backend($1)', [pid])
  await rejected
  await run(undefined, async scope => { await scope.database.query('SELECT 1') })
})

test('concurrent repository queries serialize configuration with SQL and preserve stricter session limits', async () => {
  // One callback owns a session, but repositories may submit Promise.all reads.
  const one = new Pool({ connectionString: url.href,max: 3,statement_timeout: 4000 })
  const client = await one.connect()
  await client.query("SELECT set_config('client_connection_check_interval','25',false)")
  client.release()
  try {
    await createCallbackRunner(one)(undefined, async scope => {
      const intervals = await Promise.all(Array.from({ length: 4 }, () => scope.database.query(
        "SELECT current_setting('client_connection_check_interval') AS interval,pg_sleep(0.01)")))
      assert.ok(intervals.every(result => result.rows[0].interval === '25ms'))
    })
    assert.equal((await one.query("SELECT current_setting('client_connection_check_interval') AS interval")).rows[0].interval, '25ms')
  } finally { await one.end() }
})
