import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { assembleHarness, type ActionContext, type MemoryIdentity, type createLingxiOS } from '@lyyzka/lingxios'
import { generativeComponentSchemas } from '../../../src/lib/nativeMessage.js'
const access = await import('../modules/access/public.js')
mock.module('../modules/access/public.js', { namedExports: { ...access,
  createPermissionService: () => ({ async assertCan() {} }),
} })

// Failure model: docs/evidence/issue-304/PRODUCER-FAILURE-MODEL.md, written first.
const searchResult = { results: [{ title: 'Source', url: 'https://example.org/source', snippet: 'Public excerpt' }] }
mock.module('../modules/research/index.js', { namedExports: {
  researchTools: [],
  searchResearch: async () => searchResult,
  readResearch: async () => ({ text: 'Public excerpt' }),
} })
const { researchTools, researchSchemas } = await import('../modules/research/agent-tools.js')

test('research producer declares process by default and an explicit requested result without guessing prose', async () => {
  const tool = researchTools.find(tool => tool.action === 'research.search')!
  const input = researchSchemas.search.parse({ query: 'Show this as a source list' })
  assert.equal(input.displayPurpose, 'process')
  assert.deepEqual((await tool.execute({} as ActionContext, input)).value,
    { ...searchResult, presentation: { purpose: 'process' } })
  const result = researchSchemas.search.parse({ query: '背景检索', displayPurpose: 'result' })
  assert.deepEqual((await tool.execute({} as ActionContext, result)).value,
    { ...searchResult, presentation: { purpose: 'result' } })
  assert.equal(researchSchemas.search.safeParse({ query: 'test', displayPurpose: 'hidden' }).success, false)
})

test('a product memory result tool does not shadow the existing native memory grant', async () => {
  const { productCapabilityGrants } = await import('../agent-runtime/context.js')
  const { createMemorySummaryTool } = await import('../modules/memory/presentation.js')
  const tool = createMemorySummaryTool(async () => ({ memory: undefined }))
  const grants = productCapabilityGrants([tool])
  assert.equal(grants.filter(grant => grant.name === 'memory').length, 1)
  const memory = grants.find(grant => grant.name === 'memory')!
  // The actual native control-plane selects the first namespace match. A
  // restricted duplicate would deny previously authorized native methods.
  for (const method of ['summary', 'read', 'search', 'apply']) assert.ok(!memory.methods || memory.methods.includes(method))
  assert.deepEqual(grants.find(grant => grant.name === 'skills')?.methods, ['load'])
})

test('memory result requires one exact authorized ID and rereads during resolve', async () => {
  const { createMemorySummaryPresentation, createMemorySummaryTool } = await import('../modules/memory/presentation.js')
  const { createProductHarness } = await import('../agent-runtime/harness.js')
  type Memory = NonNullable<Awaited<ReturnType<typeof createLingxiOS>>['memory']>
  const scope = { tenantId: 'company', scopeType: 'session', scopeId: 'conversation' }
  const reads: Array<{ identity: MemoryIdentity; id: string }> = []
  let revoked = false
  let available = true
  const memory = {
    async scopes(identity: MemoryIdentity) { assert.equal(identity.workId, 'run'); if (revoked) throw new Error('revoked'); return [scope] },
    async read(identity: MemoryIdentity, receivedScope: unknown, id: string) {
      assert.deepEqual(receivedScope, scope); reads.push({ identity, id })
      return available ? { id, title: 'Preference', description: 'Prefers short examples', version: 4, status: 'active',
        body: 'PRIVATE BODY', sources: [{ sourceRef: 'PRIVATE SOURCE' }] } : null
    },
  } as unknown as Memory
  const control = async () => ({ memory })
  const card = createMemorySummaryPresentation(control)
  const tool = createMemorySummaryTool(control)
  const assembled = assembleHarness(createProductHarness([tool], control))
  assert.deepEqual(assembled.presentations.map(item => item.type), ['memory-summary'])
  assert.ok(assembled.tools.some(item => item.action === 'memory.summary'))
  assert.equal(tool.effect, 'read')
  assert.equal(tool.approval, false)
  assert.throws(() => tool.parse({ memoryId: 'a,b' }))
  assert.throws(() => tool.parse({ memoryId: 'memory_1', query: 'all' }))
  const context = { work: { id: 'run', tenantId: 'company', agentId: 'agent', principalId: 'human',
    sessionId: 'session', threadId: 'thread', kind: 'turn', lane: 'interactive', conversation: { conversationId: 'room' } },
    action: { action: 'presentation.render' }, database: { async query(sql: string) {
      if (sql.includes('FROM users')) return { rows: [{}] }
      if (sql.includes('teacher_managed')) return { rows: [{ capabilities: [], teacher_managed: false }] }
      throw new Error('unexpected query')
    } }, signal: new AbortController().signal } as unknown as ActionContext
  assert.deepEqual(card.actions, ['memory.summary'])
  assert.equal(card.type, 'memory-summary')
  await card.authorize(context, 'memory_1')
  assert.equal(reads.length, 1)
  const result = await card.resolve(context, 'memory_1')
  assert.equal(reads.length, 2)
  assert.deepEqual(reads[0], { identity: { tenantId: 'company', agentId: 'agent', principalId: 'human',
    sessionId: 'session', workId: 'run', threadId: 'thread' }, id: 'memory_1' })
  assert.deepEqual(result?.fields, { chips: [{ id: 'memory_1', text: 'Prefers short examples', change: 'existing', version: 4 }] })
  assert.equal(result?.sources[0].ref, 'memory:memory_1')
  assert.equal(result?.sources[0].version, '4')
  assert.ok(Number.isFinite(Date.parse(result!.sources[0].observedAt)))
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|scopeType|scopeId/)
  assert.equal(generativeComponentSchemas['memory-summary'].safeParse(result!.fields).success, true)
  assert.equal(generativeComponentSchemas['memory-summary'].safeParse({ ...result!.fields, body: 'private' }).success, false)
  await assert.rejects(card.resolve(context, 'memory_1,memory_2'))
  assert.equal(reads.length, 2)
  revoked = true
  await assert.rejects(card.resolve(context, 'memory_1'), /revoked/)
  revoked = false; available = false
  await assert.rejects(card.resolve(context, 'memory_1'), /unavailable/)
  await assert.rejects(card.resolve({ ...context, signal: AbortSignal.abort(new Error('cancelled')) }, 'memory_1'), /cancelled/)
})
