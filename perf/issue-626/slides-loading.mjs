// Real workspace/frame lifecycle with deferred API and assistant dependencies.
// The child is a small fixture: this measures the host waterfall, not editor parse time.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.split('=')[1]
if (baseline) assert.match(baseline, /^[a-f0-9]{7,40}$/)
const context = { slideId: 'one', selectedElementIds: [], selection: [], selectedSlides: [], selectedText: '',
  slideTitle: 'Saved page', slideIndex: 1, slideCount: 1, mode: 'edit', dirty: false, version: null }
const mocks = {
  '@/features/artifacts/api': `export const artifactsApi={
    slideWorkspace:()=>window.workspaceRequest(), editorContext:()=>window.contextRequest(),
    editorGrant:async()=>{window.grants++;window.grantStarted=performance.now();return {url:'/editor'}},revisions:async()=>({current:'one',revisions:[]})}`,
  '../api': `export {artifactsApi} from '@/features/artifacts/api'`,
  '@/features/conversations/store': `export const useConversations=selector=>selector({list:[]});useConversations.getState=()=>({list:window.knownChannels??[],reload:()=>window.reloadRequest()})`,
  '@/features/agents/state': `export const useParticipants={getState:()=>({refresh:()=>window.rosterRequest()})}`,
  '@/features/chat/runtime': `export function ConversationRuntimeProvider({children,beforeSend}){window.beforeSend=beforeSend;return children}`,
  '@/features/chat/runtime/runtime': `export const useConversationPresence=()=>({activeAgentIds:[]})`,
  '@/features/chat/runtime/store': `export const useChatThreadStore=selector=>selector({conversations:{}})`,
  '@/features/chat/components/ConversationThread': `export function ConversationThread(){return <button data-assistant>Send</button>}`,
  './SlidesConversation': `import {SlidesConversation as Native} from ${JSON.stringify(resolve(root, 'src/features/slides/SlidesConversation.tsx').replaceAll('\\', '/'))};await window.conversationModule;export function SlidesConversation(props){window.conversationRender=props.conversationId;return <Native {...props}/>}`,
  '@/components/ResourceSkeleton': `export function ResourceSkeleton({label}){return <div data-loading>{label}</div>}`,
  '@/stores/app': `export const useApp={getState:()=>({selectConversation:id=>window.origin=id})}`,
  '@/lib/userFacingError': `export const userFacingError=(reason,fallback)=>fallback`,
}
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{SlidesWorkspace}from'./src/features/slides/SlidesWorkspace';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('condition timed out')};
const check=(value,message)=>{if(!value)throw Error(message)};
let workspace=deferred(),reload=deferred(),roster=deferred(),saved=deferred();const conversationModule=deferred();window.conversationModule=conversationModule.promise;
window.workspaceRequest=()=>workspace.promise;window.reloadRequest=()=>reload.promise;window.rosterRequest=()=>roster.promise;
window.contextRequest=()=>saved.promise;window.grants=0;
const root=createRoot(document.getElementById('root'));
const render=key=>root.render(<SlidesWorkspace key={key} artifactId={key} title="Saved deck" onClose={()=>{}}/>);
const result={checks:[]};
try{
 render('one');await wait(()=>document.querySelector('iframe'));
 const frame=document.querySelector('iframe');await wait(()=>!document.querySelector('[data-artifact-editor] [data-loading]'));
 check(!document.querySelector('[data-assistant]'),'assistant used unresolved workspace');
 check(!frame.sandbox.contains('allow-same-origin'),'sandbox was relaxed');
 result.checks.push('authorized editor ready while workspace request is pending');
 conversationModule.resolve();await wait(()=>window.conversationRender===null);
 workspace.resolve({conversationId:'chat',sourceConversationId:'source-chat'});await new Promise(r=>setTimeout(r,30));
 check(!document.querySelector('[data-assistant]'),'assistant used unresolved roster');
 reload.resolve();await wait(()=>document.querySelector('[data-assistant]'));roster.resolve();
 check(document.querySelector('iframe')===frame&&window.grants===1,'assistant readiness remounted editor');
 document.querySelector('[aria-label="打开来源对话"]').click();check(window.origin==='source-chat','source action lost async identity');
 let sent=false;const sending=window.beforeSend().then(()=>{sent=true});await new Promise(r=>setTimeout(r,30));
 check(!sent,'send ignored unsaved editor context');saved.resolve();await sending;
 result.checks.push('assistant code loads independently; roster does not block; frame/source retained; send waits for context');
 workspace=deferred();reload=deferred();roster=deferred();render('failed');await wait(()=>window.grants===2);
 const retained=document.querySelector('iframe');workspace.reject(Error('assistant unavailable'));await wait(()=>document.querySelector('[role="alert"]'));
 check(document.querySelector('iframe')===retained,'assistant error discarded editor');
 workspace=deferred();[...document.querySelectorAll('button')].find(button=>button.textContent==='重试').click();
 workspace.resolve({conversationId:'retry-chat',sourceConversationId:null});reload.resolve();roster.resolve();await wait(()=>document.querySelector('[data-assistant]'));
 check(document.querySelector('iframe')===retained&&window.grants===2,'assistant retry remounted editor');
 result.checks.push('assistant failure and retry preserve live editor');
 workspace=deferred();reload=deferred();window.knownChannels=[{id:'known-chat'}];render('known');await wait(()=>window.grants===3);
 workspace.resolve({conversationId:'known-chat',sourceConversationId:null});await wait(()=>document.querySelector('[data-assistant]'));
 reload.resolve();result.checks.push('an already authorized assistant channel opens without waiting for the list refresh');
 await fetch('/result',{method:'POST',body:JSON.stringify({...result,passed:true})});
}catch(error){await fetch('/result',{method:'POST',body:JSON.stringify({...result,passed:false,error:error.message})})}`
const measurement = `import React from 'react';import{createRoot}from'react-dom/client';import{SlidesWorkspace}from'./src/features/slides/SlidesWorkspace';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function sample(){
 window.grants=0;window.grantStarted=0;
 window.workspaceRequest=async()=>{await pause(300);return {conversationId:'chat',sourceConversationId:'source-chat'}};
 window.reloadRequest=()=>pause(400);window.rosterRequest=()=>pause(500);window.contextRequest=async()=>{};
 const root=createRoot(document.getElementById('root')),started=performance.now();
 root.render(<SlidesWorkspace artifactId="deck" title="Saved deck" onClose={()=>{}}/>);
 let editorReadyMs,assistantReadyMs;
 while(!editorReadyMs||!assistantReadyMs){
   if(!editorReadyMs&&document.querySelector('iframe')&&!document.querySelector('[data-artifact-editor] [data-loading]'))editorReadyMs=performance.now()-started;
   if(!assistantReadyMs&&document.querySelector('[data-assistant]'))assistantReadyMs=performance.now()-started;
   if(performance.now()-started>10000)throw Error('sample timeout');await pause(5);
 }
 const result={editorReadyMs,assistantReadyMs,grantStartedMs:window.grantStarted-started,grants:window.grants};
 root.unmount();return result;
}`
async function bundle(contents, revision) {
  const result = await build({
  stdin: { contents, loader: 'jsx', resolveDir: root }, bundle: true, write: false, format: 'esm', jsx: 'automatic',
  alias: { '@': resolve(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'fixture', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : null)
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: root }))
    if (revision) builder.onLoad({ filter: /src[\\/]features[\\/]slides[\\/](?:SlidesWorkspace|artifact-surface)\.tsx$/ }, args => ({
      contents: execFileSync('git', ['show', `${revision}:${relative(root, args.path).replaceAll('\\', '/')}`], { cwd: root, encoding: 'utf8' }), loader: 'tsx',
    }))
  } }],
  })
  return result.outputFiles[0].text
}
const bundles = baseline ? { '/baseline.js': await bundle(measurement, baseline), '/candidate.js': await bundle(measurement) }
  : { '/test.js': await bundle(entry) }
const paired = `const before=await import('/baseline.js'),after=await import('/candidate.js'),samples=[];
try{for(let run=0;run<10;run++)for(const [variant,module] of [['baseline',before],['candidate',after]])samples.push({run:run+1,variant,...await module.sample()});
const summary=Object.fromEntries(['baseline','candidate'].map(variant=>[variant,Object.fromEntries(['editorReadyMs','assistantReadyMs','grantStartedMs'].map(metric=>[metric,Object.fromEntries([.5,.75,.95].map(p=>['p'+p*100,samples.filter(s=>s.variant===variant).map(s=>s[metric]).sort((a,b)=>a-b)[Math.ceil(10*p)-1]]))]))]));
const passed=summary.candidate.editorReadyMs.p75<summary.baseline.editorReadyMs.p75*.6&&samples.every(s=>s.grants===1);
await fetch('/result',{method:'POST',body:JSON.stringify({passed,baseline:${JSON.stringify(baseline)},measuredAt:new Date().toISOString(),scope:'Real host and ArtifactEditorFrame; synthetic workspace 300ms, conversation reload 400ms, roster 500ms, child 50ms. Excludes editor bundle parse and live API/IM.',browser:navigator.userAgent,samples,summary})});
}catch(error){await fetch('/result',{method:'POST',body:JSON.stringify({passed:false,error:error.message,samples})})}`
let finish
const result = new Promise(resolve => { finish = resolve })
const server = createServer(async (request, response) => {
  if (request.url === '/result') {
    let body = ''
    for await (const chunk of request) body += chunk
    finish(JSON.parse(body)); response.end('ok')
  } else if (bundles[request.url]) {
    response.setHeader('Content-Type', 'text/javascript'); response.end(bundles[request.url])
  } else if (request.url === '/editor') {
    if (baseline) await new Promise(resolve => setTimeout(resolve, 50))
    response.setHeader('Content-Type', 'text/html')
    response.end(`<button>Saved page</button><script>parent.postMessage({type:'slides:context',nonce:new URLSearchParams(location.hash.slice(1)).get('workspace'),context:${JSON.stringify(context)}},'*')</script>`)
  } else {
    response.setHeader('Content-Type', 'text/html')
    response.end(`<div id="root"></div>${baseline ? `<script type="module">${paired}</script>` : '<script type="module" src="/test.js"></script>'}`)
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = await mkdtemp(resolve(tmpdir(), 'slides-workspace-'))
const browser = spawn(process.env.CHROME_PATH ?? '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu',
  '--no-first-run', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}`], { stdio: 'ignore' })
let timer
try {
  const outcome = await Promise.race([result, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error('Browser fixture timeout')), baseline ? 60_000 : 30_000)
    browser.once('error', reject)
  })])
  console.log(JSON.stringify(outcome))
  assert.equal(outcome.passed, true)
} finally {
  clearTimeout(timer); browser.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  // Only the mkdtemp directory created above is removed.
  await rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
}
