import type { Queryable } from '../../db/queryable.js'
import {
  findAgentCliIdentity,
  listAgentCliConversations,
  listAgentCliParticipants,
  listAgentCliStatuses,
} from './directory-repository.js'

export class AgentDirectoryApplicationError extends Error {}

export class AgentDirectoryApplication {
  constructor(private readonly db: Queryable) {}

  async identity(id: string) {
    const participant = await findAgentCliIdentity(this.db, id)
    if (!participant) throw new AgentDirectoryApplicationError(`unknown participant: ${id}`)
    const conversations = await listAgentCliConversations(this.db, participant.companyId, participant.id)
    const { companyId: _companyId, ...identity } = participant
    return { identity, conversations }
  }

  async participants(actorId: string, kind: string | null) {
    const actor = await this.requireAgent(actorId)
    return listAgentCliParticipants(this.db, actor.companyId, kind)
  }

  async statuses(actorId: string) {
    const actor = await this.requireAgent(actorId)
    return listAgentCliStatuses(this.db, actor.companyId)
  }

  private async requireAgent(id: string) {
    const participant = await findAgentCliIdentity(this.db, id)
    if (!participant || participant.kind !== 'agent') {
      throw new AgentDirectoryApplicationError(`cannot resolve company for ${id}`)
    }
    return participant
  }
}
