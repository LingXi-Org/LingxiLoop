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

export async function availableArtifactMemberIds(db: Queryable, companyId: string, ids: string[], kind: ArtifactKind, conversationId: string) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT agent.id FROM participants agent JOIN conversations room ON room.company_id=agent.company_id AND room.id=$4
      JOIN im_channel_bindings binding ON binding.company_id=room.company_id AND binding.channel_id=room.id
      WHERE agent.company_id=$1 AND agent.id=ANY($2::text[]) AND agent.kind='agent'
       AND agent.departed_at IS NULL AND agent.capabilities ? $3 AND room.members ? agent.id AND binding.profile->'members' ? agent.id
       AND NOT EXISTS(SELECT 1 FROM learning_project_teacher_agents teacher WHERE teacher.company_id=agent.company_id AND teacher.agent_id=agent.id)`,
    [companyId, ids, kind, conversationId],
  )
  return rows.map((row) => row.id)
}
