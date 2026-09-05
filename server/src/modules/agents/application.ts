import type { PoolClient } from 'pg'
import type { Queryable } from '../../db/queryable.js'
import type { AgentScope, CreateAgentInput, ParticipantScope, UpdateAgentInput } from './contracts.js'
import {
  agentIdExists,
  allAutonomy,
  autonomy,
  findAgent,
  insertAgent,
  ledGroups,
  listParticipants,
  preferences,
  releaseExpiredAgentStatus,
  saveAutonomy,
  savePreferences,
  setAgentDeparted,
  updateAgent,
} from './repository.js'

export class AgentApplicationError extends Error {
  constructor(readonly code: 'invalid' | 'not_found' | 'conflict', message: string, readonly detail?: unknown) { super(message) }
}

export interface AgentInfrastructure {
  transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T>
  computeAddress(agentId: string, companySlug: string): string | null
  invalidatePersona(agentId?: string): void
  assertNotManaged(agentId: string, companyId: string): Promise<void>
  assertVisible(agentId: string, companyId: string, userId: string): Promise<void>
  openLearningThreadForAgent(scope: AgentScope, agentId: string): Promise<{ id: string; created: boolean }>
}

export class AgentApplication {
  constructor(private readonly db: Queryable, private readonly infra: AgentInfrastructure, private readonly busyLeaseMs: number) {}

  async participants(scope: ParticipantScope) {
    await releaseExpiredAgentStatus(this.db, scope.companyId, this.busyLeaseMs)
    const rows = await listParticipants(this.db, scope)
    return rows.map((row) => {
      const { companySlug, ...participant } = row
      if (row.managed) return { ...participant, email: null }
      if (row.kind !== 'agent' || row.email || !companySlug) return participant
      return { ...participant, email: this.infra.computeAddress(row.id, companySlug) }
    })
  }

  async create(scope: AgentScope, input: CreateAgentInput) {
    const id = await this.uniqueId(input.name)
    try {
      await this.infra.transaction((db) => insertAgent(db, { id, scope, input }))
      await this.infra.openLearningThreadForAgent(scope, id)
    } catch (error) {
      if (error instanceof Error && /duplicate key|participants_agent_id_unique/.test(error.message)) {
        throw new AgentApplicationError('conflict', 'agent id collision — please retry')
      }
      throw error
    }
    this.infra.invalidatePersona()
    return { id }
  }

  async update(scope: AgentScope, id: string, patch: UpdateAgentInput) {
    await this.infra.assertNotManaged(id, scope.companyId)
    const existing = await this.agent(scope.companyId, id)
    if (existing.kind !== 'agent') throw new AgentApplicationError('invalid', 'cannot edit non-agent participant')
    if (!await updateAgent(this.db, scope.companyId, id, patch)) throw new AgentApplicationError('not_found', 'not found')
    this.infra.invalidatePersona(id)
    return { ok: true as const }
  }

  async offboard(scope: AgentScope, id: string) {
    await this.infra.assertNotManaged(id, scope.companyId)
    const existing = await this.agent(scope.companyId, id)
    if (existing.kind !== 'agent') throw new AgentApplicationError('invalid', 'cannot off-board non-agent participant')
    if (existing.departed_at) throw new AgentApplicationError('conflict', 'already off-boarded')
    const groups = await ledGroups(this.db, scope.companyId, id)
    if (groups.length) throw new AgentApplicationError('conflict', `change the leader before off-boarding ${id}`, groups)
    await setAgentDeparted(this.db, scope.companyId, id, true)
    this.infra.invalidatePersona(id)
    return { ok: true as const, departedAt: new Date().toISOString() }
  }

  async rehire(scope: AgentScope, id: string) {
    await this.infra.assertNotManaged(id, scope.companyId)
    const existing = await this.agent(scope.companyId, id)
    if (existing.kind !== 'agent') throw new AgentApplicationError('invalid', 'cannot rehire non-agent participant')
    if (!existing.departed_at) throw new AgentApplicationError('conflict', 'agent is not off-boarded')
    await setAgentDeparted(this.db, scope.companyId, id, false)
    this.infra.invalidatePersona(id)
    return { ok: true as const }
  }

  preferences(userId: string) { return preferences(this.db, userId) }
  async savePreferences(userId: string, value: Record<string, unknown>) {
    await savePreferences(this.db, userId, value)
    return { ok: true as const }
  }

  async autonomy(scope: AgentScope, id: string) {
    await this.infra.assertVisible(id, scope.companyId, scope.userId)
    await this.agent(scope.companyId, id)
    return autonomy(this.db, scope.userId, id)
  }

  async saveAutonomy(scope: AgentScope, id: string, threshold: number) {
    await this.infra.assertNotManaged(id, scope.companyId)
    await this.agent(scope.companyId, id)
    await saveAutonomy(this.db, scope.userId, id, threshold)
    return { ok: true as const, threshold }
  }

  allAutonomy(scope: AgentScope) { return allAutonomy(this.db, scope.userId, scope.companyId) }

  private async agent(companyId: string, id: string) {
    const agent = await findAgent(this.db, companyId, id)
    if (!agent) throw new AgentApplicationError('not_found', 'not found')
    return agent
  }

  private async uniqueId(name: string): Promise<string> {
    const base = slugifyAgentName(name)
    const candidates = [base, ...Array.from({ length: 8 }, () => `${base}-${Math.random().toString(36).slice(2, 6)}`)]
    for (const candidate of candidates) if (!await agentIdExists(this.db, candidate)) return candidate
    throw new AgentApplicationError('conflict', 'could not pick a unique agent id — please retry')
  }
}

export function slugifyAgentName(name: string): string {
  const lowered = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  let slug = lowered.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 24)
  if (!/^[a-z]/.test(slug)) slug = `a-${slug}`.slice(0, 24)
  return slug || 'agent'
}
