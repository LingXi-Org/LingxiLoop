import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import express from 'express'

// Failure cases: a healthy R2 round-trip takes longer than three seconds;
// dependency failures are hidden; slow knowledge probes delay API liveness.
// Exercise the real HTTP router, provider, PostgreSQL and Redis. Only the
// external Open Notebook endpoint is a controlled HTTP fixture.
let api: Server, notebook: Server, base = ''
let notebookStatus = 200, notebookDelay = 0
let teardown: (server?: Server) => Promise<void>
const originalEnabled = process.env.OPEN_NOTEBOOK_ENABLED
const originalUrl = process.env.OPEN_NOTEBOOK_URL

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

before(async () => {
  notebook = createServer(async (req, res) => {
    assert.equal(req.url, '/readyz')
    await new Promise(resolve => setTimeout(resolve, notebookDelay))
    res.writeHead(notebookStatus, { 'content-type': 'application/json' })
    res.end(JSON.stringify(notebookStatus === 200 ? { status: 'ready' } : { detail: 'fixture unavailable' }))
  })
  process.env.OPEN_NOTEBOOK_URL = await listen(notebook)
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  const { ensureSchemaOnce, teardownAll } = await import('./_helpers.js')
  teardown = teardownAll
  await ensureSchemaOnce()
  const { platformRouter } = await import('../modules/platform/router.js')
  const app = express()
  app.use('/api', platformRouter)
  api = createServer(app)
  base = await listen(api)
})

after(async () => {
  if (api) await teardown(api)
  if (notebook) await new Promise<void>(resolve => notebook.close(() => resolve()))
  if (originalEnabled === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
  else process.env.OPEN_NOTEBOOK_ENABLED = originalEnabled
  if (originalUrl === undefined) delete process.env.OPEN_NOTEBOOK_URL
  else process.env.OPEN_NOTEBOOK_URL = originalUrl
})

test('a slow successful knowledge readiness probe stays healthy without delaying API liveness', { timeout: 12_000 }, async () => {
  notebookDelay = 3_500
  notebookStatus = 200
  const dependencyResponse = fetch(`${base}/api/health/dependencies`)
  const liveness = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2_000) })
  assert.equal(liveness.status, 200)
  const response = await dependencyResponse
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.ok(body && typeof body === 'object' && 'ok' in body && 'dependencies' in body)
  assert.equal(body.ok, true)
  assert.deepEqual(body.dependencies, { database: true, redis: true, openNotebook: true })
})

test('an unavailable knowledge dependency still reports 503', async () => {
  notebookDelay = 0
  notebookStatus = 503
  const response = await fetch(`${base}/api/health/dependencies`)
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.ok(body && typeof body === 'object' && 'ok' in body && 'dependencies' in body)
  assert.equal(body.ok, false)
  assert.deepEqual(body.dependencies, { database: true, redis: true, openNotebook: false })
})
