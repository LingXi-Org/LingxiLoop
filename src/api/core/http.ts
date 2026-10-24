import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId, useAuth } from '@/stores/auth'
import { lingxiApiFetch, mergeRequestHeaders } from '@/api/transport'

export const API = '/api'
export const getServerOrigin = () => ''

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const company = getActiveCompanyId()
  const user = useAuth.getState().user
  if (company) headers['x-company-id'] = company
  const workspace = getWorkspaceSession()
  if (workspace && workspace.companyId === company) headers['x-project-id'] = workspace.projectId
  const response = await lingxiApiFetch(`${API}${path}`, { ...init, credentials: 'include', headers: mergeRequestHeaders(headers, init?.headers) })
  // The product-session synchronizer owns /session failure and its bounded recovery.
  if (response.status === 401 && path !== '/session' && !init?.signal?.aborted && !path.startsWith('/auth/')
    && useAuth.getState().user === user && getActiveCompanyId() === company) {
    useAuth.getState().clear('session-rejected')
  }
  if (!response.ok) {
    let detail: string | null = null
    let code: string | undefined
    try {
      const text = await response.text()
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; message?: string; code?: string }
          if (typeof json.code === 'string') code = json.code
          detail = json.error ?? json.message ?? text.slice(0, 200)
        } catch { detail = text.slice(0, 200) }
      }
    } catch { /* Ignore unreadable error bodies. */ }
    throw new ApiError(detail ? `${detail} (${response.status})` : `${response.status} ${response.statusText}`, response.status, code)
  }
  return response.json() as Promise<T>
}
