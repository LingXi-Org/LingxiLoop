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
import { createAuthClient } from 'better-auth/react'

export const API_URL = '/api'
export const adminAuthClient = createAuthClient({ baseURL: location.origin, basePath: '/api/auth' })

function httpError(statusCode: number, message: string): HttpError {
  return { statusCode, message }
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  const response = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include', headers })
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
      `/control/platform/resources/${encodeURIComponent(resource)}?${parameters}`,
    )
    return {
      data: result.data,
      total: result.total ?? ((currentPage - 1) * pageSize + result.data.length + (result.nextCursor ? 1 : 0)),
    }
  },
  getOne: async <TData extends BaseRecord = BaseRecord>(params: GetOneParams) => ({
    data: await adminFetch<TData>(`/control/platform/resources/${encodeURIComponent(params.resource)}/${encodeURIComponent(params.id)}`),
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

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    const result = await adminAuthClient.signIn.email({ email: String(email), password: String(password) })
    return result.error ? { success: false, error: httpError(result.error.status ?? 401, result.error.message ?? '登录失败') } : { success: true, redirectTo: '/' }
  },
  register: async ({ email, password, name, inviteToken, inviteKind }) => {
    const response = await fetch('/api/auth/sign-up/email', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, name, inviteToken, inviteKind }) })
    const payload = await response.json().catch(() => ({})) as { error?: string }
    return response.ok ? { success: true, redirectTo: '/login' } : { success: false, error: httpError(response.status, payload.error ?? '注册失败') }
  },
  logout: async () => {
    await adminAuthClient.signOut()
    return { success: true, redirectTo: '/login' }
  },
  check: async () => {
    const session = await adminAuthClient.getSession()
    if (!session.data) return { authenticated: false, redirectTo: '/login' }
    const role = (session.data.user as { role?: string }).role
    return role === 'admin' ? { authenticated: true } : { authenticated: false, redirectTo: '/forbidden', logout: false }
  },
  getIdentity: async () => {
    const session = await adminAuthClient.getSession()
    return session.data?.user ?? null
  },
  onError: async (error) => {
    const status = (error as HttpError).statusCode
    if (status === 401) return { logout: true, redirectTo: '/login', error }
    if (status === 403) return { redirectTo: '/forbidden', error }
    return { error }
  },
}

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const session = await adminAuthClient.getSession()
    if ((session.data?.user as { role?: string } | undefined)?.role !== 'admin') return { can: false, reason: '需要 D1 管理员角色' }
    if (action === 'list' || action === 'show') return { can: true }
    const commands: Record<string, readonly string[]> = {
      users: ['suspend', 'restore', 'delete'],
      companies: ['activate', 'enter-read-only', 'archive'],
      projects: ['activate', 'end', 'enter-read-only', 'archive'],
      'agent-routines': ['pause'],
    }
    if (resource && commands[resource]?.includes(action)) return { can: true }
    return { can: false, reason: '平台后台仅开放明确的业务命令' }
  },
  options: { buttons: { enableAccessControl: true, hideIfUnauthorized: true } },
}
