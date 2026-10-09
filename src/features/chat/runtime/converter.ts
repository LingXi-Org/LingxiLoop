import type { ThreadMessage } from '@assistant-ui/react'
import type { RunDisplayState } from '@/lib/agentRunSnapshot'
import type { ImEnvelope } from '@/lib/im/wukong'
import { deserializeMessage } from '@/lib/nativeMessage'
import type { Participant } from '@/types'
import type { LingxiMessageMetadata, LingxiQuoteMetadata, LingxiReactionMetadata } from './model'
import { mergeProgressMessage, preserveMessageTime, resolveMessagePresentation } from './model'

type JsonObject = Record<string, unknown>

export interface MessageConversionContext {
  participants: Record<string, Participant>
  meId: string | null
}

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

function reactions(data: JsonObject, meId: string | null): LingxiReactionMetadata[] {
  const rows = Array.isArray(data.reactions) ? data.reactions : []
  return rows.flatMap((value) => {
    const row = object(value)
    const emoji = string(row.emoji)
    const count = finiteNumber(row.count)
    if (!emoji || count === null || count <= 0) return []
    const userIds = stringArray(row.users)
    return [{ emoji, count, userIds, mine: Boolean(meId && userIds.includes(meId)) }]
  })
}

function quote(data: JsonObject, replyToClientMsgNo?: string): LingxiQuoteMetadata | null {
  if (!replyToClientMsgNo) return null
  const quoted = object(data.quoted)
  return {
    messageId: string(quoted.id, replyToClientMsgNo),
    authorId: string(quoted.authorId),
    authorName: typeof quoted.authorName === 'string' ? quoted.authorName : null,
    text: string(quoted.body).slice(0, 240),
    sequence: finiteNumber(quoted.sequence),
  }
}

function senderMetadata(envelope: ImEnvelope, context: MessageConversionContext) {
  const participant = context.participants[envelope.fromUid]
  const system = envelope.payload.role === 'system'
  return {
    senderId: envelope.fromUid,
    senderName: participant?.name ?? (system ? '系统' : envelope.fromUid),
    senderKind: system ? 'system' as const : participant?.kind ?? 'human' as const,
    senderAvatarUrl: participant?.avatarUrl ?? null,
    isMine: envelope.fromUid === context.meId,
  }
}

/** Enrich transport identity and UI chrome; content/status always come from the native message. */
export function convertEnvelope(envelope: ImEnvelope, context: MessageConversionContext): ThreadMessage {
  const message = deserializeMessage(envelope.payload), custom = message.metadata.custom
  const reply = typeof custom.replyToClientMsgNo === 'string' ? custom.replyToClientMsgNo : undefined
  const refs = object(custom.refs)
  const card = message.content.find(part => part.type === 'data' && ['handoff','canvas','learning-mission','poll'].includes(part.name))
  const data = card?.type === 'data' ? object(card.data) : {}
  const revision = custom.progressVersion ?? data.revision
  const harness = custom.harness as RunDisplayState | undefined
  if (harness && (harness.runId !== custom.runId || refs.agentId !== envelope.fromUid || message.id !== `run-${harness.runId}`)) throw new Error('运行消息身份不一致')
  const metadata: LingxiMessageMetadata = {
    ...custom, schema: 'lingxiloop.thread-message.v2', conversationId: envelope.channelId,
    clientMessageId: envelope.clientMsgNo, imMessageId: envelope.messageId,
    sequence: Number.isSafeInteger(envelope.messageSeq) && envelope.messageSeq > 0 ? envelope.messageSeq : null,
    ...(card && Number.isSafeInteger(revision) ? { progress: { key: message.id, version: Number(revision), sequence: envelope.messageSeq } } : {}),
    ...senderMetadata(envelope,context), delivery: 'sent',
    messageKind: message.role === 'system' ? 'system' : card?.type === 'data' ? card.name : 'text',
    presentation: resolveMessagePresentation([...message.content,...message.role === 'user' ? message.attachments.flatMap(file => file.content) : []]),
    runId: typeof custom.runId === 'string' ? custom.runId : typeof refs.runId === 'string' ? refs.runId : null,
    ...(harness ? { harness, harnessControl: custom.controlPrincipalId === context.meId } : {}),
    quotedMessageId: reply ?? null, quote: quote(custom,reply), reactions: reactions(custom,context.meId),
    replyCount: finiteNumber(custom.replyCount) ?? 0, threadRootId: reply ?? null,
    groupStart: true, groupEnd: true, continuedFromPrevious: false, continuedToNext: false, clusterChromeAt: null,
  }
  return { ...message, metadata: { ...message.metadata, custom: metadata } } as ThreadMessage
}

function adjacent(left: ThreadMessage, right: ThreadMessage): boolean {
  const leftMeta = left.metadata.custom as LingxiMessageMetadata
  const rightMeta = right.metadata.custom as LingxiMessageMetadata
  const elapsed = right.createdAt.getTime() - left.createdAt.getTime()
  return left.role !== 'system'
    && right.role !== 'system'
    && leftMeta.senderId === rightMeta.senderId
    && leftMeta.delivery !== 'failed'
    && rightMeta.delivery !== 'failed'
    && elapsed >= 0
    && elapsed <= 5 * 60_000
}

export function projectMessageGroups(messages: readonly ThreadMessage[]): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>()
  for (const message of messages) {
    const custom = message.metadata.custom as LingxiMessageMetadata
    for (const id of [message.id, custom.clientMessageId, custom.imMessageId]) {
      if (id) byId.set(id, message)
    }
  }
  const clusterChrome = new Map<number, string>()
  for (let start = 0; start < messages.length;) {
    let end = start
    while (end + 1 < messages.length && adjacent(messages[end]!, messages[end + 1]!)) end += 1
    const first = messages[start]!
    const firstMeta = first.metadata.custom as LingxiMessageMetadata
    if (firstMeta.senderKind === 'agent' && firstMeta.presentation === 'special-card') {
      const source = messages.slice(start, end + 1).find((message) => (
        (message.metadata.custom as LingxiMessageMetadata).presentation === 'conversation'
      ))
      if (source) {
        for (let index = start; index <= end; index += 1) clusterChrome.set(index, source.createdAt.toISOString())
      }
    }
    start = end + 1
  }
  return messages.map((message, index) => {
    const previous = messages[index - 1]
    const next = messages[index + 1]
    const continuedFromPrevious = Boolean(previous && adjacent(previous, message))
    const continuedToNext = Boolean(next && adjacent(message, next))
    const custom = message.metadata.custom as LingxiMessageMetadata
    const clusterChromeAt = clusterChrome.get(index) ?? null
    // Native IM replies carry the original ID; resolve their preview from the
    // same authorized conversation history for both live sends and reloads.
    const original = custom.quotedMessageId && !custom.quote?.text ? byId.get(custom.quotedMessageId) : null
    const originalMetadata = original?.metadata.custom as LingxiMessageMetadata | undefined
    const originalText = original?.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n').slice(0, 240)
    const resolvedQuote = original && originalMetadata && originalText ? {
      messageId: original.id,
      authorId: originalMetadata.senderId,
      authorName: originalMetadata.senderName,
      text: originalText,
      sequence: originalMetadata.sequence,
    } : custom.quote
    if (
      custom.groupStart === !continuedFromPrevious
      && custom.groupEnd === !continuedToNext
      && custom.continuedFromPrevious === continuedFromPrevious
      && custom.continuedToNext === continuedToNext
      && custom.clusterChromeAt === clusterChromeAt
      && custom.quote === resolvedQuote
    ) return message
    return {
      ...message,
      metadata: {
        ...message.metadata,
        custom: {
          ...custom,
          quote: resolvedQuote,
          groupStart: !continuedFromPrevious,
          groupEnd: !continuedToNext,
          continuedFromPrevious,
          continuedToNext,
          clusterChromeAt,
        },
      },
    } as ThreadMessage
  })
}

export function convertEnvelopeBatch(
  envelopes: readonly ImEnvelope[],
  context: MessageConversionContext,
): ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>()
  for (const envelope of envelopes) {
    const message = convertEnvelope(envelope, context)
    const progress = (message.metadata.custom as LingxiMessageMetadata).progress
    const key = progress ? JSON.stringify([envelope.channelId,progress.key]) : message.id
    const current = byId.get(key)
    const currentSequence = current ? (current.metadata.custom as LingxiMessageMetadata).sequence ?? 0 : -1
    const nextSequence = (message.metadata.custom as LingxiMessageMetadata).sequence ?? 0
    if (current && progress) byId.set(key,mergeProgressMessage(current,message))
    else if (!current || nextSequence >= currentSequence) byId.set(key, preserveMessageTime(message, current))
  }
  return projectMessageGroups([...byId.values()].sort((left, right) => {
    const leftSequence = (left.metadata.custom as LingxiMessageMetadata).sequence
    const rightSequence = (right.metadata.custom as LingxiMessageMetadata).sequence
    if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence
    return left.createdAt.getTime() - right.createdAt.getTime()
  }))
}
