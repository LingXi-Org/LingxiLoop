import { pool } from '../db/pool.js'
import { getAgentChannelHistory, readAgentChannelMessages, agentContinuationSchema } from '../im/public.js'
import type { AttachmentRef } from '../im/contracts.js'
import { nativeText, nativeAttachments } from '../im/message-types.js'
import { lingxiOSControl } from './runtime.js'
import { loadRuntimeBinding } from './context.js'
import { syncConversationPolicy } from './conversations.js'
import { bindProductRun, productRunIdentity, notifyRunAvailable } from './identity.js'
import { parseMentions } from '../mentions.js'
import { attachmentRefId, readRequestAttachments, selectRequestAttachments, unavailableAttachmentIds } from './attachments.js'
import { assertInteractionAdmission } from '../im/interaction-admission.js'
import { assertQuestionnaireContinuation, recordQuestionnaireContinuation } from '../im/questionnaires.js'
import { resolveRequestReferences, requestTextWithReferences } from './request-references.js'
import { readRunReference } from '@lyyzka/lingxios'

export interface AgentRequest {
  companyId: string; agentId: string; channelId: string; clientMsgNo: string
  attachmentRefs?: AttachmentRef[]
  kind?: 'message' | 'calendar'
  continuation?: { runId: string; requestVersion: number }
  /** Required when a human invokes the HTTP continuation endpoint. */
  authenticatedUserId?: string
  signal?: AbortSignal
}

/** Recover the author and payload from committed IM, including messages outside recent history. */
export async function receiveAgentRequest(input: AgentRequest) {
  if (input.kind === 'calendar') throw new Error('calendar tasks are retired')
  const signal = AbortSignal.any([AbortSignal.timeout(30_000),...input.signal ? [input.signal] : []])
  const messages = await readAgentChannelMessages({ ...input, messageIds: [...new Set([input.clientMsgNo,...input.attachmentRefs?.map(ref => ref.clientMsgNo) ?? []])], signal })
  const message = messages?.find(item => item.clientMsgNo === input.clientMsgNo)
  if (!message) throw new Error('committed request is unavailable')
  const api = await lingxiOSControl()

  if (message.payload.role !== 'user'
    || input.authenticatedUserId && input.authenticatedUserId !== message.fromUid) throw new Error('request must be committed by the authenticated human')
  await assertInteractionAdmission({ companyId: input.companyId, channelId: input.channelId, userId: message.fromUid,
    clientNonce: input.clientMsgNo, payload: message.payload })
  const identity = { tenantId: input.companyId, agentId: input.agentId, sessionId: input.channelId, principalId: message.fromUid }
  await loadRuntimeBinding({ ...identity, conversationId: input.channelId, createdAt: new Date(message.timestamp * 1000).toISOString() })
  const human = (await pool.query<{ name: string }>("SELECT name FROM participants WHERE company_id=$1 AND id=$2 AND kind='human' AND departed_at IS NULL",
    [input.companyId,message.fromUid])).rows[0]
  if (!human) throw new Error('request author is not an active human')
  const policy = await syncConversationPolicy(api, input.companyId, input.channelId)
  const custom = message.payload.metadata.custom
  const quoteId = typeof custom.replyToClientMsgNo === 'string' ? custom.replyToClientMsgNo : undefined
  const threadId = typeof custom.threadRootClientMsgNo === 'string' ? custom.threadRootClientMsgNo : quoteId
  const references = await resolveRequestReferences(message,
    messageIds => readAgentChannelMessages({ ...input, messageIds, signal }), async assistant => {
      const runId = assistant.payload.metadata.custom.runId
      if (typeof runId !== 'string') return undefined
      const row = (await pool.query<{ source_client_msg_no: string | null }>(`SELECT source_client_msg_no FROM agent_run_bindings
        WHERE run_id=$1 AND company_id=$2 AND conversation_id=$3 AND agent_id=$4 AND NOT internal AND message_protocol=2`,
      [runId, input.companyId, input.channelId, assistant.fromUid])).rows[0]
      return row?.source_client_msg_no ?? undefined
    })
  const originalRequest = references.messages.find(item => item.clientMsgNo === references.originalRequestId) ?? message
  const explicitRefs = [...input.attachmentRefs ?? []]
  if (originalRequest !== message) explicitRefs.push(...nativeAttachments(message.payload)
    .map(file => ({ clientMsgNo: message.clientMsgNo, attachmentId: file.id })))
  for (const referenced of references.messages) explicitRefs.push(...nativeAttachments(referenced.payload)
    .map(file => ({ clientMsgNo: referenced.clientMsgNo, attachmentId: file.id })))
  const history = await getAgentChannelHistory({ ...input, limit: 80, beforeSequence: originalRequest.messageSeq + 1 }) ?? []
  const allMessages = [...messages!, ...references.messages, ...history]
  const attachmentIds = selectRequestAttachments(originalRequest, explicitRefs, allMessages)
  const missingIds = attachmentIds.filter(ref => !allMessages.some(item => item.clientMsgNo === ref.clientMsgNo)).map(ref => ref.clientMsgNo)
  if (missingIds.length) allMessages.push(...await readAgentChannelMessages({ ...input, messageIds: missingIds, signal }) ?? [])
  const audienceIds = policy.participants.filter(member => member.kind === 'human' && member.capabilities.includes('read')).map(member => member.id)
  const unavailable = await unavailableAttachmentIds(pool,input.companyId,input.channelId,attachmentIds,audienceIds)
  // Image transcription is model-derived and can differ between calls. Replaying
  // an already accepted IM message must return its original admission, rather
  // than produce a new attachment snapshot and violate runtime idempotency.
  const hasImages = attachmentIds.some(ref => allMessages.some(item => item.clientMsgNo === ref.clientMsgNo
    && nativeAttachments(item.payload).some(file => file.id === ref.attachmentId && file.contentType?.startsWith('image/'))))
  if (threadId && !input.continuation && custom.agentContinuation === undefined) {
    await api.conversations.registerThread({ tenantId: input.companyId, conversationId: input.channelId, threadId, policyVersion: policy.version })
  }
  if (hasImages && !input.continuation && custom.agentContinuation === undefined) {
    const prior = await api.readConversationTrace({ tenantId: input.companyId, conversationId: input.channelId,
      principalId: message.fromUid, messageId: input.clientMsgNo, version: 1, ...(threadId ? { threadId } : {}) })
    if (prior) {
      const runs = []
      for (const root of prior.runs.filter(run => run.parent_id === null)) {
        if (typeof root.id !== 'string') throw new Error('recorded image admission has an invalid run')
        const run = await readRunReference(pool, input.companyId, root.id)
        if (!run || run.principalId !== message.fromUid) throw new Error('recorded image admission is unavailable')
        await bindProductRun(pool, run, input.channelId, false, input.clientMsgNo)
        runs.push(run)
      }
      return { runs, deduplicated: true }
    }
  }
  const files = await readRequestAttachments(allMessages, attachmentIds.filter(ref => !unavailable.has(attachmentRefId(ref))
    || explicitRefs.some(item => attachmentRefId(item) === attachmentRefId(ref)) || ref.clientMsgNo === input.clientMsgNo), input.companyId, signal, unavailable)
  const text = requestTextWithReferences(message, references)
  if (!text) throw new Error('request text is empty')
  const savedContinuation = custom.agentContinuation === undefined ? undefined : agentContinuationSchema.parse(custom.agentContinuation)
  if (savedContinuation && (savedContinuation.agentId !== input.agentId || input.continuation
    && (input.continuation.runId !== savedContinuation.runId || input.continuation.requestVersion !== savedContinuation.requestVersion))) {
    throw new Error('continuation must match the committed reply')
  }
  const continuation = input.continuation ?? (savedContinuation ? { runId: savedContinuation.runId, requestVersion: savedContinuation.requestVersion } : undefined)
  signal.throwIfAborted()
  if (continuation) {
    await assertQuestionnaireContinuation({ companyId: input.companyId, channelId: input.channelId, userId: message.fromUid,
      ...continuation, clientNonce: input.clientMsgNo, payload: message.payload })
    const run = await productRunIdentity({ companyId: input.companyId, conversationId: input.channelId, agentId: input.agentId, runId: continuation.runId, principalId: message.fromUid, ...(threadId ? { threadId } : {}) })
    const result = await api.continueInput({ ...run, ...continuation,
      inputId: input.clientMsgNo, text, attachments: files })
    await recordQuestionnaireContinuation({ companyId: input.companyId, channelId: input.channelId, userId: message.fromUid,
      ...continuation, clientNonce: input.clientMsgNo, payload: message.payload })
    notifyRunAvailable(run, input.channelId)
    return { id: result.workId, deduplicated: result.status === 'already_resumed' }
  }
  const members = (await pool.query<{ id: string; name: string; kind: 'human' | 'agent' }>(
    'SELECT id,name,kind FROM participants WHERE company_id=$1 AND id=ANY($2::text[])', [input.companyId,policy.participants.map(member => member.id)])).rows
  const parsed = custom.visualizeFollowUp || custom.questionnaireReply ? { mentionedIds: [], mentionAll: false } : parseMentions(nativeText(message.payload),members)
  const mentions = parsed.mentionAll
    ? policy.participants.filter(member => member.kind === 'agent').map(member => member.id)
    : custom.visualizeFollowUp && Array.isArray(custom.mentionedIds) ? custom.mentionedIds.map(String) : parsed.mentionedIds
  const accepted = await api.conversations.ingest({ tenantId: input.companyId, conversationId: input.channelId,
    policyVersion: policy.version, messageId: input.clientMsgNo, version: 1, author: { id: message.fromUid, kind: 'human' },
    text, mentions, attachments: files, ...(threadId ? { threadId } : {}) }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation' })
  for (const run of accepted.runs) await bindProductRun(pool,run,input.channelId,false,input.clientMsgNo,accepted.deduplicated ? undefined : 1)
  return accepted
}
