import { readRunProjection } from './assistant-transport.js'
import { assistantTextViolation } from './assistant-text.js'
import { createHash } from 'node:crypto'
import type { createLingxiOS, ApprovalSnapshot, DeliveryPort } from '@lyyzka/lingxios'
import { sendAgentChannelMessage, sendSystemChannelMessage } from '../im/public.js'
import { loadRuntimeBinding } from './context.js'
import { productConversationId, assertFrozenAudience, bindProductRun } from './identity.js'
import { pool } from '../db/pool.js'
import { syncConversationPolicy } from './conversations.js'
import { commitUiRevisions, reserveUiRevisions, UiRevisionConflict } from '../im/interactive-ui.js'
import { messageLessons } from './interactive-ui-projection.js'
import { INTERACTIVE_LESSONS_ENABLED, OPENUI_COMPONENT } from '../../../src/lib/interactive-ui/catalog.js'
import { createNativeMessage, nativeMessageSchema, nativeText } from '../im/message-types.js'
import { getSendAcceptance } from '../im/messages-repository.js'
import { parseMentions } from '../mentions.js'
import { assertCanvasRequestCurrent } from '../modules/canvas/index.js'

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
      await assertCanvasRequestCurrent(pool, work)
      await assertFrozenAudience(pool,work)
      const api = await control()
      const policy = context.im ? await syncConversationPolicy(api,work.tenantId,conversationId) : undefined
      if (context.im && policy) {
        const readers = policy.participants.filter(member => member.capabilities.includes('read')).map(member => member.id).sort()
        if (JSON.stringify(readers) !== JSON.stringify([...context.im.audience.participantIds].sort())) {
          throw new Error('frozen audience differs from the current WuKong channel recipients')
        }
      }
      const clientNonce = context.im?.messageKey ?? `agent-${createHash('sha256').update(context.commit.resultId).digest('hex')}`
      const projection = await readRunProjection(api,{ tenantId: work.tenantId, agentId: work.agentId, sessionId: work.sessionId,
        runId: work.id, principalId: work.principalId!, ...(work.threadId ? { threadId: work.threadId } : {}) },true)
      let payload = projection.committed(message,context.commit).message
      if (!INTERACTIVE_LESSONS_ENABLED) {
        const receipt = await getSendAcceptance(pool, { companyId: work.tenantId, userId: work.agentId, clientNonce })
        if (receipt) {
          const recorded = nativeMessageSchema.parse(receipt.payload)
          // An existing dispatch keeps its immutable payload; history renders its text fallback.
          if (messageLessons(recorded).length) payload = recorded
        }
      }
      const uiDelivery = { companyId: work.tenantId, channelId: conversationId, agentId: work.agentId, runId: work.id,
        clientNonce, resultId: context.commit.resultId, fence: context.commit.fence, envelopes: messageLessons(payload) }
      while (INTERACTIVE_LESSONS_ENABLED && uiDelivery.envelopes.length) {
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
      if (context.im && policy) {
        const members = (await pool.query<{ id: string; name: string }>('SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])',
          [work.tenantId, policy.participants.map(member => member.id)])).rows
        const mentions = parseMentions(nativeText(result.payload), members, { allowInlineCodeMentions: true })
        const accepted = await api.conversations.ingest({ tenantId: work.tenantId, conversationId,
          ...(work.threadId ? { threadId: work.threadId } : {}), policyVersion: policy.version,
          messageId: result.messageId, version: 1, author: { id: work.agentId, kind: 'agent' }, text: message.body,
          audience: { visibility: 'participants', participantIds: context.im.audience.participantIds },
          mentions: mentions.mentionAll ? policy.participants.filter(member => member.kind === 'agent').map(member => member.id) : mentions.mentionedIds,
          causedBy: { resultId: context.commit.resultId }, replyTo: context.im.source },
        { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation' })
        const source = (await pool.query<{ source_client_msg_no: string | null }>('SELECT source_client_msg_no FROM agent_run_bindings WHERE run_id=$1 AND company_id=$2', [work.id,work.tenantId])).rows[0]?.source_client_msg_no
        for (const run of accepted.runs) await bindProductRun(pool, run, conversationId, false, source ?? undefined)
        if (accepted.reason === 'mention_limit') {
          const id = `${clientNonce}-mention-limit`
          const notice = await sendSystemChannelMessage({ companyId: work.tenantId, actorId: work.agentId, channelId: conversationId,
            clientNonce: id, signal: context.signal, payload: createNativeMessage({ id, role: 'system', createdAt: new Date().toISOString(),
              content: [{ type: 'text', text: '这轮协作已达到连续 8 层或累计 32 次回复的上限，部分提及未启动。你可以发送一条新消息继续。' }],
              custom: { suppressAgentWake: true } }) })
          if (notice.kind !== 'accepted') throw new Error(`mention limit notice ${notice.kind}`)
        }
      }
      return { messageId: result.messageId }
    },
  }
}
