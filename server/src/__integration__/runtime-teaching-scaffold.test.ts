import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { loadRuntimeBinding } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { lingxiOSControl, startLingxiOSWorker, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { nativeText } from '../im/message-types.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Concrete failure: default course Milo bypasses homework scaffolding; an unsafe
// streamed draft reaches IM before final validation, or classification escapes
// the ledger / a repeated load's authorization after course access is revoked.
test('course Milo rejects unsafe drafts through the published Worker and preserves course authorization', { timeout: 60000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong(), originalFetch = globalThis.fetch
  const originalModel = env.OPENAI_MODEL, originalBase = env.OPENAI_BASE_URL
  env.OPENAI_MODEL = 'deepseek-ai/DeepSeek-V4.1-Flash'; env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1'
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  let extracts = 0, answers = 0
  const query = 'TCP流量控制和拥塞控制都是接收端来不及接收？'
  const nextStep = '先用你自己的判断回答上面这一步，我再据此继续。'
  const acceptedText = `先区分接收端缓冲和路径负载。你认为拥塞窗口主要反映哪一个？\n\n${nextStep}`
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => {
    extracts++
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ goal: 'reasoning', goalQuote: 'TCP', intent: 'check', attempts: [], fullDemonstrationQuote: '' }) } }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } }
  } } } }) as never)
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url !== `${env.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`) return originalFetch(input, init)
    const request = JSON.parse(String(init?.body))
    answers++
    assert.match(JSON.stringify(request.messages), /Current teaching action selected by the host/)
    assert.doesNotMatch(JSON.stringify(request.messages), /PRIVATE_OTHER_LEARNER/)
    assert.equal(request.enable_thinking, false)
    const content = JSON.stringify({ operation: { kind: 'append', supersedes: [] }, commentary: '',
      answer: answers === 1 ? 'WITHHELD_DRAFT：这是可以直接提交的整份答案。' : acceptedText,
      outcome: { status: 'satisfied', gaps: [] } })
    const nativeAnswer = request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'public_answer')
    const delta = nativeAnswer ? { tool_calls: [{ index: 0, id: `scaffold-answer-${answers}`, type: 'function', function: { name: 'public_answer', arguments: content } }] } : { role: 'assistant', content }
    if (request.stream) return new Response(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: nativeAnswer ? 'tool_calls' : 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 40 } })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
    return Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 40 } })
  }
  try {
    const { companyId, agentId } = await seedCompanyWithAgent()
    const projectId = 'scaffold-teaching-project', conversationId = 'scaffold-course-room', principalId = 'scaffold-student'
    for (const id of [principalId, 'scaffold-peer']) await seedUserMembership(id, companyId, { role: 'STUDENT', isAdmin: false })
    await pool.query(`INSERT INTO projects(id,company_id,kind,plan_id,name,status,created_by) VALUES($1,$2,'TEACHING','plan-education','Scaffold course','ACTIVE','test-owner')`, [projectId, companyId])
    for (const id of [principalId, 'scaffold-peer']) await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role,status) VALUES($1,$2,$3,'STUDENT','ACTIVE')`, [companyId, projectId, id])
    await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES('scaffold-course',$1,$2,'test-owner')`, [companyId, projectId])
    await pool.query(`UPDATE participants SET capabilities='["learning"]',preset_key='milo' WHERE company_id=$1 AND id=$2`, [companyId, agentId])
    const members = [principalId, 'scaffold-peer', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Shared course',$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    process.env.LINGXIOS_SERVICE_TOKEN = 'scaffold-isolated-integration-fixture-token'
    process.env.AGENT_OS_WORKER_PORT = '29093'
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
    const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
    process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
    worker = await startLingxiOSWorker()
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'scaffold-question', version: 1, author: { id: principalId, kind: 'human' }, text: query, mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const run = accepted.runs[0]; assert.ok(run); await bindProductRun(pool, run, conversationId)
    const timeout = AbortSignal.timeout(40000)
    let state = await api.readRunState(run)
    while (state && (['queued', 'leased', 'waiting'].includes(state.run.status) || state.delivery === 'pending')) {
      timeout.throwIfAborted(); await delay(50); state = await api.readRunState(run)
    }
    assert.equal(state?.run.status, 'failed', 'formal 3.8.24 treats final safety rejection as a publication failure')
    assert.match(state.run.error ?? '', /safely published/)
    const visible = im.messages.filter(message => message.channelId === conversationId && message.fromUid === agentId)
    assert.ok(visible.every(message => !nativeText(message.payload).includes('WITHHELD_DRAFT')), 'no rejected prefix reaches IM')
    assert.equal(answers, 1, 'do not claim a native repair that the published runtime does not perform')
    assert.equal(extracts, 1)
    const next = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId: 'scaffold-next-question', version: 1, author: { id: principalId, kind: 'human' }, text: query, mentions: [agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const nextRun = next.runs[0]; assert.ok(nextRun); await bindProductRun(pool, nextRun, conversationId)
    let nextState = await api.readRunState(nextRun)
    while (nextState && (['queued', 'leased', 'waiting'].includes(nextState.run.status) || nextState.delivery === 'pending')) {
      timeout.throwIfAborted(); await delay(50); nextState = await api.readRunState(nextRun)
    }
    assert.equal(nextState?.run.status, 'succeeded', nextState?.run.error ?? undefined)
    assert.equal(nextState.delivery, 'delivered')
    assert.ok(im.messages.some(message => message.channelId === conversationId && nativeText(message.payload).includes(nextStep)))
    assert.equal(answers, 2); assert.equal(extracts, 2, 'a new human request gets fresh extraction')
    const calls = (await pool.query(`SELECT purpose,status FROM llm_calls WHERE company_id=$1`, [companyId])).rows
    assert.equal(calls.filter(row => row.purpose === 'learning.teaching_stage' && row.status === 'succeeded').length, 2)
    const binding = { tenantId: companyId, principalId, agentId, conversationId }
    assert.equal((await loadRuntimeBinding(binding)).teachingProjectId, projectId)
    await pool.query(`UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id=$2 AND user_id=$3`, [companyId, projectId, principalId])
    await assert.rejects(loadRuntimeBinding(binding), 'cached pedagogy never authorizes revoked course membership')
  } finally {
    await worker?.stop(); __setLlmClientOverrideForTesting(null); globalThis.fetch = originalFetch
    await stopLingxiOSControl(); env.OPENAI_MODEL = originalModel; env.OPENAI_BASE_URL = originalBase
    await teardownAll(); await im.close()
  }
})
