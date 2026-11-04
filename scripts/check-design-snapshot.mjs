// Replay a saved real-model public delivery in actual AnswerText/DesignWorkspace/editor.
// Run build:design-editor first. Local synthetic HTTP/CAS; no product ACL/model call.
import assert from 'node:assert/strict'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, readdir, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, extname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const snapshotDirectory = resolve(process.argv[2] ?? 'docs/evidence/issue-670/one-shot-introduction')
const output = resolve(process.argv[3] ?? 'artifacts/issue-670/model-snapshot-browser'), editor = resolve('server/assets/design-editor')
const publicAnswer = JSON.parse(await readFile(join(snapshotDirectory, 'public-answer.json'), 'utf8'))
const files = new Map()
for (const name of await readdir(snapshotDirectory)) if (/^project-.*\.(?:json|html|css|js)$/.test(name)) files.set('project/' + name.slice('project-'.length), await readFile(join(snapshotDirectory, name), 'utf8'))
const canvas = JSON.parse(files.get('project/canvas.json'))
const titles = Object.values(canvas.boards).map(board => board.title).filter(Boolean)
const title = titles[0] ?? canvas.title
const sources = Object.fromEntries([...files].map(([name, body]) => [name, createHash('sha256').update(body).digest('hex')]))
assert.ok(canvas.order.length && files.has('project/' + canvas.order[0]))
const directory = await mkdtemp(join(tmpdir(), 'issue670-model-snapshot-'))
const web = join(directory, 'web')
await build({ configFile: false, root: resolve('.'), logLevel: 'warn', plugins: [react()], resolve: { alias: { '@': resolve('src') } },
  build: { outDir: web, emptyOutDir: true, minify: false, rollupOptions: { input: resolve('scripts/fixtures/design-snapshot.html') } } })
const hash = value => createHash('sha256').update(value).digest('hex')
let origin, writes = 0
const base = '/artifact-editor/design/fixture/'
const http = createServer(async (request, response) => {
  const send = (body, type = 'application/json', status = 200) => { response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); response.end(body) }
  try {
    const url = new URL(request.url, origin)
    if (url.pathname === '/__snapshot') return send(JSON.stringify({ ...publicAnswer, title }))
    if (url.pathname === `/api/artifacts/${publicAnswer.canvasId}/editor-grant`) return send(JSON.stringify({ url: origin + base, expiresAt: Date.now() + 3600000, write: true }))
    if (url.pathname === '/' || url.pathname.startsWith('/assets/')) {
      const local = url.pathname === '/' ? 'scripts/fixtures/design-snapshot.html' : url.pathname.slice(1)
      if (local.includes('..')) return send('', 'text/plain', 404)
      return send(await readFile(resolve(web, local)), { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(local)] ?? 'text/html')
    }
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
const browser = spawn('/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--user-data-dir=' + directory, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
let socket, nextId = 0, documentLoads = 0
const pending = new Map(), contexts = new Map(), reports = [], dialogs = []
let allowSavedReload = false
try {
  const endpoint = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error('Chromium startup timed out')), 15000); let output = ''
    browser.stderr.on('data', chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(deadline); resolve(match[1]) } })
    browser.once('error', reject)
  })
  const tabs = await (await fetch('http://127.0.0.1:' + new URL(endpoint).port + '/json/list')).json()
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP call timed out: ' + method)) }, 15000); pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value) }, reject: error => { clearTimeout(timer); reject(error) } }); socket.send(JSON.stringify({ id, method, params, sessionId })) })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.method === 'Page.loadEventFired') documentLoads++
    if (data.method === 'Page.javascriptDialogOpening') { dialogs.push({ type: data.params.type, acceptedAfterConfirmedSave: allowSavedReload }); if (allowSavedReload) void call('Page.handleJavaScriptDialog', { accept: true }).catch(() => {}) }
    if (data.id) { const promise = pending.get(data.id); pending.delete(data.id); data.error ? promise?.reject(Error(data.error.message)) : promise?.resolve(data.result) }
    if (data.method === 'Runtime.executionContextCreated' && data.params.context.auxData?.isDefault) contexts.set(data.params.context.auxData.frameId, { id: data.params.context.id, sessionId: data.sessionId })
    if (data.method === 'Runtime.executionContextsCleared') for (const [key, value] of contexts) if (value.sessionId === data.sessionId) contexts.delete(key)
    if (data.method === 'Runtime.executionContextDestroyed') for (const [key, value] of contexts) if (value.id === data.params.executionContextId && value.sessionId === data.sessionId) contexts.delete(key)
    if (data.method === 'Target.detachedFromTarget') for (const [key, value] of contexts) if (value.sessionId === data.params.sessionId) contexts.delete(key)
    if (data.method === 'Target.attachedToTarget') void call('Runtime.enable', {}, data.params.sessionId).catch(() => {})
  })
  const evaluate = async (expression, context) => {
    const result = await call('Runtime.evaluate', { expression, contextId: context?.id, returnByValue: true, awaitPromise: true, allowUnsafeEvalBlockedByCSP: false }, context?.sessionId)
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const wait = async (check) => { const deadline = Date.now() + 40000; while (Date.now() < deadline) { const result = await check(); if (result) return result; await delay(100) } throw Error('Design fixture timed out') }
  const guest = () => wait(async () => { for (const context of contexts.values()) try { if (await evaluate('typeof window.__dcUpdate === "function" && !!document.querySelector("h1") && document.querySelectorAll(".katex").length > 0', context)) return context } catch {} })
  const verify = async () => {
    const context = await guest(); await wait(() => evaluate('document.fonts.status === \"loaded\"', context))
    const result = await evaluate(`({heading:document.querySelector('h1').textContent,formulas:document.querySelectorAll('.katex').length,display:document.querySelectorAll('.katex-display').length,body:document.body.innerText.slice(0,250),unsafeLinks:document.querySelectorAll('.katex a').length})`, context)
    assert.ok(result.formulas > 0); assert.ok(result.display > 0); assert.equal(result.unsafeLinks, 0)
    return result
  }
  const click = async selector => {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point })
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point })
  }
  const findInConversation = async () => {
    await wait(() => evaluate('!!document.getElementById("open-design")'))
    const body = await evaluate('document.querySelector("[data-model-answer]").innerText')
    assert.ok(body.includes('Design')); for (const board of titles) assert.ok(body.includes(board), 'delivered board name must be findable in the conversation')
    await click('#open-design')
    return { names: titles, replyMentionsDesign: true }
  }
  await call('Page.enable'); await call('Runtime.enable'); await call('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false })
  await call('Page.navigate', { url: origin.replace('127.0.0.1', 'localhost') + '/' })
  console.log('snapshot stage: rendered conversation and opened editor')
  reports.push({ scenario: 'conversation-finds-model-delivery', ...await findInConversation(), ...await verify() })
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
  await call('Input.insertText', { text: 'Saved public distribution explanation' })
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await wait(async () => writes > 0 && files.get('project/' + canvas.order[0]).includes('Saved public distribution explanation'))
  console.log('snapshot stage: native edit saved')
  reports.push({ scenario: 'native-heading-edit-saved-with-cas', writes, ...await verify() })
  console.log('snapshot stage: reloading saved files')
  allowSavedReload = true; const beforeReload = documentLoads; await call('Page.reload'); await wait(async () => documentLoads > beforeReload); await findInConversation(); const reopened = await verify()
  assert.equal(await evaluate(`document.querySelector('h1').textContent`, await guest()), 'Saved public distribution explanation')
  reports.push({ scenario: 'saved-reopened-and-found-from-conversation', ...reopened })
  await mkdir(output, { recursive: true })
  const screenshot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, 'reopened.png'), Buffer.from(screenshot.data, 'base64'))
  const report = { browser: 'Chromium via CDP', scope: 'real AnswerText/DesignWorkspace/editor; unmodified initial saved real-model public files; local fixture grant/CAS only', snapshot: snapshotDirectory, inputFileHashes: sources, dialogs, unverified: ['production tenant authorization', 'model invocation during browser replay', 'browser export'], reports }
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
} finally {
  socket?.close(); if (browser.exitCode === null) { const ended = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await ended } http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
