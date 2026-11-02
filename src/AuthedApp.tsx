import { lazy, Suspense, useEffect } from 'react'
import { WorkspaceSkeleton } from '@/components/WorkspaceSkeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useApp } from '@/stores/app'
import { useConversations } from '@/features/conversations/store'
import { chatTransport } from '@/features/chat/runtime/transport'
import { startWebNavigation } from '@/lib/navigation'
import { readWebDestination } from '@/lib/webNavigation'
import { usePrefs } from '@/stores/preferences'
import { useLearningSpaces } from '@/desktop/useLearningSpaces'

const DesktopApp = lazy(() => import('@/desktop/DesktopApp').then((module) => ({ default: module.DesktopApp })))

export function AuthedApp() {
  const learningSpaces = useLearningSpaces()
  const convoId = useApp((s) => s.selectedConversationId)
  const navigationReady = useApp((s) => s.navigationReady)
  const selectedConvoExists = useConversations((s) =>
    convoId ? s.list.some((c) => c.id === convoId) : false,
  )
  useEffect(() => {
    // Fetch the UI alongside authorized navigation; mounting still waits for it.
    void import('@/desktop/DesktopApp').catch(() => {})
    if (readWebDestination().view === 'conversations') void import('@/desktop/ChatPane').catch(() => {})
    const stopNavigation = startWebNavigation()
    void usePrefs.getState().load()
    return stopNavigation
  }, [])

  // Lazy-load messages when selected. The visible-range receipt path marks
  // only messages the user has actually seen.
  useEffect(() => {
    if (!convoId || !selectedConvoExists) return
    void chatTransport.loadConversation(convoId)
    return () => chatTransport.cancelConversationLoad(convoId)
  }, [convoId, selectedConvoExists])

  return (
    <TooltipProvider delayDuration={120}>
      <Suspense fallback={<WorkspaceSkeleton />}>{navigationReady ? <DesktopApp learningSpaces={learningSpaces} /> : <WorkspaceSkeleton />}</Suspense>
      {/* Mounted inside the auth boundary so notifications unmount on sign-out. */}
    </TooltipProvider>
  )
}
