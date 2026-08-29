import type { ApiAttachment } from '@/api/contracts'
import { useParticipants } from '@/features/agents/state'
import { hasBroadcastMention } from '@/lib/chatMessages'
import { notifyAction } from '@/lib/actionToast'
import { type LingxiMessageV1, lingxiIm } from '@/lib/im/wukong'
import { getMeId } from '@/stores/auth'
import type { Message, QuotedSummary } from '@/types'
import { timeFromIso } from './messageProjection'
import { reconcileCommittedMessage } from './messageReconciliation'
import { useMessages } from './messageStore'
import { forgetOutbox, readOutbox, rememberOutbox } from './outbox'

function newTempId(): string {
  return `temp-${crypto.randomUUID()}`
}

function quotedSummaryFor(
  conversationId: string,
  quotedMessageId: string | null | undefined,
): QuotedSummary | undefined {
  if (!quotedMessageId) return undefined
  const original = (useMessages.getState().byConvo[conversationId] ?? [])
    .find((message) => message.id === quotedMessageId)
  if (!original) return undefined
  return {
    id: original.id,
    authorId: original.authorId,
    kind: original.kind,
    body: original.body.slice(0, 240),
    sequence: original.sequence ?? 0,
  }
}

function mentionedAgentIds(body: string): string[] {
  return Object.values(useParticipants.getState().byId)
    .filter((participant) => participant.kind === 'agent')
    .filter((participant) => [participant.id, participant.name].some((label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?，。！？])`, 'i').test(body)
    }))
    .map((participant) => participant.id)
}

function optimisticMessage(input: {
  conversationId: string
  body: string
  attachment?: ApiAttachment | null
  quotedMessageId?: string | null
  quoted?: QuotedSummary
  tempId: string
  authorId: string
}): Message {
  return {
    id: input.tempId,
    clientId: input.tempId,
    conversationId: input.conversationId,
    authorId: input.authorId,
    kind: 'text',
    body: input.body,
    at: timeFromIso(),
    createdAt: new Date().toISOString(),
    attachment: input.attachment
      ? {
          name: input.attachment.name,
          kind: input.attachment.kind,
          url: input.attachment.url,
          mime: input.attachment.mime,
          size: input.attachment.size,
        }
      : undefined,
    quotedMessageId: input.quotedMessageId ?? undefined,
    quoted: input.quoted,
    pending: true,
    sequence: Number.MAX_SAFE_INTEGER,
  }
}

export async function sendUserMessage(
  conversationId: string,
  body: string,
  attachment?: ApiAttachment | null,
  quotedMessageId?: string | null,
  clientNonce?: string,
  replayPayload?: LingxiMessageV1,
): Promise<void> {
  const value = body.trim()
  if (!value && !attachment) return
  const authorId = getMeId()
  if (!authorId) {
    notifyAction({ title: '消息发送失败', description: '当前登录身份不可用，请重新登录。', type: 'error' })
    return
  }

  const quoted = quotedSummaryFor(conversationId, quotedMessageId)
  const tempId = clientNonce ?? newTempId()
  const optimistic = optimisticMessage({
    conversationId,
    body: value,
    attachment,
    quotedMessageId,
    quoted,
    tempId,
    authorId,
  })
  useMessages.setState((state) => {
    const messages = state.byConvo[conversationId] ?? []
    const exists = messages.some((message) => message.id === tempId)
    return {
      byConvo: {
        ...state.byConvo,
        [conversationId]: exists
          ? messages.map((message) => message.id === tempId
            ? { ...message, pending: true, failed: false }
            : message)
          : [...messages, optimistic],
      },
    }
  })

  const payload: LingxiMessageV1 = replayPayload ?? {
    version: 1,
    kind: attachment ? 'attachment' : 'text',
    clientMsgNo: tempId,
    body: value,
    ...(quotedMessageId ? { replyToClientMsgNo: quotedMessageId } : {}),
    data: {
      ...(attachment ?? {}),
      mentionedIds: mentionedAgentIds(value),
      mentionAll: hasBroadcastMention(value),
      ...(quoted ? { replyAuthorId: quoted.authorId } : {}),
    },
  }
  rememberOutbox({ convoId: conversationId, nonce: tempId, payload, createdAt: new Date().toISOString() })
  try {
    reconcileCommittedMessage(await lingxiIm.send(conversationId, payload))
    if (attachment) {
      window.setTimeout(() => {
        void import('@/features/knowledge/state')
          .then(({ useKnowledgeSources }) => useKnowledgeSources.getState().load())
          .catch((error) => console.warn('[knowledge] attachment source refresh failed', error))
      }, 750)
    }
  } catch (error) {
    console.warn('[messages] send failed', error)
    useMessages.setState((state) => ({
      byConvo: {
        ...state.byConvo,
        [conversationId]: (state.byConvo[conversationId] ?? []).map((message) => message.id === tempId
          ? { ...message, pending: false, failed: true }
          : message),
      },
    }))
  }
}

export function discardFailedMessage(conversationId: string, tempId: string): void {
  forgetOutbox(tempId)
  useMessages.setState((state) => {
    const messages = state.byConvo[conversationId]
    if (!messages) return {}
    const next = messages.filter((message) => message.id !== tempId)
    return next.length === messages.length
      ? {}
      : { byConvo: { ...state.byConvo, [conversationId]: next } }
  })
}

export async function retryFailedMessage(conversationId: string, tempId: string): Promise<void> {
  const message = (useMessages.getState().byConvo[conversationId] ?? [])
    .find((candidate) => candidate.id === tempId)
  if (!message) return
  const attachment = message.attachment
    ? {
        url: message.attachment.url ?? '',
        name: message.attachment.name,
        kind: message.attachment.kind,
        mime: message.attachment.mime,
        size: message.attachment.size,
      }
    : null
  const replayPayload = readOutbox().find((entry) => entry.nonce === tempId)?.payload
  await sendUserMessage(
    conversationId,
    message.body ?? '',
    attachment,
    message.quotedMessageId ?? null,
    tempId,
    replayPayload,
  )
}

export async function recoverMessageOutbox(): Promise<void> {
  for (const entry of readOutbox()) {
    try {
      const status = await lingxiIm.sendStatus(entry.nonce)
      if (status.status === 'accepted' && status.echo) {
        reconcileCommittedMessage(status.echo)
        continue
      }
      const data = entry.payload.data ?? {}
      const attachment = entry.payload.kind === 'attachment'
        ? data as unknown as ApiAttachment
        : null
      await sendUserMessage(
        entry.convoId,
        entry.payload.body ?? '',
        attachment,
        entry.payload.replyToClientMsgNo,
        entry.nonce,
        entry.payload,
      )
    } catch (error) {
      console.warn('[messages] outbox recovery deferred', error)
    }
  }
}
