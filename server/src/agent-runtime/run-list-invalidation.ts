import { isGoalOutcome, type createLingxiOS, type DeliveryPort, type RunIdentity } from '@lyyzka/lingxios'

type Read = () => Promise<Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readRun'>>

/** Reuse the native event outbox as the reliable continuation. The inline event
 * precedes waitWork, so only an outbox delivery may invalidate the list, after
 * the public snapshot proves the durable state. No polling, timers or admission. */
export function createRunListInvalidation(read: Read, notify: (identity: RunIdentity, conversationId: string) => void): DeliveryPort['onEvent'] {
  return async (work, event, context) => {
    if (!context || event.visibility !== 'user' || !['goal.waiting', 'approval.pending'].includes(event.kind)
      || !work.principalId || !work.conversation || work.conversation.internal || event.runId !== work.id) return
    const outcome = event.data.goalOutcome
    if (!isGoalOutcome(outcome) || outcome.requestVersion !== work.requestVersion) return
    const identity = { tenantId: work.tenantId, agentId: work.agentId, sessionId: work.sessionId,
      runId: work.id, principalId: work.principalId, ...(work.threadId ? { threadId: work.threadId } : {}) }
    const current = await (await read()).readRun(identity)
    if (!current || current.requestVersion !== outcome.requestVersion || current.fence !== work.fence) return
    if (current.status === 'leased') {
      // Returning success would acknowledge the pre-park hint forever. An
      // ordinary delivery error retains the existing bounded outbox retry.
      throw new Error('Run-list invalidation awaits the durable run transition')
    }
    if (current.status === 'waiting' && (current.goalOutcome?.requestVersion !== current.requestVersion
      || current.goalOutcome.status !== outcome.status)) return
    notify(identity, work.conversation.conversationId)
  }
}
