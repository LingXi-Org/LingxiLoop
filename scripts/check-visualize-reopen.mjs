import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const base = process.env.VISUALIZE_TEST_ORIGIN ?? 'http://127.0.0.1:5285'
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base), 'isolated local fixture only')
const directory = await mkdtemp(join(tmpdir(), 'visualize605-chromium-'))
const child = spawn(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let socket, nextId = 0
const pending = new Map(), contexts = new Map()
const reports = []
try {
  const endpoint = await new Promise((resolve, reject) => {
    let text = ''; const timer = setTimeout(() => reject(new Error('Chromium did not start')), 15_000)
    child.stderr.on('data', chunk => { text += chunk; const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) { clearTimeout(timer); resolve(match[1]) } })
    child.once('error', reject)
  })
  const port = new URL(endpoint).port
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.id) { const item = pending.get(data.id); pending.delete(data.id); if (data.error) item?.reject(new Error(data.error.message)); else item?.resolve(data.result) }
    if (data.method === 'Runtime.executionContextCreated' && data.params.context.auxData?.isDefault) contexts.set(data.params.context.auxData.frameId, { id: data.params.context.id, sessionId: data.sessionId })
    if (data.method === 'Runtime.executionContextsCleared') for (const [key, context] of contexts) { if (context.sessionId === data.sessionId) contexts.delete(key) }
    if (data.method === 'Target.attachedToTarget') void call('Runtime.enable', {}, data.params.sessionId)
  })
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId })) })
  const evaluate = async (expression, context) => {
    const result = await call('Runtime.evaluate', { expression, contextId: context?.id, returnByValue: true, awaitPromise: true }, context?.sessionId)
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description)
    return result.result.value
  }
  const wait = async (expression, timeout = 16_000) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) { if (await evaluate(expression)) return; await delay(100) }
    throw new Error(`Fixture timed out: ${expression}; state=${JSON.stringify(await evaluate('window.fixture?.snapshot()'))}`)
  }
  const guest = async () => { for (const context of contexts.values()) { try { if (await evaluate('!!document.getElementById("count")', context)) return context } catch { /* A replaced frame no longer has an execution context. */ } } }
  const ready = () => wait('window.fixture?.snapshot().phase === "ready"')
  const read = () => evaluate('({counts:window.fixture.counts,state:window.fixture.state(),phase:window.fixture.snapshot().phase})')
  await call('Page.enable'); await call('Runtime.enable'); await call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  await call('Page.navigate', { url: `${base}/scripts/fixtures/visualize-reopen.html` }); await ready()
  let evidence = await read()
  assert.equal(evidence.counts.publicRuntime, 1); assert.equal(evidence.counts.authorizedRuntime, 1); assert.equal(evidence.counts.abortedPublic, 1)
  reports.push({ scenario: 'stalled-public-route-authorized-recovery', ...evidence })
  const guestContext = await guest(); assert.ok(guestContext)
  await evaluate('document.getElementById("count").focus()', guestContext)
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })
  await wait('window.fixture.state()?.modelContent?.count === 6')
  await evaluate('document.getElementById("close").click()')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await evaluate('document.getElementById("open").click()'); await ready()
  assert.equal(await evaluate('document.getElementById("value").textContent', await guest()), '6')
  evidence = await read(); assert.equal(evidence.counts.acquisitions, 1)
  reports.push({ scenario: 'conversation-reopen-narrow-retains-guest-and-state', ...evidence })
  await call('Page.reload'); await ready()
  assert.equal(await evaluate('document.getElementById("value").textContent', await guest()), '6')
  reports.push({ scenario: 'refresh-restores-state-after-authorized-recovery', ...await read() })
  await call('Page.navigate', { url: `${base}/scripts/fixtures/visualize-reopen.html?mode=denied` })
  await wait('window.fixture?.snapshot().phase === "error"')
  evidence = await read(); assert.equal(evidence.counts.authorizedRuntime, 0)
  reports.push({ scenario: 'public-403-is-not-bypassed', ...evidence })
  await evaluate('document.getElementById("retry").click()'); await ready()
  evidence = await read(); assert.equal(evidence.counts.acquisitions, 2)
  reports.push({ scenario: 'explicit-retry-acquires-new-capability', ...evidence })
  const result = { browser: 'cloud Chromium', scope: 'real product host/retention/opaque frames/pinned SDK; synthetic local API; no production replay', reports }
  await mkdir('artifacts/visualize/issue-605', { recursive: true })
  await writeFile('artifacts/visualize/issue-605/browser.json', JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result))
} finally { socket?.close(); child.kill(); await new Promise(resolve => child.once('exit', resolve)); await rm(directory, { recursive: true, force: true }) }
