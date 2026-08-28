import { getWorkspaceSession } from '@/lib/workspaceSession'
import { getActiveCompanyId, getAuthToken, useAuth } from '@/stores/auth'
import { lingxiApiFetch, mergeRequestHeaders } from '@/api/transport'

const SERVER_URL_KEY = 'lingxiloop.serverUrl'

function resolveServerOrigin(): string {
  if (typeof localStorage !== 'undefined') {
    const override = localStorage.getItem(SERVER_URL_KEY)
    if (override) return override.replace(/\/+$/, '')
  }
  const baked = import.meta.env.VITE_LINGXILOOP_API_BASE as string | undefined
  return baked ? baked.replace(/\/+$/, '') : ''
}

const SERVER_ORIGIN = resolveServerOrigin()
export const API = `${SERVER_ORIGIN}/api`

export const getServerOrigin = () => SERVER_ORIGIN

export function setServerOrigin(origin: string | null): void {
  if (origin == null || origin.trim() === '') localStorage.removeItem(SERVER_URL_KEY)
  else localStorage.setItem(SERVER_URL_KEY, origin.trim().replace(/\/+$/, ''))
  useAuth.getState().clear()
}

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const token = getAuthToken()
  if (token) headers.authorization = `Bearer ${token}`
  const company = getActiveCompanyId()
  if (company) headers['x-company-id'] = company
  const workspace = getWorkspaceSession()
  if (workspace && workspace.companyId === company) headers['x-project-id'] = workspace.projectId
  const response = await lingxiApiFetch(`${API}${path}`, { ...init, headers: mergeRequestHeaders(headers, init?.headers) })
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
