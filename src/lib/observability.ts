import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import type { PostHogConfig } from 'posthog-js'
import { isElectron, isNotificationWindow, isWebAppHost } from '@/lib/runtime'

export function getAnalyticsSurface(): 'electron' | 'web' | 'notification' | 'browser' {
  if (isNotificationWindow) return 'notification'
  if (isElectron) return 'electron'
  if (isWebAppHost) return 'web'
  return 'browser'
}

export { posthog, PHProvider as PostHogProvider }

export function isPostHogConfigured(): boolean {
  return !!import.meta.env.VITE_PUBLIC_POSTHOG_KEY
}

export function getPostHogConfig(): { apiKey: string; options: Partial<PostHogConfig> } {
  return {
    apiKey: import.meta.env.VITE_PUBLIC_POSTHOG_KEY || '',
    options: {
      api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: false,
      persistence: 'localStorage' as const,
      loaded: (posthogInstance) => posthogInstance.register({ app_surface: getAnalyticsSurface() }),
    },
  }
}
