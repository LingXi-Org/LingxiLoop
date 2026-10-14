import type { ReactNode } from 'react'
import { isPostHogConfigured, getPostHogConfig, PostHogProvider } from '@/lib/observability'

export function ConditionalPostHogProvider({ children }: { children: ReactNode }) {
  if (!isPostHogConfigured()) {
    return <>{children}</>
  }

  const { apiKey, options } = getPostHogConfig()
  return (
    <PostHogProvider apiKey={apiKey} options={options}>
      {children}
    </PostHogProvider>
  )
}

