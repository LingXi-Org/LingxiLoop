import { createHash } from 'node:crypto'
import type { createLingxiOS, ApprovalSnapshot, DeliveryPort } from '@lyyzka/lingxios'
import { sendAgentChannelMessage } from '../im/public.js'
import { loadRuntimeBinding } from './context.js'
import { productConversationId, assertFrozenAudience } from './identity.js'
import { pool } from '../db/pool.js'
import { syncConversationPolicy } from './conversations.js'

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
      const result = await sendAgentChannelMessage({ companyId: work.tenantId, agentId: work.agentId, channelId: conversationId,
        clientNonce, signal: context.signal, payload: { version: 1, kind: 'text', clientMsgNo: clientNonce,
          body: message.body, ...(work.threadId ? { replyToClientMsgNo: work.threadId } : {}),
          refs: { runId: work.id, agentId: work.agentId }, data: { harness: message.envelope, harnessCommit: context.commit, harnessSessionId: message.sessionId,
            ...(context.im ? { im: context.im } : {}), suppressAgentWake: true } } })
      if (result.kind !== 'accepted') throw new Error(`assistant delivery ${result.kind}`)
      if (context.im) await api.conversations.ingest({ tenantId: work.tenantId, conversationId,
        ...(work.threadId ? { threadId: work.threadId } : {}), policyVersion: context.im.policyVersion,
        messageId: result.messageId, version: 1, author: { id: work.agentId, kind: 'agent' }, text: message.body,
        causedBy: { resultId: context.commit.resultId }, replyTo: context.im.source })
      return { messageId: result.messageId }
    },
  }
}
