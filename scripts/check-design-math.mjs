// Bounded real-editor smoke probe. Run build:design-editor first, then Node22.
// Fixture-only HTTP/persistence; this does not exercise product authorization.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, extname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const output = resolve('artifacts/issue-670/design-math'), editor = resolve('server/assets/design-editor')
const fragment = await readFile('scripts/fixtures/artifact-math-fragment.html', 'utf8')
const files = new Map([
  ['project/Math.dc.html', '<!doctype html><html><head><script src="./support.js"></script></head><body><x-dc>' + fragment + '</x-dc></body></html>'],
  ['project/canvas.json', JSON.stringify({ v: 3, title: 'Public formula regression', launch: { view: 'canvas' }, boards: { 'Math.dc.html': { x: 0, y: 0, w: 760, h: 900 } }, order: ['Math.dc.html'], pages: [], notes: {}, designSystems: [] })],
])
const hash = value => createHash('sha256').update(value).digest('hex')
let origin, writes = 0
const base = '/artifact-editor/design/fixture/'
const http = createServer(async (request, response) => {
  const send = (body, type = 'application/json', status = 200) => { response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); response.end(body) }
  try {
    const url = new URL(request.url, origin)
    if (url.pathname === '/') return send('<!doctype html><iframe title="Design formula regression" sandbox="allow-scripts allow-same-origin allow-downloads" style="border:0;width:100vw;height:100vh" src="' + origin + base + '"></iframe>', 'text/html')
    let path = url.pathname.startsWith('/artifact-editor/design-assets/') ? 'assets/' + url.pathname.split('/').at(-1) : url.pathname.startsWith(base) ? url.pathname.slice(base.length) : null
    if (path === null || path.includes('..')) return send('', 'text/plain', 404)
    if (path === '__deck/session') return send('{"canEdit":true}')
    if (path === '__comments') return send('{"threads":[],"agent":{"available":false},"me":{"name":"Public fixture"}}')
    if (path.endsWith('/events')) { response.writeHead(200, { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }); response.write(': connected\n\n'); return }
    if (path === '_files.json') return send(JSON.stringify({ ver: String(writes), files: Object.fromEntries([...files].map(([name, value]) => [name, { sha256: hash(value), size: Buffer.byteLength(value), contentType: name.endsWith('.json') ? 'application/json' : 'text/html' }])) }))
    if (path === '__deck/publish' && request.method === 'POST') {
      let body = ''; for await (const part of request) body += part
      const update = JSON.parse(body).files
      for (const [name, value] of Object.entries(update)) if (value.ifMatch && hash(files.get(name) ?? '') !== value.ifMatch) return send('{"code":"conflict"}', 'application/json', 409)
      for (const [name, value] of Object.entries(update)) files.set(name, Buffer.from(value.base64, 'base64').toString())
      writes++; return send(JSON.stringify({ version: String(writes), shas: Object.fromEntries(Object.keys(update).map(name => [name, hash(files.get(name))])) }))
    }
    if (files.has(path)) return send(files.get(path), path.endsWith('.json') ? 'application/json' : 'text/html')
    if (request.method !== 'GET' || path.startsWith('project/')) return send('', 'text/plain', 404)
    let bytes = await readFile(resolve(editor, path || 'index.html'))
    if (!path || path === 'index.html') bytes = Buffer.from(bytes.toString().replaceAll('__LINGXI_DESIGN_ASSET_ORIGIN__', origin))
    return send(bytes, { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(path)] ?? 'text/html')
  } catch { send('', 'text/plain', 404) }
})
await new Promise(resolve => http.listen(0, '0.0.0.0', resolve))
origin = 'http://127.0.0.1:' + http.address().port
const directory = await mkdtemp(join(tmpdir(), 'issue670-design-'))
const browser = spawn('/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--user-data-dir=' + directory, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let socket, nextId = 0
const pending = new Map(), contexts = new Map(), reports = []
try {
  const endpoint = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error('Chromium startup timed out')), 15000); let output = ''
    browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(deadline); resolve(match[1]) } })
    browser.once('error', reject)
  })
  const tabs = await (await fetch('http://127.0.0.1:' + new URL(endpoint).port + '/json/list')).json()
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId })) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.id) { const promise = pending.get(data.id); pending.delete(data.id); data.error ? promise?.reject(Error(data.error.message)) : promise?.resolve(data.result) }
    if (data.method === 'Runtime.executionContextCreated' && data.params.context.auxData?.isDefault) contexts.set(data.params.context.auxData.frameId, { id: data.params.context.id, sessionId: data.sessionId })
    if (data.method === 'Runtime.executionContextsCleared') for (const [key, value] of contexts) if (value.sessionId === data.sessionId) contexts.delete(key)
    if (data.method === 'Target.attachedToTarget') void call('Runtime.enable', {}, data.params.sessionId)
  })
  const evaluate = async (expression, context) => {
    const result = await call('Runtime.evaluate', { expression, contextId: context?.id, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlockedByCSP: false }, context?.sessionId)
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const wait = async (check) => { const deadline = Date.now() + 40000; while (Date.now() < deadline) { const result = await check(); if (result) return result; await delay(100) } throw Error('Design fixture timed out') }
  const guest = () => wait(async () => { for (const context of contexts.values()) try { if (await evaluate('!!document.getElementById("math-fixture") && document.querySelectorAll(".katex").length === 8', context)) return context } catch {} })
  const verify = async () => {
    const context = await guest(); await evaluate('document.fonts.ready.then(()=>true)', context)
    const result = await evaluate(`({formulas:document.querySelectorAll('.katex').length,display:document.querySelectorAll('.katex-display').length,matrix:document.querySelectorAll('#matrix .mtable').length,aligned:document.querySelectorAll('#aligned .mtable').length,attention:document.querySelectorAll('#attention .mfrac').length,rnn:document.querySelector('#roadmap-rnn annotation')?.textContent,ordinary:document.getElementById('ordinary').textContent,code:document.getElementById('inline-code').textContent,invalid:document.getElementById('invalid-dollar').textContent,unsafeLinks:document.querySelectorAll('.katex a').length,fonts:[...document.fonts].filter(f=>f.status==='loaded').length})`, context)
    assert.equal(result.formulas, 8); assert.equal(result.display, 3); assert.equal(result.matrix, 1); assert.equal(result.aligned, 1); assert.equal(result.attention, 1); assert.ok(result.fonts >= 3); assert.equal(result.unsafeLinks, 0); assert.match(result.ordinary, /\$5 and \$10/); assert.match(result.code, /`\$h_t=f\(x_t\)\$`/); assert.equal(result.invalid, '$\\unknowncommand{x}$')
    return result
  }
  await call('Page.enable'); await call('Runtime.enable'); await call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
  await call('Page.navigate', { url: origin.replace('127.0.0.1', 'localhost') + '/' })
  reports.push({ scenario: 'initial', ...await verify() })
  // Edit through the actual heading and trusted keyboard input. Preview-only
  // DOM updates are not evidence of a persisted document change.
  const point = await evaluate(`(()=>{const r=document.querySelector('h1').getBoundingClientRect();let p={x:r.x+r.width/2,y:r.y+r.height/2},w=window;while(w!==w.parent){let f;try{f=w.frameElement}catch{}if(!f)break;const a=f.getBoundingClientRect();p={x:a.x+p.x*a.width/w.innerWidth,y:a.y+p.y*a.height/w.innerHeight};w=w.parent}return p})()`, await guest())
  const offset = await evaluate(`(()=>{const r=document.querySelector('iframe').getBoundingClientRect();return {x:r.x,y:r.y}})()`)
  const coordinate = { x: point.x + offset.x, y: point.y + offset.y }
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...coordinate })
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 2, ...coordinate })
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 2, ...coordinate })
  await wait(async () => await evaluate(`document.querySelector('h1')?.isContentEditable`, await guest()))
  await evaluate(`(()=>{const e=document.querySelector('h1');e.focus();const range=document.createRange();range.selectNodeContents(e);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range)})()`, await guest())
  await call('Input.insertText', { text: 'Saved formula regression' })
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(async () => writes > 0 && files.get('project/Math.dc.html').includes('Saved formula regression'))
  reports.push({ scenario: 'native-heading-edit-saved-with-cas', writes, ...await verify() })
  await evaluate('document.getElementById("math-fixture").style.width="240px"', await guest())
  const narrow = await evaluate(`([...document.querySelectorAll('.katex-display')].map(e=>({width:e.clientWidth,content:e.scrollWidth,tab:e.tabIndex})))`, await guest())
  assert.ok(narrow.every(item => item.width <= 240 && item.tab === 0)); assert.ok(narrow.some(item => item.content > item.width))
  reports.push({ scenario: 'narrow-formulas-keyboard-focusable', formulas: narrow })
  await call('Page.reload'); const reopened = await verify(); assert.equal(reopened.rnn, 'h_t = f(h_{t-1}, x_t)'); assert.equal(await evaluate(`document.querySelector('h1').textContent`, await guest()), 'Saved formula regression'); reports.push({ scenario: 'saved-reopened', ...reopened })
  await mkdir(output, { recursive: true })
  const screenshot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, 'reopened.png'), Buffer.from(screenshot.data, 'base64'))
  const report = { browser: 'Chromium via CDP', scope: 'real compiled Design editor; public formula fixtures; local fixture CAS only', unverified: ['product tenant authorization', 'live model selection', 'browser export'], reports }
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
} finally {
  socket?.close(); browser.kill(); await new Promise(resolve => browser.once('exit', resolve)); http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
