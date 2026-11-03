// Actual DesktopApp/ArtifactEditorFrame ownership with synthetic documents and ACL.
// This checks cross-view lifecycle, not editor memory or production authorization.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const mobile = process.argv.includes('--mobile')
const state = (name, value) => `import{create}from'zustand';export const ${name}=create(()=>(${value}));`
const nothing = name => `export function ${name}(){return null}`
const mocks = {
  '@/stores/app': state('useApp', `{view:'conversations',selectedConversationId:'c1',mobileConversationOpen:true,navigationPending:false,navigationError:null,setView(view){useApp.setState({view,mobileConversationOpen:view==='conversations'})}}`),
  '@/stores/auth': state('useAuth', `{user:{id:'u1'},activeCompanyId:'company',companies:[]}`),
  '@/features/knowledge/workspace': state('useWorkspace', `{selectedId:'p1',list:[]}`),
  '@/features/conversations/store': state('useConversations', `{list:[{id:'c1'}]}`),
  '@/stores/surface': state('useSurface', `{surface:null}`),
  '@/features/settings/store': state('useSettingsDialog', `{open:false}`),
  '@/features/knowledge/state': `export const useKnowledgeSources={getState:()=>({close(){}})}`,
  '@/stores/uiCommands': `export const useUiCommands={getState:()=>({dispatch(){}})}`,
  '@/api/core/realtime': `export const ws={on:()=>()=>{}}`,
  '@/features/artifacts/api': `export const artifactsApi={editorGrant:async(id)=>{window.grants=(window.grants??0)+1;await new Promise(r=>setTimeout(r,80));if(window.deny)throw Object.assign(Error('Access revoked'),{status:403});return {url:location.origin+'/editor/'+id+'/',isolatedUrl:location.origin.replace('127.0.0.1','localhost')+'/editor/'+id+'/',expiresAt:Date.now()+(window.expiring?400:60000),write:true}}}`,
  '@/lib/userFacingError': `export const userFacingError=(error,fallback)=>fallback`,
  '@/features/cases/CasesPage': nothing('CasesPage'),
  '@/features/documents/components/DocumentPeekPane': nothing('DocumentPeekPane'),
  '@/features/documents/components/DocumentSkeleton': nothing('DocumentSkeleton'),
  './DashboardSkeleton': nothing('DashboardSkeleton'),
  '@/components/CommandPalette': nothing('CommandPalette'),
  '@/features/settings/SettingsDialog': nothing('SettingsDialog'),
  '@/components/WorkspaceChrome': nothing('SourceDetailOverlay'),
  '@/features/conversations/components/ConversationsPane': nothing('ConversationsPane'),
  '@/components/shell/CourseNav': nothing('CourseNav'),
  '@/components/shell/SlidesSidebarLayout': `export function SlidesSidebarLayout({children}){return <div>{children}</div>}`,
  '@/components/ui/resizable': `export function ResizablePanelGroup({children,className}){return <div className={className} style={{display:'flex',height:'100%'}}>{children}</div>}export function ResizablePanel({children,id,className,'data-shell-panel-hidden':hidden}){return <div id={id} className={className} data-shell-panel-hidden={hidden} style={{flex:1,height:'100%'}}>{children}</div>}export function ResizableHandle(){return null}`,
  '@/lib/commands': `export const actionForKeyboardEvent=()=>null`,
  '@/lib/navigation': `export const retryWebNavigation=async()=>{}`,
  './WorkspaceRail': nothing('WorkspaceRail'),
  './InfoPane': nothing('InfoPane'),
  './ThreadDrawer': nothing('ThreadDrawer'),
  './PersonalDashboard': `export function PersonalDashboard(){return <p>Other view</p>}`,
  './ChatPane': `import{ArtifactEditorFrame}from'@/features/artifacts/components/ArtifactEditorFrame';import{useWorkspace}from'@/features/knowledge/workspace';export function ChatPane({visible}){const id=useWorkspace(s=>s.selectedId);return <ArtifactEditorFrame artifactId={'board-'+id} kind="design" title="Board" visible={visible}/>}`,
  '@/features/slides/SlidesPage': `import{ArtifactEditorFrame}from'@/features/artifacts/components/ArtifactEditorFrame';export function SlidesPage({projectId,active}){return <ArtifactEditorFrame artifactId={'deck-'+projectId} kind="slides" title="Deck" visible={active}/>}`,
  '@/components/ResourceSkeleton': `export function ResourceSkeleton(){return <p data-loading>Loading</p>}`,
  '@/components/ui/button': `export function Button(p){return <button {...p}/>}`,
}
const entry = `import React from'react';import{createRoot}from'react-dom/client';import{DesktopApp}from'./src/desktop/DesktopApp';import{useApp}from'@/stores/app';import{useAuth}from'@/stores/auth';import{useWorkspace}from'@/features/knowledge/workspace';
const root=createRoot(document.getElementById('root'));root.render(<DesktopApp learningSpaces={{spaces:[],activeSpace:null,pending:false,loading:false,error:null}}/>);
const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(fn())return;await new Promise(r=>setTimeout(r,20))}throw Error(label+' timed out')};const assert=(v,m)=>{if(!v)throw Error(m)};
const frame=kind=>document.querySelector('[data-artifact-editor='+kind+'] iframe');const usable=kind=>frame(kind)?.checkVisibility({visibilityProperty:true})&&!document.querySelector('[data-artifact-editor='+kind+'] [data-loading]');
try{
 await wait(()=>usable('design'),'first Design');const board=frame('design'),boardWindow=board.contentWindow,boardWidth=board.clientWidth;
 useApp.getState().setView('slides');await wait(()=>usable('slides'),'first Slides');const deck=frame('slides'),deckWindow=deck.contentWindow;assert(frame('design')===board,'leaving chat discarded Design');assert(board.clientWidth===boardWidth&&board.clientHeight>0,'hiding the chat collapsed the editor viewport');assert(document.querySelectorAll('iframe').length===2,'retention exceeds two editor frames');
 useApp.getState().setView('learning');await wait(()=>!board.checkVisibility({visibilityProperty:true})&&!deck.checkVisibility({visibilityProperty:true}),'hide both editors');
 useApp.getState().setView('conversations');await new Promise(r=>setTimeout(r,20));assert(!board.checkVisibility({visibilityProperty:true}),'Design exposed cached content before current authorization');await wait(()=>usable('design'),'Design return');assert(frame('design')===board&&board.contentWindow===boardWindow,'Design returned through a new iframe');
 useApp.getState().setView('slides');await wait(()=>usable('slides'),'Slides return');assert(frame('slides')===deck&&deck.contentWindow===deckWindow,'Slides returned through a new iframe');
 useWorkspace.setState({selectedId:'p2'});await wait(()=>usable('slides')&&frame('slides')!==deck,'project switch');assert(!board.isConnected&&!deck.isConnected,'project switch retained old private frames');const projectDeck=frame('slides');
 useAuth.setState({user:{id:'u2'}});await wait(()=>usable('slides')&&frame('slides')!==projectDeck,'account switch');assert(!projectDeck.isConnected,'account switch retained the previous user frame');
 useApp.setState({navigationPending:true});await wait(()=>document.querySelectorAll('iframe').length===0,'navigation purges editors');await wait(()=>[...document.querySelectorAll('[data-loading]')].some(node=>node.checkVisibility({visibilityProperty:true})),'Slides navigation placeholder');useApp.setState({navigationPending:false});await wait(()=>usable('slides'),'navigation completes');
 useWorkspace.setState({selectedId:null});await wait(()=>document.querySelectorAll('iframe').length===0,'empty workspace purges editors');await wait(()=>[...document.querySelectorAll('p')].some(node=>node.textContent==='Other view'&&node.checkVisibility({visibilityProperty:true})),'empty Slides workspace content');useWorkspace.setState({selectedId:'p2'});await wait(()=>usable('slides'),'workspace selected');
 useApp.getState().setView('learning');await wait(()=>!frame('slides').checkVisibility({visibilityProperty:true}),'hide for revocation');window.deny=true;useApp.getState().setView('slides');await wait(()=>document.querySelector('[role=alert]'),'revoked access');assert(!frame('slides'),'revocation retained the cached document');
 window.deny=false;window.expiring=true;useAuth.setState({user:{id:'u3'}});await wait(()=>usable('slides'),'short grant');const expired=frame('slides');useApp.getState().setView('learning');await new Promise(r=>setTimeout(r,500));assert(expired.isConnected&&!expired.checkVisibility({visibilityProperty:true}),'expiry timer destroyed or revealed a local draft');useApp.getState().setView('slides');await wait(()=>usable('slides')&&frame('slides')!==expired,'expired grant reauthorization');assert(!expired.isConnected,'an expired grant was reused');
 await fetch('/result',{method:'POST',body:JSON.stringify({passed:true,mobile:document.querySelector('[data-mobile]')?.dataset.mobile,checks:['one Design and one Slides maximum','same DOM iframe and WindowProxy across views','reauthorize before visible','project and account purge','navigation and empty-workspace content stay visible','revocation releases content','expiry does not time-evict a concealed draft','expired reopen reauthorizes and replaces the old grant'],grants:window.grants})});
}catch(e){await fetch('/result',{method:'POST',body:JSON.stringify({passed:false,error:e.message,body:document.body.innerText.slice(0,700),grants:window.grants})})}`
const bundle = await build({ stdin: { contents: entry, loader: 'jsx', resolveDir: root }, bundle: true, write: false, format: 'esm', jsx: 'automatic',
  alias: { '@': resolve(root, 'src') }, define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'empty' },
  plugins: [{ name: 'unrelated-boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : null)
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: root }))
  } }],
})
let finish
const result = new Promise(resolve => { finish = resolve })
const context = { slideId: 'one', selectedElementIds: [], selection: [], selectedSlides: [], selectedText: '', slideTitle: 'Saved', slideIndex: 1, slideCount: 1, mode: 'edit', dirty: false, version: null }
const retentionCss=await readFile(resolve(root,'src/features/design/design-workspace.css'),'utf8')
const server = createServer(async (req, res) => {
  if (req.url === '/result') { let raw='';for await(const part of req)raw+=part;finish(JSON.parse(raw));res.end('ok');return }
  if (req.url === '/test.js') {res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return}
  res.setHeader('Content-Type','text/html')
  if (req.url.startsWith('/editor/')) {res.end('<h1>Saved document</h1><script>const nonce=new URLSearchParams(location.hash.slice(1)).get("workspace");parent.postMessage(nonce?{type:"slides:context",nonce,context:'+JSON.stringify(context)+'}:{__frame_reveal_ready:true},"*");</script>');return}
  res.end('<style>'+retentionCss+'html,body,#root{height:100%;margin:0}.h-full{height:100%}.h-dvh{height:100dvh}.flex{display:flex}.flex-1{flex:1}.flex-col{flex-direction:column}.relative{position:relative}iframe{height:100%;width:100%}[hidden]{display:none!important}</style><div id="root"></div><script type="module" src="/test.js"></script>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const profile = await mkdtemp(resolve(tmpdir(), 'artifact-views-'))
const browser = spawn(process.env.CHROME_PATH ?? '/usr/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--no-first-run',`--window-size=${mobile?600:1440},1000`,`--user-data-dir=${profile}`,`http://127.0.0.1:${server.address().port}`], {stdio:'ignore'})
let timer
try {const outcome=await Promise.race([result,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Browser fixture timeout')),45000)})]);console.log(JSON.stringify(outcome));assert.equal(outcome.passed,true)}
finally {clearTimeout(timer);browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(profile,{recursive:true,force:true}).catch(()=>{})}
