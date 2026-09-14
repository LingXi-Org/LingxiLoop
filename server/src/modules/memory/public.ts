import { NoEffectError, type MemoryOptions } from '@lyyzka/lingxios'
import { createPermissionService } from '../access/public.js'
import type { Queryable } from '../../db/queryable.js'

/** The native service additionally partitions IM scopes by principal, Agent and frozen audience. */
export const resolveMemoryScopes: MemoryOptions['resolveScopes'] = async (identity, database, signal) => {
  signal?.throwIfAborted()
  const db = database as Queryable
  const room = (await db.query<{ conversation_id: string }>(`SELECT r.conversation_id FROM agent_run_bindings r
    JOIN participants human ON human.company_id=r.company_id AND human.id=r.principal_id AND human.kind='human' AND human.departed_at IS NULL
    JOIN participants agent ON agent.company_id=r.company_id AND agent.id=r.agent_id AND agent.kind='agent' AND agent.departed_at IS NULL
    JOIN im_channel_bindings b ON b.company_id=r.company_id AND b.channel_id=r.conversation_id
    WHERE r.company_id=$1 AND r.session_id=$2 AND r.agent_id=$3 AND r.principal_id=$4
      AND b.profile->'members' ? human.id AND b.profile->'members' ? agent.id
      AND NOT EXISTS(SELECT 1 FROM learning_project_teacher_agents t WHERE t.company_id=agent.company_id AND t.agent_id=agent.id)
      AND ($5::text IS NULL OR r.run_id=$5) ORDER BY r.created_at DESC LIMIT 1`,
  [identity.tenantId,identity.sessionId,identity.agentId,identity.principalId,identity.workId ?? null])).rows[0]
  if (!room) throw new NoEffectError('memory source identity or membership was revoked', 'forbidden')
  await createPermissionService(db, { lockDependencies: true }).assertCan({ actorUserId: identity.principalId, companyId: identity.tenantId,
    action: 'agent_memory:read', resource: { type: 'conversation', id: room.conversation_id } })
  signal?.throwIfAborted()
  return [{ tenantId: identity.tenantId, scopeType: 'learner', scopeId: identity.principalId },
    { tenantId: identity.tenantId, scopeType: 'course', scopeId: room.conversation_id },
    { tenantId: identity.tenantId, scopeType: 'agent_role', scopeId: identity.agentId }]
}
