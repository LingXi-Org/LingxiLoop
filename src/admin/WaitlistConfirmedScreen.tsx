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
    <div className="cumora-waitlist-screen">
      <div className="cumora-waitlist-card">
        <div className="cumora-waitlist-emoji">⏳</div>
        <div className="cumora-waitlist-title">You're on the waitlist</div>
        <div className="cumora-waitlist-sub" style={{ marginBottom: 18 }}>
          We saved <span className="cumora-waitlist-email">{email ?? 'your email'}</span> and will let you know
          the moment your account is ready. No further action needed.
        </div>
        <div style={{ marginBottom: 24, fontSize: 12.5, color: 'var(--ink-400)', fontStyle: 'italic' }}>
          Want to get a head start? <GetDesktopAppLink variant="text" /> — you'll be one click from your workspace the second you're approved.
        </div>
        <button className="btn-ghost" onClick={() => setDismissed(true)}>
          Done
        </button>
      </div>
    </div>
  )
}
