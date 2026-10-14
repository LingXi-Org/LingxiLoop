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

/** The native service additionally partitions IM scopes by principal, Agent and frozen audience. */
export const resolveMemoryScopes: MemoryOptions['resolveScopes'] = async (identity, database, signal) => {
  signal?.throwIfAborted()
  const db = database as Queryable
  const room = (await db.query<{ conversation_id: string }>(`SELECT r.conversation_id
    FROM agent_run_bindings r
    JOIN participants human ON human.company_id=r.company_id AND human.id=r.principal_id AND human.kind='human' AND human.departed_at IS NULL
    JOIN participants agent ON agent.company_id=r.company_id AND agent.id=r.agent_id AND agent.kind='agent' AND agent.departed_at IS NULL
    JOIN im_channel_bindings b ON b.company_id=r.company_id AND b.channel_id=r.conversation_id
    WHERE r.company_id=$1 AND r.session_id=$2 AND r.agent_id=$3 AND r.principal_id=$4
      AND b.profile->'members' ? human.id AND b.profile->'members' ? agent.id
      AND ($5::text IS NULL OR r.run_id=$5) ORDER BY r.created_at DESC LIMIT 1`,
  [identity.tenantId,identity.sessionId,identity.agentId,identity.principalId,identity.workId ?? null])).rows[0]
  if (!room) throw new NoEffectError('memory source identity or membership was revoked', 'forbidden')
  await createPermissionService(db, { lockDependencies: true }).assertCan({ actorUserId: identity.principalId, companyId: identity.tenantId,
    action: 'agent_memory:read', resource: { type: 'conversation', id: room.conversation_id } }).catch(error => {
      if (error instanceof ForbiddenError) throw new NoEffectError('memory source authorization was revoked', 'forbidden')
      throw error
    })
  signal?.throwIfAborted()
  return [{ tenantId: identity.tenantId, scopeType: 'learner', scopeId: identity.principalId },
    { tenantId: identity.tenantId, scopeType: 'course', scopeId: room.conversation_id },
    { tenantId: identity.tenantId, scopeType: 'agent_role', scopeId: identity.agentId }]
}
