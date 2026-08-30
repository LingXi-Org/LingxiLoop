import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import {
  type LearningCaseActionKind,
  type LearningCaseStatus,
  transitionLearningCase,
} from '../../domain/public.js'
import { createPermissionService, type ResolvedAccessContext } from '../access/public.js'
import {
  appendLearningCaseAction,
  findLearningCaseActionByIdempotencyKey,
  findLearningCaseDetail,
  insertOrFindOpenLearningCase,
  learningCaseActionLinksAreValid,
  listLearningCases,
  lockLearningCase,
  updateLearningCaseRecord,
  type LearningCaseActionRecord,
  type LearningCaseRecord,
} from './cases-repository.js'
import { LearningApplicationError } from './errors.js'

export interface LearningCasesInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, event: {
    kind: string
    userId: string
    companyId: string
    detail: Record<string, unknown>
  }): Promise<void>
}

interface LearningCaseScope {
  actorUserId: string
  companyId: string
  projectId: string
}

export interface ListLearningCasesInput extends LearningCaseScope {
  learnerId?: string
  status?: LearningCaseStatus
  knowledgeUnitId?: string
  limit?: number
}

export interface CreateLearningCaseInput extends LearningCaseScope {
  learnerId: string
  knowledgeUnitId: string
  reason: string
  summary?: string
}

export interface ApplyLearningCaseActionInput extends LearningCaseScope {
  caseId: string
  kind: LearningCaseActionKind
  reason?: string
  idempotencyKey: string
  expectedVersion: number
  activityId?: string
  missionId?: string
  attemptId?: string
  evaluationId?: string
}

const ACTION_PERMISSIONS = {
  DIAGNOSE: 'learning:manage',
  INTERVENE: 'learning:manage',
  ESCALATE: 'learning:manage',
  REASSESS: 'learning:review',
  OVERRIDE: 'learning:review',
  CLOSE: 'learning:review',
} as const

function boundedRequiredText(value: string, name: string, min: number, max: number): string {
  const normalized = value.trim()
  if (normalized.length < min || normalized.length > max) {
    throw new LearningApplicationError('invalid', `${name} must contain between ${min} and ${max} characters`)
  }
  return normalized
}

function resolvedProject(context: ResolvedAccessContext): { companyId: string; projectId: string } {
  if (!context.project) throw new LearningApplicationError('not_found', 'learning project not found')
  return { companyId: context.company.id, projectId: context.project.id }
}

function learnerReadFilter(context: ResolvedAccessContext): string | null {
  const role = context.projectMembership?.role
  return role === 'OWNER' || role === 'TEACHER' ? null : context.actorUserId
}

function isExactActionReplay(
  action: LearningCaseActionRecord,
  input: ApplyLearningCaseActionInput,
  normalized: { reason: string; idempotencyKey: string },
): boolean {
  const originalExpectedVersion = action.result === 'APPLIED'
    ? action.caseVersion - 1
    : action.caseVersion
  return action.caseId === input.caseId
    && action.kind === input.kind
    && action.actorId === input.actorUserId
    && action.reason === normalized.reason
    && action.idempotencyKey === normalized.idempotencyKey
    && action.activityId === (input.activityId ?? null)
    && action.missionId === (input.missionId ?? null)
    && action.attemptId === (input.attemptId ?? null)
    && action.evaluationId === (input.evaluationId ?? null)
    && originalExpectedVersion === input.expectedVersion
}

export class LearningCasesApplication {
  constructor(
    private readonly db: Queryable,
    private readonly infrastructure: LearningCasesInfrastructure,
  ) {}

  async listCases(input: ListLearningCasesInput): Promise<LearningCaseRecord[]> {
    const context = await createPermissionService(this.db).assertCan({
      actorUserId: input.actorUserId,
      action: 'learning:read',
      companyId: input.companyId,
      projectId: input.projectId,
      resource: { type: 'project', id: input.projectId },
    })
    const project = resolvedProject(context)
    const learnerFilterId = learnerReadFilter(context) ?? input.learnerId ?? null
    return listLearningCases(this.db, {
      ...project,
      learnerFilterId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.knowledgeUnitId ? { knowledgeUnitId: input.knowledgeUnitId } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
  }

  async getCase(
    input: LearningCaseScope & { caseId: string },
  ): Promise<{ learningCase: LearningCaseRecord; actions: LearningCaseActionRecord[] }> {
    const context = await createPermissionService(this.db).assertCan({
      actorUserId: input.actorUserId,
      action: 'learning:read',
      companyId: input.companyId,
      projectId: input.projectId,
      resource: { type: 'project', id: input.projectId },
    })
    const detail = await findLearningCaseDetail(this.db, {
      ...resolvedProject(context),
      caseId: input.caseId,
      learnerFilterId: learnerReadFilter(context),
    })
    if (!detail) throw new LearningApplicationError('not_found', 'learning case not found')
    return detail
  }

  async createCase(
    input: CreateLearningCaseInput,
  ): Promise<{ learningCase: LearningCaseRecord; created: boolean }> {
    const reason = boundedRequiredText(input.reason, 'reason', 1, 2_000)
    const summary = input.summary ?? ''
    if (summary.length > 10_000) {
      throw new LearningApplicationError('invalid', 'summary exceeds 10000 characters')
    }
    return this.infrastructure.transaction(async (db) => {
      const context = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: input.actorUserId,
        action: 'learning:manage',
        companyId: input.companyId,
        projectId: input.projectId,
        resource: { type: 'project', id: input.projectId },
      })
      const project = resolvedProject(context)
      const result = await insertOrFindOpenLearningCase(db, {
        id: randomUUID(),
        ...project,
        learnerId: input.learnerId,
        knowledgeUnitId: input.knowledgeUnitId,
        reason,
        summary,
      })
      if (!result) throw new LearningApplicationError('not_found', 'learning case target not found')
      if (result.created) {
        await this.infrastructure.auditInTransaction(db, {
          kind: 'learning_case_create',
          userId: input.actorUserId,
          companyId: project.companyId,
          detail: {
            projectId: project.projectId,
            caseId: result.learningCase.id,
            learnerId: result.learningCase.learnerId,
            knowledgeUnitId: result.learningCase.knowledgeUnitId,
          },
        })
      }
      return result
    })
  }

  async applyAction(
    input: ApplyLearningCaseActionInput,
  ): Promise<{ action: LearningCaseActionRecord; replayed: boolean }> {
    const reason = input.reason?.trim() ?? ''
    if (reason.length > 2_000) throw new LearningApplicationError('invalid', 'reason exceeds 2000 characters')
    const idempotencyKey = boundedRequiredText(input.idempotencyKey, 'idempotencyKey', 8, 200)
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new LearningApplicationError('invalid', 'expectedVersion must be a positive integer')
    }
    return this.infrastructure.transaction(async (db) => {
      const context = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: input.actorUserId,
        action: ACTION_PERMISSIONS[input.kind],
        companyId: input.companyId,
        projectId: input.projectId,
        resource: { type: 'project', id: input.projectId },
      })
      const project = resolvedProject(context)
      const learningCase = await lockLearningCase(db, {
        ...project,
        caseId: input.caseId,
        learnerFilterId: null,
      })
      if (!learningCase) throw new LearningApplicationError('not_found', 'learning case not found')

      const prior = await findLearningCaseActionByIdempotencyKey(db, {
        ...project,
        idempotencyKey,
      })
      if (prior) {
        if (!isExactActionReplay(prior, input, { reason, idempotencyKey })) {
          throw new LearningApplicationError('conflict', 'idempotency key already used')
        }
        return { action: prior, replayed: true }
      }

      if (!await learningCaseActionLinksAreValid(db, {
        ...project,
        learnerId: learningCase.learnerId,
        ...(input.activityId ? { activityId: input.activityId } : {}),
        ...(input.missionId ? { missionId: input.missionId } : {}),
        ...(input.attemptId ? { attemptId: input.attemptId } : {}),
        ...(input.evaluationId ? { evaluationId: input.evaluationId } : {}),
      })) {
        throw new LearningApplicationError('invalid', 'invalid learning case action links')
      }
      if (learningCase.version !== input.expectedVersion) {
        throw new LearningApplicationError('conflict', 'learning case changed concurrently')
      }
      const transition = transitionLearningCase(learningCase.status, input.kind)
      if (transition.outcome === 'INVALID') {
        throw new LearningApplicationError('conflict', 'learning case action conflicts with current state')
      }

      let caseVersion = learningCase.version
      if (transition.outcome === 'APPLIED') {
        const updated = await updateLearningCaseRecord(db, {
          ...project,
          caseId: learningCase.id,
          expectedVersion: learningCase.version,
          fromStatus: transition.from,
          toStatus: transition.to,
        })
        if (!updated) throw new LearningApplicationError('conflict', 'learning case changed concurrently')
        caseVersion = updated.version
      }

      let action: LearningCaseActionRecord | null
      try {
        action = await appendLearningCaseAction(db, {
          id: randomUUID(),
          ...project,
          caseId: learningCase.id,
          kind: input.kind,
          result: transition.outcome,
          fromStatus: transition.from,
          toStatus: transition.to,
          caseVersion,
          idempotencyKey,
          actorId: input.actorUserId,
          reason,
          ...(input.activityId ? { activityId: input.activityId } : {}),
          ...(input.missionId ? { missionId: input.missionId } : {}),
          ...(input.attemptId ? { attemptId: input.attemptId } : {}),
          ...(input.evaluationId ? { evaluationId: input.evaluationId } : {}),
        })
      } catch (error) {
        if ((error as { code?: unknown })?.code === '23505') {
          throw new LearningApplicationError('conflict', 'idempotency key already used')
        }
        throw error
      }
      if (!action) throw new LearningApplicationError('conflict', 'learning case changed concurrently')
      await this.infrastructure.auditInTransaction(db, {
        kind: 'learning_case_action',
        userId: input.actorUserId,
        companyId: project.companyId,
        detail: {
          projectId: project.projectId,
          caseId: learningCase.id,
          actionId: action.id,
          kind: action.kind,
          result: action.result,
          fromStatus: action.fromStatus,
          toStatus: action.toStatus,
          caseVersion: action.caseVersion,
        },
      })
      return { action, replayed: false }
    })
  }
}
