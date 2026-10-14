import { lazy, Suspense, useEffect } from 'react'
import { WorkspaceSkeleton } from '@/components/WorkspaceSkeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useApp } from '@/stores/app'
import { isMuted, useConversations } from '@/features/conversations/store'
import { chatTransport } from '@/features/chat/runtime'
import { startWebNavigation } from '@/lib/navigation'
import { usePrefs } from '@/stores/preferences'

const DesktopApp = lazy(() => import('@/desktop/DesktopApp').then((module) => ({ default: module.DesktopApp })))

export function AuthedApp() {
  const convoId = useApp((s) => s.selectedConversationId)
  const navigationReady = useApp((s) => s.navigationReady)
  const hasDockUnread = useConversations((s) =>
    s.list.some((c) => !isMuted(c) && (c.unread ?? 0) > 0),
  )
  const selectedConvoExists = useConversations((s) =>
    convoId ? s.list.some((c) => c.id === convoId) : false,
  )
  useEffect(() => {
    // Fetch the UI alongside authorized navigation; mounting still waits for it.
    void import('@/desktop/DesktopApp').catch(() => {})
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
      {/* Mounted inside the auth boundary so notifications unmount on sign-out. */}
    </TooltipProvider>
  )
}
