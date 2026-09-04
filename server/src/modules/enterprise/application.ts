import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import type {
  CreateOrganizationUnitRequest,
  GovernancePolicyKind,
  PutGovernancePolicyRequest,
} from './contracts.js'
import {
  findGovernancePolicyReplay,
  findOrganizationUnit,
  insertOrganizationUnit,
  listGovernancePolicies,
  listOrganizationUnits,
  upsertGovernancePolicy,
} from './repository.js'

export interface EnterpriseInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, input: {
    kind: string; userId: string; companyId: string; detail: Record<string, unknown>
  }): Promise<void>
}

export class EnterpriseApplicationError extends Error {
  constructor(readonly code: 'not_found' | 'forbidden' | 'conflict', message: string) { super(message) }
}

function identity(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

export class EnterpriseApplication {
  constructor(private readonly infrastructure: EnterpriseInfrastructure) {}

  private async educationContext(
    db: Queryable,
    actorUserId: string,
    companyId: string,
    action: 'company:read' | 'company:update',
  ) {
    const context = await createPermissionService(db, { lockDependencies: action === 'company:update' })
      .assertCan({ actorUserId, action, companyId })
    if (context.company.type !== 'EDUCATION') {
      throw new EnterpriseApplicationError('forbidden', 'Enterprise governance requires an Education Company')
    }
    return context
  }

  listUnits(actorUserId: string, companyId: string) {
    return this.infrastructure.transaction(async (db) => {
      await this.educationContext(db, actorUserId, companyId, 'company:read')
      return listOrganizationUnits(db, companyId)
    })
  }

  createUnit(actorUserId: string, companyId: string, request: CreateOrganizationUnitRequest) {
    const id = identity('org-unit', `${companyId}:${request.idempotencyKey}`)
    return this.infrastructure.transaction(async (db) => {
      await this.educationContext(db, actorUserId, companyId, 'company:update')
      const created = await insertOrganizationUnit(db, {
        id, companyId, parentUnitId: request.parentUnitId, name: request.name, actorUserId,
      })
      if (!created) {
        const replay = await findOrganizationUnit(db, companyId, id)
        if (replay && replay.name === request.name && replay.parentUnitId === request.parentUnitId) {
          return { ...replay, created: false }
        }
        if (replay) throw new EnterpriseApplicationError('conflict', 'idempotency key was used with different unit data')
        throw new EnterpriseApplicationError('not_found', 'active parent Organization Unit required')
      }
      await appendDomainEventInTransaction(db, {
        companyId,
        aggregateType: 'ORGANIZATION_UNIT',
        aggregateId: id,
        idempotencyKey: `organization-unit:${id}:created`,
        actor: { type: 'USER', id: actorUserId },
        event: {
          eventType: 'ORGANIZATION_UNIT.CREATED', schemaVersion: 1,
          payload: { parentUnitId: request.parentUnitId, name: request.name },
        },
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'organization_unit_created', userId: actorUserId, companyId,
        detail: { organizationUnitId: id, parentUnitId: request.parentUnitId },
      })
      return { ...created, created: true }
    })
  }

  listPolicies(actorUserId: string, companyId: string) {
    return this.infrastructure.transaction(async (db) => {
      await this.educationContext(db, actorUserId, companyId, 'company:read')
      return listGovernancePolicies(db, companyId)
    })
  }

  putPolicy(
    actorUserId: string,
    companyId: string,
    kind: GovernancePolicyKind,
    request: PutGovernancePolicyRequest,
  ) {
    const id = identity('governance-policy', `${companyId}:${kind}`)
    return this.infrastructure.transaction(async (db) => {
      await this.educationContext(db, actorUserId, companyId, 'company:update')
      const input = { id, companyId, kind, ...request, actorUserId }
      const changed = await upsertGovernancePolicy(db, input)
      if (!changed) {
        const replay = await findGovernancePolicyReplay(db, input)
        if (replay) return { ...replay, changed: false }
        throw new EnterpriseApplicationError('conflict', 'governance Policy revision is stale')
      }
      await appendDomainEventInTransaction(db, {
        companyId,
        aggregateType: 'GOVERNANCE_POLICY',
        aggregateId: id,
        idempotencyKey: `governance-policy:${id}:revision:${changed.revision}`,
        actor: { type: 'USER', id: actorUserId },
        event: {
          eventType: 'GOVERNANCE_POLICY.CONFIGURED', schemaVersion: 1,
          payload: { kind, policyVersion: request.policyVersion, revision: changed.revision },
        },
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'governance_policy_configured', userId: actorUserId, companyId,
        detail: { governancePolicyId: id, policyKind: kind, policyVersion: request.policyVersion, revision: changed.revision },
      })
      return { ...changed, changed: true }
    })
  }
}
