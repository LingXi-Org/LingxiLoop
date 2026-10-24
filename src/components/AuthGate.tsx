import { useEffect, useState, type ReactNode } from 'react'
import { authApi, authClient } from '@/auth/api'
import { synchronizeProductSession } from '@/auth/session-sync'
import { useAuth } from '@/stores/auth'
import { AuthScreen } from './AuthScreen'
import { WorkspaceSkeleton } from './WorkspaceSkeleton'

export function AuthGate({ children, unauthFallback }: { children: ReactNode; unauthFallback?: ReactNode }) {
  // Better Auth owns cross-tab storage, visibility and online refresh. No polling.
  const session = authClient.useSession()
  const key = session.data ? JSON.stringify([session.data.user.id, session.data.session.id]) : null
  const authenticated = useAuth(state => state.authenticated)
  const acceptedKey = useAuth(state => state.sessionKey)
  const [failure, setFailure] = useState<{ key: string | null; message: string } | null>(null)

  useEffect(() => {
    if (session.isPending || session.isRefetching || session.error) return
    setFailure(null)
    return synchronizeProductSession(key, {
      currentKey: () => useAuth.getState().sessionKey,
      read: signal => authApi.me(signal),
      clear: () => useAuth.getState().clear(),
      accept: (me, sessionKey) => useAuth.getState().acceptSession(me, sessionKey),
      failed: () => setFailure({ key, message: '暂时无法确认登录状态，请重试。' }),
    })
  }, [key, session.isPending, session.isRefetching, session.error])

  if (session.error || (failure?.key === key && !session.isRefetching)) return (
    <main className="grid min-h-svh place-content-center gap-4 p-6">
      <p role="alert">{failure?.message ?? '暂时无法确认登录状态，请重试。'}</p>
      <button type="button" className="underline underline-offset-4" onClick={() => void session.refetch()}>重试</button>
    </main>
  )
  if (session.isPending) return <WorkspaceSkeleton />
  if (!key) return <>{unauthFallback ?? <AuthScreen />}</>
  if (!authenticated || acceptedKey !== key) return <WorkspaceSkeleton />
  return <>{children}</>
}
