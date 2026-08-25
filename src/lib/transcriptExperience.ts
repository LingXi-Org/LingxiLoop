import type { Message } from '@/types'

export interface TranscriptAdjacency {
  isGroupStart: boolean
  isGroupEnd: boolean
  isContinuedFromPrevious: boolean
  isContinuedToNext: boolean
}

export interface FindMatch {
  messageId: string
  occurrence: number
}

const FIVE_MINUTES = 5 * 60_000

function messageTime(message: Message): number | null {
  const raw = message.createdAt ?? message.at
  const value = Date.parse(raw)
  return Number.isFinite(value) ? value : null
}

function isPlainBubble(message: Message): boolean {
  return message.kind === 'text'
    && !message.attachment
    && !message.quotedMessageId
    && !message.quoted
    && !(message.replyCount && message.replyCount > 0)
    && !(message.reactions && message.reactions.length > 0)
    && !message.failed
}

function canJoin(previous: Message | undefined, current: Message | undefined): boolean {
  if (!previous || !current || !isPlainBubble(previous) || !isPlainBubble(current)) return false
  if (previous.authorId !== current.authorId || previous.conversationId !== current.conversationId) return false
  const left = messageTime(previous)
  const right = messageTime(current)
  if (left === null || right === null) return true
  const leftDate = new Date(left)
  const rightDate = new Date(right)
  if (leftDate.getFullYear() !== rightDate.getFullYear()
    || leftDate.getMonth() !== rightDate.getMonth()
    || leftDate.getDate() !== rightDate.getDate()) return false
  return right >= left && right - left <= FIVE_MINUTES
}

export function projectTranscriptAdjacency(messages: readonly Message[]): readonly TranscriptAdjacency[] {
  return messages.map((message, index) => {
    const continuedFromPrevious = canJoin(messages[index - 1], message)
    const continuedToNext = canJoin(message, messages[index + 1])
    return {
      isGroupStart: !continuedFromPrevious,
      isGroupEnd: !continuedToNext,
      isContinuedFromPrevious: continuedFromPrevious,
      isContinuedToNext: continuedToNext,
    }
  })
}

export function searchableTextForMessage(message: Message): string {
  const values: string[] = []
  if (message.body) values.push(message.body)
  if (message.email?.subject) values.push(message.email.subject)
  if (message.attachment?.name) values.push(message.attachment.name)
  if (message.canvas?.title) values.push(message.canvas.title)
  if (message.poll?.question) values.push(message.poll.question)
  if (message.tool?.name) values.push(message.tool.name)
  if (message.tool?.detail) values.push(message.tool.detail)
  return values.join('\n')
}

export function projectFindMatches(messages: readonly Message[], query: string): FindMatch[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const matches: FindMatch[] = []
  for (const message of messages) {
    const text = searchableTextForMessage(message).toLocaleLowerCase()
    let occurrence = 0
    let offset = text.indexOf(needle)
    while (offset >= 0) {
      matches.push({ messageId: message.id, occurrence })
      occurrence += 1
      offset = text.indexOf(needle, offset + Math.max(1, needle.length))
    }
  }
  return matches
}

