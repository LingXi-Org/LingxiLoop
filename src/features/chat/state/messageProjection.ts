import type { ApiMessage } from '@/api/contracts'
import type { ImEnvelope } from '@/lib/im/wukong'
import type { ImReadReceiptAdvance, Message } from '@/types'
import { deriveMineForReactions } from './reactions'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

export function timeFromIso(iso?: string): string {
  const date = iso ? new Date(iso) : new Date()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function sequenceOf(message: Message): number | null {
  const raw = message.sequence
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

export function mergeReadReceipts(
  current: readonly ImReadReceiptAdvance[] | undefined,
  incoming: readonly ImReadReceiptAdvance[],
): ImReadReceiptAdvance[] {
  const byKey = new Map<string, ImReadReceiptAdvance>()
  for (const receipt of [...(current ?? []), ...incoming]) {
    byKey.set(`${receipt.readerId}:${receipt.readThroughSeq}`, receipt)
  }
  return [...byKey.values()].sort((left, right) => left.readAt.localeCompare(right.readAt))
}

export function sortMessagesStable(messages: Message[]): Message[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((left, right) => {
      const leftSequence = sequenceOf(left.message)
      const rightSequence = sequenceOf(right.message)
      if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence
      if (leftSequence !== null && rightSequence === null) return -1
      if (leftSequence === null && rightSequence !== null) return 1
      return left.index - right.index
    })
    .map(({ message }) => message)
}

export function fromApi(message: ApiMessage): Message {
  let at: string
  if (message.at && !ISO_RE.test(message.at)) at = message.at
  else if (message.at) at = timeFromIso(message.at)
  else if (message.createdAt) at = timeFromIso(message.createdAt)
  else at = timeFromIso()

  const raw = message as unknown as {
    tool?: Message['tool']
    attachment?: Message['attachment']
    quotedMessageId?: string | null
    quoted?: Message['quoted'] | null
    replyCount?: number | null
    email?: Message['email'] | null
    poll?: Message['poll'] | null
    pollTallies?: Message['pollTallies'] | null
    pollRevision?: number | null
    questionnaire?: Message['questionnaire'] | null
    clientId?: string | null
    mentionedIds?: string[] | null
    mentionAll?: boolean | null
    runId?: string | null
    handoff?: Message['handoff'] | null
    approval?: Message['approval'] | null
    canvas?: Message['canvas'] | null
    learningMission?: Message['learningMission'] | null
    citations?: Message['citations'] | null
    reactions?: Message['reactions'] | null
  }
  const projected: Message = {
    id: message.id,
    conversationId: message.conversationId,
    authorId: message.authorId,
    kind: message.kind as Message['kind'],
    body: message.body,
    at,
    createdAt: message.createdAt,
    reactions: deriveMineForReactions(raw.reactions ?? message.reactions),
    tool: raw.tool ?? undefined,
    attachment: raw.attachment ?? undefined,
    quotedMessageId: raw.quotedMessageId ?? undefined,
    quoted: raw.quoted ?? undefined,
    replyCount: raw.replyCount ?? undefined,
    email: raw.email ?? undefined,
    poll: raw.poll ?? undefined,
    pollTallies: raw.pollTallies ?? undefined,
    pollRevision: raw.pollRevision ?? undefined,
    questionnaire: raw.questionnaire ?? undefined,
    clientId: raw.clientId ?? undefined,
    mentionedIds: raw.mentionedIds ?? undefined,
    mentionAll: raw.mentionAll ?? undefined,
    runId: raw.runId ?? undefined,
    handoff: raw.handoff ?? undefined,
    approval: raw.approval ?? undefined,
    canvas: raw.canvas ?? undefined,
    learningMission: raw.learningMission ?? undefined,
    citations: raw.citations ?? undefined,
  }
  projected.sequence = message.sequence
  return projected
}

export function fromIm(message: ImEnvelope): Message {
  const payload = message.payload
  const data = payload.data ?? {}
  if (payload.kind === 'learning_mission' && typeof window !== 'undefined') {
    window.queueMicrotask(() => window.dispatchEvent(new Event('lingxiloop:learning-updated')))
  }
  const kind = payload.kind === 'tool_activity' || payload.kind === 'artifact' ? 'tool' : payload.kind
  const pollClientMessageNumber = payload.kind === 'poll'
    ? String(payload.refs?.pollClientMsgNo ?? payload.clientMsgNo)
    : null
  const approvalId = payload.kind === 'approval' && payload.refs?.approvalId
    ? `approval-${payload.refs.approvalId}`
    : null
  const handoffId = payload.kind === 'handoff' && payload.refs?.handoffId
    ? `handoff-${payload.refs.handoffId}`
    : null
  const pollData = payload.kind === 'poll' && data.poll && typeof data.poll === 'object'
    ? data.poll as Message['poll']
    : payload.kind === 'poll' ? data as unknown as Message['poll'] : undefined
  const createdAt = new Date(message.timestamp > 10_000_000_000 ? message.timestamp : message.timestamp * 1000).toISOString()
  return fromApi({
    id: pollClientMessageNumber ?? approvalId ?? handoffId ?? (message.messageId || payload.clientMsgNo),
    clientId: payload.clientMsgNo,
    conversationId: message.channelId,
    authorId: message.fromUid,
    kind: kind as Message['kind'],
    body: payload.body ?? '',
    at: createdAt,
    createdAt,
    sequence: message.messageSeq,
    quotedMessageId: payload.replyToClientMsgNo,
    attachment: payload.kind === 'attachment' ? data as Message['attachment'] : undefined,
    tool: payload.kind === 'tool_activity' || payload.kind === 'artifact' ? {
      name: String(data.name ?? payload.body ?? payload.kind),
      arg: String(data.arg ?? ''),
      status: String(data.status ?? data.stage ?? 'completed'),
      detail: String(data.detail ?? ''),
    } : undefined,
    handoff: payload.kind === 'handoff' ? data as unknown as Message['handoff'] : undefined,
    approval: payload.kind === 'approval' ? data as unknown as Message['approval'] : undefined,
    canvas: payload.kind === 'canvas' ? data as unknown as Message['canvas'] : undefined,
    learningMission: payload.kind === 'learning_mission' ? data as unknown as Message['learningMission'] : undefined,
    citations: Array.isArray(data.citations) ? data.citations as Message['citations'] : undefined,
    poll: pollData,
    pollTallies: payload.kind === 'poll' && Array.isArray(data.pollTallies)
      ? data.pollTallies as Message['pollTallies']
      : undefined,
    pollRevision: payload.kind === 'poll' && typeof data.revision === 'number' ? data.revision : undefined,
    questionnaire: payload.kind === 'questionnaire'
      ? (data.questionnaire && typeof data.questionnaire === 'object'
          ? data.questionnaire as Message['questionnaire']
          : data as unknown as Message['questionnaire'])
      : undefined,
    mentionedIds: Array.isArray(data.mentionedIds) ? data.mentionedIds.map(String) : undefined,
    mentionAll: data.mentionAll === true,
    runId: typeof payload.refs?.runId === 'string' ? payload.refs.runId : undefined,
  })
}

export function fromImBatch(messages: ImEnvelope[]): Message[] {
  const byId = new Map<string, Message>()
  for (const envelope of messages) {
    const next = fromIm(envelope)
    const previous = byId.get(next.id)
    if (!previous) {
      byId.set(next.id, next)
      continue
    }
    const previousSequence = sequenceOf(previous)
    const nextSequence = sequenceOf(next)
    const latest = (nextSequence ?? 0) >= (previousSequence ?? 0) ? next : previous
    const earliest = latest === next ? previous : next
    latest.sequence = Math.min(
      previousSequence ?? Number.MAX_SAFE_INTEGER,
      nextSequence ?? Number.MAX_SAFE_INTEGER,
    )
    latest.createdAt = earliest.createdAt
    latest.at = earliest.at
    byId.set(next.id, latest)
  }
  return projectThreadMetadata(sortMessagesStable([...byId.values()]))
}

export function projectThreadMetadata(messages: Message[]): Message[] {
  const roots = new Map<string, Message>()
  for (const message of messages) {
    roots.set(message.id, message)
    if (message.clientId) roots.set(message.clientId, message)
  }
  const replyCounts = new Map<string, number>()
  const normalized = messages.map((message) => {
    if (!message.quotedMessageId) return message
    const root = roots.get(message.quotedMessageId)
    if (!root) return message
    replyCounts.set(root.id, (replyCounts.get(root.id) ?? 0) + 1)
    const rootSequence = root.sequence
    return {
      ...message,
      quotedMessageId: root.id,
      quoted: message.quoted ?? (rootSequence === undefined ? undefined : {
        id: root.id,
        authorId: root.authorId,
        kind: root.kind,
        body: (root.body ?? '').slice(0, 240),
        sequence: rootSequence,
      }),
    }
  })
  return normalized.map((message) => {
    const replyCount = replyCounts.get(message.id)
    return replyCount === undefined ? message : { ...message, replyCount }
  })
}

export function mergeFetchedMessages(current: Message[] | undefined, incoming: Message[]): Message[] {
  if (!current || current.length === 0) return incoming

  const currentById = new Map(current.map((message) => [message.id, message]))
  const incomingIds = new Set(incoming.map((message) => message.id))
  const incomingClientIds = new Set(incoming.map((message) => message.clientId).filter(Boolean))
  const merged = incoming.map((message) => {
    const previous = currentById.get(message.id)
    if (!previous) return message
    const preservePosition = message.kind === 'approval' || message.kind === 'handoff'
    return {
      ...message,
      ...(!message.clientId && previous.clientId ? { clientId: previous.clientId } : {}),
      ...(preservePosition ? {
        sequence: previous.sequence,
        createdAt: previous.createdAt,
        at: previous.at,
      } : {}),
    }
  })

  for (const message of current) {
    if (incomingIds.has(message.id)) continue
    if (message.clientId && incomingClientIds.has(message.clientId)) continue
    merged.push(message)
  }

  return projectThreadMetadata(sortMessagesStable(merged))
}
