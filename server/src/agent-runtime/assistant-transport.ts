import { AssistantStream, AssistantTransportEncoder, type AssistantStreamChunk, type AssistantTransportStateOperation } from 'assistant-stream'
import type { ReadonlyJSONValue } from 'assistant-stream/utils'
import { consumeAssistantMessage, consumeRunStreamEvent, createRunView, type AssistantMessage, type RunStreamEvent } from '@lyyzka/lingxios/ui'
import type { createLingxiOS, RunIdentity } from '@lyyzka/lingxios'
import type { AgentRunSnapshot, RunDisplayState, RunMemory } from '../../../src/lib/agentRunSnapshot.js'
import { createNativeMessage } from '../im/message-types.js'
import { runMessageParts, runMessageStatus, harnessToolParts, projectRunMemory, type HarnessToolPart } from './message-projection.js'
import { nativeRunEvents, publicRunEvent } from './public-events.js'

/** LingxiOS owns event ordering/fences; only public native messages cross HTTP. */
export class RunStreamProjection {
  private view: ReturnType<typeof createRunView>
  private createdAt: string | null = null
  private tools: HarnessToolPart[] = []
  private memory: RunMemory | null = null
  private error: string | null = null
  private sourceRef: string | null = null
  needsResync = false

  constructor(runId: string, private readonly canControl: boolean,
    private readonly identity?: { agentId: string; principalId?: string; threadId?: string }) {
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
    if (item.type === 'event' && item.event.visibility === 'user') {
      const action = this.tools.find(tool => tool.toolCallId === item.event.data.toolCallId)?.toolName
      const event = publicRunEvent(item.event, action)
      this.tools = harnessToolParts(this.view.runId, [event], this.tools)
      this.memory = projectRunMemory(this.view.runId, [event], this.memory ?? undefined) ?? null
      if (this.view !== before && event.kind === 'run.failed' && typeof event.data.error === 'string') this.error = event.data.error
      if (event.kind === 'run.started' && typeof event.data.sourceRef === 'string') this.sourceRef = event.data.sourceRef
    }
    return this.snapshot
  }

  async syncApprovals(api: Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readApproval'>, identity: RunIdentity): Promise<void> {
    for (let index = 0; index < this.tools.length; index++) {
      const tool = this.tools[index]
      if (!tool.approval) continue
      const approval = await api.readApproval({ tenantId: identity.tenantId, principalId: identity.principalId, approvalId: tool.approval.id })
      if (!approval || approval.runId !== this.view.runId || approval.agentId !== identity.agentId) throw new Error('approval identity is unavailable')
      this.tools[index] = { ...tool, approval: { id: approval.approvalId,
        ...(approval.decision !== null ? { approved: approval.decision }
          : this.view.lifecycle === 'cancelled' ? { resolution: 'cancelled' as const }
          : approval.requestVersion !== this.view.requestVersion || this.view.lifecycle === 'failed'
            || this.view.lifecycle === 'succeeded' && this.view.goalOutcome?.status !== 'awaiting_approval' ? { resolution: 'expired' as const } : {}),
      } }
    }
  }

  committed(message: AssistantMessage, commit: { resultId: string; fence: number }): AgentRunSnapshot {
    if (this.view.requestVersion > message.envelope.requestVersion || this.view.messageFence > commit.fence) throw new Error('stale committed delivery')
    this.view = { ...consumeAssistantMessage(this.view,message,commit), delivery: 'delivered' }
    return this.snapshot
  }

  get snapshot(): AgentRunSnapshot {
    if (!this.createdAt) throw new Error('run state must precede message updates')
    const { message, draft: _draft, preview: _preview, ...control } = this.view
    const harness: RunDisplayState = { ...control, artifacts: message?.envelope.artifacts ?? [] }
    const agentId = this.identity?.agentId ?? message?.agentId
    return { message: createNativeMessage({ id: `run-${this.view.runId}`, role: 'assistant', createdAt: this.createdAt,
      content: runMessageParts(this.view,this.tools), status: runMessageStatus(this.view),
      custom: { runId: this.view.runId, harness, harnessControl: this.canControl,
        ...(agentId ? { refs: { runId: this.view.runId, agentId } } : {}),
        ...(this.identity?.principalId ? { controlPrincipalId: this.identity.principalId } : {}),
        ...(this.identity?.threadId ? { replyToClientMsgNo: this.identity.threadId } : {}),
        ...(this.memory ? { memory: this.memory } : {}), ...(this.error ? { harnessError: this.error } : {}),
        ...(this.sourceRef ? { sourceRef: this.sourceRef } : {}), suppressAgentWake: true } }) }
  }
}

export async function readRunProjection(api: Awaited<ReturnType<typeof createLingxiOS>>, identity: RunIdentity, canControl: boolean) {
  const state = await api.readRunState(identity)
  if (!state) throw new Error('run not found')
  const projection = new RunStreamProjection(identity.runId,canControl,identity)
  projection.apply({ type: 'state',state })
  const signal = AbortSignal.timeout(30_000)
  let cursor = 0
  while (true) {
    signal.throwIfAborted()
    const page = await api.readEvents(identity,cursor)
    for (const event of page.events) projection.apply({ type: 'event',event })
    if (page.events.length < 100) break
    if (page.nextSeq <= cursor) throw new Error('runtime event cursor did not advance')
    cursor = page.nextSeq
  }
  const current = await api.readRunState(identity)
  if (!current) throw new Error('run not found')
  projection.apply({ type: 'state',state: current })
  await projection.syncApprovals(api,identity)
  return projection
}

function changes(previous: AgentRunSnapshot | undefined, next: AgentRunSnapshot): AssistantTransportStateOperation[] {
  const state = JSON.parse(JSON.stringify(next)) as ReadonlyJSONValue
  const operations: AssistantTransportStateOperation[] = []
  function diff(before: ReadonlyJSONValue | undefined, after: ReadonlyJSONValue, path: string[]) {
    if (JSON.stringify(before) === JSON.stringify(after)) return
    if (typeof before === 'string' && typeof after === 'string' && ['text','argsText'].includes(path.at(-1) ?? '') && after.startsWith(before)) {
      operations.push({ type: 'append-text',path,value: after.slice(before.length) })
    } else if (before && after && typeof before === 'object' && typeof after === 'object'
      && Array.isArray(before) === Array.isArray(after) && JSON.stringify(Object.keys(before)) === JSON.stringify(Object.keys(after))) {
      for (const key of Object.keys(after)) diff(Reflect.get(before,key),Reflect.get(after,key),[...path,key])
    } else operations.push({ type: 'set',path,value: after })
  }
  diff(previous ? JSON.parse(JSON.stringify(previous)) : undefined,state,[])
  return operations
}

export function assistantRunResponse(body: ReadableStream<Uint8Array>, projection: RunStreamProjection, approvals?: { api: Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readApproval'>; identity: RunIdentity }): Response {
  async function* chunks(): AsyncGenerator<AssistantStreamChunk> {
    let previous: AgentRunSnapshot | undefined
    for await (const item of nativeRunEvents(body)) {
      if (!item) {
        yield { type: 'update-state', path: [], operations: [] }
        continue
      }
      projection.apply(item)
      if (approvals && (item.type === 'state' || item.type === 'event' && item.event.kind === 'tool.completed')) await projection.syncApprovals(approvals.api,approvals.identity)
      const next = projection.snapshot
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
