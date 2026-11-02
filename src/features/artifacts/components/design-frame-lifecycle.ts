/** Complete the pinned Design editor's existing parent reveal protocol.
 * Without this acknowledgement its standalone fallback waits several seconds
 * before mounting the canvas. This says only that the frame is displayed; the
 * editor still owns document loading, rendering and editable readiness. */
export function subscribeDesignFrameReveal(frame: HTMLIFrameElement, url: string, callbacks: { initialized?(): void; failed?(): void } = {}): () => void {
  const origin = new URL(url).origin
  let requested = false, sent = false, stopped = false
  const reveal = () => {
    if (stopped || sent || !requested || !frame.isConnected || document.visibilityState !== 'visible'
      || !frame.checkVisibility({ visibilityProperty: true })) return
    const { width, height } = frame.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    frame.contentWindow?.postMessage({ __frame_revealed: true }, origin)
    sent = true
  }
  const receive = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== origin) return
    if (event.data?.__lingxi_design_resource_error === true) { callbacks.failed?.(); return }
    if (event.data?.__frame_reveal_hold !== true && event.data?.__frame_reveal_ready !== true) return
    if (!requested) callbacks.initialized?.()
    requested = true
    reveal()
  }
  window.addEventListener('message', receive)
  document.addEventListener('visibilitychange', reveal)
  const observer = new ResizeObserver(reveal)
  observer.observe(frame)
  return () => {
    stopped = true
    observer.disconnect()
    window.removeEventListener('message', receive)
    document.removeEventListener('visibilitychange', reveal)
  }
}
