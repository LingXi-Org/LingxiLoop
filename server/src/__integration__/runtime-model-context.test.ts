import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions } from '@lyyzka/lingxios'
import { DEFAULT_AGENT_CAPABILITIES } from '../../../src/lib/agentCapabilities.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { nativeText } from '../im/message-types.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failures: fixed product context alone exceeds the old 128K window; retained
// multilingual history cannot fit; repeated compaction loses a prior fact; delivery
// duplicates; completed summaries disappear; calls escape the shared ledger.
// Auxiliary SSE must use JSON/compaction content, not the ordinary streamed-answer fixture.
test('production GLM worker preserves conversation continuity across repeated compaction', { timeout: 480000 }, async () => {
  const live = process.env.LINGXIOS_LIVE_CONTEXT === '1'
  if (live) {
    assert.equal(env.OPENAI_MODEL, 'zai-org/GLM-5.3-Flash')
    assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
  }
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong(), originalFetch = globalThis.fetch
  const originalModel = env.OPENAI_MODEL, originalBaseUrl = env.OPENAI_BASE_URL
  env.OPENAI_MODEL = 'zai-org/GLM-5.3-Flash'; env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1'
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  const requests: { bytes: number; stream: boolean; purpose: 'agent-turn' | 'structured' | 'compaction' }[] = [], results: { status: string; delivered: boolean }[] = []
  const checkpoints: { epoch: number; historyBytes: number }[] = []
  const turnIds = ['initial', 'followup', ...Array.from({ length: live ? 6 : 24 }, (_, index) => `soak-${index}`)]
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url !== 'https://api.siliconflow.cn/v1/chat/completions') return originalFetch(input, init)
    const body = String(init?.body), request = JSON.parse(body)
    assert.equal(request.model, 'zai-org/GLM-5.3-Flash')
    assert.equal(request.enable_thinking, false)
    assert.equal(request.reasoning_effort, 'low')
    const auxiliary = request.response_format?.type === 'json_object'
    const compacting = auxiliary && String(request.messages[0]?.content).includes('observedResults')
    const purpose = compacting ? 'compaction' : auxiliary ? 'structured' : 'agent-turn'
    requests.push({ bytes: Buffer.byteLength(body), stream: request.stream === true, purpose })
    if (live) return originalFetch(input, init)
    const usage = { prompt_tokens: 30000, completion_tokens: 20 }
    if (!auxiliary) assert.match(JSON.stringify(request.messages), /蓝宝石47/, 'prior fact must reach every generation')
    if (compacting) assert.match(JSON.stringify(request.messages), /蓝宝石47/, 'summary must be grounded in the preceding context')
    const content = auxiliary ? JSON.stringify(compacting
      ? { observedResults: '用户的项目名称是蓝宝石47。', decisions: '', remainingWork: '', uncertainties: '' } : { missing: [] })
      : '已收到，蓝宝石47。'
    if (request.stream) {
      return new Response(`data: ${JSON.stringify({ choices: [{ index: 0,
        delta: { role: 'assistant', content }, finish_reason: 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`,
      { headers: { 'content-type': 'text/event-stream' } })
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage })
  }
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    await pool.query('UPDATE participants SET capabilities=$1,system_prompt=$2 WHERE company_id=$3 AND id=$4',
      [JSON.stringify(DEFAULT_AGENT_CAPABILITIES), '只需按当前用户的要求直接回复。\n' + '这是合成的课程背景资料，不是本轮任务。\n'.repeat(2500), companyId, agentId])
    const conversationId = 'model-context-room', members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Context regression',$4::jsonb)`,
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    process.env.LINGXIOS_SERVICE_TOKEN = 'model-context-isolated-service-token'
    // Dedicated fixture port; 52992 can collide with ephemeral listeners.
    process.env.AGENT_OS_WORKER_PORT = '29092'
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
    const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
    process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
    worker = await startLingxiOSWorker()
    for (const messageId of turnIds) {
      const text = messageId === 'initial' ? '请记住我们的项目名称是「蓝宝石47」。这一轮只回复：已收到。'
        : messageId === 'followup' ? '请只回复：已收到。' : '我之前说的项目名称是什么？只回复该项目名称。'
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId, version: 1, author: { id: 'test-owner', kind: 'human' }, text, mentions: [agentId] },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
      const timeout = AbortSignal.timeout(live ? 100000 : 15000)
      let state = await api.readRunState(run)
      while (state && (['queued', 'leased', 'waiting'].includes(state.run.status) || state.delivery === 'pending')) {
        timeout.throwIfAborted(); await delay(50); state = await api.readRunState(run)
      }
      assert.equal(state?.run.status, 'succeeded', state?.run.error ?? undefined)
      assert.equal(state.delivery, 'delivered')
      results.push({ status: state.run.status, delivered: true })
      const persisted = (await pool.query(`SELECT compaction_epoch,history FROM lingxios.agent_os_sessions
        WHERE tenant_id=$1 AND agent_id=$2 AND session_id=$3`, [companyId, agentId, run.sessionId])).rows[0]
      assert.ok(persisted)
      checkpoints.push({ epoch: persisted.compaction_epoch, historyBytes: Buffer.byteLength(JSON.stringify(persisted.history)) })
      if (!live && messageId === 'followup') assert.ok(persisted.compaction_epoch > 0, 'short histories must compact before exhaustion')
      if (messageId !== turnIds.at(-1)) {
        const history = [{ role: 'user', content: '历史讨论：可靠传输与保密性是不同概念。\n'.repeat(3500) }]
        const updated = await pool.query(`UPDATE lingxios.agent_os_sessions SET history=history || $1::jsonb,revision=revision+1
          WHERE tenant_id=$2 AND agent_id=$3 AND session_id=$4`, [JSON.stringify(history), companyId, agentId, run.sessionId])
        assert.equal(updated.rowCount, 1)
      }
    }
    await worker.stop(); worker = undefined
    const messages = im.messages.filter(message => message.channelId === conversationId && message.fromUid === agentId)
    assert.equal(messages.length, turnIds.length)
    assert.ok(messages.slice(0, 2).every(message => /已收到/.test(nativeText(message.payload))))
    assert.ok(messages.slice(2).every(message => /蓝宝石47/.test(nativeText(message.payload))))
    assert.ok(requests.some(request => request.purpose === 'agent-turn' && request.bytes > 128000), 'must exercise the former hard context limit')
    assert.ok(requests.every(request => request.stream), 'ordinary, structured and compaction calls must use the configured streaming transport')
    assert.ok(requests.some(request => request.purpose === 'structured'))
    assert.ok(requests.filter(request => request.purpose === 'compaction').length >= 2)
    const calls = (await pool.query(`SELECT purpose,status,measured,input_tokens,error FROM llm_calls WHERE company_id=$1 ORDER BY created_at`, [companyId])).rows
    assert.equal(calls.length, requests.length)
    assert.ok(calls.every(call => call.status === 'succeeded' && call.measured
      || call.purpose === 'lingxios.compaction' && call.status === 'failed' && call.error === 'compaction candidate no longer needed'))
    assert.ok(calls.filter(call => call.purpose === 'lingxios.compaction' && call.status === 'succeeded').length >= 2)
    assert.ok(checkpoints.at(-1)!.epoch >= 2)
    assert.ok(checkpoints.every(checkpoint => checkpoint.historyBytes < 900000))
    await mkdir('artifacts/reply-generation', { recursive: true })
    await writeFile(`artifacts/reply-generation/${live ? 'live' : 'scripted'}.json`, JSON.stringify({ passed: true,
      runtime: releaseVersions.runtime, model: env.OPENAI_MODEL, realProvider: live, results, requests, calls, checkpoints,
      continuityFactPreserved: true, deliveredOncePerTurn: true, thinkingDisabledRequested: true, transport: 'recording WuKong fixture',
      reproduce: `node e2e/server/model-context.mjs${live ? ' --live-model-context' : ''}` }, null, 2))
  } catch (error) {
    await mkdir('artifacts/reply-generation', { recursive: true })
    await writeFile(`artifacts/reply-generation/${live ? 'live' : 'scripted'}.json`, JSON.stringify({ passed: false,
      runtime: releaseVersions.runtime, model: env.OPENAI_MODEL, realProvider: live, results, requests, checkpoints,
      error: error instanceof Error ? error.message : String(error),
      replies: im.messages.filter(message => message.channelId === 'model-context-room' && message.payload.role === 'assistant')
        .map(message => nativeText(message.payload)),
      reproduce: `node e2e/server/model-context.mjs${live ? ' --live-model-context' : ''}` }, null, 2))
    throw error
  } finally {
    await worker?.stop(); await teardownAll(); await im.close()
    globalThis.fetch = originalFetch; env.OPENAI_MODEL = originalModel; env.OPENAI_BASE_URL = originalBaseUrl
  }
})
