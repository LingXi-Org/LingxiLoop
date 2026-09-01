import { useEffect, type ReactNode } from 'react'
import { authApi } from '@/auth/api'
import { useAuth } from '@/stores/auth'
import { AuthScreen } from './AuthScreen'
import { WindowDragStrip } from './WindowDragStrip'

export function AuthGate({ children, unauthFallback }: { children: ReactNode; unauthFallback?: ReactNode }) {
  const authenticated = useAuth((state) => state.authenticated)
  const ready = useAuth((state) => state.ready)
  const setAuthenticated = useAuth((state) => state.setAuthenticated)
  const setMe = useAuth((state) => state.setMe)
  const setServerCapabilities = useAuth((state) => state.setServerCapabilities)
  const clear = useAuth((state) => state.clear)
  const markReady = useAuth((state) => state.markReady)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const session = await authApi.session()
        if (!session.data) { if (!cancelled) markReady(); return }
        const me = await authApi.me()
        if (cancelled) return
        setAuthenticated(me.user, me.activeCompanyId)
        setMe(me.user, me.companies, me.activeCompanyId)
        setServerCapabilities(me.serverCapabilities)
      } catch {
        if (!cancelled) clear()
      }
    })()
    return () => { cancelled = true }
  }, [clear, markReady, setAuthenticated, setMe, setServerCapabilities])

  if (!ready) return <div className="fixed inset-0 grid place-items-center text-ink-300"><WindowDragStrip />加载中...</div>
  if (!authenticated) return <>{unauthFallback ?? <AuthScreen />}</>
  return <>{children}</>
}
