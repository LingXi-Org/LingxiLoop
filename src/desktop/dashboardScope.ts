import type { WorkspaceSummary } from '@/types'

export interface DashboardScopes {
  personal: WorkspaceSummary | null
  courses: WorkspaceSummary[]
  visible: WorkspaceSummary[]
}

export function getDashboardScopes(workspaces: WorkspaceSummary[]): DashboardScopes {
  const visible = workspaces.filter((workspace) => workspace.status !== 'ARCHIVED' && workspace.status !== 'DELETED')
  const personal = visible.find((workspace) => workspace.kind === 'PERSONAL_LEARNING' && workspace.isDefault)
    ?? visible.find((workspace) => workspace.kind === 'PERSONAL_LEARNING')
    ?? null
  return {
    personal,
    courses: visible.filter((workspace) => workspace.id !== personal?.id),
    visible,
  }
}

export function getDefaultDashboardWorkspace(
  workspaces: WorkspaceSummary[],
  selectedId: string | null,
): WorkspaceSummary | null {
  const scopes = getDashboardScopes(workspaces)
  return scopes.courses.find((workspace) => workspace.id === selectedId)
    ?? scopes.courses[0]
    ?? scopes.personal
    ?? scopes.visible[0]
    ?? null
}
