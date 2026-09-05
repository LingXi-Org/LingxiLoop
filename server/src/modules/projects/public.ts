import type { Queryable } from '../../db/queryable.js'
import type { ProjectKind, ProjectLifecycleCommand, ProjectStatus } from '../../domain/public.js'

export {
  ProjectLifecycleApplication,
  ProjectLifecycleError,
  type ProjectLifecycleErrorCode,
  type ProjectLifecycleInfrastructure,
} from './application.js'

export async function applySystemProjectLifecycleInTransaction(db: Queryable, input: {
  actorUserId?: string
  companyId: string
  projectId: string
  kind: ProjectKind
  status: ProjectStatus
  command: ProjectLifecycleCommand
}) {
  const { projectLifecycleApplication } = await import('./facade.js')
  return projectLifecycleApplication.executeSystemInTransaction(db, input)
}
