import { readRunProjection } from './assistant-transport.js'
import { assistantTextViolation } from './assistant-text.js'
import { createHash } from 'node:crypto'
import type { createLingxiOS, ApprovalSnapshot, DeliveryPort } from '@lyyzka/lingxios'
import { sendAgentChannelMessage } from '../im/public.js'
import { loadRuntimeBinding } from './context.js'
import { productConversationId, assertFrozenAudience } from './identity.js'
import { pool } from '../db/pool.js'
import { syncConversationPolicy } from './conversations.js'
import { commitUiRevisions, reserveUiRevisions, UiRevisionConflict } from '../im/interactive-ui.js'
import { messageLessons } from './interactive-ui-projection.js'
import { OPENUI_COMPONENT } from '../../../src/lib/interactive-ui/catalog.js'
import { nativeMessageSchema } from '../im/message-types.js'

export function approvalView(approval: ApprovalSnapshot) {
  const status = approval.decision === null ? 'PENDING' : approval.decision === false ? 'REJECTED'
    : approval.result?.executionState === 'unknown' ? 'UNKNOWN' : approval.result?.ok ? 'EXECUTED'
    : approval.result?.executionState === 'awaiting_approval' ? 'APPROVED' : 'FAILED'
  return { id: approval.approvalId, runId: approval.runId, agentId: approval.agentId, status,
    summary: String(approval.preview.summary ?? approval.preview.title ?? approval.action),
    action: { action: approval.action, args: approval.args }, preview: approval.preview,
    requestedBy: approval.principalId, requestedAt: approval.createdAt, resolvedAt: approval.decidedAt,
    scope: { requestVersion: approval.requestVersion }, ...(approval.result ? { result: approval.result } : {}) }
}

export function createProductDelivery(control: () => ReturnType<typeof createLingxiOS>): DeliveryPort {
  return {
    async onEvent() { /* Native SSE owns replay and preview delivery. */ },
    async deliverMessage(work, message, context) {
      const violation = assistantTextViolation(message.body)
      if (violation) throw new Error(violation)
      if (!context?.commit) throw new Error('committed result identity is required for native delivery')
      if (work.conversation?.internal) throw new Error('internal delegates cannot publish IM messages')
      const conversationId = productConversationId(work)
      await loadRuntimeBinding({ ...work, conversationId })
      await assertFrozenAudience(pool,work)
      const api = await control()
      if (context.im) {
        const policy = await syncConversationPolicy(api,work.tenantId,conversationId)
        const readers = policy.participants.filter(member => member.capabilities.includes('read')).map(member => member.id).sort()
        if (JSON.stringify(readers) !== JSON.stringify([...context.im.audience.participantIds].sort())) {
          throw new Error('frozen audience differs from the current WuKong channel recipients')
        }
      }
      const clientNonce = context.im?.messageKey ?? `agent-${createHash('sha256').update(context.commit.resultId).digest('hex')}`
      const projection = await readRunProjection(api,{ tenantId: work.tenantId, agentId: work.agentId, sessionId: work.sessionId,
        runId: work.id, principalId: work.principalId!, ...(work.threadId ? { threadId: work.threadId } : {}) },true)
      let payload = projection.committed(message,context.commit).message
      const uiDelivery = { companyId: work.tenantId, channelId: conversationId, agentId: work.agentId, runId: work.id,
        clientNonce, resultId: context.commit.resultId, fence: context.commit.fence, envelopes: messageLessons(payload) }
      while (uiDelivery.envelopes.length) {
        try { await reserveUiRevisions(uiDelivery); break }
        catch (error) {
          if (!(error instanceof UiRevisionConflict)) throw error
          const failed = uiDelivery.envelopes.find(item => item.uiId === error.uiId)
          if (!failed) throw error
          payload = nativeMessageSchema.parse({ ...payload, content: payload.content.map(part => part.type === 'generative-ui'
            && !Array.isArray(part.spec.root) && typeof part.spec.root === 'object' && part.spec.root.component === OPENUI_COMPONENT
            && part.spec.root.props?.uiId === error.uiId ? { type: 'text' as const, text: `${failed.fallback}\n\n本次交互更新未保存，原有版本仍保留。` } : part) })
          uiDelivery.envelopes = messageLessons(payload)
        }
      }
      const result = await sendAgentChannelMessage({ companyId: work.tenantId, agentId: work.agentId, channelId: conversationId,
        clientNonce, signal: context.signal, payload })
      if (result.kind !== 'accepted') throw new Error(`assistant delivery ${result.kind}`)
      await commitUiRevisions({ ...uiDelivery, messageId: result.messageId })
      if (context.im) await api.conversations.ingest({ tenantId: work.tenantId, conversationId,
        ...(work.threadId ? { threadId: work.threadId } : {}), policyVersion: context.im.policyVersion,
        messageId: result.messageId, version: 1, author: { id: work.agentId, kind: 'agent' }, text: message.body,
        causedBy: { resultId: context.commit.resultId }, replyTo: context.im.source })
      return { messageId: result.messageId }
    },
  }
}
