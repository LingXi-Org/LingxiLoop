import assert from 'node:assert/strict'
import test from 'node:test'
import type { HostPort } from '../src/host/port.js'
import type { KernelExecutor } from '../src/kernel/manager.js'
import type { ModelDriver } from '../src/model/driver.js'
import type {
  AssistantMessage, HeartbeatResult, HostAction, HostActionResult, RunEvent,
  SessionRecord, TurnContext, WorkCompletion, WorkItem,
} from '../src/protocol/types.js'
import { AgentRuntime } from '../src/runtime/runtime.js'
import { DefaultRuntimePolicy } from '../src/runtime/policy.js'

const work: WorkItem = {
  id: 'work-1', fence: 1, homeEpoch: 1, tenantId: 'tenant', agentId: 'agent',
  sessionId: 'session', kind: 'turn', lane: 'interactive', triggerRef: 'message-1', leaseToken: 'lease',
}

test('runtime refreshes every source version and emits only a validated, extended final message', async () => {
  const events: RunEvent[] = []
  let saved: SessionRecord | null = {
    key: 'tenant:agent:session:-', tenantId: 'tenant', agentId: 'agent', sessionId: 'session',
    history: [], appliedWorkIds: [], revision: 0, compactionEpoch: 0,
    promptContext: {
      version: 2, epoch: 0, assembledAt: 'earlier', systemInstructions: 'stale',
      persona: { name: 'Agent', role: 'role', instructions: 'instructions' }, capabilities: [],
      sourceVersions: { promptContract: 'prompt-v2', persona: 'same', knowledge: 'old' },
    },
  }
  let message: AssistantMessage | null = null
  const context: TurnContext = {
    work,
    persona: { name: 'Agent', role: 'role', instructions: 'instructions' }, capabilities: [],
    messages: [{ ref: 'message-1', authorId: 'user', authorName: 'User', authorKind: 'human', body: 'hello', createdAt: 'now' }],
    promptContextCandidate: {
      version: 2, epoch: 0, assembledAt: 'now', systemInstructions: '',
      persona: { name: 'Agent', role: 'role', instructions: 'instructions' }, capabilities: [],
      sourceVersions: { promptContract: 'prompt-v2', persona: 'same', knowledge: 'new' },
    },
  }
  const host: HostPort = {
    claimWork: async () => null,
    heartbeat: async (): Promise<HeartbeatResult> => ({ ok: true }),
    loadContext: async () => context,
    executeAction: async (_work: WorkItem, _action: HostAction): Promise<HostActionResult> => ({ ok: true }),
    emitEvent: async (_work: WorkItem, event: RunEvent) => { events.push(event) },
    loadSession: async () => saved,
    saveSession: async (_work: WorkItem, session: SessionRecord) => { saved = structuredClone(session) },
    commitMessage: async (_work: WorkItem, value: AssistantMessage) => { message = value },
    completeWork: async (_work: WorkItem, _completion: WorkCompletion) => undefined,
    yieldWork: async () => undefined,
  }
  const responses = ['<think>hidden</think>', 'accepted']
  const instructions: string[] = []
  const model: ModelDriver = {
    modelId: 'test',
    run: async (request) => {
      instructions.push(request.instructions)
      const text = responses.shift()!
      return {
        text, output: [{ role: 'assistant', content: text }], model: 'test',
        usage: { available: true, inputTokens: 1, outputTokens: 1 },
      }
    },
    structured: async () => ({ value: {}, model: 'test', usage: { available: true, inputTokens: 1, outputTokens: 1 } }),
    compact: async () => ({ value: '', model: 'test', usage: { available: true, inputTokens: 1, outputTokens: 1 } }),
  }
  const kernels: KernelExecutor = { execute: async () => { throw new Error('not used') } }
  class Policy extends DefaultRuntimePolicy {
    override assembleSystemPrompt(candidate: TurnContext['promptContextCandidate'] & {}): string {
      return `knowledge:${candidate.sourceVersions['knowledge']}`
    }
    override contextEvents() { return [{ kind: 'product.context.loaded', data: { safe: true } }] }
    override finalMessageExtension(_text: string, _context: TurnContext, state: { nextPartIndex: number }) {
      return {
        data: { product: true },
        events: [{ kind: 'product.finalized', data: { partIndexStart: state.nextPartIndex } }],
      }
    }
  }

  await new AgentRuntime(host, model, kernels, {
    policy: new Policy(), heartbeatMs: 60_000, promptContractVersion: 'prompt-v2',
  }).runWork(work)

  assert.deepEqual(instructions, ['knowledge:new', 'knowledge:new'])
  assert.deepEqual(message, {
    version: 2, runId: 'work-1', agentId: 'agent', sessionId: 'session', body: 'accepted', data: { product: true },
  })
  assert.equal(events.filter((event) => event.kind === 'model.delta').length, 1)
  assert.ok(events.some((event) => event.kind === 'response.withheld'))
  const deltaIndex = events.findIndex((event) => event.kind === 'model.delta')
  const finalModelIndex = events.findIndex((event, index) => index > deltaIndex && event.kind === 'model.completed')
  assert.ok(deltaIndex >= 0 && finalModelIndex > deltaIndex)
  assert.equal(events[finalModelIndex]!.data['finishPartIndex'], 0)
  assert.ok(events.some((event) => event.kind === 'product.context.loaded'))
  assert.deepEqual(events.find((event) => event.kind === 'product.finalized')?.data, { partIndexStart: 1 })
})
