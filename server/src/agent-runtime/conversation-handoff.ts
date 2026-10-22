import type { TurnContext } from '@lyyzka/lingxios'
import { scanMentions } from '../mentions.js'

/** A public peer assignment must be committed before delivery can dispatch it.
 * Use only the host-built current agent roster intersected with the frozen
 * audience. This is a content-repair boundary, never dispatch authorization;
 * delivery rechecks current membership, policy and recipient capabilities. */
export function hasConversationHandoff(text: string, context: TurnContext): boolean {
  const { work } = context, conversation = work.conversation
  if (!conversation || conversation.internal || work.meta?.conversationTurn !== true) return false
  const roster = context.dynamic?.roster
  if (!Array.isArray(roster)) return false
  const peers = roster.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('id' in entry) || typeof entry.id !== 'string'
      || entry.id === work.agentId || entry.id === work.principalId || !conversation.audience.participantIds.includes(entry.id)) return []
    // IDs only: a prose name or renamed alias is not an explicit handoff.
    return [{ id: entry.id,name: entry.id }]
  })
  return scanMentions(text,peers,{ allowInlineCodeMentions: true }).some(mention => mention.id !== 'all' && text.slice(mention.start,mention.end) === `@${mention.id}`)
}
