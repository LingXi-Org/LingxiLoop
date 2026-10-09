import type { AuthCompany, AuthUser, ServerCapabilities } from '@/auth/contracts'
export type { AuthCompany, AuthUser } from '@/auth/contracts'
/**
 * Browser authentication is held only by Better Auth's host-only cookie.
 */
import { create } from 'zustand'
import { runAuthTeardown } from './authTeardown'
interface AuthState {
  authenticated: boolean
  user: AuthUser | null
  companies: AuthCompany[]
  activeCompanyId: string | null
  ready: boolean   // false until the initial /auth/me probe finishes
  /** Server-driven feature flags. Null until the first /auth/me probe
   *  populates them; consumers should treat null as "don't know yet" and
   *  default to a safe value (usually: hide optional UI). */
  serverCapabilities: ServerCapabilities | null
  setAuthenticated: (user: AuthUser, companyId: string | null) => void
  setMe: (user: AuthUser, companies: AuthCompany[], activeCompanyId: string) => void
  setServerCapabilities: (caps: ServerCapabilities) => void
  setActiveCompany: (id: string) => void
  clear: () => void
  markReady: () => void
}

const COMPANY_KEY = 'lingxiloop.auth.company'

export const useAuth = create<AuthState>((set) => ({
  authenticated: false,
  user: null,
  companies: [],
  activeCompanyId: localStorage.getItem(COMPANY_KEY),
  ready: false,
  serverCapabilities: null,
  setAuthenticated(user, companyId) {
    const previousUserId = useAuth.getState().user?.id
    if (previousUserId && previousUserId !== user.id) runAuthTeardown()
    if (companyId) localStorage.setItem(COMPANY_KEY, companyId)
    set({ authenticated: true, user, activeCompanyId: companyId, ready: true })
    // Fresh auth → rebind the WS connection so it carries the new
    // session's ticket instead of staying on whatever it had before.
    void import('@/api/core/realtime').then(({ ws }) => ws.reconnect())
  },
  setMe(user, companies, activeCompanyId) {
    const resolved = companies.length === 1 && companies[0].id === activeCompanyId ? activeCompanyId : null
    if (!resolved) { useAuth.getState().clear(); return }
    if (resolved) localStorage.setItem(COMPANY_KEY, resolved)
    set({ user, companies, activeCompanyId: resolved })
  },
  setServerCapabilities(caps) {
    set({ serverCapabilities: caps })
  },
  setActiveCompany(id) {
    if (useAuth.getState().companies[0]?.id !== id) throw new Error('仅可使用当前公司')
    set({ activeCompanyId: id })
  },
  clear() {
    runAuthTeardown()
    localStorage.removeItem(COMPANY_KEY)
    set({
      authenticated: false,
      user: null,
      companies: [],
      activeCompanyId: null,
          ready: true,
      serverCapabilities: null,
    })
    // Stale object-URLs from the previous user's avatars would otherwise
    // linger; clear them so the next sign-in doesn't briefly render a
    // dead URL.createObjectURL pointing at a freed blob.
    void import('@/lib/avatarCache').then(({ clearAvatarCache }) => clearAvatarCache())
    void import('@/features/chat/runtime/transport').then(({ chatTransport }) => chatTransport.disconnect())
    void import('@/api/core/realtime').then(({ ws }) => ws.close())
    // Library stores survive logout otherwise (they're global singletons).
    void Promise.all([
      import('@/features/documents/state').then(({ useDocuments }) => useDocuments.getState().reset()),
      import('../features/calendar/state').then(({ useCalendar }) => useCalendar.getState().reset()),
    ])
  },
  markReady() {
    set({ ready: true })
  },
}))

/** Sync getter for the current user id. Returns null when no user is signed
 *  in — callers MUST handle that case explicitly. (We never default to a
 *  hardcoded user id like the old 'yetone' value, because that silently
 *  conflates "no user" with "yetone is the user" and broke DM avatars,
 *  message bubble colors, etc. for every non-yetone account.) */
export function getMeId(): string | null {
  return useAuth.getState().user?.id ?? null
}

/** React hook variant — returns the active user id, re-rendering on auth
 *  change. Same null semantics as getMeId. The app shell (AuthGate) keeps
 *  consumers from rendering before a user is set, so in practice the value
 *  is non-null wherever it matters. */
export function useMe(): string | null {
  return useAuth((s) => s.user?.id ?? null)
}

/** Sync getter for the current company id (for the x-company-id header). */
export function getActiveCompanyId(): string | null {
  return useAuth.getState().activeCompanyId
}
