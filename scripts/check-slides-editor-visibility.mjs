// Actual ArtifactEditorFrame with a child resource that never completes.
// Fixture grants/context only; no production login, browser or model calls.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const context = { slideId:'one',selectedElementIds:[],selection:[],selectedSlides:[],selectedText:'',slideTitle:'Saved page',slideIndex:1,slideCount:1,mode:'edit',dirty:false,version:null }
const mocks = {
 '@/features/artifacts/api': `export const artifactsApi={editorGrant:async()=>{window.grants=(window.grants??0)+1;return {url:'/editor'}}}`,
 '../api': `export const artifactsApi={editorGrant:async()=>{window.grants=(window.grants??0)+1;return {url:'/editor'}}}`,
 '@/components/ResourceSkeleton': `export function ResourceSkeleton({label}){return <div data-loading>{label}</div>}`,
 '@/components/ui/button': `export function Button(p){return <button {...p}/>}`,
 '@/lib/userFacingError': `export const userFacingError=(e,f)=>f`,
}
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{ArtifactEditorFrame}from'./src/features/artifacts/components/ArtifactEditorFrame';
window.addEventListener('message',e=>{if(e.data?.type==='fixture-start'){window.childStarted=true;const f=document.querySelector('iframe');window.postMessage({type:'slides:context',nonce:new URL(f.src).hash.slice(11),context:${JSON.stringify(context)}},'*')}});window.childLoaded=false;window.received=0;window.addEventListener('message',e=>{if(e.data?.type==='fixture-load')window.childLoaded=true});
const nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,window.fastTimeout&&ms===30000?100:ms,...args);const root=createRoot(document.getElementById('root'));root.render(<ArtifactEditorFrame artifactId="deck" kind="slides" title="Fixture" onEditorContext={()=>window.received++}/>);
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error('condition timed out')};
try{await wait(()=>document.querySelector('iframe'));await wait(()=>window.childStarted);await new Promise(r=>setTimeout(r,80));
if(!document.querySelector('[data-loading]'))throw Error('untrusted message hid loading');
await fetch('/release-context');await wait(()=>window.received>0);await wait(()=>!document.querySelector('[data-loading]'));
if(window.childLoaded)throw Error('fixture load unexpectedly completed');
if(document.querySelector('iframe').sandbox.contains('allow-same-origin'))throw Error('sandbox relaxed');
window.fastTimeout=true;root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other"/>);
await wait(()=>document.querySelector('[role="alert"]'));
if(!document.body.textContent.includes('请重试'))throw Error('no recovery action');
window.fastTimeout=false;document.querySelector('button').click();await wait(()=>document.querySelector('iframe'));
if(window.grants!==3)throw Error('retry did not request a new grant');

await fetch('/result',{method:'POST',body:JSON.stringify({passed:true,checks:['wrong source/nonce/schema rejected','valid child context reveals mounted editor before load','sandbox remains opaque','missing application handshake times out with retry','retry obtains a fresh grant'],received:window.received})});
}catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({passed:false,error:e.message,childLoaded:window.childLoaded,received:window.received})})}`
const bundle = await build({
  stdin: { contents: entry, loader: 'jsx', resolveDir: root },
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  alias: { '@': resolve(root, 'src') },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'fixture',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : null,
        )
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          contents: mocks[args.path],
          loader: 'jsx',
          resolveDir: root,
        }))
      },
    },
  ],
})
const stalled=[];let releaseContext;
let finish
const result = new Promise((r) => {
  finish = r
})
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*')
  if (req.url === '/blocked') { stalled.push(res); return }
  if (req.url === '/release-context') { releaseContext(); res.end('ok'); return }
  if (req.url === '/context-wait') { releaseContext=()=>res.end('ok'); return }
  if (req.url === '/editor') {
    res.setHeader('Content-Type','text/html');res.end(`<div>Saved page</div><script>
    const nonce=new URLSearchParams(location.hash.slice(1)).get('workspace'),context=${JSON.stringify(context)};
    onload=()=>parent.postMessage({type:'fixture-load'},'*');
    parent.postMessage({type:'fixture-start'},'*');
    parent.postMessage({type:'slides:context',nonce:'wrong',context},'*');
    parent.postMessage({type:'slides:context',nonce,context:{bad:true}},'*');
    fetch('/context-wait').then(()=>parent.postMessage({type:'slides:context',nonce,context},'*'));
    </script><img src="/blocked">`);return
  }
  if (req.url === '/result') {
    let raw = ''
    for await (const c of req) raw += c
    finish(JSON.parse(raw))
    res.end('ok')
  } else if (req.url === '/test.js') {
    res.setHeader('Content-Type', 'text/javascript')
    res.end(bundle.outputFiles[0].text)
  } else {
    res.setHeader('Content-Type', 'text/html')
    res.end('<div id="root"></div><script type="module" src="/test.js"></script>')
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const profile = await mkdtemp(resolve(tmpdir(), 'slides-retention-'))
const browser = spawn(
  process.env.CHROME_PATH ?? '/usr/bin/chromium',
  [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${server.address().port}`,
  ],
  { stdio: 'ignore' },
)
let timer
try {
  const outcome = await Promise.race([
    result,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Browser fixture timeout')), 30_000)
    }),
  ])
  console.log(JSON.stringify(outcome))
  assert.equal(outcome.passed, true)
} finally {
  clearTimeout(timer)
  browser.kill()
  for(const response of stalled)response.end();server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
