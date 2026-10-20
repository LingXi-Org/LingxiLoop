// Test-only hook appended by serve.mjs; it cancels a real official SDK request.
let cancelNextDocumentRead = false
let documentCancellation = null
const originalDocumentCall = app.callServerTool.bind(app)
const cancelDocumentButton = document.createElement('button')
cancelDocumentButton.textContent = 'Fixture cancel document request'
cancelDocumentButton.hidden = true
cancelDocumentButton.style.cssText = 'position:absolute;top:0;right:0;font-size:9px'
document.body.append(cancelDocumentButton)
window.addEventListener('message', event => {
  if (event.source === window.parent && event.data?.fixtureCancelNextDocumentRead === true) cancelNextDocumentRead = true
})
app.callServerTool = (params, options) => {
  if (!cancelNextDocumentRead || params.name !== 'read_frame') return originalDocumentCall(params, options)
  cancelNextDocumentRead = false
  documentCancellation = new AbortController()
  cancelDocumentButton.hidden = false
  const signal = options?.signal ? AbortSignal.any([options.signal, documentCancellation.signal]) : documentCancellation.signal
  return originalDocumentCall(params, { ...options, signal }).finally(() => {
    documentCancellation = null
    cancelDocumentButton.hidden = true
  })
}
cancelDocumentButton.onclick = () => {
  if (!documentCancellation) return
  documentCancellation.abort()
  const result = document.createElement('pre')
  result.setAttribute('aria-label', 'Fixture cancelled document requests')
  result.textContent = '1'
  document.body.append(result)
}
