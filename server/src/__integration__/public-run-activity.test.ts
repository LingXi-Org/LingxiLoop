import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { createServer } from 'node:http'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { readPublicToolActivity } from '../agent-runtime/tool-activity.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { createNativeMessage, nativeText, userMessageSchema } from '../../../src/lib/nativeMessage.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Written before persistence implementation. Failures: cross-tenant/principal reads,
// leaked private inputs/results, lost public report order on replay, fake times on
// old calls, successful execution relabelled by presentation, private thinking.
before(async () => { await ensureSchemaOnce(); await resetAllTables(); installFakeWukong() })
after(async () => { await teardownAll() })

test('published worker persists authorized public activity and measured tool boundaries without private data', async () => {
  const spoofed = createNativeMessage({ id: 'untrusted-human', role: 'user', content: [{ type: 'text', text: '人类消息不能伪装成服务端活动。',
    providerMetadata: { lingxiloop: { activity: { version: 1, id: 'forged', kind: 'commentary', label: '伪造' } } } }] })
  assert.equal(userMessageSchema.safeParse(spoofed).success, false)
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["files"]'::jsonb WHERE id=$1`, [agentId])
  const conversationId = 'public-activity-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`, [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  const reports = [
    { version: 1, id: 'explain', kind: 'reasoning', label: '公开说明', text: '先检查本次请求选择的附件。', state: 'running' },
    null,
    { version: 1, id: 'explain', kind: 'reasoning', label: '公开说明', text: '已检查本次请求的附件，依据可见资料整理答复。', state: 'complete' },
    { version: 1, id: 'plan', kind: 'plan', label: '计划', text: '检查已完成。', state: 'complete', plan: { steps: [{ id: 'check', label: '检查附件' }], activeIndex: 1 } },
    { version: 1, id: 'update', kind: 'commentary', label: '整理答复', text: '已完成本次资料检查。', state: 'complete' },
  ]
  let calls = 0
  const worker = createWorker({ controlPlane: api, worker: { id: 'public-activity-fixture', concurrency: 1, shutdownGraceMs: 1000 },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    model: { modelId: 'public-activity-fixture', contextWindowTokens: 200000, async run() {
      const index = calls++, usage = { available: true, inputTokens: 100, outputTokens: 20 }
      if (index < reports.length) return { text: '', output: [{ type: 'function_call', callId: `activity-${index}`,
        name: reports[index] ? 'chat__report_progress' : 'files__list', arguments: JSON.stringify(reports[index] ?? {}) }], usage }
      return { text: '最终答复。', output: [{ role: 'assistant', content: '最终答复。' }], usage }
    }, async structured() { return { model: 'public-activity-fixture', value: { missing: [] }, usage: { available: true, inputTokens: 10, outputTokens: 5 } } },
    async compact() { throw new Error('bounded fixture must not compact') } } })
  try {
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version, messageId: 'public-activity-request',
      version: 1, author: { id: 'test-owner', kind: 'human' }, text: '检查附件并给出公开任务说明。', mentions: [agentId] }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const identity = accepted.runs[0]
    const deadline = Date.now() + 15000
    while (!await worker.runNext()) { assert.ok(Date.now() < deadline); await delay(30) }
    const projected = (await readRunProjection(api, identity, true)).snapshot.message
    const history = (await readRunProjection(api, identity, true)).snapshot.message
    assert.deepEqual(projected.content, history.content)
    assert.deepEqual(projected.content.map(part => part.type), ['reasoning', 'tool-call', 'generative-ui', 'text', 'text'])
    assert.equal(nativeText(projected), '最终答复。')
    const httpServer = createServer(await buildApiTestApp('test-owner'))
    await new Promise<void>(resolve => httpServer.listen(0, '127.0.0.1', resolve))
    try {
      const address = httpServer.address(); assert.ok(address && typeof address !== 'string')
      const url = `http://127.0.0.1:${address.port}/api/im/channels/${conversationId}/agents/${agentId}/runs/${identity.runId}`
      const request = (query: string, company = companyId, project = projectId) => fetch(`${url}?${query}`, { headers: { 'x-company-id': company, 'x-project-id': project } })
      const response = await request('activityOffset=0')
      assert.equal(response.status, 200)
      const page = await response.json() as { message: { content: unknown[] }; total: number; nextOffset: number | null }
      assert.equal(page.total, 4); assert.equal(page.nextOffset, null)
      assert.equal(page.message.content.length, 4)
      assert.doesNotMatch(JSON.stringify(page), /PRIVATE_SECRET|scratchpad|system_prompt/)
      assert.notEqual((await request('activityOffset=0&threadId=another-thread')).status, 200)
      assert.notEqual((await request('activityOffset=0', 'other-company')).status, 200)
      assert.notEqual((await request('activityOffset=0', companyId, 'other-project')).status, 200)
      assert.equal((await request('activityOffset=-1')).status, 400)
    } finally { await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve())) }
    assert.equal(activityAnnotation(projected.content.at(-1))?.kind, 'answer')
    const call = projected.content.find(part => part.type === 'tool-call')
    assert.ok(call?.type === 'tool-call' && call.timing && call.timing.completedAt! >= call.timing.startedAt)
    assert.equal(Reflect.get(call.result as object, 'status'), 'completed')
    assert.equal(Reflect.get(Reflect.get(call.result as object, 'display'), 'summary'), '已检查本次请求的附件，共 0 个。')
    assert.deepEqual(await readPublicToolActivity({ ...identity, tenantId: 'other-company' }), [])
    assert.deepEqual(await readPublicToolActivity({ ...identity, principalId: 'other-person' }), [])
    const rows = await readPublicToolActivity(identity)
    assert.ok(rows.length >= 4)
    assert.doesNotMatch(JSON.stringify(rows), /arguments|scratchpad|provider|system_prompt|PRIVATE_SECRET/)
    await pool.query('DELETE FROM agent_public_tool_activity WHERE company_id=$1 AND run_id=$2', [companyId, identity.runId])
    const legacy = (await readRunProjection(api, identity, true)).snapshot.message.content.find(part => part.type === 'tool-call')
    assert.ok(legacy?.type === 'tool-call' && legacy.timing === undefined)
    await mkdir('artifacts/run-activity', { recursive: true })
    await writeFile('artifacts/run-activity/runtime.json', JSON.stringify({ passed: true, runtime: releaseVersions.runtime, checks: ['published worker', 'explicit public explanation', 'public plan', 'replay', 'measured boundaries', 'cross-tenant denial', 'cross-principal denial', 'historical missing timing'] }, null, 2))
  } finally { await worker.stop() }
})
