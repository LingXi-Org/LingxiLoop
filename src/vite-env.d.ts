/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LINGXILOOP_DEV_API_TARGET?: string
  readonly VITE_PUBLIC_POSTHOG_KEY?: string
  readonly VITE_PUBLIC_POSTHOG_HOST?: string
  readonly VITE_MOBILE_UPLOAD_SMOKE?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
