import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import { KnowledgeApplicationError } from './application.js'
import {
  attachOrganizationKnowledgeSource,
  listOrganizationKnowledgeSources,
  promoteOrganizationKnowledgeSource,
} from './organization-repository.js'

export interface OrganizationKnowledgeInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, input: {
    kind: string
    userId: string
    companyId: string
    detail: Record<string, unknown>
  }): Promise<void>
}

function identity(prefix: string, value: string): string {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`
}

export class OrganizationKnowledgeApplication {
  constructor(private readonly infrastructure: OrganizationKnowledgeInfrastructure) {}

  list(actorUserId: string, companyId: string) {
    return this.infrastructure.transaction(async (db) => {
      await createPermissionService(db).assertCan({ actorUserId, action: 'company:read', companyId })
      return listOrganizationKnowledgeSources(db, companyId)
    })
  }

  promote(actorUserId: string, companyId: string, sourceId: string) {
    return this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId, action: 'company:update', companyId,
      })
      const bindingId = identity('org-knowledge', `${companyId}:${sourceId}`)
      const created = await promoteOrganizationKnowledgeSource(db, {
        id: bindingId, companyId, sourceId, actorId: actorUserId,
      })
      if (created === null) {
        throw new KnowledgeApplicationError('not_found', 'ready Institutional Course source required')
      }
      await appendDomainEventInTransaction(db, {
        companyId,
        aggregateType: 'ORGANIZATION_KNOWLEDGE',
        aggregateId: bindingId,
        idempotencyKey: `organization-knowledge:${bindingId}:promoted`,
        actor: { type: 'USER', id: actorUserId },
        event: {
          eventType: 'ORGANIZATION_KNOWLEDGE.PROMOTED',
          schemaVersion: 1,
          payload: { sourceId },
        },
      })
      if (created) await this.infrastructure.auditInTransaction(db, {
        kind: 'organization_knowledge_promoted',
        userId: actorUserId,
        companyId,
        detail: { sourceId, bindingId },
      })
      return { bindingId, sourceId, created }
    })
  }

  attach(actorUserId: string, companyId: string, projectId: string, sourceId: string) {
    return this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId,
        action: 'knowledge:manage',
        companyId,
        projectId,
        resource: { type: 'project', id: projectId },
      })
      const bindingId = identity('course-knowledge', `${companyId}:${projectId}:${sourceId}`)
      const created = await attachOrganizationKnowledgeSource(db, {
        id: bindingId, companyId, projectId, sourceId, actorId: actorUserId,
      })
      if (created === null) {
        throw new KnowledgeApplicationError('not_found', 'Organization source and active Institutional Course required')
      }
      await appendDomainEventInTransaction(db, {
        companyId,
        projectId,
        aggregateType: 'COURSE_KNOWLEDGE',
        aggregateId: bindingId,
        idempotencyKey: `course-knowledge:${bindingId}:attached`,
        actor: { type: 'USER', id: actorUserId },
        event: {
          eventType: 'COURSE_KNOWLEDGE.ATTACHED',
          schemaVersion: 1,
          payload: { sourceId },
        },
      })
      if (created) await this.infrastructure.auditInTransaction(db, {
        kind: 'course_knowledge_attached',
        userId: actorUserId,
        companyId,
        detail: { projectId, sourceId, bindingId },
      })
      return { bindingId, projectId, sourceId, created }
    })
  }
}
