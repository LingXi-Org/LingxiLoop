import { getActiveLingxiGraphRun } from './lingxigraph-active-runs.js'
import { LingxiGraphSteerError, steerLingxiGraphRun, type LingxiGraphSteerResult } from './lingxigraph-adapter.js'

export interface LoopSteeringMessage {
  messageId: string
  conversationId: string
  authorId?: string
  authorName: string
  body: string
  companyId?: string
}

export async function routeLingxiGraphSteering(
  agentId: string,
  message: LoopSteeringMessage,
  submit: typeof steerLingxiGraphRun = steerLingxiGraphRun,
): Promise<{ handled: boolean; result?: LingxiGraphSteerResult; runId?: string }> {
  const active = getActiveLingxiGraphRun(agentId)
  if (!active || active.companyId !== (message.companyId || null)) return { handled: false }
  try {
    const result = await submit({
      runId: active.runId,
      kind: 'message.new',
      idempotencyKey: message.messageId,
      payload: {
        messageId: message.messageId,
        conversationId: message.conversationId,
        authorId: message.authorId ?? '',
        authorName: message.authorName,
        body: message.body,
      },
      metadata: { agentId, companyId: active.companyId },
    })
    return { handled: result.outcome !== 'terminal', result, runId: active.runId }
  } catch (error) {
    // A timeout/5xx is ambiguous: Graph may have committed the durable event
    // before the response was lost. Treat it as handled for this wake to avoid
    // steer + new-turn double processing. The unread Loop message remains the
    // communication-layer recovery record, and retries reuse messageId.
    if (error instanceof LingxiGraphSteerError && error.transient) return { handled: true, runId: active.runId }
    return { handled: false, runId: active.runId }
  }
}
