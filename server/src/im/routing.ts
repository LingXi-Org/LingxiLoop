export interface RoutingParticipant {
  id: string
  kind: 'human' | 'agent'
  presetKey?: string | null
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
  if (args.leaderAgentId && agents.some((agent) => agent.id === args.leaderAgentId)) return [args.leaderAgentId]
  const defaultLeader = agents.find((agent) => agent.presetKey === 'nova') ?? agents.find((agent) => agent.presetKey === 'forge')
  return defaultLeader ? [defaultLeader.id] : agents.slice(0, 1).map((agent) => agent.id)
}
