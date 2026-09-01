import type {
  AccessControlProvider,
  AuthProvider,
  BaseRecord,
  CrudFilter,
  CustomParams,
  DataProvider,
  GetListParams,
  GetOneParams,
  HttpError,
} from '@refinedev/core'

const TOKEN_KEY = 'lingxiloop.admin.token'

function serverOrigin(): string {
  return (import.meta.env.VITE_LINGXILOOP_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? ''
}

export const API_URL = `${serverOrigin()}/api`

export function getAdminToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearAdminToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function consumeOAuthFragment(): boolean {
  const parameters = new URLSearchParams(location.hash.replace(/^#/, ''))
  const token = parameters.get('token')
  if (!token) return false
  localStorage.setItem(TOKEN_KEY, token)
  history.replaceState(null, '', `${location.pathname}${location.search}`)
  return true
}

function httpError(statusCode: number, message: string): HttpError {
  return { statusCode, message }
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  const token = getAdminToken()
  if (token) headers.set('authorization', `Bearer ${token}`)
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (response.status === 401) clearAdminToken()
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null
    throw httpError(response.status, payload?.error ?? `${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

function logicalFilters(filters: CrudFilter[] | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const filter of filters ?? []) {
    if ('field' in filter && filter.value !== undefined && filter.value !== '') {
      result[String(filter.field)] = String(filter.value)
    }
  }
  return result
}

export const dataProvider: DataProvider = {
  getApiUrl: () => API_URL,
  getList: async <TData extends BaseRecord = BaseRecord>(params: GetListParams) => {
    const { resource, pagination, filters, sorters } = params
    const pageSize = pagination?.pageSize ?? 50
    const currentPage = pagination?.currentPage ?? 1
    const parameters = new URLSearchParams({
      limit: String(pageSize),
      cursor: btoa(String((currentPage - 1) * pageSize)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''),
      ...logicalFilters(filters),
    })
    const sorter = sorters?.[0]
    if (sorter) parameters.set('sort', sorter.field === 'id' ? 'id' : sorter.order === 'asc' ? 'oldest' : 'newest')
    const result = await adminFetch<{ data: TData[]; nextCursor: string | null; total?: number }>(
      `/admin/resources/${encodeURIComponent(resource)}?${parameters}`,
    )
    return {
      data: result.data,
      total: result.total ?? ((currentPage - 1) * pageSize + result.data.length + (result.nextCursor ? 1 : 0)),
    }
  },
  getOne: async <TData extends BaseRecord = BaseRecord>(params: GetOneParams) => ({
    data: await adminFetch<TData>(`/admin/resources/${encodeURIComponent(params.resource)}/${encodeURIComponent(params.id)}`),
  }),
  create: async () => { throw httpError(405, '该资源不支持任意创建') },
  update: async () => { throw httpError(405, '该资源不支持任意编辑') },
  deleteOne: async () => { throw httpError(405, '该资源不支持任意删除') },
  custom: async <TData extends BaseRecord = BaseRecord, TQuery = unknown, TPayload = unknown>(params: CustomParams<TQuery, TPayload>) => ({
    data: await adminFetch<TData>(params.url.replace(API_URL, ''), {
      method: params.method.toUpperCase(),
      body: params.payload === undefined ? undefined : JSON.stringify(params.payload),
      headers: params.headers,
    }),
  }),
}

interface AdminSession {
  user: { id: string; email: string; name: string }
  version: string
  commitSha: string
}

export const authProvider: AuthProvider = {
  login: async () => {
    const returnUrl = `${location.origin}/`
    location.assign(`${API_URL}/auth/start/lingxi?return=${encodeURIComponent(returnUrl)}`)
    return { success: true }
  },
  logout: async () => {
    await adminFetch('/auth/logout', { method: 'POST' }).catch(() => undefined)
    clearAdminToken()
    return { success: true, redirectTo: '/login' }
  },
  check: async () => {
    if (!getAdminToken()) return { authenticated: false, redirectTo: '/login' }
    try {
      await adminFetch<AdminSession>('/admin/session')
      return { authenticated: true }
    } catch (error) {
      const status = (error as HttpError).statusCode
      return status === 403
        ? { authenticated: false, redirectTo: '/forbidden', logout: false }
        : { authenticated: false, redirectTo: '/login', logout: true }
    }
  },
  getIdentity: async () => (await adminFetch<AdminSession>('/admin/session')).user,
  onError: async (error) => {
    const status = (error as HttpError).statusCode
    if (status === 401) return { logout: true, redirectTo: '/login', error }
    if (status === 403) return { redirectTo: '/forbidden', error }
    return { error }
  },
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    if (action === 'list' || action === 'show') return { can: true }
    const commands: Record<string, readonly string[]> = {
      users: ['suspend', 'restore'],
      companies: ['activate', 'enter-read-only', 'archive'],
      projects: ['activate', 'end', 'enter-read-only', 'archive'],
      'agent-routines': ['pause'],
    }
    if (resource && commands[resource]?.includes(action)) return { can: true }
    return { can: false, reason: '平台后台仅开放明确的业务命令' }
  },
  options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
}
