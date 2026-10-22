import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunTraceSnapshot, RunTraceSpan } from '@lyyzka/lingxios'
import { projectActivityTasks } from '../agent-runtime/activity-tasks.js'

// Failure model: issue-304/CONTRACT-FAILURE-MODEL.md case 6. Do not derive tasks
// from LLM spans, labels or timing; missing/cyclic parent chains remain flat.
const span = (id: string, parentSpanId: string | null, values: Partial<RunTraceSpan> = {}): RunTraceSpan => ({
  spanId: id, parentSpanId, runId: 'root-run', requestVersion: 1, fence: 1, attemptId: null,
  kind: 'agent', state: 'running', startedAt: 100, completedAt: null, timingBasis: 'run-execution', seq: 5, revision: id, ...values,
})
const snapshot = (spans: RunTraceSpan[]): RunTraceSnapshot => ({ version: 1,seq: 5,revision: 'r',runId: 'root-run',requestVersion: 1,
  fence: 1,rootSpanId: 'root',queuedAt: 0,origin: 100,truncated: false,spans })

test('only explicit authorized child runs become business tasks with verified hierarchy', () => {
  const result = projectActivityTasks(snapshot([
    span('root', null), span('child', 'root', { runId: 'child-run',childRunId: 'child-run',state: 'waiting' }),
    span('grandchild', 'child', { runId: 'grandchild-run',childRunId: 'grandchild-run',state: 'complete' }),
    span('model', 'root', { kind: 'llm',name: 'Plan the final answer' }),
    span('orphan', 'missing', { runId: 'missing-run',childRunId: 'missing-run' }),
    span('cycle-a', 'cycle-b', { runId: 'a',childRunId: 'a' }), span('cycle-b', 'cycle-a', { runId: 'b',childRunId: 'b' }),
  ]), [])
  assert.deepEqual(result.tasks?.tasks, [{ id: 'child',label: '子任务',status: 'waiting' },
    { id: 'grandchild',parentId: 'child',label: '子任务',status: 'complete' }])
  assert.equal(result.tools.length, 0)
  assert.deepEqual(projectActivityTasks(snapshot([span('root',null),span('hidden','root',{ runId: 'hidden-run',childRunId: 'hidden-run' })]),[],new Set(['root'])).tasks,undefined)
})

test('root tools are not attached to unrelated child tasks or mismatched trace events', () => {
  const tools = [{ type: 'tool-call' as const,toolCallId: 'host:read',toolName: 'files.read',args: {},argsText: '{}',eventSeq: 5 }]
  const result = projectActivityTasks(snapshot([span('root', null), span('child', 'root', { runId: 'child-run',childRunId: 'child-run' }),
    span('root-tool', 'root', { kind: 'tool',toolCallId: 'host:read' }),
    span('child-tool', 'child', { kind: 'tool',runId: 'child-run',toolCallId: 'host:read' }),
  ]), tools)
  assert.equal(result.tools[0].taskId, undefined)
  assert.deepEqual(projectActivityTasks(snapshot([span('root', null)]), tools).tools, tools)
})
