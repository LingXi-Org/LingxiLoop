import type { ReactNode } from 'react'
import { isPostHogConfigured, getPostHogConfig, PostHogProvider } from '@/lib/observability'
import { isNotificationWindow } from '@/lib/runtime'

export function ConditionalPostHogProvider({ children }: { children: ReactNode }) {
  if (!isPostHogConfigured() || isNotificationWindow) {
    return <>{children}</>
  }

  const { apiKey, options } = getPostHogConfig()
  return (
    <PostHogProvider apiKey={apiKey} options={options}>
      {children}
    </PostHogProvider>
  )
}

