import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import type { PostHogConfig, PostHogInterface } from 'posthog-js'
import { isElectron, isNotificationWindow, isWebAppHost } from '@/lib/runtime'

async function getAppVersion(): Promise<string> {
  try {
    if (window.cumora?.update) {
      const info = await window.cumora.update.getAppInfo()
      if (info.version) return info.version
    }
  } catch {
    // Browser/PWA mode has no native app version bridge.
  }
  return 'web'
}

export function getAnalyticsSurface(): 'electron' | 'web' | 'admin' | 'notification' | 'browser' {
  if (isNotificationWindow) return 'notification'
  if (isElectron) return 'electron'
  if (typeof location !== 'undefined' && location.hostname.startsWith('admin.')) return 'admin'
  if (typeof location !== 'undefined' && location.pathname.startsWith('/admin')) return 'admin'
  if (isWebAppHost) return 'web'
  return 'browser'
}

export async function initObservability(): Promise<void> {
  // Keep an Alma-compatible init seam. PostHog itself is initialized by
  // PostHogProvider so telemetry never starts unless the provider mounts.
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
      loaded: (posthogInstance: PostHogInterface) => {
        void getAppVersion().then((version) => {
          posthogInstance.register({
            app_version: version,
            app_surface: getAnalyticsSurface(),
          })
        })
      },
    },
  }
}
