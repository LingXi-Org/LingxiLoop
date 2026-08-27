/**
 * Shown to a brand-new OAuth visitor whose sign-in attempt landed
 * them on the waitlist instead of creating an account. Triggered by
 * the `?waitlist=1&email=...` query (or legacy `#waitlist=1&...`
 * fragment) that handleCallback redirects to. The signal is consumed
 * once and scrubbed so a reload doesn't stick the user on this page
 * forever — they can re-attempt sign-in normally.
 */
import { useState } from 'react'
import { GetDesktopAppLink } from '@/components/GetDesktopAppLink'
import './auth-state.css'

interface CarriedWaitlist { email: string | null }

export function consumeWaitlistFragment(): CarriedWaitlist | null {
  const search = new URLSearchParams(location.search)
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''))
  // Query string is the new shape (survives cross-origin redirects that
  // drop fragments); hash kept as a fallback for older server builds.
  const fromQuery = search.get('waitlist') === '1'
  const fromHash = hash.get('waitlist') === '1'
  if (!fromQuery && !fromHash) return null
  const email = (fromQuery ? search.get('email') : hash.get('email'))
  // Scrub both the waitlist params and any leftover hash so a refresh
  // lands the user back on the normal sign-in flow.
  if (fromQuery) {
    search.delete('waitlist')
    search.delete('email')
  }
  const q = search.toString()
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : ''))
  return { email }
}

export function WaitlistConfirmedScreen({ email }: { email: string | null }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) {
    // Falling out of the screen reloads → AuthGate decides what to render
    // next based on the (still-empty) auth store.
    location.reload()
    return null
  }
  return (
    <div className="lingxiloop-waitlist-screen">
      <div className="lingxiloop-waitlist-card">
        <div className="lingxiloop-waitlist-emoji">⏳</div>
        <div className="lingxiloop-waitlist-title">您在候补名单上</div>
        <div className="lingxiloop-waitlist-sub" style={{ marginBottom: 18 }}>
          我们保存了 <span className="lingxiloop-waitlist-email">{email ?? 'your email'}</span> 会让你知道
          当您的帐户准备就绪时。无需采取进一步行动。
        </div>
        <div style={{ marginBottom: 24, fontSize: 12.5, color: 'var(--ink-400)', fontStyle: 'italic' }}>
          想要抢占先机吗？ <GetDesktopAppLink variant="text" /> — 一旦获得批准，您只需在工作区中单击一下即可。
        </div>
        <button className="lingxiloop-auth-state-button" onClick={() => setDismissed(true)}>
          完成
        </button>
      </div>
    </div>
  )
}
