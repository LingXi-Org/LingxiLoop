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
import { api, getServerOrigin, setServerOrigin } from '@/api/client'
import { isElectron } from '@/lib/runtime'
import { isNativePlatform, runOAuth } from '@/lib/native'
import { useIsMobile } from '@/lib/utils'
import { CloudLogo } from './Avatar'
import { WindowDragStrip } from './WindowDragStrip'

interface ServerPreset { label: string; origin: string }
const PRESETS: ServerPreset[] = [
  { label: '生产环境', origin: 'https://api.cumora.ai' },
  { label: '本地开发', origin: 'http://localhost:5181' },
]

export function AuthScreen() {
  const [busy, setBusy] = useState<'lingxi' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const isMobile = useIsMobile()

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
    if (isElectron && window.cumora?.auth) {
      // Open the user's real browser (Safari / Chrome) so they see the
      // provider's authentic URL bar and so Google's embedded-webview
      // bans don't bite us. We pass `?return=http://127.0.0.1:47823/auth/done`
      // — the loopback HTTP server in main.cjs serves a styled
      // "Signed in" page that POSTs the fragment back to the main
      // process, which IPCs the renderer (see AuthGate's onToken).
      const origin = getServerOrigin() || 'https://api.cumora.ai'
      // Arm a single-use nonce and thread it through the return URL. The server
      // round-trips it back onto /auth/done, the loopback page carries it into
      // the cumora:// deep link, and main accepts the token only if the nonce
      // matches — so a drive-by deep link the app never initiated is rejected
      // (anti session-fixation). arm() is Electron-only.
      const auth = window.cumora.auth
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
    if (isNativePlatform()) {
      // iOS / Android: run the OAuth flow inside ASWebAuthenticationSession
      // (our WebAuthPlugin). It hands the final cumora://auth#... callback
      // straight back to us — no SFSafariViewController, no broken 302
      // redirect to a custom URL scheme.
      const origin = getServerOrigin() || 'https://api.cumora.ai'
      const ret = encodeURIComponent('cumora://auth')
      void (async () => {
        try {
          const callbackUrl = await runOAuth({
            url: `${origin}/api/auth/start/${provider}?return=${ret}`,
            callbackScheme: 'cumora',
          })
          if (!callbackUrl) {
            // User cancelled — re-enable the button.
            setBusy(null)
            return
          }
          // ASWebAuthenticationSession delivers the final URL with the
          // token fragment. Plant it as our `location.hash` so AuthGate's
          // existing fragment-consumption logic picks it up.
          const u = new URL(callbackUrl)
          const hash = u.hash || (u.search ? `#${u.search.replace(/^\?/, '')}` : '')
          if (!hash) {
            setErr('登录已完成，但未返回登录凭证。')
            setBusy(null)
            return
          }
          history.replaceState(null, '', location.pathname + location.search + hash)
          window.dispatchEvent(new CustomEvent('cumora:oauth-token', { detail: hash }))
        } catch (err) {
          setErr(err instanceof Error ? err.message : '登录失败')
          setBusy(null)
        }
      })()
      return
    }
    // Browser fallback — full-page nav, fragment-on-redirect handled by
    // AuthGate on next mount. Pass the *current* page as `?return=` so
    // a user signing in from admin.cumora.ai lands back on
    // admin.cumora.ai (not the server's default app.cumora.ai). The
    // origin must be in CUMORA_AUTH_RETURN_ALLOWLIST or the server
    // will reject it.
    const ret = encodeURIComponent(`${location.origin}${location.pathname}`)
    location.assign(`${api.authStartUrl(provider)}?return=${ret}`)
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
        <div className="text-[11px] text-ink-300 text-center font-display italic">
          我们仅使用第三方账号验证你的身份，不会代你发布内容，也不会索取额外权限。
        </div>
        {!isMobile && <ServerSwitch open={picker} onToggle={() => setPicker((v) => !v)} />}
      </div>
    </div>
  )
}
/** Currently-active server origin in human-readable form. Mirrors what
 *  api.client computed at module init. */
function currentOriginLabel(): string {
  const origin = getServerOrigin()
  if (!origin) return '同源（Vite 代理 / 静态部署）'
  const match = PRESETS.find((p) => p.origin === origin)
  return match ? `${match.label} · ${origin}` : origin
}

function ServerSwitch({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [custom, setCustom] = useState('')
  const current = getServerOrigin()

  function apply(origin: string | null) {
    setServerOrigin(origin)
    // Hard reload — module-init-time SERVER_ORIGIN is now stale, and any
    // pending fetch against the old origin would race confusingly.
    location.reload()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="text-[11px] text-ink-300 hover:text-ink-500 transition-colors font-display"
      >
        API 服务器：<span className="underline decoration-dotted">{currentOriginLabel()}</span>
      </button>
    )
  }
  return (
    <div className="w-full border border-ink-200 rounded-[10px] p-3 bg-cloud flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-display text-ink-700">API 服务器</div>
        <button type="button" onClick={onToggle} className="text-[11px] text-ink-300 hover:text-ink-500">关闭</button>
      </div>
      {PRESETS.map((p) => (
        <button
          key={p.origin}
          type="button"
          onClick={() => apply(p.origin)}
          className={`text-left h-9 px-2 rounded-[6px] text-[12px] flex items-center justify-between hover:bg-cloud transition-colors ${current === p.origin ? 'bg-cloud' : ''}`}
        >
          <span className="font-display text-ink-800">{p.label}</span>
          <span className="text-[10px] text-ink-400">{p.origin}</span>
        </button>
      ))}
      <div className="flex items-stretch gap-2 pt-1">
        <input
          type="url"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="https://你的服务器"
          className="flex-1 h-9 px-2 rounded-[6px] border border-ink-200 bg-paper text-ink-900 text-[12px] placeholder:text-ink-300 focus:outline-none focus:border-ink-400"
        />
        <button
          type="button"
          disabled={!custom.trim()}
          onClick={() => apply(custom.trim())}
          className="h-9 px-3 rounded-[6px] bg-ink-800 text-white text-[12px] disabled:opacity-40"
        >
          使用
        </button>
      </div>
      {current && (
        <button
          type="button"
          onClick={() => apply(null)}
          className="text-[11px] text-ink-400 hover:text-ink-600 self-start"
        >
          清除自定义配置（使用构建默认值）
        </button>
      )}
    </div>
  )
}
