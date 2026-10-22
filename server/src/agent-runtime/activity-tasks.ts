import type { RunTraceSnapshot, RunTraceSpan } from '@lyyzka/lingxios'
import { activityTasksSchema, type ActivityTasks } from '../../../src/lib/runActivity.js'
import type { HarnessToolPart } from './message-projection.js'

/** The caller supplies only an authorized trace matching its current run state.
 * Trace ancestry can identify a delegated run; it cannot invent a business plan. */
export function projectActivityTasks(snapshot: RunTraceSnapshot, tools: readonly HarnessToolPart[], visibleSpanIds?: ReadonlySet<string>): { tasks?: ActivityTasks; tools: HarnessToolPart[] } {
  const spans = new Map(snapshot.spans.map(span => [span.spanId, span]))
  const root = spans.get(snapshot.rootSpanId)
  if (!root || root.kind !== 'agent' || root.runId !== snapshot.runId) return { tools: [...tools] }
  const ancestry = (span: RunTraceSpan): RunTraceSpan[] | undefined => {
    const parents: RunTraceSpan[] = [], seen = new Set<string>([span.spanId])
    let parentId = span.parentSpanId
    while (parentId) {
      if (seen.has(parentId) || seen.size > 10 || visibleSpanIds && !visibleSpanIds.has(parentId)) return undefined
      seen.add(parentId)
      const parent = spans.get(parentId)
      if (!parent) return undefined
      parents.push(parent)
      if (parent.spanId === snapshot.rootSpanId) return parents
      parentId = parent.parentSpanId
    }
    return undefined
  }
  const children = snapshot.spans.filter(span => span.kind === 'agent' && span.childRunId && span.runId === span.childRunId
    && span.spanId !== snapshot.rootSpanId && (!visibleSpanIds || visibleSpanIds.has(span.spanId)) && ancestry(span)).slice(0, 100)
  const taskIds = new Set(children.map(span => span.spanId))
  const tasks = children.map(span => {
    const parent = ancestry(span)?.find(ancestor => taskIds.has(ancestor.spanId))
    return { id: span.spanId,...(parent ? { parentId: parent.spanId } : {}),label: '子任务',status: span.state === 'failed' ? 'error' as const : span.state }
  })
  const parsed = activityTasksSchema.safeParse({ version: 1, tasks })
  if (!parsed.success || !tasks.length) return { tools: [...tools] }
  return { tasks: parsed.data, tools: tools.map(tool => {
    const candidates = snapshot.spans.filter(span => span.kind === 'tool' && span.runId === snapshot.runId
      && span.toolCallId === tool.toolCallId && span.seq === tool.eventSeq
      && (!tool.activityIdentity || span.requestVersion === tool.activityIdentity.requestVersion && span.fence === tool.activityIdentity.fence))
    if (candidates.length !== 1) return tool
    const task = ancestry(candidates[0])?.find(ancestor => taskIds.has(ancestor.spanId))
    return task ? { ...tool,taskId: task.spanId } : tool
  }) }
}
