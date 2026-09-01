import { lazy, Suspense, useEffect } from 'react'
import { AuthGate } from '@/components/AuthGate'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { NotificationToasts } from '@/components/NotificationToasts'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { bootConversations, isMuted, useConversations } from '@/features/conversations/store'
import { chatTransport } from '@/features/chat/runtime'
import { bootParticipants } from '@/features/agents/state'
import { useWorkspace } from '@/features/knowledge/workspace'
import { usePrefs } from '@/stores/preferences'

const DesktopApp = lazy(() => import('@/desktop/DesktopApp').then((module) => ({ default: module.DesktopApp })))

function SurfaceFallback() {
  return <div className="fixed inset-0 grid place-items-center bg-background text-sm text-muted-foreground">正在打开 LingxiLoop…</div>
}

function AuthedApp() {
  const convoId = useApp((s) => s.selectedConversationId)
  const hasDockUnread = useConversations((s) =>
    s.list.some((c) => !isMuted(c) && (c.unread ?? 0) > 0),
  )
  const selectedConvoExists = useConversations((s) =>
    convoId ? s.list.some((c) => c.id === convoId) : false,
  )
  useEffect(() => {
    let disposed = false
    void (async () => {
      // IM conversations are project-scoped. Establish the authoritative
      // general-project selection before any IM request can be issued for a
      // new browser session or after an account/company switch.
      await useWorkspace.getState().load()
      if (disposed) return
      chatTransport.boot()
      bootParticipants()
      bootConversations()
    })()
    void usePrefs.getState().load()
    return () => { disposed = true }
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
      <Suspense fallback={<SurfaceFallback />}><DesktopApp /></Suspense>
      {/* In-app message toasts (window-blur / different-convo only) —
          rendered at the AuthedApp level so they share auth context and
          unmount cleanly on sign-out. */}
      <NotificationToasts />
    </TooltipProvider>
  )
}

export function App() {
  // Force AuthedApp to remount when the user logs in/out OR switches between
  // companies — every store keys off the active tenant, so a clean remount is
  // the simplest way to reload all data without stale rows leaking across.
  const userId = useAuth((s) => s.user?.id ?? null)
  const companyId = useAuth((s) => s.activeCompanyId)

  return (
    <AuthGate>
      <ErrorBoundary>
        <AuthedApp key={`${userId ?? 'anon'}::${companyId ?? 'none'}`} />
      </ErrorBoundary>
    </AuthGate>
  )
}
