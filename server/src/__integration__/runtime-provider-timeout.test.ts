import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { lingxiOSControl, runtimeModelConfiguration, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { installProductionModelTransport } from './_production-model-transport.js'

const acceptanceOutput = process.env.RUNTIME_ACCEPTANCE_OUTPUT_DIR || `.e2e/runtime-acceptance/${Date.now()}-${process.pid}`

test('a nonresponsive provider stops after bounded attempts and settles failed calls', { timeout: 30000 }, async t => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  let attempts = 0, disconnected = 0
  const provider = createServer((request, response) => {
    attempts++
    request.resume()
    response.on('close', () => { disconnected++ })
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address(); assert.ok(address && typeof address !== 'string')
  const transport = installProductionModelTransport(env, `http://127.0.0.1:${address.port}/v1`)
  t.after(() => transport.restore())
  assert.equal(runtimeModelConfiguration({ id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL }, 200).contextWindowTokens, 1_000_000)
  process.env.AGENT_OS_MODEL_REQUEST_TIMEOUT_MS = '200'
  process.env.LINGXIOS_SERVICE_TOKEN = 'provider-timeout-integration-service-token'
  process.env.AGENT_OS_WORKER_PORT = '52995'
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    const conversationId = 'provider-timeout-room', members = ['test-owner', agentId]
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Timeout',$4::jsonb)",
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
    const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
    process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
    const result = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'timeout-question', version: 1, author: { id: 'test-owner', kind: 'human' }, text: '请直接回答。', mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const run = result.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
    worker = await startLingxiOSWorker()
    const started = Date.now(), deadline = AbortSignal.timeout(5000)
    let state = await api.readRunState(run)
    while (state && ['queued', 'leased', 'waiting'].includes(state.run.status)) {
      deadline.throwIfAborted(); await delay(20); state = await api.readRunState(run)
    }
    const elapsedMs = Date.now() - started
    assert.equal(state?.run.status, 'failed')
    assert.equal(attempts, 3)
    assert.equal(transport.requests, attempts, 'Every model attempt must reach only the local timeout stub')
    assert.equal(disconnected, attempts, 'timed-out requests must release their connections')
    let calls = await pool.query('SELECT status FROM llm_calls WHERE run_id=$1', [run.runId])
    while (calls.rows.length < attempts) { deadline.throwIfAborted(); await delay(20); calls = await pool.query('SELECT status FROM llm_calls WHERE run_id=$1', [run.runId]) }
    assert.deepEqual(calls.rows.map(row => row.status), ['failed', 'failed', 'failed'])
    while ((await api.readTerminal(run))?.delivery !== 'delivered') { deadline.throwIfAborted(); await delay(20) }
    assert.equal((await api.readTerminal(run))?.feedback.reason,'model_unavailable')
    const notices = im.messages.filter(message => message.channelId === conversationId)
    assert.equal(notices.length,1)
    assert.equal(notices[0]?.payload.role,'system')
    assert.equal(notices[0]?.payload.metadata.custom.suppressAgentWake,true)
    await mkdir(acceptanceOutput, { recursive: true })
    await writeFile(`${acceptanceOutput}/provider-timeout.json`, JSON.stringify({ elapsedMs, attempts, disconnected, status: state.run.status, ledgerSettled: true }), { flag: 'wx' })
  } finally {
    provider.closeAllConnections()
    await worker?.stop(); await teardownAll(); await im.close()
    await new Promise<void>(resolve => provider.close(() => resolve()))
    transport.restore()
    delete process.env.AGENT_OS_MODEL_REQUEST_TIMEOUT_MS
  }
})
