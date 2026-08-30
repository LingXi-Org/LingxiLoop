import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import type { CreateEducationCompanyInput } from './contracts.js'
import { insertEducationCore } from './repository.js'

export interface EducationInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, input: { kind: string; userId: string; companyId: string; detail: Record<string, unknown> }): Promise<void>
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
}
