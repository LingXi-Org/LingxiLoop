import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createHmac } from 'node:crypto'
import { createLingxiOS, type ActionContext, type WorkItem } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { createProductContext } from '../agent-runtime/context.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { createMessageTools } from '../im/agent-tools.js'
import { lingxiOSControl, prepareLingxiOSWorkerContext, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { flushAgentWakes } from '../agent-runtime/ingress.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { getQuestionnaireState, submitQuestionnaire } from '../im/questionnaires.js'
import { ImMessagesApplication } from '../im/messages-application.js'
import { createImMessagesApplication } from '../im/messages-facade.js'
import { createNativeMessage } from '../im/message-types.js'
import { wukongWebhookRouter } from '../im/webhook.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model, recorded before implementation:
// - Each model retry creates another actionable questionnaire because action keys differ.
// - A successful send is treated as a successful input collection and advances the model.
// - A public native-tool defer directive stops the worker but cannot persist waiting state.
// - A refresh/reconnect or retry can then repeat the question or bypass the required input.
// Follow-up submission coverage must also reject foreign/stale nodes, invalid/missing answers,
// uncommitted messages and changed replay payloads, and resume a matching committed answer once.
let im: Awaited<ReturnType<typeof installRecordingWukong>>
let server: Server, baseUrl: string
before(async () => {
  await ensureSchemaOnce(); prepareLingxiOSWorkerContext(); im = await installRecordingWukong()
  const app = await buildApiTestApp('test-owner'); app.use('/webhooks/wukong', wukongWebhookRouter)
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object'); baseUrl = `http://127.0.0.1:${address.port}`
})
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll(server); await im?.close() })

for (const mode of ['current-product', 'public-defer', 'builtin-control', 'early-submit', 'crash-before-send', 'crash-after-send'] as const) {
  const publicDefer = mode === 'public-defer', builtin = mode === 'builtin-control'
  const product = mode !== 'public-defer' && mode !== 'builtin-control'
  const title = builtin ? 'built-in task.ask can persist and resume its own input wait exactly once'
    : publicDefer ? 'published native defer persists a questionnaire input wait' : mode === 'early-submit'
      ? 'an answer committed before wait retries the original threaded run without dispatching a new run'
      : mode.startsWith('crash-') ? `durable submission recovery survives ${mode}` : 'chat.ask parks after one questionnaire without another model turn'
  test(title, async t => {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    const conversationId = `questionnaire-${mode}`, members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Questionnaire',$4::jsonb)`,
      [conversationId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
    const question = { title: '第三讲子网划分 — 先确认两件事', items: [
      { name: 'materials', prompt: '有课程资料吗？', required: true, choices: [{ value: 'yes', label: '有' }, { value: 'no', label: '没有' }] },
      { name: 'difficulty', prompt: '薄弱环节是什么？', required: true, choices: [{ value: 'principles', label: '原理' }, { value: 'practice', label: '解题' }] },
      { name: 'notes', prompt: '补充说明', input: { label: '说明' } },
    ] }
    const tools = createMessageTools(() => application).filter(tool => tool.action === 'chat.ask').map(tool => publicDefer ? {
      ...tool, async execute(...args: Parameters<typeof tool.execute>) {
        // Exercise only the published ActionResult contract; no runtime internals or SQL writes.
        const result = await tool.execute(...args)
        return { ...result, directive: { type: 'defer' as const, reason: 'user', data: { question: question.title } } }
      },
    } : tool)
    const application: ReturnType<typeof createLingxiOS> = product ? lingxiOSControl() : createLingxiOS({ database: pool, tools, ...createProductContext(tools), responsePolicy: 'deep', background: { role: 'passive' } })
    const api = await application
    let modelCalls = 0
    const waitErrors: string[] = []
    const usage = { available: true, inputTokens: 100, outputTokens: 20 }
    let claimed: WorkItem | undefined, earlyNonce: string | undefined
    const agentName = (await pool.query<{ name: string }>('SELECT name FROM participants WHERE company_id=$1 AND id=$2', [companyId, agentId])).rows[0].name
    const answers = { materials: 'yes', difficulty: 'principles', notes: `请解释 @${agentName} 的例题` }
    const worker = createWorker({ controlPlane: { connectWorker(input) {
      const host = api.connectWorker(input)
      return { ...host, async claimWork(...args) { const work = await host.claimWork(...args); if (work) claimed = work; return work }, async waitWork(...args) {
        if (mode === 'early-submit') {
          const card = im.messages.find(message => message.channelId === conversationId && message.payload.content.some(part => part.type === 'data' && part.name === 'questionnaire'))!
          await submitQuestionnaire({ companyId, channelId: conversationId, userId: 'test-owner', questionId: card.payload.id, request: { answers } }, api)
          earlyNonce = im.messages.find(message => message.channelId === conversationId && message.payload.role === 'user')!.clientMsgNo
          await assert.rejects(flushAgentWakes(`questionnaire:${earlyNonce}`))
        }
        try { return await host.waitWork(...args) }
        catch (error) { waitErrors.push(error instanceof Error ? error.message : String(error)); throw error }
      } }
    } }, worker: { id: `questionnaire-fixture-${mode}` },
    modelBudget: { maxModelCalls: 12, inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'questionnaire-fixture', contextWindowTokens: 200000,
      async run(request) {
        modelCalls++
        if (builtin && modelCalls === 1) return { text: '', output: [{ type: 'function_call', callId: 'builtin-ask', name: 'task__ask', arguments: JSON.stringify({ question: question.title }) }], usage }
        if (!builtin && modelCalls <= 6 && !JSON.stringify(request.items).includes('已提交问卷')) return { text: '', output: [{ type: 'function_call', callId: `ask-${modelCalls}`, name: 'chat__ask', arguments: JSON.stringify(question) }], usage }
        if (builtin) assert.match(JSON.stringify(request.items), /actual learner answer: principles/)
        return { text: '原理 → 解题 → 检验。', output: [{ role: 'assistant', content: '原理 → 解题 → 检验。' }], usage }
      },
      async structured() { return { value: { missing: [] }, model: 'questionnaire-fixture', usage } },
      async compact() { throw new Error('bounded questionnaire fixture must not compact') },
    } })
    try {
      const policy = await syncConversationPolicy(api, companyId, conversationId)
      if (mode === 'early-submit') await api.conversations.registerThread({ tenantId: companyId, conversationId, policyVersion: policy.version, threadId: 'original-thread' })
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: `questionnaire-request-${mode}`, version: 1, author: { id: 'test-owner', kind: 'human' },
        text: '第三讲子网划分，我在原理和实际解题方面还有问题，请你帮助我进行学习', mentions: [agentId], ...(mode === 'early-submit' ? { threadId: 'original-thread' } : {}) },
      { mode: 'execute', executionClass: 'operation', codeExecution: 'disabled' })
      const identity = accepted.runs[0]; assert.ok(identity)
      assert.equal(await worker.runNext(), true)
      const run = await api.readRun(identity)
      const questionnaires = im.messages.filter(message => message.channelId === conversationId
        && message.payload.content.some(part => part.type === 'data' && part.name === 'questionnaire'))
      await mkdir('artifacts/questionnaire-wait', { recursive: true })
      await writeFile(`artifacts/questionnaire-wait/${mode}.json`, JSON.stringify({
        mode, modelCalls, questionnaireCount: questionnaires.length, status: run?.status,
        goalOutcome: run?.goalOutcome, waitErrors,
      }, null, 2))
      assert.equal(run?.status, 'waiting', JSON.stringify({ modelCalls, questionnaireCount: questionnaires.length, waitErrors }))
      assert.equal(run.goalOutcome?.status, 'awaiting_input')
      assert.equal(modelCalls, 1, 'no dependent planning or dispatch may run before a user submits')
      assert.equal(questionnaires.length, builtin ? 0 : 1, 'one request must expose one effective interaction')
      if (!builtin) {
        const { readRunProjection } = await import('../agent-runtime/assistant-transport.js')
        assert.deepEqual((await readRunProjection(api, identity, true)).snapshot.message.metadata.custom.questionnaireWait,
          { questionId: questionnaires[0].payload.id, requestVersion: 1 })
        const { assertQuestionnaireContinuation } = await import('../im/questionnaires.js')
        const caller = { companyId, channelId: conversationId, userId: 'test-owner', questionId: questionnaires[0].payload.id }
        const url = `${baseUrl}/api/im/channels/${conversationId}/questionnaires/${caller.questionId}`
        const headers = { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId }
        if (mode === 'current-product') {
          const state = await fetch(url, { headers }); assert.equal(state.status, 200)
          assert.deepEqual(await state.json(), { status: 'waiting', readOnly: false })
          assert.ok([403, 404].includes((await fetch(url, { headers: { ...headers, 'x-project-id': 'other-project' } })).status))
          assert.ok([403, 404].includes((await fetch(url, { headers: { ...headers, 'x-company-id': 'other-company' } })).status))
        }
        if (mode !== 'early-submit') assert.deepEqual(await getQuestionnaireState(caller, api), { status: 'waiting', readOnly: false })
        assert.equal(await worker.runNext(), false)
        assert.ok(claimed)
        const retry = createMessageTools(() => application).find(tool => tool.action === 'chat.ask')!
        const context = { work: claimed, database: pool, signal: AbortSignal.timeout(10000), requestVersion: 1,
          action: { action: 'chat.ask', args: question, idempotencyKey: 'new-model-retry-key' } } as unknown as ActionContext
        await retry.authorize(context, question)
        assert.equal((await retry.execute(context, question)).directive?.reason, 'user')
        assert.equal(im.messages.filter(message => message.channelId === conversationId && message.payload.role === 'assistant').length, 1)
        await assert.rejects(submitQuestionnaire({ ...caller, companyId: 'foreign-company', request: { answers } }, api))
        const forged = createNativeMessage({ id: 'forged-reply', role: 'user', content: [{ type: 'text', text: 'guessed choices' }],
          custom: { questionnaireReply: { questionId: caller.questionId, answers } } })
        await assert.rejects(createImMessagesApplication().acceptUserMessage({ ...caller, clientNonce: forged.id, payload: forged }), { status: 403 })
        await assert.rejects(submitQuestionnaire({ ...caller, request: { answers: { materials: 'yes' } } }, api), { status: 400 })
        await assert.rejects(submitQuestionnaire({ ...caller, request: { answers: { materials: 'invented', difficulty: 'principles' } } }, api), { status: 400 })
        await assert.rejects(submitQuestionnaire({ ...caller, userId: agentId, request: { answers: {} } }, api), { status: 403 })
        await assert.rejects(assertQuestionnaireContinuation({ companyId, channelId: conversationId, userId: 'test-owner',
          runId: identity.runId, requestVersion: 1, clientNonce: 'forged', payload: questionnaires[0].payload }), { status: 403 })
        if (mode.startsWith('crash-')) {
          const original = ImMessagesApplication.prototype.acceptUserMessage
          const stop = t.mock.method(ImMessagesApplication.prototype, 'acceptUserMessage', async function(this: ImMessagesApplication, ...args: Parameters<typeof original>) {
            if (mode === 'crash-after-send') await original.apply(this, args)
            throw new Error('simulated process loss after durable answer admission')
          })
          await assert.rejects(submitQuestionnaire({ ...caller, request: { answers } }, api), /simulated process loss/)
          stop.mock.restore()
          assert.deepEqual(await getQuestionnaireState(caller, api), { status: mode === 'crash-before-send' ? 'pending' : 'submitted', readOnly: true, answers })
          await assert.rejects(submitQuestionnaire({ ...caller, request: { answers: { ...answers, materials: 'no' } } }, api), { status: 409 })
          const { flushQuestionnaireSubmissions } = await import('../im/questionnaires.js')
          await Promise.all([flushQuestionnaireSubmissions(), flushQuestionnaireSubmissions()])
          assert.deepEqual(await getQuestionnaireState(caller, api), { status: 'submitted', readOnly: true, answers })
          assert.equal(im.messages.filter(message => message.channelId === conversationId && message.payload.role === 'user').length, 1)
        }
        const submitted = mode === 'current-product' ? await (async () => {
          const response = await fetch(`${url}/submit`, { method: 'POST', headers, body: JSON.stringify({ answers }) })
          assert.equal(response.status, 202, await response.clone().text())
          const repeated = await fetch(`${url}/submit`, { method: 'POST', headers, body: JSON.stringify({ answers }) })
          assert.equal(repeated.status, 200)
          return await response.json() as { status: string }
        })() : await submitQuestionnaire({ ...caller, request: { answers } }, api)
        assert.equal(submitted.status, 'accepted')
        assert.equal((await submitQuestionnaire({ ...caller, request: { answers } }, api)).duplicate, true)
        await assert.rejects(submitQuestionnaire({ ...caller, request: { answers: { ...answers, materials: 'no' } } }, api), { status: 409 })
        assert.deepEqual(await getQuestionnaireState(caller, api), { status: 'submitted', readOnly: true, answers })
        const reply = im.messages.find(message => message.channelId === conversationId && message.payload.role === 'user')!
        assert.ok(reply)
        assert.equal(reply.payload.metadata.custom.replyToClientMsgNo, mode === 'early-submit' ? 'original-thread' : undefined, 'continuation preserves the original thread')
        await assertQuestionnaireContinuation({ ...caller, runId: identity.runId, requestVersion: 1, clientNonce: reply.clientMsgNo, payload: reply.payload })
        const input = { ...identity, principalId: 'test-owner', inputId: reply.clientMsgNo, requestVersion: 1,
          text: reply.payload.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n') }
        if (product) {
          if (earlyNonce) await new Promise(resolve => setTimeout(resolve, 5100))
          assert.equal(await flushAgentWakes(`questionnaire:${reply.clientMsgNo}`), 1)
          assert.equal(await flushAgentWakes(`questionnaire:${reply.clientMsgNo}`), 0)
          const replay = await receiveAgentRequest({ companyId, agentId, channelId: conversationId, clientMsgNo: reply.clientMsgNo, authenticatedUserId: 'test-owner' })
          assert.ok('deduplicated' in replay && replay.deduplicated)
          if (mode === 'current-product') {
            const body = JSON.stringify([{ message_idstr: reply.messageId, channel_id: conversationId, from_uid: 'test-owner', client_msg_no: reply.clientMsgNo,
              payload: Buffer.from(JSON.stringify({ type: 1001, ...reply.payload })).toString('base64') }])
            const signature = createHmac('sha256', 'fixture').update(body).digest('hex')
            const webhook = () => fetch(`${baseUrl}/webhooks/wukong`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-wukong-signature': signature }, body })
            const first = await webhook(); assert.equal(first.status, 200, await first.clone().text())
            const duplicate = await webhook(); assert.equal(duplicate.status, 200)
            assert.equal((await duplicate.json() as { duplicate: boolean }).duplicate, true)
          }
          assert.equal(await worker.runNext(), true)
          assert.equal(modelCalls, 2)
          assert.equal((await api.readRun(identity))?.requestVersion, 2)
          assert.equal((await pool.query('SELECT count(*)::int AS count FROM lingxios.agent_work_items WHERE tenant_id=$1', [companyId])).rows[0].count, 1)
          if (mode === 'current-product') {
            const recommendation = createMessageTools(() => application).find(tool => tool.action === 'chat.recommend')!
            const recommendInput = { title: '下一步', explanation: '继续练习', nextStep: '开始练习' }
            await recommendation.execute({ ...context, action: { ...context.action, action: 'chat.recommend', idempotencyKey: 'legacy-recommendation' } }, recommendInput)
            const cardId = 'questionnaire-legacy-recommendation'
            const oldReply = createNativeMessage({ id: 'legacy-reply', role: 'user', content: [{ type: 'text', text: '接受建议' }],
              custom: { replyToClientMsgNo: cardId, questionnaireReply: { questionId: cardId, answers: { next_step: 'accept' } } } })
            assert.equal((await createImMessagesApplication().acceptUserMessage({ ...caller, clientNonce: oldReply.id, payload: oldReply })).kind, 'accepted')
            const forgedLegacy = createNativeMessage({ ...oldReply, id: 'legacy-forged', custom: { ...oldReply.metadata.custom,
              agentContinuation: { agentId, runId: identity.runId, requestVersion: 1 } } })
            await assert.rejects(createImMessagesApplication().acceptUserMessage({ ...caller, clientNonce: forgedLegacy.id, payload: forgedLegacy }), { status: 403 })
            await pool.query(`UPDATE conversations SET members=$2::jsonb WHERE id=$1`, [conversationId, JSON.stringify([agentId])])
            await assert.rejects(submitQuestionnaire({ ...caller, request: { answers } }, api))
            await assert.rejects(receiveAgentRequest({ companyId, agentId, channelId: conversationId, clientMsgNo: reply.clientMsgNo, authenticatedUserId: 'test-owner' }))
          }
        } else {
          assert.equal((await api.continueInput(input)).status, 'resumed')
          assert.equal((await api.continueInput(input)).status, 'already_resumed')
        }
      }
      if (builtin) {
        assert.equal((await api.readRun(identity))?.status, 'waiting', 'reading/reconnecting must not advance the run')
        assert.equal(await worker.runNext(), false, 'an unanswered run must not be claimable')
        const input = { ...identity, principalId: 'test-owner', inputId: 'builtin-answer', requestVersion: 1, text: 'actual learner answer: principles' }
        assert.equal((await api.continueInput(input)).status, 'resumed')
        assert.equal((await api.continueInput(input)).status, 'already_resumed')
        assert.equal(await worker.runNext(), true)
        assert.equal(modelCalls, 2)
        assert.ok(['succeeded', 'partial'].includes((await api.readRun(identity))!.status))
      }
    } finally { await worker.stop(); if (product) await stopLingxiOSControl(); else await api.stop() }
  })
}
