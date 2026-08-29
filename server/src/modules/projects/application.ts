import type { Queryable } from '../../db/queryable.js'
import {
  type ProjectLifecycleCommand,
  type ProjectStatus,
  transitionProject,
} from '../../domain/public.js'
import { createPermissionService } from '../access/public.js'
import { updateProjectLifecycleStatus } from './repository.js'

export type ProjectLifecycleErrorCode = 'invalid_transition' | 'concurrent_change'

export class ProjectLifecycleError extends Error {
  constructor(readonly code: ProjectLifecycleErrorCode, message: string) {
    super(message)
  }
}

export interface ProjectLifecycleInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, event: {
    kind: string
    userId: string
    companyId: string
    detail: Record<string, unknown>
  }): Promise<void>
  projectLifecycleProjection(
    db: Queryable,
    input: { companyId: string; projectId: string; status: ProjectStatus },
  ): Promise<void>
}

const COMMAND_ACTIONS = {
  ACTIVATE: 'project:activate',
  END: 'project:end',
  ENTER_READ_ONLY: 'project:enter_read_only',
  REQUEST_TRANSFER: 'project:request_transfer',
  CANCEL_TRANSFER: 'project:cancel_transfer',
  ENTER_RETENTION: 'project:enter_retention',
  ARCHIVE: 'project:archive',
  DELETE: 'project:delete',
} as const

export class ProjectLifecycleApplication {
  constructor(private readonly infrastructure: ProjectLifecycleInfrastructure) {}

  async execute(input: {
    actorUserId: string
    companyId: string
    projectId: string
    command: ProjectLifecycleCommand
  }): Promise<{ ok: true; status: ProjectStatus; applied: boolean }> {
    return this.infrastructure.transaction((db) => this.executeInTransaction(db, input))
  }

  async executeInTransaction(db: Queryable, input: {
    actorUserId: string
    companyId: string
    projectId: string
    command: ProjectLifecycleCommand
  }): Promise<{ ok: true; status: ProjectStatus; applied: boolean }> {
    const context = await createPermissionService(db, { lockDependencies: true }).assertCan({
      actorUserId: input.actorUserId,
      action: COMMAND_ACTIONS[input.command],
      companyId: input.companyId,
      projectId: input.projectId,
    })
    const project = context.project
    if (!project) throw new ProjectLifecycleError('concurrent_change', 'Project context disappeared')
    const transition = transitionProject(project.kind, project.status, input.command)
    if (transition.outcome === 'INVALID') {
      throw new ProjectLifecycleError(
        'invalid_transition',
        `${project.kind} Project cannot execute ${input.command} from ${project.status}`,
      )
    }
    if (transition.outcome === 'ALREADY_APPLIED') {
      return { ok: true, status: transition.to, applied: false }
    }
    const updated = await updateProjectLifecycleStatus(db, {
      projectId: project.id,
      companyId: context.company.id,
      expected: transition.from,
      next: transition.to,
    })
    if (!updated) {
      throw new ProjectLifecycleError('concurrent_change', 'Project lifecycle changed concurrently')
    }
    await this.infrastructure.projectLifecycleProjection(db, {
      companyId: context.company.id,
      projectId: project.id,
      status: transition.to,
    })
    await this.infrastructure.auditInTransaction(db, {
      kind: 'project_lifecycle_transition',
      userId: input.actorUserId,
      companyId: context.company.id,
      detail: {
        projectId: project.id,
        projectKind: project.kind,
        command: input.command,
        from: transition.from,
        to: transition.to,
      },
    })
    return { ok: true, status: transition.to, applied: true }
  }
}
