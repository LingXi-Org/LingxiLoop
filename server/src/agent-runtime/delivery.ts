import { readRunProjection } from './assistant-transport.js'
import { assistantTextViolation } from './assistant-text.js'
import { createHash } from 'node:crypto'
import { NoEffectError, type createLingxiOS, type DeliveryPort } from '@lyyzka/lingxios'
import { sendAgentChannelMessage, sendSystemChannelMessage } from '../im/public.js'
import { loadRuntimeBinding } from './context.js'
import { productConversationId, assertFrozenAudience, bindProductRun, notifyRunAvailable } from './identity.js'
import { runProductCallback } from './product-callbacks.js'
import { createRunListInvalidation } from './run-list-invalidation.js'
import { syncConversationPolicy } from './conversations.js'
import { createNativeMessage, nativeMessageSchema, nativeText } from '../im/message-types.js'
import { getSendAcceptance } from '../im/messages-repository.js'
import { conversationHandoffMentions } from './conversation-handoff.js'
import type { MentionTarget } from '../mentions.js'
import { participantDisplayName } from '../../../src/lib/participantDisplayName.js'
import { assertCanvasRequestCurrent } from '../modules/canvas/index.js'
import { terminalFailure, terminalFeedbackText, terminalFeedbackScope, terminalResult } from './terminal-feedback.js'
import { readDeliveredReference } from './delivery-reference.js'

export { approvalView } from './approval-public-view.js'

export function createProductDelivery(control: () => ReturnType<typeof createLingxiOS>): DeliveryPort {
  return {
    onEvent: createRunListInvalidation(control, notifyRunAvailable),
    async deliverTerminal(work, feedback, inputContext) {
      return runProductCallback(inputContext, async scope => {
        const { database } = scope, context = { ...inputContext, ...scope }
        if (work.conversation?.internal || !work.principalId) throw new NoEffectError('Terminal audience is unavailable','forbidden')
        const conversationId = productConversationId(work)
        await loadRuntimeBinding({ ...work,conversationId },database)
        await assertCanvasRequestCurrent(database,work)
        await assertFrozenAudience(database,work)
        const api = await control(), identity = { tenantId: work.tenantId,agentId: work.agentId,sessionId: work.sessionId,
          runId: work.id,principalId: work.principalId,...(work.threadId ? { threadId: work.threadId } : {}) }
        const current = await api.readTerminal(identity,scope)
        if (!current || current.feedback.id !== feedback.id || current.feedback.requestVersion !== feedback.requestVersion) return
        const clientNonce = `terminal-${feedback.id}`
        const existing = await getSendAcceptance(database,{ companyId: work.tenantId,userId: work.agentId,clientNonce })
        let payload = existing ? nativeMessageSchema.parse(existing.payload) : undefined
        if (payload && (payload.id !== clientNonce || payload.role !== 'system'
          || payload.metadata.custom.runId !== work.id || payload.metadata.custom.requestVersion !== feedback.requestVersion)) {
          throw new Error('Terminal notification identity conflicts with a recorded acceptance')
        }
        if (!payload) {
          const state = await api.readRunState(identity, scope)
          if (!state || state.run.requestVersion !== feedback.requestVersion) return
          const committed = terminalResult(feedback, state)
          const acceptedReference = committed && state.delivery !== 'delivered'
            ? await readDeliveredReference(identity, committed, database) : undefined
          const terminalScope = terminalFeedbackScope(feedback, state, acceptedReference)
          const failure = ['execution_failed', 'model_unavailable'].includes(feedback.reason)
            ? await terminalFailure(api, identity, state, scope) : null
          const recipients = new Set(work.conversation?.audience.participantIds ?? [])
          const visible = feedback.notStartedAgentIds.filter(id => recipients.has(id))
          const names = visible.length ? (await database.query<{ name: string; kind: 'agent'; presetKey: string | null }>(`SELECT name,kind,preset_key AS "presetKey" FROM participants
            WHERE company_id=$1 AND id=ANY($2::text[]) AND kind='agent' AND departed_at IS NULL ORDER BY id LIMIT 8`,
          [work.tenantId,visible])).rows.map(row => participantDisplayName(row).slice(0,80)) : []
          payload = createNativeMessage({ id: clientNonce,role: 'system',createdAt: feedback.createdAt,
            content: [{ type: 'text',text: terminalFeedbackText(feedback, state, failure, names, terminalScope) }],
            custom: { runId: work.id,requestVersion: feedback.requestVersion,controlPrincipalId: work.principalId,
              terminalFeedbackId: feedback.id,terminalStatus: feedback.status,terminalReason: feedback.reason,suppressAgentWake: true,
              terminalScopeVersion: 1,terminalScope,
              ...(work.threadId ? { replyToClientMsgNo: work.threadId } : {}) } })
        }
        context.signal.throwIfAborted()
        // Recheck after receipt/name reads and immediately before crossing the messaging boundary.
        await loadRuntimeBinding({ ...work,conversationId },database)
        await assertCanvasRequestCurrent(database,work)
        await assertFrozenAudience(database,work)
        if ((await api.readRun(identity,database))?.requestVersion !== feedback.requestVersion) return
        const result = await sendSystemChannelMessage({ companyId: work.tenantId,actorId: work.agentId,channelId: conversationId,
          clientNonce,payload,signal: context.signal },database)
        if (result.kind !== 'accepted') throw new Error(`terminal delivery ${result.kind}`)
      })
    },
    async deliverMessage(work, message, inputContext) {
      return runProductCallback(inputContext, async scope => {
        const { database } = scope, context = { ...inputContext, ...scope }
        const violation = assistantTextViolation(message.body)
        if (violation) throw new Error(violation)
        if (!context?.commit) throw new Error('committed result identity is required for native delivery')
        if (work.conversation?.internal) throw new Error('internal delegates cannot publish IM messages')
        const conversationId = productConversationId(work)
        await loadRuntimeBinding({ ...work, conversationId },database)
        await assertCanvasRequestCurrent(database, work)
        await assertFrozenAudience(database,work)
        const api = await control()
        const policy = context.im ? await syncConversationPolicy(api,work.tenantId,conversationId,database,scope) : undefined
        if (context.im && policy) {
          const readers = policy.participants.filter(member => member.capabilities.includes('read')).map(member => member.id).sort()
          if (JSON.stringify(readers) !== JSON.stringify([...context.im.audience.participantIds].sort())) {
            throw new Error('frozen audience differs from the current WuKong channel recipients')
          }
        }
        const clientNonce = context.im?.messageKey ?? `agent-${createHash('sha256').update(context.commit.resultId).digest('hex')}`
        const projection = await readRunProjection(api,{ tenantId: work.tenantId, agentId: work.agentId, sessionId: work.sessionId,
          runId: work.id, principalId: work.principalId!, ...(work.threadId ? { threadId: work.threadId } : {}) },true,scope.signal,database,scope,false)
        const projected = projection.committed(message,context.commit).message
        const payload = nativeMessageSchema.parse({ ...projected, metadata: { ...projected.metadata, custom: {
          ...projected.metadata.custom, conversationId, sourceMessageId: clientNonce } } })
        const result = await sendAgentChannelMessage({ companyId: work.tenantId, agentId: work.agentId, channelId: conversationId,
          clientNonce, signal: context.signal, payload },database)
        if (result.kind !== 'accepted') throw new Error(`assistant delivery ${result.kind}`)
        if (context.im && policy) {
          const members = (await database.query<MentionTarget>('SELECT id,name,kind,preset_key AS "presetKey" FROM participants WHERE company_id=$1 AND departed_at IS NULL AND id=ANY($2::text[])',
            [work.tenantId, policy.participants.map(member => member.id)])).rows
          const mentions = conversationHandoffMentions(nativeText(result.payload), members, work.agentId)
          const accepted = await api.conversations.ingest({ tenantId: work.tenantId, conversationId,
            ...(work.threadId ? { threadId: work.threadId } : {}), policyVersion: policy.version,
            messageId: result.messageId, version: 1, author: { id: work.agentId, kind: 'agent' }, text: message.body,
            audience: { visibility: 'participants', participantIds: context.im.audience.participantIds },
            mentions,
            causedBy: { resultId: context.commit.resultId }, replyTo: context.im.source },
          { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation' },scope)
          const source = (await database.query<{ source_client_msg_no: string | null }>('SELECT source_client_msg_no FROM agent_run_bindings WHERE run_id=$1 AND company_id=$2', [work.id,work.tenantId])).rows[0]?.source_client_msg_no
          for (const run of accepted.runs) await bindProductRun(database, run, conversationId, false, source ?? undefined, accepted.deduplicated ? undefined : 1)
          if (accepted.reason === 'mention_limit') {
            const id = `${clientNonce}-mention-limit`
            const notice = await sendSystemChannelMessage({ companyId: work.tenantId, actorId: work.agentId, channelId: conversationId,
              clientNonce: id, signal: context.signal, payload: createNativeMessage({ id, role: 'system', createdAt: new Date().toISOString(),
                content: [{ type: 'text', text: '这轮协作已达到连续 8 层或累计 32 次回复的上限，部分提及未启动。你可以发送一条新消息继续。' }],
                custom: { suppressAgentWake: true } }) },database)
            if (notice.kind !== 'accepted') throw new Error(`mention limit notice ${notice.kind}`)
          }
        }
        return { messageId: result.messageId }
      })
    },
  }
}
