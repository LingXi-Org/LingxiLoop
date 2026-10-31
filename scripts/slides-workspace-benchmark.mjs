import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, readdir, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, extname } from 'node:path'
import { tmpdir, cpus, totalmem, platform } from 'node:os'
import { gzipSync } from 'node:zlib'

// Actual Chromium timings against a deterministic HTTP fixture. This intentionally
// does not stand in for authenticated product/API/model or production measurements.
const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')))
const root = resolve(import.meta.dirname, '..')
const editor = resolve(root, args.editor ?? 'server/assets/slides-editor')
const runs = Number(args.runs ?? 10)
const out = resolve(root, args.out ?? 'docs/evidence/issue-601/editor-baseline.json')
const base = '/artifact-editor/slides/benchmark/'
const sha = data => createHash('sha256').update(data).digest('hex')
const imageId = '1234567890abcdef1234567890abcdef'
const image = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#426b46"/><circle cx="320" cy="180" r="120" fill="#b8d994"/><path d="M0 360L220 100 440 360Z" fill="#204c3b"/></svg>')
function fixture() {
  const order = Array.from({ length: 20 }, (_, i) => `slide-${i + 1}`)
  return new Map([
    ['project/deck.json', Buffer.from(JSON.stringify({ v: 4, lists: 'css', title: '20 页图片基准稿', order, sections: {}, faces: {}, designSystems: [] }))],
    ...order.map((id, i) => [`project/slides/${id}.html`, Buffer.from(`<section id="${id}" style="background:#faf8f4;padding:80px;display:flex;flex-direction:column;gap:32px"><h1>幻灯片 ${i + 1}</h1><p>固定图片样稿，用于测量加载与编辑反馈。</p><img src="/_blob/${imageId}" style="width:640px;height:360px;object-fit:contain"><aside>第 ${i + 1} 页讲者备注。</aside></section>`)]),
  ])
}
const downloadAdapter = (await readFile(resolve(root, 'server/src/modules/artifacts/editor-downloads.ts'),'utf8')).split('`')[1]
let files = fixture()
function addLegacyMedia(files) {
  files.set('project/slides/slide-1.html', Buffer.from(files.get('project/slides/slide-1.html').toString().replace('</section>', '<video src="/_blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" aria-label="旧媒体"></video><img data-video-youtube="abcdefghijk" alt="旧链接"></section>')))
  return files
}
const fixtureFilesSha256 = sha(Buffer.concat([...(args.legacy ? addLegacyMedia(fixture()) : fixture()).values()]))
const requestedPaths = new Set()
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    requestedPaths.add(pathname)
    const path = pathname.startsWith('/artifact-editor/slides-assets/') ? `assets/${pathname.split('/').at(-1)}` : pathname.slice(base.length)
    const headers = { 'Access-Control-Allow-Origin': '*', 'Timing-Allow-Origin': '*', 'Cache-Control': 'no-store' }
    let bytes, type = 'application/json'
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...headers, 'Access-Control-Allow-Headers': 'content-type' }); res.end(); return }
    if (pathname === '/host') {
      bytes = Buffer.from(`<script>window.editorContexts=[];window.addEventListener("message",e=>{if(e.data?.type==="slides:context")window.editorContexts.push(e.data.context)})</script><iframe title="演示文稿编辑器" sandbox="allow-scripts allow-downloads allow-popups allow-modals" allow="fullscreen" src="${base}#workspace=benchmark" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`)
      type = 'text/html'
    } else if (pathname === '/workspace-recheck') bytes = Buffer.from('{"authorized":true}')
    else if (pathname === `/_blob/${imageId}`) { bytes = image; type = 'image/svg+xml' }
    else if (path === '_files.json') bytes = Buffer.from(JSON.stringify({ ver: sha(Buffer.concat([...files.values()])), files: Object.fromEntries([...files].map(([name, data]) => [name, { sha256: sha(data), size: data.length, contentType: name.endsWith('.html') ? 'text/html' : 'application/json' }])) }))
    else if (path === '__deck/session') bytes = Buffer.from('{"canEdit":true}')
    else if (path === '__comments') bytes = Buffer.from('{"threads":[],"agent":{"available":false},"me":{"name":"基准测试"}}')
    else if (path.endsWith('events')) { res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream' }); res.write(': connected\n\n'); return }
    else if (path === '__deck/publish') {
      const body = []; for await (const chunk of req) body.push(chunk)
      const batch = JSON.parse(Buffer.concat(body)).files
      for (const [name, entry] of Object.entries(batch)) {
        if (entry && 'ifMatch' in entry && entry.ifMatch !== (files.has(name) ? sha(files.get(name)) : null)) {
          res.writeHead(409, headers); res.end(JSON.stringify({ code: 'conflict', path: name })); return
        }
      }
      for (const [name, entry] of Object.entries(batch)) {
        if (!entry || entry.delete) files.delete(name)
        else files.set(name, Buffer.from(entry.base64, 'base64'))
      }
      bytes = Buffer.from(JSON.stringify({ version: sha(Buffer.concat([...files.values()])), shas: Object.fromEntries([...files].map(([name, data]) => [name, sha(data)])) }))
    } else if (files.has(path)) { bytes = files.get(path); type = path.endsWith('.html') ? 'text/html' : type }
    else {
      if (path.includes('..')) throw new Error('path')
      bytes = await readFile(resolve(editor, path || 'index.html'))
      if(!path) bytes=Buffer.from(bytes.toString().replace('</head>',`<script>${downloadAdapter}</script></head>`))
      type = { '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }[extname(path)] ?? 'text/html'
      if (path.startsWith('assets/')) headers['Cache-Control'] = 'public,max-age=31536000,immutable'
    }
    let compressed = gzipSync(bytes), encoding = 'gzip'
    if (args.compression === 'precompressed' && path.startsWith('assets/') && /\.(js|css)$/.test(path)) {
      if (!req.headers['accept-encoding']?.includes('br')) throw Error('Chromium did not negotiate Brotli')
      compressed = await readFile(resolve(editor, `${path}.br`)); encoding = 'br'
    }
    res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Encoding': encoding, 'Content-Length': compressed.length })
    res.end(compressed)
  } catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const profile = await mkdtemp(resolve(tmpdir(), 'slides-benchmark-'))
const browser = spawn(args.chrome ?? '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
let buffer = '', nextId = 0
const pending = new Map(), listeners = new Set(), errors = []
browser.stderr.on('data', () => {})
browser.stdio[4].on('data', bytes => {
  buffer += bytes.toString()
  let split
  while ((split = buffer.indexOf('\0')) >= 0) {
    const value = JSON.parse(buffer.slice(0, split)); buffer = buffer.slice(split + 1)
    if (value.id) { const request = pending.get(value.id); pending.delete(value.id); value.error ? request?.reject(new Error(value.error.message)) : request?.resolve(value.result) }
    else for (const listener of listeners) listener(value)
  }
})
function cdp(method, params = {}, sessionId) {
  const id = ++nextId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject }); browser.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0')
  })
}
const delay = ms => new Promise(r => setTimeout(r, ms))
const readyScript = `(() => { if (!location.pathname.startsWith('${base}')) return; const poll = () => { const stage = document.querySelector('[data-slides-editor]'); const add = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '添加幻灯片' || b.textContent === '添加幻灯片'); if(stage && stage.getBoundingClientRect().width > 0 && add && !add.disabled && document.body.textContent.includes('幻灯片 1') && [...document.querySelectorAll('img')].some(img=>img.getBoundingClientRect().width>300 && img.complete && img.naturalWidth>0)) { requestAnimationFrame(() => { window.__slidesReady = performance.now(); }); } else requestAnimationFrame(poll); }; requestAnimationFrame(poll); })()`
const samples = [], edits = [], regression = {}
const parsingTraces = []
const networkRequests = new Set()
try {
  const version = await cdp('Browser.getVersion')
  const downloads = resolve(profile, 'downloads'); await mkdir(downloads)
  await cdp('Browser.setDownloadBehavior', {behavior:'allow',downloadPath:downloads,eventsEnabled:true})
  for (let run = 0; run < runs; run++) {
    files = fixture()
    if(args.legacy) addLegacyMedia(files)
    const { browserContextId } = await cdp('Target.createBrowserContext')
    await cdp('Browser.setDownloadBehavior', {behavior:'allow',downloadPath:downloads,eventsEnabled:true,browserContextId})
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
    const contexts = new Map()
    const sessions = new Set([sessionId])
    const setupErrors = []
    let transferred = 0, nonNetworkEncodedBytes = 0
    const requestUrls = new Map()
    const configure = async child => {
      for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable', 'Performance.enable']) await cdp(method, {}, child)
      await cdp('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 4_000_000 / 8, uploadThroughput: 3_000_000 / 8 }, child)
      await cdp('Page.addScriptToEvaluateOnNewDocument', { source: readyScript }, child)
    }
    const listener = event => {
      if (!sessions.has(event.sessionId)) return
      if (event.method === 'Target.attachedToTarget') {
        const child = event.params.sessionId
        sessions.add(child)
        void configure(child).then(() => cdp('Runtime.runIfWaitingForDebugger', {}, child)).catch(error => setupErrors.push(error.message))
      }
      if (event.method === 'Runtime.executionContextCreated') contexts.set(`${event.sessionId}:${event.params.context.id}`, { session: event.sessionId, contextId: event.params.context.id })
      if (event.method === 'Runtime.executionContextsCleared') for (const [key, value] of contexts) if (value.session === event.sessionId) contexts.delete(key)
      if (event.method === 'Network.requestWillBeSent') {
        networkRequests.add(event.params.request.url)
        requestUrls.set(`${event.sessionId}:${event.params.requestId}`, event.params.request.url)
      }
      if (event.method === 'Network.loadingFinished') {
        const url = requestUrls.get(`${event.sessionId}:${event.params.requestId}`)
        if (url?.startsWith('http:') || url?.startsWith('https:')) transferred += event.params.encodedDataLength
        else nonNetworkEncodedBytes += event.params.encodedDataLength
      }
      if (event.method === 'Runtime.exceptionThrown') errors.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text)
    }
    listeners.add(listener)
    await configure(sessionId)
    await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId)
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId)
    for (const phase of args.retained ? ['cold', 'retained', 'reopen'] : ['cold', 'reopen']) {
      transferred = 0
      nonNetworkEncodedBytes = 0
      const traceEvents = []
      const traceListener = event => { if (event.method === 'Tracing.dataCollected') traceEvents.push(...event.params.value) }
      if (args.trace) {
        listeners.add(traceListener)
        await cdp('Tracing.start', { categories: 'v8,disabled-by-default-v8.compile,devtools.timeline', transferMode: 'ReportEvents' })
      }
      let retainedStartedAt
      if (phase === 'retained') {
        // Additional metric only. Keep the original fresh-frame reopen above
        // for comparison; do not call it a warm hit. The actual React retention
        // and revocation lifecycle is checked by check-slides-retention.mjs.
        // Closing via the product's host button moves focus out of the frame.
        await cdp('Runtime.evaluate', { expression: `document.body.tabIndex=-1;document.body.focus();document.querySelector('iframe').hidden=true` }, sessionId)
        await delay(100)
        for (const { contextId, session } of contexts.values()) {
          await cdp('Runtime.evaluate', { expression: `window.__slidesReady=0;${readyScript}`, contextId }, session).catch(() => {})
        }
        const start = await cdp('Runtime.evaluate', { expression: `(async()=>{const started=performance.timeOrigin+performance.now();const response=await fetch('/workspace-recheck');if(!response.ok)throw Error('authorization failed');document.querySelector('iframe').hidden=false;return started})()`, returnByValue: true, awaitPromise: true }, sessionId)
        retainedStartedAt = start.result.value
        if (!Number.isFinite(retainedStartedAt)) throw Error('Retained reopen did not start')
      } else await cdp('Page.navigate', { url: `${origin}/host` }, sessionId)
      const deadline = Date.now() + Number(args.timeout ?? 45000)
      let measurement, editorSession, editorContext
      while (!measurement && Date.now() < deadline) {
        for (const [key, { contextId, session }] of contexts) {
          try {
            const response = await cdp('Runtime.evaluate', { expression: `window.__slidesReady ? ({ readyMs: window.__slidesReady, timeOrigin: performance.timeOrigin, resources: performance.getEntriesByType('resource').map(r => ({name:new URL(r.name).pathname,initiatorType:r.initiatorType,startTime:r.startTime,requestStart:r.requestStart,responseStart:r.responseStart,responseEnd:r.responseEnd,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,duration:r.duration})), marks:performance.getEntriesByType('mark').filter(m=>m.name.startsWith('slides:')).map(m=>({name:m.name,startTime:m.startTime})), body: document.body.innerText.slice(0,500) }) : null`, contextId, returnByValue: true }, session)
            if (response.result.value) { measurement = response.result.value; editorSession = session; editorContext = contextId; break }
          } catch { contexts.delete(key) }
        }
        if (!measurement) await delay(50)
      }
      if (!measurement) {
        const shot = await cdp('Page.captureScreenshot', {}, sessionId)
        await writeFile('/tmp/issue-601-benchmark-timeout.png', Buffer.from(shot.data, 'base64'))
        console.error({ setupErrors, errors })
        for (const { contextId, session } of contexts.values()) { const r = await cdp('Runtime.evaluate', { expression: `({url:location.pathname,buttons:[...document.querySelectorAll('button')].slice(0,25).map(b=>({aria:b.getAttribute('aria-label'),title:b.title,text:b.textContent})),heading:document.querySelector('h1')?.outerHTML,stage:document.querySelector('h1')?.parentElement?.outerHTML.slice(0,1300)})`, contextId, returnByValue: true }, session); console.error(r.result.value) }
        throw new Error('Editor did not become editable before timeout')
      }
      const evaluate = async expression => (await cdp('Runtime.evaluate', { expression, contextId: editorContext, returnByValue: true, awaitPromise: true }, editorSession)).result.value
      const rect = await evaluate(`([...document.querySelectorAll('[data-text-path]')].find(e=>e.textContent==='幻灯片 1' && e.getBoundingClientRect().width>300)?.getBoundingClientRect().toJSON())`)
      if (!rect) throw Error('Visible title missing')
      for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x:rect.x+50, y:rect.y+20, button:'left', clickCount:2 }, editorSession)
      let editable = false
      for (let n=0;n<40 && !editable;n++) { editable = await evaluate(`Boolean(document.activeElement?.isContentEditable)`); if(!editable) await delay(25) }
      if (!editable) {
        console.error({phase,active:await evaluate('document.activeElement?.outerHTML.slice(0,1500)'),rect,errors})
        throw Error('Title did not enter text editing')
      }
      const interactiveAt = await evaluate('performance.now()')
      const offset = phase === 'retained' ? measurement.timeOrigin - retainedStartedAt : 0
      measurement = { ...measurement, renderedMs: measurement.readyMs + offset, readyMs: interactiveAt + offset, editableVerified: true }
      if (phase === 'reopen') {
        await evaluate(`window.__editFeedback=null;document.addEventListener('beforeinput',()=>{const start=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__editFeedback={durationMs:performance.now()-start,text:document.activeElement?.textContent}}))},{once:true,capture:true});true`)
        await cdp('Input.insertText',{text:'测试'},editorSession)
        let feedback
        for(let n=0;n<40 && !feedback;n++){feedback=await evaluate('window.__editFeedback');if(!feedback)await delay(25)}
        if (!feedback?.text?.includes('测试')) throw Error('Text editing feedback was not observed')
        edits.push({run:run+1,...feedback})
      }
      const metrics = Object.fromEntries((await cdp('Performance.getMetrics', {}, editorSession)).metrics.map(m => [m.name, m.value]))
      if (args.trace) {
        const complete = new Promise(resolve => {
          const done = event => { if (event.method === 'Tracing.tracingComplete') { listeners.delete(done); resolve() } }
          listeners.add(done)
        })
        await cdp('Tracing.end'); await complete; listeners.delete(traceListener)
        const frameEvents = traceEvents.filter(event => ['FrameCommittedInBrowser', 'TracingStartedInBrowser'].includes(event.name))
        const frames = frameEvents.flatMap(event => event.args?.data?.frames ?? [event.args?.data]).filter(Boolean)
        const pageProcesses = traceEvents.filter(event =>
          (event.name === 'ParseHTML' && (event.args?.beginData?.url ?? event.args?.data?.beginData?.url)?.startsWith(origin + base))
          || (event.name === 'EvaluateScript' && event.args?.data?.url?.startsWith(origin + base))).map(event => event.pid)
        const editorProcesses = [...new Set([...frames.filter(frame => frame.url?.startsWith(origin + base)).map(frame => frame.processId), ...pageProcesses].filter(Number.isFinite))]
        const groups = new Map()
        for (const event of traceEvents) if (event.ph === 'X' && /parse|compil/i.test(event.name) && event.dur >= 0
          && (!editorProcesses.length || editorProcesses.includes(event.pid))) {
          const key = `${event.pid}:${event.tid}:${event.name}`
          const entry = groups.get(key) ?? { name: event.name, process: event.pid, thread: event.tid, count: 0, durationMs: 0 }
          entry.count++; entry.durationMs += event.dur / 1000; groups.set(key, entry)
        }
        parsingTraces.push({ run: run + 1, phase, editorProcesses, scope: editorProcesses.length ? 'editor renderer processes' : 'browser-wide; renderer association unavailable', events: [...groups.values()] })
      }
      if (args.regression && phase === 'reopen') {
        const key = async value => { await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:value},editorSession); await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:value},editorSession) }
        await key('Escape')
        const click = async (role, name) => {
          const found = await evaluate(`(() => {const node=[...document.querySelectorAll(${JSON.stringify(role==='button'?'button':'[role="'+role+'"]')})].find(node=>(node.getAttribute('aria-label')??node.textContent).includes(${JSON.stringify(name)}) && node.getBoundingClientRect().width>0);if(!node)return false;node.click();return true})()`)
          if(!found) throw Error('Missing '+role+': '+name)
          await delay(150)
        }
        await click('button','下载')
        const options=await evaluate(`([...document.querySelectorAll('[role="menuitem"]')].map(e=>({text:e.textContent,aria:e.getAttribute('aria-label')})))`)
        console.log(JSON.stringify({exportMenu:options}))
        regression.exportMenu=options
        regression.editContext=(await cdp('Runtime.evaluate',{expression:'window.editorContexts?.at(-1)',returnByValue:true},sessionId)).result.value
        const waitFor = async (check, label, milliseconds=30000) => {
          const end=Date.now()+milliseconds
          while(Date.now()<end){const result=await check();if(result)return result;await delay(100)}
          console.error({label,errors,body:await evaluate('document.body.innerText.slice(-7000)'),downloads:await readdir(downloads)})
          const shot=await cdp('Page.captureScreenshot',{},sessionId);await writeFile('/tmp/issue-601-export-timeout.png',Buffer.from(shot.data,'base64'));throw Error('Timed out: '+label)
        }
        regression.exports=[]
        for(const [label,extension,signature] of [['PDF（.pdf）','.pdf','%PDF'],['网页（.html）','.html',null],['PowerPoint，使用通用字体','.pptx','PK']]) {
          if(regression.exports.length) await click('button','下载')
          await click('menuitem',label)
          const confirm=await evaluate(`([...document.querySelectorAll('button')].filter(e=>e.textContent.includes('下载') && e.getBoundingClientRect().width>0).at(-1)?.getBoundingClientRect().toJSON())`)
          if(confirm) for(const type of ['mousePressed','mouseReleased']) await cdp('Input.dispatchMouseEvent',{type,x:confirm.x+confirm.width/2,y:confirm.y+confirm.height/2,button:'left',clickCount:1},editorSession)
          const name=await waitFor(async()=> (await readdir(downloads)).find(name=>name.endsWith(extension)),label,60000)
          const bytes=await readFile(resolve(downloads,name))
          if(signature && !bytes.subarray(0,8).toString().startsWith(signature))throw Error('Invalid '+extension+' bytes')
          if(extension==='.html') {
            if(!bytes.toString().includes('deck-slide'))throw Error('Missing exported slides')
            if(/<video\b|(?:youtube|vimeo)\.com\/embed\b/i.test(bytes.toString()))throw Error('Exported HTML contains active video')
          }
          if(args['exports-dir']) {
            await mkdir(resolve(args['exports-dir']), {recursive:true})
            await writeFile(resolve(args['exports-dir'], `slides${extension}`), bytes)
          }
          regression.exports.push({format:extension,bytes:bytes.length,sha256:sha(bytes)})
        }
        regression.saved=Boolean(await waitFor(async()=>files.get('project/slides/slide-1.html')?.toString().includes('测试'),'saved edit'))
        await click('button','放映')
        await click('menuitem','放映')
        const mode=await evaluate(`document.body.innerText.slice(0,300)`)
        const hostContext = async () => {
          const r=await cdp('Runtime.evaluate',{expression:'window.editorContexts?.at(-1)',returnByValue:true},sessionId)
          return r.result.value
        }
        const presentationContext=await waitFor(async()=>{const c=await hostContext();return c?.mode==='present'?c:null},'presentation context')
        regression.presentation={mode,context:presentationContext}
        await cdp('Runtime.evaluate',{expression:`document.querySelector('iframe').contentWindow.postMessage({type:'slides:exit-presentation',nonce:'benchmark'},'*')`},sessionId)
        regression.exitPresentation=Boolean(await waitFor(async()=> (await hostContext())?.mode==='edit','exit presentation'))
        regression.selectionContext=await hostContext()
        regression.noVideoControls=await evaluate(`!document.querySelector('video,input[accept*="video"],[data-video-watch]')`)
        if(!regression.noVideoControls)throw Error('Video control is still mounted')
        if(args.legacy){
          regression.legacyPlaceholders=await evaluate(`document.querySelectorAll('[data-unsupported-media]').length`)
          regression.legacyMetadataPreserved=files.get('project/slides/slide-1.html').toString().includes('data-video-youtube="abcdefghijk"')
          regression.videoRequests=[...networkRequests].filter(url=>/youtube|vimeo|loom\.com|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/.test(url))
          if(!regression.legacyPlaceholders||!regression.legacyMetadataPreserved||regression.videoRequests.length)throw Error('Legacy media was lost or activated')
        }
        const undo = async redo => {
          for(const type of ['keyDown','keyUp']) await cdp('Input.dispatchKeyEvent',{type,key:'z',code:'KeyZ',windowsVirtualKeyCode:90,modifiers:redo?10:2},editorSession)
        }
        await undo(false)
        regression.undo=Boolean(await waitFor(async()=>files.get('project/slides/slide-1.html')?.toString().includes('幻灯片 1'),'undo saved edit'))
        await undo(true)
        regression.redo=Boolean(await waitFor(async()=>files.get('project/slides/slide-1.html')?.toString().includes('测试'),'redo saved edit'))
        await cdp('Page.navigate',{url:`${origin}/host`},sessionId)
        regression.savedReopen=Boolean(await waitFor(async()=>{
          for(const {contextId,session} of contexts.values()){
            try {const r=await cdp('Runtime.evaluate',{contextId,expression:`location.pathname.startsWith('${base}') && Boolean([...document.querySelectorAll('[data-text-path]')].find(e=>e.textContent==='测试' && e.getBoundingClientRect().width>300))`,returnByValue:true},session);if(r.result.value)return true}catch{}
          }
          return false
        },'saved reopen'))
      }
      samples.push({ run: run + 1, phase, ...measurement, transferredBytes: transferred, nonNetworkEncodedBytes, jsHeapUsedBytes: metrics.JSHeapUsedSize, scriptDurationSeconds: metrics.ScriptDuration, taskDurationSeconds: metrics.TaskDuration,
        ...(args.metrics ? { engineMetrics: metrics } : {}) })
      console.log(JSON.stringify({ run: run + 1, phase, readyMs: measurement.readyMs, transferredBytes: transferred }))
    }
    listeners.delete(listener)
    await cdp('Target.disposeBrowserContext', { browserContextId })
  }
  const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
  const report = { scope: 'Real Chromium, isolated sandboxed editor, deterministic local HTTP API fixture; not full product or production acceptance', source: args.label ?? 'baseline', measuredAt: new Date().toISOString(), browser: version, device: { platform: platform(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), viewport: '1440x1000@1', cpuThrottling: 1 }, network: { latencyMs: 20, downloadMbps: 4, uploadMbps: 3, compression: args.compression === 'precompressed' ? 'build-time Brotli quality 11 for JS/CSS, gzip for fixture responses' : 'gzip', allRequests: true }, fixture: { variant: args.legacy ? 'legacy-compatibility' : 'fixed-performance', slides: 20, images: 20, imageSha256: sha(image), filesSha256: fixtureFilesSha256 }, runs, samples, regression, summary: Object.fromEntries(['cold', 'reopen'].map(phase => [phase, Object.fromEntries([.5, .75, .95].map(p => [`p${p * 100}Ms`, percentile(samples.filter(s => s.phase === phase).map(s => s.readyMs), p)]))])), editFeedback: { status: 'measured', definition: 'Trusted beforeinput to next painted text (two requestAnimationFrame callbacks), verified changed text', samples: edits, p95Ms: percentile(edits.map(edit=>edit.durationMs),.95) }, jsParseTime: {status:'unmeasured', note:'ScriptDuration measures execution, not a separate V8 parse trace'}, errors }
  if (args.retained) report.retainedReopen = {
    definition: 'Additional same-frame reopen: hide 100ms, start before a throttled authorization HTTP fixture, show the original iframe, verify loaded image and real double-click text editing. Excludes real product authorization cost; not a fresh navigation or cold measurement.',
    ...Object.fromEntries([.5, .75, .95].map(p => [`p${p * 100}Ms`, percentile(samples.filter(s => s.phase === 'retained').map(s => s.readyMs), p)])),
  }
  if (args.trace) report.jsParseTime = { status: 'trace-recorded',
    definition: 'V8 parse/compile complete events from before navigation to verified editing, grouped by process, thread and exact event name. Renderer association comes from frame-commit or document parsing/script URL trace metadata when available. Includes browser-injected measurement scripts; different names may nest, and streaming parse spans contain network waits, so they must not be summed as CPU or wall-clock parse time. This trace run has instrumentation overhead and is excluded from comparable performance P95.',
    samples: parsingTraces }
  await mkdir(resolve(out, '..'), { recursive: true }); await writeFile(out, JSON.stringify(report, null, 2) + '\n')
} finally {
  await cdp('Browser.close').catch(() => {}); browser.kill(); server.closeAllConnections(); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}
