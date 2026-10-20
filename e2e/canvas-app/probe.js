// App and RecordResultSchema are lexical bindings from the unmodified guest.
const probe = document.createElement('button')
probe.textContent = 'Fixture protocol probe'
probe.hidden = true
window.addEventListener('message', event => { if (event.source === window.parent && event.data?.fixtureProtocolProbe === true) probe.hidden = false })
probe.style.cssText = 'position:absolute;top:0;right:0;font-size:9px'
document.body.append(probe)
probe.onclick = async () => {
  const evidence = { capabilities: app.getHostCapabilities(), rejected: [] }
  const cases = [
    ['unknown-tool', 'tools/call', { name: 'execute_shell', arguments: {} }],
    ['cross-frame', 'tools/call', { name: 'commit_frame', arguments: { frameId: 'legacy-html', expectedRevision: 1, content: 'wrong target' } }],
    ['invalid-revision', 'tools/call', { name: 'commit_frame', arguments: { expectedRevision: 0, content: 'bad revision' } }],
    ['direct-send', 'ui/message', { role: 'user', content: [{ type: 'text', text: 'must not send' }] }],
    ['private-model-state', 'ui/set-widget-state', { widgetState: { dirty: false, modelContent: 'must not stage' } }],
    ['resource-read', 'resources/read', { uri: 'file:///etc/passwd' }],
  ]
  for (const [label, method, params] of cases) {
    try { await app.request({ method, params }, RecordResultSchema, { timeout: 2000 }); evidence.rejected.push({ label, rejected: false }) }
    catch { evidence.rejected.push({ label, rejected: true }) }
  }
  // A genuinely same-source request with SDK cancellation, not a forged parent event.
  const cancellation = new AbortController()
  const request = app.callServerTool({ name: 'commit_frame', arguments: { content: 'cancelled request may already commit', expectedRevision: 1 } }, { signal: cancellation.signal })
  setTimeout(() => cancellation.abort(), 80)
  try { await request; evidence.cancelled = false } catch { evidence.cancelled = true }
  const output = document.createElement('pre')
  output.setAttribute('aria-label', 'Fixture protocol evidence')
  output.textContent = JSON.stringify(evidence)
  document.body.append(output)
}
