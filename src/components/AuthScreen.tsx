import { platformApi } from '@/api/platform'
import { getServerOrigin } from '@/api/core/http'
/**
 * Sign-in screen — OAuth only (Google + GitHub). No password forms, no
 * signup, no forgot. Provider buttons trigger a full-page redirect to
 * /api/auth/start/<provider> on the configured server origin (relative
 * URL goes through the Vite proxy in dev; baked-in absolute URL in
 * packaged builds). The provider returns to /auth/done with a fragment
 * the AuthGate consumes on next mount.
 *
 * Server switcher: dev iteration constantly toggles between Local Dev
 * and Production; we surface that here (not buried in devtools) because
 * picking the server is a sign-in-time decision — the auth token is
 * per-server.
 */
import { useState, useEffect } from 'react'
import { isElectron } from '@/lib/runtime'
import { CloudLogo } from './Avatar'
import { WindowDragStrip } from './WindowDragStrip'

export function AuthScreen() {
  const [busy, setBusy] = useState<'lingxi' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // AuthGate strips a successful fragment after consuming it. A failure
  // fragment looks like `#token=&companyId=&error=...` — surface that
  // so the user knows the previous attempt didn't take.
  useEffect(() => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''))
    const error = params.get('error')
    if (error) setErr(decodeURIComponent(error))
  }, [])

  // Re-arm the sign-in buttons when the user returns to this window after
  // abandoning the OAuth tab. Without this, the Electron renderer stays
  // mounted with busy=provider after openExternal — both buttons disabled
  // forever, no way to retry. Three signals cover the cases:
  //   - window focus: user clicked back into the Electron window.
  //   - visibilitychange → visible: tab/window came back from hidden.
  //   - 90s safety timer: focus events occasionally miss (e.g. user
  //     never clicked away from the Electron window because the OAuth
  //     tab opened in the background).
  // The browser-flow case (location.assign) is unaffected — full-page
  // nav unmounts this component before any listener can fire.
  useEffect(() => {
    if (busy === null) return
    const reset = () => setBusy(null)
    const onVisibility = () => { if (document.visibilityState === 'visible') reset() }
    window.addEventListener('focus', reset)
    document.addEventListener('visibilitychange', onVisibility)
    const safety = window.setTimeout(reset, 90_000)
    return () => {
      window.removeEventListener('focus', reset)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(safety)
    }
  }, [busy])

  function go(provider: 'lingxi') {
    setBusy(provider); setErr(null)
    if (isElectron && window.lingxiloop?.auth) {
      // Open the user's real browser (Safari / Chrome) so they see the
      // provider's authentic URL bar and so Google's embedded-webview
      // bans don't bite us. We pass `?return=http://127.0.0.1:47823/auth/done`
      // — the loopback HTTP server in main.cjs serves a styled
      // "Signed in" page that POSTs the fragment back to the main
      // process, which IPCs the renderer (see AuthGate's onToken).
      const origin = getServerOrigin()
      if (!origin) {
        setErr('此桌面端构建尚未配置 LingxiLoop 服务器。')
        setBusy(null)
        return
      }
      // Arm a single-use nonce and thread it through the return URL. The server
      // round-trips it back onto /auth/done, the loopback page carries it into
      // the lingxiloop:// deep link, and main accepts the token only if the nonce
      // matches — so a drive-by deep link the app never initiated is rejected
      // (anti session-fixation). arm() is Electron-only.
      const auth = window.lingxiloop.auth
      void (async () => {
        let ret = 'http://127.0.0.1:47823/auth/done'
        try {
          const nonce = await auth.arm?.()
          if (nonce) ret += `?n=${encodeURIComponent(nonce)}`
        } catch { /* no arm available → fall through unarmed; token will be rejected, user retries */ }
        void auth.openExternal(
          `${origin}/api/auth/start/${provider}?return=${encodeURIComponent(ret)}`,
        )
      })()
      return
    }
    // Browser fallback — full-page nav, fragment-on-redirect handled by
    // AuthGate on next mount. Pass the *current* page as `?return=` so
    // a user signing in from the admin origin lands back there rather than
    // the server's default app origin. The origin must be in
    // LINGXILOOP_AUTH_RETURN_ALLOWLIST or the server
    // will reject it.
    const ret = encodeURIComponent(`${location.origin}${location.pathname}`)
    location.assign(`${platformApi.authStartUrl(provider)}?return=${ret}`)
  }

  return (
    <div
      className="fixed inset-0 grid place-items-center"
      style={{ background: 'var(--paper)' }}
    >
      <WindowDragStrip />
      <div className="w-[320px] flex flex-col items-center gap-8">
        <CloudLogo size={64} rounded />
        <div className="text-center">
          <div className="font-display text-[22px] text-ink-900">欢迎使用LingxiLoop</div>
          <div className="font-display italic text-[13px] text-ink-400 mt-1">
            登录后继续
          </div>
        </div>
        <div className="w-full flex flex-col gap-3">
          <button
            type="button"
            onClick={() => go('lingxi')}
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
      </div>
    </div>
  )
}
