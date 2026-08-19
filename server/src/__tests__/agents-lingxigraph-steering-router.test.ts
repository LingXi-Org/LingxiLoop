import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { _resetActiveLingxiGraphRunsForTests, registerActiveLingxiGraphRun } from '../agents/lingxigraph-active-runs.js'
import { routeLingxiGraphSteering } from '../agents/lingxigraph-steering-router.js'
import { LingxiGraphSteerError } from '../agents/lingxigraph-adapter.js'

beforeEach(_resetActiveLingxiGraphRunsForTests)
const message = { messageId: 'm1', conversationId: 'c1', authorId: 'u1', authorName: 'User', body: 'follow up', companyId: 'tenant-1' }

test('accepted and duplicate steering do not start a new turn', async () => {
  registerActiveLingxiGraphRun({ agentId: 'a1', runId: 'r1', companyId: 'tenant-1' })
  for (const outcome of ['accepted', 'duplicate'] as const) {
    const calls: unknown[] = []
    const routed = await routeLingxiGraphSteering('a1', message, async (request) => {
      calls.push(request)
      return { outcome, eventId: 'e1' }
    })
    assert.equal(routed.handled, true)
    assert.equal((calls[0] as { idempotencyKey: string }).idempotencyKey, 'm1')
  }
})

test('terminal/permanent failures fall back, transient ambiguity does not double-process, and tenant mismatch never submits', async () => {
  registerActiveLingxiGraphRun({ agentId: 'a1', runId: 'r1', companyId: 'tenant-1' })
  assert.equal((await routeLingxiGraphSteering('a1', message, async () => ({ outcome: 'terminal', eventId: null, reason: 'finalizing' }))).handled, false)
  assert.equal((await routeLingxiGraphSteering('a1', message, async () => { throw new Error('invalid') })).handled, false)
  assert.equal((await routeLingxiGraphSteering('a1', message, async () => { throw new LingxiGraphSteerError('timeout', true) })).handled, true)
  let called = false
  assert.equal((await routeLingxiGraphSteering('a1', { ...message, companyId: 'tenant-2' }, async () => { called = true; return { outcome: 'accepted', eventId: null } })).handled, false)
  assert.equal(called, false)
})
