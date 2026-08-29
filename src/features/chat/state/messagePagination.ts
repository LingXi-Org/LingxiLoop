import type { Message } from '@/types'

function durableSequence(message: Message): number | null {
  if (message.pending || message.failed) return null
  const sequence = message.sequence
  return typeof sequence === 'number'
    && Number.isSafeInteger(sequence)
    && sequence > 0
    && sequence !== Number.MAX_SAFE_INTEGER
    ? sequence
    : null
}

export function oldestDurableSequence(messages: Message[]): number | null {
  let oldest: number | null = null
  for (const message of messages) {
    const sequence = durableSequence(message)
    if (sequence !== null && (oldest === null || sequence < oldest)) oldest = sequence
  }
  return oldest
}

export function selectOlderMessages(
  current: Message[],
  incoming: Message[],
  beforeSequence: number,
): Message[] {
  const currentIds = new Set(current.map((message) => message.id))
  return incoming.filter((message) => {
    const sequence = durableSequence(message)
    return sequence !== null && sequence < beforeSequence && !currentIds.has(message.id)
  })
}

