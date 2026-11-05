import type { ConversationEvidence } from '../forum/contracts'

/** Only shared immutable snapshots may resolve a teacher's report citation. */
export function findReportSource(source: { messageId: string; excerpt: string }, references: ConversationEvidence[]) {
  for (const [index, reference] of references.entries()) {
    const message = reference.messages.find(message => message.id === source.messageId && message.text.includes(source.excerpt))
    if (message) return { index, reference, message }
  }
  return null
}
