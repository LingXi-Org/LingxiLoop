// Focused real-browser ownership regression; backend/IM are deliberately absent.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const mocks = {
  '@/features/artifacts/api': `export const artifactsApi={listSlides:async()=>window.decks,slideWorkspace:async()=>{window.rechecks++;await new Promise(r=>setTimeout(r,80));if(window.deny)throw Error('Access revoked');return {}}}`,
  '@/api/core/realtime': `export const ws={on:fn=>{window.refreshSlides=()=>fn({type:'artifact.changed',artifactKind:'slides',kind:'workspace.updated'});return()=>{}}}`,
  '@/lib/confirmAction': `export const confirmSensitiveAction=async()=>false,promptSensitiveAction=async()=>null`,
  './SlidesWorkspace': `import{useEffect,useState}from'react';export function SlidesWorkspace({artifactId,title,onClose}){const[id]=useState(()=>++window.mounts);useEffect(()=>()=>{window.unmounts++},[]);return <section data-workspace={artifactId} data-instance={id}><h2>{title}</h2><iframe title="Fixture editor"/><button onClick={onClose} data-close>Close</button></section>}`,
}
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{SlidesPage}from'./src/features/slides/SlidesPage';
window.mounts=0;window.unmounts=0;window.rechecks=0;window.decks=['a','b'].map(id=>({id,title:id,updatedAt:'2026-10-31T00:00:00Z',fileCount:1}));
const root=createRoot(document.getElementById('root'));root.render(<SlidesPage projectId="project-a"/>);
const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,20))}throw Error('UI condition timed out')};
const click=s=>{const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click()},visible=()=>!!document.querySelector('[data-workspace]')&&!document.querySelector('[data-workspace]').closest('[hidden]');
const assert=(v,m)=>{if(!v)throw Error(m)};
try{
 await wait(()=>document.querySelector('[data-artifact-open-trigger="a"]'));click('[data-artifact-open-trigger="a"]');await wait(visible);
 const first=document.querySelector('[data-workspace]');click('[data-close]');await wait(()=>!visible());assert(document.querySelector('[data-workspace]')===first,'close discarded the live frame');
 click('[data-artifact-open-trigger="a"]');assert(!visible(),'cached content appeared before authorization');await wait(visible);assert(window.rechecks===1,'reopen did not reauthorize');assert(document.querySelector('[data-workspace]')===first&&window.mounts===1,'reopen remounted the workspace');
 click('[data-close]');await wait(()=>!visible());click('[data-artifact-open-trigger="b"]');await wait(()=>visible()&&document.querySelector('[data-workspace]').dataset.workspace==='b');assert(window.unmounts===1,'switching decks retained a second workspace');
 click('[data-close]');await wait(()=>!visible());window.deny=true;click('[data-artifact-open-trigger="b"]');await wait(()=>!document.querySelector('[data-workspace]'));assert(window.mounts===2,'denied content was remounted');
 window.deny=false;click('[data-artifact-open-trigger="a"]');await wait(visible);root.render(<SlidesPage projectId="project-b"/>);await wait(()=>!document.querySelector('[data-workspace]'));
 await fetch('/result',{method:'POST',body:JSON.stringify({passed:true,checks:['same iframe on re-open','authorization before visibility','revocation removes retained content','one retained deck','project switch releases workspace'],mounts:window.mounts,unmounts:window.unmounts,rechecks:window.rechecks})});
}catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({passed:false,error:e.message})})}`
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
let finish
const result = new Promise((r) => {
  finish = r
})
const server = createServer(async (req, res) => {
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
  server.closeAllConnections()
  await new Promise((r) => server.close(r))
  await rm(profile, { recursive: true, force: true }).catch(() => {})
}
