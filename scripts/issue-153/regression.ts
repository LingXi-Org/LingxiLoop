// Isolated HTTP regression, with real PostgreSQL/Redis and a scripted control endpoint.
// See FAILURE-MODEL.txt (written before production changes).
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { writeFile, mkdir } from 'node:fs/promises'
import express from 'express'
import Redis from 'ioredis'
import { pool, closeDatabasePools } from '../../server/src/db/pool.js'
import { renderProm, resetForTesting } from '../../server/src/metrics.js'
import { PlatformApplication, type PlatformInfrastructure } from '../../server/src/modules/platform/application.js'
import { registerHealthRoutes, probeControlReady } from '../../server/src/modules/platform/health.js'

const results: Array<{ name: string; milliseconds: number }> = []
async function check(name: string, fn: () => Promise<void>) {
  const start = performance.now()
  await fn()
  results.push({ name, milliseconds: performance.now() - start })
  console.log(`PASS ${name}`)
}
async function listen(server: Server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); assert(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}
const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 0 })
redis.on('error', () => {})
let controlStall = false
let controlClosed: Promise<void> | undefined
let controlStatus = 200
let controlBody: unknown = { ok: true }
const control = createServer((req, res) => {
  if (req.url !== '/readyz') {
    res.writeHead(401).end(); return
  }
  if (controlStall) { controlClosed = new Promise((resolve) => { res.once('close', resolve) }); return }
  res.writeHead(controlStatus, { 'content-type': 'application/json' }).end(JSON.stringify(controlBody))
})
const controlUrl = await listen(control)
let dbCalls = 0, redisCalls = 0, controlCalls = 0
let dbFailure = false, redisFailure = false, controlFailure = false
let blockedRedis: Promise<void> | undefined
const infra = {
  db: { query: async () => { dbCalls++; if (dbFailure) throw new Error('SECRET database URL'); return pool.query('SELECT 1') } },
  redisPing: async () => { redisCalls++; if (redisFailure) throw new Error('SECRET redis URL'); await redis.ping(); await blockedRedis },
  controlReady: async () => { controlCalls++; if (controlFailure) throw new Error('SECRET service token'); await probeControlReady(controlUrl) },
  openNotebookEnabled: () => true,
  openNotebookHealth: async () => { throw new Error('optional offline') },
} as unknown as PlatformInfrastructure
const application = new PlatformApplication(infra)
const app = express(); registerHealthRoutes(app, application)
const api = createServer(app)
const url = await listen(api)
const get = (path: string) => fetch(url + path)
try {
  await check('published public control readiness contract rejects unready and malformed payloads', async () => {
    await probeControlReady(controlUrl)
    controlStatus = 503; await assert.rejects(probeControlReady(controlUrl)); controlStatus = 200
    controlBody = { ok: false }; await assert.rejects(probeControlReady(controlUrl))
    controlBody = {}; await assert.rejects(probeControlReady(controlUrl)); controlBody = { ok: true }
    controlStall = true
    const started = performance.now()
    await assert.rejects(probeControlReady(controlUrl))
    assert(performance.now() - started < 3500)
    await controlClosed
    controlStall = false
  })
  await check('healthy HTTP readiness, legacy health, liveness and optional diagnostics', async () => {
    assert.equal((await get('/readyz')).status, 200)
    assert.equal((await get('/health')).status, 200)
    assert.equal((await get('/livez')).status, 200)
    const diagnostic = await get('/health/dependencies'); assert.equal(diagnostic.status, 503)
    assert.equal((await diagnostic.json()).dependencies.openNotebook, false)
    assert.equal((await get('/readyz')).status, 200)
  })
  await check('each required failure removes readiness, errors are sanitized, legacy control independence', async () => {
    for (const dependency of ['database', 'redis', 'control']) {
      dbFailure = dependency === 'database'; redisFailure = dependency === 'redis'; controlFailure = dependency === 'control'
      const ready = await get('/readyz'); assert.equal(ready.status, 503)
      const text = await ready.text(); assert(!text.includes('SECRET'))
      assert.equal((await get('/livez')).status, 200)
      assert.equal((await get('/health')).status, dependency === 'control' ? 200 : 503)
    }
    dbFailure = redisFailure = controlFailure = false
    assert.equal((await get('/readyz')).status, 200)
  })
  await check('concurrent and repeated timed-out HTTP probes reuse actual pending IO then recover', async () => {
    let unblock!: () => void
    blockedRedis = new Promise<void>((resolve) => { unblock = resolve })
    const before = { dbCalls, redisCalls, controlCalls }
    const responses = await Promise.all(Array.from({ length: 24 }, () => get('/readyz')))
    responses.forEach((r) => { assert.equal(r.status, 503) })
    assert.equal(redisCalls - before.redisCalls, 1)
    assert.equal(dbCalls - before.dbCalls, 1); assert.equal(controlCalls - before.controlCalls, 1)
    assert.equal((await get('/readyz')).status, 503)
    assert.equal(redisCalls - before.redisCalls, 1)
    unblock(); blockedRedis = undefined; await new Promise((resolve) => setImmediate(resolve))
    assert.equal((await get('/readyz')).status, 200)
  })
  await check('real Redis disconnect and real PG saturation remove traffic while liveness survives', async () => {
    redis.disconnect()
    assert.equal((await get('/readyz')).status, 503)
    await redis.connect()
    const held = await Promise.all(Array.from({ length: Number(process.env.DATABASE_POOL_MAX) }, () => pool.connect()))
    try {
      const replies = await Promise.all(Array.from({ length: 24 }, () => get('/readyz')))
      for (const reply of replies) assert.equal(reply.status, 503)
      assert.equal(pool.waitingCount, 1)
      assert.equal((await get('/livez')).status, 200)
    } finally { held.forEach((c) => { c.release() }) }
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal((await get('/readyz')).status, 200)
  })
  await check('pg Promise/callback acquire, reused transaction SQL, failed SQL and timed-out acquire metrics', async () => {
    resetForTesting()
    await pool.query('SELECT 1')
    const client = await pool.connect(); await client.query('SELECT 2'); client.release()
    await new Promise<void>((resolve, reject) => pool.connect((error, c, release) => {
      if (error) { reject(error); return }
      assert(c)
      c.query('SELECT 3', (queryError) => { release(); queryError ? reject(queryError) : resolve() })
    }))
    await assert.rejects(pool.query('SELECT missing_s153p_column'))
    const held = await Promise.all(Array.from({ length: Number(process.env.DATABASE_POOL_MAX) }, () => pool.connect()))
    try {
      await assert.rejects(pool.connect(), /timeout/)
      await new Promise<void>((resolve, reject) => pool.connect((error) => error ? resolve() : reject(new Error('expected acquire timeout'))))
    } finally { held.forEach((c) => { c.release() }) }
    const metrics = renderProm()
    assert.match(metrics, /^db_sql_submitted_total 4$/m)
    assert.match(metrics, /^db_pool_acquire_total\{status="error"\} 2$/m)
    for (const metric of ['db_pool_waiting', 'db_pool_active', 'process_heap_used_bytes', 'process_rss_bytes', 'process_event_loop_delay_max_seconds']) {
      assert.match(metrics, new RegExp(`^${metric} [0-9.e+-]+$`, 'm'))
    }
    assert(!metrics.includes('NaN')); assert(!metrics.includes('SECRET'))
  })
  // Exercise the standalone sampler against this foundation fixture. Its GET
  // endpoint performs one real SQL query; this is not a conversation benchmark.
  app.get('/work', async (_req, res) => { await pool.query('SELECT 1'); res.json({ ok: true }) })
  app.get('/metrics', (req, res) => {
    if (req.headers.authorization !== 'Bearer fixture-metrics-token') { res.sendStatus(401); return }
    res.type('text/plain').send(renderProm())
  })
  await check('repeatable idle / normal SQL HTTP / burst sampler artifacts', async () => {
    for (const phase of ['idle', 'normal', 'burst']) {
      const code = await new Promise<number>((resolve, reject) => {
        const child = spawn(process.execPath, ['scripts/issue-153/sample.mjs', '--base', url,
          '--path', '/work', '--metrics-path', '/metrics', '--phase', phase, '--seconds', '3',
          '--out', `scripts/issue-153/evidence/foundation-${phase}.json`], {
          env: { ...process.env, S153P_ISOLATED: '1', METRICS_BEARER_TOKEN: 'fixture-metrics-token' }, stdio: 'inherit',
        })
        child.on('error', reject); child.on('exit', (code) => resolve(code ?? 1))
      })
      assert.equal(code, 0)
    }
  })
  await mkdir('scripts/issue-153/evidence' , { recursive: true })
  await writeFile('scripts/issue-153/evidence/regression.json', JSON.stringify({
    status: 'passed', results, node: process.version, frozenDependencies: process.env.S153P_FROZEN_DEPENDENCIES === 'true',
    boundary: 'Foundation-only HTTP harness; real PG/Redis; scripted control and unavailable optional Notebook. Frozen full-product dependency gate recorded separately.',
  }, null, 2) + '\n')
} finally {
  api.closeAllConnections(); control.closeAllConnections()
  await Promise.all([new Promise<void>((r) => api.close(() => r())), new Promise<void>((r) => control.close(() => r()))])
  redis.disconnect(); await closeDatabasePools()
}
