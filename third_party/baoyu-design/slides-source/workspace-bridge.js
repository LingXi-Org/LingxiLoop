/** LingxiLoop adapter for upstream's complete editor presence, not a DOM scraper. */
export function connectWorkspace(runtime) {
  const nonce = new URLSearchParams(location.hash.slice(1)).get('workspace')
  if (!nonce || window.parent === window) return
  let latest
  const send = () => {
    if (latest) parent.postMessage({ type: 'slides:context', nonce, context: latest }, '*')
  }
  runtime.reportNativeEditorContext = view => {
    latest = {
      slideId: view.slideId ?? null, selectedElementIds: view.selected ?? [],
      selection: view.selection ?? [], selectedSlides: view.selectedSlides ?? [],
      selectedText: window.getSelection()?.toString().slice(0, 16000) ?? '',
      slideTitle: view.slideTitle?.text ?? '', slideIndex: view.slideIndex ?? 0, slideCount: view.slideCount ?? 0,
      mode: view.mode, dirty: view.dirty, version: null,
    }
    send()
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.nonce !== nonce) return
    if (event.data.type === 'slides:exit-presentation') window.dispatchEvent(new Event('slides-exit-presentation'))
    if (event.data.type === 'slides:request-context') send()
    if (event.data.type === 'slides:agent-activity') {
      window.dispatchEvent(new MessageEvent('message', { source: parent, data: { __frame_claude_activity: true, working: event.data.working === true } }))
    }
  })
  const heartbeat = setInterval(send, 15000)
  window.addEventListener('pagehide', () => clearInterval(heartbeat), { once: true })
}
