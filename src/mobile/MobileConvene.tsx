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
        没有现场会议
      </div>
      <div className="font-display italic text-[14px] text-ink-500 max-w-xs leading-relaxed mb-6">
        当客服人员呼叫召集实时工作时，您会在此处看到它。在桌面上打开对话并点击 <b className="not-italic text-skype-deep font-semibold">召开</b> 开始一个。
      </div>
    </section>
  )
}
