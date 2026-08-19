/**
 * Single source of truth for "Get the desktop app" links rendered by the
 * web SPA. Every surface that wants to offer Download should use this
 * component instead of hand-rolling an <a> — that way the URL, the UA
 * detection, the gate-bypass flag, and the wording stay in lockstep
 * across the app.
 *
 * Installers are published by the signed desktop GitHub Release workflow.
 */
import type { CSSProperties } from 'react'

const DOWNLOAD_URL_BYPASS = 'https://github.com/LingXi-Org/LingxiLoop/releases/latest'
const DOWNLOAD_URL_GATED = DOWNLOAD_URL_BYPASS

export type GetDesktopAppLinkVariant = 'button-primary' | 'button-secondary' | 'text'

interface Props {
  variant: GetDesktopAppLinkVariant
  /** Override the auto-detected label. Pass when the surrounding copy
   *  already implies "download" so this CTA can read "Get the app" etc. */
  label?: string
  /** Skip the marketing-site waitlist gate. Default true — most callers
   *  already represent a viewer with some claim to the product. Set
   *  false on screens that don't (e.g. anonymous WebLanding). */
  gateBypass?: boolean
  className?: string
  style?: CSSProperties
}

function detectLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/Mac OS X|Macintosh/i.test(ua)) return 'Download for macOS'
  if (/Windows/i.test(ua)) return 'Download for Windows'
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'Download for Linux'
  return 'Download LingxiLoop'
}

interface VariantDefaults {
  className: string
  style: CSSProperties | undefined
}

const VARIANT_DEFAULTS: Record<GetDesktopAppLinkVariant, VariantDefaults> = {
  'button-primary': {
    className: 'w-full py-3 rounded-[12px] text-[14px] font-semibold text-white transition text-center',
    style: {
      background: 'var(--skype)',
      boxShadow: '0 6px 16px -4px rgba(0, 168, 240, 0.5)',
    },
  },
  'button-secondary': {
    className: 'w-full py-3 rounded-[12px] text-[14px] font-semibold text-ink-700 transition text-center',
    style: { background: 'var(--cloud)', border: '1px solid var(--ink-100)' },
  },
  text: {
    className: 'text-[12px] text-ink-400 hover:text-ink-700 transition font-display italic underline-offset-2 hover:underline',
    style: undefined,
  },
}

export function GetDesktopAppLink({ variant, label, gateBypass = true, className, style }: Props) {
  const text = label ?? detectLabel()
  const href = gateBypass ? DOWNLOAD_URL_BYPASS : DOWNLOAD_URL_GATED
  const defaults = VARIANT_DEFAULTS[variant]
  // Overrides REPLACE defaults rather than merging — passing a className
  // means "I want a completely different look for this surface". Pass
  // `style={{}}` to opt out of the variant's default style block
  // without supplying replacement style rules.
  return (
    <a
      href={href}
      className={className ?? defaults.className}
      style={style ?? defaults.style}
    >{text}</a>
  )
}
