/**
 * WebShell — the optional handoff-only surface for an operator-selected
 * public `app.*` hostname. The primary production origin uses the full Web UI;
 * this alternate client is intentionally minimal, so
 * the web client is intentionally minimal: it can sign a user in via
 * OAuth, surface the waitlist verdict, and hand the session off to the
 * desktop app via the `lingxiloop://` deep link. Nothing else — no chat,
 * no admin, no in-browser fallback.
 *
 * App.tsx routes here when `isWebAppHost` is true. Authenticated visitors
 * see <WebHandoff> (auto-fires the deep link); unauthenticated visitors
 * see <WebLanding> (Google / GitHub sign-in + an "I already have the
 * app" CTA). Approved-entry links from the welcome email can also expose
 * the desktop download fallback even while the public waitlist gate is on.
 */
import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { AuthGate } from '@/components/AuthGate'
import { CloudLogo } from '@/components/Avatar'
import { GetDesktopAppLink } from '@/components/GetDesktopAppLink'

function tryDeepLink(url: string) {
  // Same-tab nav triggers the OS protocol handler when registered. If the
  // scheme isn't registered the browser silently does nothing (no "site
  // can't be reached" page), which is the desired UX — the user just
  // stays on this page and clicks Download.
  try { location.href = url } catch { /* swallow */ }
}

function buildAuthDeepLink(token: string, companyId: string | null): string {
  const frag = new URLSearchParams()
  frag.set('token', token)
  if (companyId) frag.set('companyId', companyId)
  return `lingxiloop://auth#${frag.toString()}`
}

export function WebShell() {
  return (
    <AuthGate unauthFallback={<WebLanding />}>
      <WebHandoff />
    </AuthGate>
  )
}

/** Signed-in handoff screen. Auto-fires the lingxiloop:// deep link once on
 *  mount; the manual button is a re-arm in case the browser swallowed
 *  the first attempt (e.g. user was tabbed away). */
function WebHandoff() {
  const token = useAuth((s) => s.token)
  const companyId = useAuth((s) => s.activeCompanyId)
  const clear = useAuth((s) => s.clear)

  useEffect(() => {
    if (!token) return
    tryDeepLink(buildAuthDeepLink(token, companyId))
  }, [token, companyId])

  const openApp = () => {
    if (!token) return
    tryDeepLink(buildAuthDeepLink(token, companyId))
  }

  const signOut = async () => {
    try { await api.authLogout() } catch { /* swallow */ }
    clear()
  }

  return (
    <div
      className="fixed inset-0 grid place-items-center"
      style={{ background: 'var(--paper)' }}
    >
      <div className="w-[360px] flex flex-col items-center gap-7 text-center">
        <CloudLogo size={64} rounded />
        <div className="space-y-1">
          <div className="font-display text-[22px] text-ink-900">您已登录</div>
          <div className="font-display italic text-[13px] text-ink-400">
            在桌面上打开 LingxiLoop...
          </div>
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={openApp}
            className="w-full py-3 rounded-[12px] text-[14px] font-semibold text-white transition"
            style={{
              background: 'var(--skype)',
              boxShadow: '0 6px 16px -4px rgba(0, 168, 240, 0.5)',
            }}
          >在 LingxiLoop 桌面端打开</button>
          <GetDesktopAppLink variant="button-secondary" />
          <button
            onClick={() => void signOut()}
            className="text-[12px] text-ink-400 hover:text-ink-700 transition font-display italic mt-1"
          >退出登录</button>
        </div>
        <div className="text-[11px] text-ink-300 font-display italic">
          LingxiLoop 可在您的浏览器中找到。
        </div>
      </div>
    </div>
  )
}
/** Unauthenticated landing. Sign-in kicks the standard OAuth round-trip;
 *  the result lands back here either as a signed-in session (→ Handoff),
 *  as a waitlist verdict (→ WaitlistConfirmedScreen, handled in App.tsx),
 *  or as a suspended verdict (→ SuspendedScreen, also App.tsx). */
function WebLanding() {
  const [busy, setBusy] = useState<'lingxi' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const approvedEntry = new URLSearchParams(location.search).has('approved')

  useEffect(() => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''))
    const error = params.get('error')
    if (error) setErr(decodeURIComponent(error))
  }, [])

  const go = () => {
    setBusy('lingxi'); setErr(null)
    const returnUrl = `${location.origin}${location.pathname}`
    location.assign(api.authStartUrl('lingxi', { returnUrl }))
  }

  return (
    <div
      className="fixed inset-0 grid place-items-center"
      style={{ background: 'var(--paper)' }}
    >
      <div className="w-[360px] flex flex-col items-center gap-7">
        <CloudLogo size={64} rounded />
        <div className="text-center space-y-1">
          <div className="font-display text-[22px] text-ink-900">在网页中使用 LingxiLoop</div>
          <div className="font-display italic text-[13px] text-ink-400">
            登录以进入您的工作区
          </div>
        </div>
        <div className="w-full flex flex-col gap-3">
          <button
            type="button"
            onClick={go}
            disabled={busy !== null}
            className="auth-provider-button auth-provider-lingxi h-11 rounded-[10px] transition-colors flex items-center justify-center gap-3 text-[14px] font-semibold disabled:opacity-60"
          >
            {busy === 'lingxi' ? '正在跳转…' : '使用 LingxiIdentity 继续'}
          </button>
        </div>
        {err && (
          <div className="text-[12px] text-red-600 text-center max-w-full break-words">
            {err}
          </div>
        )}
        <div className="w-full flex items-center gap-3 text-[11px] text-ink-300 font-display italic">
          <div className="flex-1 h-px bg-ink-100" />
          或
          <div className="flex-1 h-px bg-ink-100" />
        </div>
        <div className="w-full flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => tryDeepLink('lingxiloop://open')}
            className="w-full py-3 rounded-[12px] text-[14px] font-semibold text-ink-700 transition"
            style={{ background: 'var(--cloud)', border: '1px solid var(--ink-100)' }}
          >在 LingxiLoop 桌面端打开</button>
          <GetDesktopAppLink
            variant="button-secondary"
            gateBypass={approvedEntry}
            className="w-full py-2.5 rounded-[12px] text-[12.5px] font-semibold text-ink-500 transition text-center hover:text-ink-700"
            style={{}}
          />
        </div>
        <div className="text-[11px] text-ink-300 text-center font-display italic">
          我们仅使用第三方账号验证你的身份，不会代你发布内容，也不会索取额外权限。
        </div>
      </div>
    </div>
  )
}
