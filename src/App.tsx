import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { AuthGate } from '@/components/AuthGate'
import { WorkspaceSkeleton } from '@/components/WorkspaceSkeleton'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { NotificationToasts } from '@/components/NotificationToasts'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { isMuted, useConversations } from '@/features/conversations/store'
import { chatTransport } from '@/features/chat/runtime'
import { startWebNavigation } from '@/lib/navigation'
import { usePrefs } from '@/stores/preferences'
import { consumeInviteFromUrl, InviteAcceptScreen } from '@/features/companies/components/InviteAcceptScreen'

const DesktopApp = lazy(() => import('@/desktop/DesktopApp').then((module) => ({ default: module.DesktopApp })))

function AuthedApp() {
  const convoId = useApp((s) => s.selectedConversationId)
  const navigationReady = useApp((s) => s.navigationReady)
  const hasDockUnread = useConversations((s) =>
    s.list.some((c) => !isMuted(c) && (c.unread ?? 0) > 0),
  )
  const selectedConvoExists = useConversations((s) =>
    convoId ? s.list.some((c) => c.id === convoId) : false,
  )
  useEffect(() => {
    const stopNavigation = startWebNavigation()
    void usePrefs.getState().load()
    return stopNavigation
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
    void chatTransport.loadConversation(convoId)
  }, [convoId, selectedConvoExists])

  return (
    <TooltipProvider delayDuration={120}>
      <Suspense fallback={<WorkspaceSkeleton />}>{navigationReady ? <DesktopApp /> : <WorkspaceSkeleton />}</Suspense>
      {/* In-app message toasts (window-blur / different-convo only) —
          rendered at the AuthedApp level so they share auth context and
          unmount cleanly on sign-out. */}
      <NotificationToasts />
    </TooltipProvider>
  )
}

export function App() {
  const [invitation, setInvitation] = useState(consumeInviteFromUrl)
  const finishInvitation = useCallback(() => {
    invitation?.clear()
    setInvitation(null)
  }, [invitation])
  const invitationScreen = invitation
    ? <InviteAcceptScreen token={invitation.token} onDone={finishInvitation} />
    : null
  // Force AuthedApp to remount when the user logs in/out OR switches between
  // companies — every store keys off the active tenant, so a clean remount is
  // the simplest way to reload all data without stale rows leaking across.
  const userId = useAuth((s) => s.user?.id ?? null)
  const companyId = useAuth((s) => s.activeCompanyId)

  return (
    <AuthGate unauthFallback={invitationScreen}>
      <ErrorBoundary>
        {invitationScreen ?? <AuthedApp key={`${userId ?? 'anon'}::${companyId ?? 'none'}`} />}
      </ErrorBoundary>
    </AuthGate>
  )
}
