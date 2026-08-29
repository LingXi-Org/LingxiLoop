import type { Queryable } from '../../db/queryable.js'
import {
  type CompanyLifecycleCommand,
  type CompanyStatus,
  transitionCompany,
} from '../../domain/public.js'
import { createPermissionService } from '../access/public.js'
import { updateCompanyLifecycleStatus } from './lifecycle-repository.js'

export class CompanyLifecycleError extends Error {}

export interface CompanyLifecycleInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, event: {
    kind: string
    userId: string
    companyId: string
    detail: Record<string, unknown>
  }): Promise<void>
}

const COMMAND_ACTIONS = {
  ACTIVATE: 'company:activate',
  REQUEST_USER_DELETION: 'company:request_user_deletion',
  ENTER_GRACE_PERIOD: 'company:enter_grace_period',
  ENTER_READ_ONLY: 'company:enter_read_only',
  OFFBOARD: 'company:offboard',
  ENTER_RETENTION: 'company:enter_retention',
  ARCHIVE: 'company:archive',
  DELETE: 'company:delete',
} as const

export class CompanyLifecycleApplication {
  constructor(private readonly infrastructure: CompanyLifecycleInfrastructure) {}

  async execute(input: {
    actorUserId: string
    companyId: string
    command: CompanyLifecycleCommand
  }): Promise<{ ok: true; status: CompanyStatus; applied: boolean }> {
    return this.infrastructure.transaction(async (db) => {
      const context = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: input.actorUserId,
        action: COMMAND_ACTIONS[input.command],
        companyId: input.companyId,
      })
      const transition = transitionCompany(context.company.type, context.company.status, input.command)
      if (transition.outcome === 'INVALID') {
        throw new CompanyLifecycleError(
          `${context.company.type} Company cannot execute ${input.command} from ${context.company.status}`,
        )
      }
      if (transition.outcome === 'ALREADY_APPLIED') {
        return { ok: true, status: transition.to, applied: false }
      }
      const updated = await updateCompanyLifecycleStatus(db, {
        companyId: context.company.id,
        expected: transition.from,
        next: transition.to,
      })
      if (!updated) throw new CompanyLifecycleError('Company lifecycle changed concurrently')
      await this.infrastructure.auditInTransaction(db, {
        kind: 'company_lifecycle_transition',
        userId: input.actorUserId,
        companyId: context.company.id,
        detail: { command: input.command, from: transition.from, to: transition.to },
      })
      return { ok: true, status: transition.to, applied: true }
    })
  }
}
