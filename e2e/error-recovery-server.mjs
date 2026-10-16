// Disposable real API/worker fixture. Never reads developer credentials or resets
// a product database. Run after docker compose -f e2e/server/compose.yaml up -d --wait.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: '/tmp/lingxiloop-no-dotenv',
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_integration_test',
  REDIS_URL: 'redis://127.0.0.1:56379/0',
  OPENAI_API_KEY: 'integration-test-key', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5196',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret',
  WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1', AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1',
  AGENT_OS_MODEL_REQUEST_TIMEOUT_MS: '200', AGENT_OS_WORKER_PORT: '52995',
  LINGXIOS_SERVICE_TOKEN: 'error-recovery-integration-fixture-service-token', LINGXILOOP_DISABLE_EMBEDDINGS: '1',
})
const migrated = spawnSync(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'], { stdio: 'inherit' })
assert.equal(migrated.status, 0)
const { pool } = await import('../server/src/db/pool.ts')
const { env } = await import('../server/src/env.ts')
const { lingxiOSControl, startLingxiOSWorker } = await import('../server/src/agent-runtime/runtime.ts')
const { syncConversationPolicy } = await import('../server/src/agent-runtime/conversations.ts')
const { bindProductRun } = await import('../server/src/agent-runtime/identity.ts')
const { readRunProjection } = await import('../server/src/agent-runtime/assistant-transport.ts')
const { seedCompanyWithAgent, seedUserMembership, buildApiTestApp, teardownAll } = await import('../server/src/__integration__/_helpers.ts')
const { installRecordingWukong } = await import('../server/src/__integration__/_recording-wukong.ts')
const { createNativeMessage } = await import('../src/lib/nativeMessage.ts')
const im = await installRecordingWukong()
const provider = createServer(request => request.resume())
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
env.OPENAI_BASE_URL = `http://127.0.0.1:${provider.address().port}/v1`
const { companyId, projectId, agentId } = await seedCompanyWithAgent()
const userId = (await pool.query('SELECT created_by FROM projects WHERE id=$1', [projectId])).rows[0].created_by
const conversationId = `error-recovery-${Date.now()}`, members = [userId, agentId]
await seedUserMembership(userId, companyId)
await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','错误恢复验收',$4::jsonb)",
  [conversationId, companyId, projectId, JSON.stringify(members)])
await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
  [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
const controlPort = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${controlPort}`
const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
  messageId: 'error-question', version: 1, author: { id: userId, kind: 'human' }, text: '请回答这个问题。', mentions: [agentId] },
{ mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
const run = accepted.runs[0]; assert.ok(run)
await bindProductRun(pool, run, conversationId, false, 'error-question')
const queued = (await readRunProjection(api, run, true)).snapshot.message
const user = createNativeMessage({ id: 'error-question', role: 'user', content: [{ type: 'text', text: '请回答这个问题。' }] })
for (const [index, payload] of [user, queued].entries()) im.messages.push({ channelId: conversationId, channelType: 2,
  fromUid: index ? agentId : userId, payload, messageId: `recorded-${index + 1}`, messageSeq: index + 1,
  clientMsgNo: payload.id, timestamp: Date.parse(payload.createdAt) / 1000 })
const worker = await startLingxiOSWorker()
const deadline = AbortSignal.timeout(15_000)
while ((await api.readRunState(run))?.run.status !== 'failed') { deadline.throwIfAborted(); await delay(50) }
await worker.stop()
provider.closeAllConnections(); await new Promise(resolve => provider.close(resolve))
const app = await buildApiTestApp(userId), server = createServer(app)
await new Promise(resolve => server.listen(5197, '127.0.0.1', resolve))
await mkdir('.e2e/error-recovery', { recursive: true })
await writeFile('.e2e/error-recovery/fixture.json', JSON.stringify({ companyId, projectId, agentId, userId, conversationId, runId: run.runId }))
console.log('Error recovery API ready at http://127.0.0.1:5197 (real persisted failure, stale IM history).')
const stop = async () => { await teardownAll(server); await im.close(); process.exit(0) }
process.once('SIGTERM', stop); process.once('SIGINT', stop)
