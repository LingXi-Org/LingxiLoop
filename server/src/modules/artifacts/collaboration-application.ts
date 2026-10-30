import type { Queryable } from '../../db/queryable.js'
import type { ArtifactKind } from './kinds.js'
import { availableAgents } from './repository.js'

export function createArtifactCollaborationApplication(context: { db: Queryable }) {
  const { db } = context
  async function listArtifactAvailableAgents(companyId: string, conversationId: string, kind: ArtifactKind): Promise<Array<{ id: string; name: string; role: string; status: string }>> {
    const rows = await availableAgents(db, companyId, conversationId, kind)
    return rows.map((row) => ({ id: row.id, name: row.name, role: row.role ?? 'Learning Agent', status: row.status ?? 'available' }))
  }
  return { listArtifactAvailableAgents }
}
