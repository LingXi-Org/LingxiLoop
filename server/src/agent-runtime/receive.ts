import { createHash } from 'node:crypto'
import { pool } from '../db/pool.js'
import { getAgentChannelHistory, readAgentChannelMessages, agentContinuationSchema } from '../im/public.js'
import type { AttachmentRef } from '../im/contracts.js'
import { nativeText, nativeAttachments } from '../im/message-types.js'
import { resolveCalendarAgentRequest } from '../modules/calendar/index.js'
import { resolveAgentHandoffWake } from '../modules/agents/index.js'
import { lingxiOSControl } from './runtime.js'
import { loadRuntimeBinding } from './context.js'
import { syncConversationPolicy } from './conversations.js'
import { bindProductRun, productRunIdentity, notifyRunAvailable } from './identity.js'
import { parseMentions } from '../mentions.js'
import { attachmentRefId, readRequestAttachments, selectRequestAttachments, unavailableAttachmentIds } from './attachments.js'

export interface AgentRequest {
  companyId: string; agentId: string; channelId: string; clientMsgNo: string
  attachmentRefs?: AttachmentRef[]
  kind?: 'message' | 'calendar' | 'handoff'
  continuation?: { runId: string; requestVersion: number }
  /** Required when a human invokes the HTTP continuation endpoint. */
  authenticatedUserId?: string
  signal?: AbortSignal
}

/** Recover the author and payload from committed IM, including messages outside recent history. */
export async function receiveAgentRequest(input: AgentRequest) {
  const signal = AbortSignal.any([AbortSignal.timeout(30_000),...input.signal ? [input.signal] : []])
  const messages = await readAgentChannelMessages({ ...input, messageIds: [...new Set([input.clientMsgNo,...input.attachmentRefs?.map(ref => ref.clientMsgNo) ?? []])], signal })
  const message = messages?.find(item => item.clientMsgNo === input.clientMsgNo)
  if (!message) throw new Error('committed request is unavailable')
  const api = await lingxiOSControl()
  if (input.kind === 'handoff') {
    const identity = await resolveAgentHandoffWake(input, message)
    await loadRuntimeBinding({ ...identity, conversationId: input.channelId })
    if (!await api.readRun(identity)) throw new Error('handoff child is unavailable')
    signal.throwIfAborted()
    return { id: identity.runId, deduplicated: true }
  }
  if (input.kind === 'calendar') {
    const request = await resolveCalendarAgentRequest(input, message)
    const identity = { tenantId: input.companyId, agentId: input.agentId, sessionId: input.channelId, principalId: request.principalId }
    const profile = await loadRuntimeBinding({ ...identity, conversationId: input.channelId })
    if (profile.teacher_managed || !profile.capabilities.includes('calendar')) throw new Error('calendar capability was revoked')
    const id = createHash('sha256').update(JSON.stringify(['calendar', input.companyId,input.agentId,input.channelId,input.clientMsgNo])).digest('hex')
    signal.throwIfAborted()
    const run = { ...identity, sessionId: id, runId: id, threadId: input.clientMsgNo }
    const result = await api.enqueueJob({ ...run, ...request, id, sourceRef: input.clientMsgNo, kind: 'calendar', lane: 'background', executionClass: 'operation', meta: { conversationId: input.channelId } })
    await bindProductRun(pool, run, input.channelId)
    return result
  }
  if (message.payload.role !== 'user'
    || input.authenticatedUserId && input.authenticatedUserId !== message.fromUid) throw new Error('request must be committed by the authenticated human')
  const identity = { tenantId: input.companyId, agentId: input.agentId, sessionId: input.channelId, principalId: message.fromUid }
  await loadRuntimeBinding({ ...identity, conversationId: input.channelId, createdAt: new Date(message.timestamp * 1000).toISOString() })
  const human = (await pool.query<{ name: string }>("SELECT name FROM participants WHERE company_id=$1 AND id=$2 AND kind='human' AND departed_at IS NULL",
    [input.companyId,message.fromUid])).rows[0]
  if (!human) throw new Error('request author is not an active human')
  const policy = await syncConversationPolicy(api, input.companyId, input.channelId)
  const custom = message.payload.metadata.custom
  const threadId = typeof custom.replyToClientMsgNo === 'string' ? custom.replyToClientMsgNo : undefined
  const explicitRefs = [...input.attachmentRefs ?? []]
  const related = await readAgentChannelMessages({ ...input, messageIds: [...new Set([...explicitRefs.map(ref => ref.clientMsgNo),...threadId ? [threadId] : []])], signal }) ?? []
  const quoted = related.find(item => item.clientMsgNo === threadId || item.messageId === threadId)
  if (quoted) explicitRefs.push(...nativeAttachments(quoted.payload).map(file => ({ clientMsgNo: quoted.clientMsgNo, attachmentId: file.id })))
  const history = await getAgentChannelHistory({ ...input, limit: 80, beforeSequence: message.messageSeq + 1 }) ?? []
  const allMessages = [...messages!, ...related, ...history]
  const attachmentIds = selectRequestAttachments(message, explicitRefs, allMessages)
  const missingIds = attachmentIds.filter(ref => !allMessages.some(item => item.clientMsgNo === ref.clientMsgNo)).map(ref => ref.clientMsgNo)
  if (missingIds.length) allMessages.push(...await readAgentChannelMessages({ ...input, messageIds: missingIds, signal }) ?? [])
  const audienceIds = policy.participants.filter(member => member.kind === 'human' && member.capabilities.includes('read')).map(member => member.id)
  const unavailable = await unavailableAttachmentIds(pool,input.companyId,input.channelId,attachmentIds,audienceIds)
  const files = await readRequestAttachments(allMessages, attachmentIds.filter(ref => !unavailable.has(attachmentRefId(ref))
    || explicitRefs.some(item => attachmentRefId(item) === attachmentRefId(ref)) || ref.clientMsgNo === input.clientMsgNo), input.companyId, signal, unavailable)
  const text = nativeText(message.payload).trim() || (nativeAttachments(message.payload).length
    ? `Use the committed attachments to help with the current conversation.` : undefined)
  if (!text) throw new Error('request text is empty')
  const savedContinuation = custom.agentContinuation === undefined ? undefined : agentContinuationSchema.parse(custom.agentContinuation)
  if (savedContinuation && (savedContinuation.agentId !== input.agentId || input.continuation
    && (input.continuation.runId !== savedContinuation.runId || input.continuation.requestVersion !== savedContinuation.requestVersion))) {
    throw new Error('continuation must match the committed reply')
  }
  const continuation = input.continuation ?? (savedContinuation ? { runId: savedContinuation.runId, requestVersion: savedContinuation.requestVersion } : undefined)
  signal.throwIfAborted()
  if (continuation) {
    const run = await productRunIdentity({ companyId: input.companyId, conversationId: input.channelId, agentId: input.agentId, runId: continuation.runId, principalId: message.fromUid, ...(threadId ? { threadId } : {}) })
    const result = await api.continueInput({ ...run, ...continuation,
      inputId: input.clientMsgNo, text, attachments: files })
    notifyRunAvailable(run, input.channelId)
    return { id: result.workId, deduplicated: result.status === 'already_resumed' }
  }
  if (threadId) await api.conversations.registerThread({ tenantId: input.companyId, conversationId: input.channelId, threadId, policyVersion: policy.version })
  const members = (await pool.query<{ id: string; name: string; kind: 'human' | 'agent' }>(
    'SELECT id,name,kind FROM participants WHERE company_id=$1 AND id=ANY($2::text[])', [input.companyId,policy.participants.map(member => member.id)])).rows
  const parsed = parseMentions(text,members)
  const mentionedIds = Array.isArray(custom.mentionedIds) ? custom.mentionedIds.filter((id): id is string => typeof id === 'string') : []
  const mentions = parsed.mentionAll || custom.mentionAll === true
    ? policy.participants.filter(member => member.kind === 'agent').map(member => member.id)
    : [...new Set([...parsed.mentionedIds,...mentionedIds])]
  const accepted = await api.conversations.ingest({ tenantId: input.companyId, conversationId: input.channelId,
    policyVersion: policy.version, messageId: input.clientMsgNo, version: 1, author: { id: message.fromUid, kind: 'human' },
    text, mentions, attachments: files, ...(threadId ? { threadId } : {}) }, { mode: 'execute', deliveryMode: 'auto', executionClass: 'operation' })
  for (const run of accepted.runs) await bindProductRun(pool,run,input.channelId)
  return accepted
}
