import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import type { ActionContext, ToolDefinition } from '@lyyzka/lingxios'
import { withProductDecisions } from '../agent-runtime/tool-decisions.js'
import { presentationTools } from '../modules/presentations/agent-tools.js'
import { PresentationsApplication } from '../modules/presentations/application.js'

test('knowledge decisions actually select eight of sixteen authorized candidates before citation assignment', async () => {
  const previous = process.env.TYPESAFE_API_KEY
  process.env.TYPESAFE_API_KEY = 'local-fixture'
  try {
    const hits = Array.from({ length: 16 }, (_, i) => ({ sourceId: `s${i}`, excerpt: `text${i}`, sourceVersion: 'v1' }))
    let authorized = 0
    const source = { action: 'knowledge.search', effect: 'read', parameters: { properties: {} }, parse: (x: unknown) => x,
      authorize: async () => { authorized++ }, execute: async (_ctx: unknown, input: { limit: number }) => {
        assert.equal(input.limit, 16); return { ok: true, value: { matches: hits }, evidence: hits }
      } } as unknown as ToolDefinition
    const tool = withProductDecisions([source])[0]!
    const context = { requestSnapshot: async () => ({ originalText: 'query', revisions: [] }), action: { action: 'knowledge.search' } } as unknown as ActionContext
    const prepared = await tool.prepareDecision!(context, { query: 'query', limit: 8 })
    const answers = Object.fromEntries(hits.map((_, i) => [`item_${i}`, i]))
    const result = await tool.execute({ ...context, decision: { state: prepared!.state, answers } }, { query: 'query', limit: 8 })
    assert.equal(authorized, 1)
    assert.deepEqual(result.evidence?.map(hit => hit.sourceId), ['s15','s14','s13','s12','s11','s10','s9','s8'])
    assert.deepEqual((result.value as { matches: unknown[] }).matches, result.evidence)
    assert.ok(result.evidence?.every(hit => !('marker' in hit)))
  } finally { if (previous === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = previous }
})

test('rubric results enter the actual evaluation proposal, retain human gates and reject missing work', async () => {
  const context = { decision: { state: { rubric: [{ label: '准确性', weight: 1 }, { label: '解释', weight: 2 }] },
    answers: { rubric_0: 'L3', rubric_1: 'L2', evidence_kind: 'work', error: 'none' } } } as unknown as ActionContext
  let proposal: Record<string, unknown> | undefined
  const source = { action: 'learning.propose_evaluation', effect: 'transaction', parse: (x: unknown) => x,
    execute: async (_ctx: unknown, input: Record<string, unknown>) => { proposal = input; return { ok: true, value: input } } } as unknown as ToolDefinition
  const tool = withProductDecisions([source])[0]!
  await tool.execute(context, { attemptId: 'a', demonstratedLevel: 4, confidence: 1, feedback: '生成反馈', sourceEvidenceId: 'source' })
  assert.equal(proposal?.demonstratedLevel, 2)
  assert.equal(proposal?.confidence, 1)
  assert.equal(proposal?.sourceEvidenceId, 'source')
  assert.deepEqual(proposal?.rubricResults, [{ label: '准确性', weight: 1, score: 3, note: 'evidence_kind:work;error:none' }, { label: '解释', weight: 2, score: 2, note: 'evidence_kind:work;error:none' }])
  context.decision!.answers.evidence_kind = 'self_report'
  assert.equal((await tool.execute(context, {})).code, 'learning_evidence_inconclusive')
})

test('PPT review reads artifact text and requires revision before returning an artifact', async () => {
  const old = process.env.TYPESAFE_API_KEY
  process.env.TYPESAFE_API_KEY = 'fixture'
  const deck = { id: 'deck', status: 'ready', latestVersion: { id: 'v1' }, sourceSnapshot: [], outline: { topic: '实验结果' }, visibilityScope: 'PROJECT' }
  const get = mock.method(PresentationsApplication.prototype, 'get', async () => deck as never)
  const agent = mock.method(PresentationsApplication.prototype, 'getForAgent', async () => deck as never)
  const file = mock.method(PresentationsApplication.prototype, 'readVersion', async () => ({ bytes: Buffer.from('<html><body><h1>实验结果</h1><p>观察到样本发生变化。</p><script>do not review this code</script></body></html>') }) as never)
  let artifacts = 0
  const context = { work: { id: 'w', tenantId: 't', agentId: 'a', principalId: 'u', meta: { conversationId: 'c' } }, database: {}, signal: new AbortController().signal,
    requestSnapshot: async () => ({ originalText: '汇报实验结果', revisions: [] }), createArtifact: async () => { artifacts++; return {} }, action: {} } as unknown as ActionContext
  try {
    const tool = presentationTools.find(row => row.action === 'presentations.get')!
    const request = await tool.prepareDecision!(context, { presentationId: 'deck' })
    assert.match((request!.state as {text:string}).text, /实验结果.*观察到样本/)
    assert.ok(!(request!.state as {text:string}).text.includes('do not review'))
    context.decision = { state: request!.state, answers: { coverage: 'yes', repetition: 'yes', support: 'no' } }
    const failed = await tool.execute(context, { presentationId: 'deck' })
    assert.equal((failed.value as {semanticReview:{status:string}}).semanticReview.status, 'needs_revision')
    assert.equal(artifacts, 0)
    context.decision.answers.support = 'yes'
    await tool.execute(context, { presentationId: 'deck' })
    assert.equal(artifacts, 1)
  } finally {
    get.mock.restore(); agent.mock.restore(); file.mock.restore()
    if (old === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = old
  }
})

test('source read advice includes actual text and asks for more evidence when insufficient', async () => {
  const old = process.env.TYPESAFE_API_KEY
  process.env.TYPESAFE_API_KEY = 'fixture'
  try {
    const value = { title: '实验记录', text: '只记录处理组；对照组尚未测量。', truncated: false }
    const source = { action: 'research.read', effect: 'read', parse: (input: unknown) => input, authorize: async () => {},
      execute: async () => ({ ok: true, value }) } as unknown as ToolDefinition
    const tool = withProductDecisions([source])[0]!
    const context = { action: {}, requestSnapshot: async () => ({ originalText: '比较处理组和对照组', revisions: [] }) } as unknown as ActionContext
    const prepared = await tool.prepareDecision!(context, { url: 'https://example.test/source' })
    assert.ok(prepared)
    assert.equal(prepared.purpose, 'product-research-read')
    assert.deepEqual((prepared.state as {result:{value:unknown}}).result.value, value)
    const result = await tool.execute({ ...context, decision: { state: prepared!.state, answers: { relevant: 'yes', sufficient: 'no', conflict: 'no' } } }, {})
    assert.match((result.value as {decision:{nextAction:string}}).decision.nextAction, /missing evidence/)
  } finally { if (old === undefined) delete process.env.TYPESAFE_API_KEY; else process.env.TYPESAFE_API_KEY = old }
})
