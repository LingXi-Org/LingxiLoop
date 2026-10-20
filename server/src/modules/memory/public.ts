import { NoEffectError, type MemoryOptions, type MemoryIdentity, type MemoryDocument, type createLingxiOS } from '@lyyzka/lingxios'
import { createPermissionService, ForbiddenError } from '../access/public.js'
import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import { memoryActivity } from '../../../../src/lib/memoryActivity.js'

type MemoryApi = NonNullable<Awaited<ReturnType<typeof createLingxiOS>>['memory']>

async function readDocuments(memory: MemoryApi, identity: MemoryIdentity, ids: string[]) {
  const documents: MemoryDocument[] = []
  for (const scope of await memory.scopes(identity)) for (const id of new Set(ids)) {
    const document = await memory.read(identity, scope, id)
    if (document) documents.push(document)
  }
  return documents
}

export async function readMemoryChips(memory: MemoryApi, identity: MemoryIdentity, ids: string[]) {
  return memoryActivity('memory.list', { items: await readDocuments(memory, identity, ids) })!
}

export async function forgetMemoryChip(memory: MemoryApi, identity: MemoryIdentity, id: string, expectedVersion: number) {
  const document = (await readDocuments(memory, identity, [id]))[0]
  if (!document) return
  if (document.version !== expectedVersion) throw new HttpError(409, '这条记忆已更新，请刷新后再操作。')
  try {
    await memory.apply(identity, { scope: { tenantId: document.tenantId, scopeType: document.scopeType, scopeId: document.scopeId },
      changes: [{ action: 'delete', id, expectedVersion }], idempotencyKey: `forget:${identity.principalId}:${id}:${expectedVersion}`,
      sourceRef: `run:${identity.workId}:forget:${id}` })
  } catch (error) {
    if (error instanceof Error && error.message === 'memory is unavailable or stale') throw new HttpError(409, '这条记忆已更新，请刷新后再操作。')
    throw error
  }
}

/** Stable personal grants require a private current audience; session/role grants keep native IM partitioning. */
export const resolveMemoryScopes: MemoryOptions['resolveScopes'] = async (identity, database, signal, operation) => {
  signal?.throwIfAborted()
  const db = database as Queryable
  const room = (await db.query<{ conversation_id: string; project_id:string|null; course_id:string|null; members:string[] }>(`SELECT r.conversation_id,c.project_id,course.id AS course_id,b.profile->'members' AS members
    FROM agent_run_bindings r
    JOIN participants human ON human.company_id=r.company_id AND human.id=r.principal_id AND human.kind='human' AND human.departed_at IS NULL
    JOIN participants agent ON agent.company_id=r.company_id AND agent.id=r.agent_id AND agent.kind='agent' AND agent.departed_at IS NULL
    JOIN im_channel_bindings b ON b.company_id=r.company_id AND b.channel_id=r.conversation_id
    JOIN conversations c ON c.company_id=r.company_id AND c.id=r.conversation_id
    LEFT JOIN courses course ON course.company_id=c.company_id AND course.project_id=c.project_id
    WHERE r.company_id=$1 AND r.session_id=$2 AND r.agent_id=$3 AND r.principal_id=$4
      AND b.profile->'members' ? human.id AND b.profile->'members' ? agent.id
      AND c.members ? human.id AND c.members ? agent.id AND NOT r.internal
      AND ($5::text IS NULL OR r.run_id=$5) ORDER BY r.created_at DESC LIMIT 1`,
  [identity.tenantId,identity.sessionId,identity.agentId,identity.principalId,identity.workId ?? null])).rows[0]
  if (!room) throw new NoEffectError('memory source identity or membership was revoked', 'forbidden')
  const permissions=createPermissionService(db, { lockDependencies: true })
  await permissions.assertCan({ actorUserId: identity.principalId, companyId: identity.tenantId,
    action: 'agent_memory:read', resource: { type: 'conversation', id: room.conversation_id } }).catch(error => {
      if (error instanceof ForbiddenError) throw new NoEffectError('memory source authorization was revoked', 'forbidden')
      throw error
    })
  // Read calls still reauthorize both sides of retrieval, but need not resolve
  // permissions for writes they cannot perform. Mutations resolve them anew.
  const writable=operation==='read' ? false : (await permissions.can({actorUserId:identity.principalId,companyId:identity.tenantId,
    action:'agent_memory:write',resource:{type:'conversation',id:room.conversation_id}})).allowed
  const grants: Awaited<ReturnType<MemoryOptions['resolveScopes']>>=[]
  const privateAudience=Array.isArray(room.members) && room.members.length===2
    && room.members.includes(identity.principalId) && room.members.includes(identity.agentId)
  if(privateAudience) grants.push({tenantId:identity.tenantId,scopeType:'learner',scopeId:identity.principalId,
    continuity:'principal',readOnly:!writable,legacyScope:{tenantId:identity.tenantId,scopeType:'learner',scopeId:identity.principalId}})
  if(room.project_id) {
    const resource={type:'project' as const,id:room.project_id}
    await permissions.assertCan({actorUserId:identity.principalId,companyId:identity.tenantId,projectId:room.project_id,
      action:'project:read',resource})
    const courseKey=room.course_id ? `course:${room.course_id}` : `project:${room.project_id}`
    if(privateAudience) grants.push({tenantId:identity.tenantId,scopeType:'learner_course',scopeId:courseKey,
      continuity:'principal_course',readOnly:!writable,legacyScope:{tenantId:identity.tenantId,scopeType:'course',scopeId:room.conversation_id}})
    // Every current human recipient must be a current project reader. Private
    // learner facts never enter this scope through automatic evidence capture.
    const humans=(await db.query<{id:string}>(`SELECT id FROM participants WHERE company_id=$1 AND kind='human'
      AND departed_at IS NULL AND id=ANY($2::text[])`,[identity.tenantId,room.members])).rows
    for(const human of humans.filter(human=>human.id!==identity.principalId)) await permissions.assertCan({actorUserId:human.id,companyId:identity.tenantId,
      projectId:room.project_id,action:'project:read',resource})
    const manage=operation==='read' || operation==='capture' ? false : (await permissions.can({actorUserId:identity.principalId,companyId:identity.tenantId,
      projectId:room.project_id,action:'learning:manage',resource})).allowed
    grants.push({tenantId:identity.tenantId,scopeType:'course_shared',scopeId:courseKey,continuity:'course_shared',readOnly:!manage,explicitOnly:true})
  }
  grants.push({tenantId:identity.tenantId,scopeType:'session',scopeId:room.conversation_id,readOnly:!writable},
    {tenantId:identity.tenantId,scopeType:'agent_role',scopeId:identity.agentId,readOnly:!writable})
  signal?.throwIfAborted()
  return grants
}
