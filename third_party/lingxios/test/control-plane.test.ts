import assert from 'node:assert/strict'
import test from 'node:test'
import { ControlPlaneService } from '../src/control-plane/service.js'
import {
  MemoryActionLedger,
  MemoryEventStore,
  MemorySessionStore,
  MemoryWorkStore,
} from '../src/control-plane/memory-store.js'
import type { WorkItem } from '../src/protocol/types.js'

test('validated lease proof reaches the product action executor', async () => {
  const workStore = new MemoryWorkStore()
  let executedWork: WorkItem | undefined
  const service = new ControlPlaneService({
    work: workStore,
    sessions: new MemorySessionStore(),
    events: new MemoryEventStore(),
    actions: new MemoryActionLedger(),
    contextProvider: { async loadContext() { throw new Error('not used') } },
    actionExecutor: {
      async execute(work) {
        executedWork = work
        return { ok: true }
      },
    },
    capabilityResolver: { async resolve() { return [{ name: 'chat' }] } },
    delivery: {
      async onEvent() {},
      async deliverMessage() {},
    },
  })
  await service.enqueue({
    id: 'work-1', tenantId: 'tenant-1', agentId: 'agent-1', sessionId: 'session-1',
    kind: 'turn', lane: 'interactive', triggerRef: 'message-1', principalId: 'user-1',
  })
  const work = await service.claim('worker-1')
  assert.ok(work)
  const result = await service.executeAction(
    { id: work.id, fence: work.fence, leaseToken: work.leaseToken },
    {
      runId: work.id, cellId: 'cell-1', callIndex: 0, action: 'chat.send', args: { body: 'hello' },
      idempotencyKey: `${work.id}:cell-1:0`,
    },
  )
  assert.equal(result.ok, true)
  assert.equal(executedWork?.leaseToken, work.leaseToken)
})
