import { AssistantStream, AssistantTransportEncoder, type AssistantStreamChunk, type AssistantTransportStateOperation } from 'assistant-stream'
import type { ReadonlyJSONValue } from 'assistant-stream/utils'
import { consumeRunStreamEvent, createRunView, type RunStreamEvent } from '@lyyzka/lingxios/ui'
import {
  type AgentRunSnapshot, harnessParts, harnessStatus, harnessToolParts, projectRunMemory,
} from '../../../src/lib/agentRunSnapshot.js'
import { nativeRunEvents, publicRunEvent } from './public-events.js'

/** LingxiOS owns event ordering/fences; only public display state crosses HTTP. */
export class RunStreamProjection {
  private view: ReturnType<typeof createRunView>
  private createdAt: string | null = null
  private tools: AgentRunSnapshot['tools'] = []
  private memory: AgentRunSnapshot['memory'] = null
  private error: string | null = null
  private sourceRef: string | null = null
  needsResync = false

  constructor(runId: string, private readonly canControl: boolean) {
    this.view = createRunView(runId)
  }

  apply(item: RunStreamEvent): AgentRunSnapshot {
    const id = item.type === 'state' ? item.state.run.id : item.type === 'event' ? item.event.runId
      : item.type === 'preview' ? item.preview.runId : item.runId
    if (id !== this.view.runId) throw new Error('运行身份不一致')
    const before = this.view
    this.view = consumeRunStreamEvent(before, item)
    this.needsResync = item.type === 'preview' && item.preview.kind === 'delta'
      && this.view !== before && this.view.preview === null
    if (item.type === 'state' && this.view !== before) {
      this.createdAt = item.state.run.createdAt
      this.error = item.state.run.error
    }
    if (item.type === 'event') {
      const action = this.tools.find(tool => tool.toolCallId === item.event.data.toolCallId)?.toolName
      const event = publicRunEvent(item.event, action)
      this.tools = harnessToolParts(this.view.runId, [event], this.tools)
      this.memory = projectRunMemory(this.view.runId, [event], this.memory ?? undefined) ?? null
      if (this.view !== before && event.kind === 'run.failed' && typeof event.data.error === 'string') this.error = event.data.error
      if (event.kind === 'run.started' && typeof event.data.sourceRef === 'string') this.sourceRef = event.data.sourceRef
    }
    return this.snapshot
  }

  get snapshot(): AgentRunSnapshot {
    return {
      runId: this.view.runId, createdAt: this.createdAt,
      // Live text has one owner: content. Native preview cursors never reach the browser.
      view: { ...this.view, draft: '', preview: null },
      content: harnessParts(this.view, this.tools), status: harnessStatus(this.view),
      tools: this.tools, memory: this.memory, canControl: this.canControl, error: this.error, sourceRef: this.sourceRef,
    }
  }
}

function changes(previous: AgentRunSnapshot | undefined, next: AgentRunSnapshot): AssistantTransportStateOperation[] {
  const state = JSON.parse(JSON.stringify(next)) as Record<string, ReadonlyJSONValue>
  if (!previous) return [{ type: 'set', path: [], value: state }]
  const operations: AssistantTransportStateOperation[] = []
  for (const key of Object.keys(next) as Array<keyof AgentRunSnapshot>) {
    if (JSON.stringify(previous[key]) === JSON.stringify(next[key])) continue
    if (key === 'content' && previous.content.length === next.content.length) {
      next.content.forEach((part, index) => {
        const prior = previous.content[index]
        if (JSON.stringify(prior) === JSON.stringify(part)) return
        if (part.type === 'text' && prior?.type === 'text' && part.text.startsWith(prior.text)) {
          operations.push({ type: 'append-text', path: ['content', String(index), 'text'], value: part.text.slice(prior.text.length) })
        } else operations.push({ type: 'set', path: ['content', String(index)], value: (state.content as readonly ReadonlyJSONValue[])[index]! })
      })
    } else operations.push({ type: 'set', path: [key], value: state[key]! })
  }
  return operations
}

export function assistantRunResponse(body: ReadableStream<Uint8Array>, projection: RunStreamProjection): Response {
  async function* chunks(): AsyncGenerator<AssistantStreamChunk> {
    let previous: AgentRunSnapshot | undefined
    for await (const item of nativeRunEvents(body)) {
      if (!item) {
        yield { type: 'update-state', path: [], operations: [] }
        continue
      }
      const next = projection.apply(item)
      const operations = changes(previous, next)
      if (operations.length) yield { type: 'update-state', path: [], operations }
      previous = next
      if (projection.needsResync) throw new Error('runtime preview gap; reconnect for a complete snapshot')
    }
  }
  const iterator = chunks()
  const stream = new ReadableStream<AssistantStreamChunk>({
    async pull(controller) {
      try {
        const next = await iterator.next()
        if (next.done) controller.close()
        else controller.enqueue(next.value)
      } catch (error) { controller.error(error); await iterator.return(undefined) }
    },
    async cancel() { await iterator.return(undefined) },
  })
  const response = AssistantStream.toResponse(stream, new AssistantTransportEncoder())
  response.headers.set('Cache-Control', 'private, no-cache, no-transform')
  response.headers.set('X-Accel-Buffering', 'no')
  return response
}
