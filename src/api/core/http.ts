import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId, useAuth } from '@/stores/auth'
import { lingxiApiFetch, mergeRequestHeaders } from '@/api/transport'

export const API = '/api'
export const getServerOrigin = () => ''

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const company = getActiveCompanyId()
  if (company) headers['x-company-id'] = company
  const workspace = getWorkspaceSession()
  if (workspace && workspace.companyId === company) headers['x-project-id'] = workspace.projectId
  const response = await lingxiApiFetch(`${API}${path}`, { ...init, credentials: 'include', headers: mergeRequestHeaders(headers, init?.headers) })
  if (response.status === 401 && !path.startsWith('/auth/')) useAuth.getState().clear()
  if (!response.ok) {
    let detail: string | null = null
    try {
      const text = await response.text()
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; message?: string }
          detail = json.error ?? json.message ?? text.slice(0, 200)
        } catch { detail = text.slice(0, 200) }
      }
    } catch { /* Ignore unreadable error bodies. */ }
    throw new Error(detail ? `${detail} (${response.status})` : `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}
