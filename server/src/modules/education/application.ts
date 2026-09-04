import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import { applySystemCompanyLifecycleInTransaction } from '../companies/public.js'
import { applySystemProjectLifecycleInTransaction } from '../projects/public.js'
import type { CreateEducationCompanyInput } from './contracts.js'
import { expireNextDueEducationContract, insertEducationCore } from './repository.js'

export interface EducationInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, input: { kind: string; userId?: string; companyId: string; detail: Record<string, unknown> }): Promise<void>
}

function identity(prefix: string, key: string): string {
  return `${prefix}-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`
}

export class EducationApplication {
  constructor(private readonly infrastructure: EducationInfrastructure) {}

  createCompany(creatorUserId: string, input: CreateEducationCompanyInput) {
    const companyId = identity('education', `${creatorUserId}:${input.idempotencyKey}`)
    const contractId = identity('contract', companyId)
    const seatId = identity('seat', `${companyId}:${creatorUserId}`)
    return this.infrastructure.transaction(async (db) => {
      const created = await insertEducationCore(db, { ...input, creatorUserId, companyId, contractId, seatId })
      const actor = { type: 'USER' as const, id: creatorUserId }
      await appendDomainEventInTransaction(db, {
        companyId, aggregateType: 'COMPANY', aggregateId: companyId, idempotencyKey: `${input.idempotencyKey}:company`, actor,
        event: { eventType: 'EDUCATION_COMPANY.CREATED', schemaVersion: 1, payload: { status: 'TRIAL', planId: input.planId } },
      })
      await appendDomainEventInTransaction(db, {
        companyId, aggregateType: 'MEMBERSHIP', aggregateId: `${companyId}:${creatorUserId}`, idempotencyKey: `${input.idempotencyKey}:membership`, actor,
        event: { eventType: 'SCHOOL_MEMBERSHIP.CREATED', schemaVersion: 1, payload: { userId: creatorUserId, status: 'ACTIVE' } },
      })
      await appendDomainEventInTransaction(db, {
        companyId, aggregateType: 'EDUCATION_CONTRACT', aggregateId: contractId, idempotencyKey: `${input.idempotencyKey}:contract`, actor,
        event: { eventType: 'EDUCATION_CONTRACT.CREATED', schemaVersion: 1, payload: { status: 'TRIAL', planId: input.planId, startsAt: input.contract.startsAt, endsAt: input.contract.endsAt, seatLimit: input.contract.seatLimit } },
      })
      await appendDomainEventInTransaction(db, {
        companyId, aggregateType: 'ORGANIZATION_SEAT', aggregateId: seatId, idempotencyKey: `${input.idempotencyKey}:seat`, actor,
        event: { eventType: 'ORGANIZATION_SEAT.ASSIGNED', schemaVersion: 1, payload: { userId: creatorUserId, status: 'ACTIVE', contractId } },
      })
      if (created) await this.infrastructure.auditInTransaction(db, { kind: 'education_company_create', userId: creatorUserId, companyId, detail: { contractId, seatId, planId: input.planId } })
      return { companyId, contractId, seatId, status: 'TRIAL' as const }
    })
  }

  expireNextDueContract(now: Date): Promise<boolean> {
    return this.infrastructure.transaction(async (db) => {
      const expired = await expireNextDueEducationContract(db, now)
      if (!expired) return false
      const companyStatus = expired.previousCompanyStatus === 'TRIAL' || expired.previousCompanyStatus === 'ACTIVE'
        ? (await applySystemCompanyLifecycleInTransaction(db, {
            companyId: expired.companyId,
            type: 'EDUCATION',
            status: expired.previousCompanyStatus,
            command: 'ENTER_GRACE_PERIOD',
          })).status
        : expired.previousCompanyStatus
      const endedProjectIds: string[] = []
      for (const project of expired.projects) {
        const transition = await applySystemProjectLifecycleInTransaction(db, {
          companyId: expired.companyId,
          projectId: project.id,
          kind: project.kind,
          status: project.status,
          command: 'END',
        })
        if (transition.applied) endedProjectIds.push(project.id)
      }
      const expiryKey = `education-contract-expired:${expired.contractId}:${expired.endsAt.toISOString()}`
      await appendDomainEventInTransaction(db, {
        companyId: expired.companyId,
        aggregateType: 'EDUCATION_CONTRACT',
        aggregateId: expired.contractId,
        idempotencyKey: expiryKey,
        actor: { type: 'SYSTEM' },
        event: {
          eventType: 'EDUCATION_CONTRACT.EXPIRED',
          schemaVersion: 1,
          payload: { endsAt: expired.endsAt.toISOString(), companyStatus },
        },
      })
      if (companyStatus !== expired.previousCompanyStatus) {
        await appendDomainEventInTransaction(db, {
          companyId: expired.companyId,
          aggregateType: 'COMPANY',
          aggregateId: expired.companyId,
          idempotencyKey: `${expiryKey}:company`,
          actor: { type: 'SYSTEM' },
          event: {
            eventType: 'EDUCATION_COMPANY.ENTERED_GRACE_PERIOD',
            schemaVersion: 1,
            payload: {
              reason: 'EDUCATION_CONTRACT_EXPIRED',
              contractId: expired.contractId,
              previousStatus: expired.previousCompanyStatus,
            },
          },
        })
      }
      for (const projectId of endedProjectIds) {
        await appendDomainEventInTransaction(db, {
          companyId: expired.companyId,
          projectId,
          aggregateType: 'PROJECT',
          aggregateId: projectId,
          idempotencyKey: `${expiryKey}:project:${projectId}`,
          actor: { type: 'SYSTEM' },
          event: {
            eventType: 'PROJECT.COURSE_ENDED',
            schemaVersion: 1,
            payload: { reason: 'EDUCATION_CONTRACT_EXPIRED', contractId: expired.contractId },
          },
        })
      }
      await this.infrastructure.auditInTransaction(db, {
        kind: 'education_contract_expired',
        companyId: expired.companyId,
        detail: {
          contractId: expired.contractId,
          previousCompanyStatus: expired.previousCompanyStatus,
          companyStatus,
          endedProjectIds,
        },
      })
      return true
    })
  }
}
