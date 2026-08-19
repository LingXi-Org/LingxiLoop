export interface RoutingAgent {
  id: string
  muted: boolean
}

export interface GroupRouteInput {
  conversationKind: string
  authorId: string
  authorKind: 'human' | 'agent' | 'unknown'
  leaderId: string | null
  agents: RoutingAgent[]
  mentionedIds: string[]
  mentionAll: boolean
  quotedAuthorId?: string | null
}

/** Pure routing policy shared by the scheduler and its matrix tests. */
export function resolveAgentRecipients(input: GroupRouteInput): string[] {
  const agents = input.agents.filter((agent) => agent.id !== input.authorId)
  if (input.conversationKind !== 'group') return agents.map((agent) => agent.id)

  if (input.mentionAll) return agents.filter((agent) => !agent.muted).map((agent) => agent.id)

  const exact = new Set(input.mentionedIds)
  const mentionedAgents = agents.filter((agent) => exact.has(agent.id))
  if (mentionedAgents.length > 0) return mentionedAgents.map((agent) => agent.id)

  const quoted = agents.find((agent) => agent.id === input.quotedAuthorId)
  if (quoted) return [quoted.id]

  // An agent addressing only humans must not accidentally start another
  // agent turn. A leader's ordinary reply also terminates the chain.
  if (input.authorKind === 'agent' && input.mentionedIds.length > 0) return []
  if (input.authorId === input.leaderId) return []

  const leader = agents.find((agent) => agent.id === input.leaderId)
  return leader && !leader.muted ? [leader.id] : []
}
