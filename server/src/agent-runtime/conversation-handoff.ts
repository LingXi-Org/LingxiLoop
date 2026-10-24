import type { TurnContext } from '@lyyzka/lingxios'
import { maskNonMentionText, scanMentions, type MentionTarget } from '../mentions.js'

/** A public, explicit assignment contract. Ordinary mentions are presentation only.
 * Each unquoted prose line has one addressee and a non-empty task. Membership,
 * recipient capabilities, budgets and causality are still enforced by ingest. */
export function conversationHandoffMentions(text: string, roster: readonly MentionTarget[], authorId: string): string[] {
  const masked = maskNonMentionText(text)
  const mentions = scanMentions(text,roster)
  const recipients = new Set<string>()
  for(const match of masked.matchAll(/^ {0,3}协作交接[：:][ \t]*/gm)) {
    const start = match.index+match[0].length
    const mention = mentions.find(range => range.start === start)
    if (!mention || mention.id === 'all' || mention.id === authorId) continue
    const peer = roster.find(member => member.id === mention.id)
    if (!peer || peer.kind === 'human') continue
    const remainder = masked.slice(mention.end).split(/\r?\n/,1)[0]
    if (/^[ \t]+\S/.test(remainder)) recipients.add(mention.id)
  }
  return [...recipients]
}

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
      || !conversation.audience.participantIds.includes(entry.id)) return []
    return [{ id: entry.id,name: 'name' in entry && typeof entry.name === 'string' ? entry.name : entry.id,
      ...('kind' in entry && entry.kind === 'human' ? {kind: 'human' as const} : {kind: 'agent' as const}),
      ...('presetKey' in entry && typeof entry.presetKey === 'string' ? {presetKey: entry.presetKey} : {}),
      ...('sourceName' in entry && typeof entry.sourceName === 'string' ? {sourceName: entry.sourceName} : {}),
    }]
  })
  return conversationHandoffMentions(text,peers,work.agentId).length > 0
}
