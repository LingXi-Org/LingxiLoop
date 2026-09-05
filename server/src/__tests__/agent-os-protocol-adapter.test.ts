import assert from 'node:assert/strict'
import test from 'node:test'
import { toLingxiOSWork, toProductWork } from '../agent-os/protocol-adapter.js'

test('LingxiLoop work identity and trusted metadata round-trip through LingxiOS v2', () => {
  const core = toLingxiOSWork({
    id: 'work', fence: 3, homeEpoch: 2, companyId: 'company', authorizationUserId: 'human',
    agentId: 'agent', channelId: 'channel', threadRootClientMsgNo: 'thread', triggerClientMsgNo: 'message',
    reason: 'canvas_worker', executionRole: 'verifier', lane: 'learner', leaseToken: 'lease',
    canvasId: 'canvas', canvasAssignmentId: 'assignment', progressFingerprint: 'fingerprint', noProgressCount: 1,
  })
  assert.deepEqual({ tenantId: core.tenantId, sessionId: core.sessionId, threadId: core.threadId, lane: core.lane }, {
    tenantId: 'company', sessionId: 'channel', threadId: 'thread', lane: 'interactive',
  })
  assert.deepEqual(core.meta, {
    reason: 'canvas_worker', executionRole: 'verifier', canvasId: 'canvas', canvasAssignmentId: 'assignment',
    progressFingerprint: 'fingerprint', noProgressCount: 1,
  })
  assert.deepEqual(toProductWork(core), {
    id: 'work', fence: 3, homeEpoch: 2, companyId: 'company', authorizationUserId: 'human',
    agentId: 'agent', channelId: 'channel', threadRootClientMsgNo: 'thread', triggerClientMsgNo: 'message',
    reason: 'canvas_worker', executionRole: 'verifier', lane: 'learner', leaseToken: 'lease',
    canvasId: 'canvas', canvasAssignmentId: 'assignment', progressFingerprint: 'fingerprint', noProgressCount: 1,
  })
})
