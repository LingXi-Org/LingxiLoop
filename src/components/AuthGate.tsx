import { useEffect, useState, type ReactNode } from 'react'
import { authApi, authClient } from '@/auth/api'
import { synchronizeProductSession } from '@/auth/session-sync'
import { useAuth } from '@/stores/auth'
import { ApiError } from '@/api/core/http'
import { AuthScreen } from './AuthScreen'
import { WorkspaceSkeleton } from './WorkspaceSkeleton'

export function AuthGate({ children, unauthFallback }: { children: ReactNode; unauthFallback?: ReactNode }) {
  // Better Auth owns cross-tab storage, visibility and online refresh. No polling.
  const session = authClient.useSession()
  const key = session.data ? JSON.stringify([session.data.user.id, session.data.session.id]) : null
  const authenticated = useAuth(state => state.authenticated)
  const acceptedKey = useAuth(state => state.sessionKey)
  const revalidationRequired = useAuth(state => state.sessionRevalidationRequired)
  const [failure, setFailure] = useState<{ key: string | null; message: string } | null>(null)

  useEffect(() => {
    if (revalidationRequired) void session.refetch()
  }, [revalidationRequired, session.refetch])

  useEffect(() => {
    if (session.error) { setFailure({ key, message: '暂时无法确认登录状态，请重试。' }); return }
    if (session.isPending || session.isRefetching) return
    if (!key) setFailure(null)
    return synchronizeProductSession(key, {
      currentKey: () => useAuth.getState().sessionKey,
      currentEpoch: () => useAuth.getState().authorizationEpoch,
      read: signal => authApi.me(signal),
      clear: () => useAuth.getState().clear(),
      accept: (me, sessionKey) => {
        useAuth.getState().acceptSession(me, sessionKey)
        setFailure(null)
      },
      failed: error => {
        if (error instanceof ApiError && error.status === 401) useAuth.getState().clear()
        setFailure({ key, message: '暂时无法确认登录状态，请重试。' })
      },
    })
  // Observe the official snapshot itself: a fast same-key refresh may settle
  // before React renders its intermediate isRefetching=true state.
  }, [key, session])

  if (session.error || failure?.key === key) return (
    <main className="grid min-h-svh place-content-center gap-4 p-6">
      <p role="alert">{failure?.message ?? '暂时无法确认登录状态，请重试。'}</p>
      <button type="button" className="underline underline-offset-4" disabled={session.isRefetching} onClick={() => void session.refetch()}>重试</button>
    </main>
  )
  if (session.isPending) return <WorkspaceSkeleton />
  if (!key) return <>{unauthFallback ?? <AuthScreen />}</>
  if (!authenticated || acceptedKey !== key) return <WorkspaceSkeleton />
  return <>{children}</>
}
