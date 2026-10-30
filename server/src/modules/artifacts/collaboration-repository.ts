import type { Queryable } from '../../db/queryable.js'
import type { ArtifactKind } from './kinds.js'

/** Agents in the conversation room that hold this kind's capability; teacher Agents never join artifact work. */
export async function availableAgents(db: Queryable, companyId: string, conversationId: string, kind: ArtifactKind) {
  const { rows } = await db.query<{ id: string; name: string; role: string | null; status: string | null }>(
    `SELECT agent.id,agent.name,agent.role,agent.status FROM participants agent
      JOIN im_channel_bindings channel ON channel.company_id=agent.company_id AND channel.channel_id=$2
      WHERE agent.company_id=$1 AND agent.kind='agent' AND agent.departed_at IS NULL AND agent.capabilities ? $3
        AND channel.profile->'members' ? agent.id
        AND NOT EXISTS(SELECT 1 FROM learning_project_teacher_agents teacher WHERE teacher.company_id=agent.company_id AND teacher.agent_id=agent.id)
      ORDER BY agent.name`,
    [companyId, conversationId, kind],
  )
  return rows
}

export async function availableArtifactMemberIds(db: Queryable, companyId: string, ids: string[], kind: ArtifactKind) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM participants WHERE company_id=$1 AND id=ANY($2::text[]) AND kind='agent'
       AND departed_at IS NULL AND capabilities ? $3`,
    [companyId, ids, kind],
  )
  return rows.map((row) => row.id)
}
