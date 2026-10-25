import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import {
  createLingxiOS, createLogger, DefaultRuntimePolicy, releaseVersions,
  type PromptContext, type RunIdentity, type RuntimeFailureDiagnostic, type TurnContext, type WorkItem,
} from '@lyyzka/lingxios'
import { createWorker, type HostPort, type ModelDriver } from '@lyyzka/lingxios/worker'
import express from 'express'
import type { AuthedRequest } from '../auth.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { prepareLingxiOSWorkerContext } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { errorHandler } from '../http/errors.js'
import { companyAdminRouter } from '../modules/platform-operations/company-router.js'
import { adminRouter } from '../modules/platform-operations/router.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

// Failure model and controlled entry point: docs/evidence/issue-439/worker-failure.md.
// Real public Worker/control-plane and PostgreSQL. Only the two failure sites
// are overridden; no diagnostic event is inserted by the fixture.
let runtime: Awaited<ReturnType<typeof createLingxiOS>> | undefined
let reader: Awaited<ReturnType<typeof createLingxiOS>> | undefined
let worker: ReturnType<typeof createWorker> | undefined
let server: Server | undefined
let homesRoot: string | undefined
const originalFetch = globalThis.fetch
const priorHomesRoot = process.env.AGENT_OS_HOMES_ROOT
before(async () => {
  assert.equal(releaseVersions.runtime, '3.8.13', 'install the formally published, locked diagnostic runtime')
  // The fixture can only use its own loopback HTTP authorization boundary.
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    assert.ok(['127.0.0.1', '[::1]'].includes(url.hostname), 'diagnostic fixture cannot contact external services')
    return originalFetch(input, init)
  }
  await ensureSchemaOnce()
  await resetAllTables()
  homesRoot = await mkdtemp(join(tmpdir(), 'worker-failure-439-'))
  process.env.AGENT_OS_HOMES_ROOT = homesRoot
  // Platform HTTP readers use the real product control, with no background
  // delivery scheduler. The native job has no IM ingress or delivery adapter.
  prepareLingxiOSWorkerContext()
})
after(async () => {
  try {
    await worker?.stop()
    await runtime?.stop()
    await reader?.stop()
    await teardownAll(server)
  } finally {
    globalThis.fetch = originalFetch
    if (priorHomesRoot === undefined) delete process.env.AGENT_OS_HOMES_ROOT
    else process.env.AGENT_OS_HOMES_ROOT = priorHomesRoot
    if (homesRoot) await rm(homesRoot, { recursive: true, force: true })
  }
})

test('native Worker persists distinct restore and binding-save failures behind the platform boundary', { timeout: 30_000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const room = 'synthetic-worker-diagnostics', principalId = 'test-owner'
  const deploymentVersion = 'b'.repeat(40)
  const privateBody = 'PRIVATE_439_SYNTHETIC_ORIGINAL_BODY'
  const privateError = 'PRIVATE_439_SYNTHETIC_ERROR_AND_STACK'
  const serviceToken = 'PRIVATE_439_SYNTHETIC_SERVICE_TOKEN'
  const logs: string[] = []
  const claimed = new Map<string, WorkItem>()
  const bindingSaves = new Map<string, number>()
  let modelCalls = 0, loadedContexts = 0
  const logger = createLogger({ level: 'debug', sink: line => logs.push(line) })
  const failure = (work: WorkItem) => Object.assign(
    new TypeError(`${privateError} ${privateBody} ${serviceToken} ${work.leaseToken}`),
    { code: '42P01', detail: privateBody, cause: new Error(privateError) },
  )
  runtime = await createLingxiOS({ database: pool, homesRoot, logger, background: { role: 'passive' },
    contextProvider: { async loadContext(work) {
      loadedContexts++
      const persona = { name: 'Synthetic diagnostic agent', role: 'test', instructions: 'Synthetic internal qualification only.' }
      return { persona, capabilities: [], messages: [{ ref: work.triggerRef, authorId: principalId,
        authorName: 'Synthetic principal', authorKind: 'human' as const, body: privateBody, createdAt: work.createdAt ?? '' }],
      promptContextCandidate: { version: 3, epoch: 0, assembledAt: '', systemInstructions: '', persona,
        capabilities: [], sourceVersions: { persona: 'synthetic-worker-diagnostic-v1' } } }
    } } })
  const api = runtime
  const syntheticModel: ModelDriver = {
    modelId: 'synthetic-worker-diagnostic-never-called',
    async run() { modelCalls++; throw new Error('diagnostic fixture reached the model') },
    async compact() { modelCalls++; throw new Error('diagnostic fixture reached compaction') },
    async structured() { modelCalls++; throw new Error('diagnostic fixture reached auxiliary review') },
  }
  class RestoreFailurePolicy extends DefaultRuntimePolicy {
    override productRules(candidate: PromptContext, context: TurnContext): string {
      if (context.work.id === 'worker-diagnostic-restore') throw failure(context.work)
      return super.productRules(candidate, context)
    }
  }
  worker = createWorker({ deploymentVersion, logger, controlPlane: { connectWorker(input) {
    const host = api.connectWorker(input)
    const controlled: HostPort = { ...host,
      async claimWork(...args) {
        const work = await host.claimWork(...args)
        if (work) claimed.set(work.id, work)
        return work
      },
      async saveStep(work, step, signal) {
        if (step.kind === 'runtime.binding') {
          bindingSaves.set(work.id, (bindingSaves.get(work.id) ?? 0) + 1)
          if (work.id === 'worker-diagnostic-binding' && bindingSaves.get(work.id) === 1) throw failure(work)
        }
        return host.saveStep(work, step, signal)
      },
    }
    return controlled
  } }, kernel: { homesRoot }, worker: { id: 'worker-diagnostic-439', concurrency: 1 },
  policy: new RestoreFailurePolicy(), model: syntheticModel })

  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'direct','Synthetic diagnostic authorization',$4::jsonb)`,
  [room, companyId, projectId, JSON.stringify([principalId, agentId])])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [room, companyId, JSON.stringify({ channelType: 2, kind: 'direct', projectId, members: [principalId, agentId] })])

  const identities: RunIdentity[] = []
  for (const runId of ['worker-diagnostic-restore', 'worker-diagnostic-binding']) {
    const identity = { runId, tenantId: companyId, agentId, principalId, sessionId: `session-${runId}` }
    identities.push(identity)
    // Native internal operation, with a synthetic product read binding solely
    // to exercise the existing company-admin detail redaction boundary.
    await api.enqueueJob({ ...identity, id: runId, text: privateBody, kind: 'turn', lane: 'background',
      executionClass: 'operation', mode: 'chat', codeExecution: 'disabled', meta: { conversationId: room } })
    await bindProductRun(pool, identity, room)
    assert.equal(await worker.runNext(), true)
    assert.equal((await api.readRun(identity))?.status, 'failed')
    assert.equal((await api.readRun(identity))?.resultId, null)
  }
  assert.equal(loadedContexts, 2, 'both failures occur after successful input loading')
  assert.equal(modelCalls, 0)
  assert.equal(bindingSaves.get(identities[0].runId) ?? 0, 0)
  assert.equal(bindingSaves.get(identities[1].runId), 1, 'bounded injection fails exactly one binding-save attempt')
  await worker.stop(); worker = undefined
  await api.stop(); runtime = undefined

  // A new formal control instance must recover the diagnostic from PostgreSQL.
  reader = await createLingxiOS({ database: pool, homesRoot, logger, background: { role: 'passive' } })
  const diagnosticByRun = new Map<string, RuntimeFailureDiagnostic>()
  const secrets = [privateBody, privateError, serviceToken, ...[...claimed.values()].map(work => work.leaseToken)]
  const assertPrivate = (value: unknown) => {
    const serialized = JSON.stringify(value)
    for (const secret of secrets) assert.equal(serialized.includes(secret), false, 'raw body, stack and credentials must remain private')
  }
  for (const [index, identity] of identities.entries()) {
    const diagnostics = await reader.readDiagnostics(identity)
    const diagnostic = diagnostics?.runtimeFailure
    assert.ok(diagnostic)
    diagnosticByRun.set(identity.runId, diagnostic)
    assert.equal(diagnostic.schemaVersion, 1)
    assert.match(diagnostic.correlationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    assert.equal(diagnostic.runId, identity.runId)
    assert.equal(diagnostic.requestVersion, 1)
    assert.equal(diagnostic.fence, claimed.get(identity.runId)?.fence)
    assert.equal(diagnostic.runtimeVersion, releaseVersions.runtime)
    assert.equal(diagnostic.deploymentVersion, deploymentVersion)
    assert.equal(diagnostic.phase, index === 0 ? 'session_restore' : 'binding_save')
    assert.equal(diagnostic.bindingState, index === 0 ? 'not_started' : 'saving')
    assert.equal(diagnostic.errorName, 'TypeError')
    assert.equal(diagnostic.sqlState, '42P01')
    assert.equal(diagnostic.reason, 'native_rejected')
    assert.equal(diagnostic.category, 'unknown')
    assert.equal(diagnostic.retryable, false)
    assert.ok(diagnostic.frames.length > 0)
    for (const frame of diagnostic.frames) {
      assert.match(frame.module, /^[a-z-]+\/[a-z0-9-]+\.[jt]s$/)
      assert.ok(Number.isInteger(frame.line) && frame.line > 0)
      if (frame.column !== undefined) assert.ok(Number.isInteger(frame.column) && frame.column > 0)
    }
    for (const key of ['message', 'stack', 'rawStack', 'detail', 'cause']) assert.equal(Object.hasOwn(diagnostic, key), false)
    assertPrivate(diagnostics)
    const events = await reader.readEvents(identity)
    assert.ok(events.events.every(event => event.visibility === 'user'))
    assert.ok(events.events.every(event => !['runtime.failure', 'input.loaded'].includes(event.kind)))
    assert.equal(JSON.stringify(events).includes(diagnostic.correlationId), false)
    assertPrivate(events)
    const persisted = (await pool.query<{ seq: string; kind: string; visibility: string; data: unknown }>(
      `SELECT seq,kind,visibility,data FROM lingxios.agent_run_events
        WHERE run_id=$1 AND kind IN ('input.loaded','runtime.failure') ORDER BY seq`, [identity.runId])).rows
    assert.deepEqual(persisted.map(event => [event.kind, event.visibility]), [['input.loaded', 'internal'], ['runtime.failure', 'internal']])
    assert.ok(Number(persisted[0].seq) < Number(persisted[1].seq))
    assertPrivate(persisted)
    assert.equal((await pool.query(`SELECT 1 FROM lingxios.agent_steps WHERE work_id=$1 AND kind='runtime.binding'`, [identity.runId])).rowCount, 0)
  }
  assert.equal(new Set([...diagnosticByRun.values()].map(diagnostic => diagnostic.correlationId)).size, 2)
  assertPrivate(logs)

  const app = express()
  app.use((req, _res, next) => {
    const request = req as typeof req & AuthedRequest
    request.authUserId = principalId
    request.gatewayAuthenticated = true
    request.gatewayPlatformAdmin = req.headers['x-test-platform'] === 'true'
    next()
  })
  app.use('/platform', adminRouter); app.use('/company', companyAdminRouter); app.use(errorHandler)
  server = createServer(app)
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  for (const identity of identities) {
    const runPath = encodeURIComponent(identity.runId), diagnostic = diagnosticByRun.get(identity.runId)!
    assert.equal((await fetch(`${base}/platform/resources/agent-runs/${runPath}`)).status, 401)
    for (const path of [`/platform/resources/agent-runs/${runPath}`, `/platform/agent-runs/${runPath}/operations`]) {
      const response = await fetch(`${base}${path}`, { headers: { 'x-test-platform': 'true' } })
      assert.equal(response.status, 200)
      const body = await response.json() as { workerFailure: RuntimeFailureDiagnostic }
      assert.deepEqual(body.workerFailure, diagnostic)
      assertPrivate(body)
    }
    const content = await fetch(`${base}/platform/resources/agent-runs/${runPath}/content/workerFailure`, { headers: { 'x-test-platform': 'true' } })
    assert.equal(content.status, 200)
    assert.deepEqual(JSON.parse((await content.json() as { data: string }).data), diagnostic)
    const company = await fetch(`${base}/company/resources/agent-runs/${runPath}`)
    assert.equal(company.status, 200)
    const companyBody = await company.json() as { diagnostics: Record<string, unknown> }
    assert.equal(Object.hasOwn(companyBody, 'workerFailure'), false)
    assert.equal(Object.hasOwn(companyBody.diagnostics, 'runtimeFailure'), false)
    assert.equal(JSON.stringify(companyBody).includes(diagnostic.correlationId), false)
    assertPrivate(companyBody)
    assert.equal((await fetch(`${base}/company/resources/agent-runs/${runPath}/content/workerFailure`)).status, 404)
    const companyDiagnostics = await fetch(`${base}/company/resources/agent-runs/${runPath}/content/diagnostics`)
    assert.equal(companyDiagnostics.status, 200)
    const companyContent = await companyDiagnostics.json()
    assert.equal(JSON.stringify(companyContent).includes(diagnostic.correlationId), false)
    assertPrivate(companyContent)
  }
  assert.equal(modelCalls, 0)
  assert.equal((await pool.query('SELECT 1 FROM im_send_acceptances WHERE company_id=$1', [companyId])).rowCount, 0)
})
