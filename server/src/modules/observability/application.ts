import { PUBLIC_ACTIVITY_KINDS, publicActivityTitle } from '../../agents/activity-visibility.js'
import type { Queryable } from '../../db/queryable.js'
import {
  deleteMemory,
  listMemories,
  listPublicActivity,
  listRunEvents,
  listRuns,
  runExists,
  updateMemory,
} from './repository.js'

export class ObservabilityNotFoundError extends Error {}

export class ObservabilityApplication {
  constructor(private readonly db: Queryable) {}

  async activity(companyId: string, conversationId: string) {
    const rows = await listPublicActivity(this.db, companyId, conversationId, PUBLIC_ACTIVITY_KINDS)
    return rows.reverse().map((row) => ({
      ...row,
      title: publicActivityTitle(row.kind, row.level) ?? 'Agent activity updated',
    }))
  }

  memories(companyId: string) {
    return listMemories(this.db, companyId)
  }

  async updateMemory(companyId: string, input: { agentId: string; path: string; body: string }) {
    const updated = await updateMemory(this.db, companyId, input)
    if (!updated) throw new ObservabilityNotFoundError('memory not found')
    return updated
  }

  async deleteMemory(companyId: string, input: { agentId: string; path: string }) {
    if (!await deleteMemory(this.db, companyId, input)) throw new ObservabilityNotFoundError('memory not found')
    return { ok: true as const }
  }

  runs(companyId: string, input: { agentId?: string; status?: string; limit: number }) {
    return listRuns(this.db, companyId, input)
  }

  async runEvents(companyId: string, runId: string) {
    if (!await runExists(this.db, companyId, runId)) throw new ObservabilityNotFoundError('not found')
    return listRunEvents(this.db, companyId, runId)
  }
}
