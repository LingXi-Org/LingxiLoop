import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryHostAdapter } from '../agent-os/host-adapter.js'
import { KernelExecutionError, type KernelExecutor } from '../agent-os/kernel-manager.js'
import { type AgentModelDriver, ModelAdapterError, type ModelTurnResult, ScriptedModelDriver } from '../agent-os/model-driver.js'
import { AgentOSRuntime, canvasContextContract, knowledgeContextContract } from '../agent-os/runtime.js'
import {
  type AgentContext,
  type AgentWorkItem,
  type KernelExecution,
  KNOWLEDGE_CONTRACT_VERSION,
  type ModelItem,
} from '../agent-os/types.js'

function work(id: string, trigger: string): AgentWorkItem {
  return { id, fence: 1, companyId: 'co-1', agentId: 'nova', channelId: 'study', triggerClientMsgNo: trigger, reason: 'message', executionRole:'coordinator',lane: 'learner', leaseToken: `lease-${id}` }
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
  async run(args: Parameters<AgentModelDriver['run']>[0]): Promise<ModelTurnResult> {
    this.instructions.push(args.instructions)
    this.items.push(structuredClone(args.items))
    await args.onTextDelta?.('ok')
    return { output: [{ role: 'assistant', content: 'ok' }], text: 'ok', usage: { inputTokens: 1, outputTokens: 1 } }
  }
  async compact() { return { model: 'test', value: 'summary', usage: { inputTokens: 0, outputTokens: 0, available: false } } }
  async structured() { return { model: 'test', value: {}, usage: { inputTokens: 0, outputTokens: 0, available: false } } }
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
  assert.match(contract, /Human feedback arrives as current steering input/)
  assert.match(contract, /loop\.canvas\.submit_report/)
  assert.match(contract, /"id":"sage"/)
})

test('Learning runtime contract requires canonical Evidence IDs', async () => {
  const { learningContextContract } = await import('../agent-os/runtime.js')
  const contract = learningContextContract()
  assert.match(contract, /add_steps\(missionId=mission\["id"\], steps=/)
  assert.match(contract, /every step requires its own non-empty description and successCriteria/)
  assert.match(contract, /method is add_steps \(plural\)/)
  assert.match(contract, /sourceEvidenceId/)
  assert.match(contract, /verifierEvidenceId/)
  assert.doesNotMatch(contract, /sourceReportId|verifierReportId/)
})

test('an active planning Mission receives the exact add_steps recipe on every model hop', async () => {
  const item = work('planning-recipe', 'planning-message')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, {
    ...context(item, 'Create the Mission board.'),
    learningContext: {
      project: { id: 'project-1', kind: 'PERSONAL_LEARNING', title: 'Project', status: 'ACTIVE' },
      roomPurpose: 'study',
      learnerId: 'student',
      activeMission: {
        id: 'mission-1', projectId: 'project-1', learnerId: 'student', conversationId: 'study',
        triggerClientMsgNo: item.triggerClientMsgNo, goal: 'Learn nodes', successCriteria: 'Build a working graph',
        kind: 'STUDY', coordinatorAgentId: 'nova', status: 'PLANNING', steps: [],
        createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
      },
      knowledgeUnits: [], due: [], pendingTeacherReviews: 0,
    },
  })
  const model = new RecordingModel()

  await new AgentOSRuntime(host, model, new StatefulKernel(), { maxHops: 1, heartbeatMs: 60_000 }).runWork(item)

  const modelInput = JSON.stringify(model.items[0])
  assert.match(modelInput, /Planning correction/)
  assert.match(modelInput, /loop\.learning\.add_steps/)
  assert.match(modelInput, /every step requires its own non-empty description and successCriteria/)
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
  assert.deepEqual(host.events.filter((event) => event.kind.startsWith('ipython.')).map((event) => event.data), [
    { callId: 'c1', partIndex: 0, codePreview: 'score = 7' },
    { callId: 'c1', partIndex: 0, durationMs: 1, truncated: false, artifactCount: 0 },
  ])
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
    compact: async () => ({ model: 'test', value: '', usage: { inputTokens: 0, outputTokens: 0, available: false } }),
    structured: async () => ({ model: 'test', value: {}, usage: { inputTokens: 0, outputTokens: 0, available: false } }),
  }
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  const started = host.events.filter((event) => event.kind === 'model.started')
  const failed = host.events.find((event) => event.kind === 'run.failed')
  assert.equal(started.length, 1)
  assert.ok(failed?.data && typeof failed.data === 'object')
  const failedData = failed.data as Record<string, unknown>
  assert.match(String(failedData.error), /no assistant content/)
  assert.deepEqual(failedData.modelDiagnostics, diagnostics)
  assert.doesNotMatch(String(host.outcomes.get(item.id)?.error), /model hops/)
})

test('PromptContext refreshes when the persona source version changes', async () => {
  const first = work('prompt-1', 'prompt-message-1'), second = work('prompt-2', 'prompt-message-2')
  const host = new MemoryHostAdapter()
  const base = (item: AgentWorkItem, marker: string): AgentContext => ({
    ...context(item, marker), learnerId: 'student', promptContextCandidate: {
      version: 1, epoch: 0, assembledAt: '2026-08-24T00:00:00.000Z', systemInstructions: marker,
      persona: { name: 'Nova', role: 'Coach', instructions: marker }, capabilities: ['canvas'],
      executionRole:'coordinator',
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
  assert.match(model.instructions[1], /changed-v2/)
  assert.equal([...host.sessions.values()][0]?.compactionEpoch, 0)
})

test('Knowledge contract exposes native IPython operations without external scope IDs', () => {
  const contract = knowledgeContextContract()
  assert.match(contract, new RegExp(KNOWLEDGE_CONTRACT_VERSION))
  assert.match(contract, /loop\.knowledge/)
  assert.match(contract, /Retrieval is automatic and turn-local/)
  assert.match(contract, /\[claim\]\(#cite-S<n>\)/)
  assert.doesNotMatch(contract, /\[S<n>\] markers/)
  assert.doesNotMatch(contract, /get_source\(|search\(/)
  assert.match(contract, /add_file\(clientMsgNo=/)
  assert.match(contract, /set_source_enabled\(sourceId=/)
  assert.match(contract, /delete_source\(sourceId=/)
  assert.match(contract, /Open Notebook never generates an answer/)
  assert.doesNotMatch(contract, /ask\(|create_note\(|create_insight\(|start_source_chat\(|update_source\(|unlink_source\(/)
  assert.match(contract, /Host fixes company, project, notebook, conversation and human authorization scope/)
  assert.doesNotMatch(contract, /notebookId=/)
})

test('a natural learner-facing question remains ordinary text', async () => {
  const item = work('natural-question', 'natural-question-message')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, '制定本周高数复习计划'))
  const question = '你目前复习到哪里？每天大约有多少可用时间？'
  const model = new ScriptedModelDriver([{
    output: [{ role: 'assistant', content: question }],
    text: question,
    usage: { inputTokens: 1, outputTokens: 1 },
  }])
  const kernel = new StatefulKernel()

  await new AgentOSRuntime(host, model, kernel, { heartbeatMs: 60_000 }).runWork(item)

  assert.deepEqual(kernel.cells, [])
  assert.equal(host.messages[0]?.body, question)
  assert.match(JSON.stringify(host.events.filter((event) => event.kind === 'model.delta')), /你目前复习到哪里/)
})

test('a recoverable IPython error is returned to the model before its next hop', async () => {
  const item = work('recoverable-ipython', 'm-recoverable-ipython')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Answer without unsupported source tools.'))
  const model = new ScriptedModelDriver([
    {
      output: [{ type: 'function_call', callId: 'bad-call', name: 'ipython', arguments: '{"code":"from loop.knowledge import search"}' }],
      text: '', usage: { inputTokens: 1, outputTokens: 1 },
    },
    {
      output: [{ role: 'assistant', content: 'Recovered.' }],
      text: 'Recovered.', usage: { inputTokens: 1, outputTokens: 1 },
    },
  ])
  const kernel: KernelExecutor = {
    execute: async () => { throw new KernelExecutionError("cannot import name 'search'", 'cell-1') },
  }

  await new AgentOSRuntime(host, model, kernel, { heartbeatMs: 60_000 }).runWork(item)

  assert.equal(host.messages[0]?.body, 'Recovered.')
  assert.equal(host.outcomes.get(item.id)?.status, 'completed')
  assert.equal(host.events.filter((event) => event.kind === 'ipython.failed').length, 1)
  assert.match(JSON.stringify([...host.sessions.values()][0]?.history), /cannot import name 'search'/)
})

test('repeated invalid question-card Python stops after one correction', async () => {
  const item = work('invalid-question-card', 'invalid-question-card-message')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, '制定高数复习计划'))
  const invalidTurn = (callId: string) => ({
    output: [{
      type: 'function_call' as const, callId, name: 'ipython' as const,
      arguments: '{"code":"loop.chat.ask(title=\\"复习计划\\", items=[{\\"choices\\": [\\"未闭合}])"}',
    }],
    text: '', usage: { inputTokens: 1, outputTokens: 1 },
  })
  const model = new ScriptedModelDriver([invalidTurn('bad-1'), invalidTurn('bad-2')])
  let attempts = 0
  const kernel: KernelExecutor = {
    execute: async () => {
      attempts += 1
      throw new KernelExecutionError('SyntaxError: unterminated string literal', `cell-${attempts}`)
    },
  }

  await new AgentOSRuntime(host, model, kernel, { maxHops: 12, heartbeatMs: 60_000 }).runWork(item)

  assert.equal(attempts, 2)
  assert.equal(host.outcomes.get(item.id)?.status, 'failed')
  assert.deepEqual(host.events.filter((event) => event.kind === 'ipython.failed').map((event) => event.data), [
    { callId: 'bad-1', partIndex: 0, error: 'SyntaxError: unterminated string literal', recoverable: true },
    { callId: 'bad-2', partIndex: 1, error: 'SyntaxError: unterminated string literal', recoverable: false },
  ])
})

test('invalid IPython arguments produce a paired error and one correction hop', async () => {
  const item = work('invalid-ipython-args', 'm-invalid-ipython-args')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Calculate it.'))
  const model = new ScriptedModelDriver([
    {
      output: [{ type: 'function_call', callId: 'invalid-call', name: 'ipython', arguments: '{"code":"","extra":true}' }],
      text: '', usage: { inputTokens: 1, outputTokens: 1 },
    },
    {
      output: [{ role: 'assistant', content: '已改用有效参数完成回答。' }],
      text: '已改用有效参数完成回答。', usage: { inputTokens: 1, outputTokens: 1 },
    },
  ])
  const kernel = new StatefulKernel()

  await new AgentOSRuntime(host, model, kernel, { heartbeatMs: 60_000 }).runWork(item)

  assert.deepEqual(kernel.cells, [])
  const history = [...host.sessions.values()][0]?.history ?? []
  assert.ok(history.some((entry) => 'type' in entry
    && entry.type === 'function_call_output'
    && entry.callId === 'invalid-call'
    && entry.output.includes('protocolError')))
  assert.equal(host.messages[0]?.body, '已改用有效参数完成回答。')
})

test('multiple IPython calls execute nothing and pair an error with every call ID', async () => {
  const item = work('multiple-ipython-calls', 'm-multiple-ipython-calls')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Calculate it.'))
  const model = new ScriptedModelDriver([
    {
      output: [
        { type: 'function_call', callId: 'call-a', name: 'ipython', arguments: '{"code":"1 + 1"}' },
        { type: 'function_call', callId: 'call-b', name: 'ipython', arguments: '{"code":"2 + 2"}' },
      ],
      text: '', usage: { inputTokens: 1, outputTokens: 1 },
    },
    {
      output: [{ role: 'assistant', content: '已纠正。' }],
      text: '已纠正。', usage: { inputTokens: 1, outputTokens: 1 },
    },
  ])
  const kernel = new StatefulKernel()

  await new AgentOSRuntime(host, model, kernel, { heartbeatMs: 60_000 }).runWork(item)

  assert.deepEqual(kernel.cells, [])
  const outputs = ([...host.sessions.values()][0]?.history ?? [])
    .filter((entry) => 'type' in entry && entry.type === 'function_call_output')
  assert.deepEqual(outputs.map((entry) => entry.callId), ['call-a', 'call-b'])
  assert.equal(host.messages[0]?.body, '已纠正。')
})

test('a malformed tool finish retries once through the same native model stream', async () => {
  const item = work('malformed-tool', 'm-malformed-tool')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Hello?'))
  const diagnostics = {
    chunkCount: 3,
    choiceCount: 2,
    finishReasons: ['tool_calls'],
    contentLength: 0,
    toolCallCount: 0,
    chunkShapes: ['{"finishReason":"tool_calls"}'],
  }
  const inputs: ModelItem[][] = []
  let calls = 0
  const model: AgentModelDriver = {
    run: async (args) => {
      inputs.push(args.items)
      calls += 1
      if (calls === 1) throw new ModelAdapterError('tool finish omitted tool calls', diagnostics)
      await args.onTextDelta?.('Recovered answer')
      return {
        output: [{ role: 'assistant', content: 'Recovered answer' }],
        text: 'Recovered answer',
        usage: { inputTokens: 1, outputTokens: 2 },
      }
    },
    compact: async () => ({ model: 'test', value: '', usage: { inputTokens: 0, outputTokens: 0, available: false } }),
    structured: async () => ({ model: 'test', value: {}, usage: { inputTokens: 0, outputTokens: 0, available: false } }),
  }
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  assert.equal(calls, 2)
  assert.match(JSON.stringify(inputs[1]), /Protocol correction/)
  assert.equal(host.events.filter((event) => event.kind === 'model.failed').length, 1)
  assert.equal(host.messages[0]?.body, 'Recovered answer')
})

test('Agent OS emits native reasoning and text part identities from model callbacks', async () => {
  const item = work('native-parts', 'm-native-parts')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Explain briefly.'))
  const model: AgentModelDriver = {
    run: async (args) => {
      await args.onReasoningDelta?.('Inspecting context')
      await args.onTextDelta?.('Final answer')
      return {
        output: [{ role: 'assistant', content: 'Final answer' }],
        text: 'Final answer',
        usage: { inputTokens: 1, outputTokens: 2 },
      }
    },
    compact: async () => ({ model: 'test', value: '', usage: { inputTokens: 0, outputTokens: 0, available: false } }),
    structured: async () => ({ model: 'test', value: {}, usage: { inputTokens: 0, outputTokens: 0, available: false } }),
  }
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  assert.deepEqual(host.events.filter((event) => event.kind === 'model.delta').map((event) => event.data), [
    { delta: 'Inspecting context', partType: 'reasoning', partIndex: 0, partStart: true },
    { delta: 'Final answer', partType: 'text', partIndex: 1, partStart: true, finishPartIndex: 0 },
  ])
  const completed = host.events.find((event) => event.kind === 'model.completed')
  assert.ok(completed)
  assert.equal((completed.data as { finishPartIndex?: number }).finishPartIndex, 1)
})

test('Agent OS rejects model text that bypasses the native delta stream', async () => {
  const item = work('direct-text', 'direct-text-message')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Do not bypass streaming.'))
  const model: AgentModelDriver = {
    run: async () => ({
      output: [{ role: 'assistant', content: 'Direct result' }],
      text: 'Direct result',
      usage: { inputTokens: 1, outputTokens: 2 },
    }),
    compact: async () => ({ model: 'test', value: '', usage: { inputTokens: 0, outputTokens: 0, available: false } }),
    structured: async () => ({ model: 'test', value: {}, usage: { inputTokens: 0, outputTokens: 0, available: false } }),
  }
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  assert.equal(host.messages.length, 0)
  assert.match(String(host.outcomes.get(item.id)?.error), /outside the native delta stream/)
})

test('tool-call narration is not streamed into the durable final answer', async () => {
  const item = work('multi-hop-text', 'multi-hop-text-message')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, context(item, 'Inspect and answer.'))
  const model = new ScriptedModelDriver([
    {
      output: [
        { role: 'assistant', content: 'Checking. ' },
        { type: 'function_call', callId: 'inspect', name: 'ipython', arguments: '{"code":"1 + 1"}' },
      ],
      text: 'Checking. ', usage: { inputTokens: 1, outputTokens: 1 },
    },
    { output: [{ role: 'assistant', content: 'Done.' }], text: 'Done.', usage: { inputTokens: 1, outputTokens: 1 } },
  ])
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  const streamed = host.events
    .filter((event) => event.kind === 'model.delta' && (event.data as { partType?: string }).partType === 'text')
    .map((event) => (event.data as { delta: string }).delta)
    .join('').trim()
  assert.equal(streamed, 'Done.')
  assert.equal(host.messages[0]?.body, streamed)
})

test('knowledge evidence uses one exact streamed and durable confidence-link protocol', async () => {
  const item = work('knowledge-turn', 'knowledge-message')
  const host = new MemoryHostAdapter()
  host.contexts.set(item.id, {
    ...context(item, 'What does the uploaded brief say?'),
    knowledgeSourceCount: 1,
    knowledgeContext: [{
      sourceId: 'source-1', sourceTitle: 'Brief.pdf', chunkId: 'chunk-1',
      excerpt: 'EVIDENCE_ONLY_TOKEN: launch date October 4.', position: 2, marker: 'S1',
    }],
  })
  const rawText = '[The launch date is October 4](#cite-S1).'
  const model: AgentModelDriver = {
    run: async (args) => {
      for (const delta of ['[The launch date', ' is October 4]', '(#cite-', 'S1).']) {
        await args.onTextDelta?.(delta)
      }
      return {
        output: [{ role: 'assistant', content: rawText }],
        text: rawText,
        usage: { inputTokens: 10, outputTokens: 8 },
      }
    },
    compact: async () => ({ model: 'test', value: '', usage: { inputTokens: 0, outputTokens: 0, available: false } }),
    structured: async () => ({ model: 'test', value: {}, usage: { inputTokens: 0, outputTokens: 0, available: false } }),
  }
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  const message = host.messages[0]
  const knowledgeEvent = host.events.find((event) => event.kind === 'knowledge.context.loaded')
  assert.ok(knowledgeEvent)
  assert.equal(knowledgeEvent.seq, 3)
  assert.deepEqual((knowledgeEvent.data as { previewClaims?: unknown }).previewClaims, [{
      id: 'S1',
      text: '',
      confidence: 'grounded',
      basis: 'Brief.pdf · EVIDENCE_ONLY_TOKEN: launch date October 4.',
      sourceId: 'source-1',
      sourceTitle: 'Brief.pdf',
      excerpt: 'EVIDENCE_ONLY_TOKEN: launch date October 4.',
      position: 2,
  }])
  const streamDeltas = host.events.filter((event) => event.kind === 'model.delta')
  assert.equal(streamDeltas.map((event) => (event.data as { delta: string }).delta).join(''), rawText)
  assert.ok(streamDeltas[0])
  assert.equal((streamDeltas[0].data as { partIndex?: number }).partIndex, 1)
  assert.deepEqual(message.refs?.sourceIds, ['source-1'])
  const citations = message.data?.citations
  assert.ok(Array.isArray(citations))
  assert.deepEqual((citations as Array<{ marker: string }>).map((citation) => citation.marker), ['S1'])
  assert.equal('chunkId' in (citations as Array<Record<string, unknown>>)[0]!, false)
  assert.equal(message.body, rawText)
  assert.deepEqual(message.data?.confidenceClaims, [{
    id: 'S1',
    text: '',
    confidence: 'grounded',
    basis: 'Brief.pdf · EVIDENCE_ONLY_TOKEN: launch date October 4.',
    sourceId: 'source-1',
    sourceTitle: 'Brief.pdf',
    excerpt: 'EVIDENCE_ONLY_TOKEN: launch date October 4.',
    position: 2,
  }])
  const session = [...host.sessions.values()][0]
  assert.doesNotMatch(JSON.stringify(session?.history), /EVIDENCE_ONLY_TOKEN/)
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
  host.contexts.set(item.id, { ...context(item, 'Research the assigned topic.'), canvas: { id: 'c', title: 'Study', goal: 'Learn', status: 'active', initiatorAgentId: 'nova', assignments: [], reports: [{ assignmentId: 'a', executionRole: 'specialist' }], frames: [], activity: [] } })
  const model = new ScriptedModelDriver([{ output: [{ role: 'assistant', content: 'Worker result' }], text: 'Worker result', usage: { inputTokens: 10, outputTokens: 3 } }])
  await new AgentOSRuntime(host, model, new StatefulKernel(), { heartbeatMs: 60_000 }).runWork(item)
  assert.equal(host.messages.length, 0)
  assert.equal(host.outcomes.get(item.id)?.resultText, 'Worker result')
})
