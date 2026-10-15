import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import type { WorkItem } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { createNativeMessage, nativeText } from '../im/message-types.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { storage } from '../storage.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure cases: dispatch before commit, metadata-only targets, wrong principal,
// duplicate ACK/reconnect work, hidden children, automatic return, lost bindings,
// or inherited attachment evidence rejected as an unrecorded child read.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker> | undefined
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await worker?.stop(); await recording?.close(); await teardownAll() })

test('committed formatted mentions drive A → B → C → A and a plain reply ends the chain', { timeout: 60000 }, async t => {
  t.after(async () => { await worker?.stop(); worker = undefined })
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const second = 'mention-second', third = 'mention-third', channelId = 'mention-room'
  for (const id of [second, third]) await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
    VALUES($1,$2,'agent',$1,'specialist','M','#abcdef','avail')`, [id, companyId])
  const members = ['test-owner', agentId, second, third]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members }), agentId])
  const attachmentId = `attachments/${companyId}/mention-facts.txt`
  await storage.put(attachmentId, Buffer.from('Unique recorded value: 7391.'), 'text/plain')
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,'test-owner',period_id FROM company_memberships WHERE company_id=$2 AND user_id='test-owner' AND ended_at IS NULL`, [attachmentId, companyId])
  const payload = createNativeMessage({ id: 'mention-source', role: 'user', content: [{ type: 'text', text: `@${agentId} Split and verify this task.` }],
    custom: { mentionedIds: [third], mentionAll: true }, attachments: [{ id: attachmentId, type: 'file', name: 'mention-facts.txt',
      contentType: 'text/plain', status: { type: 'complete' }, content: [{ type: 'file', data: attachmentId, sourceType: 'id', mimeType: 'text/plain' }] }] })
  await imMessagesApplication.acceptUserMessage({ companyId, userId: 'test-owner', channelId, clientNonce: payload.id, payload })
  const input = { companyId, agentId, channelId, clientMsgNo: payload.id }
  const admitted = await receiveAgentRequest(input)
  assert.ok('runs' in admitted)
  assert.deepEqual(admitted.runs.map(run => run.agentId), [agentId], 'forged metadata cannot add targets')
  const attachment = (await pool.query('SELECT meta FROM lingxios.agent_work_items WHERE id=$1', [admitted.runs[0].runId])).rows[0].meta.attachments[0]
  assert.ok(attachment)
  const api = await lingxiOSControl(), claimed = new Map<string, WorkItem>()
  const usage = { available: true, inputTokens: 100, outputTokens: 10 }
  let requestedRead = false
  worker = createWorker({ controlPlane: { connectWorker(config) {
    const host = api.connectWorker(config)
    return { ...host, async claimWork(...args) { const work = await host.claimWork(...args); if (work) claimed.set(work.id, work); return work } }
  } }, worker: { id: 'group-mentions', concurrency: 1, shutdownGraceMs: 1000 },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'mention-fixture', contextWindowTokens: 200000,
      async run(request) {
        if (!requestedRead) {
          requestedRead = true
          return { text: '', output: [{ type: 'function_call', callId: 'read-original', name: 'task__read_attachment',
            arguments: JSON.stringify({ id: attachment.id, sourceVersion: attachment.sourceVersion, offset: 0, limit: 16000 }) }], usage }
        }
        assert.deepEqual(request.tools!.filter(tool => tool.name.startsWith('memory__')).map(tool => tool.name.slice(8)).sort(),
          ['apply','doctor','forget','history','list','read','reflect','restore','search'], 'custom specialists retain all native memory tools during public collaboration')
        const context = JSON.stringify(request.items)
        assert.match(context, /Unique recorded value: 7391/)
        const text = context.includes('FOLLOW_UP') ? 'Clarification recorded. The task is complete.'
          : context.includes('CHECK_SECOND') ? `@${agentId} FOLLOW_UP: clarify this point.`
          : context.includes('DELEGATE_B') ? `@${third} CHECK_SECOND: independently verify this finding.`
          : `- Specialist \`@${second}\` DELEGATE_B: investigate the assigned part.`
        return { output: [{ role: 'assistant', content: text }], text, model: 'mention-fixture', usage }
      },
      async structured() { return { value: { missing: [] }, model: 'mention-fixture', usage } },
      async compact() { throw new Error('bounded conversation must not compact') },
    } })
  await worker.start()
  const deadline = Date.now() + 45000
  while (!recording.messages.some(message => nativeText(message.payload).startsWith('Clarification recorded.'))) {
    const failed = (await pool.query("SELECT error FROM lingxios.agent_work_items WHERE tenant_id=$1 AND status='failed' LIMIT 1", [companyId])).rows[0]
    assert.ok(!failed, failed?.error)
    assert.ok(Date.now() < deadline, 'group chain did not complete')
    await delay(50)
  }
  await worker.stop()
  const messages = recording.messages.filter(message => message.payload.role === 'assistant')
  assert.deepEqual(messages.map(message => message.fromUid), [agentId, second, third, agentId])
  const memoryScopes = new Map<string,string>()
  for (const work of claimed.values()) {
    const scopes = await api.memory!.scopes({ tenantId: companyId,agentId: work.agentId,principalId: work.principalId!,sessionId: work.sessionId,workId: work.id })
    assert.deepEqual(scopes.map(scope => scope.scopeType), ['learner','course','agent_role'])
    memoryScopes.set(work.agentId,scopes[0].scopeId)
  }
  assert.equal(new Set(memoryScopes.values()).size,3,'each collaborating agent retains its own memory scope')
  const bindings = (await pool.query('SELECT run_id,principal_id,internal FROM agent_run_bindings ORDER BY created_at,run_id')).rows
  assert.equal(bindings.length, 4)
  assert.ok(bindings.every(row => row.principal_id === 'test-owner' && !row.internal))
  assert.equal((await pool.query('SELECT 1 FROM lingxios.agent_work_waits')).rows.length, 0)
  assert.equal((await pool.query('SELECT 1 FROM agent_handoffs')).rows.length, 0)
  assert.ok([...claimed.values()].every(work => !work.meta?.parentWorkId))
  assert.ok([...claimed.values()].every(work => work.meta?.executionClass === 'conversation'), 'public replies must retain conversation acceptance semantics')
  const inherited = [...claimed.values()].filter(work => work.meta?.delegation).map(work =>
    (work.meta!.delegation as { parentRequest: { evidence: { items: { excerpt: string; actionKey: string }[] } } }).parentRequest.evidence.items)
  assert.equal(inherited.length, 3)
  assert.ok(inherited.every(items => items[0]?.excerpt === 'Unique recorded value: 7391.' && items[0].actionKey))
  const root = admitted.runs[0], work = claimed.get(root.runId)!, state = (await api.readRunState(root))!
  const sent = messages[0], view = sent.payload.metadata.custom.harness as { resultId: string; messageFence: number }
  await createProductDelivery(lingxiOSControl).deliverMessage(work, state.message!, {
    signal: AbortSignal.timeout(10000), deadlineAt: new Date(Date.now() + 10000).toISOString(),
    commit: { resultId: view.resultId, fence: view.messageFence },
    im: { tenantId: companyId, ...work.conversation!, replyKey: 'replay', messageKey: sent.clientMsgNo },
  })
  await receiveAgentRequest(input)
  assert.equal(recording.messages.length, 5)
  assert.equal((await pool.query('SELECT 1 FROM agent_run_bindings')).rows.length, 4)
  const artifact = { passed: true, messages: recording.messages.map(message => ({ author: message.fromUid, text: nativeText(message.payload) })),
    runs: bindings, inheritedEvidencePreserved: true,
    checks: ['formatted-mention', 'public-causal-chain', 'explicit-return', 'silent-stop', 'shared-human', 'replay', 'no-hidden-children', 'inherited-attachment-evidence'] }
  await mkdir('artifacts/group-mentions', { recursive: true })
  await writeFile('artifacts/group-mentions/conversation.json', JSON.stringify(artifact, null, 2))
})

test('message admission freezes canonical mentions across renames and preserves citation coordinates', async () => {
  await resetAllTables()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const channelId = 'mention-rename-room', members = ['test-owner', agentId]
  await pool.query("UPDATE participants SET name='明理' WHERE company_id=$1 AND id=$2", [companyId, agentId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  const text = '请＠　明理核对：[这条结论](#cite-S1)。`@明理`'
  const claim = { start: text.indexOf('['), end: text.indexOf(')。') + 1, text: '这条结论', markers: ['S1'], confidence: 0.9 }
  const payload = createNativeMessage({ id: 'rename-source', role: 'assistant', content: [{ type: 'text', text },
    { type: 'data', name: 'citation-claims', data: { claims: [claim] } }] })
  const input = { companyId, userId: agentId, channelId, clientNonce: payload.id, payload }
  const accepted = await imMessagesApplication.acceptAgentMessage(input)
  assert.equal(accepted.kind, 'accepted')
  if (accepted.kind !== 'accepted') throw new Error('message admission failed')
  const saved = accepted.echo.payload as typeof payload
  assert.equal(nativeText(saved), `请@${agentId}核对：[这条结论](#cite-S1)。\`@${agentId}\``)
  const citations = saved.content.find(part => part.type === 'data' && part.name === 'citation-claims')!
  assert.ok(citations.type === 'data')
  const persistedClaim = (citations.data as { claims: typeof claim[] }).claims[0]
  assert.equal(nativeText(saved).slice(persistedClaim.start, persistedClaim.end), '[这条结论](#cite-S1)')
  await pool.query("UPDATE participants SET name='新的明理' WHERE company_id=$1 AND id=$2", [companyId, agentId])
  const replay = await imMessagesApplication.acceptAgentMessage(input)
  assert.equal(replay.kind, 'accepted')
  if (replay.kind === 'accepted') assert.deepEqual(replay.echo, accepted.echo)
})

// Screenshot regression: all five formatted roster mentions must create public
// replies after the leader commits, without waking an unmentioned room member.
test('a leader introduction wakes all five inline-code mentioned specialists once', { timeout: 60000 }, async () => {
  await resetAllTables()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const specialists = ['sage', 'milo', 'trace', 'scout', 'forge']
  const channelId = 'introduction-room', excluded = 'example-only'
  for (const id of [...specialists, excluded]) await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
    VALUES($1,$2,'agent',$1,'specialist','M','#abcdef','avail')`, [id, companyId])
  const members = ['test-owner', agentId, ...specialists, excluded]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members }), agentId])
  const payload = createNativeMessage({ id: 'introduction-source', role: 'user', content: [{ type: 'text', text: '介绍一下自己，并且提及其他成员介绍自己。' }] })
  await imMessagesApplication.acceptUserMessage({ companyId, userId: 'test-owner', channelId, clientNonce: payload.id, payload })
  await receiveAgentRequest({ companyId, agentId, channelId, clientMsgNo: payload.id })
  const api = await lingxiOSControl()
  let speaker = ''
  const usage = { available: true, inputTokens: 100, outputTokens: 30 }
  worker = createWorker({ controlPlane: { connectWorker(config) {
    const host = api.connectWorker(config)
    return { ...host, async claimWork(...args) { const work = await host.claimWork(...args); if (work) speaker = work.agentId; return work } }
  } }, worker: { id: 'introduction-mentions', concurrency: 1, shutdownGraceMs: 1000 },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'introduction-fixture', contextWindowTokens: 200000,
      async run() {
        const text = speaker === agentId ? '我是协调者，请各位介绍自己：\n'
          + specialists.map(id => `- \`@${id}\` 请用一句话介绍自己的职责。`).join('\n')
          + `\n\n> \`@${excluded}\` 引用示例\n\n\`print("@${excluded}")\`\n\n\`\`\`text\n@${excluded}\n\`\`\``
          : `我是 ${speaker}，负责团队中的专业工作。`
        return { output: [{ role: 'assistant', content: text }], text, model: 'introduction-fixture', usage }
      },
      async structured() { return { value: { missing: [] }, model: 'introduction-fixture', usage } },
      async compact() { throw new Error('bounded introduction must not compact') },
    } })
  await worker.start()
  const replies = () => recording.messages.filter(message => message.channelId === channelId && message.payload.role === 'assistant')
  const deadline = Date.now() + 45000
  while (replies().length < 6) { assert.ok(Date.now() < deadline, 'five specialist introductions did not arrive'); await delay(50) }
  await worker.stop()
  assert.equal(replies()[0].fromUid, agentId, 'the assignment must be committed first')
  assert.deepEqual(replies().slice(1).map(message => message.fromUid).sort(), [...specialists].sort())
  const runs = (await pool.query('SELECT agent_id,principal_id,internal FROM agent_run_bindings')).rows
  assert.equal(runs.length, 6)
  assert.ok(runs.every(run => run.principal_id === 'test-owner' && !run.internal))
  await mkdir('artifacts/group-mentions', { recursive: true })
  await writeFile('artifacts/group-mentions/introduction.json', JSON.stringify({ passed: true,
    authors: replies().map(message => message.fromUid), runs,
    checks: ['five-specialists', 'commit-before-dispatch', 'one-reply-each', 'examples-inert', 'shared-human'] }, null, 2))
})
