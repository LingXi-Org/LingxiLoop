import { ApiError } from '@/api/core/http'
import { registrationMessage } from './contracts'

export class RegistrationApiError extends ApiError {
  constructor(status: number, code?: string, requestId?: string, readonly retryAfter?: string) {
    const safeId = requestId && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId) ? requestId : undefined
    super(registrationMessage(code, status) + (safeId ? ` 请求编号：${safeId}` : ''), status, code, safeId)
  }
}
export function publicRegistrationError(error: unknown): RegistrationApiError {
  return error instanceof ApiError
    ? new RegistrationApiError(error.status, error.code, error.requestId)
    : new RegistrationApiError(503, 'REGISTRATION_UNAVAILABLE')
}
export async function registrationResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    try { return await response.json() as T }
    catch { throw new RegistrationApiError(502, 'REGISTRATION_UNAVAILABLE', response.headers.get('x-request-id') ?? response.headers.get('cf-ray') ?? undefined) }
  }
  const body = await response.json().catch(() => null) as { code?: unknown; requestId?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code : undefined
  const correlation = response.headers.get('x-request-id') ?? response.headers.get('cf-ray')
  const requestId = typeof body?.requestId === 'string' ? body.requestId : correlation ?? undefined
  const safeId = requestId && /^[a-zA-Z0-9_-]{1,100}$/.test(requestId) ? requestId : undefined
  throw new RegistrationApiError(response.status, code, safeId, response.headers.get('retry-after') ?? undefined)
}
/** Better Auth's official result codes drive actions, never English error text. */
export function verificationError(error: { code?: string; status?: number; requestId?: string }): RegistrationApiError {
  return new RegistrationApiError(error.status ?? 400, error.code, error.requestId)
}

const storageKey = 'lingxiloop.pending-email-verification.v1'
const lifetime = 30 * 60_000
export type PendingVerification = { email: string; context: string; expiresAt: number }
export function readPendingVerification(context: string, storage?: Pick<Storage, 'getItem' | 'removeItem'>, now = Date.now()): PendingVerification | null {
  try {
    storage ??= globalThis.sessionStorage
    const value = JSON.parse(storage?.getItem(storageKey) ?? 'null') as PendingVerification | null
    if (value && typeof value.email === 'string' && value.email.length <= 254 && value.context === context && value.expiresAt > now && value.expiresAt <= now + lifetime) return value
    storage?.removeItem(storageKey)
  } catch { /* Storage denial must not remove the manual recovery path. */ }
  return null
}
export function savePendingVerification(email: string, context: string): void {
  try { sessionStorage.setItem(storageKey, JSON.stringify({ email, context, expiresAt: Date.now() + lifetime })) } catch { /* Optional navigation hint. */ }
}
export function clearPendingVerification(): void {
  try { sessionStorage.removeItem(storageKey) } catch { /* Optional navigation hint. */ }
}
// A digest isolates invitation contexts without persisting the bearer invitation.
export async function verificationContext(invite?: string, kind?: string): Promise<string> {
  if (!invite) return 'manual'
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([kind, invite])))), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function registrationFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try { return await fetch(input, init) }
  catch { throw new RegistrationApiError(503, 'REGISTRATION_UNAVAILABLE') }
}
