const KEY = 'lingxiloop.activeKnowledgeWorkspace'

export interface WorkspaceSessionSelection { companyId: string; projectId: string }

export function getWorkspaceSession(): WorkspaceSessionSelection | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as WorkspaceSessionSelection | null
    return value?.companyId && value?.projectId ? value : null
  } catch { return null }
}

export function setWorkspaceSession(value: WorkspaceSessionSelection | null): void {
  if (typeof sessionStorage === 'undefined') return
  if (value) sessionStorage.setItem(KEY, JSON.stringify(value))
  else sessionStorage.removeItem(KEY)
}

export function getActiveProjectId(): string | null {
  return getWorkspaceSession()?.projectId ?? null
}
