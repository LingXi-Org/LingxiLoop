import { getMeId } from '@/stores/auth'
import type { ReactionEntry } from '@/types'

export function deriveMineForReactions<R extends { users?: string[] | null }>(
  reactions: R[] | null | undefined,
): Array<R & { mine: boolean }> | undefined {
  if (!reactions || reactions.length === 0) return undefined
  const meId = getMeId()
  return reactions.map((reaction) => ({
    ...reaction,
    mine: Boolean(meId && Array.isArray(reaction.users) && reaction.users.includes(meId)),
  }))
}

export function mergeReactionOrder(
  current: ReactionEntry[] | undefined,
  incoming: ReactionEntry[] | undefined,
): ReactionEntry[] | undefined {
  if (!incoming || incoming.length === 0) return undefined
  if (!current || current.length === 0) return incoming
  const byEmoji = new Map(incoming.map((reaction) => [reaction.emoji, reaction]))
  const next: ReactionEntry[] = []
  const seen = new Set<string>()
  for (const reaction of current) {
    if (seen.has(reaction.emoji)) continue
    const updated = byEmoji.get(reaction.emoji)
    if (!updated || updated.count <= 0) continue
    next.push(updated)
    seen.add(reaction.emoji)
  }
  for (const reaction of incoming) {
    if (seen.has(reaction.emoji) || reaction.count <= 0) continue
    next.push(reaction)
    seen.add(reaction.emoji)
  }
  return next.length > 0 ? next : undefined
}

export function optimisticToggleReactions(
  reactions: ReactionEntry[] | undefined,
  emoji: string,
): ReactionEntry[] | undefined {
  const meId = getMeId()
  const next = reactions?.map((reaction) => ({
    ...reaction,
    users: reaction.users ? [...reaction.users] : undefined,
  })) ?? []
  const index = next.findIndex((reaction) => reaction.emoji === emoji)
  if (index === -1) {
    next.push({ emoji, count: 1, mine: true, users: meId ? [meId] : undefined })
    return next
  }
  const current = next[index]
  const users = current.users
  const hadMine = meId
    ? Boolean(current.mine || users?.includes(meId))
    : Boolean(current.mine)
  const count = hadMine ? Math.max(0, current.count - 1) : current.count + 1
  const patchedUsers = meId
    ? hadMine
      ? users?.filter((id) => id !== meId)
      : Array.from(new Set([...(users ?? []), meId]))
    : users
  if (count === 0) next.splice(index, 1)
  else next[index] = { ...current, count, mine: !hadMine, users: patchedUsers }
  const compact = next.filter((reaction) => reaction.count > 0)
  return compact.length > 0 ? compact : undefined
}
