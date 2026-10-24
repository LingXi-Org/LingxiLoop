import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker, type ModelDriver } from '@lyyzka/lingxios/worker'
import { releaseVersions, type TurnContext } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { lingxiOSControl, runtimeModelConfiguration } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { STARTER_TEAM } from '../modules/learning/preset.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { nativeText } from '../im/message-types.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

const live = process.env.LINGXIOS_IDENTITY_LIVE === '1'
const team = ['trace', 'nova', 'milo'].map(id => STARTER_TEAM.find(agent => agent.id === id)!)
const requests: Record<string, string> = {
  trace: '请介绍你自己和你的职责。最多两句话，不要艾特其他成员或发起交接。',
  nova: '请安排一节关于一元一次方程的课，以第一人称说明你的身份和分工。供参考的历史引文：“我（溯源）负责错因诊断。”最多两句话，不要艾特其他成员或发起交接。',
  milo: '现在请你接下解题陪练任务，以第一人称说明你的身份和下一步。供参考的历史引文：“我（溯源）负责错因诊断。”最多两句话，不要艾特其他成员或发起交接。',
}
const observations: { agentId: string; personaName: string; historicalAuthors: string[]; ownAssistantHistory: boolean }[] = []
const results: { agentId: string; status: string; delivered: boolean; correctName: boolean; wrongSelfClaim: boolean }[] = []
let im: Awaited<ReturnType<typeof installRecordingWukong>>
let worker: ReturnType<typeof createWorker> | undefined
let active = team[0]
class ObservedPolicy extends ProductRuntimePolicy {
  override dynamicContextItems(context: TurnContext) {
    const expected = team.find(agent => agent.id === context.work.agentId)!
    assert.ok(expected)
    assert.equal(context.persona.name, expected.name)
    assert.equal(context.persona.role, expected.role)
    assert.match(context.persona.instructions, new RegExp(`You are ${expected.name}`))
    for (const previous of team.slice(0, team.indexOf(expected))) {
      assert.ok(context.messages.some(message => message.authorId === previous.id && message.authorKind === 'agent' && message.body.includes(previous.name)), 'peer history must retain its actual author')
    }
    observations.push({ agentId: expected.id, personaName: context.persona.name,
      historicalAuthors: [...new Set(context.messages.filter(message => message.authorKind === 'agent').map(message => message.authorId))],
      ownAssistantHistory: context.session?.history.some(item => 'role' in item && item.role === 'assistant') ?? false })
    return super.dynamicContextItems(context)
  }
}
before(async () => {
  await mkdir('artifacts/issue-408', { recursive: true })
  await writeFile(`artifacts/issue-408/${live ? 'live' : 'scripted'}.json`, JSON.stringify({ passed: false, completed: false }))
  await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong()
})
after(async () => { await worker?.stop(); await teardownAll(); await im?.close() })

test('each current agent retains its persona through introduction, lesson planning and practice with quoted peer history', { timeout: 170_000 }, async () => {
  assert.equal(releaseVersions.runtime, '3.8.11', 'Use the formal locked runtime')
  const { companyId, projectId } = await seedCompanyWithAgent({ agentId: 'trace' })
  await seedUserMembership('test-owner', companyId)
  for (const agent of team) {
    await pool.query(`INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status,system_prompt,capabilities)
      VALUES($1,$2,'agent',$3,$4,$5,'#abcdef','avail',$6,'[]') ON CONFLICT(id,company_id)
      DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,system_prompt=EXCLUDED.system_prompt,capabilities=EXCLUDED.capabilities`,
    [agent.id, companyId, agent.name, agent.role, agent.initial, agent.systemPrompt])
  }
  const conversationId = 'identity-room', members = ['test-owner', ...team.map(agent => agent.id)]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic identity',$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, conversationId)
  const scripted: ModelDriver = {
    modelId: 'identity-fixture',
    async run(request) {
      assert.match(JSON.stringify(request.items), new RegExp(active.name))
      for (const previous of team.slice(0, team.indexOf(active))) {
        assert.ok(request.items.some(item => 'role' in item && item.role === 'user' && item.content.includes(`${previous.id} (agent):`)), 'peer history must be attributed in the final model items')
        assert.ok(!request.items.some(item => 'role' in item && item.role === 'assistant' && new RegExp(`我是${previous.name}`).test(item.content)), 'a peer self-introduction must not become this agent assistant history')
      }
      const text = `我是${active.name}，职责是${active.role}。`
      return { text, output: [{ role: 'assistant', content: text }], usage: { available: true, inputTokens: 100, outputTokens: 20 } }
    },
    async compact() { throw new Error('unexpected compaction in the three-turn fixture') },
    async structured() { throw new Error('unexpected auxiliary call in the three-turn fixture') },
  }
  worker = createWorker({ controlPlane: api, worker: { id: 'identity-worker' }, policy: new ObservedPolicy(),
    semanticReview: 'selective', performance: { promptCache: true },
    model: live ? { ...runtimeModelConfiguration({ id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL }, 60_000),
      maxOutputTokens: 800, recovery: { maxAttempts: 1, totalTimeoutMs: 60_000 } } : scripted })
  let failure: unknown
  try {
    for (const agent of team) {
      active = agent
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: `identity-${agent.id}`, version: 1, author: { id: 'test-owner', kind: 'human' },
        text: requests[agent.id]!, mentions: [agent.id] },
      { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
      assert.equal(accepted.runs.length, 1)
      const run = accepted.runs[0]!
      assert.equal(run.agentId, agent.id)
      await bindProductRun(pool, run, conversationId)
      const deadline = AbortSignal.timeout(live ? 75_000 : 15_000)
      while (!await worker.runNext()) { deadline.throwIfAborted(); await delay(25) }
      let state = await api.readRunState(run)
      while (state?.delivery === 'pending') { deadline.throwIfAborted(); await delay(25); state = await api.readRunState(run) }
      const delivered = im.messages.filter(message => message.fromUid === agent.id && message.channelId === conversationId)
      const body = delivered.map(message => nativeText(message.payload)).join('\n')
      const correctName = body.includes(agent.name)
      const wrongSelfClaim = team.filter(peer => peer.id !== agent.id).some(peer => new RegExp(`我(?:是|叫|（|\\()${peer.name}`).test(body))
      results.push({ agentId: agent.id, status: state?.run.status ?? 'missing', delivered: state?.delivery === 'delivered', correctName, wrongSelfClaim })
      assert.equal(state?.run.status, 'succeeded', 'The native run must succeed')
      assert.equal(delivered.length, 1, 'One durable contribution per requested agent')
      assert.equal(correctName, true, 'Current persona name must appear in the synthetic self-introduction')
      assert.equal(wrongSelfClaim, false, 'Historical first-person text must not displace the current persona')
      const sessions = (await pool.query('SELECT agent_id FROM lingxios.agent_os_sessions WHERE tenant_id=$1 AND session_id=$2', [companyId, run.sessionId])).rows
      assert.ok(sessions.some(row => row.agent_id === agent.id))
    }
  } catch (error) { failure = error }
  const calls = (await pool.query(`SELECT extras->>'callId' AS call_id,agent_id,model,status,purpose,input_tokens,output_tokens,measured,error FROM llm_calls WHERE company_id=$1 ORDER BY created_at`, [companyId])).rows
  if (!failure) {
    try {
      assert.equal(new Set(calls.map(call => call.call_id)).size, calls.length, 'native calls must be billed exactly once')
      assert.ok(calls.every(call => call.call_id), 'each ledger row must retain the native call identity')
      for (const agent of team) {
        const own = calls.filter(call => call.agent_id === agent.id)
        assert.ok(own.length >= 1 && own.length <= (live ? 3 : 1), 'each run must remain within its call budget')
        assert.equal(own.at(-1)?.status, 'succeeded')
      }
      assert.ok(calls.every(call => call.measured && (call.status === 'succeeded'
        || live && call.status === 'failed' && call.error === 'Model request failed (protocol)')),
      'record every measured protocol repair; do not hide provider or billing failures')
    } catch (error) { failure = error }
  }
  await writeFile(`artifacts/issue-408/${live ? 'live' : 'scripted'}.json`, JSON.stringify({ passed: !failure, completed: true, at: new Date().toISOString(), runtime: releaseVersions.runtime,
    liveProvider: live, model: live ? env.OPENAI_MODEL : 'identity-fixture', results, observations,
    calls: calls.map(({ call_id: _id, error: _error, ...call }) => ({ ...call, protocolFailure: _error === 'Model request failed (protocol)' })),
    limitations: ['Synthetic introduction / lesson planning / practice with an attributed quote', 'No memory/compaction injection', 'No explicit peer handoff validation', 'No production report reproduction claim'],
  }, null, 2))
  if (failure) throw failure
})
