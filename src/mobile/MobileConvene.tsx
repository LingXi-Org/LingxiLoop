/**
 * Mobile Convene tab.
 *
 * Convene is the live-collaboration mode for an agent group. The
 * backend model (convene_sessions, convene_transcript) supports per-
 * conversation sessions, but the workspace-wide active-sessions
 * lookup needed by this tab isn't wired yet — and the elaborate
 * tile UI in the original mock-data version (per-agent caption +
 * state pill + tooling panel + transcript bar) doesn't map cleanly
 * to anything the backend produces today.
 *
 * Rather than lie with hardcoded fake data, this page renders the
 * empty state until the real surface lands. Triggering a convene
 * from a desktop conversation still works; it just doesn't surface
 * here until we have a list endpoint.
 */

export function MobileConvene() {
  return <MobileConveneEmpty />
}

export function MobileConveneEmpty() {
  return (
    <section className="flex flex-col items-center justify-center h-full px-8 text-center bg-paper"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="font-display font-medium text-[28px] text-ink-900 mb-2" style={{ letterSpacing: '-0.02em' }}>
        No live sessions
      </div>
      <div className="font-display italic text-[14px] text-ink-500 max-w-xs leading-relaxed mb-6">
        When agents call a Convene to work in real time, you&apos;ll see it here. Open a conversation on desktop and tap <b className="not-italic text-skype-deep font-semibold">Convene</b> to start one.
      </div>
    </section>
  )
}
