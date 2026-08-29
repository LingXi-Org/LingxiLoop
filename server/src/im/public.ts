import type { LingxiMessageV1 } from '../agent-os/types.js'
import type { ImMessageEnvelope } from './messages-application.js'
import { imMessagesApplication } from './messages-facade.js'

export function getAgentChannelHistory(input: {
  companyId: string
  agentId: string
  channelId: string
  limit?: number
  beforeSequence?: number
}) {
  return imMessagesApplication.history({
    companyId: input.companyId,
    userId: input.agentId,
    channelId: input.channelId,
    limit: input.limit ?? 200,
    beforeSequence: input.beforeSequence ?? 0,
  })
}

export async function sendAgentChannelMessage(input: {
  companyId: string
  agentId: string
  channelId: string
  clientNonce: string
  payload: LingxiMessageV1
}): Promise<
  | { kind: 'channel_not_found' }
  | { kind: 'nonce_conflict' }
  | { kind: 'verbatim_peer'; peer: ImMessageEnvelope }
  | { kind: 'accepted'; duplicate: boolean; messageId: string; sequence: number }
> {
  const result = await imMessagesApplication.acceptAgentMessage({
    companyId: input.companyId,
    userId: input.agentId,
    channelId: input.channelId,
    clientNonce: input.clientNonce,
    payload: input.payload,
    rejectVerbatimPeerBody: input.payload.kind === 'text' ? input.payload.body : undefined,
  })
  if (result.kind === 'verbatim_peer') {
    return { kind: 'verbatim_peer' as const, peer: result.peer }
  }
  if (result.kind !== 'accepted') return result
  const messageId = String(result.echo.messageId ?? '')
  const sequence = Number(result.echo.messageSeq)
  if (!messageId || !Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error('WuKong send acceptance returned an invalid echo')
  }
  return { kind: 'accepted', duplicate: result.duplicate, messageId, sequence }
}

export async function sendSystemChannelMessage(input: {
  companyId: string
  actorId: string
  channelId: string
  clientNonce: string
  payload: LingxiMessageV1
}): Promise<
  | { kind: 'channel_not_found' }
  | { kind: 'nonce_conflict' }
  | { kind: 'accepted'; duplicate: boolean; messageId: string; sequence: number }
> {
  const result = await imMessagesApplication.acceptSystemMessage(input)
  if (result.kind !== 'accepted') return result
  const messageId = String(result.echo.messageId ?? '')
  const sequence = Number(result.echo.messageSeq)
  if (!messageId || !Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new Error('WuKong system send acceptance returned an invalid echo')
  }
  return { kind: 'accepted', duplicate: result.duplicate, messageId, sequence }
}

export function getAgentInbox(input: { companyId: string; agentId: string; limit?: number }) {
  return imMessagesApplication.inbox({
    companyId: input.companyId,
    userId: input.agentId,
    limit: input.limit ?? 200,
  })
}

export function searchMemberMessages(input: {
  companyId: string
  userId: string
  query: string
  channelId?: string
  projectId?: string
  limit?: number
}) {
  return imMessagesApplication.search({
    companyId: input.companyId,
    userId: input.userId,
    query: input.query,
    channelId: input.channelId,
    projectId: input.projectId,
    limit: input.limit ?? 10,
  })
}

export function searchAgentMessages(input: {
  companyId: string
  agentId: string
  query: string
  channelId?: string
  limit?: number
}) {
  return searchMemberMessages({ ...input, userId: input.agentId })
}

export function clearAgentChannelUnread(input: { companyId: string; agentId: string; channelId: string }) {
  return imMessagesApplication.clearChannelUnread({
    companyId: input.companyId,
    userId: input.agentId,
    channelId: input.channelId,
  })
}

export function clearAllAgentUnread(input: { companyId: string; agentId: string }) {
  return imMessagesApplication.clearAllUnread({ companyId: input.companyId, userId: input.agentId })
}

export async function toggleAgentChannelReaction(input: {
  companyId: string
  agentId: string
  channelId: string
  messageId: string
  emoji: string
}): Promise<
  | { kind: 'channel_not_found' }
  | { kind: 'message_not_found' }
  | { kind: 'updated'; reactions: Array<{ emoji: string; count: number; users: string[] }> }
> {
  const history = await imMessagesApplication.history({
    companyId: input.companyId,
    userId: input.agentId,
    channelId: input.channelId,
    limit: 200,
    beforeSequence: 0,
  })
  if (!history) return { kind: 'channel_not_found' }
  const message = history.find((candidate) => candidate.messageId === input.messageId)
  if (!message) return { kind: 'message_not_found' }
  const result = await imMessagesApplication.toggleReaction({
    companyId: input.companyId,
    userId: input.agentId,
    channelId: input.channelId,
    messageId: message.messageId,
    messageSeq: message.messageSeq,
    emoji: input.emoji,
  })
  return result ? { kind: 'updated', reactions: result.reactions } : { kind: 'message_not_found' }
}
