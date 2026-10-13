import { lazy, Suspense, useCallback, useState } from 'react'
import { AuthGate } from '@/components/AuthGate'
import { WorkspaceSkeleton } from '@/components/WorkspaceSkeleton'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuth } from '@/stores/auth'
import { consumeInviteFromUrl, InviteAcceptScreen } from '@/features/companies/components/InviteAcceptScreen'

const AuthedApp = lazy(() => import('./AuthedApp').then((module) => ({ default: module.AuthedApp })))

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
        <Suspense fallback={<WorkspaceSkeleton />}>
          {invitationScreen ?? <AuthedApp key={`${userId ?? 'anon'}::${companyId ?? 'none'}`} />}
        </Suspense>
      </ErrorBoundary>
    </AuthGate>
  )
}
