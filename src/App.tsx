import { conversationsApi } from '@/api/conversations'
import { lazy, Suspense, useEffect, useState } from 'react'
import { consumeSuspendedFragment, SuspendedScreen } from '@/admin/SuspendedScreen'
import { consumeWaitlistFragment, WaitlistConfirmedScreen } from '@/admin/WaitlistConfirmedScreen'
import { AuthGate } from '@/components/AuthGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
  clearPendingInvite,
  consumeInviteFromUrl,
  getPendingInvite,
  InviteAcceptScreen,
} from '@/components/InviteAcceptScreen'
import { NotificationToasts } from '@/components/NotificationToasts'
import { UpdateBanner, UpdaterDialog } from '@/components/UpdaterDialog'
import { seedMockIm } from '@/dev/mockIm'
import { isMockImDevelopment } from '@/lib/devMode'
import { isNotificationWindow } from '@/lib/runtime'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { bootConversations, isMuted, useConversations } from '@/stores/conversations'
import { bootMessagesStream, useMessages } from '@/stores/messages'
import { bootParticipants } from '@/stores/participants'
import { usePrefs } from '@/stores/preferences'
import { useUiCommand } from '@/stores/uiCommands'
import { bootWhispers, useWhispers } from '@/stores/whispers'

const AdminApp = lazy(() => import('@/admin/AdminApp').then((module) => ({ default: module.AdminApp })))
const DesktopApp = lazy(() => import('@/desktop/DesktopApp').then((module) => ({ default: module.DesktopApp })))

function SurfaceFallback() {
  return <div className="fixed inset-0 grid place-items-center text-sm text-ink-400">Loading…</div>
}

/** True iff this browser tab is for the admin panel. An optional `admin.*`
 *  hostname or the `/admin` path prefix triggers it. We check both so dev can hit
 *  http://localhost:5180/admin/ without DNS work. */
function isAdminContext(): boolean {
  if (typeof location === 'undefined') return false
  if (location.hostname.startsWith('admin.')) return true
  if (location.pathname.startsWith('/admin')) return true
  return false
}

function AuthedApp({ mockMode = false }: { mockMode?: boolean }) {
  const convoId = useApp((s) => s.selectedConversationId)
  const view = useApp((s) => s.view)
  const hasDockUnread = useConversations((s) =>
    s.list.some((c) => !isMuted(c) && (c.unread ?? 0) > 0),
  )
  const selectedConvoExists = useConversations((s) =>
    convoId ? s.list.some((c) => c.id === convoId) : false,
  )
  const [updaterOpen, setUpdaterOpen] = useState(false)
  const uiCommand = useUiCommand()
  useEffect(() => {
    if (mockMode) return
    bootMessagesStream()
    bootParticipants()
    bootConversations()
    bootWhispers()
    void usePrefs.getState().load()
  }, [mockMode])

  useEffect(() => {
    window.lingxiloop?.dock?.setUnreadDot(hasDockUnread)
  }, [hasDockUnread])

  useEffect(() => {
    return () => window.lingxiloop?.dock?.setUnreadDot(false)
  }, [])

  // Lazy-load messages + mark conversation as read when selected
  useEffect(() => {
    if (mockMode) return
    if (!convoId || !selectedConvoExists) return
    void useMessages.getState().loadConversation(convoId)
    void conversationsApi.markRead(convoId).then(() => {
      // refresh list so the badge clears
      void useConversations.getState().reload()
    }).catch(() => { /* swallow */ })
  }, [convoId, selectedConvoExists, mockMode])

  // Lazy-refresh whisper list when entering whispers view
  useEffect(() => {
    if (mockMode) return
    if (view === 'whispers') useWhispers.getState().loadList()
  }, [view, mockMode])

  useEffect(() => {
    if (uiCommand?.type === 'open-updater') setUpdaterOpen(true)
  }, [uiCommand])

  return (
    <>
      <DesktopApp />
      {/* In-app message toasts (window-blur / different-convo only) —
          rendered at the AuthedApp level so they share auth context and
          unmount cleanly on sign-out. */}
      {!mockMode && <NotificationToasts />}
      {!mockMode && <UpdateBanner onOpen={() => setUpdaterOpen(true)} />}
      {!mockMode && <UpdaterDialog open={updaterOpen} onClose={() => setUpdaterOpen(false)} />}
    </>
  )
}

export function App() {
  // Local Vite development opens straight into a deterministic IM workspace.
  // `?api=1` remains available for explicitly testing the real auth/API stack.
  if (isMockImDevelopment() && !isAdminContext()) {
    seedMockIm()
    return (
      <ErrorBoundary>
        <AuthedApp mockMode />
      </ErrorBoundary>
    )
  }

  // Waitlist landing — handleCallback redirects here with `#waitlist=1`
  // when a brand-new OAuth visitor hit the gate. Consume the fragment
  // once so refresh doesn't pin them on this screen forever. State is
  // read-only — the screen's dismiss button calls location.reload() to
  // fall back into the normal flow.
  const [waitlist] = useState<{ email: string | null } | null>(() => consumeWaitlistFragment())
  // Suspension landing — handleCallback redirects here with
  // `#suspended=1&email=...&reason=...` when a returning user whose
  // account is currently suspended finishes OAuth. Same consume-once
  // semantics as the waitlist screen.
  const [suspended] = useState<{ email: string | null; reason: string | null } | null>(
    () => consumeSuspendedFragment(),
  )

  // Force AuthedApp to remount when the user logs in/out OR switches between
  // companies — every store keys off the active tenant, so a clean remount is
  // the simplest way to reload all data without stale rows leaking across.
  const userId = useAuth((s) => s.user?.id ?? null)
  const companyId = useAuth((s) => s.activeCompanyId)

  // Invite-link handling — runs BEFORE the rest of the shell so the
  // accept page is the user's first impression when they open a link. The
  // token can ride in via URL (fresh click) or localStorage (resumed
  // after an OAuth round-trip). The state is unset on done so the user
  // lands in the freshly-joined workspace. We do NOT support lingxiloop://
  // deep links: invite URLs are always https://<web>/invite/<token>, so
  // the OS hands them to the default browser — Electron picks up the new
  // workspace on its next /auth/me refresh.
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    const fromUrl = consumeInviteFromUrl()
    if (fromUrl) {
      // Scrub the URL immediately so a refresh doesn't re-fire the same
      // flow; the token stays in component state.
      fromUrl.clear()
      return fromUrl.token
    }
    return getPendingInvite()
  })

  if (waitlist) {
    return <WaitlistConfirmedScreen email={waitlist.email} />
  }

  if (suspended) {
    return <SuspendedScreen email={suspended.email} reason={suspended.reason} />
  }

  // Admin panel runs in its own shell — different sidebar, different
  // routes, no chat stores. It still goes through AuthGate so the user
  // signs in via the same OAuth flow before reaching it.
  if (isAdminContext()) {
    return (
      <AuthGate>
        <ErrorBoundary>
          <Suspense fallback={<SurfaceFallback />}><AdminApp /></Suspense>
        </ErrorBoundary>
      </AuthGate>
    )
  }

  if (inviteToken) {
    const screen = (
      <InviteAcceptScreen
        token={inviteToken}
        onDone={() => { clearPendingInvite(); setInviteToken(null) }}
      />
    )
    return (
      <AuthGate unauthFallback={screen}>
        {screen}
      </AuthGate>
    )
  }

  return (
    <AuthGate>
      <ErrorBoundary>
        <AuthedApp key={`${userId ?? 'anon'}::${companyId ?? 'none'}`} />
      </ErrorBoundary>
    </AuthGate>
  )
}
