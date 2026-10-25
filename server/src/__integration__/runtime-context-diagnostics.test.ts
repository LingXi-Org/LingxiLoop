import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import { createLingxiOS, createLogger } from '@lyyzka/lingxios'
import express from 'express'
import type { AuthedRequest } from '../auth.js'
import { createContextDiagnosticsLogger } from '../agent-runtime/context-diagnostics.js'
import { readContextFailures, recordContextFailure } from '../agent-runtime/context-diagnostic-store.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { pool } from '../db/pool.js'
import { errorHandler } from '../http/errors.js'
import { companyAdminRouter } from '../modules/platform-operations/company-router.js'
import { adminRouter } from '../modules/platform-operations/router.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

let runtime: Awaited<ReturnType<typeof createLingxiOS>> | undefined
let server: Server | undefined
before(async () => { await ensureSchemaOnce(); await resetAllTables() })
after(async () => { await runtime?.stop(); await teardownAll(server) })

test('a real context HTTP failure persists bounded diagnostics only for platform operators', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const identity = { runId: `im:${'a'.repeat(64)}`, tenantId: companyId, agentId,
    principalId: 'test-owner', sessionId: 'context-diagnostic-session' }
  const room = 'context-diagnostic-room', serviceToken = 'synthetic-context-service-token'
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'direct','Synthetic diagnostics',$4::jsonb)`,
  [room, companyId, projectId, JSON.stringify([identity.principalId, agentId])])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [room, companyId, JSON.stringify({ channelType: 2, kind: 'direct', projectId, members: [identity.principalId, agentId] })])
  const logs: string[] = []
  const diagnostics = createContextDiagnosticsLogger({ logger: createLogger({ sink: line => logs.push(line) }),
    record: diagnostic => recordContextFailure(pool, diagnostic), serviceCommit: 'b'.repeat(40) })
  const privateMarker = 'synthetic-private-body-and-credential'
  runtime = await createLingxiOS({ database: pool, background: { role: 'passive' }, logger: diagnostics.logger,
    contextProvider: { async loadContext() {
      const error = Object.assign(new Error(privateMarker), { code: '42P01', detail: privateMarker })
      error.stack = `Error: ${privateMarker}\n    at loadContext (${new URL('../agent-runtime/context.ts', import.meta.url).href}:123:9)`
      throw error
    } } })
  await runtime.enqueueJob({ ...identity, id: identity.runId, text: 'Synthetic diagnostic request', kind: 'turn',
    lane: 'interactive', meta: { conversationId: room } })
  await bindProductRun(pool, identity, room)
  const work = await runtime.connectWorker({ workerId: 'context-diagnostic-fixture', workKinds: ['turn'] }).claimWork()
  assert.ok(work)
  const port = await runtime.listenControlPlane({ serviceToken, port: 0, host: '127.0.0.1' })
  const url = new URL(`http://127.0.0.1:${port}/v5/work/${encodeURIComponent(identity.runId)}/context`)
  url.search = new URLSearchParams({ fence: String(work.fence), leaseToken: work.leaseToken, includeSession: 'true' }).toString()
  const response = await fetch(url, { headers: { authorization: `Bearer ${serviceToken}` } })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'internal error' })
  await diagnostics.flush()

  const stored = await readContextFailures(pool, identity)
  assert.equal(stored.length, 1)
  assert.equal(stored[0].runId, identity.runId)
  assert.equal(stored[0].stage, 'context_load')
  assert.equal(stored[0].sqlState, '42P01')
  assert.equal(stored[0].serviceCommit, 'b'.repeat(40))
  assert.equal(stored[0].frames[0]?.module, 'server/agent-runtime/context.ts')
  const persisted = (await pool.query(`SELECT user_id,company_id,detail FROM audit_events
    WHERE kind='agent_runtime.context_failed'`)).rows
  assert.equal(persisted[0].company_id, companyId)
  assert.equal(persisted[0].user_id, identity.principalId)
  for (const secret of [privateMarker, serviceToken, work.leaseToken]) {
    assert.equal(JSON.stringify(persisted).includes(secret), false)
    assert.equal(logs.join('\n').includes(secret), false)
  }
  assert.deepEqual(await readContextFailures(pool, { ...identity, tenantId: 'another-company' }), [])
  assert.deepEqual(await readContextFailures(pool, { ...identity, sessionId: 'another-session' }), [])

  const app = express()
  app.use((req, _res, next) => {
    const request = req as typeof req & AuthedRequest
    request.authUserId = identity.principalId
    request.gatewayAuthenticated = true
    request.gatewayPlatformAdmin = req.headers['x-test-platform'] === 'true'
    next()
  })
  app.use('/platform', adminRouter); app.use('/company', companyAdminRouter); app.use(errorHandler)
  server = createServer(app)
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`, runPath = encodeURIComponent(identity.runId)
  assert.equal((await fetch(`${base}/platform/agent-runs/${runPath}/operations`)).status, 401)
  const detail = await fetch(`${base}/platform/resources/agent-runs/${runPath}`, { headers: { 'x-test-platform': 'true' } })
  assert.equal(detail.status, 200)
  assert.equal((await detail.json() as { contextFailures: typeof stored }).contextFailures[0].correlationId, stored[0].correlationId)
  const operations = await fetch(`${base}/platform/agent-runs/${runPath}/operations`, { headers: { 'x-test-platform': 'true' } })
  assert.equal(operations.status, 200)
  assert.equal((await operations.json() as { contextFailures: typeof stored }).contextFailures[0].correlationId, stored[0].correlationId)
  const company = await fetch(`${base}/company/resources/agent-runs/${runPath}`)
  assert.equal(company.status, 200)
  assert.equal('contextFailures' in (await company.json() as Record<string, unknown>), false)
  assert.equal((await fetch(`${base}/company/resources/audit-events`)).status, 404)
})
