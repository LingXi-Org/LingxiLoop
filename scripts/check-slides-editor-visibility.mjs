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
  '@/api/core/realtime': `export const ws={on:fn=>{window.fixtureEvents??=new Set();window.fixtureEvents.add(fn);return()=>window.fixtureEvents.delete(fn)}}`,
 '@/features/artifacts/api': `export const artifactsApi={editorGrant:async()=>{window.grants=(window.grants??0)+1;await new Promise(r=>setTimeout(r,80));if(window.offline)throw Object.assign(Error('Temporarily unavailable'),{status:503});if(window.deny)throw Object.assign(Error('Access revoked'),{status:403});return {url:'/editor',expiresAt:Date.now()+60000,write:true}}}`,
 '../api': `export const artifactsApi={editorGrant:async()=>{window.grants=(window.grants??0)+1;await new Promise(r=>setTimeout(r,80));if(window.offline)throw Object.assign(Error('Temporarily unavailable'),{status:503});if(window.deny)throw Object.assign(Error('Access revoked'),{status:403});return {url:'/editor',expiresAt:Date.now()+60000,write:true}}}`,
 '@/components/ResourceSkeleton': `export function ResourceSkeleton({label}){return <div data-loading>{label}</div>}`,
 '@/components/ui/button': `export function Button(p){return <button {...p}/>}`,
 '@/lib/userFacingError': `export const userFacingError=(e,f)=>f`,
}
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{ArtifactEditorFrame}from'./src/features/artifacts/components/ArtifactEditorFrame';import{warmEditor}from'./src/features/artifacts/editor-preload';
window.addEventListener('message',e=>{if(e.data?.type==='fixture-start'){window.childStarted=true;const f=document.querySelector('iframe');window.postMessage({type:'slides:context',nonce:new URL(f.src).hash.slice(11),context:${JSON.stringify(context)}},'*')}});window.childLoaded=false;window.received=0;window.addEventListener('message',e=>{if(e.data?.type==='fixture-load')window.childLoaded=true});
const nativeTimeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>nativeTimeout(fn,window.fastTimeout&&ms===30000?100:ms,...args);const root=createRoot(document.getElementById('root'));
const nativeFetch=window.fetch;window.fetch=(url,options)=>{if(String(url).endsWith('/warm-optional.js'))window.warmStarted=true;return nativeFetch(url,options)};let warmSettled=false;void warmEditor('slides').then(()=>warmSettled=true,()=>warmSettled=true);
const wait=async(fn,label='condition')=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(label+' timed out')};
try{await wait(()=>window.warmStarted,'warm-up fetch');root.render(<ArtifactEditorFrame artifactId="deck" kind="slides" title="Fixture" onEditorContext={()=>window.received++}/>);await wait(()=>document.querySelector('iframe'),'iframe mount during warm-up');if(warmSettled)throw Error('warm-up unexpectedly completed');await wait(()=>window.childStarted);await new Promise(r=>setTimeout(r,80));
if(!document.querySelector('[data-loading]'))throw Error('untrusted message hid loading');
await fetch('/release-context');await wait(()=>window.received>0);await wait(()=>!document.querySelector('[data-loading]'));
if(window.childLoaded)throw Error('fixture load unexpectedly completed');
if(document.querySelector('iframe').sandbox.contains('allow-same-origin'))throw Error('sandbox relaxed');
window.fastTimeout=true;root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other"/>);
await wait(()=>document.querySelector('[role="alert"]'));
if(!document.body.textContent.includes('请重试'))throw Error('no recovery action');
window.fastTimeout=false;window.childStarted=false;document.querySelector('button').click();await wait(()=>document.querySelector('iframe'));
if(window.grants!==3)throw Error('retry did not request a new grant');
await wait(()=>window.childStarted);await fetch('/release-context');await wait(()=>!document.querySelector('[data-loading]'));
const retained=document.querySelector('iframe');
root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other" visible={false}/>);
await wait(()=>!retained.checkVisibility({visibilityProperty:true}));
root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other" visible={true}/>);
await new Promise(r=>setTimeout(r,20));if(retained.checkVisibility({visibilityProperty:true}))throw Error('cached content revealed before reauthorization');
await wait(()=>retained.checkVisibility({visibilityProperty:true}));if(document.querySelector('iframe')!==retained)throw Error('retained editor was rebuilt');
if(window.grants!==4)throw Error('retained re-open did not request current authorization');
root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other" visible={false}/>);await wait(()=>!retained.checkVisibility({visibilityProperty:true}));window.offline=true;
root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other" visible={true}/>);await wait(()=>document.querySelector('[role="alert"]'));
if(document.querySelector('iframe')!==retained||retained.checkVisibility({visibilityProperty:true}))throw Error('temporary authorization failure discarded or exposed the draft');
window.offline=false;document.querySelector('button').click();await wait(()=>retained.checkVisibility({visibilityProperty:true}));if(document.querySelector('iframe')!==retained)throw Error('authorization retry discarded the draft');

root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other" visible={false}/>);await wait(()=>!retained.checkVisibility({visibilityProperty:true}));window.deny=true;
root.render(<ArtifactEditorFrame key="timeout" artifactId="other" kind="slides" title="Other" visible={true}/>);await wait(()=>document.querySelector('[role="alert"]'));
if(document.querySelector('iframe'))throw Error('revocation retained private content');
window.deny=false;window.childStarted=false;root.render(<ArtifactEditorFrame key="deleted" artifactId="deleted" kind="slides" title="Deleted"/>);await wait(()=>window.childStarted);await fetch('/release-context');await wait(()=>!document.querySelector('[data-loading]'));
window.fixtureEvents.forEach(listener=>listener({type:'artifact.changed',artifactId:'deleted',kind:'artifact.deleted'}));await wait(()=>!document.querySelector('iframe'));



await fetch('/result',{method:'POST',body:JSON.stringify({passed:true,checks:['pending optional warm-up cannot block iframe mount','wrong source/nonce/schema rejected','valid child context reveals mounted editor before load','sandbox remains opaque','missing application handshake times out with retry','retry obtains a fresh grant','retained iframe waits for fresh authorization','reopen preserves actual frame','denial releases private content','temporary access-check failure keeps a concealed draft','access-check retry reuses the draft','deletion releases the frame'],received:window.received})});
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
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.url === '/artifact-editor/preload.json') { res.setHeader('Content-Type','application/json');res.end(JSON.stringify({design:[],slides:['/warm-optional.js']}));return }
  if (req.url === '/warm-optional.js') { stalled.push(res); return }
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
