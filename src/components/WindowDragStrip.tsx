import type { CSSProperties } from 'react'
import { isElectron } from '@/lib/runtime'

/**
 * A top-edge drag region for frameless Electron windows on screens that have no
 * TitleBar — sign-in, invite-accept, the auth loading state. Without it the only
 * draggable area is Electron's tiny default strip around the traffic lights, so
 * the window is almost impossible to move. Matches the 44px titlebar height used
 * in the main app (see TitleBar) so the window is just as easy to grab here.
 *
 * Renders nothing outside Electron. The host MUST be a positioned element
 * (the pre-auth screens are all `fixed inset-0`, which is positioned). Native
 * traffic lights stay clickable — Electron treats them as no-drag automatically.
 */
export function WindowDragStrip() {
  if (!isElectron) return null
  return (
    <div
      aria-hidden
      className="absolute top-0 inset-x-0 z-10"
      style={{ height: 44, WebkitAppRegion: 'drag' } as CSSProperties}
    />
  )
}
