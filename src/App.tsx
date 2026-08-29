import { lazy, Suspense, useEffect, useState } from 'react'
import { consumeSuspendedFragment, consumeWaitlistFragment, SuspendedScreen, WaitlistConfirmedScreen } from '@/auth/AuthStateScreens'
import { AuthGate } from '@/components/AuthGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import {
  clearPendingInvite,
  consumeInviteFromUrl,
  getPendingInvite,
  InviteAcceptScreen,
} from '@/features/companies/components/InviteAcceptScreen'
import { NotificationToasts } from '@/components/NotificationToasts'
import { UpdateBanner, UpdaterDialog } from '@/components/UpdaterDialog'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { bootConversations, isMuted, useConversations } from '@/features/conversations/store'
import { bootMessagesStream, useMessages } from '@/features/chat/state/messages'
import { bootParticipants } from '@/features/agents/state'
import { usePrefs } from '@/stores/preferences'
import { useUiCommand } from '@/stores/uiCommands'

const DesktopApp = lazy(() => import('@/desktop/DesktopApp').then((module) => ({ default: module.DesktopApp })))

function SurfaceFallback() {
  return <div className="fixed inset-0 grid place-items-center bg-background text-sm text-muted-foreground">Loading…</div>
}

function AuthedApp() {
  const convoId = useApp((s) => s.selectedConversationId)
  const hasDockUnread = useConversations((s) =>
    s.list.some((c) => !isMuted(c) && (c.unread ?? 0) > 0),
  )
  const selectedConvoExists = useConversations((s) =>
    convoId ? s.list.some((c) => c.id === convoId) : false,
  )
  const [updaterOpen, setUpdaterOpen] = useState(false)
  const uiCommand = useUiCommand()
  useEffect(() => {
    bootMessagesStream()
    bootParticipants()
    bootConversations()
    void usePrefs.getState().load()
  }, [])

  useEffect(() => {
    window.lingxiloop?.dock?.setUnreadDot(hasDockUnread)
  }, [hasDockUnread])

  useEffect(() => {
    return () => window.lingxiloop?.dock?.setUnreadDot(false)
  }, [])

  // Lazy-load messages when selected. The visible-range receipt path marks
  // only messages the user has actually seen.
  useEffect(() => {
    if (!convoId || !selectedConvoExists) return
    void useMessages.getState().loadConversation(convoId)
  }, [convoId, selectedConvoExists])

  useEffect(() => {
    if (uiCommand?.type === 'open-updater') setUpdaterOpen(true)
  }, [uiCommand])

  return (
    <>
      <Suspense fallback={<SurfaceFallback />}><DesktopApp /></Suspense>
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
  // Waitlist landing — handleCallback redirects here with `?waitlist=1`
  // when a brand-new OAuth visitor hit the gate. Consume the query marker
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
