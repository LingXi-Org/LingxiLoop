import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { ImChannelProfile } from '../../im/types.js'
import { commitDomainEvent, type DomainEventTransaction } from '../events/public.js'
import type {
  ContextThreadResult,
  ContextThreadScope,
  ContextType,
  CreateTeacherThreadInput,
} from './contracts.js'
import {
  findContextThread,
  findScopedParticipant,
  insertContextThreadBundle,
  learningCaseBelongsToStudent,
  lockContextIdentity,
} from './repository.js'

export type ContextThreadErrorCode =
  | 'not_found'
  | 'invalid_student'
  | 'invalid_agent'
  | 'idempotency_conflict'

export class ContextThreadApplicationError extends Error {
  constructor(readonly code: ContextThreadErrorCode, message: string) {
    super(message)
  }
}

export interface ContextThreadInfrastructure {
  transaction: DomainEventTransaction
  assertCanManageLearning(scope: ContextThreadScope): Promise<void>
  assertCanWriteConversation(scope: ContextThreadScope): Promise<void>
  isActiveProjectStudent(db: Queryable, scope: ContextThreadScope, studentId: string): Promise<boolean>
  syncChannel(profile: ImChannelProfile): Promise<void>
}

interface CreateResult {
  result: ContextThreadResult
  profile: ImChannelProfile | null
}

function deterministicId(prefix: string, ...parts: string[]): string {
  return `${prefix}-${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24)}`
}

function sameParticipants(actual: string[], expected: string[]): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
}

export class ContextThreadsApplication {
  constructor(private readonly infrastructure: ContextThreadInfrastructure) {}

  async createTeacherThread(
    scope: ContextThreadScope,
    input: CreateTeacherThreadInput,
  ): Promise<ContextThreadResult> {
    await this.infrastructure.assertCanManageLearning(scope)
    const contextId = input.contextType === 'INTERVENTION' ? input.caseId! : input.studentId
    return this.create(scope, {
      contextType: input.contextType,
      contextId,
      otherId: input.studentId,
      validate: async (db) => {
        const student = await findScopedParticipant(db, {
          companyId: scope.companyId, participantId: input.studentId,
        })
        if (!student || student.kind !== 'human' || student.departed_at
          || !await this.infrastructure.isActiveProjectStudent(db, scope, input.studentId)) {
          throw new ContextThreadApplicationError('invalid_student', 'student must be active in the same Project')
        }
        if (input.contextType === 'INTERVENTION' && !await learningCaseBelongsToStudent(db, {
          ...scope, caseId: contextId, studentId: input.studentId,
        })) {
          throw new ContextThreadApplicationError('not_found', 'LearningCase not found for student')
        }
        return student.name
      },
    })
  }

  async createLearningThread(
    scope: ContextThreadScope,
    agentId: string,
  ): Promise<ContextThreadResult> {
    await this.infrastructure.assertCanWriteConversation(scope)
    return this.create(scope, {
      contextType: 'LEARNING',
      contextId: `${scope.userId}:${agentId}`,
      otherId: agentId,
      validate: async (db) => {
        const agent = await findScopedParticipant(db, { companyId: scope.companyId, participantId: agentId })
        if (!agent || agent.kind !== 'agent' || agent.departed_at) {
          throw new ContextThreadApplicationError('invalid_agent', 'active Agent not found')
        }
        return agent.name
      },
    })
  }

  private async create(
    scope: ContextThreadScope,
    input: {
      contextType: ContextType
      contextId: string
      otherId: string
      validate(db: Queryable): Promise<string>
    },
  ): Promise<ContextThreadResult> {
    const participantIds = [scope.userId, input.otherId]
    const id = deterministicId('ctx', scope.companyId, scope.projectId, input.contextType, input.contextId)
    const channelId = deterministicId('ch', id)
    let profile: ImChannelProfile | null = null
    const committed = await commitDomainEvent(this.infrastructure.transaction, async (db) => {
      await lockContextIdentity(db, `${scope.companyId}:${scope.projectId}:${input.contextType}:${input.contextId}`)
      const existing = await findContextThread(db, { ...scope, ...input })
      if (existing) {
        if (existing.id !== id || existing.created_by !== scope.userId
          || !sameParticipants(existing.participant_ids, participantIds)) {
          throw new ContextThreadApplicationError(
            'idempotency_conflict',
            'Context identity is already bound to different participants',
          )
        }
        return {
          result: {
            id: existing.id,
            channelId: existing.channel_id,
            contextType: existing.context_type,
            contextId: existing.context_id,
            participantIds,
            created: false,
          },
          profile: null,
        }
      }
      const actor = await findScopedParticipant(db, {
        companyId: scope.companyId, participantId: scope.userId,
      })
      if (!actor || actor.kind !== 'human' || actor.departed_at) {
        throw new ContextThreadApplicationError('not_found', 'active Project participant not found')
      }
      const title = await input.validate(db)
      const now = new Date().toISOString()
      profile = {
        channelId, channelType: 2, kind: 'direct', title,
        members: participantIds, pinned: false, createdAt: now, updatedAt: now,
      }
      await insertContextThreadBundle(db, {
        id, ...scope, ...input, createdBy: scope.userId, participantIds, profile,
      })
      return {
        result: { id, channelId, contextType: input.contextType, contextId: input.contextId, participantIds, created: true },
        profile,
      }
    }, (value: CreateResult) => value.result.created ? {
      companyId: scope.companyId,
      projectId: scope.projectId,
      aggregateType: 'ContextThread',
      aggregateId: value.result.id,
      idempotencyKey: `context-thread:${value.result.id}:created`,
      actor: { type: 'USER', id: scope.userId },
      event: {
        eventType: 'ContextThreadCreated',
        schemaVersion: 1,
        payload: {
          contextType: value.result.contextType,
          subjectParticipantId: input.otherId,
        },
      },
    } : null)
    profile = committed.result.profile
    if (profile) {
      await this.infrastructure.syncChannel(profile).catch((error: unknown) => {
        console.warn('[context-threads] committed channel awaits reconciliation:',
          error instanceof Error ? error.message : String(error))
      })
    }
    return committed.result.result
  }
}
