export interface RoutingParticipant {
  id: string
  kind: 'human' | 'agent'
  presetKey?: string | null
}

/** Shared with the native policy: SQL row order cannot choose a different default. */
export function defaultLearningAgentId(members: RoutingParticipant[], leaderAgentId?: string): string | undefined {
  const agents = members.filter(member => member.kind === 'agent')
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  return agents.find(agent => agent.id === leaderAgentId)?.id
    ?? agents.find(agent => agent.presetKey === 'nova')?.id
    ?? agents.find(agent => agent.presetKey === 'forge')?.id
    ?? agents[0]?.id
}

export function resolveLearningAgentRecipients(args: {
  authorId: string
  channelType: number
  members: RoutingParticipant[]
  mentionedIds?: string[]
  mentionAll?: boolean
  replyAuthorId?: string
  leaderAgentId?: string
}): string[] {
  if (args.members.some((member) => member.id === args.authorId && member.kind === 'agent')) return []
  const agents = args.members.filter((member) => member.kind === 'agent' && member.id !== args.authorId)
  if (args.mentionAll) return agents.map((agent) => agent.id)
  const mentions = new Set(args.mentionedIds ?? [])
  const mentioned = agents.filter((agent) => mentions.has(agent.id)).map((agent) => agent.id)
  if (mentioned.length > 0) return mentioned
  if (args.replyAuthorId && agents.some((agent) => agent.id === args.replyAuthorId)) return [args.replyAuthorId]
  if (args.channelType === 1) return agents.map((agent) => agent.id).slice(0, 1)
  const defaultAgentId = defaultLearningAgentId(agents, args.leaderAgentId)
  return defaultAgentId ? [defaultAgentId] : []
}
