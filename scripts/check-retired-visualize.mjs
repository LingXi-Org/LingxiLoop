// Actual AnswerText/MarkdownText + product HTTP client in Chromium through CDP.
// HTTP replies/identities are public fixtures, not product ACL/model evidence.
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

const output = resolve('artifacts/issue-670/archive-browser')
const directory = await mkdtemp(join(tmpdir(), 'issue670-archive-'))
const web = join(directory, 'web'), downloads = join(directory, 'downloads')
const expected = { before: '历史正文前半段😀。', reference: '::visualize{"path":"/work/public-lesson.html","title":"公共历史讲解"}', after: '历史正文后半段。' }
const archive = { format: 'lingxiloop.visualize-archive', schemaVersion: 1, retired: true,
  document: { path: '/work/public-lesson.html', html: '<h1>Public historic source</h1><script>window.retiredGuestRan=true</script>', version: 1 },
  userState: { state: { modelContent: { learnerChoice: 'public-example' } } } }
const requests = [], browserRequests = [], errors = [], reports = []
let origin, denied = false, socket, browser, nextId = 0
const pending = new Map()
await mkdir(downloads, { recursive: true })
await build({ configFile: false, root: resolve('.'), logLevel: 'warn', plugins: [react()], resolve: { alias: { '@': resolve('src') } },
  build: { outDir: web, emptyOutDir: true, minify: false, rollupOptions: { input: resolve('scripts/fixtures/retired-visualize.html') } } })
const http = createServer(async (request, response) => {
  const send = (body, type, status = 200) => { response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); response.end(body) }
  try {
    const url = new URL(request.url, origin)
    if (url.pathname === '/api/im/channels/public-room/visualize/archive') {
      requests.push({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
        company: request.headers['x-company-id'], project: request.headers['x-project-id'], denied })
      await delay(250) // Ensure the real pending/keyboard-focus state is exercised.
      if (denied) return send('{"error":"Access revoked"}', 'application/json', 403)
      response.setHeader('content-disposition', 'attachment; filename="public-history.json"')
      return send(JSON.stringify(archive), 'application/json')
    }
    const path = url.pathname === '/' ? 'scripts/fixtures/retired-visualize.html' : decodeURIComponent(url.pathname.slice(1))
    if (path.includes('..')) return send('', 'text/plain', 404)
    const bytes = await readFile(resolve(web, path))
    return send(bytes, { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(path)] ?? 'text/html')
  } catch { send('', 'text/plain', 404) }
})
try {
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve))
  origin = 'http://127.0.0.1:' + http.address().port
  browser = spawn('/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0', '--user-data-dir=' + join(directory, 'profile'), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  const endpoint = await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(Error('Chromium startup timed out')), 15000); let log = ''
    browser.stderr.on('data', chunk => { log += chunk; const match = log.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(deadline); resolve(match[1]) } })
    browser.once('error', reject)
  })
  const tabs = await (await fetch('http://127.0.0.1:' + new URL(endpoint).port + '/json/list')).json()
  socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    const deadline = setTimeout(() => { pending.delete(id); reject(Error('CDP call timed out: ' + method)) }, 15000)
    pending.set(id, { resolve: value => { clearTimeout(deadline); resolve(value) }, reject: error => { clearTimeout(deadline); reject(error) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data)
    if (data.id) { const promise = pending.get(data.id); pending.delete(data.id); data.error ? promise?.reject(Error(data.error.message)) : promise?.resolve(data.result) }
    if (data.method === 'Network.requestWillBeSent') browserRequests.push(data.params.request.url)
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.exception?.description ?? data.params.exceptionDetails.text)
  })
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const wait = async (check, label) => { const deadline = Date.now() + 15000; while (Date.now() < deadline) { const value = await check(); if (value) return value; await delay(50) } console.error(JSON.stringify({label,requests,errors,downloads:await readdir(downloads),page:await evaluate('({focus:document.activeElement?.outerHTML,alert:document.querySelector("[role=alert]")?.textContent,body:document.body.innerText})')})); throw Error('Archive fixture timed out: ' + label) }
  const key = async (key, code, windowsVirtualKeyCode) => {
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
  }
  await call('Runtime.enable'); await call('Page.enable'); await call('Network.enable')
  const version = await call('Browser.getVersion')
  await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true })
  await call('Emulation.setDeviceMetricsOverride', { width: 1000, height: 900, deviceScaleFactor: 1, mobile: false })
  await call('Page.navigate', { url: origin })
  await wait(() => evaluate('document.querySelector("aside button")?.textContent === "下载历史内容"'), 'archive control')
  const body = await evaluate('document.querySelector("[data-historical-body]").innerText')
  for (const text of Object.values(expected)) assert.ok(body.includes(text), 'historical body text missing: ' + text)
  assert.equal(requests.length, 0, 'export must never run while rendering or loading')
  assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0)
  reports.push({ scenario: 'actual-answer-text-render', body, automaticallyExported: false, frames: 0 })
  await key('Tab', 'Tab', 9)
  assert.equal(await evaluate('document.activeElement?.textContent'), '下载历史内容', 'archive action is keyboard reachable')
  await key('Enter', 'Enter', 13)
  await wait(() => evaluate('document.querySelector("aside button").getAttribute("aria-busy") === "true"'), 'pending export')
  assert.equal(await evaluate('document.activeElement?.textContent'), '正在导出…')
  await key('Enter', 'Enter', 13) // aria-disabled must preserve focus and block duplicates.
  const downloadedName = await wait(async () => (await readdir(downloads)).find(name => name.endsWith('.json')), 'browser download')
  const downloaded = await readFile(join(downloads, downloadedName), 'utf8')
  assert.deepEqual(JSON.parse(downloaded), archive)
  assert.deepEqual(requests, [{ method: 'GET', path: '/api/im/channels/public-room/visualize/archive',
    query: { path: '/work/public-lesson.html', sourceMessageId: 'public-source' }, company: 'public-archive-company', project: 'public-archive-project', denied: false }])
  assert.equal(await evaluate('window.retiredGuestRan === true'), false)
  reports.push({ scenario: 'keyboard-explicit-json-download', file: downloadedName, bytes: Buffer.byteLength(downloaded), sha256: createHash('sha256').update(downloaded).digest('hex'), request: requests[0], oldSourceExecuted: false })
  denied = true
  // Pending status must retain the same action for keyboard retry.
  await wait(() => evaluate('document.querySelector("aside button").getAttribute("aria-disabled") === "false"'), 'ready to retry')
  assert.equal(await evaluate('document.activeElement?.textContent'), '下载历史内容')
  await key('Enter', 'Enter', 13)
  await wait(() => evaluate('document.querySelector("[role=alert]")?.textContent'), 'revoked error')
  assert.equal(requests.length, 2)
  assert.equal(await evaluate('document.querySelector("[data-historical-body]").innerText'), body)
  const focus = await evaluate('({tag:document.activeElement?.tagName,text:document.activeElement?.textContent})')
  assert.equal(focus.text, '下载历史内容', 'HTTP failure must preserve focused export action')
  assert.equal(await evaluate('document.querySelectorAll("iframe").length'), 0)
  assert.equal(await evaluate('window.retiredGuestRan === true'), false)
  const oldRequests = browserRequests.filter(address => /(?:\/visualize(?:\/|$)|\/assets\/visualize-|\/zcode\/|\/gen-ui(?:\/|\.))/.test(new URL(address).pathname)
    && new URL(address).pathname !== '/api/im/channels/public-room/visualize/archive'
    && !new URL(address).pathname.endsWith('/retired-visualize.html'))
  assert.deepEqual(oldRequests, []); assert.deepEqual(errors, [])
  reports.push({ scenario: 'revoked-http-response', status: 403, bodyPreserved: true, focus, error: await evaluate('document.querySelector("[role=alert]").textContent'), frames: 0 })
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'downloaded-public-history.json'), downloaded)
  const screenshot = await call('Page.captureScreenshot', { format: 'png' }); await writeFile(join(output, 'revoked.png'), Buffer.from(screenshot.data, 'base64'))
  const report = { browser: version.product, transport: 'CDP; trusted keyboard input; real browser download', scope: 'Actual AnswerText/MarkdownText/HTTP client with public synthetic identity and HTTP archive fixture',
    unverified: ['production/current database authorization', 'live model generation', 'legacy executable interaction recovery'], oldRuntimeRequests: oldRequests, consoleErrors: errors, reports }
  await writeFile(join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report))
} finally {
  socket?.close()
  if (browser && browser.exitCode === null) { const ended = new Promise(resolve => browser.once('exit', resolve)); browser.kill(); await ended }
  http.closeAllConnections(); await new Promise(resolve => http.close(resolve))
  await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
