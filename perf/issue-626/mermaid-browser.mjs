// Exercise the actual deferred plugin in Chromium, including its existing strict renderer.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const bundle = await build({ stdin: { contents: `import {mermaid} from './src/components/assistant-ui/markdown-mermaid';
document.querySelector('button').onclick=async()=>{
 try {
  const diagram=mermaid.getMermaid({securityLevel:'strict',startOnLoad:false});
  const result=await diagram.render('diagram','graph TD; A[开始]-->B[完成]');
  document.querySelector('main').innerHTML=result.svg;
  if(!document.querySelector('main svg')||!document.querySelector('main').textContent.includes('完成'))throw Error('missing real diagram');
  let rejected=false;try{await diagram.render('bad','invalid diagram source')}catch{rejected=true}
  if(!rejected)throw Error('invalid diagram did not reject');
  await fetch('/result',{method:'POST',body:JSON.stringify({passed:true})});
 }catch(error){await fetch('/result',{method:'POST',body:JSON.stringify({passed:false,error:String(error)})})}
};`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', splitting: true, outdir: 'out', minify: true, metafile: true })
const files = new Map(bundle.outputFiles.map(file => ['/' + basename(file.path), file.text]))
const initial = new Set()
function visit(file) {
  if (initial.has('/' + basename(file))) return
  initial.add('/' + basename(file))
  const output = bundle.metafile.outputs[file]
  assert.ok(!Object.keys(output.inputs).some(name => /node_modules\/mermaid\//.test(name)), 'diagram renderer is in the initial graph')
  for (const dependency of output.imports) if (dependency.kind !== 'dynamic-import' && !dependency.external) visit(dependency.path)
}
visit('out/stdin.js')
let finish
const outcome = new Promise(done => { finish = done })
const loaded = []
const server = createServer(async (req, res) => {
  if (req.url === '/result') {
    let body = ''; for await (const chunk of req) body += chunk
    finish(JSON.parse(body)); res.end('ok')
  } else if (files.has(req.url)) {
    loaded.push(req.url); res.setHeader('Content-Type', 'text/javascript'); res.end(files.get(req.url))
  } else if (req.url === '/before') {
    if (loaded.some(file => !initial.has(file))) finish({ passed: false, error: 'ordinary prose loaded a diagram dependency' })
    res.end('ok')
  } else {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<p>普通消息先显示</p><button>显示图表</button><main></main><script type="module" src="/stdin.js"></script><script type="module">await new Promise(r=>setTimeout(r,100));await fetch('/before');document.querySelector('button').click()</script>`)
  }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const profile = await mkdtemp(resolve(tmpdir(), 'lingxi-mermaid-'))
const browser = spawn(process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless', '--no-first-run', '--no-proxy-server', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}`], { stdio: 'ignore', windowsHide: true })
let timer
try {
  const result = await Promise.race([outcome, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Mermaid browser timeout')), 30000) })])
  assert.equal(result.passed, true, JSON.stringify(result))
  console.log(JSON.stringify({ ...result, checks: ['no renderer request for prose', 'real flowchart SVG', 'invalid diagram rejection'], deferredRequests: loaded.filter(file => !initial.has(file)).length }))
} finally {
  clearTimeout(timer); browser.kill(); server.closeAllConnections(); server.close()
  // The uniquely created fixture profile is the only directory removed.
  if (resolve(profile).startsWith(resolve(tmpdir()) + sep)) await rm(profile, { recursive: true, force: true }).catch(() => {})
}
