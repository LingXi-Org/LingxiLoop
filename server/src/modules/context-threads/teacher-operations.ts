import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { isActiveProjectMember } from '../access/public.js'
import { commitDomainEvent } from '../events/public.js'
import {
  findContextThread,
  findScopedParticipant,
  findTeacherOperationsChannel,
  insertExistingChannelContextThread,
  lockContextIdentity,
} from './repository.js'

export async function bindTeacherOperationsContextThread(
  db: Queryable,
  args: {
    companyId: string
    projectId: string
    teacherId: string
    agentId: string
    channelId: string
  },
): Promise<{ id: string; channelId: string; created: boolean }> {
  const id = `ctx-${createHash('sha256')
    .update([args.companyId, args.projectId, 'TEACHER_OPERATIONS'].join('\0'))
    .digest('hex').slice(0, 24)}`
  const participantIds = [args.teacherId, args.agentId].sort()
  const { result } = await commitDomainEvent((work) => work(db), async (transaction) => {
    await lockContextIdentity(transaction, `${args.companyId}:${args.projectId}:TEACHER_OPERATIONS:${args.projectId}`)
    const existing = await findContextThread(transaction, {
      companyId: args.companyId,
      projectId: args.projectId,
      contextType: 'TEACHER_OPERATIONS',
      contextId: args.projectId,
    })
    if (existing) {
      const existingParticipants = [...existing.participant_ids].sort()
      if (existing.id !== id
        || existing.channel_id !== args.channelId
        || existing.created_by !== args.teacherId
        || JSON.stringify(existingParticipants) !== JSON.stringify(participantIds)) {
        throw new Error('existing Teacher operations ContextThread does not match its authority')
      }
      return { id: existing.id, channelId: existing.channel_id, created: false }
    }

    const [teacher, agent, channel, activeTeacher] = await Promise.all([
      findScopedParticipant(transaction, { companyId: args.companyId, participantId: args.teacherId }),
      findScopedParticipant(transaction, { companyId: args.companyId, participantId: args.agentId }),
      findTeacherOperationsChannel(transaction, args),
      isActiveProjectMember(transaction, {
        companyId: args.companyId, projectId: args.projectId, userId: args.teacherId,
      }),
    ])
    if (!teacher || teacher.kind !== 'human' || teacher.departed_at || !activeTeacher) {
      throw new Error('active Teaching Project owner not found')
    }
    if (!agent || agent.kind !== 'agent' || agent.departed_at) {
      throw new Error('managed Teacher Agent not found')
    }
    if (!channel || JSON.stringify([...channel.members].sort()) !== JSON.stringify(participantIds)) {
      throw new Error('Teacher operations channel participants do not match its Context')
    }
    await insertExistingChannelContextThread(transaction, {
      id,
      companyId: args.companyId,
      projectId: args.projectId,
      contextType: 'TEACHER_OPERATIONS',
      contextId: args.projectId,
      channelId: args.channelId,
      createdBy: args.teacherId,
      participantIds,
    })
    return { id, channelId: args.channelId, created: true }
  }, (value) => value.created ? {
    companyId: args.companyId,
    projectId: args.projectId,
    aggregateType: 'ContextThread',
    aggregateId: value.id,
    idempotencyKey: `context-thread:${value.id}:created`,
    actor: { type: 'USER', id: args.teacherId },
    event: {
      eventType: 'ContextThreadCreated',
      schemaVersion: 1,
      payload: { contextType: 'TEACHER_OPERATIONS', subjectParticipantId: args.agentId },
    },
  } : null)
  return result
}
