// Focused product export check. Uses actual browser adapters/Workers and the fixed 50-page fixture.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { createFixture } from './native-artifact-fixture.mjs'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? '/workspace/scratch/native-export-acceptance')
const temporary = await mkdtemp(join(tmpdir(), 'lingxi-export-'))
const fixture = createFixture('slides')
await mkdir(output, { recursive: true })
await mkdir(join(temporary, 'public/native-artifact-fixture'), { recursive: true })
await Promise.all(fixture.images.map(image => writeFile(join(temporary, 'public/native-artifact-fixture', image.filename), image.bytes)))
await writeFile(join(temporary, 'public/document.json'), JSON.stringify(fixture.document))
const embedPreview = await readFile(resolve(process.argv[3] ?? join(output, '../native-embed-acceptance/dc-preview.png')))
await writeFile(join(temporary, 'public/embed-preview.png'), embedPreview)
await writeFile(join(temporary, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Native export acceptance</title></head><body><output id="status">loading</output><script type="module" src="/entry.ts"></script></body></html>')
await writeFile(join(temporary, 'entry.ts'), `
const original = await fetch('/document.json').then(response=>response.json());
window.runExport = async format => {
  const before = JSON.stringify(original);
  const {exportArtifact} = await import(${JSON.stringify(join(repository, 'src/features/artifacts/native/export-artifact.ts'))});
  const started = performance.now();
  const controller = new AbortController();
  const result = await exportArtifact(original,{format,signal:controller.signal,onProgress:(done,total)=>{document.querySelector('#status').textContent=format+' '+done+'/'+total}});
  const response = await fetch('/_capture/'+format,{method:'POST',body:result.blob});
  if(!response.ok)throw Error('capture upload failed');
  if(before!==JSON.stringify(original))throw Error('export mutated source document');
  if(document.querySelectorAll('.artifact-export-page').length)throw Error('export renderer leaked a mounted page');
  return {format,bytes:result.blob.size,milliseconds:performance.now()-started,warnings:result.warnings,immutable:true,mountedPages:0};
};
window.runCancelledExport = async () => {const {exportArtifact}=await import(${JSON.stringify(join(repository, 'src/features/artifacts/native/export-artifact.ts'))});const controller=new AbortController();controller.abort();try{await exportArtifact(original,{format:'pdf',signal:controller.signal});throw Error('cancelled export succeeded')}catch(error){return {name:error.name,cancelled:error.name==='AbortError'}}};
window.renderPptx = async () => {const {PPTXViewer}=await import(${JSON.stringify(join(repository, 'node_modules/pptxviewjs/dist/PptxViewJS.es.js'))});const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=810;document.body.append(canvas);const viewer=new PPTXViewer({canvas,slideSizeMode:'actual',autoExposeGlobals:false,autoChartRerenderDelayMs:0,enableThumbnails:false});try{await viewer.loadFile(await fetch('/_saved/fifty-pages.pptx').then(response=>response.arrayBuffer()));const count=viewer.getSlideCount();if(count!==50)throw Error('PPTX does not contain 50 slides');for(const index of [0,24,49]){await viewer.renderSlide(index,canvas,{scale:.75,quality:'high'});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await fetch('/_capture/pptx-page-'+(index+1)+'.png',{method:'POST',body:blob})}return{pages:count,rendered:[1,25,50],renderer:'pptxviewjs1.1.9'}}finally{viewer.destroy?.();canvas.remove()}};
window.runEmbedHtml = async () => {
  const snapshot=structuredClone(original),page=snapshot.pages[snapshot.pageOrder[0]];snapshot.pageOrder=[page.id];snapshot.pages={[page.id]:page};snapshot.assets={preview:{id:'preview',url:'/embed-preview.png',contentType:'image/png'}};
  page.nodeOrder=['embed'];page.nodes={embed:{id:'embed',type:'embed',x:30,y:30,width:800,height:500,rotation:0,parentId:null,style:{},embed:{source:'<script src="./support.js"></script><x-dc>{{title}}</x-dc>',format:'html',previewAssetId:'preview'}}};
  const {exportArtifact}=await import(${JSON.stringify(join(repository, 'src/features/artifacts/native/export-artifact.ts'))});const result=await exportArtifact(snapshot,{format:'html'});await fetch('/_capture/embed-offline.html',{method:'POST',body:result.blob});return{bytes:result.blob.size,warnings:result.warnings};
};
window.fixtureReady=true; document.querySelector('#status').textContent='ready';
`)
await build({ configFile: false, root: temporary, logLevel: 'warn', build: { outDir: join(temporary, 'dist'), target: 'esnext', chunkSizeWarningLimit: 2000 }, worker: { format: 'es' } })
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
    if (request.method === 'POST' && /^\/_capture\/(html|pdf|pptx|embed-offline\.html|pptx-page-(?:1|25|50)\.png)$/.test(pathname)) {
      const chunks = []; let size = 0
      for await (const chunk of request) { size += chunk.length; if (size > 256 * 1024 * 1024) throw Error('export too large'); chunks.push(chunk) }
      const name = pathname.split('/').at(-1)
      await writeFile(join(output, name.endsWith('.png') || name.endsWith('.html') ? name : `fifty-pages.${name}`), Buffer.concat(chunks)); response.end('saved'); return
    }
    if (/^\/_saved\/(?:fifty-pages\.(?:html|pdf|pptx)|embed-offline\.html)$/.test(pathname)) { response.end(await readFile(join(output, pathname.split('/').at(-1)))); return }
    const file = resolve(temporary, 'dist', `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`)
    if (!file.startsWith(join(temporary, 'dist') + '/')) throw Error('invalid path')
    response.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream')
    response.end(await readFile(file))
  } catch { response.statusCode = 404; response.end('not found') }
})
await new Promise(resolve => server.listen(5325, '127.0.0.1', resolve))
const chrome = spawn(process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9435', `--user-data-dir=${join(temporary, 'chromium')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
const errors = [], requests = [], browserLogs = []
chrome.stderr.on('data', () => {})
let socket
try {
  let browser
  for (let attempt = 0; attempt < 100; attempt++) {
    try { browser = await fetch('http://127.0.0.1:9435/json/version').then(response => response.json()); break } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
  }
  if (!browser) throw Error('Chromium did not start')
  const target = await fetch('http://127.0.0.1:9435/json/new?about:blank', { method: 'PUT' }).then(response => response.json())
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  let next = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id) { const callbacks = pending.get(message.id); pending.delete(message.id); message.error ? callbacks?.reject(Error(message.error.message)) : callbacks?.resolve(message.result) }
    if (message.method === 'Network.requestWillBeSent') {
      const url = message.params.request.url
      requests.push(url.startsWith('data:') ? `${url.slice(0, url.indexOf(';'))};sha256=${createHash('sha256').update(url).digest('hex')};encodedChars=${url.length}` : url.startsWith('blob:') ? 'blob:export-resource' : url)
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') browserLogs.push(message.params.args.map(arg => arg.value ?? arg.description))
  })
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  await call('Network.enable'); await call('Runtime.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  await call('Page.navigate', { url: 'http://127.0.0.1:5325/' })
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await call('Runtime.evaluate', { expression: 'window.fixtureReady===true', returnByValue: true })
    if (response.result?.value) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const results = []
  for (const format of ['html', 'pdf', 'pptx']) {
    const response = await call('Runtime.evaluate', { expression: `window.runExport(${JSON.stringify(format)})`, awaitPromise: true, returnByValue: true, timeout: 600000 })
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails))
    results.push(response.result.value)
    const { warnings, ...summary } = response.result.value
    console.log(JSON.stringify({ ...summary, warningCount: warnings.length }))
  }
  const embedResult = await call('Runtime.evaluate', { expression: 'window.runEmbedHtml()', awaitPromise: true, returnByValue: true, timeout: 120000 });if(embedResult.exceptionDetails)throw Error(JSON.stringify(embedResult.exceptionDetails))
  const cancelled = await call('Runtime.evaluate', { expression: 'window.runCancelledExport()', awaitPromise: true, returnByValue: true })
  const rendered = await call('Runtime.evaluate', { expression: 'window.renderPptx()', awaitPromise: true, returnByValue: true, timeout: 120000 })
  if (rendered.exceptionDetails) throw Error(JSON.stringify(rendered.exceptionDetails))
  // Managed Chromium blocks file:// navigation. Do not substitute another origin
  // for that acceptance gate; assert offline packaging separately and report it open.
  const offlineHtml = await readFile(join(output, 'fifty-pages.html'), 'utf8')
  const offlineEmbed = await readFile(join(output, 'embed-offline.html'), 'utf8')
  const imageSources = [...offlineHtml.matchAll(/<img[^>]*src="([^"]*)"/g)].map(match => match[1])
  if (imageSources.length !== 50 || imageSources.some(source => !source.startsWith('data:image/'))) throw Error('HTML images are not self-contained')
  if (offlineEmbed.includes('support.js') || offlineEmbed.includes('{{title}}') || offlineEmbed.includes('<iframe') || !offlineEmbed.includes('data:image/png;base64,')) throw Error('isolated preview was not packaged offline')
  const artifacts = await Promise.all(['html', 'pdf', 'pptx'].map(async format => { const bytes = await readFile(join(output, `fifty-pages.${format}`)); return { format, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } }))
  const report = { browser: browser.Browser, fixture: fixture.manifest, results, artifacts, cancellation: cancelled.result.value, independentPptx: rendered.result.value, offlineHtml:{packaging:'self-contained image/font data URLs',pages:50,images:imageSources.length,formulas:(offlineHtml.match(/class="katex"/g)??[]).length,fileOpening:'BLOCKED: managed Chromium file URL policy; not verified'}, offlineEmbed:{...embedResult.result.value,packaged:true,fileOpening:'BLOCKED: managed Chromium file URL policy; not verified',previewSha256:createHash('sha256').update(embedPreview).digest('hex')}, errors, browserLogs, requests: [...new Set(requests)] }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Evidence: ${output}`)
} finally {
  socket?.close(); chrome.kill('SIGTERM'); server.close()
  await new Promise(resolve => chrome.once('exit', resolve))
  await rm(temporary, { recursive: true, force: true })
}
