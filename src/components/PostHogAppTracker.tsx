import { useEffect, useMemo } from 'react'
import { usePostHog } from 'posthog-js/react'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { getAnalyticsSurface, isPostHogConfigured } from '@/lib/observability'
import { isElectron, isNotificationWindow } from '@/lib/runtime'

function currentUrlForAnalytics(view: string): string {
  if (isElectron) return `cumora://${view}`
  if (typeof location === 'undefined') return `cumora://${view}`
  return `${location.pathname}${location.search}${location.hash}`
}

export function PostHogAppTracker() {
  const posthog = usePostHog()
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)
  const companyId = useAuth((s) => s.activeCompanyId)
  const view = useApp((s) => s.view)
  const mobileStack = useApp((s) => s.mobileStack)

  const surface = useMemo(() => getAnalyticsSurface(), [])
  const enabled = isPostHogConfigured() && !isNotificationWindow

  useEffect(() => {
    if (!enabled || !posthog) return
    if (user) {
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
      })
    } else if (ready) {
      posthog.reset()
    }
  }, [enabled, posthog, ready, user])

  useEffect(() => {
    if (!enabled || !posthog) return
    posthog.register({
      app_surface: surface,
      company_id: companyId ?? null,
    })
  }, [companyId, enabled, posthog, surface])

  useEffect(() => {
    if (!enabled || !posthog) return
    if (posthog.has_opted_out_capturing()) return

    posthog.capture('$pageview', {
      $current_url: currentUrlForAnalytics(view),
      app_surface: surface,
      app_view: view,
      mobile_stack: mobileStack,
      signed_in: Boolean(user),
      company_id: companyId ?? null,
    })
  }, [companyId, enabled, mobileStack, posthog, surface, user, view])

  return null
}
