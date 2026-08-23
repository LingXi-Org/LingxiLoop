import { useEffect, useState } from 'react'
import { useIsMobile } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useMessages, bootMessagesStream } from '@/stores/messages'
import { bootParticipants } from '@/stores/participants'
import { bootConversations, isMuted, useConversations } from '@/stores/conversations'
import { bootWhispers, useWhispers } from '@/stores/whispers'
import { usePrefs } from '@/stores/preferences'
import { api } from '@/api/client'
import { DesktopApp } from '@/desktop/DesktopApp'
import { MobileApp } from '@/mobile/MobileApp'
import { AuthGate } from '@/components/AuthGate'
import { NotificationToasts } from '@/components/NotificationToasts'
import { NotificationWindow } from '@/components/NotificationWindow'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { isNotificationWindow } from '@/lib/runtime'
import {
  InviteAcceptScreen, consumeInviteFromUrl,
  getPendingInvite, clearPendingInvite,
} from '@/components/InviteAcceptScreen'
import { UpdateBanner, UpdaterDialog } from '@/components/UpdaterDialog'
import { AdminApp } from '@/admin/AdminApp'
import { WaitlistConfirmedScreen, consumeWaitlistFragment } from '@/admin/WaitlistConfirmedScreen'
import { SuspendedScreen, consumeSuspendedFragment } from '@/admin/SuspendedScreen'
import '@/admin/admin.css'

/** True iff this browser tab is for the admin panel. An optional `admin.*`
 *  hostname or the `/admin` path prefix triggers it. We check both so dev can hit
 *  http://localhost:5180/admin/ without DNS work. */
function isAdminContext(): boolean {
  if (typeof location === 'undefined') return false
  if (location.hostname.startsWith('admin.')) return true
  if (location.pathname.startsWith('/admin')) return true
  return false
}

function AuthedApp() {
  const isMobile = useIsMobile()
  const convoId = useApp((s) => s.selectedConversationId)
  const view = useApp((s) => s.view)
  const hasDockUnread = useConversations((s) =>
    s.list.some((c) => !isMuted(c) && (c.unread ?? 0) > 0),
  )
  const selectedConvoExists = useConversations((s) =>
    convoId ? s.list.some((c) => c.id === convoId) : false,
  )
  const [updaterOpen, setUpdaterOpen] = useState(false)
  useEffect(() => {
    bootMessagesStream()
    bootParticipants()
    bootConversations()
    bootWhispers()
    void usePrefs.getState().load()
  }, [])

  useEffect(() => {
    window.lingxiloop?.dock?.setUnreadDot(hasDockUnread)
  }, [hasDockUnread])

  useEffect(() => {
    return () => window.lingxiloop?.dock?.setUnreadDot(false)
  }, [])

  // Lazy-load messages + mark conversation as read when selected
  useEffect(() => {
    if (!convoId || !selectedConvoExists) return
    void useMessages.getState().loadConversation(convoId)
    void api.markRead(convoId).then(() => {
      // refresh list so the badge clears
      void useConversations.getState().reload()
    }).catch(() => { /* swallow */ })
  }, [convoId, selectedConvoExists])

  // Lazy-refresh whisper list when entering whispers view
  useEffect(() => {
    if (view === 'whispers') useWhispers.getState().loadList()
  }, [view])

  // Cross-component "open updater" channel — MeView's "Check for
  // updates" button posts this event to ask AuthedApp to open the
  // dialog without prop-drilling.
  useEffect(() => {
    const onOpen = () => setUpdaterOpen(true)
    window.addEventListener('lingxiloop:open-updater', onOpen)
    return () => window.removeEventListener('lingxiloop:open-updater', onOpen)
  }, [])

  return (
    <>
      {isMobile ? <MobileApp /> : <DesktopApp />}
      {/* In-app message toasts (window-blur / different-convo only) —
          rendered at the AuthedApp level so they share auth context and
          unmount cleanly on sign-out. */}
      <NotificationToasts />
      <UpdateBanner onOpen={() => setUpdaterOpen(true)} />
      <UpdaterDialog open={updaterOpen} onClose={() => setUpdaterOpen(false)} />
    </>
  )
}

export function App() {
  // The Electron notification BrowserWindow loads this same React bundle
  // with a `#notifications` hash. Bypass everything else (auth, stores,
  // routing) and just render the toast stack — it receives payloads over
  // IPC from the main window.
  if (isNotificationWindow) return <NotificationWindow />

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
          <AdminApp />
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
