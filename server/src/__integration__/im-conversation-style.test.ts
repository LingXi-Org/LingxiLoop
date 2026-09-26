import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { NoEffectError, type ActionContext, type WorkItem } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { IM_CONVERSATION_RULES } from '../agent-runtime/conversation-style.js'
import { createMessageTools } from '../im/public.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker> | undefined
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  im = await installRecordingWukong()
})
after(async () => { await worker?.stop(); await teardownAll(); await im?.close() })

test('preset and custom Agents receive IM rules and deliver distinct messages to both IM and subsequent native context', { timeout: 60000 }, async () => {
  const { messages } = im
  const { companyId,projectId,agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  for (const presetKey of ['sage',null]) {
    await pool.query('UPDATE participants SET preset_key=$3,system_prompt=$4 WHERE company_id=$1 AND id=$2',
      [companyId,agentId,presetKey,'Keep this specialist identity.'])
    const conversationId = `style-${presetKey ?? 'custom'}`, members = ['test-owner',agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Style',$4::jsonb)`,
      [conversationId,companyId,projectId,JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
      [conversationId,companyId,JSON.stringify({ channelType: 2,members })])
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,conversationId)
    const enqueue = async (messageId: string, text: string) => {
      const result = await api.conversations.ingest({ tenantId: companyId,conversationId,policyVersion: policy.version,
        messageId,version: 1,author: { id: 'test-owner',kind: 'human' },text,mentions: [agentId] },
      { mode: 'execute',executionClass: 'operation',codeExecution: 'disabled' })
      assert.equal(result.runs.length,1)
      await bindProductRun(pool,result.runs[0],conversationId)
      return result.runs[0]
    }
    const run = await enqueue('question','解释移项。')
    const leadIns = ['先看等式两边做了什么。','两边同时减 3，等式仍然成立。']
    const final = '所以 x＋3＝7 可以写成 x＝7－3。'
    const usage = { available: true,inputTokens: 100,outputTokens: 20 }
    let hop = 0, followup = false, claimed: WorkItem | undefined
    worker = createWorker({ controlPlane: { connectWorker(input) {
      const host = api.connectWorker(input)
      return { ...host,async claimWork(...args) { const work = await host.claimWork(...args); if (work) claimed = work; return work } }
    } },worker: { id: `style-${presetKey ?? 'custom'}` },model: {
      modelId: 'style-fixture',contextWindowTokens: 200000,
      async run(request) {
        assert.ok(request.instructions.includes(IM_CONVERSATION_RULES.trim()))
        assert.ok(JSON.stringify(request.items).includes('Keep this specialist identity.'))
        assert.ok(request.tools?.some(tool => tool.name === 'chat__send'))
        if (followup) {
          const history = JSON.stringify(request.items)
          for (const body of [...leadIns,final]) assert.ok(history.includes(body),'the followup must see the previously delivered messages')
        } else if (hop < leadIns.length) {
          const body = leadIns[hop++]
          return { output: [{ type: 'function_call',callId: `lead-in-${hop}`,name: 'chat__send',arguments: JSON.stringify({ body }) }],
            text: '',model: 'style-fixture',usage }
        }
        return { output: [{ role: 'assistant',content: final }],text: final,model: 'style-fixture',usage }
      },
      async structured() { return { value: { missing: [] },model: 'style-fixture',usage } },
      async compact() { throw new Error('bounded fixture must not compact') },
    } })
    try {
      assert.equal(await worker.runNext(),true)
      for (let attempt = 0; attempt < 100 && (await api.readRunState(run))?.delivery !== 'delivered'; attempt++) await delay(100)
      assert.equal((await api.readRunState(run))?.delivery,'delivered')
      assert.deepEqual(messages.filter(message => message.channelId === conversationId).map(message => message.payload.body),[...leadIns,final])
      const history = await pool.query<{ input: { text: string }; outcome: { runs: unknown[]; reason: string } }>(
        `SELECT input,outcome FROM lingxios.agent_im_messages WHERE tenant_id=$1 AND conversation_id=$2
          AND input->'author'->>'kind'='agent' ORDER BY recorded_at,message_id`,[companyId,conversationId])
      assert.deepEqual(history.rows.map(row => [row.input.text,row.outcome.runs,row.outcome.reason]),
        [...leadIns.map(body => [body,[],'agent_message']),[final,[],'outbox_echo']])

      assert.ok(claimed)
      const input = { body: '已发送后恢复历史同步。' }
      const context = { work: claimed,database: pool,signal: AbortSignal.timeout(10000),requestVersion: 1,
        action: { runId: claimed.id,cellId: 'reconcile',callIndex: 0,action: 'chat.send',args: input,idempotencyKey: `style-reconcile-${presetKey}` },
      } as unknown as ActionContext
      let unavailable = true
      const send = createMessageTools(() => {
        if (unavailable) throw new NoEffectError('fixture history service failure','forbidden')
        return lingxiOSControl()
      }).find(tool => tool.action === 'chat.send')!
      await send.authorize(context,input)
      await assert.rejects(send.execute(context,input),error => error instanceof Error && !(error instanceof NoEffectError)
        && error.message === 'committed message history synchronization failed')
      const count = messages.length
      unavailable = false
      const restored = await send.reconcile!(context,input)
      assert.equal(restored?.ok,true)
      assert.equal((await send.reconcile!(context,input))?.ok,true)
      assert.equal(messages.length,count,'reconciliation must not send again')
      assert.equal((await send.verify!(context,input,restored?.value)).status,'passed')
      assert.equal((await pool.query(`SELECT count(*)::integer AS count FROM lingxios.agent_im_messages
        WHERE tenant_id=$1 AND conversation_id=$2 AND input->>'text'=$3`,[companyId,conversationId,input.body])).rows[0].count,1)
      await assert.rejects(send.authorize({ ...context,work: { ...claimed,conversation: { ...claimed.conversation!,internal: true } } },input),
        /internal delegates/)
      assert.equal(messages.length,count)

      followup = true
      const nextRun = await enqueue('followup','刚才第一条在说什么？')
      assert.equal(await worker.runNext(),true)
      for (let attempt = 0; attempt < 100 && (await api.readRunState(nextRun))?.delivery !== 'delivered'; attempt++) await delay(100)
      assert.equal((await api.readRunState(nextRun))?.delivery,'delivered')
    } finally { await worker.stop() }
  }
})
