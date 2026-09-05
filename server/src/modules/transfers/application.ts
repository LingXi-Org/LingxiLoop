import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import {
  projectTransferConditionsReady,
  transitionProjectTransfer,
  type ProjectTransferStatus,
} from '../../domain/public.js'
import { createPermissionService } from '../access/public.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import { applySystemProjectLifecycleInTransaction } from '../projects/public.js'
import type {
  ConfirmProjectTransferInput,
  RequestProjectTransferInput,
  ResolveProjectTransferInput,
} from './contracts.js'
import {
  completeProjectTransferOwnership,
  confirmProjectTransfer,
  createProjectTransfer,
  lockProjectTransfer,
  markProjectTransferCompleted,
  markProjectTransferReady,
  projectTransferReadiness,
  resolveProjectTransfer,
  type ProjectTransferRecord,
} from './repository.js'

export type ProjectTransferErrorCode = 'not_found' | 'invalid_transition' | 'conditions_not_ready' | 'concurrent_change'

export class ProjectTransferError extends Error {
  constructor(readonly code: ProjectTransferErrorCode, message: string) {
    super(message)
  }
}

export interface ProjectTransferInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, input: {
    kind: string
    userId?: string
    companyId: string
    detail: Record<string, unknown>
  }): Promise<void>
}

function identity(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

function eventKey(transfer: ProjectTransferRecord, operation: string, idempotencyKey: string): string {
  const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)
  return `project-transfer:${transfer.id}:${operation}:${digest}`
}

function response(transfer: ProjectTransferRecord, status = transfer.status) {
  return {
    transferId: transfer.id,
    projectId: transfer.projectId,
    sourceCompanyId: transfer.sourceCompanyId,
    targetCompanyId: transfer.targetCompanyId,
    status,
  }
}

export class ProjectTransferApplication {
  constructor(private readonly infrastructure: ProjectTransferInfrastructure) {}

  request(actorUserId: string, sourceCompanyId: string, projectId: string, input: RequestProjectTransferInput) {
    return this.infrastructure.transaction(async (db) => {
      const transferId = identity('transfer', `${actorUserId}:${projectId}:${input.idempotencyKey}`)
      const context = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId,
        action: 'project:request_transfer',
        companyId: sourceCompanyId,
        projectId,
      })
      if (!context.project) throw new ProjectTransferError('concurrent_change', 'Project context disappeared')
      const created = await createProjectTransfer(db, {
        id: transferId,
        projectId,
        sourceCompanyId,
        targetCompanyId: input.targetCompanyId,
        requestedBy: actorUserId,
      })
      if (!created.created && (created.transfer.status === 'REJECTED'
        || created.transfer.status === 'CANCELLED'
        || created.transfer.status === 'COMPLETED')) return response(created.transfer)
      await applySystemProjectLifecycleInTransaction(db, {
        actorUserId,
        companyId: sourceCompanyId,
        projectId,
        kind: context.project.kind,
        status: context.project.status,
        command: 'REQUEST_TRANSFER',
      })
      const transfer = created.transfer
      await appendDomainEventInTransaction(db, {
        companyId: sourceCompanyId,
        projectId,
        aggregateType: 'PROJECT_TRANSFER',
        aggregateId: transfer.id,
        idempotencyKey: eventKey(transfer, 'request', input.idempotencyKey),
        actor: { type: 'USER', id: actorUserId },
        event: {
          eventType: 'PROJECT_TRANSFER.REQUESTED',
          schemaVersion: 1,
          payload: { targetCompanyId: transfer.targetCompanyId },
        },
      })
      if (created.created) await this.infrastructure.auditInTransaction(db, {
        kind: 'project_transfer_requested',
        userId: actorUserId,
        companyId: sourceCompanyId,
        detail: { transferId: transfer.id, projectId, targetCompanyId: transfer.targetCompanyId },
      })
      return response(transfer)
    })
  }

  confirmTeacher(actorUserId: string, projectId: string, input: ConfirmProjectTransferInput) {
    return this.confirm(actorUserId, projectId, input, 'teacher')
  }

  confirmEducation(actorUserId: string, projectId: string, input: ConfirmProjectTransferInput) {
    return this.confirm(actorUserId, projectId, input, 'education')
  }

  private confirm(
    actorUserId: string,
    projectId: string,
    input: ConfirmProjectTransferInput,
    confirmation: 'teacher' | 'education',
  ) {
    return this.infrastructure.transaction(async (db) => {
      let transfer = await this.requireTransfer(db, projectId)
      await this.assertConfirmationPermission(db, actorUserId, transfer, confirmation)
      if (transfer.status !== 'PENDING' && transfer.status !== 'READY') {
        throw new ProjectTransferError('invalid_transition', `cannot confirm ${transfer.status} Project Transfer`)
      }
      const priorActor = confirmation === 'teacher'
        ? transfer.teacherConfirmedBy
        : transfer.educationConfirmedBy
      if (priorActor && priorActor !== actorUserId) {
        throw new ProjectTransferError('invalid_transition', `${confirmation} confirmation is immutable`)
      }
      const applied = transfer.status === 'PENDING' && !priorActor
        ? await confirmProjectTransfer(db, { transferId: transfer.id, actorUserId, confirmation })
        : false
      transfer = await this.requireTransfer(db, projectId)
      let status: ProjectTransferStatus = transfer.status
      let readyApplied = false
      if (status === 'PENDING') {
        const readiness = await projectTransferReadiness(db, transfer)
        const { policySnapshot, ...conditions } = readiness
        if (projectTransferConditionsReady(conditions) && policySnapshot) {
          readyApplied = await markProjectTransferReady(db, transfer, policySnapshot)
          if (!readyApplied) throw new ProjectTransferError('concurrent_change', 'Project Transfer changed concurrently')
          status = 'READY'
        }
      }
      if (applied) {
        const companyId = confirmation === 'teacher' ? transfer.sourceCompanyId : transfer.targetCompanyId
        await appendDomainEventInTransaction(db, {
          companyId,
          projectId,
          aggregateType: 'PROJECT_TRANSFER',
          aggregateId: transfer.id,
          idempotencyKey: eventKey(transfer, `${confirmation}-confirm`, input.idempotencyKey),
          actor: { type: 'USER', id: actorUserId },
          event: {
            eventType: confirmation === 'teacher'
              ? 'PROJECT_TRANSFER.TEACHER_CONFIRMED'
              : 'PROJECT_TRANSFER.EDUCATION_CONFIRMED',
            schemaVersion: 1,
            payload: { status },
          },
        })
        await this.infrastructure.auditInTransaction(db, {
          kind: `project_transfer_${confirmation}_confirmed`,
          userId: actorUserId,
          companyId,
          detail: { transferId: transfer.id, projectId, status },
        })
      }
      if (readyApplied) {
        await appendDomainEventInTransaction(db, {
          companyId: transfer.sourceCompanyId,
          projectId,
          aggregateType: 'PROJECT_TRANSFER',
          aggregateId: transfer.id,
          idempotencyKey: eventKey(transfer, 'ready', input.idempotencyKey),
          actor: { type: 'SYSTEM' },
          event: {
            eventType: 'PROJECT_TRANSFER.READY',
            schemaVersion: 1,
            payload: { targetCompanyId: transfer.targetCompanyId },
          },
        })
      }
      return response(transfer, status)
    })
  }

  cancel(actorUserId: string, projectId: string, input: ResolveProjectTransferInput) {
    return this.resolve(actorUserId, projectId, input, 'CANCELLED')
  }

  reject(actorUserId: string, projectId: string, input: ResolveProjectTransferInput) {
    return this.resolve(actorUserId, projectId, input, 'REJECTED')
  }

  private resolve(
    actorUserId: string,
    projectId: string,
    input: ResolveProjectTransferInput,
    next: 'CANCELLED' | 'REJECTED',
  ) {
    return this.infrastructure.transaction(async (db) => {
      const transfer = await this.requireTransfer(db, projectId)
      await this.assertConfirmationPermission(db, actorUserId, transfer, next === 'CANCELLED' ? 'teacher' : 'education')
      const command = next === 'CANCELLED' ? 'CANCEL' : 'REJECT'
      const transition = transitionProjectTransfer(transfer.status, command)
      if (transition.outcome === 'INVALID') {
        throw new ProjectTransferError('invalid_transition', `cannot ${command.toLowerCase()} ${transfer.status} Project Transfer`)
      }
      if (transition.outcome === 'APPLIED') {
        const changed = await resolveProjectTransfer(db, {
          transferId: transfer.id,
          expected: transfer.status as 'PENDING' | 'READY',
          next,
          reason: input.reason,
        })
        if (!changed) throw new ProjectTransferError('concurrent_change', 'Project Transfer changed concurrently')
        await applySystemProjectLifecycleInTransaction(db, {
          actorUserId,
          companyId: transfer.sourceCompanyId,
          projectId,
          kind: 'TEACHING',
          status: 'TRANSFER_PENDING',
          command: 'CANCEL_TRANSFER',
        })
        const companyId = next === 'CANCELLED' ? transfer.sourceCompanyId : transfer.targetCompanyId
        await appendDomainEventInTransaction(db, {
          companyId,
          projectId,
          aggregateType: 'PROJECT_TRANSFER',
          aggregateId: transfer.id,
          idempotencyKey: eventKey(transfer, command.toLowerCase(), input.idempotencyKey),
          actor: { type: 'USER', id: actorUserId },
          event: {
            eventType: `PROJECT_TRANSFER.${next}`,
            schemaVersion: 1,
            payload: { reason: input.reason },
          },
        })
        await this.infrastructure.auditInTransaction(db, {
          kind: `project_transfer_${next.toLowerCase()}`,
          userId: actorUserId,
          companyId,
          detail: { transferId: transfer.id, projectId, reason: input.reason },
        })
      }
      return response(transfer, next)
    })
  }

  complete(actorUserId: string, projectId: string, input: ConfirmProjectTransferInput) {
    return this.infrastructure.transaction(async (db) => {
      const transfer = await this.requireTransfer(db, projectId)
      await this.assertConfirmationPermission(db, actorUserId, transfer, 'education')
      const transition = transitionProjectTransfer(transfer.status, 'COMPLETE')
      if (transition.outcome === 'INVALID') {
        throw new ProjectTransferError('invalid_transition', `cannot complete ${transfer.status} Project Transfer`)
      }
      if (transition.outcome === 'ALREADY_APPLIED') return response(transfer, 'COMPLETED')
      const readiness = await projectTransferReadiness(db, transfer)
      const { policySnapshot, ...conditions } = readiness
      if (!projectTransferConditionsReady(conditions) || !policySnapshot) {
        throw new ProjectTransferError('conditions_not_ready', 'Project Transfer conditions changed after READY')
      }
      if (!await completeProjectTransferOwnership(db, transfer)) {
        throw new ProjectTransferError('concurrent_change', 'Project ownership changed concurrently')
      }
      if (!await markProjectTransferCompleted(db, transfer.id)) {
        throw new ProjectTransferError('concurrent_change', 'Project Transfer changed concurrently')
      }
      await appendDomainEventInTransaction(db, {
        companyId: transfer.targetCompanyId,
        projectId,
        aggregateType: 'PROJECT_TRANSFER',
        aggregateId: transfer.id,
        idempotencyKey: eventKey(transfer, 'complete', input.idempotencyKey),
        actor: { type: 'USER', id: actorUserId },
        event: {
          eventType: 'PROJECT_TRANSFER.COMPLETED',
          schemaVersion: 1,
          payload: { sourceCompanyId: transfer.sourceCompanyId, kind: 'INSTITUTIONAL_COURSE' },
        },
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'project_transfer_completed',
        userId: actorUserId,
        companyId: transfer.targetCompanyId,
        detail: { transferId: transfer.id, projectId, sourceCompanyId: transfer.sourceCompanyId },
      })
      return response(transfer, 'COMPLETED')
    })
  }

  private async requireTransfer(db: Queryable, projectId: string): Promise<ProjectTransferRecord> {
    const transfer = await lockProjectTransfer(db, projectId)
    if (!transfer) throw new ProjectTransferError('not_found', 'Project Transfer not found')
    return transfer
  }

  private async assertConfirmationPermission(
    db: Queryable,
    actorUserId: string,
    transfer: ProjectTransferRecord,
    confirmation: 'teacher' | 'education',
  ): Promise<void> {
    const permission = createPermissionService(db, { lockDependencies: true })
    if (confirmation === 'teacher') {
      await permission.assertCan({
        actorUserId,
        action: 'project:request_transfer',
        companyId: transfer.sourceCompanyId,
        projectId: transfer.projectId,
      })
      return
    }
    await permission.assertCan({
      actorUserId,
      action: 'company:update',
      companyId: transfer.targetCompanyId,
    })
  }
}
