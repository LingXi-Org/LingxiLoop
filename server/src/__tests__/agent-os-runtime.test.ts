import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryHostAdapter } from '../agent-os/host-adapter.js'
import type { KernelExecutor } from '../agent-os/kernel-manager.js'
import { ScriptedModelDriver } from '../agent-os/model-driver.js'
import { AgentOSRuntime } from '../agent-os/runtime.js'
import type { AgentContext, AgentWorkItem, KernelExecution } from '../agent-os/types.js'

function work(id: string, trigger: string): AgentWorkItem {
  return { id, fence: 1, companyId: 'co-1', agentId: 'nova', channelId: 'study', triggerClientMsgNo: trigger, reason: 'message', leaseToken: `lease-${id}` }
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
