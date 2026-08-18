/**
 * Integration test: GET /api/metrics
 *
 * The endpoint is gated by METRICS_BEARER_TOKEN and reads it from
 * process.env at request time, so we can toggle the gate per-test by
 * mutating the env between calls.
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import {
  buildApiTestApp, ensureSchemaOnce, resetAllTables, teardownAll,
} from './_helpers.js'

const ME_USER_ID = 'u-test-metrics'
const TEST_TOKEN = 'integration-metrics-token-XYZ'
let server: Server
let baseUrl = ''
let origToken: string | undefined

before(async () => {
  await ensureSchemaOnce()
  origToken = process.env.METRICS_BEARER_TOKEN
  const app = await buildApiTestApp(ME_USER_ID)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
})

after(async () => {
  if (origToken === undefined) delete process.env.METRICS_BEARER_TOKEN
  else process.env.METRICS_BEARER_TOKEN = origToken
  await teardownAll(server)
})

test('[integration] /metrics is 404 when METRICS_BEARER_TOKEN is unset', async () => {
  delete process.env.METRICS_BEARER_TOKEN
  const res = await fetch(`${baseUrl}/api/metrics`)
  assert.equal(res.status, 404)
})

test('[integration] /metrics is 401 with a wrong token', async () => {
  process.env.METRICS_BEARER_TOKEN = TEST_TOKEN
  const res = await fetch(`${baseUrl}/api/metrics?token=wrong-token`)
  assert.equal(res.status, 401)
})

test('[integration] /metrics is 401 when no token is supplied but one is required', async () => {
  process.env.METRICS_BEARER_TOKEN = TEST_TOKEN
  const res = await fetch(`${baseUrl}/api/metrics`)
  assert.equal(res.status, 401)
})

test('[integration] /metrics returns Prom text exposition with the token in the query', async () => {
  process.env.METRICS_BEARER_TOKEN = TEST_TOKEN
  const res = await fetch(`${baseUrl}/api/metrics?token=${encodeURIComponent(TEST_TOKEN)}`)
  assert.equal(res.status, 200)
  const ct = res.headers.get('content-type') ?? ''
  assert.ok(ct.startsWith('text/plain'), `expected text/plain content-type, got: ${ct}`)
  const body = await res.text()
  // Counters registered in metrics.ts must show up with HELP + TYPE
  // headers even if they're at zero.
  assert.match(body, /# TYPE email_send_ok counter/)
  assert.match(body, /# TYPE email_retry_terminal counter/)
  assert.match(body, /# TYPE email_inbound_delivered counter/)
})

test('[integration] /metrics accepts the token via Authorization: Bearer header', async () => {
  process.env.METRICS_BEARER_TOKEN = TEST_TOKEN
  const res = await fetch(`${baseUrl}/api/metrics`, {
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
  })
  assert.equal(res.status, 200)
})
