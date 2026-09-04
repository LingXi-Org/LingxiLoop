import assert from 'node:assert/strict'
import test from 'node:test'
import type { TurnContext, WorkItem } from '../../../third_party/lingxios/src/protocol/types.js'
import {
  LingxiLoopRuntimePolicy,
  canvasContextContract,
  knowledgeContextContract,
  learningContextContract,
} from '../agent-os/runtime.js'

function work(meta: Record<string, unknown> = {}): WorkItem {
  return {
    id: 'work-1', fence: 1, homeEpoch: 1, tenantId: 'company', agentId: 'agent', sessionId: 'channel',
    triggerRef: 'message-1', kind: 'turn', lane: 'interactive', principalId: 'learner', leaseToken: 'lease',
    meta: { reason: 'message', executionRole: 'coordinator', ...meta },
  }
}

function context(dynamic: Record<string, unknown> = {}, meta: Record<string, unknown> = {}): TurnContext {
  const item = work(meta)
  return {
    work: item,
    persona: { name: 'Nova', role: 'Learning Agent', instructions: 'Teach precisely.' },
    capabilities: ['knowledge', 'learning', 'canvas'],
    messages: [{
      ref: item.triggerRef, authorId: 'learner', authorName: 'Learner', authorKind: 'human',
      body: 'Explain the source.', createdAt: '2026-09-04T00:00:00.000Z',
    }],
    dynamic: { product: dynamic },
  }
}

test('LingxiLoop policy grants only role-safe host namespaces', () => {
  const policy = new LingxiLoopRuntimePolicy()
  const grants = policy.kernelCapabilities(context({}, { executionRole: 'reporter' }))
  assert.ok(grants.every((grant) => !['email', 'calendar', 'documents', 'routines'].includes(grant.name)))
  assert.ok(grants.some((grant) => grant.name === 'knowledge' && grant.methods?.includes('list_sources')))
  assert.match(canvasContextContract([], 'coordinator'), /host\.canvas\.start_workspace/)
  assert.match(learningContextContract(), /host\.learning/)
  assert.match(knowledgeContextContract(), /host\.knowledge/)
})

test('planning and Canvas completion gates remain product-owned', () => {
  const policy = new LingxiLoopRuntimePolicy()
  const planning = context({ learningContext: { activeMission: { status: 'PLANNING' } } })
  assert.equal(policy.completionGate(planning, planning.work).allowed, false)
  const canvas = context({ canvas: { reports: [] } }, {
    reason: 'canvas_worker', executionRole: 'specialist', canvasId: 'canvas-1', canvasAssignmentId: 'assignment-1',
  })
  assert.match(policy.completionGate(canvas, canvas.work).instruction ?? '', /host\.canvas\.submit_report/)
})

test('RAG extension validates citations and emits bounded assistant-ui metadata', () => {
  const policy = new LingxiLoopRuntimePolicy()
  const turn = context({
    knowledgeSourceCount: 1,
    knowledgeContext: [{
      sourceId: 'source-1', sourceTitle: 'Reference', chunkId: 'chunk-1', excerpt: 'Evidence',
      position: 0, page: 2, marker: 'S1',
    }],
  })
  const extension = policy.finalMessageExtension('[Supported claim.](#cite-S1)', turn, { nextPartIndex: 1 })
  assert.deepEqual(extension.events?.[0]?.data.partIndexStart, 1)
  assert.deepEqual((extension.data!.rag as { documentReferences: unknown[] }).documentReferences, [{
    marker: 'S1', sourceId: 'source-1', title: 'Reference', pages: 2, anchors: [{ page: 2, quote: 'Evidence' }],
  }])
  assert.throws(() => policy.finalMessageExtension('[Unknown.](#cite-S2)', turn, { nextPartIndex: 1 }), /unknown evidence/)
  assert.match(policy.validateAssistantText('host.canvas.get(canvasId="x")', turn, { completedHostAction: false }) ?? '', /SDK/)
})
