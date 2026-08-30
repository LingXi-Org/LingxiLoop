import type { AuthCompany, AuthUser, ServerCapabilities } from '@/auth/contracts'
export type { AuthCompany, AuthUser } from '@/auth/contracts'
/**
 * Auth state — token + current user + active company. Token persists in
 * localStorage so reloads stay signed in. Every API request reads the
 * current token from this store through the shared HTTP transport.
 */
import { create } from 'zustand'
import { runAuthTeardown } from './authTeardown'
interface AuthState {
  token: string | null
  user: AuthUser | null
  companies: AuthCompany[]
  activeCompanyId: string | null
  ready: boolean   // false until the initial /auth/me probe finishes
  /** Server-driven feature flags. Null until the first /auth/me probe
   *  populates them; consumers should treat null as "don't know yet" and
   *  default to a safe value (usually: hide optional UI). */
  serverCapabilities: ServerCapabilities | null
  setSession: (token: string, user: AuthUser, companyId: string | null) => void
  setMe: (user: AuthUser, companies: AuthCompany[], activeCompanyId: string) => void
  setServerCapabilities: (caps: ServerCapabilities) => void
  setActiveCompany: (id: string) => void
  clear: () => void
  markReady: () => void
}

const TOKEN_KEY = 'lingxiloop.auth.token'
const COMPANY_KEY = 'lingxiloop.auth.company'

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: null,
  companies: [],
  activeCompanyId: localStorage.getItem(COMPANY_KEY),
  ready: false,
  serverCapabilities: null,
  setSession(token, user, companyId) {
    const previousUserId = useAuth.getState().user?.id
    if (previousUserId && previousUserId !== user.id) runAuthTeardown()
    localStorage.setItem(TOKEN_KEY, token)
    if (companyId) localStorage.setItem(COMPANY_KEY, companyId)
    set({ token, user, activeCompanyId: companyId, ready: true })
    // Fresh auth → rebind the WS connection so it carries the new
    // session's ticket instead of staying on whatever it had before.
    void import('@/api/core/realtime').then(({ ws }) => ws.reconnect())
  },
  setMe(user, companies, activeCompanyId) {
    // Honour a previously-chosen company if it's still in the user's set.
    // Without this, every /auth/me probe would yank the active company back
    // to the server-default one, defeating the manual switcher.
    const stored = localStorage.getItem(COMPANY_KEY)
    const memberIds = new Set(companies.map((c) => c.id))
    const resolved = stored && memberIds.has(stored)
      ? stored
      : (activeCompanyId && memberIds.has(activeCompanyId) ? activeCompanyId : (companies[0]?.id ?? null))
    if (resolved) localStorage.setItem(COMPANY_KEY, resolved)
    set({ user, companies, activeCompanyId: resolved })
  },
  setServerCapabilities(caps) {
    set({ serverCapabilities: caps })
  },
  setActiveCompany(id) {
    if (useAuth.getState().activeCompanyId === id) return
    localStorage.setItem(COMPANY_KEY, id)
    set({ activeCompanyId: id })
    // Force the WS connection to re-handshake. The bridge filters events
    // by company-membership which is the same regardless of "active"
    // company, but logging in / switching identities should still rebind
    // — and this is the natural place to handle it.
    void import('@/api/core/realtime').then(({ ws }) => ws.reconnect())
    // Wipe library stores so the Library tab doesn't briefly render the
    // previous workspace's documents or calendar before the
    // next listXXX() lands. These stores are global singletons that
    // outlive the AuthedApp remount, so a key-change alone doesn't
    // clear them.
    void Promise.all([
      import('@/features/documents/state').then(({ useDocuments }) => useDocuments.getState().reset()),
      import('../features/calendar/state').then(({ useCalendar }) => useCalendar.getState().reset()),
    ])
  },
  clear() {
    runAuthTeardown()
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(COMPANY_KEY)
    set({ token: null, user: null, companies: [], activeCompanyId: null, ready: true, serverCapabilities: null })
    // Stale object-URLs from the previous user's avatars would otherwise
    // linger; clear them so the next sign-in doesn't briefly render a
    // dead URL.createObjectURL pointing at a freed blob.
    void import('@/lib/avatarCache').then(({ clearAvatarCache }) => clearAvatarCache())
    void import('@/lib/im/wukong').then(({ lingxiIm }) => lingxiIm.disconnect())
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

/** Sync getter for the API client + WS connection. */
export function getAuthToken(): string | null {
  return useAuth.getState().token
}

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
