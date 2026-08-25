import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryHostAdapter } from '../agent-os/host-adapter.js'
import type { KernelExecutor } from '../agent-os/kernel-manager.js'
import { type AgentModelDriver, ModelAdapterError, type ModelTurnResult, ScriptedModelDriver } from '../agent-os/model-driver.js'
import { AgentOSRuntime, canvasContextContract } from '../agent-os/runtime.js'
import type { AgentContext, AgentWorkItem, KernelExecution, ModelItem } from '../agent-os/types.js'

function work(id: string, trigger: string): AgentWorkItem {
  return { id, fence: 1, companyId: 'co-1', agentId: 'nova', channelId: 'study', triggerClientMsgNo: trigger, reason: 'message', lane: 'learner', leaseToken: `lease-${id}` }
}

function context(item: AgentWorkItem, body: string): AgentContext {
  return {
    work: item,
    persona: { name: 'Nova', role: '学习统筹与教练', instructions: 'Coach the learner.' },
    messages: [{ clientMsgNo: item.triggerClientMsgNo, authorId: 'student', authorName: 'Student', authorKind: 'human', body, createdAt: '2026-08-23T00:00:00.000Z' }],
  }
}

class StatefulKernel implements KernelExecutor {
  readonly cells: string[] = []
  private value = 0
  async execute(_work: AgentWorkItem, _runId: string, _cellId: string, code: string): Promise<KernelExecution> {
    this.cells.push(code)
    const match = /score\s*=\s*(\d+)/.exec(code)
    if (match) this.value = Number(match[1])
    return { executionId: `cell-${this.cells.length}`, stdout: '', stderr: '', result: this.value, durationMs: 1, truncated: false, artifacts: [] }
  }
}

class RecordingModel implements AgentModelDriver {
  readonly instructions: string[] = []
  readonly items: ModelItem[][] = []
  async run(args: { instructions: string; items: ModelItem[] }): Promise<ModelTurnResult> {
    this.instructions.push(args.instructions)
    this.items.push(structuredClone(args.items))
    return { output: [{ role: 'assistant', content: 'ok' }], text: 'ok', usage: { inputTokens: 1, outputTokens: 1 } }
  }
  async compact(): Promise<string> { return 'summary' }
  async structured(): Promise<unknown> { return {} }
}

test('Canvas contract tells agents to autonomously decide and start via IPython', () => {
  const contract = canvasContextContract([{ id: 'sage', capabilities: ['canvas'] }])
  assert.match(contract, /Proactively start a Canvas workspace/)
  assert.match(contract, /loop\.canvas\.available_agents\(\)/)
  assert.match(contract, /loop\.canvas\.start_workspace/)
  assert.match(contract, /Never ask the human to open Canvas, select agents, or allocate work/)
  assert.match(contract, /Do not create a workspace for a quick single-agent answer/)
  assert.match(contract, /loop\.canvas\.get\(canvasId=canvas_id\)/)
  assert.match(contract, /loop\.canvas\.create_frame\(canvasId=canvas_id, type="markdown"/)
  assert.match(contract, /loop\.canvas\.set_status\(canvasId=canvas_id/)
  assert.match(contract, /baseRevision=current\["revision"\]/)
  assert.match(contract, /loop\.canvas\.append_content\(frameId=frame\["id"\]/)
  assert.match(contract, /loop\.canvas\.handoff\(canvasId=canvas_id/)
  assert.match(contract, /Human right-click @ assignments and card feedback/)
  assert.match(contract, /"id":"sage"/)
})

test('Agent OS runs multi-hop IPython and keeps the channel session across work items', async () => {
  const first = work('w1', 'm1')
  const second = work('w2', 'm2')
  const host = new MemoryHostAdapter()
  host.contexts.set(first.id, context(first, 'Set my baseline score to 7.'))
  host.contexts.set(second.id, context(second, 'What score did we save?'))
  const model = new ScriptedModelDriver([
    { output: [{ type: 'function_call', callId: 'c1', name: 'ipython', arguments: '{"code":"score = 7"}' }], text: '', usage: { inputTokens: 10, outputTokens: 3 } },
    { output: [{ role: 'assistant', content: 'Baseline saved.' }], text: 'Baseline saved.', usage: { inputTokens: 12, outputTokens: 3 } },
    { output: [{ role: 'assistant', content: 'Your baseline is 7.' }], text: 'Your baseline is 7.', usage: { inputTokens: 14, outputTokens: 5 } },
  ])
  const kernel = new StatefulKernel()
  const runtime = new AgentOSRuntime(host, model, kernel, { heartbeatMs: 60_000 })

  await runtime.runWork(first)
  await runtime.runWork(second)

  assert.deepEqual(kernel.cells, ['score = 7'])
  assert.equal(host.messages[0]?.body, 'Baseline saved.')
  assert.equal(host.messages[0]?.clientMsgNo, 'agent-w1')
  assert.equal(host.messages[1]?.body, 'Your baseline is 7.')
  assert.equal(host.sessions.size, 1)
  const history = [...host.sessions.values()][0]?.history ?? []
  assert.ok(history.some((item) => 'type' in item && item.type === 'function_call_output'))
  assert.equal(host.outcomes.get(first.id)?.status, 'completed')
  assert.equal(host.outcomes.get(second.id)?.status, 'completed')
})

test('an empty model response fails once with adapter diagnostics, not a hop-limit error', async () => {
  const item = work('empty-model', 'm-empty')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Hello?'))
  const diagnostics = { chunkCount: 1, choiceCount: 1, finishReasons: ['stop'], contentLength: 0, toolCallCount: 0, chunkShapes: ['{"deltaKeys":["role"]}'] }
  const model: AgentModelDriver = {
    run: async () => { throw new ModelAdapterError('model returned no assistant content or supported tool calls', diagnostics) },
    compact: async () => '',
    structured: async () => ({}),
  }
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  const started = host.events.filter((event) => event.kind === 'model.started')
  const failed = host.events.find((event) => event.kind === 'run.failed')
  assert.equal(started.length, 1)
  assert.match(String(failed?.data.error), /no assistant content/)
  assert.deepEqual(failed?.data.modelDiagnostics, diagnostics)
  assert.doesNotMatch(String(host.outcomes.get(item.id)?.error), /model hops/)
})

test('PromptContext stays frozen within one compaction epoch', async () => {
  const first = work('prompt-1', 'prompt-message-1'), second = work('prompt-2', 'prompt-message-2')
  const host = new MemoryHostAdapter()
  const base = (item: AgentWorkItem, marker: string): AgentContext => ({
    ...context(item, marker), learnerId: 'student', promptContextCandidate: {
      version: 1, epoch: 0, assembledAt: '2026-08-24T00:00:00.000Z', systemInstructions: marker,
      persona: { name: 'Nova', role: 'Coach', instructions: marker }, capabilities: ['canvas'],
      memories: { learner: [], course: [], agentRole: [] }, sourceVersions: { persona: marker },
    },
  })
  host.contexts.set(first.id, base(first, 'frozen-v1'))
  host.contexts.set(second.id, base(second, 'changed-v2'))
  const model = new RecordingModel()
  const runtime = new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 })
  await runtime.runWork(first)
  await runtime.runWork(second)
  assert.equal(model.instructions.length, 2)
  assert.match(model.instructions[0], /frozen-v1/)
  assert.match(model.instructions[1], /frozen-v1/)
  assert.doesNotMatch(model.instructions[1], /changed-v2/)
  assert.equal([...host.sessions.values()][0]?.compactionEpoch, 0)
})

test('retrying the same durable work does not inject its trigger twice', async () => {
  const item = { ...work('retry-work', 'retry-message'), fence: 3 }
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Do not duplicate me.'))
  host.sessions.set('co-1:nova:study:-', {
    key: 'co-1:nova:study:-', companyId: 'co-1', agentId: 'nova', channelId: 'study',
    history: [{ role: 'user', content: 'Do not duplicate me.' }, { role: 'assistant', content: 'Partial work.' }],
    appliedWorkIds: [item.id], revision: 1, compactionEpoch: 0,
  })
  const model = new RecordingModel()
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  const serialized = JSON.stringify(model.items[0])
  assert.equal(serialized.match(/Do not duplicate me\./g)?.length, 1)
  assert.ok(host.events[0]?.seq >= 200_001)
})

test('soft context limit summarizes with the same model driver', async () => {
  const item = work('compact', 'm-compact')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'A'.repeat(2_000)))
  const model = new ScriptedModelDriver([
    { output: [{ role: 'assistant', content: 'Compacted.' }], text: 'Compacted.', usage: { inputTokens: 10, outputTokens: 2 } },
  ])
  const runtime = new AgentOSRuntime(host, model, new StatefulKernel(), {
    heartbeatMs: 60_000, contextWindowTokens: 100, compactSoftRatio: 0.75, compactHardRatio: 0.9,
  })
  await runtime.runWork(item)
  assert.match([...host.sessions.values()][0]?.summary ?? '', /Summary of/)
})

test('Canvas start directive persists the session and defers without a fake chat answer', async () => {
  const item = work('canvas-start', 'm-canvas')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Use a shared workspace if it helps.'))
  const model = new ScriptedModelDriver([{ output: [{ type: 'function_call', callId: 'c1', name: 'ipython', arguments: '{"code":"loop.canvas.start_workspace(title=\'Study\', goal=\'Learn\', members=[])"}' }], text: '', usage: { inputTokens: 10, outputTokens: 4 } }])
  const kernel: KernelExecutor = { execute: async () => ({ executionId: 'cell', stdout: '', stderr: '', result: { id: 'canvas-1' }, durationMs: 1, truncated: false, artifacts: [], directives: [{ type: 'defer_to_canvas', canvasId: 'canvas-1' }] }) }
  await new AgentOSRuntime(host, model, kernel, { heartbeatMs: 60_000 }).runWork(item)
  assert.equal(host.messages.length, 0)
  assert.equal(host.sessions.size, 1)
  assert.equal(host.outcomes.get(item.id)?.status, 'completed')
})

test('Canvas worker stores its final result without replying in the source conversation', async () => {
  const item: AgentWorkItem = { ...work('canvas-worker', 'canvas:c:a'), reason: 'canvas_worker', lane: 'collaboration', canvasId: 'c', canvasAssignmentId: 'a' }
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, { ...context(item, 'Research the assigned topic.'), canvas: { id: 'c', title: 'Study', goal: 'Learn', status: 'active', initiatorAgentId: 'nova', assignments: [], frames: [], activity: [] } })
  const model = new ScriptedModelDriver([{ output: [{ role: 'assistant', content: 'Worker result' }], text: 'Worker result', usage: { inputTokens: 10, outputTokens: 3 } }])
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  assert.equal(host.messages.length, 0)
  assert.equal(host.outcomes.get(item.id)?.resultText, 'Worker result')
})
