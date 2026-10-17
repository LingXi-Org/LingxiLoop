import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { ActionContext } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { directoryTools } from '../modules/agents/agent-tools.js'
import { seedCompanyWithAgent, seedUserMembership } from './_helpers.js'

export const self = directoryTools.find(tool => tool.action === 'directory.self')!
export const ids = { company: 'directory-company', agent: 'directory-agent', a: 'directory-a', b: 'directory-b' }
export async function seedDirectory() {
  const scope = await seedCompanyWithAgent({ companyId: ids.company, agentId: ids.agent })
  for (const user of [ids.a, ids.b]) {
    await seedUserMembership(user, scope.companyId, { role: 'STUDENT' })
    await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,$2,$3,'STUDENT')`, [scope.companyId, scope.projectId, user])
  }
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by) VALUES('directory-project-private',$1,'INSTITUTIONAL_COURSE','Private project','test-owner')`, [scope.companyId])
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,'directory-project-private',$2,'STUDENT')`, [scope.companyId, ids.a])
  for (const [id, members, project, kind] of [
    ['directory-dm-a', [ids.a, ids.agent], scope.projectId, 'direct'],
    ['directory-dm-b', [ids.b, ids.agent], scope.projectId, 'direct'],
    ['directory-shared', [ids.a, ids.b, ids.agent], scope.projectId, 'group'],
    ['directory-project-room', [ids.a, ids.b, ids.agent], 'directory-project-private', 'group'],
    ['directory-left', [ids.a, ids.b], scope.projectId, 'group'],
  ] as const) {
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,$4,$1,$5::jsonb)`, [id, scope.companyId, project, kind, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [id, scope.companyId, JSON.stringify({ channelType: 2, members })])
  }
  const other = await seedCompanyWithAgent({ companyId: 'directory-other-company' })
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES('directory-other-tenant',$1,$2,'group','Tenant secret',$3::jsonb)`, [other.companyId, other.projectId, JSON.stringify([ids.a, ids.b, ids.agent])])
  return scope
}

export function context(audience: 'a' | 'b' | 'shared', principal = audience === 'b' ? ids.b : ids.a): ActionContext {
  const room = audience === 'shared' ? 'directory-shared' : `directory-dm-${audience}`
  const humans = audience === 'shared' ? [ids.a, ids.b] : [audience === 'a' ? ids.a : ids.b]
  return {
    database: pool, signal: new AbortController().signal,
    work: { id: 'directory-work', fence: 1, homeEpoch: 1, tenantId: ids.company, agentId: ids.agent,
      sessionId: 'directory-session', kind: 'turn', lane: 'interactive', triggerRef: 'directory-source', principalId: principal,
      createdAt: new Date().toISOString(), conversation: { conversationId: room, policyVersion: 1,
        source: { messageId: 'directory-source', version: 1 }, internal: false,
        audience: { visibility: 'conversation', participantIds: [...humans, ids.agent] } } },
    action: { runId: 'directory-work', cellId: 'directory-cell', callIndex: 0, action: 'directory.self', args: {}, idempotencyKey: 'directory-self' },
  } as unknown as ActionContext
}

export async function readDirectory(audience: 'a' | 'b' | 'shared') {
  const ctx = context(audience)
  await self.authorize(ctx, {})
  return self.execute(ctx, {})
}

export async function runDirectoryTurn(audience: 'a' | 'b', turn: number) {
  const api = await lingxiOSControl(), conversationId = `directory-dm-${audience}`
  const policy = await syncConversationPolicy(api, ids.company, conversationId)
  let calls = 0, visible: string[] = []
  const usage = { available: true as const, inputTokens: 100, outputTokens: 10 }
  const worker = createWorker({ controlPlane: api, worker: { id: `directory-${audience}-${turn}` },
    model: { modelId: 'directory-scripted-fixture',
      async structured() { return { value: { missing: [] }, model: 'directory-scripted-fixture', usage } },
      async compact() { throw new Error('unexpected compaction') },
      async run(request) {
        calls++
        assert.ok(calls <= 2, 'directory self must not consume retries for hidden candidates')
        if (calls === 1) return { text: '', output: [{ type: 'function_call' as const, callId: `directory-${turn}`, name: 'directory__self', arguments: '{}' }], usage }
        const result = request.items.filter(item => 'type' in item && item.type === 'function_call_output').at(-1)
        assert.ok(result && 'output' in result)
        const value = JSON.parse(result.output)
        assert.equal(value.ok, true)
        visible = value.value.conversations.map((room: { id: string }) => room.id).sort()
        const expected = audience === 'a' ? ['directory-dm-a', 'directory-project-room', 'directory-shared'] : ['directory-dm-b', 'directory-shared']
        assert.deepEqual(visible, expected)
        const text = `Directory ${audience.toUpperCase()} turn ${turn} completed.`
        return { text, output: [{ role: 'assistant' as const, content: text }], usage }
      },
    },
  })
  try {
    const accepted = await api.conversations.ingest({ tenantId: ids.company, conversationId, policyVersion: policy.version,
      messageId: `directory-${audience}-${turn}-${randomUUID()}`, version: 1, author: { id: audience === 'a' ? ids.a : ids.b, kind: 'human' },
      text: 'Read the authorized directory and continue.', mentions: [ids.agent] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const run = accepted.runs[0]; assert.ok(run)
    await bindProductRun(pool, run, conversationId)
    const deadline = AbortSignal.timeout(30000)
    while (!await worker.runNext()) { deadline.throwIfAborted(); await delay(20) }
    const state = await api.readRunState(run)
    assert.equal(state?.run.status, 'succeeded', JSON.stringify(state?.run.goalOutcome))
    assert.equal(state.message?.body, `Directory ${audience.toUpperCase()} turn ${turn} completed.`)
    return { audience, turn, status: state.run.status, calls, visible, durableReply: true }
  } finally { await worker.stop() }
}
