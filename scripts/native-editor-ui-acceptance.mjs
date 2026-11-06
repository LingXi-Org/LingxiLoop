#!/usr/bin/env node
/** Isolated HTTP-fixture UI diagnostic, NOT full API acceptance or a benchmark.
 * Run: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
 *   node --import tsx scripts/native-editor-ui-acceptance.mjs --mode=both --browser=/usr/bin/chromium --output=/tmp/lingxi-ui
 * Uses installed Vite/React and a separately available Playwright package. No SDK,
 * real credentials, database, external service or general E2E framework is used.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createFixture } from './native-artifact-fixture.mjs'
import { createVisualFixture } from './native-editor-visual-fixture.mjs'
import { applyOperations, prepareBatch } from '../shared/artifact-operations.ts'
import { createTableNode } from '../shared/artifact-tables.ts'
import { createCanvasPage, createCanvasContents, canvasPages, renameCanvasPage, artifactPageIds } from '../shared/artifact-canvas-pages.ts'
import {canvasPenNode} from '../shared/artifact-editor-actions.ts'
import { createPage, createNode } from '../shared/artifact-document.ts'
import { importCanvasAnnotations } from '../shared/artifact-canvas-import.ts'
import {decodeCommentAnchor,encodeCommentAnchor}from'../shared/artifact-comment-anchor.ts'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')))
const supportedChecks = ['slide-transitions', 'undo-focus', 'asset-colors', 'canvas-play-menu', 'asset-reads', 'canvas-board-export', 'canvas-board-preview', 'canvas-board-preview-load', 'canvas-contents', 'canvas-empty', 'canvas-fit-body', 'canvas-fit-switch', 'canvas-flow', 'canvas-import', 'canvas-layout-cache', 'canvas-links', 'canvas-pages', 'canvas-pages-cas', 'canvas-pen', 'canvas-title', 'canvas-vector', 'canvas-vector-edit', 'canvas-vector-edit-cas', 'canvas-vector-edit-load', 'canvas-vector-edit-retention', 'canvas-vector-load', 'canvas-vector-retention', 'cas', 'color-cas', 'colors', 'comments', 'export-ink', 'font-cas', 'fonts', 'fonts-lazy', 'fonts-readonly', 'history', 'interactions', 'legacy-colors', 'menu-resize', 'narrow', 'parity', 'rail', 'save', 'shapes', 'svg-font', 'svg-font-cancel', 'svg-font-error', 'svg-font-module', 'table', 'table-stability', 'viewport-loading']
assert.ok(options.checks === undefined || supportedChecks.includes(options.checks), '未知的编辑器检查项：' + options.checks)
assert.ok(options['source-camera']!=='true'||options['point-matched']==='true'&&options.checks==='canvas-vector-edit'&&options['vector-case']==='initial','--source-camera requires the matched initial point fixture')
assert.ok(options['source-toolbar']!=='true'||options['point-matched']==='true'&&options.checks==='canvas-vector-edit'&&options['vector-case']==='initial','--source-toolbar requires the matched initial point fixture')
const mode = options.mode ?? 'both'
assert.ok(['design', 'slides', 'both'].includes(mode), '--mode must be design, slides or both')
const output = resolve(options.output ?? join(tmpdir(), 'lingxi-native-ui-results'))
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright'
const { chromium } = await import(modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath).catch(() => {
  throw new Error('Provide installed Playwright through PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs')
})
const dependencyRoot = await realpath(join(root, 'node_modules'))
const workspace = await mkdtemp(join(tmpdir(), 'lingxi-native-ui-'))
await mkdir(output, { recursive: true })
const mocks = {
  http: `export async function http(path,init){const response=await fetch('/api'+path,{...init,headers:{'Content-Type':'application/json',...init?.headers}});if(!response.ok)throw Object.assign(new Error(await response.text()),{status:response.status});return response.json()}`,
  realtime: 'export const ws={on:()=>()=>{}}',
  transport: 'export const lingxiApiFetch=(...args)=>fetch(...args)',
  auth: "export const getActiveCompanyId=()=> 'fixture-company'",
  workspaceSession: "export const getWorkspaceSession=()=>({companyId:'fixture-company',projectId:'fixture-project'})",
}
for (const [name, source] of Object.entries(mocks)) await writeFile(join(workspace, `${name}.js`), source)
await writeFile(join(workspace, 'index.html'), '<html><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root" style="height:100vh"></div><script type="module" src="/entry.tsx"></script></body></html>')
await writeFile(join(workspace, 'entry.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import NativeEditor from ${JSON.stringify(join(root, 'src/features/artifacts/native/NativeEditor'))};createRoot(document.getElementById('root')!).render(<${options['strict-mode']==='false'?'React.Fragment':'React.StrictMode'}>${options.checks==='canvas-pages'?'<div style={{height:"100%"}} data-fixture-workspace onKeyDown={event=>{if(event.key==="Escape"&&!event.defaultPrevented)event.currentTarget.hidden=true}}>':''}<NativeEditor artifactId="fixture" kind={new URLSearchParams(location.search).get('kind')==='design'||new URLSearchParams(location.search).has('design')?'design':'slides'} title="原生编辑器验收" />${options.checks==='canvas-pages'?'</div>':''}</${options['strict-mode']==='false'?'React.Fragment':'React.StrictMode'}>)`)
await writeFile(join(workspace,'artifact-export.html'),(await readFile(join(root,'artifact-export.html'),'utf8')).replace('/src/features/artifacts/native/export/realm-entry.ts',`/@fs${root}/src/features/artifacts/native/export/realm-entry.ts`))
let server, browser
try {
  server = await createServer({ configFile: false, root: workspace, publicDir: join(root, 'public'), plugins: [react()], logLevel: 'error',
    resolve: { alias: [
      ...Object.entries({ '@/api/core/http': 'http', '@/api/core/realtime': 'realtime', '@/api/transport': 'transport', '@/stores/auth': 'auth', '@/lib/workspaceSession': 'workspaceSession' }).map(([find, name]) => ({ find, replacement: join(workspace, `${name}.js`) })),
      { find: 'react', replacement: dirname(require.resolve('react/package.json')) },
      { find: 'react-dom', replacement: dirname(require.resolve('react-dom/package.json')) },
    ] }, server: { host: '127.0.0.1', port: 0, hmr:false, fs: { allow: [root, workspace, dependencyRoot] } } })
  await server.listen()
  const address = server.httpServer.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, ...(options.browser ? { executablePath: options.browser } : {}), args: ['--no-sandbox'] })
  for (const kind of mode === 'both' ? ['slides', 'design'] : [mode]) {
    for (const editorCase of options.checks==='canvas-fit-body'?options['fit-case']?[options['fit-case']]:['first','rapid','restored']:options.checks === 'canvas-vector-edit-retention' ? options['vector-case']?[options['vector-case']]:['readonly','denied','space','middle','touch'] : options.checks === 'canvas-vector-edit-cas' ? options['vector-case']?[options['vector-case']]:['rotation','path','style','reload','parent-idle','parent-active','parent-cancel','parent-cancel-click','padding','padding-rotated','padding-change','padding-active'] : options.checks === 'canvas-vector-edit' ? options['vector-case']?[options['vector-case']]:['initial','anchor-drag','nudge','smooth','delete','insert','tab','pull','shift-drag','handle','break','cancel','group-nudge','save-in-mode','undo-point','redo-point','keyboard-enter'] : options.checks === 'canvas-vector-retention' ? options['vector-case']?[options['vector-case']]:['permission','permission-single','page','denied','denied-single','single-switch','space','middle'] : options.checks === 'canvas-vector' ? options['vector-case']?[options['vector-case']]:['open-enter','open-escape','single-escape','closed','first-handle','middle-handle','shift-angle','backspace','switch-tool','near-point','oversize','draft-undo','draft-redo','draft-delete','draft-save'] : options.checks === 'cas' ? ['rte', 'table'] : options.checks === 'fonts-lazy' ? ['outside', 'escape'] : [null]) {
      const result = await verifyMode(kind, browser, baseUrl, editorCase)
      await writeFile(join(output, `${kind}${editorCase ? `-${editorCase}` : ''}.json`), JSON.stringify(result, null, 2) + '\n')
      console.log(JSON.stringify(options.checks==='parity'?{...result,screenshots:result.screenshots.map(({controls,...row})=>row)}:result))
    }
  }
} finally {
  await browser?.close()
  await server?.close()
  await rm(workspace, { recursive: true, force: true })
}

async function verifyMode(kind, browser, baseUrl, editorCase) {
  const visualChecks=['slide-transitions','parity','table','table-stability','fonts','font-cas','fonts-lazy','fonts-readonly','svg-font','svg-font-error','svg-font-cancel','svg-font-module','canvas-pages','canvas-pages-cas','canvas-flow','canvas-contents','canvas-import','canvas-empty','canvas-layout-cache','canvas-links','canvas-title','canvas-pen','canvas-vector','canvas-vector-load','canvas-vector-retention','canvas-vector-edit','canvas-vector-edit-cas','canvas-vector-edit-retention','canvas-vector-edit-load','canvas-fit-switch','canvas-fit-body','canvas-board-preview','canvas-board-export','canvas-board-preview-load','asset-reads','canvas-play-menu','asset-colors']
  const fixture = visualChecks.includes(options.checks) ? createVisualFixture(kind) : createFixture(kind, 'fixture', Array.from({ length: 50 }, (_, index) => `/api/artifacts/fixture/assets/image-${index + 1}`))
  const cameraReference=options['source-runtime']?JSON.parse(await readFile(resolve(options['source-runtime']),'utf8')):JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-fit-camera.json'),'utf8'))
  if(options['source-runtime']){assert.equal(cameraReference.sourceCommit,'016b39d7fdcc30bfacee31ea5541498ac53921c6');assert.equal(cameraReference.referenceResourceHashesVerified,12)}
  let document = fixture.document
  if(options['presentation-mixed-sizes']==='true'){
    const page=document.pages['page-2'];page.width=options['presentation-portrait']==='true'?540:960;page.height=options['presentation-portrait']==='true'?960:540
    for(const id of page.nodeOrder)page.nodes[id].motionId=id.replace('page-2-','page-1-')
    page.nodes['page-2-heading'].x=164
    if(options['presentation-executable-target']==='true'){
      const a=document.pages['page-1'],b=document.pages['page-2'],source='<script>parent.postMessage({type:"native-motion-embed-start"},"*")</script><p>隔离内容</p>'
      const old=a.nodes['page-1-image'];a.nodes['page-1-child']={...old,id:'page-1-child',parentId:old.id,x:0,y:0};a.nodeOrder.push('page-1-child');a.nodes[old.id]={...old,type:'group'};delete a.nodes[old.id].assetId
      const target=b.nodes['page-2-image'];b.nodes[target.id]={...target,type:'group'};delete b.nodes[target.id].assetId;b.nodes['page-2-embed']={...createNode('embed','page-2-embed'),parentId:target.id,x:0,y:0,width:640,height:360,embed:{format:'html',source,sourceHash:createHash('sha256').update(source).digest('hex')}};b.nodeOrder.push('page-2-embed')
    }

    if(options['presentation-offpaper']==='true'){page.nodes.offpaper={...createNode('shape','offpaper'),x:-240,y:600,width:140,height:140,style:{fill:'#ff0000'}};page.nodeOrder.push('offpaper')}
  }
  if(['canvas-vector-edit','canvas-vector-edit-cas','canvas-vector-edit-retention','canvas-vector-edit-load','canvas-board-preview','canvas-board-export','canvas-board-preview-load','canvas-play-menu'].includes(options.checks)){
    const reference=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-vector.json'),'utf8')).runtimeCases.find(sample=>sample.name==='open-enter').added[0]
    const node=canvasPenNode('editable-path',{x:2497.1,y:-1360.9,w:reference.w,h:reference.h,d:reference.d})
    document=applyOperations(document,prepareBatch(document,[...createCanvasContents(document,canvasPages(document)[0].id,'canvas-vector-body'),{type:'node.insert',pageId:'canvas-vector-body',node:{...node,scope:'canvas'}}])).document
  }
  if(options.checks==='canvas-vector-edit-cas'&&editorCase.startsWith('parent-')){
    const page=document.pages['canvas-vector-body'],node=page.nodes['editable-path'],group={...createNode('group','editable-parent'),x:node.x,y:node.y,width:node.width,height:node.height,scope:'canvas'}
    document=applyOperations(document,prepareBatch(document,[{type:'node.insert',pageId:page.id,node:group},{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{x:0,y:0,parentId:group.id}}])).document
  }
  if(options.checks==='canvas-vector-edit-cas'&&editorCase.startsWith('padding')){
    const page=document.pages['canvas-vector-body'],node=page.nodes['editable-path'];document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{style:{padding:30,paddingX:30,paddingY:30},...(editorCase==='padding-rotated'?{rotation:27,flipX:true}: {})}}])).document
  }
  if(options.checks==='canvas-board-preview'&&options['preview-small']==='true'){document.pages['page-2'].width=800;document.pages['page-2'].height=600}
  if(options.checks==='canvas-fit-body'){
    document=applyOperations(document,prepareBatch(document,createCanvasPage(document,'positioned'))).document
    document=applyOperations(document,prepareBatch(document,[...createCanvasContents(document,'positioned','positioned-body'),{type:'node.insert',pageId:'positioned-body',node:{...createNode('shape','positioned-object'),x:3000,y:4000,width:800,height:600,scope:'canvas',style:{fill:'#ff0000'}}}])).document
  }
  if(options.checks==='canvas-fit-switch')document=applyOperations(document,prepareBatch(document,[...createCanvasPage(document,'positioned'),{type:'page.insert',page:{...createPage('positioned-board','独立画板'),x:3000,y:4000,width:800,height:600,canvasPageId:'positioned'}}])).document
  if(options.checks==='canvas-pen'){const geometry=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-pen.json'),'utf8')).cases[0].result,node={...createNode('drawing','thumbnail-pen'),x:100,y:600,width:geometry.w,height:geometry.h,path:{d:geometry.d,width:geometry.w,height:geometry.h},style:{stroke:'#8a8378',strokeWidth:2}};document.pages['page-3'].nodes[node.id]=node;document.pages['page-3'].nodeOrder.push(node.id)}
  if(['canvas-import','canvas-layout-cache'].includes(options.checks)){const samples={chinese:'中文自动换行'.repeat(50),english:'GOOD FOOD GOOD MOOD '.repeat(20),tabs:'a\tb\tc\td\te\tf\tg'.repeat(20),caps:'DDDQQQOOOGGG'.repeat(30)};importCanvasAnnotations(document,{'imported-note':{text:samples[options['import-case']??'chinese'],w:240,x:688,y:-778}},[]);if(options.checks==='canvas-layout-cache'){const body=document.pages[document.canvasPages[0].contentId];body.nodes['imported-note'].text='中文自动换行'.repeat(100);body.nodes['imported-note'].height=832;body.nodes['imported-note'].style.fontSize=32;body.nodes.unrelated={...createNode('shape','unrelated'),x:0,y:0};body.nodeOrder.push('unrelated');if(options['inherit-font']==='true'){const note=body.nodes['imported-note'];note.text='i'.repeat(2000);if(options['inherit-keyword'])note.style.fontFamily=options['inherit-keyword'];else delete note.style.fontFamily;const group={...createNode('group','inherited-group'),x:0,y:0,width:1000,height:8000,style:{fontFamily:'monospace'}};body.nodes[group.id]=group;body.nodeOrder.unshift(group.id);note.parentId=group.id;if(options['layout-case']){group.x=note.x;group.y=note.y;group.width=120;group.height=180;group.layout={mode:options['layout-case'],direction:'row',columns:1,align:'start'};note.x=0;note.y=0;note.text='a '.repeat(400);if(options['grid-second-row']==='true'){group.width=480;group.height=3000;group.layout={mode:'grid',columns:2,gap:20,align:'start'};for(let i=1;i<(options['grid-mixed']==='true'||options['grid-shapes-only']==='true'?6:4);i++){const sibling={...structuredClone(note),id:`grid-note-${i}`};if(options['grid-shapes-only']==='true'||options['grid-mixed']==='true'&&i>=2){sibling.type='shape';sibling.shape='rect';sibling.height=3128;delete sibling.text}body.nodes[sibling.id]=sibling;body.nodeOrder.push(sibling.id)}if(options['grid-shapes-only']==='true'){note.type='shape';note.shape='rect';note.height=3128;delete note.text}}}}}}
  if(options.checks==='canvas-empty')document={...document,pageOrder:[],pages:{}}
  if(options.checks==='canvas-flow'){
    document=applyOperations(document,prepareBatch(document,createCanvasPage(document,'canvas-second'))).document
    document.pageOrder=['page-1','page-2'];delete document.pages['page-3']
    const first=document.pages['page-1'],other=document.pages['page-2'],heading=first.nodes['page-1-heading']
    Object.assign(first,{width:800,height:600});Object.assign(heading,{x:50,y:50,width:700,height:100})
    const shape={...createNode('shape','flow-bottom'),x:0,y:900,width:100,height:100}
    const image=Object.values(first.nodes).find(node=>node.type==='image');Object.assign(image,{x:50,y:200,width:100,height:100})
    first.nodeOrder=[heading.id,image.id,shape.id];first.nodes={[heading.id]:heading,[image.id]:image,[shape.id]:shape}
    Object.assign(other,{canvasPageId:'canvas-second',x:0,y:options['flow-overlap']?0:700,width:800,height:600})
  }
  if(options.checks==='canvas-vector-retention'&&editorCase==='page'){document.canvasPages=[{id:'canvas-page-1',name:'页面 1'},{id:'second',name:'页面 2'}];document.pages['page-3'].canvasPageId='second'}
  if(options.checks==='canvas-pages-cas')document=applyOperations(document,prepareBatch(document,createCanvasPage(document,'canvas-second'))).document
  if(['svg-font','svg-font-error','svg-font-cancel','svg-font-module'].includes(options.checks)){
    const node={...createNode('svg','font-svg'),svg:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="150" viewBox="0 0 600 150"><text x="16" y="100" font-family="Merriweather" font-size="80" font-weight="700">Hello</text></svg>'}
    document.pages['page-1'].nodes[node.id]=node;document.pages['page-1'].nodeOrder.push(node.id)
    const group={...createNode('group','svg-font-group'),x:80,y:400,width:600,height:470,style:{fontFamily:'Merriweather'}}
    const child={...node,id:'inherited-svg',parentId:group.id,x:0,y:0,svg:node.svg.replace(' font-family="Merriweather"','')}
    for(const item of [group,child]){document.pages['page-1'].nodes[item.id]=item;document.pages['page-1'].nodeOrder.push(item.id)}
    for(const [index,value]of ['inherit','unset'].entries()){
      const item={...child,id:`svg-root-${value}`,y:(index+1)*160,svg:child.svg.replace('<svg ',`<svg font-family="${value}" `)}
      document.pages['page-1'].nodes[item.id]=item;document.pages['page-1'].nodeOrder.push(item.id)
    }
  }
  if(options.checks==='table-stability'){
    const page=document.pages['page-1'],table={...createTableNode('stable-table',page),tableHeader:false,cells:[['甲','乙'],['丙'],['丁','戊']]}
    page.nodes[table.id]=table;page.nodeOrder.push(table.id)
  }
  if(options.checks==='legacy-colors')document.pages['page-1'].background='#f00'
  if(options.checks==='color-cas')document.pages['page-1'].background='#ff0000'
  const historical=structuredClone(document),historyNode=Object.values(historical.pages['page-1']?.nodes??{}).find(node=>node.type==='text')
  if(options.checks==='history')document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:historyNode.id,patch:{x:historyNode.x+80}}])).document
  const revisionReads=[],revisionRestores=[],contextWrites=[]
  if(options.checks==='canvas-links'){document.canvasPages=[{id:'canvas-page-1',name:'页面 1'},{id:'linked-page',name:'链接目标页面'}];document.pages['page-2'].canvasPageId='linked-page'}
  let commentThreads=options.checks==='canvas-import'?[{id:'imported-comment',anchor:encodeCommentAnchor({pageId:document.canvasPages[0].contentId,nodeId:'imported-note',x:.5,y:.5}),label:'导入便签评论',status:'open',messages:[{id:'imported-message',text:'中文评论定位验收',author:{kind:'user',id:'fixture-user',name:'验收用户'},at:'2026-11-06T00:00:00.000Z'}]}]:[];let commentSequence=0;let holdCommentAck=false,releaseCommentAck=null,rejectCommentReply=false,expectedCommentError=false
  const pageHash = page => createHash('sha256').update(JSON.stringify(page)).digest('hex')
  const initialPageHashes = Object.fromEntries(document.pageOrder.map(id => [id, pageHash(document.pages[id])]))
  const history = { version: 0, undo: null, redo: null }, receipts = [], errors = []
  let holdAcknowledgment = false, releaseAcknowledgment = null
  let historyEntry = null
  const historyRequests = []
  let fixtureWrite=options['preview-readonly']!=='true'
  let holdImageReads=options.checks==='asset-reads',releaseImageReads
  const imageReadGate=new Promise(resolve=>{releaseImageReads=resolve}),physicalImageReads=[]
  const pageReads=[]
  let releaseCanvasBody,canvasBodyLoaded=false,notifyCanvasBody
  const canvasBodyRequested=new Promise(resolve=>{notifyCanvasBody=resolve})
  const delayedPageId=options.checks==='canvas-fit-body'?'positioned-body':options['preview-body-delay']==='true'?'page-2':null
  const snapshot = () => ({ document:delayedPageId&&!canvasBodyLoaded?{...document,pages:{...document.pages,[delayedPageId]:{...document.pages[delayedPageId],nodes:{},nodeOrder:[]}}}:options.checks==='viewport-loading'?{...document,pages:Object.fromEntries(artifactPageIds(document).map(id=>[id,id==='page-1'?document.pages[id]:{...document.pages[id],nodes:{},nodeOrder:[]}]))}:document, history, write: fixtureWrite, loadedPageIds:delayedPageId&&!canvasBodyLoaded?artifactPageIds(document).filter(id=>id!==delayedPageId):options.checks==='viewport-loading'?['page-1']:artifactPageIds(document),
    pageVersions: Object.fromEntries(artifactPageIds(document).map(id => [id, String(document.versions[`page/${id}`] ?? 0)])) })
  const page = await browser.newPage({ viewport: { width: Number(options.width??1440), height: Number(options.height??1000) },colorScheme:options['canvas-theme']==='dark'?'dark':'light',reducedMotion:options.checks==='slide-transitions'?'no-preference':'reduce' })
  if(options.checks==='canvas-layout-cache')await page.addInitScript(()=>{window.__naturalProbePeak=0;new MutationObserver(()=>{window.__naturalProbePeak=Math.max(window.__naturalProbePeak,document.querySelectorAll('[data-native-measure-node]').length)}).observe(document,{childList:true,subtree:true})})
  if(options['canvas-theme']==='dark')await page.addInitScript(()=>{const apply=()=>{if(window===top)document.documentElement?.classList.add('dark')};apply();document.addEventListener('DOMContentLoaded',apply,{once:true})})
  let svgFontsBlocked=options.checks==='svg-font-error',svgFontsHeld=options.checks==='svg-font-cancel',releaseSvgFonts=null,svgFontFailures=0,svgModuleBlocked=options.checks==='svg-font-module',svgModuleRequests=0
  const editorFontRequests=[]
  let presentationModuleRequests=0
  let boardModuleBlocked=options.checks==='canvas-board-preview-load',boardModuleRequests=0
  let pointModuleBlocked=options.checks==='canvas-vector-edit-load',pointModuleRequests=0
  let expectedVectorDenied=false;let vectorModuleBlocked=options.checks==='canvas-vector-load',vectorModuleRequests=0
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/fonts/editors/'))editorFontRequests.push(new URL(request.url()).pathname)})
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.includes('/CanvasPenTool.tsx'))vectorModuleRequests++;if(path.includes('/CanvasPointEditor.tsx'))pointModuleRequests++;if(path.includes('/BoardPreview.tsx'))boardModuleRequests++;if(path.includes('/SlidesPresentation.tsx'))presentationModuleRequests++})
  page.setDefaultTimeout(30_000)
  if(options['presentation-portrait']==='true')await page.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=(fn,delay,...args)=>original(fn,[570,670,730].includes(delay)?delay*10:delay,...args)})
  await page.addInitScript(()=>{window.__geometryLog=[];window.__geometryMessages=0;window.__penRequests=0;const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{if(Array.isArray(e.data?.value)){window.__geometryLog.push({direction:'reply',...e.data});window.__geometryLog=window.__geometryLog.slice(-60)}})}postMessage(message,...args){window.__geometryMessages++;if(message?.task?.kind==='pen')window.__penRequests++;if(['visible','update-pages','elements'].includes(message?.task?.kind)){window.__geometryLog.push({direction:'request',...message});window.__geometryLog=window.__geometryLog.slice(-60)}return super.postMessage(message,...args)}}})
  if(options.checks==='viewport-loading')await page.addInitScript(()=>{window.__holdVisible=false;window.__heldVisible=[];const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.visibleIds=new Set();this.addEventListener('message',event=>{if(this.visibleIds.delete(event.data?.id)&&window.__holdVisible){event.stopImmediatePropagation();window.__heldVisible.push(()=>this.dispatchEvent(new MessageEvent('message',{data:event.data})))}})}postMessage(message,...args){if(message?.task?.kind==='visible')this.visibleIds.add(message.id);return super.postMessage(message,...args)}}})
  if(options.checks==='canvas-pen')await page.addInitScript(()=>{window.__holdPen=false;window.__heldPen=[];const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.penIds=new Set();this.addEventListener('message',event=>{if(this.penIds.delete(event.data?.id)&&window.__holdPen){event.stopImmediatePropagation();window.__heldPen.push(()=>this.dispatchEvent(new MessageEvent('message',{data:event.data})))}})}postMessage(message,...args){window.__geometryMessages++;if(message?.task?.kind==='pen')this.penIds.add(message.id);return super.postMessage(message,...args)}}})
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error'&&!(expectedVectorDenied&&message.text().includes('403')&&message.location().url.includes('/changes'))&&!(options['preview-save-retry']==='true'&&message.location().url.includes('/operations')&&message.text().includes('503'))&&!(expectedCommentError&&message.text().includes('503')&&message.location().url.includes('/comments/'))&&!(options.checks==='canvas-board-preview-load'&&message.location().url.includes('/BoardPreview.tsx'))&&!(['svg-font-error','svg-font-cancel'].includes(options.checks)&&message.location().url.includes('/fonts/editors/'))&&!(options.checks==='svg-font-module'&&message.location().url.includes('/svg-font-image.ts'))&&!(options.checks==='canvas-vector-load'&&message.location().url.includes('/CanvasPenTool.tsx'))&&!(options.checks==='canvas-vector-edit-load'&&message.location().url.includes('/CanvasPointEditor.tsx'))) errors.push(message.text()) })
  if(options.checks==='canvas-board-preview-load')await page.route('**/BoardPreview.tsx*',async route=>{if(boardModuleBlocked)await route.fulfill({status:503,body:'全窗口预览未能加载'});else await route.continue()})
  if(options.checks==='canvas-vector-edit-load')await page.route('**/CanvasPointEditor.tsx*',async route=>{if(pointModuleBlocked)await route.fulfill({status:503,body:'控制点工具未能加载'});else await route.continue()})
  if(options.checks==='canvas-vector-load')await page.route('**/CanvasPenTool.tsx*',async route=>{if(vectorModuleBlocked)await route.fulfill({status:503,body:'钢笔工具未能加载'});else await route.continue()})
  if(options.checks==='svg-font-module')await page.route('**/svg-font-image.ts*',async route=>{svgModuleRequests++;if(svgModuleBlocked)await route.fulfill({status:503,body:'图形工具暂时无法加载'});else await route.continue()})
  if(['svg-font-error','svg-font-cancel'].includes(options.checks))await page.route('**/fonts/editors/**',async route=>{if(svgFontsBlocked){svgFontFailures++;await route.fulfill({status:503,body:'字体暂时无法加载'});return}if(svgFontsHeld)await new Promise(resolve=>{const previous=releaseSvgFonts;releaseSvgFonts=()=>{previous?.();resolve()}});await route.continue().catch(()=>{})})
  await page.route('**/isolated-fixture/**', async route => {
    const [, pageId, nodeId] = new URL(route.request().url()).pathname.match(/^\/isolated-fixture\/([^/]+)\/([^/]+)$/) ?? []
    const source = document.pages[pageId]?.nodes[nodeId]?.embed?.source
    assert.equal(typeof source, 'string')
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: {
      'Content-Security-Policy': "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:",
    }, body: source })
  })
  await page.route('**/api/artifacts/fixture/**', async route => {
    const request = route.request(), url = new URL(request.url())
    if(url.pathname.includes('/comments')){
      const [,threadId,action,messageId]=url.pathname.split('/comments')[1].split('/'),body=request.postData()?request.postDataJSON():null
      if(request.method()==='GET'){await route.fulfill({status:200,json:{threads:commentThreads,me:{id:'fixture-user',name:'验收用户'},agent:{available:options.checks==='comments'}}});return}
      if(rejectCommentReply&&action==='messages'&&!messageId&&request.method()==='POST'){await route.fulfill({status:503,json:{error:'controlled comment failure'}});return}
      let thread=commentThreads.find(thread=>thread.id===threadId)
      const message=text=>({id:`message-${++commentSequence}`,text,author:{kind:'user',id:'fixture-user',name:'验收用户'},at:new Date().toISOString()})
      if(!threadId){thread={id:`thread-${++commentSequence}`,anchor:body.anchor,label:body.label,status:'open',messages:[message(body.text)]};commentThreads.push(thread)}
      else if(action==='messages'&&messageId)thread.messages.find(message=>message.id===messageId).text=body.text
      else if(action==='messages')thread.messages.push(message(body.text))
      else if(action==='send')thread.agent={status:'pending'}
      else if(request.method()==='DELETE')commentThreads=commentThreads.filter(item=>item.id!==threadId)
      else thread.status=body.status
      if(holdCommentAck)await new Promise(resolve=>{releaseCommentAck=resolve})
      await route.fulfill({status:200,json:{thread}});return
    }
    if(url.pathname.endsWith('/editor-context'))contextWrites.push(request.postDataJSON())
    if(url.pathname.endsWith('/revisions')){
      revisionReads.push(true);await route.fulfill({status:200,json:{current:`fixture-${document.seq}`,revisions:[...new Set([document.seq,0])].map(seq=>({seq:String(seq),version:`fixture-${seq}`,actorId:'fixture-user',actorName:'测试用户',actorKind:'user',createdAt:new Date().toISOString(),changedPageIds:['page-1']}))}});return
    }
    if(url.pathname.includes('/revisions/0/document')){
      await route.fulfill({status:200,json:{...snapshot(),document:historical,write:false,history:{version:0,undo:null,redo:null}}});return
    }
    if(url.pathname.endsWith('/revisions/0/restore')){
      assert.equal(request.postDataJSON().version,`fixture-${document.seq}`);revisionRestores.push(true)
      document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:historyNode.id,patch:{x:historyNode.x}}])).document
      await route.fulfill({status:200,json:{version:`fixture-${document.seq}`}});return
    }
    const grant = url.pathname.match(/^\/api\/artifacts\/fixture\/embeds\/([^/]+)\/([^/]+)\/grant$/)
    if (grant) {
      const node = document.pages[grant[1]]?.nodes[grant[2]]
      assert.equal(request.postDataJSON().sha256, node?.embed?.sourceHash)
      await route.fulfill({ status: 200, json: { url: `${baseUrl}/isolated-fixture/${grant[1]}/${grant[2]}` } }); return
    }
    if (url.pathname.includes('/assets/')) {
      assert.equal(request.headers()['x-company-id'], 'fixture-company')
      assert.equal(request.headers()['x-project-id'], 'fixture-project')
      if(options.checks==='asset-reads'){physicalImageReads.push(url.pathname);if(holdImageReads)await imageReadGate}
      const image = fixture.images[Number(url.pathname.split('-').at(-1)) - 1]
      await route.fulfill({ status: 200, contentType: 'image/png', body: image.bytes }); return
    }
    let result = snapshot()
    if(delayedPageId&&url.pathname.endsWith('/pages/'+delayedPageId)){pageReads.push(delayedPageId);await new Promise(resolve=>{releaseCanvasBody=resolve;notifyCanvasBody()});canvasBodyLoaded=true;await route.fulfill({status:200,json:{page:document.pages[delayedPageId]}});return}
    if(options.checks==='viewport-loading'&&url.pathname.includes('/pages/')){const id=url.pathname.split('/pages/')[1];pageReads.push(id);await route.fulfill({status:200,json:{page:document.pages[id]}});return}
    if (url.pathname.endsWith('/operations')) {
      const batch = request.postDataJSON()
      try {
        if (batch.kind === 'undo' || batch.kind === 'redo') {
          assert.equal(batch.expectedHistoryVersion, history.version)
          assert.equal(batch.targetOperationId, history[batch.kind])
          assert.ok(historyEntry)
          document = applyOperations(document, prepareBatch(document, batch.kind === 'undo' ? historyEntry.inverse : historyEntry.forward, batch.operationId)).document
          historyRequests.push(batch.kind)
          history.undo = batch.kind === 'redo' ? batch.targetOperationId : null
          history.redo = batch.kind === 'undo' ? batch.targetOperationId : null
        } else {
          const applied = applyOperations(document, batch)
          document = applied.document; historyEntry = { inverse: applied.inverse, forward: batch.operations }
          history.undo = batch.operationId; history.redo = null; receipts.push(batch)
        }
        history.version = document.seq
        result = { ...snapshot(), seq: document.seq, committedSeq: document.seq, operationId: batch.operationId }
        if (holdAcknowledgment) await new Promise(resolve => { releaseAcknowledgment = resolve })
      } catch (error) { await route.fulfill({ status: 409, json: { error: String(error) } }); return }
    } else if (url.pathname.endsWith('/changes')) result = { items: Number(url.searchParams.get('afterSeq') ?? 0) < document.seq ? [{ seq: document.seq }] : [], seq: document.seq }
    await route.fulfill({ status: 200, json: result })
  })
  const ready = async index => {
    const canvas = page.locator(`[data-page-id="page-${index}"]`)
    if(!visualChecks.includes(options.checks)) await canvas.locator('[data-formula-ready=true]').waitFor()
    if(holdImageReads){await canvas.locator('[data-node-type=image] [aria-busy=true]').waitFor();return}
    await canvas.locator('[data-node-type=image] img').waitFor().catch(async error=>{await page.screenshot({path:join(output,'failure.png')});await writeFile(join(output,'failure-state.json'),JSON.stringify(await page.evaluate(()=>({notices:[...document.querySelectorAll('.native-notice')].map(e=>e.textContent),root:[...document.querySelectorAll('[data-native-artifact-editor]')].map(e=>({current:e.dataset.currentPage,canvas:e.dataset.canvasPageId})),boards:[...document.querySelectorAll('[data-artboard-id]')].map(e=>({id:e.dataset.artboardId,rect:e.getBoundingClientRect().toJSON(),nodes:e.querySelectorAll('[data-node-id]').length})),geometry:window.__geometryLog?.slice(-8)})),null,2));throw error})
    await page.waitForFunction(index => {
      const image = window.document.querySelector(`[data-page-id="page-${index}"] [data-node-type=image] img`)
      return image?.complete && image.naturalWidth > 0
    }, index)
  }
  const scrollCanvasTo=async point=>{
    const mounted=await page.locator('[data-artboard-id]').first().evaluate(element=>({id:element.dataset.artboardId,x:Number.parseFloat(element.style.left),y:Number.parseFloat(element.style.top),width:Number.parseFloat(element.style.width)}))
    const reference=document.pages[mounted.id],scale=mounted.width/reference.width
    await page.locator('.native-stage').evaluate((element,point)=>element.scrollTo({left:point.x,top:point.y,behavior:'instant'}),{x:mounted.x+(point.x-reference.x)*scale-48,y:mounted.y+(point.y-reference.y)*scale-80})
  }
  const select = async index => {
    if (kind === 'design') {
      if (!(await page.getByLabel('画布缩放',{exact:true}).innerText()).includes('50%')) { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'50%',exact:true}).click() }
      const p = document.pages[`page-${index}`]
      // Derive the world-to-scroll offset from an actual mounted board. The
      // canvas can reserve space for negative coordinates without any objects.
      await scrollCanvasTo(p)
      await page.locator(`[data-page-id="page-${index}"] .native-board-label`).click()
      await ready(index); return
    }
    await page.locator('.native-page-list').evaluate((element, index) => { element.scrollLeft = (index - 1) * 136 }, index)
    await page.locator(`[data-page-target="page-${index}"]`).click()
    await ready(index)
  }
  try {
    await page.goto(`${baseUrl}/?kind=${kind}${options.checks==='canvas-links'?'&project=fixture-project&view=conversations&conversation=fixture-room':''}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    if(options.checks==='canvas-empty')await page.locator('[data-native-artifact-editor]').waitFor();else await ready(1)
    if(options['canvas-theme']==='dark')await page.evaluate(()=>document.documentElement.classList.add('dark'))
    if(options.checks==='slide-transitions'&&options['presentation-executable-target']==='true'){
      await page.evaluate(()=>{window.__motionEmbedStarts=0;window.__overlayEmbedPeak=0;window.addEventListener('message',event=>{if(event.data?.type==='native-motion-embed-start')window.__motionEmbedStarts++});new MutationObserver(()=>{window.__overlayEmbedPeak=Math.max(window.__overlayEmbedPeak,document.querySelectorAll('.native-magic-overlay iframe').length)}).observe(document.body,{childList:true,subtree:true})})
      await page.getByLabel('显示属性',{exact:true}).click();await page.locator('.native-transition-menu>summary').click();await page.getByRole('menuitemradio',{name:'神奇移动',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      await page.getByRole('button',{name:'放映',exact:true}).click();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await show.press('ArrowRight');await page.waitForFunction(()=>window.__motionEmbedStarts>=1);await page.waitForFunction(()=>!document.querySelector('.native-slides-presentation-outgoing'));await page.waitForTimeout(250)
      const observation=await page.evaluate(()=>({starts:window.__motionEmbedStarts,maximumOverlayIframes:window.__overlayEmbedPeak,currentIframes:document.querySelectorAll('.native-slides-presentation-current iframe').length}))
      assert.deepEqual(observation,{starts:1,maximumOverlayIframes:0,currentIframes:1},'目标配对组新增隔离内容时也必须只执行一次')
      await show.press('Escape');assert.deepEqual(errors,[]);return{kind:'isolated-motion-executable-target',observation,consoleOrPageErrors:errors}
    }
    if(options.checks==='slide-transitions'){
      assert.equal(kind,'slides')
      if(options['presentation-mixed-sizes']==='true'){
        const records=[],targetWidth=document.pages['page-2'].width,targetHeight=document.pages['page-2'].height
        const titleInk=async(browserPage,box,label)=>{
          const clip={x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.min(300,box.width),height:Math.min(57,box.height)},bytes=await browserPage.screenshot({path:join(output,label+'.png'),clip})
          return browserPage.evaluate(async base64=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let at=0;at<pixels.length;at+=4)if(pixels[at]===24&&pixels[at+1]===51&&pixels[at+2]===43)ink++;return ink},bytes.toString('base64'))
        }
        const offpaperInk=async(browserPage,node,label)=>{
          await browserPage.evaluate(()=>{for(const animation of window.__mixedAnimations)animation.currentTime=240})
          const box=await node.boundingBox(),viewport=browserPage.viewportSize(),clip={x:Math.max(0,box.x),y:Math.max(0,box.y),width:Math.min(box.width,viewport.width-Math.max(0,box.x)),height:Math.min(box.height,viewport.height-Math.max(0,box.y))}
          const bytes=await browserPage.screenshot({path:join(output,label+'.png'),clip})
          const ink=await browserPage.evaluate(async base64=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'})),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let ink=0;for(let at=0;at<pixels.length;at+=4)if(pixels[at]>50&&pixels[at+1]<20&&pixels[at+2]<20)ink++;return ink},bytes.toString('base64'))
          await browserPage.evaluate(()=>{for(const animation of window.__mixedAnimations)animation.currentTime=0})
          await writeFile(join(output,label+'.json'),JSON.stringify({ink,clip},null,2));assert.equal(ink,0,'未配对的纸张外对象在转场中也必须保持裁切')
        }
        if(options['presentation-mixed-offline-only']!=='true'){
          await page.getByLabel('显示属性',{exact:true}).click()
          await page.evaluate(()=>{window.__mixedRecords=[];window.__mixedAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,timing){const result=animate.call(this,frames,timing);result.pause();result.currentTime=0;window.__mixedRecords.push({id:this.getAttribute('data-node-id'),frames,timing});window.__mixedAnimations.push(result);return result}})
          for(const [label,kind]of [['淡入淡出','fade'],['推移','push'],['神奇移动','magic']]){
            await page.locator('.native-transition-menu>summary').click();await page.getByRole('menuitemradio',{name:label,exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
            await page.getByRole('button',{name:'放映',exact:true}).click();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await show.focus()
            const before=await show.locator('.native-slides-presentation-current').boundingBox(),heading=await show.locator('[data-node-id="page-1-heading"]').boundingBox()
            await page.evaluate(()=>{window.__mixedRecords=[];window.__mixedAnimations=[]});await page.keyboard.press('ArrowRight');await show.locator('.native-slides-presentation-outgoing').waitFor();await page.evaluate(()=>{for(const animation of window.__mixedAnimations){animation.pause();animation.currentTime=0}})
            const outgoing=await show.locator('.native-slides-presentation-outgoing').boundingBox(),incoming=await show.locator('.native-slides-presentation-current').boundingBox(),animations=await page.evaluate(()=>window.__mixedRecords)
            await writeFile(join(output,'mixed-native.json'),JSON.stringify({kind,before,outgoing,incoming,heading,animations},null,2))
            assert.ok(Math.abs(before.width-outgoing.width)<=1&&Math.abs(before.height-outgoing.height)<=1,'混合尺寸离去页必须保持原适配比例')
            if(kind==='magic'){const animation=animations.find(row=>row.id==='page-2-heading');assert.ok(animation);const frame=animation.frames[0],scale=incoming.width/targetWidth;assert.ok(Math.abs(parseFloat(frame.left)*scale+incoming.x-heading.x)<=1);assert.ok(Math.abs(parseFloat(frame.top)*scale+incoming.y-heading.y)<=1);assert.ok(Math.abs(parseFloat(frame.width)*scale-heading.width)<=1)}
            if(options['presentation-portrait']==='true'&&kind==='magic'){
              await show.locator('.native-slides-presentation-current [data-node-id="page-2-image"] img').waitFor({state:'attached'})
              await page.waitForFunction(()=>{const img=document.querySelector('.native-magic-overlay [data-node-id="page-2-image"] img');return img?.complete&&img.naturalWidth>0})
              assert.equal(await show.locator('.native-magic-overlay [data-node-id="page-2-image"] [aria-busy]').count(),0,'运动覆盖层必须同步React异步图片，不能冻结加载占位')
              await page.screenshot({path:join(output,'portrait-live-image.png')})
            }
            if(options['presentation-offpaper']==='true'&&kind==='magic')await offpaperInk(page,show.locator('[data-node-id="offpaper"]'),'offpaper-native-midpoint')
            if(options['presentation-portrait']==='true'&&kind==='magic'){const ink=await titleInk(page,heading,'portrait-native-visible');await writeFile(join(output,'portrait-native-ink.json'),JSON.stringify({ink,heading,incoming},null,2));assert.ok(ink>5,'横竖页神奇移动起点必须实际绘出文字，不能只校验几何')}
            await page.screenshot({path:join(output,`mixed-${kind}.png`)});await page.evaluate(()=>{for(const animation of window.__mixedAnimations)animation.finish()});await page.waitForFunction(()=>!document.querySelector('.native-slides-presentation-outgoing'));assert.equal(await show.locator('.native-magic-overlay').count(),0,'转场结束必须移除临时运动覆盖层');if(options['presentation-portrait']==='true'&&kind==='magic')assert.deepEqual(await show.locator('.native-slides-presentation-current').evaluate(e=>({frame:getComputedStyle(e.closest('.native-slides-presentation-frame')).overflow,page:getComputedStyle(e.querySelector('.native-page-content')).overflow,stage:getComputedStyle(e.closest('.native-slides-presentation-stage')).overflow})),{frame:'hidden',page:'hidden',stage:'hidden'});if(options['presentation-portrait']==='true'&&kind==='magic'){
              const reverseHeading=await show.locator('[data-node-id="page-2-heading"]').boundingBox();await page.evaluate(()=>{window.__mixedRecords=[];window.__mixedAnimations=[]});await show.press('ArrowLeft');await show.locator('.native-slides-presentation-outgoing').waitFor();await page.evaluate(()=>{for(const animation of window.__mixedAnimations){animation.pause();animation.currentTime=0}});const ink=await titleInk(page,reverseHeading,'portrait-native-reverse-visible');await writeFile(join(output,'portrait-native-reverse-ink.json'),JSON.stringify({ink,reverseHeading},null,2));assert.ok(ink>5,'竖版返回横版的神奇移动文字必须可见');await page.evaluate(()=>{for(const animation of window.__mixedAnimations)animation.finish()});await page.waitForFunction(()=>!document.querySelector('.native-slides-presentation-outgoing'))
            };if(options['presentation-portrait']==='true'&&kind==='magic'){
              await page.evaluate(()=>{window.__mixedRecords=[];window.__mixedAnimations=[]});await show.press('ArrowRight');await show.locator('.native-magic-overlay').waitFor();await show.press('Escape');assert.equal(await page.locator('.native-magic-overlay').count(),0,'退出放映必须清理运动覆盖层与异步观察器')
            }else await show.press('Escape');await select(1);records.push({kind,outgoingSizePreserved:true,screenGeometryContinuous:kind==='magic'?true:null})
          }
        }
        document.pages['page-1'].transition='magic'
        const {exportArtifact}=await import('../src/features/artifacts/native/export-artifact.ts'),exported=await exportArtifact(document,{format:'html',resolveAsset:async asset=>{const image=fixture.images.find(image=>image.id===asset.id);return new Blob([image.bytes],{type:image.contentType})}})
        const offline=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'}),offlineErrors=[];offline.on('pageerror',error=>offlineErrors.push(error.message));await offline.setContent(await exported.blob.text())
        await offline.evaluate(()=>{window.__mixedRecords=[];window.__mixedAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,timing){const result=animate.call(this,frames,timing);result.pause();result.currentTime=0;window.__mixedRecords.push({id:this.getAttribute('data-node-id'),frames,timing});window.__mixedAnimations.push(result);return result}})
        if(options['presentation-portrait']==='true')await offline.evaluate(()=>{const original=window.setTimeout;window.setTimeout=(fn,delay,...args)=>original(fn,[570,670,730].includes(delay)?delay*10:delay,...args)})
        const before=await offline.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').boundingBox();await offline.getByRole('button',{name:'下一页',exact:true}).click();await offline.evaluate(()=>{for(const animation of window.__mixedAnimations){animation.pause();animation.currentTime=0}})
        const animations=await offline.evaluate(()=>window.__mixedRecords),animation=animations.find(row=>row.id==='page-2-heading'),incoming=await offline.locator('[data-page-id="page-2"]').boundingBox(),scale=incoming.width/targetWidth
        assert.ok(animation);await writeFile(join(output,'mixed-offline.json'),JSON.stringify({before,incoming,animation},null,2));const expectedScale=Math.min(1440/targetWidth,952/targetHeight);assert.ok(Math.abs(incoming.width-targetWidth*expectedScale)<=1&&Math.abs(incoming.height-targetHeight*expectedScale)<=1,'离线隐藏页进入时必须按固定页面尺寸适配');assert.ok(Math.abs(parseFloat(animation.frames[0].left)*scale+incoming.x-before.x)<=1,'离线混合尺寸神奇移动不能跳变起点');assert.ok(Math.abs(parseFloat(animation.frames[0].width)*scale-before.width)<=1)
        if(options['presentation-offpaper']==='true')await offpaperInk(offline,offline.locator('[data-page-id="page-2"] [data-node-id="offpaper"]'),'offpaper-offline-midpoint')
        if(options['presentation-portrait']==='true'){const ink=await titleInk(offline,before,'portrait-offline-visible');await writeFile(join(output,'portrait-offline-ink.json'),JSON.stringify({ink,before,incoming},null,2));assert.ok(ink>5,'离线横竖页神奇移动起点必须实际绘出文字')}
        await offline.evaluate(()=>{for(const animation of window.__mixedAnimations)animation.finish()});await offline.waitForFunction(()=>document.querySelector('main>article').hidden);assert.equal(await offline.locator('[data-page-id="page-2"]').evaluate(e=>getComputedStyle(e).overflow),'hidden');assert.equal(await offline.locator('main').evaluate(e=>getComputedStyle(e).overflow),'hidden');assert.equal(await offline.locator('.artifact-magic-overlay').count(),0,'离线转场结束必须移除临时运动覆盖层')
        if(options['presentation-portrait']==='true'){
          const reverseHeading=await offline.locator('[data-page-id="page-2"] [data-node-id="page-2-heading"]').boundingBox();await offline.evaluate(()=>{window.__mixedRecords=[];window.__mixedAnimations=[]});await offline.getByRole('button',{name:'上一页',exact:true}).click();await offline.evaluate(()=>{for(const animation of window.__mixedAnimations){animation.pause();animation.currentTime=0}});const ink=await titleInk(offline,reverseHeading,'portrait-offline-reverse-visible');await writeFile(join(output,'portrait-offline-reverse-ink.json'),JSON.stringify({ink,reverseHeading},null,2));assert.ok(ink>5,'离线竖版返回横版的神奇移动文字必须可见');await offline.evaluate(()=>{for(const animation of window.__mixedAnimations)animation.finish()});await offline.waitForFunction(()=>document.querySelector('main>article').hidden===false);assert.equal(await offline.locator('[data-page-id="page-1"]').evaluate(e=>getComputedStyle(e).overflow),'hidden')
        }
        assert.deepEqual(offlineErrors,[]);await offline.close();assert.deepEqual(errors,[])
        return{kind:'isolated-mixed-slide-transitions',records,offlineMagicScreenGeometryContinuous:true,consoleOrPageErrors:errors}
      }
      if(options['presentation-keyboard-isolation']==='true'){
        const root=page.locator('[data-native-artifact-editor]')
        await page.locator('[data-node-id="page-1-shape"]').click();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
        const saved=JSON.stringify(document)
        await page.getByRole('button',{name:'放映',exact:true}).click();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await show.focus()
        const trail=[]
        for(let n=0;n<20;n++){await page.keyboard.press('Tab');const state=await page.evaluate(()=>({tag:document.activeElement?.tagName,outerRoot:document.activeElement?.matches('[data-native-artifact-editor]'),label:document.activeElement?.getAttribute('aria-label')}));trail.push(state);if(state.outerRoot)break}
        await page.keyboard.press('Control+z');await page.waitForTimeout(150)
        await writeFile(join(output,'presentation-tab.json'),JSON.stringify({trail,seqBefore:JSON.parse(saved).seq,seqAfter:document.seq,historyRequests},null,2))
        assert.deepEqual(historyRequests,[],'放映Tab循环不能撤销底层文档');assert.equal(JSON.stringify(document),saved)
        assert.equal(await root.getAttribute('tabindex'),'-1')
        await root.focus();for(const key of ['Control+z','Control+y','Delete','Backspace'])await page.keyboard.press(key)
        await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:baseUrl});await page.evaluate(()=>navigator.clipboard.writeText('放映期间不能插入的文字'));await page.keyboard.press('Control+v');await page.waitForTimeout(150)
        assert.deepEqual(historyRequests,[]);assert.equal(JSON.stringify(document),saved);assert.equal(await show.count(),1)
        await page.keyboard.press('Control+s');await page.keyboard.press('Escape');await page.getByRole('button',{name:'放映',exact:true}).waitFor();assert.equal(await root.getAttribute('tabindex'),'0');assert.equal(JSON.stringify(document),saved);assert.deepEqual(errors,[])
        return{kind:'isolated-presentation-keyboard-isolation',trustedTabCannotUndo:true,programmaticOuterFocusCannotEditOrPaste:true,rootExcludedFromTabOrder:true,saveAndEscapePreserved:true,consoleOrPageErrors:errors}
      }
      if(options['presentation-focus-return']==='true'){
        const focus=[]
        for(let opening=0;opening<2;opening++){
          await page.getByRole('button',{name:'放映',exact:true}).click();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await page.waitForTimeout(100)
          focus.push(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')))
          assert.equal(focus.at(-1),'幻灯片放映','冷/热模块放映均须保留键盘焦点')
          await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')==='page-2');await page.keyboard.press('Escape');await page.getByRole('button',{name:'放映',exact:true}).waitFor();await select(1)
        }
        assert.deepEqual(errors,[]);return{kind:'isolated-presentation-focus-return',coldAndWarmFocus:focus,keyboardNavigationWithoutForcedFocus:true,consoleOrPageErrors:errors}
      }
      assert.equal(kind,'slides');assert.equal(presentationModuleRequests,0,'放映代码在普通编辑时不加载')
      const waitSaved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      const root=page.locator('[data-native-artifact-editor]'),records=[]
      await page.addInitScript(()=>{window.__slideAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,timing){window.__slideAnimations.push({nodeId:this.getAttribute('data-node-id'),className:this.className,frames,timing});return animate.call(this,frames,timing)}})
      await page.getByLabel('显示属性',{exact:true}).click()
      const inspectorRect=await page.getByLabel('属性面板',{exact:true}).boundingBox(),rootRect=await root.boundingBox()
      if(rootRect.width<768){assert.ok(Math.abs(inspectorRect.height-Math.min(rootRect.height/2,384))<=1);assert.ok(Math.abs(inspectorRect.y+inspectorRect.height-rootRect.y-rootRect.height)<=1);assert.ok(Math.abs(inspectorRect.width-rootRect.width)<=1)}else{assert.equal(inspectorRect.width,336);assert.ok(Math.abs(inspectorRect.y-rootRect.y)<=1)}
      await page.screenshot({path:join(output,'slide-transitions-inspector.png')})
      const choose=async value=>{await page.locator('.native-transition-menu>summary').click();await page.getByRole('menuitemradio',{name:value,exact:true}).click();await waitSaved()}
      await choose('推移');assert.equal(document.pages['page-1'].transition,'push')
      await root.focus();await page.keyboard.press('Control+z');await page.getByLabel('转场：无',{exact:true}).waitFor();await waitSaved();assert.equal(document.pages['page-1'].transition,'none')
      await page.keyboard.press('Control+Shift+z');await page.getByLabel('转场：推移',{exact:true}).waitFor();await waitSaved();assert.equal(document.pages['page-1'].transition,'push')
      await choose('神奇移动');await page.getByLabel('关闭属性',{exact:true}).click()
      if(await root.getAttribute('data-compact')==='true')await page.getByRole('button',{name:'显示页面缩略图',exact:true}).click()
      await page.locator('[data-page-target="page-1"]').hover();await page.getByLabel('页面 1 操作',{exact:true}).click();await page.getByRole('button',{name:'复制页面',exact:true}).click();await waitSaved()
      const copyId=document.pageOrder[1],copy=document.pages[copyId],heading=Object.values(copy.nodes).find(node=>node.motionId==='page-1-heading');assert.ok(heading)
      await page.locator(`[data-page-target="${copyId}"]`).click();await page.locator(`[data-page-id="${copyId}"] [data-node-id="${heading.id}"]`).click();await page.keyboard.press('ArrowRight');await waitSaved();assert.equal(document.pages[copyId].nodes[heading.id].x,document.pages['page-1'].nodes['page-1-heading'].x+1)
      if(options['presentation-copy-identity']==='true'){
        await page.locator(`[data-page-id="${copyId}"] [data-node-id="${heading.id}"]`).click();await page.keyboard.press('Control+d');await waitSaved()
        const shared=Object.values(document.pages[copyId].nodes).filter(node=>node.motionId==='page-1-heading');assert.equal(shared.length,1,'普通对象副本不能争用整页副本的配对身份')
        const clone=Object.values(document.pages[copyId].nodes).find(node=>node.id!==heading.id&&node.type==='text');assert.ok(clone);assert.equal(clone.motionId,undefined)
      }
      await page.reload();await ready(1);assert.equal(document.pages[copyId].nodes[heading.id].motionId,'page-1-heading');assert.equal(presentationModuleRequests,0)
      await page.getByLabel('显示属性',{exact:true}).click()
      for(const [label,kind,duration]of [['淡入淡出','fade',320],['推移','push',420],['神奇移动','magic',480]]){
        await choose(label)
        await page.getByRole('button',{name:'放映',exact:true}).click()
        const presentation=page.getByRole('region',{name:'幻灯片放映',exact:true});await presentation.waitFor();await presentation.focus();await presentation.press('Control+s')
        await page.evaluate(()=>{window.__slideAnimations=[]});await page.keyboard.press('ArrowRight')
        await page.waitForFunction(id=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')===id,copyId)
        await page.waitForFunction(()=>window.__slideAnimations.length>0)
        const forward=await page.evaluate(()=>window.__slideAnimations);assert.ok(forward.every(row=>row.timing.duration===duration));assert.ok(forward.every(row=>row.timing.easing==='cubic-bezier(0.33, 0.01, 0.2, 1)'))
        if(kind==='magic')assert.ok(forward.some(row=>row.nodeId===heading.id&&row.frames[0].left!==row.frames[1].left))
        await page.waitForFunction(()=>!document.querySelector('.native-slides-presentation-outgoing'))
        assert.equal(await page.locator('.native-slides-presentation [data-page-id]').count(),1)
        await page.evaluate(()=>{window.__slideAnimations=[]});await presentation.getByRole('button',{name:'上一页',exact:true}).focus();await page.keyboard.press('ArrowLeft')
        await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')==='page-1')
        await page.waitForFunction(()=>window.__slideAnimations.length>0);const backward=await page.evaluate(()=>window.__slideAnimations)
        assert.ok(backward.every(row=>row.timing.duration===duration));if(kind==='push'){assert.match(forward[0].frames[1].transform,/-1920px/);assert.match(backward[0].frames[1].transform,/1920px/)}
        await page.waitForFunction(()=>!document.querySelector('.native-slides-presentation-outgoing'))
        await presentation.press('Escape');await page.getByRole('button',{name:'放映',exact:true}).waitFor();records.push({kind,duration,forwardAnimations:forward.length,backwardAnimations:backward.length})
      }
      await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'放映',exact:true}).click();const presentation=page.getByRole('region',{name:'幻灯片放映',exact:true});await presentation.waitFor();await page.evaluate(()=>{window.__slideAnimations=[]});await presentation.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(id=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')===id,copyId);assert.deepEqual(await page.evaluate(()=>window.__slideAnimations),[])
      await presentation.getByRole('button',{name:'讲者备注',exact:true}).click();assert.equal(await presentation.getByRole('textbox').count(),0)
      await presentation.press('Home');await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')==='page-1');await presentation.press('End');await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')==='page-3');await presentation.press('2');await page.waitForFunction(id=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')===id,copyId);await presentation.press('Escape')
      const {exportArtifact}=await import('../src/features/artifacts/native/export-artifact.ts')
      const exported=await exportArtifact(document,{format:'html',resolveAsset:async asset=>{const image=fixture.images.find(image=>image.id===asset.id);assert.ok(image);return new Blob([image.bytes],{type:image.contentType})}}),html=await exported.blob.text()
      const offline=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'no-preference'}),offlineErrors=[],offlineRequests=[]
      offline.on('pageerror',error=>offlineErrors.push(error.message));offline.on('request',request=>{if(!request.url().startsWith('data:'))offlineRequests.push(request.url())})
      await offline.addInitScript(()=>{window.__offlineAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,timing){window.__offlineAnimations.push({frames,timing});return animate.call(this,frames,timing)}})
      await offline.goto('about:blank');await offline.setContent(html);await offline.evaluate(()=>{window.__offlineAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,timing){window.__offlineAnimations.push({frames,timing});return animate.call(this,frames,timing)}})
      await offline.getByRole('button',{name:'下一页',exact:true}).click();await offline.waitForFunction(()=>window.__offlineAnimations.length>0);assert.ok((await offline.evaluate(()=>window.__offlineAnimations)).every(row=>row.timing.duration===480));await offline.waitForFunction(()=>document.querySelector('main>article').hidden)
      await offline.getByRole('button',{name:'上一页',exact:true}).click();await offline.waitForFunction(()=>document.querySelector('main>article').hidden===false);await offline.emulateMedia({reducedMotion:'reduce'});await offline.getByRole('button',{name:'下一页',exact:true}).click();await offline.waitForFunction(()=>document.querySelector('#position').textContent==='2 / 4');await offline.keyboard.press('End');await offline.waitForFunction(()=>document.querySelector('#position').textContent==='4 / 4');await offline.keyboard.press('Home');await offline.waitForFunction(()=>document.querySelector('#position').textContent==='1 / 4');await offline.emulateMedia({media:'print'});assert.equal(await offline.locator('main>article:visible').count(),4)
      assert.deepEqual(offlineErrors,[]);assert.deepEqual(offlineRequests,[]);await offline.close()
      assert.deepEqual(errors,[])
      return{kind:'isolated-slide-transition-diagnostic',records,copyMotionIdentitySurvivesReopen:true,undoRedo:true,reducedMotionSuppressesTransitions:true,presentationNotesReadOnly:true,homeEnd:true,offlineHtmlAnimation:true,offlineHtmlPrintAllPages:true,offlineHtmlNetworkRequests:0,presentationModuleRequests,inspectorRect,consoleOrPageErrors:errors}
    }
    if(options.checks==='undo-focus'){
      const root=page.locator('[data-native-artifact-editor]'),stage=page.locator('.native-stage');assert.equal(kind,'design')
      await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:'50%',exact:true}).click();await ready(1)
      const snapshots=[],capture=async label=>{snapshots.push({label,...await stage.evaluate(e=>({x:e.scrollLeft,y:e.scrollTop,width:e.clientWidth,height:e.clientHeight,activeTag:document.activeElement?.tagName,activeClass:document.activeElement?.className,rootFocused:document.activeElement===document.querySelector('[data-native-artifact-editor]'),imageCount:document.querySelectorAll('[data-page-id="page-1"] [data-node-type=image] img').length,formulaCount:document.querySelectorAll('[data-page-id="page-1"] [data-formula-ready=true]').length}))});await writeFile(join(output,'undo-focus.json'),JSON.stringify(snapshots,null,2))}
      await capture('编辑前');const original=document.pages['page-1'].nodes['page-1-heading'].text
      await page.locator('[data-node-id="page-1-heading"]').dblclick();const input=page.locator('[data-native-text-editor]');await input.click();await input.press('End');await page.keyboard.insertText(' 中文回归');if(options.completion==='escape')await input.press('Escape');else await page.locator('.native-rich-editor').getByRole('button',{name:'完成',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved');await capture('结束编辑后')
      for(let tabs=0;tabs<65;tabs++){if(await root.evaluate(e=>document.hasFocus()&&e.contains(document.activeElement)&&document.activeElement.closest('[data-native-artifact-editor],[data-native-editor-boundary]')===e&&!document.activeElement.closest('input,textarea,[contenteditable=true]')))break;await page.keyboard.press('Shift+Tab')}
      await capture('键盘焦点恢复后');assert.ok(Math.abs(snapshots[1].x-snapshots[2].x)<=1&&Math.abs(snapshots[1].y-snapshots[2].y)<=1,'完成文本并恢复键盘焦点不应滚动画布')
      await page.keyboard.press('Control+z');await page.waitForFunction(original=>document.querySelector('[data-node-id="page-1-heading"]')?.textContent===original,original);await ready(1);await capture('撤销后');assert.equal(historyRequests.at(-1),'undo');assert.deepEqual(errors,[])
      return{kind:'isolated-undo-focus-diagnostic',completion:options.completion??'button',narrowEditor:true,completionKeepsCamera:true,trustedUndoRestoresHeading:true,mediaAndFormulaRemainReady:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='viewport-loading'){
      assert.equal(kind,'design')
      await page.waitForFunction(()=>document.querySelectorAll('.native-board-thumbnail').length===49)
      assert.deepEqual(pageReads,[],'fit view loads only the current page')
      await page.evaluate(()=>{window.__holdVisible=true})
      await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:'100%',exact:true}).click()
      await page.waitForFunction(()=>window.__heldVisible.length>0)
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      assert.deepEqual(pageReads,[],'a pending zoom query must not load pages from the previous fit viewport')
      await page.evaluate(()=>{window.__holdVisible=false;for(const release of window.__heldVisible.splice(0))release()})
      await ready(1)
      await page.waitForFunction(()=>document.querySelectorAll('[data-artboard-id]').length>0)
      assert.ok(pageReads.length<5,'the resolved zoom query loads only nearby pages')
      await scrollCanvasTo(document.pages['page-50'])
      await ready(50);assert.ok(pageReads.includes('page-50'));assert.ok(pageReads.length<8)
      for(const id of document.pageOrder)assert.equal(pageHash(document.pages[id]),initialPageHashes[id])
      assert.equal(document.seq,0);assert.deepEqual(errors,[])
      return{kind:'isolated-viewport-loading-diagnostic',pages:50,staleViewportLoads:0,resolvedPageReads:pageReads,originalDocumentUnchanged:true,consoleOrPageErrors:errors,scope:'真实 React、Worker 与缩放控件；延迟交付真实 Worker 响应，HTTP 夹具不代替授权 API 或性能验收'}
    }
    if(options.checks==='canvas-empty'){
      await page.getByRole('button',{name:'便签 (N)',exact:true}).click();await page.mouse.click(200,240)
      await page.getByRole('textbox',{name:'编辑文本',exact:true}).waitFor()
      await page.keyboard.insertText('空画布第一条便签');await page.getByRole('button',{name:'完成',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      assert.deepEqual(document.pageOrder,[]);assert.ok(document.canvasPages?.[0].contentId)
      assert.equal(Object.values(document.pages[document.canvasPages[0].contentId].nodes)[0].text,'空画布第一条便签')
      assert.deepEqual(errors,[])
      return{kind:'isolated-empty-canvas-diagnostic',firstStickyWithoutArtboard:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-links'){
      await page.context().grantPermissions(['clipboard-read','clipboard-write'])
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel('页面“链接目标页面”操作',{exact:true}).click()
      await page.getByRole('button',{name:'复制页面链接',exact:true}).click();await page.getByRole('status').filter({hasText:'页面链接已复制。'}).waitFor()
      const copied=await page.evaluate(()=>navigator.clipboard.readText()),link=new URL(copied)
      assert.equal(link.searchParams.get('design'),'fixture');assert.equal(link.searchParams.get('canvasPage'),'linked-page')
      assert.deepEqual([...link.searchParams.keys()],['project','view','conversation','design','canvasPage'])
      await page.goto(copied,{waitUntil:'domcontentloaded'});await page.locator('[data-artboard-id="page-2"]').waitFor()
      assert.equal(await page.locator('[data-canvas-page-id]').getAttribute('data-canvas-page-id'),'linked-page')
      assert.equal(await page.locator('[data-artboard-id="page-1"]').count(),0)
      await page.reload();await page.locator('[data-artboard-id="page-2"]').waitFor()
      await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+Alt+l')
      await page.getByRole('status').filter({hasText:'页面链接已复制。'}).waitFor()
      assert.equal((new URL(await page.evaluate(()=>navigator.clipboard.readText()))).searchParams.get('canvasPage'),'linked-page')
      link.searchParams.set('canvasPage','deleted-page');await page.goto(link.href,{waitUntil:'domcontentloaded'})
      await page.getByRole('status').filter({hasText:'链接中的页面已删除或不存在，已打开第一个页面。'}).waitFor()
      await page.locator('[data-artboard-id="page-1"]').waitFor()
      assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-private-canvas-link-diagnostic',trustedClipboard:true,nonActivePageTarget:true,refreshRestoresPage:true,copyShortcut:true,deletedPageChineseFeedback:true,noDocumentWrites:true,scope:'actual React/Worker and clipboard; controlled HTTP fixture, not host authentication acceptance',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-layout-cache'&&options['grid-second-row']==='true'){
      const bodyId=document.canvasPages[0].contentId,targetId=options['grid-mixed']==='true'||options['grid-shapes-only']==='true'?'grid-note-4':'grid-note-2',target=page.locator(`[data-page-id="${bodyId}"] [data-node-id="${targetId}"]`)
      await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:'50%',exact:true}).click()
      await target.waitFor();await page.waitForFunction(id=>document.querySelector(`[data-node-id="${id}"]`)?.offsetHeight>2500,targetId)
      const before=await target.boundingBox(),distance=before.y+before.height-180
      await page.locator('.native-stage').hover();await page.mouse.wheel(0,distance)
      await page.waitForFunction(id=>{const node=document.querySelector(`[data-node-id="${id}"]`);if(!node)return false;const rect=node.getBoundingClientRect();return rect.top<0&&rect.bottom>100&&rect.bottom<300},targetId)
      const after=await target.boundingBox();assert.ok(after.y+after.height>100)
      if(options['grid-mixed']==='true'||options['grid-shapes-only']==='true'){await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'新建页面',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 1',exact:true}).click();await target.waitFor();await page.waitForFunction(id=>{const node=document.querySelector(`[data-node-id="${id}"]`);if(!node)return false;const rect=node.getBoundingClientRect();return rect.top<0&&rect.bottom>100},targetId);const restored=await target.boundingBox();assert.ok(restored.y<0&&restored.y+restored.height>100)}
      await page.waitForFunction(({bodyId,targetId})=>window.__geometryLog.some(message=>message.direction==='request'&&message.task?.kind==='elements'&&message.task.pageId===bodyId&&message.task.elements.some(node=>node.id===targetId&&node.y>700)),{bodyId,targetId})
      for(const node of Object.values(document.pages[bodyId].nodes).filter(node=>node.type==='note'))assert.deepEqual([node.x,node.y,node.width,node.height],[0,0,240,832])
      if(options['grid-mixed']!=='true'&&options['grid-shapes-only']!=='true')assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-grid-row-geometry-diagnostic',mixedNodes:options['grid-mixed']==='true',shapesOnly:options['grid-shapes-only']==='true',flowOffsetsReachWorker:true,secondRowVisibleAfterTrustedWheel:true,authoredGeometryUnchanged:true,before,after,scope:'actual React/Worker and trusted wheel; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-layout-cache'){
      const bodyId=document.canvasPages[0].contentId,target=page.locator(`[data-page-id="${bodyId}"] [data-node-id="imported-note"]`)
      await page.waitForFunction(()=>{const note=document.querySelector('[data-node-id="imported-note"]');return note&&note.offsetHeight>2500})
      await page.locator('.native-stage').hover();await page.mouse.wheel(0,650)
      await page.waitForFunction(()=>{const note=document.querySelector('[data-node-id="imported-note"]');return note&&note.getBoundingClientRect().y<0})
      const before=await target.boundingBox();assert.ok(before.y+before.height>100)
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'新建页面',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      await page.waitForFunction(id=>document.querySelector('[data-canvas-page-id]')?.dataset.canvasPageId===id,document.canvasPages[1].id)
      if(options['evict-pages']==='true')for(let i=0;i<8;i++){
        await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'新建页面',exact:true}).click()
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        await page.waitForFunction(id=>document.querySelector('[data-canvas-page-id]')?.dataset.canvasPageId===id,document.canvasPages.at(-1).id)
        await page.getByRole('button',{name:'便签 (N)',exact:true}).click();await page.mouse.click(200,240)
        await page.getByRole('textbox',{name:'编辑文本',exact:true}).waitFor();await page.keyboard.insertText('缓存淘汰验收')
        await page.getByRole('button',{name:'完成',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      }
      const next=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:bodyId,nodeId:'unrelated',patch:{x:1}}])).document
      const observed=page.waitForRequest(request=>request.url().endsWith('/editor-context')&&request.postDataJSON()?.version===String(next.seq));document=next;await observed
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 1',exact:true}).click()
      await target.waitFor().catch(async error=>{await writeFile(join(output,'cache-failure-state.json'),JSON.stringify(await page.evaluate(id=>({probes:[...document.querySelectorAll('[data-native-measure-node]')].map(e=>({id:e.dataset.nativeMeasureNode,width:getComputedStyle(e).width,height:getComputedStyle(e).height,rects:e.getClientRects().length})),notices:[...document.querySelectorAll('.native-notice')].map(e=>e.textContent),worker:window.__geometryLog.filter(message=>message.task?.pageId===id).slice(-10)}),bodyId),null,2));throw error});const after=await target.boundingBox()
      assert.ok(Math.abs(before.x-after.x)<=1&&Math.abs(before.y-after.y)<=1&&Math.abs(before.height-after.height)<=1,'unrelated page cloning retains actual visible note geometry')
      const probePeak=await page.evaluate(()=>window.__naturalProbePeak);assert.ok(probePeak>=1&&probePeak<=8,'measurement fallback mounts at most eight inert notes')
      assert.equal(await page.locator('[data-native-measure-node]').count(),0,'completed probes do not remain mounted')
      assert.equal(document.pages[bodyId].nodes['imported-note'].height,832,'readonly layout does not persist measured height')
      assert.equal(document.pages[bodyId].nodes['imported-note'].text.length,options['layout-case']?800:options['inherit-font']==='true'?2000:600)
      assert.deepEqual(errors,[])
      return{kind:'isolated-natural-layout-cache-diagnostic',wholePageCloneKeepsVisibleNote:true,normalCacheEvictionRecovered:options['evict-pages']==='true',storedHeightUnchanged:true,inheritedFont:options['inherit-font']==='true',inheritedKeyword:options['inherit-keyword']??null,layoutCase:options['layout-case']??null,probePeak,before,after,scope:'controlled HTTP fixture; actual React, Worker and trusted wheel/page controls',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector-load'){
      assert.equal(vectorModuleRequests,0,'the point editor is not requested before selecting its tool')
      const choose=async()=>{await page.getByLabel('绘图工具',{exact:true}).click();await page.getByRole('group',{name:'绘图工具选项',exact:true}).getByRole('button',{name:/^钢笔/}).click()}
      await choose();await page.locator('.native-notice').filter({hasText:'钢笔工具未能加载，请刷新页面后重试。'}).waitFor();assert.ok(vectorModuleRequests>0)
      await page.mouse.click(600,300);assert.equal(document.seq,0)
      await page.getByRole('button',{name:'选择 (V)',exact:true}).click();await ready(1)
      assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-tool'),'select')
      vectorModuleBlocked=false;await page.reload();await ready(1);await choose();await page.locator('[data-native-vector-tool]').waitFor({state:'attached'})
      await page.mouse.click(600,300);await page.keyboard.press('Escape');assert.equal(document.seq,0);assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-vector-loading-diagnostic',lazyBeforeSelection:true,chineseLoadFailure:true,editorRetained:true,noDocumentWrites:true,reopenedToolRecovered:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-play-menu'){
      const before=JSON.stringify(document),board=page.locator('[data-artboard-id="page-1"]'),bounds=await board.boundingBox();assert.ok(bounds)
      const play=page.getByLabel('播放',{exact:true});await play.click();const menu=page.getByRole('group',{name:'播放选项',exact:true});await menu.waitFor();assert.equal(await menu.getByRole('button').count(),3);assert.equal(await menu.getByRole('group',{name:'静态画板',exact:true}).count(),1);assert.equal(await page.locator('.native-presenting').count(),0,'设计播放先打开画板菜单')
      const source=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-playback.json'),'utf8')),sample=(cameraReference.playMenu??source.runtime).find(row=>row.width===Number(options.width??1440)&&row.height===Number(options.height??1000)&&row.theme===(options['canvas-theme']??'light'))
      const metrics=await menu.evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),heading:e.querySelector('.native-play-menu-heading').getBoundingClientRect().toJSON(),items:[...e.querySelectorAll('button')].map(item=>({label:item.textContent,rect:item.getBoundingClientRect().toJSON()}))}));await writeFile(join(output,'play-menu-metrics.json'),JSON.stringify(metrics,null,2));assert.ok(sample)
      for(const [actual,expected]of[[metrics.rect,sample.snapshot.rect],[metrics.heading,sample.snapshot.heading.rect],...metrics.items.map((item,i)=>[item.rect,sample.snapshot.items[i].rect])])for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual[key]-expected[key])<=1,`播放菜单${key}应符合固定源码：原生${actual[key]}，参考${expected[key]}`)
      await page.screenshot({path:join(output,`design-play-menu-${options['canvas-theme']??'light'}.png`)})
      await menu.getByRole('button',{name:'Page 2',exact:true}).click();const preview=page.getByRole('region',{name:'画板全窗口预览',exact:true});await preview.waitFor();await preview.getByText('LingxiLoop 2',{exact:true}).waitFor();assert.equal(await preview.getByRole('radio').count(),2);await page.keyboard.press('Escape');await preview.waitFor({state:'detached'});assert.equal(await play.evaluate(e=>e===document.activeElement),true,'退出菜单打开的预览应回到播放入口')
      const after=await board.boundingBox();for(const key of ['x','y','width','height'])assert.ok(Math.abs(bounds[key]-after[key])<=1);assert.equal(JSON.stringify(document),before);assert.equal(receipts.length,0)
      document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{interactive:true}},{type:'page.patch',pageId:'page-3',patch:{frameless:true}}])).document
      await play.focus();await page.keyboard.press('Enter');await menu.waitFor();await menu.getByRole('group',{name:'交互原型',exact:true}).waitFor();assert.equal(await menu.getByRole('button').count(),2);assert.equal(await menu.getByRole('group',{name:'交互原型',exact:true}).getByRole('button',{name:'Page 1',exact:true}).count(),1);assert.equal(await menu.getByRole('group',{name:'静态画板',exact:true}).getByRole('button',{name:'Page 2',exact:true}).count(),1)
      await page.keyboard.press('Home');assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Page 1');await page.keyboard.press('Enter');await preview.waitFor();await preview.getByText('LingxiLoop 1',{exact:true}).waitFor();await preview.getByRole('button',{name:'返回画布',exact:true}).click();assert.equal(await play.evaluate(e=>e===document.activeElement),true);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-design-play-menu-diagnostic',staticAndPrototypeGroups:true,framelessExcluded:true,selectionOpensFullWindowPreview:true,keyboardNavigation:true,backAndEscapeRestoreCameraAndPlayFocus:true,noDocumentWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='asset-colors'){
      assert.equal(kind,'slides');await page.locator('.native-footer svg image[href^="data:image/"]').first().waitFor({state:'attached'})
      const result=await page.evaluate(async()=>{const main=document.querySelector('[data-page-id="page-1"] [data-node-type=image] img'),source=document.querySelector('.native-footer svg image').getAttribute('href'),image=new Image();image.src=source;await image.decode();const read=element=>{const canvas=document.createElement('canvas');canvas.width=main.naturalWidth;canvas.height=main.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(element,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data},original=read(main),preview=read(image);let changedPixels=0,maxChannelDelta=0;for(let pixel=0;pixel<original.length;pixel+=4){let changed=false;for(let channel=0;channel<4;channel++){const delta=Math.abs(original[pixel+channel]-preview[pixel+channel]);maxChannelDelta=Math.max(maxChannelDelta,delta);changed ||= delta!==0}if(changed)changedPixels++}return{width:main.naturalWidth,height:main.naturalHeight,thumbnailWidth:image.naturalWidth,thumbnailHeight:image.naturalHeight,changedPixels,maxChannelDelta}})
      await writeFile(join(output,'image-colors.json'),JSON.stringify(result,null,2));assert.equal(result.width,result.thumbnailWidth);assert.equal(result.height,result.thumbnailHeight);assert.equal(result.changedPixels,0,'小尺寸原图的缩略图不应改变图片颜色');assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-thumbnail-color-diagnostic',...result,originalImageColorsPreserved:true,noDocumentWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='asset-reads'){
      await page.locator('[data-page-id=page-1] [data-node-type=image] [aria-busy=true]').waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(100)
      const during=physicalImageReads.length;holdImageReads=false;releaseImageReads();await ready(1);assert.equal(during,1,'同一编辑器的主图与缩略图应只发出一个正在进行的同图请求');assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-asset-read-diagnostic',oneInFlightImageForMainAndThumbnails:true,imageDecoded:true,noDocumentWrites:true,physicalImageReads:during,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-board-preview-load'){
      assert.equal(boardModuleRequests,0,'进入预览前不加载预览模块')
      const open=()=>page.locator('[data-artboard-id=page-2]').getByRole('button',{name:'全窗口查看画板 Page 2',exact:true}).click()
      await open();await page.locator('.native-notice').filter({hasText:'全窗口预览未能加载，请刷新页面后重试。'}).waitFor();assert.ok(boardModuleRequests>0);assert.equal(await page.getByRole('region',{name:'画板全窗口预览'}).count(),0)
      await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='全窗口查看画板 Page 2',undefined,{timeout:3000})
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'全窗口查看画板 Page 2','加载失败后焦点应返回原画板按钮')
      boardModuleBlocked=false;await page.reload();await ready(1);await open();await page.getByRole('region',{name:'画板全窗口预览'}).waitFor();await page.keyboard.press('Escape');assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-board-preview-loading-diagnostic',lazyUntilOpened:true,chineseLoadFailure:true,focusRestored:true,refreshRecovered:true,noDocumentWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-board-export'){
      const board=page.locator('[data-artboard-id=page-2]'),before=JSON.stringify(document),exports=[]
      const choose=async(name)=>{await board.getByLabel('导出画板 Page 2',{exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('group',{name:'导出画板 Page 2选项',exact:true}).getByRole('button',{name}).click();const result=await download;return{filename:result.suggestedFilename(),bytes:await readFile(await result.path())}}
      for(const [label,ratio]of[['透明位图 · 原始尺寸',1],['透明位图 · 双倍尺寸',2]]){
        const output=await choose(new RegExp('^'+label));assert.equal(output.bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(output.bytes.readUInt32BE(16),1920*ratio);assert.equal(output.bytes.readUInt32BE(20),1080*ratio);exports.push({format:'png',ratio,width:1920*ratio,height:1080*ratio,bytes:output.bytes.length})
      }
      const pdf=await choose(/^便携文档/);assert.equal(pdf.filename,'Page 2.pdf');assert.ok(pdf.bytes.subarray(0,5).toString()==='%PDF-');assert.equal((pdf.bytes.toString('latin1').match(/\/Type \/Page\b/g)??[]).length,1);exports.push({format:'pdf',pages:1,bytes:pdf.bytes.length})
      const zipped=await choose(/^网页压缩包/),{default:JSZip}=await import('jszip'),archive=await JSZip.loadAsync(zipped.bytes)
      assert.equal(zipped.filename,'Page 2-html.zip');assert.deepEqual(Object.keys(archive.files),['Page 2.html']);const html=await archive.file('Page 2.html').async('string');assert.ok(html.includes('LingxiLoop 2'));assert.ok(!html.includes('LingxiLoop 1')&&!html.includes('LingxiLoop 3'));assert.equal((html.match(/<article(?:\s|>)/g)??[]).length,1)
      assert.equal(JSON.stringify(document),before);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-board-export-diagnostic',exports,archiveHasOnlySelectedBoard:true,originalSnapshotUnchanged:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-board-preview'){
      if(options['preview-module-cancel']==='true'){
        let release;const held=new Promise(resolve=>{release=resolve});await page.route('**/BoardPreview.tsx*',async route=>{await held;await route.continue()})
        const requested=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/BoardPreview.tsx'))
        const loaded=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/BoardPreview.tsx'))
        try{
          await page.locator('[data-artboard-id=page-2]').getByRole('button',{name:'全窗口查看画板 Page 2',exact:true}).click();await requested;await page.getByText('正在加载全窗口预览…',{exact:true}).waitFor();await page.keyboard.press('Escape')
          assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-board-preview'),'false','模块尚未加载时仍可退出预览')
        }finally{release()}
        await loaded;await page.waitForTimeout(100)
        assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-board-preview'),'false');assert.equal(await page.getByRole('region',{name:'画板全窗口预览'}).count(),0)
        assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'全窗口查看画板 Page 2');assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-board-preview-module-cancel-diagnostic',escapeCancelsBeforeModuleLoads:true,lateModuleDoesNotOpenOrStealFocus:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['preview-keyboard-isolation']==='true'){
        const shape=page.locator('[data-artboard-id=page-2] [data-node-id=page-2-shape]');await shape.click();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,1)
        await page.locator('[data-artboard-id=page-2]').getByRole('button',{name:'全窗口查看画板 Page 2',exact:true}).click();const preview=page.getByRole('region',{name:'画板全窗口预览'});await preview.waitFor();const saved=JSON.stringify(document)
        await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+z');await page.waitForTimeout(100);assert.deepEqual(historyRequests,[],'外层编辑器被程序回焦时，预览仍须阻止撤销底层文档');assert.equal(JSON.stringify(document),saved)
        assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('tabindex'),'-1')
        await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:baseUrl});await page.evaluate(()=>navigator.clipboard.writeText('预览期间不能插入的文字'));await page.keyboard.press('Control+v');await page.waitForTimeout(100);assert.equal(JSON.stringify(document),saved);assert.equal(receipts.length,1)
        return{kind:'isolated-board-preview-keyboard-diagnostic',outerFocusCannotUndoLiveDocument:true,outerFocusCannotPasteIntoLiveDocument:true,rootExcludedFromTabOrder:true,consoleOrPageErrors:errors}
      }
      if(options['preview-save-retry']==='true'){
        let deny=true,posts=0;await page.route('**/api/artifacts/fixture/operations',async route=>{posts++;if(deny)await route.fulfill({status:503,json:{error:'临时保存失败'}});else await route.fallback()})
        await page.locator('[data-artboard-id=page-2] [data-node-id=page-2-shape]').click();await page.keyboard.press('ArrowRight');await page.locator('.native-notice').filter({hasText:'修改尚未保存'}).waitFor();assert.equal(posts,1);deny=false
        await page.locator('[data-artboard-id=page-2]').getByRole('button',{name:'全窗口查看画板 Page 2',exact:true}).click();const preview=page.getByRole('region',{name:'画板全窗口预览'});await preview.waitFor()
        await page.evaluate(()=>{window.__previewSaves=[];addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='s')setTimeout(()=>window.__previewSaves.push({prevented:event.defaultPrevented,trusted:event.isTrusted}))},true)})
        await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved',undefined,{timeout:3000});assert.equal(posts,2)
        assert.deepEqual(await page.evaluate(()=>window.__previewSaves.at(-1)),{prevented:true,trusted:true});const saved=JSON.stringify(document)
        await page.keyboard.press('Delete');await page.keyboard.press('Control+z');assert.equal(posts,2);assert.equal(JSON.stringify(document),saved);assert.equal(await preview.count(),1);assert.deepEqual(historyRequests,[])
        return{kind:'isolated-board-preview-save-diagnostic',trustedSavePreventedBrowserDefault:true,failedOperationRetriedAndAcknowledgedInsidePreview:true,previewDoesNotDeleteOrUndo:true,successfulWrites:receipts.length,consoleOrPageErrors:errors}
      }
      const previewOrdinal=Number(options['preview-page']??2),previewId=`page-${previewOrdinal}`
      const stage=page.locator('.native-stage'),before=await stage.evaluate(e=>({x:e.scrollLeft,y:e.scrollTop})),board=page.locator(`[data-artboard-id="${previewId}"]`)
      await board.getByRole('button',{name:`全窗口查看画板 Page ${previewOrdinal}`,exact:true}).click()
      const preview=page.getByRole('region',{name:'画板全窗口预览',exact:true});await preview.waitFor()
      if(options['preview-readonly']==='true'){assert.ok(await preview.getByRole('button',{name:'评论',exact:true}).isDisabled());await page.keyboard.press('Delete');await page.keyboard.press('Control+z');assert.equal(receipts.length,0)}
      if(options['preview-body-delay']==='true'){
        await preview.getByText('正在加载画板…',{exact:true}).waitFor();await canvasBodyRequested
        await preview.getByRole('button',{name:'返回画布',exact:true}).click();await preview.waitFor({state:'detached'})
        const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/artifacts/fixture/pages/page-2');releaseCanvasBody();await response
        await page.locator('[data-artboard-id=page-2] [data-node-id=page-2-heading]').waitFor();assert.equal(await preview.count(),0,'延迟回包不能重新打开已经关闭的预览')
        await board.getByRole('button',{name:`全窗口查看画板 Page ${previewOrdinal}`,exact:true}).click();await preview.waitFor();await preview.getByText(`LingxiLoop ${previewOrdinal}`,{exact:true}).waitFor();assert.deepEqual(pageReads,['page-2'])
      }
      const artboard=preview.locator('[data-preview-artboard]');await artboard.waitFor()
      if(options['preview-deleted']==='true'){document=applyOperations(document,prepareBatch(document,[{type:'page.delete',pageId:previewId}])).document;await preview.waitFor({state:'detached'});await page.waitForFunction(()=>document.activeElement===document.querySelector('[data-native-artifact-editor]'),undefined,{timeout:3000});assert.equal(receipts.length,0);assert.deepEqual(errors,[]);return{kind:'isolated-board-preview-deleted-diagnostic',peerDeletionClosesPreview:true,editorFocusRestored:true,noLocalDocumentWrites:true,consoleOrPageErrors:errors}}
      assert.equal(await preview.getByRole('radiogroup',{name:'画板预览缩放',exact:true}).count(),1,'填满与适应使用源码的单选组语义与键盘行为')
      await preview.getByText(`LingxiLoop ${previewOrdinal}`,{exact:true}).waitFor();const idleStart=await page.evaluate(()=>window.__geometryMessages);await page.waitForTimeout(500);assert.ok((await page.evaluate(()=>window.__geometryMessages))-idleStart<12,'静止预览不应持续向Worker发送重复可见性查询')
      const source=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-board-preview.json'),'utf8')),sample=source.runtime.find(row=>row.width===Number(options.width??1440)&&row.height===Number(options.height??1000)&&row.theme===(options['canvas-theme']??'light')),fit=options['preview-small']==='true'?source.smallArtboard.fit:sample.fit
      for(const [key,value]of Object.entries(fit).filter(([key])=>['x','y','width','height'].includes(key)))assert.ok(Math.abs((await artboard.boundingBox())[key]-value)<=1,`全窗口适应视图的${key}应符合固定源码`)
      if(options['preview-comments']==='true'){
        await preview.getByRole('button',{name:'评论',exact:true}).click();const heading=await preview.locator(`[data-node-id="${previewId}-heading"]`).boundingBox();await page.mouse.click(heading.x+heading.width/2,heading.y+heading.height/2)
        const form=page.locator('.native-comment-composer'),input=form.getByRole('textbox',{name:'评论内容',exact:true});await input.fill('abc');await input.press('End');await input.pressSequentially('d');await input.press('Control+z');assert.equal(await input.inputValue(),'abc','评论输入框应保留原生撤销');await input.press('End');await input.press('Backspace');assert.equal(await input.inputValue(),'ab','预览评论应允许退格删字');await input.press('Home');await input.press('Delete');assert.equal(await input.inputValue(),'b','预览评论应允许向后删字');assert.equal(receipts.length,0,'评论中的编辑键不能修改文档');await input.fill('请检查这个画板');await form.getByRole('button',{name:'发送',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.native-board-preview .native-comment-pin').length===1)
        const anchor=decodeCommentAnchor(commentThreads[0].anchor);assert.equal(anchor.pageId,previewId);assert.equal(anchor.nodeId,`${previewId}-heading`);assert.ok(Math.abs(anchor.x-.5)<.01&&Math.abs(anchor.y-.5)<.01);assert.equal(commentThreads[0].label,`Page ${previewOrdinal}`)
        await page.getByRole('button',{name:'关闭评论',exact:true}).click()
        const point=await preview.locator('.native-comment-pin').boundingBox();assert.ok(Math.abs(point.x-heading.x-heading.width/2)<40&&Math.abs(point.y-heading.y-heading.height/2)<40)
      }
      await writeFile(join(output,'board-fit-metrics.json'),JSON.stringify(await preview.locator('.native-board-preview-title,.native-board-preview-frame,.native-page-scaled').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return{kind:e.className,rect:e.getBoundingClientRect().toJSON(),width:s.width,color:s.color,opacity:s.opacity,visibility:s.visibility,shadow:s.boxShadow,background:s.backgroundColor,text:e.classList.contains('native-board-preview-title')?e.textContent:undefined}})),null,2))
      await page.screenshot({path:join(output,`design-board-fit-${options['canvas-theme']??'light'}.png`)})
      await preview.getByRole('radio',{name:'适应',exact:true}).focus();await page.keyboard.press('ArrowLeft');assert.equal(await preview.getByRole('radio',{name:'填满',exact:true}).getAttribute('aria-checked'),'true')
      for(const [key,value]of Object.entries(sample.fill).filter(([key])=>['x','y','width','height'].includes(key)))assert.ok(Math.abs((await artboard.boundingBox())[key]-value)<=1)
      const heading=await preview.getByText(`LingxiLoop ${previewOrdinal}`,{exact:true}).boundingBox();assert.ok(Math.abs(heading.x-64)<=1&&Math.abs(heading.y-80)<=1,'填满保留原始CSS尺寸并裁剪溢出')
      await preview.getByRole('radio',{name:'填满',exact:true}).click()
      await page.screenshot({path:join(output,`design-board-fill-${options['canvas-theme']??'light'}.png`)})
      await page.keyboard.press('ArrowRight');assert.equal(await preview.getByRole('radio',{name:'适应',exact:true}).getAttribute('aria-checked'),'true')
      await preview.getByRole('button',{name:'返回画布',exact:true}).click();await preview.waitFor({state:'detached'})
      const after=await stage.evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));assert.deepEqual(after,before,'返回保留进入前画布位置')
      await board.getByRole('button',{name:`全窗口查看画板 Page ${previewOrdinal}`,exact:true}).click();await preview.waitFor()
      await page.keyboard.press('Escape');await preview.waitFor({state:'detached'})
      assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-board-preview-diagnostic',fitMatchesSourceWithin1CssPx:true,fillPreservesNaturalCssAndClips:true,radioGroupArrowNavigation:true,...(options['preview-readonly']==='true'?{readonlyCommentsDisabled:true}:{}),...(options['preview-body-delay']==='true'?{partialBodyLoadingVisible:true,closedPreviewNotReopenedByLateBody:true,oneLazyBodyRead:true}:{}),...(options['preview-comments']==='true'?{previewCommentUsesStableBoardNodeAndLocalCoordinates:true}:{}),backAndEscapeRestoreCamera:true,noDocumentWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-fit-body'){
      const select=async name=>{await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name,exact:true}).click()}
      const first=await page.locator('[data-artboard-id=page-1]').boundingBox(),requested=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/artifacts/fixture/pages/positioned-body')
      await select('页面 2');await requested;await canvasBodyRequested;assert.equal(receipts.length,0)
      if(editorCase==='rapid'){await select('页面 1');await ready(1)}
      const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/artifacts/fixture/pages/positioned-body');releaseCanvasBody();await response
      if(editorCase==='rapid'){
        assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-canvas-page-id'),'canvas-page-1')
        const kept=await page.locator('[data-artboard-id=page-1]').boundingBox();assert.ok(['x','y','width','height'].every(key=>Math.abs(kept[key]-first[key])<=1))
        await select('页面 2')
      }
      const object=page.locator('[data-node-id=positioned-object]');await object.waitFor({state:'attached',timeout:3000});const box=await object.boundingBox()
      for(const [key,value]of Object.entries({x:153.3333333333333,y:102,width:1133.3333333333335,height:850}))assert.ok(Math.abs(box[key]-value)<=1,'the first view must fit the loaded canvas body, not its empty projection')
      if(editorCase==='restored'){
        await page.mouse.move(100,120);await page.mouse.down({button:'middle'});await page.mouse.move(120,140,{steps:5});await page.mouse.up({button:'middle'})
        const moved=await object.boundingBox();assert.ok(Math.hypot(moved.x-box.x,moved.y-box.y)>10)
        await select('页面 1');await ready(1);await select('页面 2');await object.waitFor({state:'attached'});const restored=await object.boundingBox();assert.ok(['x','y','width','height'].every(key=>Math.abs(restored[key]-moved[key])<=1))
      }
      assert.deepEqual(pageReads,['positioned-body']);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-fit-partial-canvas-diagnostic',scenario:editorCase,loadedContentBeforeRememberingFirstFit:true,objectWithin1CssPx:true,...(editorCase==='rapid'?{staleLoadDoesNotSwitchCanvas:true}:editorCase==='restored'?{userCameraRestored:true}:{}),noWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-fit-switch'){
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 2',exact:true}).click()
      const board=page.locator('[data-artboard-id=positioned-board]');await board.waitFor({state:'attached',timeout:3000});const box=await board.boundingBox()
      for(const [key,value]of Object.entries({x:188.75,y:155.125,width:1062.5,height:796.875}))assert.ok(Math.abs(box[key]-value)<=1,'a first visit must fit positioned artboards using source camera coordinates')
      const scroll=await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));await page.mouse.click(100,120);await page.keyboard.down('Space');await page.mouse.move(100,120);await page.mouse.down();await page.mouse.move(120,140,{steps:5});await page.mouse.up();await page.keyboard.up('Space')
      const moved=await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));assert.notDeepEqual(moved,scroll)
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 1',exact:true}).click();await ready(1);await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 2',exact:true}).click();await board.waitFor({state:'attached'})
      assert.deepEqual(await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop})),moved);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-fit-canvas-switch-diagnostic',positiveWorldCoordinates:true,firstVisitWithin1CssPx:true,savedCameraRestored:true,noWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector-edit-load'){
      const node=page.locator('[data-node-id=editable-path]'),before=structuredClone(document.pages['canvas-vector-body'].nodes['editable-path'])
      assert.equal(pointModuleRequests,0)
      const open=async()=>{const b=await node.boundingBox();await page.mouse.dblclick(b.x+b.width*.25,b.y+b.height*.4)}
      await open();await page.locator('.native-notice').filter({hasText:'控制点工具未能加载，请刷新页面后重试。'}).waitFor();assert.ok(pointModuleRequests>0)
      assert.equal(await node.evaluate(e=>getComputedStyle(e).visibility),'visible');assert.deepEqual(document.pages['canvas-vector-body'].nodes['editable-path'],before);assert.equal(receipts.length,0)
      pointModuleBlocked=false;await page.reload();await ready(1);await open();await page.locator('[data-native-vector-editor]').waitFor({state:'attached'});await page.keyboard.press('Escape')
      assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-vector-edit-loading-diagnostic',lazyUntilOpened:true,chineseFailure:true,visiblePathPreserved:true,refreshRecovered:true,noWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector-edit-retention'){
      const node=page.locator('[data-node-id=editable-path]'),box=await node.boundingBox();await page.mouse.dblclick(box.x+box.width*.25,box.y+box.height*.4)
      const editor=page.locator('[data-native-vector-editor]');await editor.waitFor({state:'attached'})
      const original=structuredClone(document.pages['canvas-vector-body'].nodes['editable-path']),anchor=await editor.locator('[data-vector-part="a:0:1"]').boundingBox()
      if(editorCase==='touch'){
        const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2})
        await page.evaluate(()=>{window.__pointTouchTrusted=[];addEventListener('pointerdown',event=>{if(event.pointerType==='touch')window.__pointTouchTrusted.push(event.isTrusted)},true)})
        const first={id:1,x:anchor.x+anchor.width/2,y:anchor.y+anchor.height/2},second={id:2,x:first.x+100,y:first.y+100}
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first]})
        first.x+=12;first.y+=8;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[first]})
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[first,second]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[second]})
        first.x+=18;first.y+=12;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[first]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
        await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,1,'lifting a second finger must not discard the first finger path gesture');assert.equal(await editor.count(),1,'a secondary finger must not unmount the active point editor');const completed=await editor.locator('[data-vector-part="a:0:1"]').boundingBox();assert.ok(Math.abs(completed.x+completed.width/2-first.x)<=1&&Math.abs(completed.y+completed.height/2-first.y)<=1,'the first finger reaches its final position after the second finger lifts');assert.notEqual(document.pages['canvas-vector-body'].nodes['editable-path'].path.d,original.path.d);assert.deepEqual(await page.evaluate(()=>window.__pointTouchTrusted),[true,true]);await cdp.detach();assert.deepEqual(errors,[])
        return{kind:'isolated-canvas-vector-edit-retention-diagnostic',scenario:editorCase,trustedTwoFingerInput:true,activeFingerPreserved:true,oneSharedGesture:true,consoleOrPageErrors:errors}
      }
      if(editorCase==='space'||editorCase==='middle'){
        const before=await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}))
        if(editorCase==='space')await page.keyboard.down('Space')
        await page.mouse.move(anchor.x+anchor.width/2,anchor.y+anchor.height/2);await page.mouse.down({button:editorCase==='middle'?'middle':'left'});await page.mouse.move(anchor.x+anchor.width/2-100,anchor.y+anchor.height/2-80,{steps:8});await page.mouse.up({button:editorCase==='middle'?'middle':'left'})
        if(editorCase==='space')await page.keyboard.up('Space')
        assert.notDeepEqual(await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop})),before)
        assert.deepEqual(document.pages['canvas-vector-body'].nodes['editable-path'],original);assert.equal(receipts.length,0);assert.equal(await editor.locator('[data-vector-part^="a:"]').count(),3)
      }else{
        await page.mouse.move(anchor.x+anchor.width/2,anchor.y+anchor.height/2);await page.mouse.down();await page.mouse.move(anchor.x+anchor.width/2+30,anchor.y+anchor.height/2+20,{steps:8})
        if(editorCase==='denied'){
          expectedVectorDenied=true;let denied=true
          await page.route('**/api/artifacts/fixture/changes*',async route=>{if(denied)await route.fulfill({status:403,json:{error:'当前无法访问此稿件'}});else await route.fallback()})
          await page.locator('.native-loading[role=alert]').waitFor();await page.mouse.up();assert.equal(receipts.length,0)
          const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click();const download=await pending,recovery=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(recovery.vectorEditDrafts.length,1)
          denied=false;await page.getByRole('button',{name:'重试',exact:true}).click();await editor.waitFor({state:'attached'})
          await page.waitForFunction(()=>document.activeElement?.matches('[data-native-artifact-editor]'),null,{timeout:1000})
          assert.equal(await page.locator('[data-native-artifact-editor]').evaluate(e=>document.activeElement===e),true,'restoring point edits after access recovery must restore canvas keyboard focus')
        }else{
          fixtureWrite=false;document=applyOperations(document,prepareBatch(document,[{type:'document.patch',patch:{title:'权限变更'}}])).document
          await page.locator('.native-save-status').filter({hasText:'仅查看'}).waitFor();await page.mouse.up();await page.getByRole('button',{name:'选择 (V)',exact:true}).click();await editor.waitFor({state:'detached'})
          assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'draft');assert.equal(receipts.length,0)
          fixtureWrite=true;document=applyOperations(document,prepareBatch(document,[{type:'document.patch',patch:{title:'权限恢复'}}])).document
          await page.waitForFunction(()=>!document.querySelector('.native-save-status').textContent.includes('仅查看'))
          const reopened=await node.boundingBox();await page.mouse.dblclick(reopened.x+reopened.width*.25,reopened.y+reopened.height*.4);await editor.waitFor({state:'attached'})
        }
        assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'draft');assert.equal(await editor.locator('[data-vector-part^="a:"]').count(),3)
        await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,1)
        assert.notEqual(document.pages['canvas-vector-body'].nodes['editable-path'].path.d,original.path.d)
      }
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-vector-edit-retention-diagnostic',scenario:editorCase,...(['space','middle'].includes(editorCase)?{pansFromControlTarget:true,noDocumentWrites:true}:{draftRetained:true,savedAfterRecovery:true,focusRecovered:true}),scope:'真实React和可信输入，受控HTTP权限；不代替授权API验收',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector-edit-cas'){
      const node=page.locator('[data-node-id=editable-path]'),box=await node.boundingBox();assert.ok(box)
      if(editorCase.startsWith('padding')){const at=await node.locator('svg path').first().evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()*.25).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}});await page.mouse.dblclick(at.x,at.y)}else await page.mouse.dblclick(box.x+box.width*.25,box.y+box.height*.4)
      const editor=page.locator('[data-native-vector-editor]');await editor.waitFor({state:'attached'})
      if(['padding','padding-rotated','padding-change'].includes(editorCase)){
        if(editorCase==='padding-change'){
          document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'canvas-vector-body',nodeId:'editable-path',patch:{style:{paddingX:40,paddingY:10}}}])).document
          await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-node-id=editable-path]')).paddingLeft==='40px')
        }
        const before=structuredClone(document.pages['canvas-vector-body'].nodes['editable-path']),actual=await node.locator('svg path').first().evaluate(path=>[[0,180.952],[226.19,0],[452.381,226.19]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}}))
        const positions=async()=>Promise.all([0,1,2].map(async i=>{const b=await editor.locator(`[data-vector-part="a:0:${i}"]`).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2}})),overlay=await positions()
        assert.ok(overlay.every((p,i)=>Math.hypot(p.x-actual[i].x,p.y-actual[i].y)<=1),'padded paths must open at their painted SVG content position')
        await page.mouse.move(overlay[1].x,overlay[1].y);await page.mouse.down();await page.mouse.move(overlay[1].x+10,overlay[1].y+5,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
        const edited=document.pages['canvas-vector-body'].nodes['editable-path'];assert.equal(receipts.length,1);assert.deepEqual(edited.style,before.style)
        await page.keyboard.press('Escape');await editor.waitFor({state:'detached'});const ends=await node.locator('svg path').first().evaluate(path=>[0,path.getTotalLength()].map(length=>{const p=path.getPointAtLength(length).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}}));assert.ok(ends.every((p,i)=>Math.hypot(p.x-actual[i*2].x,p.y-actual[i*2].y)<=1),'saving must preserve padding and the unedited endpoints of the actual SVG')
        assert.deepEqual(errors,[]);return{kind:'isolated-canvas-vector-edit-cas-diagnostic',scenario:editorCase,contentBoxAligned:true,paddingPreserved:true,paintedEndpointsPreserved:true,consoleOrPageErrors:errors}
      }
      if(editorCase==='parent-idle'){
        const parent=document.pages['canvas-vector-body'].nodes['editable-parent']
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'canvas-vector-body',nodeId:parent.id,patch:{x:parent.x+100}}])).document
        await page.waitForFunction(x=>Number.parseFloat(document.querySelector('[data-node-id=editable-parent]').style.left)===x,parent.x+100)
        const model=await node.locator('svg path').first().evaluate(path=>{const at=new DOMPoint(226.19,0).matrixTransform(path.getScreenCTM());return{x:at.x,y:at.y}}),control=await editor.locator('[data-vector-part="a:0:1"]').boundingBox()
        assert.ok(Math.abs(model.x-control.x-control.width/2)<=1&&Math.abs(model.y-control.y-control.height/2)<=1,'an idle overlay must follow a peer moving its parent before accepting another edit')
        await page.mouse.move(control.x+control.width/2,control.y+control.height/2);await page.mouse.down();await page.mouse.move(control.x+control.width/2+30,control.y+control.height/2+20,{steps:8});await page.mouse.up()
        await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,1);assert.equal(document.pages['canvas-vector-body'].nodes[parent.id].x,parent.x+100);assert.deepEqual(errors,[])
        return{kind:'isolated-canvas-vector-edit-cas-diagnostic',scenario:editorCase,parentMoveFollowed:true,subsequentEditSaved:true,consoleOrPageErrors:errors}
      }
      const anchor=await editor.locator('[data-vector-part="a:0:1"]').boundingBox()
      await page.mouse.move(anchor.x+anchor.width/2,anchor.y+anchor.height/2);await page.mouse.down();if(editorCase!=='parent-cancel-click')await page.mouse.move(anchor.x+anchor.width/2+30,anchor.y+anchor.height/2+20,{steps:8})
      const original=structuredClone(document.pages['canvas-vector-body'].nodes['editable-path'])
      const patch=editorCase==='padding-active'?{style:{paddingX:40}}:editorCase==='rotation'||editorCase==='reload'?{rotation:90}:editorCase==='path'?{path:{...original.path,d:original.path.d.replace('226.19 0','250 0')}}:{style:{stroke:'#ff0000'}}
      document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'canvas-vector-body',nodeId:editorCase.startsWith('parent-')?'editable-parent':'editable-path',patch:editorCase.startsWith('parent-')?{rotation:90}:patch}])).document
      if(editorCase==='padding-active')await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-node-id=editable-path]')).paddingLeft==='40px')
      else if(editorCase.startsWith('parent-'))await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-node-id=editable-parent]')).transform.startsWith('matrix(0, 1, -1, 0'))
      else if(editorCase==='rotation'||editorCase==='reload')await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-node-id=editable-path]')).transform.startsWith('matrix(0, 1, -1, 0'))
      else if(editorCase==='path')await page.waitForFunction(()=>document.querySelector('[data-node-id=editable-path] svg path')?.getAttribute('d').includes('250 0'))
      else await page.waitForFunction(()=>document.querySelector('[data-native-vector-editor] > path')?.getAttribute('stroke')==='#ff0000')
      if(editorCase==='parent-cancel'||editorCase==='parent-cancel-click'){
        await page.keyboard.press('Escape');await page.mouse.up();assert.equal(receipts.length,0);assert.equal(await editor.count(),1)
        const positions=async()=>Promise.all([0,1,2].map(async i=>{const b=await editor.locator(`[data-vector-part="a:0:${i}"]`).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2}}))
        const painted=await node.locator('svg path').first().evaluate(path=>[[0,180.952],[226.19,0],[452.381,226.19]].map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}})),after=await positions()
        assert.ok(after.every((p,i)=>Math.hypot(p.x-painted[i].x,p.y-painted[i].y)<=1),'cancelling a gesture must rebuild the live parent transform, including when no point moved')
        await page.mouse.move(after[1].x,after[1].y);await page.mouse.down();await page.mouse.move(after[1].x+10,after[1].y+5,{steps:8});await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
        const final=await positions();assert.equal(receipts.length,1);assert.ok([0,2].every(i=>Math.hypot(final[i].x-painted[i].x,final[i].y-painted[i].y)<=1),'the next edit must preserve unselected points after a cancelled peer transform')
        assert.deepEqual(errors,[]);return{kind:'isolated-canvas-vector-edit-cas-diagnostic',scenario:editorCase,cancelRebasedToPeerParent:true,unselectedPointsPreserved:true,oneNextEditSaved:true,consoleOrPageErrors:errors}
      }
      await page.mouse.up();await page.waitForFunction(()=>['conflict','saved'].includes(document.querySelector('[data-save-state]')?.dataset.saveState))
      if(editorCase==='style'){
        assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'saved');assert.equal(receipts.length,1);assert.equal(document.pages['canvas-vector-body'].nodes['editable-path'].style.stroke,'#ff0000');assert.notEqual(document.pages['canvas-vector-body'].nodes['editable-path'].path.d,original.path.d)
      }else{
        assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'conflict','point geometry cannot commit through a changed transform or path')
        assert.equal(receipts.length,0)
        if(editorCase==='rotation'||editorCase==='reload'){assert.equal(document.pages['canvas-vector-body'].nodes['editable-path'].rotation,90);assert.equal(document.pages['canvas-vector-body'].nodes['editable-path'].path.d,original.path.d)}
        else if(editorCase==='padding-active'){assert.equal(document.pages['canvas-vector-body'].nodes['editable-path'].style.paddingX,40);assert.equal(document.pages['canvas-vector-body'].nodes['editable-path'].path.d,original.path.d)}
        else if(editorCase==='parent-active')assert.equal(document.pages['canvas-vector-body'].nodes['editable-parent'].rotation,90)
        else assert.equal(document.pages['canvas-vector-body'].nodes['editable-path'].path.d,patch.path.d)
        await page.getByRole('button',{name:'选择 (V)',exact:true}).click();await editor.waitFor({state:'detached'})
        const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click();const download=await pending,recovery=JSON.parse(await readFile(await download.path(),'utf8'))
        assert.equal(recovery.vectorEditDrafts.length,1);assert.equal(recovery.vectorEditDrafts[0].path.contours[0].anchors.length,3)
        if(editorCase==='reload'){
          const backedUp=page.waitForEvent('download');await page.getByRole('button',{name:'保留副本并重新载入',exact:true}).click();const backup=await backedUp,contents=JSON.parse(await readFile(await backup.path(),'utf8'));assert.equal(contents.vectorEditDrafts.length,1)
          await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
          assert.equal(await page.getByRole('button',{name:'丢弃未保存路径',exact:true}).count(),0,'explicitly downloading and reloading must clear the backed-up point draft')
          const afterReload=await node.locator('svg path').first().evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()*.25).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}});await page.mouse.dblclick(afterReload.x,afterReload.y);await editor.waitFor({state:'attached'});await page.keyboard.press('Control+s')
          assert.equal(receipts.length,0);assert.equal(document.pages['canvas-vector-body'].nodes['editable-path'].rotation,90)
        }
      }
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-vector-edit-cas-diagnostic',scenario:editorCase,...(editorCase==='style'?{unrelatedStyleMerged:true}:{remotePreserved:true,recoveryContainsPointDraft:true,unmountRetained:true,conflictProtected:true}),scope:'真实React、原生session及共享CAS；受控HTTP，不代替真实授权API',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector-edit'){
      const node=page.locator('[data-node-id=editable-path]');await node.waitFor()
      const before=structuredClone(document.pages['canvas-vector-body'].nodes['editable-path']);let undoExpected=before
      const box=await node.boundingBox();assert.ok(box)
      if(editorCase==='keyboard-enter'){await page.mouse.click(box.x+box.width*.25,box.y+box.height*.4);await page.keyboard.press('Enter')}else await page.mouse.dblclick(box.x+box.width*.25,box.y+box.height*.4)
      const editor=page.locator('[data-native-vector-editor]');await editor.waitFor({state:'attached',timeout:3000})
      assert.equal(await editor.locator('[data-vector-part^="a:"]').count(),3)
      const anchor=editor.locator('[data-vector-part="a:0:1"]')
      if(editorCase==='anchor-drag'){
        const target=await anchor.boundingBox();await page.mouse.move(target.x+target.width/2,target.y+target.height/2);await page.mouse.down();await page.mouse.move(target.x+target.width/2+30,target.y+target.height/2+20,{steps:8});await page.mouse.up()
      }else if(['pull','shift-drag','handle','break','cancel'].includes(editorCase)){
        let target=anchor
        if(editorCase==='handle'||editorCase==='break'){await anchor.click();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');target=editor.locator('[data-vector-part="c:0:2"]');undoExpected=structuredClone(document.pages['canvas-vector-body'].nodes['editable-path'])}
        if(editorCase==='pull'||editorCase==='break')await page.keyboard.down('Alt')
        if(editorCase==='shift-drag')await page.keyboard.down('Shift')
        const r=await target.boundingBox(),dx=['pull','handle','break'].includes(editorCase)?20:30,dy=editorCase==='pull'?-20:['handle','break'].includes(editorCase)?-10:20
        await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+r.height/2+dy,{steps:8})
        if(editorCase==='cancel')await page.keyboard.press('Escape')
        await page.mouse.up()
        if(editorCase==='pull'||editorCase==='break')await page.keyboard.up('Alt')
        if(editorCase==='shift-drag')await page.keyboard.up('Shift')
      }else if(['group-nudge','save-in-mode','undo-point','redo-point'].includes(editorCase)){
        await anchor.click()
        if(editorCase==='group-nudge'){for(let i=0;i<3;i++)await page.keyboard.down('ArrowRight');await page.keyboard.up('ArrowRight')}
        else{await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');if(editorCase==='save-in-mode')await page.keyboard.press('Control+s');else{await page.keyboard.press('Control+z');await page.waitForFunction(d=>document.querySelector('[data-node-id=editable-path] svg path')?.getAttribute('d')===d,before.path.d);await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');if(editorCase==='redo-point')await page.keyboard.press('Control+Shift+z')}}
      }else if(['nudge','smooth','delete'].includes(editorCase)){await anchor.click();await page.keyboard.press(editorCase==='nudge'?'ArrowRight':editorCase==='smooth'?'Enter':'Delete')}
      else if(editorCase==='insert'){
        const a=await editor.locator('[data-vector-part="a:0:0"]').boundingBox(),b=await anchor.boundingBox()
        await page.mouse.click((a.x+a.width/2+b.x+b.width/2)/2,(a.y+a.height/2+b.y+b.height/2)/2)
      }else if(editorCase==='tab'){await page.keyboard.press('Tab');await page.keyboard.press('Tab')}
      if(options['point-matched']==='true'){
        const awaitMedia=()=>page.waitForFunction(()=>{const boards=[...document.querySelectorAll('[data-artboard-id]')];return boards.length===3&&boards.every(board=>{const image=board.querySelector('[data-node-type=image] img');return image?.complete&&image.naturalWidth>0||!!board.querySelector('.native-board-thumbnail svg image[href^="data:image/"]')})});await awaitMedia()
        const geometry={controls:await page.locator('.native-toolbar button,.native-toolbar summary,.native-board-label').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{label:e.getAttribute('aria-label')??e.getAttribute('title')??e.textContent,rect:b.toJSON(),font:s.font,padding:s.padding,border:s.border,background:s.background,color:s.color,shadow:s.boxShadow,radius:s.borderRadius}})),anchors:await editor.locator('[data-vector-part^="a:"]').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{id:e.dataset.vectorPart,x:b.x+b.width/2,y:b.y+b.height/2}})),boards:await page.locator('[data-artboard-id]').evaluateAll(es=>es.map(e=>({id:e.dataset.artboardId,rect:e.getBoundingClientRect().toJSON()})))}
        geometry.surfaces=await page.locator('[data-artboard-id]').evaluateAll(es=>es.map(e=>{const styles=n=>{const s=getComputedStyle(n);return{tag:n.tagName,cls:n.className,rect:n.getBoundingClientRect().toJSON(),width:s.width,height:s.height,transform:s.transform,shadow:s.boxShadow,border:s.border,outline:s.outline,background:s.backgroundColor,overflow:s.overflow}};return{board:e.dataset.artboardId,root:styles(e),children:[...e.children].filter(n=>!n.classList.contains('native-board-heading')).map(styles)}}))
        await writeFile(join(output,'matched-geometry.json'),JSON.stringify(geometry,null,2)+'\n')
        if(options['source-surfaces']==='true'){
          const sample=cameraReference.runtime.find(row=>row.width===Number(options.width??1440)&&row.height===Number(options.height??1000)&&row.theme===(options['canvas-theme']??'light'));assert.equal(sample.surfaces.length,3)
          const labelMetrics=await page.locator('.native-board-heading>.native-board-label').evaluateAll(es=>es.map(e=>{const range=document.createRange();range.selectNodeContents(e);const s=getComputedStyle(e);return{rect:e.getBoundingClientRect().toJSON(),textRect:range.getBoundingClientRect().toJSON(),fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight}})),labels=labelMetrics.map(label=>label.textRect);geometry.labelTextRects=labels;geometry.labelMetrics=labelMetrics
          for(let i=0;i<geometry.surfaces.length;i++){
            const actual=geometry.surfaces[i].children.find(child=>child.shadow!=='none'),expected=sample.surfaces[i].surface;assert.ok(actual,'每个画板在缩略视图也应保留参考阴影');assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);assert.equal(actual.shadow.includes('oklab('),expected.shadow.includes('oklab('),'松散路径编辑应保留参考的画板焦点描边');assert.ok(actual.shadow.includes('0px 2px 4px 0px')&&actual.shadow.includes('0px 6px 16px 0px'),'缩略画板保持自然尺寸下的参考模糊几何');assert.ok(Math.abs(labels[i].x-sample.surfaces[i].labelTextRect.x)<=1,'画板标题文字的左边缘应与源码相差1px以内');const sourceLabel=sample.controls.find(control=>control.label.startsWith(`Artboard ${i+1} of `));assert.ok(sourceLabel);for(const key of ['x','y','width','height'])assert.ok(Math.abs(labelMetrics[i].rect[key]-sourceLabel.rect[key])<=1,`画板标题控件${key}应符合源码`);for(const key of ['fontSize','fontWeight','lineHeight'])assert.equal(labelMetrics[i][key],sourceLabel[key],`画板标题${key}应符合源码`)
          }
          await writeFile(join(output,'matched-geometry.json'),JSON.stringify(geometry,null,2)+'\n')
        }
        if(options['source-toolbar']==='true'){
          const reference=cameraReference.runtime.find(row=>row.width===Number(options.width??1440)&&row.height===Number(options.height??1000)&&row.theme===(options['canvas-theme']??'light'))
          assert.ok(reference,'源码工具栏尺寸与主题样本必须存在')
          const find=(rows,label)=>rows.find(row=>row.label===label),originalPage=reference.controls.find(row=>row.label.endsWith(', pages')),nativePage=find(geometry.controls,'页面菜单'),localizedWidth=nativePage.rect.width-originalPage.rect.width
          const pairs=[['选择 (V)','Select'],['手型工具 (H)','Hand'],['文本','Text'],['添加画板','Artboard'],['便签 (N)','Note'],['铅笔','Pencil'],['绘图工具','More drawing tools'],['矩形工具','Rectangle'],['插入图形','More shapes'],['导出格式','Export'],['版本历史','Version history'],['评论','Comments'],['评论选项','Comment options'],['播放','Play'],['显示属性','Properties'],['画布缩放',reference.controls.find(row=>row.label.endsWith(', Zoom')).label]]
          for(const [nativeLabel,sourceLabel]of pairs){
            const actual=find(geometry.controls,nativeLabel),expected=find(reference.controls,sourceLabel);assert.ok(actual&&expected,`${nativeLabel}必须可见`)
            const translation=pairs.findIndex(pair=>pair[0]===nativeLabel)<9?localizedWidth:sourceLabel==='Export'||sourceLabel==='Version history'?26:0
            for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual.rect[key]-expected.rect[key]-(key==='x'?translation:0))<=1,`${nativeLabel}的${key}须与同环境源码相差1px以内；原生${actual.rect[key]}，参考${expected.rect[key]}，登记重排${key==='x'?translation:0}`)
          }
        }

        if(options['source-camera']==='true'){
          const sample=cameraReference.runtime.find(row=>row.width===Number(options.width??1440)&&row.height===Number(options.height??1000)&&row.theme===(options['canvas-theme']??'light'))
          assert.ok(sample)
          assert.ok(geometry.anchors.every((point,i)=>Math.hypot(point.x-sample.anchors[i].x,point.y-sample.anchors[i].y)<=1),'the same source document must place each control point within one CSS pixel')
          assert.ok(geometry.boards.every((board,i)=>['x','y','width','height'].every(key=>Math.abs(board.rect[key]-sample.boards[i].rect[key])<=1)),'fitted artboards must match source position and size within one CSS pixel')
          const scroll=await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}))
          await page.keyboard.down('Space');await page.mouse.move(300,180);await page.mouse.down();await page.mouse.move(320,200,{steps:6});await page.mouse.up();await page.keyboard.up('Space')
          assert.notDeepEqual(await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop})),scroll)
          await page.keyboard.press('Control+0')
          await page.waitForFunction(points=>points.every((point,i)=>{const b=document.querySelector(`[data-vector-part="a:0:${i}"]`)?.getBoundingClientRect();return b&&Math.hypot(b.x+b.width/2-point.x,b.y+b.height/2-point.y)<=1}),sample.anchors)
          await awaitMedia()

        }
      }
      if(['initial','handle','break','cancel'].includes(editorCase))await page.screenshot({path:join(output,`design-point-${editorCase}-${options['canvas-theme']??'light'}.png`)})
      const source=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-vector-edit.json'),'utf8')).runtimeCases.find(sample=>sample.name===editorCase)
      assert.equal(await editor.locator('[data-vector-part^="a:"]').count(),source.state.parts.filter(p=>p.part.startsWith('a')).length)
      if(['initial','tab','keyboard-enter','cancel','undo-point'].includes(editorCase)){assert.equal(receipts.length,editorCase==='undo-point'?1:0);assert.deepEqual(document.pages['canvas-vector-body'].nodes['editable-path'],before)}
      else{
        await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
        assert.equal(receipts.length,['handle','break'].includes(editorCase)?2:1,'each complete point gesture creates one shared operation batch')
        const result=document.pages['canvas-vector-body'].nodes['editable-path'],expected=source.savedNodes[0][1],scale=box.width/before.width
        assert.ok(Math.abs(result.width-expected.w)*scale<=1&&Math.abs(result.height-expected.h)*scale<=1)
        const actualCommands=result.path.d.match(/[MLC]/g),expectedCommands=expected.d.match(/[MLC]/g);assert.deepEqual(actualCommands,expectedCommands)
        const actualNumbers=result.path.d.match(/-?\d+(?:\.\d+)?/g).map(Number),expectedNumbers=expected.d.match(/-?\d+(?:\.\d+)?/g).map(Number)
        assert.equal(actualNumbers.length,expectedNumbers.length);assert.ok(actualNumbers.every((value,i)=>Math.abs(value-expectedNumbers[i])*scale<=1),'stored point geometry stays within one source CSS pixel for the same relative trusted gesture')
        await page.keyboard.press('Control+z');await page.waitForFunction(d=>document.querySelector('[data-node-id=editable-path] svg path')?.getAttribute('d')===d,undoExpected.path.d);await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
        assert.deepEqual(document.pages['canvas-vector-body'].nodes['editable-path'],undoExpected)
        await page.keyboard.press('Control+Shift+z');await page.waitForFunction(d=>document.querySelector('[data-node-id=editable-path] svg path')?.getAttribute('d')===d,result.path.d);await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
        assert.deepEqual(document.pages['canvas-vector-body'].nodes['editable-path'],result)
      }
      await page.keyboard.press('Escape');await editor.waitFor({state:'detached'});assert.equal(await node.evaluate(e=>getComputedStyle(e).visibility),'visible')
      const saved=structuredClone(document.pages['canvas-vector-body'].nodes['editable-path']);await page.reload({waitUntil:'domcontentloaded'});await ready(1);assert.deepEqual(document.pages['canvas-vector-body'].nodes['editable-path'],saved)
      assert.deepEqual(errors,[])
      if(options['frame-focus']==='remember'){
        await page.locator('[data-artboard-id="page-2"] .native-board-label').click();await editor.waitFor({state:'detached'});await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:/^适应全部画板/}).click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
        const point=await node.locator('svg path').first().evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()*.25).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}});await page.mouse.dblclick(point.x,point.y);await editor.waitFor({state:'attached'})
        assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-current-page'),'canvas-vector-body','路径编辑上下文继续绑定独立画布')
        assert.ok(await page.locator('[data-artboard-id="page-2"] .native-page-scaled').evaluate(e=>getComputedStyle(e).boxShadow.includes('oklab(')),'画布编辑保留上次聚焦画板的描边');assert.equal(await page.locator('[data-artboard-id="page-1"] .native-page-scaled').evaluate(e=>getComputedStyle(e).boxShadow.includes('oklab(')),false);assert.equal(receipts.length,0)
      }
      return{kind:'isolated-canvas-vector-edit-diagnostic',scenario:editorCase,...(options['frame-focus']==='remember'?{lastBoardFocusSurvivesCanvasEditing:true}:{}),entry:editorCase==='keyboard-enter'?'选择后回车':'双击路径',...(options['source-camera']==='true'?{sourceCameraWithin1CssPx:true,...(options['source-toolbar']==='true'?{sourceToolbarWithin1CssPx:true}:{}),...(options['source-surfaces']==='true'?{sourceSurfaceAndTitleGeometry:true}:{}),trustedFitRestoresSameZoom:true}:{}),sourceAnchorCount:true,...(['initial','tab','keyboard-enter','cancel','undo-point'].includes(editorCase)?{originalGeometryPreserved:true,...(editorCase==='undo-point'?{sharedUndo:true}:{unchangedDoesNotSave:true})}:{oneGestureOneBatch:true,sourceGeometryWithin1CssPx:true,sharedUndoRedo:true}),savedAndReopened:true,scope:'真实React和可信输入，受控HTTP；不代替全部控制点编辑、授权API或完整视觉',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector-retention'){
      const choosePen=async()=>{await page.getByLabel('绘图工具',{exact:true}).click();await page.getByRole('group',{name:'绘图工具选项',exact:true}).getByRole('button',{name:/^钢笔/}).click();await page.locator('[data-native-vector-tool]').waitFor({state:'attached'})}
      await choosePen()
      const expectedPoints=editorCase.endsWith('-single')||editorCase==='single-switch'?1:3
      if(expectedPoints===1){await page.mouse.move(500,450);await page.mouse.down();await page.mouse.move(560,390,{steps:8});await page.mouse.up();assert.equal(await page.locator('[data-native-vector-tool] circle').count(),2)}
      else for(const [x,y] of [[500,450],[700,300],[900,500]])await page.mouse.click(x,y)
      assert.equal(await page.locator('[data-native-vector-tool] rect').count(),expectedPoints)
      if(editorCase==='single-switch'){
        await page.getByRole('button',{name:'选择 (V)',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,0)
        await choosePen();assert.equal(await page.locator('[data-native-vector-tool] rect').count(),0,'a normal tool switch still discards a source single-anchor draft')
        await page.mouse.click(500,450);await page.mouse.click(700,300);await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,1)
      }else if(editorCase.startsWith('denied')){
        let denied=true;expectedVectorDenied=true
        await page.route('**/api/artifacts/fixture/changes*',async route=>{if(denied)await route.fulfill({status:403,json:{error:'当前无法访问此稿件'}});else await route.fallback()})
        await page.locator('.native-loading[role=alert]').filter({hasText:'当前无法访问'}).waitFor()
        assert.equal(receipts.length,0);assert.equal(await page.locator('[data-native-vector-tool]').count(),0)
        const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click();const download=await downloadPromise,recovery=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(Object.values(recovery.vectorDrafts)[0].points.length,expectedPoints)
        denied=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.locator('[data-native-vector-tool]').waitFor({state:'attached'});assert.equal(await page.locator('[data-native-vector-tool] rect').count(),expectedPoints)
        assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'draft');assert.equal(receipts.length,0)
        if(expectedPoints===1){assert.equal(await page.locator('[data-native-vector-tool] circle').count(),2);await page.mouse.click(700,300)}
        await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,1)
      }else if(editorCase.startsWith('permission')||editorCase==='page'){
        fixtureWrite=false;document=applyOperations(document,prepareBatch(document,[{type:'document.patch',patch:{title:'远端权限刷新'}}])).document
        await page.locator('.native-save-status').filter({hasText:'仅查看'}).waitFor()
        if(editorCase==='page'){
          await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('group',{name:'页面菜单选项',exact:true}).getByRole('button',{name:'页面 2',exact:true}).click()
          await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.canvasPageId==='second')
          assert.equal(await page.locator('[data-native-vector-tool] rect').count(),0,'another canvas cannot inherit the original path')
        }else{
          await page.getByRole('button',{name:'选择 (V)',exact:true}).click()
          await page.waitForFunction(()=>!document.querySelector('[data-native-vector-tool]'))
        }
        assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'draft','a blocked tool unmount must retain the dirty pen draft')
        const copy=page.getByRole('button',{name:'下载本地副本',exact:true});await copy.waitFor()
        const downloadPromise=page.waitForEvent('download');await copy.click();const download=await downloadPromise,path=await download.path();const recovery=JSON.parse(await readFile(path,'utf8'))
        assert.equal(Object.values(recovery.vectorDrafts)[0].points.length,expectedPoints)
        fixtureWrite=true;document=applyOperations(document,prepareBatch(document,[{type:'document.patch',patch:{title:'权限恢复'}}])).document
        await page.waitForFunction(()=>!document.querySelector('.native-save-status').textContent.includes('仅查看'))
        if(editorCase==='page'){
          await page.mouse.click(700,500);assert.equal(await page.locator('[data-native-vector-tool] rect').count(),1)
          await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('group',{name:'页面菜单选项',exact:true}).getByRole('button',{name:'页面 1',exact:true}).click()
          await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.canvasPageId==='canvas-page-1')
        }else await choosePen()
        assert.equal(await page.locator('[data-native-vector-tool] rect').count(),expectedPoints)
        if(expectedPoints===1){assert.equal(await page.locator('[data-native-vector-tool] circle').count(),2);await page.mouse.click(700,300)}
        await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Enter')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
        assert.equal(receipts.length,1);assert.equal(Object.values(document.pages[document.canvasPages[0].contentId].nodes).filter(node=>node.path).length,1)
      }else{
        const before=await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}))
        if(editorCase==='space')await page.keyboard.down('Space')
        await page.mouse.move(800,600);await page.mouse.down({button:editorCase==='middle'?'middle':'left'});await page.mouse.move(650,500,{steps:8});await page.mouse.up({button:editorCase==='middle'?'middle':'left'})
        if(editorCase==='space')await page.keyboard.up('Space')
        assert.equal(await page.locator('[data-native-vector-tool] rect').count(),3,'panning must not append a pen anchor')
        const after=await page.locator('.native-stage').evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));assert.notDeepEqual(after,before,'the trusted gesture pans the actual viewport')
        assert.equal(receipts.length,0);assert.equal(document.seq,0)
        await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(receipts.length,1)
      }
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-vector-retention-diagnostic',scenario:editorCase,pointsRetained:editorCase!=='single-switch',oneSharedCommit:true,...(editorCase.startsWith('permission')||editorCase.startsWith('denied')||editorCase==='page'?{readonlyUnmountRetained:true,recoveryCopyContainsPoints:true,permissionRestored:true,...(editorCase==='page'?{canvasIsolation:true}:{})}:editorCase==='single-switch'?{sourceSingleAnchorDiscard:true}:{viewportPanned:true,noDraftMutation:true}),scope:'真实React与可信输入，受控HTTP权限回执，不代替真实授权API',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector'){
      const reference=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-vector.json'),'utf8')).runtimeCases.find(sample=>sample.name===editorCase)
      await page.getByLabel('绘图工具',{exact:true}).click();await page.getByRole('group',{name:'绘图工具选项',exact:true}).getByRole('button',{name:/^钢笔/}).click()
      await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.vectorReady==='true')
      await page.locator('[data-native-vector-tool]').waitFor({state:'attached'})
      let previewStyle=null
      for(const[type,a,b,c,d]of reference.steps){
        if(type==='click')await page.mouse.click(a,b)
        else if(type==='drag'){
          await page.mouse.move(a,b);await page.mouse.down();await page.mouse.move(c,d,{steps:8});await page.mouse.up()
          if(editorCase==='middle-handle'){
            previewStyle=await page.locator('[data-native-vector-tool] [data-part=draft]').evaluate(e=>({stroke:getComputedStyle(e).stroke,strokeWidth:getComputedStyle(e).strokeWidth,nearby:[...e.parentElement.querySelectorAll('rect,circle,line')].map(c=>({tag:c.tagName,r:c.getAttribute('r'),width:c.getAttribute('width'),fill:getComputedStyle(c).fill,stroke:getComputedStyle(c).stroke,strokeWidth:getComputedStyle(c).strokeWidth}))}))
            const expected=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-vector.json'),'utf8')).previewStyles.find(row=>row.theme===(options['canvas-theme']==='dark'?'dark':'light'))
            assert.equal(previewStyle.stroke,expected.stroke);assert.equal(previewStyle.strokeWidth,expected.strokeWidth);assert.deepEqual(previewStyle.nearby,expected.nearby)
            await page.screenshot({path:join(output,`design-vector-draft-${options['canvas-theme']??'light'}.png`)})
          }
        }
        else if(type==='key'){await page.keyboard.press(a);if(editorCase?.startsWith('draft-')&&a!=='Enter'){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'draft','keyboard commands keep an unfinished pen out of document history');assert.equal(document.seq,0)}}
        else if(type==='keyDown')await page.keyboard.down(a)
        else if(type==='keyUp')await page.keyboard.up(a)
        else if(type==='zoom'){await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:a,exact:true}).click();await page.locator('[data-native-artifact-editor]').focus()}
        else await page.getByRole('button',{name:'选择 (V)',exact:true}).click()
      }
      if(editorCase==='oversize'){
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
        assert.equal(await page.locator('[data-native-vector-tool] [data-part=draft]').count(),0,'the source discards an oversized draft after reporting its limit')
        await page.locator('.native-notice').filter({hasText:'路径过大，无法保留。请画小一些，或分段绘制。'}).waitFor()
        assert.equal(document.seq,0);assert.deepEqual(errors,[])
        return{kind:'isolated-canvas-vector-diagnostic',scenario:editorCase,sourceOversizeDiscarded:true,noDocumentWrites:true,chineseWarning:true,consoleOrPageErrors:errors}
      }
      await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      if(!reference.added.length){
        assert.equal(document.seq,0);assert.deepEqual(document.pageOrder,['page-1','page-2','page-3'])
        await page.getByLabel('绘图工具',{exact:true}).click();await page.getByRole('group',{name:'绘图工具选项',exact:true}).getByRole('button',{name:/^钢笔/}).click();await page.locator('[data-native-vector-tool]').waitFor({state:'attached'})
        await page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').dblclick()
        assert.equal(await page.locator('[contenteditable=true]').count(),0,'drawing over text does not enter the unrelated text editor')
        await page.keyboard.press('Escape');assert.equal(document.seq,0);assert.deepEqual(errors,[])
        return{kind:'isolated-canvas-vector-diagnostic',scenario:editorCase,sourceSinglePointDiscarded:true,textDoubleClickStaysDrawing:true,committedBatches:0,consoleOrPageErrors:errors}
      }
      const bodyId=document.canvasPages?.[0]?.contentId;assert.ok(bodyId,'a completed source path must have a saved native body');const node=Object.values(document.pages[bodyId].nodes).find(node=>node.type==='drawing'),original=structuredClone(node),expected=reference.added[0]
      assert.equal(node.path.d,expected.d);assert.equal(node.path.width,expected.w);assert.equal(node.path.height,expected.h);assert.equal(node.style.stroke,'#8a8378');assert.equal(receipts.length,1,'the entire path and first canvas body save atomically')
      assert.equal(await page.locator('[aria-live="polite"]').filter({hasText:editorCase==='closed'?'已完成闭合路径。':'已完成开放路径。'}).count(),1)
      const history=async kind=>{await page.locator('[data-native-artifact-editor]').focus();await Promise.all([page.waitForResponse(response=>response.url().endsWith('/operations')&&response.request().postDataJSON()?.kind===kind&&response.ok()),page.keyboard.press(kind==='undo'?'ControlOrMeta+z':'ControlOrMeta+Shift+z')]);await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')}
      await history('undo');assert.equal(document.pages[bodyId],undefined);await history('redo');assert.deepEqual(document.pages[bodyId].nodes[node.id],original)
      await page.reload();await ready(1);await page.locator(`[data-page-id="${bodyId}"] [data-node-id="${node.id}"] path`).first().waitFor();assert.deepEqual(document.pages[bodyId].nodes[node.id],original)
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-vector-diagnostic',scenario:editorCase,sourceGeometryExact:true,...(previewStyle?{previewStyle}:{}),atomicPathCreation:true,sharedUndoRedo:true,savedAndReopened:true,scope:'真实 React、原生操作和可信鼠标键盘；HTTP 夹具，不代替完整控制点编辑、视觉或授权 API 验收',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-pen'){
      await page.getByRole('button',{name:'铅笔',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.penReady==='true')
      await page.mouse.move(220,200);await page.mouse.down();await page.mouse.move(250,210,{steps:4});await page.mouse.move(270,190,{steps:4});await page.mouse.move(320,215,{steps:4})
      await page.locator('[data-native-path-preview] path').waitFor();const preview=await page.locator('[data-native-path-preview] path').getAttribute('d');assert.match(preview,/ C/)
      await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      const bodyId=document.canvasPages[0].contentId,node=Object.values(document.pages[bodyId].nodes).find(node=>node.type==='drawing'),target=page.locator(`[data-page-id="${bodyId}"] [data-node-id="${node.id}"]`),original=structuredClone(node)
      assert.ok(node.path);assert.match(node.path.d,/ C/);assert.equal(node.style.stroke,'#8a8378');assert.equal(node.style.strokeWidth,2)
      assert.equal(await target.locator('path').first().getAttribute('d'),node.path.d);assert.equal(await target.locator('path').first().getAttribute('vector-effect'),'non-scaling-stroke')
      assert.ok(await page.evaluate(()=>window.__penRequests>0))
      assert.equal(node.path.d,'M0 45.2 C45.2 60.3 90.5 75.4 135.7 90.5 C165.9 60.3 196 30.2 226.2 0 C301.6 37.7 377 75.4 452.4 113.1')
      await page.getByRole('button',{name:'选择 (V)',exact:true}).click()
      const point=await target.locator('path').first().evaluate(path=>{const p=path.getPointAtLength(40).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}})
      await page.mouse.click(point.x,point.y);await page.locator('.native-selection').waitFor()
      const box=await target.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height-7);assert.equal(await page.locator('.native-selection').count(),0,'empty path box space passes through to the canvas')
      await page.screenshot({path:join(output,'design-canvas-pen.png')})

      const history=async kind=>{await page.locator('[data-native-artifact-editor]').focus();await Promise.all([page.waitForResponse(response=>response.url().endsWith('/operations')&&response.request().postDataJSON()?.kind===kind&&response.ok()),page.keyboard.press(kind==='undo'?'ControlOrMeta+z':'ControlOrMeta+Shift+z')]);await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')}
      await history('undo');assert.equal(document.pages[bodyId].nodes[node.id],undefined);await history('redo');assert.deepEqual(document.pages[bodyId].nodes[node.id],original)
      await page.reload();await ready(1);await target.waitFor();assert.deepEqual(document.pages[bodyId].nodes[node.id],original)
      await page.getByRole('button',{name:'铅笔',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.penReady==='true')
      await page.evaluate(()=>{window.__holdPen=true});const requestsBefore=await page.evaluate(()=>window.__penRequests)
      await page.mouse.move(420,300);await page.mouse.down();await page.mouse.move(500,320,{steps:24});await page.waitForFunction(()=>window.__heldPen.length>0)
      assert.equal(await page.evaluate(()=>window.__penRequests),requestsBefore+1,'pointer events retain one in-flight preview while its real reply is delayed')
      await page.mouse.up();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      await page.evaluate(()=>{window.__holdPen=false;for(const release of window.__heldPen.splice(0))release()})
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      assert.equal(await page.locator('[data-native-path-preview]').count(),0,'a completed gesture ignores a late preview')
      assert.equal(Object.values(document.pages[bodyId].nodes).filter(node=>node.type==='drawing').length,2)
      await history('undo');assert.equal(Object.values(document.pages[bodyId].nodes).filter(node=>node.type==='drawing').length,1)
      await page.getByRole('button',{name:'铅笔',exact:true}).click();await page.locator('[data-native-artifact-editor]').focus()
      const beforeCancel=document.seq;await page.mouse.move(420,340);await page.mouse.down();await page.mouse.move(510,360,{steps:12});await page.keyboard.press('Escape');await page.mouse.up()
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      assert.equal(document.seq,beforeCancel,'Escape cancels the active drawing without a native operation')
      assert.equal(await page.locator('[data-native-path-preview]').count(),0)
      await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:'25%',exact:true}).click();await page.locator('[data-native-artifact-editor]').focus();for(let i=0;i<3;i++)await page.keyboard.press('ControlOrMeta+-')
      const thumbnail=page.locator('[data-artboard-id="page-3"] .native-board-thumbnail path[d]');await thumbnail.waitFor()
      assert.equal(await thumbnail.getAttribute('d'),document.pages['page-3'].nodes['thumbnail-pen'].path.d)
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-pen-diagnostic',sourceCurve:true,workerPreview:true,boundedPreviewRequests:true,latePreviewDiscarded:true,escapeCancelled:true,sourceStroke:true,strokeHitArea:true,sourcePathExact:true,thumbnailPath:true,oneGestureOneUndo:true,savedAndReopened:true,path:node.path,scope:'actual React/Worker and trusted drawing; controlled HTTP fixture, not complete source visual or performance qualification',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-title'){
      await page.getByRole('button',{name:'文本',exact:true}).click();await page.mouse.click(200,240)
      await page.locator('[contenteditable=true]').last().waitFor();await page.keyboard.insertText('画布中文标题');await page.getByRole('button',{name:'完成',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      const bodyId=document.canvasPages[0].contentId,node=Object.values(document.pages[bodyId].nodes).find(node=>node.textSizing==='content'),target=page.locator(`[data-page-id="${bodyId}"] [data-node-id="${node.id}"]`)
      assert.equal(node.style.fontSize,24);assert.equal(node.style.paddingX,14);assert.equal(node.style.paddingY,11)
      const measure=()=>target.evaluate(element=>{const s=getComputedStyle(element);return{width:parseFloat(s.width),height:parseFloat(s.height),fontSize:parseFloat(s.fontSize),lineHeight:parseFloat(s.lineHeight),padding:s.padding,weight:s.fontWeight,color:s.color}})
      const first=await measure();assert.ok(Math.abs(first.width-172)<1);assert.ok(Math.abs(first.height-55.36)<1)
      await page.getByRole('button',{name:'显示属性',exact:true}).click();const size=page.getByLabel('字号',{exact:true});await size.fill('72');await size.press('Tab')
      await page.waitForFunction(id=>parseFloat(getComputedStyle(document.querySelector(`[data-node-id="${id}"]`)).fontSize)===72,node.id)
      const enlarged=await measure();assert.equal(enlarged.padding,'16px 24px');assert.ok(Math.abs(enlarged.lineHeight-79.344)<.01)
      await page.locator('[data-native-artifact-editor]').focus();await Promise.all([page.waitForResponse(response=>response.url().endsWith('/operations')&&response.request().postDataJSON()?.kind==='undo'&&response.ok()),page.keyboard.press('ControlOrMeta+z')]);await page.waitForFunction(id=>parseFloat(getComputedStyle(document.querySelector(`[data-node-id="${id}"]`)).fontSize)===24,node.id)
      await page.getByRole('button',{name:'显示属性',exact:true}).click()

      await target.dblclick();await page.locator('[contenteditable=true]').last().waitFor();await page.locator('[contenteditable=true]').last().click();await page.keyboard.press('ControlOrMeta+a');await page.keyboard.insertText('中文标题'.repeat(100));await page.getByRole('button',{name:'完成',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      await page.waitForFunction(id=>document.querySelector(`[data-node-id="${id}"] .native-text-content`)?.textContent?.length===400,node.id);assert.equal(document.pages[bodyId].nodes[node.id].text.length,400);await page.waitForFunction(id=>parseFloat(getComputedStyle(document.querySelector(`[data-node-id="${id}"]`)).width)>1000,node.id);const long=await measure();assert.equal(long.width,2000);assert.ok(Math.abs(long.height-188.8)<1)
      await page.reload();await ready(1);await target.waitFor();assert.deepEqual(await measure(),long)
      let paddingBeforeReload,paddingAfterReload,mixedPaddingPlaceholder,customPaddingAtLargeSize
      if(options['title-padding']==='true'){
        await target.click();await page.getByRole('button',{name:'显示属性',exact:true}).click();const uniformPadding=Number(options['custom-padding']??30),padding=page.getByLabel('内边距',{exact:true});mixedPaddingPlaceholder=await padding.getAttribute('placeholder');await padding.fill(String(uniformPadding));await padding.press('Tab')
        await page.waitForFunction(({id,padding})=>getComputedStyle(document.querySelector(`[data-node-id="${id}"]`)).padding===`${padding}px`,{id:node.id,padding:uniformPadding});paddingBeforeReload=await measure()
        await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');await page.reload();await ready(1);await target.waitFor();paddingAfterReload=await measure();assert.deepEqual(paddingAfterReload,paddingBeforeReload);assert.equal(mixedPaddingPlaceholder,'混合')
        if(options['custom-padding']){await target.click();await page.getByRole('button',{name:'显示属性',exact:true}).click();const size=page.getByLabel('字号',{exact:true});await size.fill('72');await size.press('Tab');await page.waitForFunction(id=>parseFloat(getComputedStyle(document.querySelector(`[data-node-id="${id}"]`)).fontSize)===72,node.id);customPaddingAtLargeSize=await measure();assert.equal(customPaddingAtLargeSize.padding,`${uniformPadding}px`);await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');await page.reload();await ready(1);await target.waitFor();assert.deepEqual(await measure(),customPaddingAtLargeSize)}

      }
      const expectedHtml=await measure()
      const {renderPageHtml,EXPORT_PAGE_CSS}=await import('../src/features/artifacts/native/export/render.ts'),{ExportResources}=await import('../src/features/artifacts/native/export/common.ts')
      const exportedNode={...structuredClone(document.pages[bodyId].nodes[node.id]),x:0,y:0};delete exportedNode.scope
      const exportedPage={...createPage('export-title'),nodes:{[node.id]:exportedNode},nodeOrder:[node.id]},html=await renderPageHtml(exportedPage,new ExportResources(document,{format:'html'})),preview=await browser.newPage()
      let htmlMetrics;try{await preview.setContent(`<style>${EXPORT_PAGE_CSS}</style>${html}`);htmlMetrics=await preview.locator(`[data-node-id="${node.id}"]`).evaluate(e=>({width:parseFloat(getComputedStyle(e).width),height:parseFloat(getComputedStyle(e).height),padding:getComputedStyle(e).padding}));assert.ok(Math.abs(htmlMetrics.width-expectedHtml.width)<1);assert.ok(Math.abs(htmlMetrics.height-expectedHtml.height)<1);assert.equal(htmlMetrics.padding,expectedHtml.padding)}finally{await preview.close()}

      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-title-diagnostic',contentWidth:true,sourceDefaultMetrics:true,fontSizeAdjustsMetrics:true,sharedUndo:true,longTitleWrapAt2000:true,savedAndReopened:true,htmlMetricsPreserved:true,uniformPaddingPersisted:options['title-padding']==='true',paddingBeforeReload,paddingAfterReload,customPaddingAtLargeSize,first,long,htmlMetrics,scope:'actual React/Worker; controlled HTTP fixture, not full visual or real API acceptance',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-import'){
      const contentId=document.canvasPages[0].contentId,node=page.locator(`[data-page-id="${contentId}"] [data-node-id="imported-note"]`)
      await node.waitFor();await page.evaluate(()=>document.fonts.ready)
      const measured=await node.evaluate(element=>{const content=element.querySelector('.native-text-content'),style=getComputedStyle(element);return{height:element.offsetHeight,textHeight:content.scrollHeight,padding:Number.parseFloat(style.paddingTop)+Number.parseFloat(style.paddingBottom)}})
      assert.ok(measured.height>=measured.textHeight+measured.padding-1,'imported background contains actual automatic text wrapping')
      await page.waitForFunction(({id,height})=>window.__geometryLog.some(message=>message.direction==='request'&&message.task?.kind==='elements'&&message.task.pageId===id&&message.task.elements.some(node=>node.id==='imported-note'&&Math.abs(node.height-height-4)<=1)),{id:contentId,height:measured.height})

      const pin=page.getByRole('button',{name:'评论 1：导入便签评论',exact:true})
      await pin.waitFor()
      await page.waitForFunction(({id})=>{const node=document.querySelector(`[data-page-id="${id}"] [data-node-id="imported-note"]`),pin=document.querySelector('.native-comment-pin');if(!node||!pin)return false;const n=node.getBoundingClientRect(),p=pin.getBoundingClientRect();return Math.abs(p.left-n.left-n.width/2)<=1&&Math.abs(p.top-n.top-n.height/2)<=1},{id:contentId})
      assert.equal(receipts.length,0,'merely viewing imported notes must not create edits')
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-import-diagnostic',mode:kind,sample:options['import-case']??'chinese',automaticTextWrapping:true,actualWorkerBounds:true,commentFollowsActualHeight:true,readonlyMeasurementDoesNotWrite:true,measured,consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-contents') {
      assert.equal(kind,'design')
      const saved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      const historyKey=async(kind,key)=>{await Promise.all([page.waitForResponse(response=>response.url().endsWith('/operations')&&response.request().postDataJSON()?.kind===kind&&response.ok()),page.keyboard.press(key)]);await saved()}
      await page.getByRole('button',{name:'便签 (N)',exact:true}).click()
      await page.mouse.click(200,240)
      await page.locator('[contenteditable=true]').last().waitFor()
      await page.keyboard.insertText('独立画布便签')
      await page.getByRole('button',{name:'完成',exact:true}).click();await saved()
      const bodyId=document.canvasPages?.[0].contentId
      assert.ok(bodyId,'blank canvas inserts belong to independent content, not the current board')
      assert.equal(document.pageOrder.includes(bodyId),false)
      const body=document.pages[bodyId],note=Object.values(body.nodes).find(n=>n.type==='note'),noteId=note?.id
      assert.ok(note);assert.equal(note.text,'独立画布便签')
      assert.deepEqual([body.x,body.y,body.width,body.height],[0,0,0,0])
      const free=page.locator(`[data-page-id="${bodyId}"]`)
      assert.equal(await free.getAttribute('data-artboard-id'),null)
      await free.locator(`[data-node-id="${noteId}"]`).waitFor()
      const bounds=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      assert.ok(Math.abs(bounds.x-200)<=1&&Math.abs(bounds.y-240)<=1,`expanding world bounds preserves the clicked camera location: ${JSON.stringify({bounds,note})}`)
      for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
        await page.setViewportSize(viewport);await page.waitForFunction(width=>document.querySelector('.native-stage')?.clientWidth===width,viewport.width)
        const resized=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
        assert.ok(Math.abs(resized.x-bounds.x)<=1&&Math.abs(resized.y-bounds.y)<=1,'source world camera survives narrow-container round trips')
      }

      await page.mouse.dblclick(bounds.x+12,bounds.y+bounds.height/2)
      const textEditor=page.getByRole('textbox',{name:'编辑文本',exact:true})
      await textEditor.waitFor();await textEditor.press('Control+a');await page.keyboard.insertText(Array.from({length:10},()=> '中文便签内容').join('\n'))
      await page.getByRole('button',{name:'完成',exact:true}).click();await saved()
      assert.ok(document.pages[bodyId].nodes[noteId].height>=220,'the sticky background grows with real multiline input')
      const grown=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      await page.mouse.dblclick(grown.x+12,grown.y+grown.height/2)
      await textEditor.waitFor();await textEditor.press('Control+a');await page.keyboard.insertText('独立画布便签')
      await page.getByRole('button',{name:'完成',exact:true}).click();await saved()
      assert.ok(document.pages[bodyId].nodes[noteId].height<=42,'shorter text shrinks a sticky back to its natural height')
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      await page.locator('.native-inspector summary').getByText('高级',{exact:true}).click()
      await page.getByRole('spinbutton',{name:'旋转',exact:true}).fill('90');await page.keyboard.press('Tab');await saved()
      const rotatedBox=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      await page.mouse.dblclick(rotatedBox.x+rotatedBox.width/2,rotatedBox.y+rotatedBox.height/4)
      await textEditor.waitFor();await textEditor.press('Control+a');await page.keyboard.insertText('旋转后中文短文')
      await page.getByRole('button',{name:'完成',exact:true}).click();await saved()
      assert.ok(document.pages[bodyId].nodes[noteId].height<=42,'rotation must not enter the natural text height')
      await page.getByRole('spinbutton',{name:'旋转',exact:true}).fill('0');await page.keyboard.press('Tab');await saved()
      await page.getByRole('button',{name:'关闭属性',exact:true}).click()

      const dragBox=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      await page.mouse.move(dragBox.x+12,dragBox.y+dragBox.height/4);await page.mouse.down();await page.mouse.move(dragBox.x+27,dragBox.y+dragBox.height/4+10,{steps:6});await page.mouse.up();await saved()
      assert.equal(await free.locator(`[data-node-id="${noteId}"]`).evaluate(element=>element.style.height),'auto','a real note drag must restore natural CSS layout')
      const moveStartX=document.pages[bodyId].nodes[noteId].x
      for(const[id,hash]of Object.entries(initialPageHashes))assert.equal(pageHash(document.pages[id]),hash)
      await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('ArrowRight');await saved()
      assert.equal(document.pages[bodyId].nodes[noteId].x,moveStartX+1)
      await historyKey('undo','Control+z');assert.equal(document.pages[bodyId].nodes[noteId].x,moveStartX)
      await historyKey('redo','Control+y');assert.equal(document.pages[bodyId].nodes[noteId].x,moveStartX+1)
      await page.getByRole('button',{name:'铅笔',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.penReady==='true')
      await page.mouse.move(300,240);await page.mouse.down();await page.mouse.move(360,280,{steps:8});await page.mouse.up();await saved()
      assert.ok(Object.values(document.pages[bodyId].nodes).some(n=>n.type==='drawing'))
      assert.equal(document.canvasPages.length,1,'drawing reuses the same independent body')
      await page.getByRole('button',{name:'矩形工具',exact:true}).click()
      const beforeShapes=Object.values(document.pages[bodyId].nodes).filter(n=>n.type==='shape').length
      await page.mouse.move(500,200);await page.mouse.down();await page.mouse.move(550,250,{steps:6});await page.mouse.up();await saved()
      const shapes=Object.values(document.pages[bodyId].nodes).filter(n=>n.type==='shape')
      assert.equal(shapes.length,beforeShapes+1)
      const rectangle=shapes.at(-1),rectangleBox=await free.locator(`[data-node-id="${rectangle.id}"]`).boundingBox()
      assert.ok(Math.abs(rectangleBox.width-50)<=1&&Math.abs(rectangleBox.height-50)<=1,'dragged free shapes follow the pointer geometry')
      assert.equal(rectangle.style.fill,'#b6b0a7');assert.equal(rectangle.style.borderRadius,8)

      await page.getByRole('button',{name:'选择 (V)',exact:true}).click()
      await page.getByRole('button',{name:'评论',exact:true}).click()
      const noteBox=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      await page.mouse.click(noteBox.x+noteBox.width/2,noteBox.y+noteBox.height/2)
      const composer=page.locator('.native-comment-composer')
      await composer.getByRole('textbox',{name:'评论内容',exact:true}).fill('检查独立便签')
      await composer.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('检查独立便签',{exact:true}).waitFor()
      const nodeAnchor=decodeCommentAnchor(commentThreads[0].anchor)
      assert.equal(nodeAnchor.pageId,bodyId);assert.equal(nodeAnchor.nodeId,noteId)
      await page.getByRole('button',{name:'关闭评论',exact:true}).click()
      if(await page.locator('[data-native-artifact-editor]').getAttribute('data-tool')!=='comment')await page.getByRole('button',{name:'评论',exact:true}).click()
      await page.mouse.click(400,240)
      await composer.getByRole('textbox',{name:'评论内容',exact:true}).fill('检查空白画布')
      await composer.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('检查空白画布',{exact:true}).waitFor()
      const worldAnchor=decodeCommentAnchor(commentThreads[1].anchor)
      assert.equal(worldAnchor.pageId,bodyId);assert.equal(worldAnchor.space,'world');assert.ok(worldAnchor.y<0)
      await page.getByRole('button',{name:'关闭评论',exact:true}).click()
      await page.getByRole('button',{name:'选择 (V)',exact:true}).click()
      await page.locator('[data-artboard-id="page-1"] .native-board-label').click()
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      await page.locator('.native-inspector summary').getByText('高级',{exact:true}).click()
      await page.getByRole('button',{name:'删除画板',exact:true}).click();await saved()
      assert.equal(document.pages['page-1'],undefined);assert.ok(document.pages[bodyId].nodes[noteId])
      await page.locator('[data-native-artifact-editor]').focus();await historyKey('undo','Control+z')
      assert.deepEqual(document.pages['page-1'],fixture.document.pages['page-1'])
      for(const[id,hash]of Object.entries(initialPageHashes))if(id!=='page-1')assert.equal(pageHash(document.pages[id]),hash)
      await page.getByRole('button',{name:'关闭属性',exact:true}).click()
      const visibleNote=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      await page.mouse.click(visibleNote.x+12,visibleNote.y+visibleNote.height/2)
      const beforeInactive=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'新建页面',exact:true}).click();await saved()
      const secondCanvas=document.canvasPages[1].id
      await page.waitForFunction(id=>document.querySelector('[data-native-artifact-editor]')?.getAttribute('data-canvas-page-id')===id,secondCanvas)
      const remote={...createNode('note','remote-negative'),x:-5000,y:document.pages[bodyId].nodes[noteId].y,width:240,height:40,text:'远端中文便签',style:{fill:'#fef3a2',fontSize:14}}
      const next=applyOperations(document,prepareBatch(document,[{type:'node.insert',pageId:bodyId,node:remote}])).document
      const remoteObserved=page.waitForRequest(request=>request.url().endsWith('/editor-context')&&request.postDataJSON()?.version===String(next.seq))
      document=next;await remoteObserved
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 1',exact:true}).click()
      await free.waitFor({state:'attached'});await free.locator(`[data-node-id="${noteId}"]`).waitFor();const afterInactive=await free.locator(`[data-node-id="${noteId}"]`).boundingBox()
      assert.ok(Math.abs(afterInactive.x-beforeInactive.x)<=1&&Math.abs(afterInactive.y-beforeInactive.y)<=1,'cached cameras use world coordinates when inactive content changes the origin')
      await page.mouse.click(afterInactive.x+12,afterInactive.y+afterInactive.height/2)
      await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+a')
      const negative=free.locator('[data-node-id="remote-negative"]');await negative.waitFor({state:'attached'})
      const beforePan=await negative.boundingBox()
      await page.getByRole('button',{name:'手型工具 (H)',exact:true}).click()
      for(let i=0;i<2;i++){await page.mouse.move(200,700);await page.mouse.down();await page.mouse.move(900,700,{steps:8});await page.mouse.up()}
      const afterPan=await negative.boundingBox()
      assert.ok(afterPan.x>beforePan.x+1200&&afterPan.x>=0,'negative world objects remain reachable by real hand panning')
      await page.reload();await ready(1);await page.locator(`[data-node-id="${noteId}"]`).waitFor()
      assert.equal(document.pages[bodyId].nodes[noteId].text,'旋转后中文短文')
      await page.screenshot({path:join(output,'design-canvas-contents.png')})
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-contents-diagnostic',mode:kind,independentBody:true,boardOrderUnchanged:true,boardHashesUnchanged:true,cameraStableOnInsert:true,savedAndReopened:true,sharedUndoRedo:true,freeDrawing:true,nodeAndWorldComments:true,boardDeletionKeepsFreeContent:true,chineseNoteAutoHeight:true,rotatedNoteHeight:true,draggedRectangle:true,negativeWorldPan:true,resizeWorldCamera:true,inactiveCanvasWorldCamera:true,undoWaitsForResponse:true,negativePanScreenX:[beforePan.x,afterPan.x],scope:'actual React, Workers and shared operations; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-flow') {
      assert.equal(kind,'design')
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      await page.locator('.native-inspector summary').getByText('高级',{exact:true}).click()
      await page.getByLabel('页面高度模式',{exact:true}).selectOption('flow')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      await page.waitForTimeout(1000)
      assert.ok(document.pages['page-1'].height>=1000&&document.pages['page-1'].height<=1003,'a flow board grows despite boards on another canvas')
      assert.equal(pageHash(document.pages['page-2']),initialPageHashes['page-2'],'flow growth must not move or change boards on another canvas')
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-flow-diagnostic',mode:kind,otherCanvasOverlaps:!!options['flow-overlap'],height:document.pages['page-1'].height,otherCanvasHashUnchanged:true,scope:'actual React, Worker geometry, content measurement and shared operations; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-vector-retention'&&editorCase==='page'){document.canvasPages=[{id:'canvas-page-1',name:'页面 1'},{id:'second',name:'页面 2'}];document.pages['page-3'].canvasPageId='second'}
  if(options.checks==='canvas-pages-cas') {
      assert.equal(kind,'design')
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel('页面“页面 2”操作',{exact:true}).click();await page.getByRole('button',{name:'重命名页面',exact:true}).click()
      const rename=page.getByRole('dialog',{name:'重命名页面',exact:true}),input=rename.getByLabel('页面名称',{exact:true})
      await input.fill('本地页面名')
      document=applyOperations(document,prepareBatch(document,renameCanvasPage(document,'canvas-second','远端页面名'))).document
      await page.waitForRequest(request=>request.method()==='PUT'&&request.url().includes('/editor-context')&&request.postDataJSON()?.version===String(document.seq))
      await rename.getByRole('button',{name:'重命名',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='conflict',null,{timeout:5000})
      assert.equal(document.canvasPages[1].name,'远端页面名');assert.equal(await input.inputValue(),'本地页面名');assert.equal(await input.getAttribute('readonly'),'');assert.match(await rename.getByRole('alert').innerText(),/名称已有新修改/);await input.press('Enter');assert.equal(await rename.isVisible(),true)
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-pages-cas-diagnostic',readonlyConflictKeepsDialogAndDraft:true,remoteNamePreserved:true,localDraftRetained:true,conflictShown:true,scope:'actual React and shared CAS; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='canvas-pages') {
      assert.equal(kind,'design')
      const canvasStates=[]
      const captureCanvasState=async name=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(output,`design-${name}.png`)});canvasStates.push({name,boards:await page.locator('[data-artboard-id]').evaluateAll(es=>es.map(e=>({id:e.dataset.artboardId,rect:e.getBoundingClientRect().toJSON()}))),controls:await page.locator('dialog,input,[popover]:popover-open').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>{const s=getComputedStyle(e);return{label:e.getAttribute('aria-label'),role:e.tagName,rect:e.getBoundingClientRect().toJSON(),fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,padding:s.padding,background:s.background,border:s.border,shadow:s.boxShadow}}))});await writeFile(join(output,'canvas-page-states.json'),JSON.stringify({scope:'matched canvas-page interaction diagnostics; visual qualification pending',states:canvasStates},null,2)+'\n')}
      const firstZoom=await page.getByLabel('画布缩放',{exact:true}).innerText()
      const saved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'新建页面',exact:true}).click();await saved()
      assert.equal(document.canvasPages.length,2);const added=document.canvasPages[1].id
      await page.waitForFunction(id=>document.querySelector('[data-native-artifact-editor]')?.getAttribute('data-canvas-page-id')===id,added)
      const board=document.pageOrder.find(id=>!initialPageHashes[id]);assert.ok(board);assert.equal(document.pages[board].canvasPageId,added)
      await page.locator(`[data-artboard-id="${board}"]`).waitFor()
      assert.equal(await page.locator('.native-page-shell').count(),1,'new canvases have one blank artboard and do not leak the other canvas boards')
      assert.deepEqual([document.pages[board].width,document.pages[board].height],[800,600])
      const boardRect=await page.locator(`[data-artboard-id="${board}"]`).boundingBox()
      for(const [key,value]of Object.entries({x:188.75,y:155.125,width:1062.5,height:796.875}))assert.ok(Math.abs(boardRect[key]-value)<=1,`new canvas ${key} matches pinned source geometry`)

      const secondZoom=await page.getByLabel('画布缩放',{exact:true}).innerText()
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 1',exact:true}).click();await ready(1)
      assert.equal(await page.getByLabel('画布缩放',{exact:true}).innerText(),firstZoom,'returning to a canvas restores its camera')
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 2',exact:true}).click();await page.locator(`[data-artboard-id="${board}"]`).waitFor()
      assert.equal(await page.getByLabel('画布缩放',{exact:true}).innerText(),secondZoom)

      await page.getByLabel('页面菜单',{exact:true}).press('Enter')
      await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-pressed')==='true'&&document.activeElement.textContent.trim()==='页面 2',null,{timeout:5000})
      await page.keyboard.press('Escape')
      await page.getByLabel('页面菜单',{exact:true}).click();await captureCanvasState('two-pages');await page.getByLabel('页面菜单',{exact:true}).press('Home');await page.keyboard.press('ArrowDown')
      assert.equal(await page.evaluate(()=>document.activeElement?.textContent?.trim()),'页面 2','arrow navigation must skip actions in closed nested popovers')
      await page.keyboard.press('Escape')
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel('页面“页面 2”操作',{exact:true}).click();await captureCanvasState('page-actions');await page.getByRole('button',{name:'重命名页面',exact:true}).click()
      const rename=page.getByRole('dialog',{name:'重命名页面',exact:true});await rename.waitFor();assert.equal(await rename.getByLabel('页面名称',{exact:true}).evaluate(e=>document.activeElement===e&&e.selectionStart===0&&e.selectionEnd===e.value.length),true,'rename opens with the entire current name selected');await captureCanvasState('page-rename');const ime=await page.context().newCDPSession(page);await ime.send('Input.imeSetComposition',{text:'中文',selectionStart:0,selectionEnd:2});await page.keyboard.press('Escape');assert.equal(await rename.isVisible(),true,'Escape during browser composition must preserve the rename dialog');await ime.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});await ime.detach();await rename.getByLabel('页面名称',{exact:true}).fill('流程图');await rename.getByLabel('页面名称',{exact:true}).dispatchEvent('keydown',{key:'Enter',keyCode:229,isComposing:true});assert.equal(await rename.isVisible(),true);await rename.getByLabel('页面名称',{exact:true}).dispatchEvent('keydown',{key:'Enter',keyCode:13,repeat:true});assert.equal(await rename.isVisible(),true);await rename.getByLabel('页面名称',{exact:true}).press('Enter');await saved()
      assert.equal(document.canvasPages[1].name,'流程图')
      const unchangedSeq=document.seq,unchangedReceipts=receipts.length
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel('页面“流程图”操作',{exact:true}).click();await page.getByRole('button',{name:'重命名页面',exact:true}).click();await page.getByLabel('页面名称',{exact:true}).press('Enter');await page.getByRole('dialog',{name:'重命名页面',exact:true}).waitFor({state:'detached'})
      assert.equal(document.seq,unchangedSeq,'confirming the same name must not save or add an undo step');assert.equal(receipts.length,unchangedReceipts)
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel('页面“流程图”操作',{exact:true}).click();await page.getByRole('button',{name:'重命名页面',exact:true}).click()
      await page.getByLabel('页面名称',{exact:true}).press('Escape');await page.getByRole('dialog',{name:'重命名页面',exact:true}).waitFor({state:'detached'})
      assert.equal(await page.locator('[data-fixture-workspace]').isVisible(),true,'Escape must close the dialog without closing the surrounding Design workspace')
      await page.reload({waitUntil:'domcontentloaded'});await ready(1)
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'流程图',exact:true}).click()
      await page.locator(`[data-artboard-id="${board}"]`).waitFor();assert.equal(await page.locator('[data-artboard-id="page-1"]').count(),0)
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel('页面“流程图”操作',{exact:true}).click();await page.getByRole('button',{name:'删除页面',exact:true}).click()
      const remove=page.getByRole('alertdialog',{name:'删除页面“流程图”？',exact:true});await remove.waitFor();assert.equal(await remove.getByRole('button',{name:'取消',exact:true}).evaluate(e=>document.activeElement===e),true);await captureCanvasState('page-delete');assert.match(await remove.innerText(),/1 个画板/);await remove.getByRole('button',{name:'删除页面',exact:true}).click();await saved()
      assert.equal(document.pages[board],undefined);assert.equal(document.canvasPages.length,1)
      await remove.waitFor({state:'detached'})
      await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='页面菜单',null,{timeout:5000})
      const undone=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/operations')&&response.request().postDataJSON()?.kind==='undo'&&response.status()===200)
      await page.keyboard.press('Control+z');await undone;await saved()
      assert.ok(document.pages[board]);assert.equal(document.canvasPages.length,2)
      for(const [id,hash]of Object.entries(initialPageHashes))assert.equal(pageHash(document.pages[id]),hash)
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'流程图',exact:true}).click()
      await page.setViewportSize({width:390,height:844})
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel('页面“流程图”操作',{exact:true}).click();await page.getByRole('button',{name:'重命名页面',exact:true}).click()
      const longName='这是用于检查窄容器的中文页面名称'.repeat(5)
      await page.getByLabel('页面名称',{exact:true}).fill(longName);await page.getByRole('button',{name:'重命名',exact:true}).click();await saved()
      const compactMenu=await page.getByLabel('页面菜单',{exact:true}).boundingBox()
      assert.ok(compactMenu&&Math.abs(compactMenu.width-60)<=1,'two-page picker uses the source compact icon and count in a narrow container')
      await page.getByLabel('页面菜单',{exact:true}).click();await page.getByLabel(`页面“${longName}”操作`,{exact:true}).click();await page.getByRole('button',{name:'重命名页面',exact:true}).click()
      const compactDialog=page.getByRole('dialog',{name:'重命名页面',exact:true}),compactRect=await compactDialog.boundingBox()
      assert.ok(compactRect&&compactRect.x>=0&&compactRect.x+compactRect.width<=390)
      await captureCanvasState('page-rename-narrow');await compactDialog.getByRole('button',{name:'取消',exact:true}).click()
      assert.deepEqual(errors,[]);assert.equal(await page.locator('.native-notice').count(),0)
      return{kind:'isolated-canvas-pages-diagnostic',mode:kind,theme:options['canvas-theme']??'light',sourceNewBoardGeometryWithin1px:true,pageCamerasRestored:true,keyboardOpensOnCurrentPage:true,hiddenItemsSkipped:true,dialogFocusAndSelection:true,unchangedNameDoesNotSave:true,compositionEnterGuard:'controlled DOM events; actual OS input method remains unverified',protocolCompositionEscapeGuard:true,escapeKeepsWorkspace:true,deleteCancelInitiallyFocused:true,narrowLongNameAndDialog:true,independentCanvasPages:true,newCanvasHasSourceSizedBlankBoard:true,otherCanvasesHidden:true,boardMembershipSaved:true,renameAndReopen:true,deleteAndSharedUndo:true,unchangedBoards:Object.keys(initialPageHashes).length,scope:'actual React, Workers and reducer; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='menu-resize') {
      await page.setViewportSize({width:900,height:1000});await page.getByLabel('画布缩放',{exact:true}).click()
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100)
      const popup=page.getByRole('group',{name:'画布缩放选项',exact:true}),rect=await popup.boundingBox()
      assert.ok(rect&&rect.x>=0&&rect.x+rect.width<=390,'an open menu must follow the resized editor')
      await page.locator('[data-native-artifact-editor]').evaluate(e=>e.style.width='360px');await page.waitForTimeout(100)
      const resized=await popup.boundingBox();assert.ok(resized&&resized.x>=0&&resized.x+resized.width<=360,'menu must also follow container-only resizing')
      await page.keyboard.press('Escape');await page.locator('[data-native-artifact-editor]').evaluate(e=>e.style.width='')
      await page.setViewportSize({width:900,height:1000});await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByRole('button',{name:'背景',exact:true}).click();await page.getByRole('dialog',{name:'背景颜色',exact:true}).waitFor()
      await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100)
      const color=await page.getByRole('dialog',{name:'背景颜色',exact:true}).boundingBox();assert.ok(color&&color.x>=0&&color.x+color.width<=390,'an open color picker must follow the resized editor')
      return {kind:'isolated-menu-resize-diagnostic',mode:kind,windowAndContainerResize:true,scope:'real native popover and editor container'}
    }
    if(options.checks==='narrow') {
      await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]')?.clientWidth===390);if(kind==='slides')await ready(1);await page.waitForTimeout(150)
      const islands=await page.locator('.native-toolbar-island').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON()))
      assert.ok(Math.abs(islands[0].top-islands[1].top)<=1,'narrow toolbars must stay on the same row')
      if(kind==='slides') {
        assert.equal(await page.locator('.native-page-list').count(),0,'narrow Slides uses the floating page navigator')
        const board=await page.locator('[data-page-id="page-1"]').boundingBox();assert.ok(Math.abs(board.width-374)<=1)
        await page.getByRole('navigation',{name:'页面切换',exact:true}).getByRole('button',{name:'下一页',exact:true}).click();await ready(2)
        await page.getByRole('navigation',{name:'页面切换',exact:true}).getByRole('button',{name:'上一页',exact:true}).click();await ready(1)
        await page.getByRole('navigation',{name:'页面切换',exact:true}).getByRole('button',{name:'显示页面缩略图',exact:true}).focus();await page.keyboard.press('Enter')
        await page.locator('.native-page-list').waitFor()
        assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'隐藏页面缩略图','expanded navigation must retain keyboard focus')
        assert.equal(await page.locator('.native-presenting').count(),0,'the compact thumbnails action must remain in the editor')
        assert.equal(await page.getByRole('navigation',{name:'页面切换',exact:true}).count(),0)
        const expanded=await page.locator('[data-page-id="page-1"]').boundingBox()
        const footer=await page.locator('.native-footer').boundingBox()
        assert.ok(expanded.y+expanded.height<=footer.y,'expanded thumbnails must reserve stage space')
        await page.keyboard.press('Enter')
        await page.getByRole('navigation',{name:'页面切换',exact:true}).waitFor()
        assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'显示页面缩略图','collapsed navigation must retain keyboard focus')
        assert.equal(await page.locator('.native-footer').count(),0)
        document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{background:'#ff0000',section:'验收章节'},unset:['themeBackground']}])).document;history.version=document.seq
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-page-id="page-1"] [data-content-layer]')).backgroundColor==='rgb(255, 0, 0)')
        await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:/^添加页面/}).click()
        await page.getByRole('dialog',{name:'版式',exact:true}).waitFor();await page.getByRole('button',{name:'空白',exact:true}).click()
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
        assert.equal(document.pageOrder.length,51)
        assert.equal(document.pages[document.pageOrder[1]].width,1920,'new layouts retain the current slide dimensions')
        assert.equal(await page.locator(`[data-page-id="${document.pageOrder[1]}"] [data-content-layer]`).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 0, 0)','a new slide must retain an explicitly overridden background with the theme enabled')
        assert.equal(document.pages[document.pageOrder[1]].section,'验收章节')
      }
      await page.getByLabel('插入图形',{exact:true}).click()
      const menu=await page.getByRole('group',{name:'插入图形选项',exact:true}).boundingBox();assert.ok(menu&&menu.x>=0&&menu.x+menu.width<=390,'overflow menus must fit the narrow editor')
      await page.keyboard.press('Escape')
      assert.deepEqual(errors,[])
      return {kind:'isolated-narrow-editor-diagnostic',mode:kind,singleToolbarRow:true,floatingPageNavigation:kind==='slides',scope:'390×844 container and real editor through controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='fonts-lazy'||options.checks==='fonts-readonly'){
      await page.locator('[data-node-id="page-1-heading"]').click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const trigger=page.getByRole('button',{name:'字体',exact:true}),weight=page.getByLabel('字重',{exact:true})
      if(options.checks==='fonts-readonly'){
        await trigger.click();await page.getByRole('combobox',{name:'搜索字体',exact:true}).waitFor();fixtureWrite=false
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'page-1-heading',patch:{style:{opacity:.95}}}])).document
        await page.waitForFunction(()=>document.querySelector('[aria-label="字体"]')?.matches(':disabled'))
        assert.equal(await page.getByRole('combobox',{name:'搜索字体',exact:true}).count(),0,'losing write permission must close the font popup')
        assert.equal(await trigger.isDisabled(),true);await weight.click();assert.equal(await weight.getAttribute('aria-disabled'),'true');assert.equal(await page.locator('.native-font-variants details[open]').count(),0)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-readonly-font-diagnostic',mode:kind,fontDisabled:true,weightMenuDisabled:true,committedBatches:receipts.length,consoleOrPageErrors:errors}
      }
      let release,held=false
      await page.route('**/FontPopover.tsx*',async route=>{held=true;await new Promise(resolve=>{release=resolve});await route.continue()})
      await trigger.click();await page.waitForFunction(()=>document.querySelector('[aria-label="字体"]')?.getAttribute('aria-expanded')==='true')
      for(let attempt=0;attempt<100&&!held;attempt++)await page.waitForTimeout(20)
      assert.ok(held,'the real lazy module request must be held')
      const outside=page.getByRole('button',{name:'属性',exact:true})
      if(editorCase==='escape')await page.keyboard.press('Escape');else await outside.click()
      release();await page.waitForLoadState('networkidle')
      assert.equal(await trigger.getAttribute('aria-expanded'),'false','an outside action must cancel the pending popup session')
      assert.equal(await page.getByRole('combobox',{name:'搜索字体',exact:true}).count(),0)
      assert.equal(await(editorCase==='escape'?trigger:outside).evaluate(e=>document.activeElement===e),true,'late module arrival must not steal focus')
      await trigger.click();const search=page.getByRole('combobox',{name:'搜索字体',exact:true});await search.waitFor();assert.equal(await search.evaluate(e=>document.activeElement===e),true,'cached popup re-entry must focus its search');await search.press('Escape')
      assert.deepEqual(errors,[])
      return{kind:'isolated-font-lazy-cancellation-diagnostic',mode:kind,cancelAction:editorCase,actualModuleHeld:true,pendingSessionCancelled:true,lateModuleDoesNotStealFocus:true,cachedReentryFocus:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='svg-font-module'){
      const target=page.locator('[data-node-id="font-svg"]'),original=pageHash(document)
      await target.getByRole('button',{name:'重试图形',exact:true}).waitFor();const before=svgModuleRequests;assert.ok(before>0)
      let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++})
      svgModuleBlocked=false;await target.getByRole('button',{name:'重试图形',exact:true}).click();await target.locator('img').waitFor({timeout:20000})
      assert.ok(svgModuleRequests>before,'retry must make a new actual module request after a cached import rejection')
      assert.match(decodeURIComponent(await target.locator('img').getAttribute('src')),/@font-face/)
      if(kind==='slides')await page.locator('[data-page-target="page-1"] image[href^="data:image/svg+xml"]').first().waitFor()
      assert.equal(await page.locator('[data-artifact-export-realm]').count(),0);assert.equal(navigations,0);assert.equal(pageHash(document),original);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      let evictionRecovery=null
      if(options['svg-eviction']){
        const originalSource=document.pages['page-1'].nodes['font-svg'].svg
        await page.evaluate(()=>{window.__svgRealmPeak=0;window.__svgRealmWatch=setInterval(()=>{window.__svgRealmPeak=Math.max(window.__svgRealmPeak,document.querySelectorAll('[data-artifact-export-realm]').length)},5)})
        for(let index=0;index<9;index++){
          const svg=originalSource.replace('Hello',`示例 ${index}`)
          document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'font-svg',patch:{svg}}])).document
          await page.waitForFunction(text=>document.querySelector('[data-node-id="font-svg"] img')?.getAttribute('src')?.includes(encodeURIComponent(text)),`示例 ${index}`)
        }
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'font-svg',patch:{hidden:true}}])).document
        await target.waitFor({state:'detached'})
        const beforeRemount=svgModuleRequests
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'font-svg',patch:{svg:originalSource},unset:['hidden']}])).document
        await target.locator('img').waitFor({timeout:20000})
        assert.match(decodeURIComponent(await target.locator('img').getAttribute('src')),/Hello/)
        assert.ok(svgModuleRequests>beforeRemount,'an evicted image must recover in a new instance without repeating a poisoned parent import')
        const peak=await page.evaluate(()=>{clearInterval(window.__svgRealmWatch);return window.__svgRealmPeak});assert.ok(peak<=1,'only one SVG recovery realm may run at a time')
        await page.waitForFunction(()=>document.querySelectorAll('[data-artifact-export-realm]').length===0)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        evictionRecovery={differentSources:9,remountedAfterEviction:true,noSecondRetryNeeded:true,maxRecoveryRealms:peak,remoteFixtureSourceRestored:true}
      }
      return{kind:'isolated-svg-font-module-recovery',mode:kind,actualModule503:true,newModuleRequestOnRetry:true,packedImageRecovered:true,editorNotReloaded:true,realmDisposed:true,sourceAndHistoryUnchanged:true,evictionRecovery,scope:'actual browser ESM cache and real trusted renderer; controlled HTTP outage',consoleOrPageErrors:errors}
    }
    if(options.checks==='svg-font-error'){
      const target=page.locator('[data-node-id="font-svg"]'),original=document.pages['page-1'].nodes['font-svg'].svg
      await target.getByRole('button',{name:'重试图形',exact:true}).waitFor();assert.ok(svgFontFailures>0)
      svgFontsBlocked=false;await target.getByRole('button',{name:'重试图形',exact:true}).click();await target.locator('img').waitFor()
      assert.match(decodeURIComponent(await target.locator('img').getAttribute('src')),/@font-face/)
      assert.equal(document.pages['page-1'].nodes['font-svg'].svg,original);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-svg-font-recovery-diagnostic',mode:kind,actualFontRequestFailed:true,chineseRetry:true,retryLoadedPackedImage:true,sourceAndHistoryUnchanged:true,scope:'actual React and local font fetch; controlled HTTP failure',consoleOrPageErrors:errors}
    }
    if(options.checks==='svg-font-cancel'){
      if(!editorFontRequests.length)await page.waitForRequest(request=>new URL(request.url()).pathname.startsWith('/fonts/editors/'))
      const source='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="150"><rect width="600" height="150" fill="#123456"/></svg>'
      document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'font-svg',patch:{svg:source}}])).document
      await page.waitForFunction(value=>document.querySelector('[data-node-id="font-svg"] img')?.getAttribute('src')===value,`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`)
      svgFontsHeld=false;releaseSvgFonts?.();await page.waitForTimeout(300)
      assert.equal(await page.locator('[data-node-id="font-svg"] img').getAttribute('src'),`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`)
      assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'isolated-svg-font-cancellation-diagnostic',mode:kind,fontFetchActuallyHeld:true,sourceChangedDuringLoad:true,lateImageDoesNotReplaceNewSource:true,scope:'actual React image and shared refresh; controlled HTTP font delay',consoleOrPageErrors:errors}
    }
    if(options.checks==='svg-font'){
      const original=document.pages['page-1'].nodes['font-svg'].svg
      const rendered=page.locator('[data-node-id="font-svg"] img')
      await rendered.waitFor()
      const imageSource=await rendered.getAttribute('src')
      const inherited=page.locator('[data-node-id="inherited-svg"] img');await inherited.waitFor();assert.match(decodeURIComponent(await inherited.getAttribute('src')),/@font-face/,'SVG images must preserve an inherited group font')
      assert.match(decodeURIComponent(imageSource),/@font-face/,'SVG image text must carry its actual registered font; parent CSS cannot style image internals')
      const paint=async target=>target.evaluate(async image=>{
        await image.decode()
        const loaded=await document.fonts.load('700 80px "LingxiLoopEditor Merriweather"','Hello')
        const canvas=document.createElement('canvas');canvas.width=600;canvas.height=150
        const context=canvas.getContext('2d'),bounds=()=>{const pixels=context.getImageData(0,0,600,150).data;let left=600,right=-1,top=150,bottom=-1;for(let y=0;y<150;y++)for(let x=0;x<600;x++)if(pixels[(y*600+x)*4+3]>0){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}return{left,right,top,bottom,width:right-left+1,height:bottom-top+1}}
        context.drawImage(image,0,0,600,150);const actual=bounds()
        context.clearRect(0,0,600,150);context.font='700 80px "LingxiLoopEditor Merriweather"';context.fillText('Hello',16,100)
        return{actual,expected:bounds(),loadedFaces:loaded.filter(face=>face.status==='loaded').length}
      })
      const raster=await paint(rendered)
      assert.ok(raster.loadedFaces>0)
      for(const axis of ['left','right','top','bottom'])assert.ok(Math.abs(raster.actual[axis]-raster.expected[axis])<=1,`SVG image must paint the actual font on ${axis}`)
      const inheritedRasters={}
      for(const id of ['inherited-svg','svg-root-inherit','svg-root-unset']){
        const image=page.locator(`[data-node-id="${id}"] img`);await image.waitFor();inheritedRasters[id]=await paint(image)
        assert.deepEqual(inheritedRasters[id].actual,inheritedRasters[id].expected,`${id} must paint the resolved inherited face`)
      }
      if(kind==='slides'){
        const thumbnails=page.locator('[data-page-target="page-1"] image[href^="data:image/svg+xml"]');await thumbnails.nth(3).waitFor()
        for(const source of await thumbnails.evaluateAll(es=>es.map(e=>e.getAttribute('href')))){const xml=decodeURIComponent(source);assert.match(xml,/@font-face/,'thumbnails must carry the same actual font');assert.doesNotMatch(xml,/font-family="(?:inherit|unset)"/,'isolated thumbnail roots must resolve their host font')}

      }
      await page.screenshot({path:join(output,`${kind}-svg-font-canvas.png`)})
      const result=await page.evaluate(async({root,snapshot})=>{
        const{renderPageHtml,EXPORT_PAGE_CSS}=await import(`/@fs${root}/src/features/artifacts/native/export/render.ts`)
        const{ExportResources}=await import(`/@fs${root}/src/features/artifacts/native/export/common.ts`)
        const{awaitPageFonts}=await import(`/@fs${root}/src/features/artifacts/native/export/fonts.ts`)
        const source=snapshot.pages['page-1'],slim={...source,nodeOrder:['font-svg'],nodes:{'font-svg':source.nodes['font-svg']}},html=await renderPageHtml(slim,new ExportResources(snapshot,{format:'html'}))
        const host=document.createElement('div');host.innerHTML=`<style>${EXPORT_PAGE_CSS}</style>${html}`;document.body.append(host)
        try{await awaitPageFonts(host);return{fontFamily:getComputedStyle(host.querySelector('svg text')).fontFamily,htmlPreservesText:host.querySelector('svg text').textContent==='Hello'}}finally{host.remove()}
      },{root,snapshot:document})
      assert.match(result.fontFamily,/LingxiLoopEditor Merriweather/);assert.equal(result.htmlPreservesText,true)
      assert.equal(document.pages['page-1'].nodes['font-svg'].svg,original);assert.deepEqual(errors,[])
      return{kind:'isolated-svg-font-export-diagnostic',mode:kind,...result,sourceUnchanged:true,canvasFontQualified:false,localFontPaintVerified:true,inheritedGroupFontEmbedded:true,inertImageRetained:true,raster,inheritedRasters,thumbnailFontEmbedded:kind==='slides',scope:'actual SVG image font packing, bitmap ink bounds versus a loaded local font, thumbnail and static SVG export; controlled HTTP fixture, not complete visual qualification',consoleOrPageErrors:errors}
    }
    if(options.checks==='font-cas'){
      await page.locator('[data-node-id="page-1-heading"]').click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByRole('button',{name:'字体',exact:true}).click()
      const search=page.getByRole('combobox',{name:'搜索字体',exact:true});await search.fill('拉托')
      const versionKey='node/page-1/page-1-heading/field/style.fontFamily',capturedVersion=document.versions[versionKey]??0
      document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'page-1-heading',patch:{style:{fontFamily:'Tahoma'}}}])).document
      const remoteSeq=String(document.seq)
      await page.waitForRequest(request=>request.method()==='PUT'&&request.url().includes('/editor-context')&&request.postDataJSON()?.version===remoteSeq)
      assert.equal(await search.inputValue(),'拉托','a remote font update must not replace the active search')
      await search.press('ArrowDown');await search.press('Enter')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='conflict')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontFamily,'Tahoma');assert.equal(receipts.length,0)
      const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click()
      const path=join(workspace,`${kind}-font-recovery.json`);await(await pending).saveAs(path);const recovery=JSON.parse(await readFile(path,'utf8'))
      assert.ok(recovery.operations.some(batch=>batch.operations.some(op=>op.patch?.style?.fontFamily==='Lato')&&batch.expectedVersions[versionKey]===capturedVersion))
      assert.deepEqual(errors,[])
      return{kind:'isolated-font-cas-diagnostic',mode:kind,searchSurvivesRemoteChange:true,remoteFamilyPreserved:true,localSelectionRecoverable:true,saveState:'conflict',scope:'actual React and shared CAS reducer; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='fonts') {
      const fontRequests=editorFontRequests
      const target=page.locator('[data-node-id="page-1-heading"]')
      await target.click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const trigger=page.getByRole('button',{name:'字体',exact:true})
      assert.equal(await trigger.count(),1,'the font property must offer the reference searchable picker')
      const fontGeometry=await trigger.boundingBox()
      assert.ok(Math.abs(fontGeometry.width-187)<=1,'the font control must reserve the reference trailing reset space')
      assert.equal(fontRequests.length,0,'unused font files must not load with the editor')
      await page.getByLabel('字重',{exact:true}).click();await page.screenshot({path:join(output,`${kind}-font-weight.png`)});await page.keyboard.press('Escape')
      await trigger.click();const search=page.getByRole('combobox',{name:'搜索字体',exact:true});await search.waitFor();assert.equal(await search.evaluate(e=>document.activeElement===e),true)
      const fontPopupGeometry=await page.locator('.native-font-popup').boundingBox();assert.ok(Math.abs(fontPopupGeometry.height-350)<=1,'nested field styles must not shrink the source font search input')
      const searchGeometry=await search.boundingBox();assert.ok(Math.abs(searchGeometry.x-1253)<=1&&Math.abs(searchGeometry.y-252)<=1&&Math.abs(searchGeometry.width-126)<=1&&Math.abs(searchGeometry.height-28)<=1,'the inner font search must match the source field geometry')
      await page.screenshot({path:join(output,`${kind}-font-picker.png`)})
      const fontOptions=page.locator('.native-font-popup').getByRole('option')
      assert.equal(await fontOptions.count(),29)
      assert.ok((await fontOptions.allTextContents()).every(label=>!/[A-Za-z]/.test(label)))
      await trigger.click();assert.equal(await trigger.getAttribute('aria-expanded'),'false','clicking the font trigger again must close the popup')
      await trigger.click();await search.waitFor();assert.equal(await search.evaluate(e=>document.activeElement===e),true)
      await search.fill('无匹配字体');await page.screenshot({path:join(output,`${kind}-font-empty.png`)})
      await search.fill('梅里');assert.equal(await fontOptions.count(),1)
      await search.press('ArrowDown');await search.press('Enter')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontFamily,'Merriweather')
      await page.waitForFunction(()=>document.fonts.check('700 48px "LingxiLoopEditor Merriweather"','LingxiLoop 1'))
      assert.ok(fontRequests.length>0);assert.match(await target.evaluate(e=>getComputedStyle(e).fontFamily),/LingxiLoopEditor Merriweather/)
      await page.getByLabel('字重',{exact:true}).click();assert.equal(await page.locator('.native-font-variants .native-menu-popup button').count(),14)
      await page.getByRole('button',{name:'粗体斜体',exact:true}).click()
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-node-id="page-1-heading"]')).fontStyle==='italic')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontStyle,'italic')
      await trigger.click();await search.fill('贝巴斯');await search.press('ArrowDown');await search.press('Enter')
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-node-id="page-1-heading"]')).fontFamily.includes('Bebas Neue'))
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontWeight,400);assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontStyle,'normal')
      await page.getByLabel('字重',{exact:true}).click();assert.equal(await page.locator('.native-font-variants .native-menu-popup button').count(),1);await page.keyboard.press('Escape')
      await page.mouse.click(1000,700);await page.keyboard.press('Control+z')
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-node-id="page-1-heading"]')).fontFamily.includes('Merriweather'))
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontWeight,700);assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontStyle,'italic')
      await page.reload();await ready(1);assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontFamily,'Merriweather')
      await target.click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await trigger.click();await search.waitFor();await search.fill('无匹配字体');assert.equal(await page.getByText('未找到匹配字体',{exact:true}).count(),1)
      await search.press('Escape');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='字体')
      const packed=await page.evaluate(async({root,snapshot})=>{
        const {offlineDocumentFonts,awaitPageFonts}=await import(`/@fs${root}/src/features/artifacts/native/export/fonts.ts`)
        const {ExportResources}=await import(`/@fs${root}/src/features/artifacts/native/export/common.ts`)
        const {renderPageHtml,EXPORT_PAGE_CSS}=await import(`/@fs${root}/src/features/artifacts/native/export/render.ts`)
        const resources=new ExportResources(snapshot,{format:'html'}),source=snapshot.pages['page-1'],heading=source.nodes['page-1-heading']
        const cjk={...heading,id:'cjk-font',y:200,text:'中文标题',richText:undefined,style:{...heading.style,fontWeight:600}}
        const slim={...source,nodeOrder:['page-1-heading','cjk-font'],nodes:{'page-1-heading':heading,'cjk-font':cjk}},html=await renderPageHtml(slim,resources)
        const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0';host.innerHTML=`<style>${EXPORT_PAGE_CSS}</style>${html}`;document.body.append(host)
        try{await awaitPageFonts(host)}finally{host.remove()}
        return{css:await offlineDocumentFonts(resources),html,pageCss:EXPORT_PAGE_CSS}
      },{root,snapshot:document})
      assert.match(packed.css,/data:font\/woff2;base64,/);assert.doesNotMatch(packed.css,/url\(["']?(?:https?:|\/fonts)/)
      const offline=await browser.newPage(),externalFontRequests=[]
      let loadedFaces
      try{
        offline.on('request',request=>{if(/^https?:/.test(request.url()))externalFontRequests.push(request.url())})
        await offline.setContent(`<style>${packed.css}${packed.pageCss}</style>${packed.html}`)
        loadedFaces=await offline.evaluate(async()=>{const faces=await document.fonts.load('italic 700 48px "LingxiLoopEditor Merriweather"','LingxiLoop 1');return faces.filter(face=>face.status==='loaded').length})
        assert.ok(loadedFaces>0);assert.deepEqual(externalFontRequests,[])
        await offline.screenshot({path:join(output,`${kind}-font-html.png`)})
      }finally{await offline.close()}
      await page.setViewportSize({width:390,height:844});await trigger.click();await search.waitFor()
      const popupBounds=await page.locator('.native-font-popup').boundingBox(),editorBounds=await page.locator('[data-native-artifact-editor]').boundingBox()
      assert.ok(popupBounds.x>=editorBounds.x&&popupBounds.x+popupBounds.width<=editorBounds.x+editorBounds.width&&popupBounds.y+popupBounds.height<=844,'the font popup must fit the narrow editor')
      await page.screenshot({path:join(output,`${kind}-font-narrow.png`)});await search.press('Escape')
      assert.deepEqual(errors,[])
      return{kind:'isolated-font-picker-diagnostic',mode:kind,chineseChoices:29,searchAndKeyboardSelection:true,fontGeometry,fontPopupGeometry,searchGeometry,fontRequestsBeforeOpening:0,selectedFamily:'Merriweather',supportedFacesOnly:true,familyFaceFallbackAndSharedUndo:true,fontAssets:[...new Set(fontRequests)],savedAndReopened:true,emptySearchChinese:true,escapeRestoresFocus:true,narrowPopupBounds:popupBounds,offlineFontPacking:{loadedFaces,externalRequests:externalFontRequests.length,localFileOpening:false},chineseOnlyFallbackReady:true,scope:'actual React, self-hosted font loading and shared reducer; controlled HTTP fixture; packed HTML font loading is not file-URL opening',consoleOrPageErrors:errors}
    }
    if(options.checks==='table-stability') {
      const table=page.locator('[data-node-id="stable-table"] table'),cell=table.locator('td').first()
      await cell.dblclick();await cell.fill('甲草稿')
      const remoteSeq=String(document.seq+1)
      document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'stable-table',patch:{tableHeader:true}}])).document
      await page.waitForRequest(request=>request.method()==='PUT'&&request.url().includes('/editor-context')&&request.postDataJSON()?.version===remoteSeq)
      assert.equal(await table.locator('td,th').first().textContent(),'甲草稿','remote header change must retain the active unsubmitted draft')
      assert.equal(await table.locator('td,th').first().evaluate(e=>document.activeElement===e),true,'remote header change must retain editing focus')
      await page.keyboard.press('End');await page.keyboard.insertText('续写');await page.keyboard.press('Control+s')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      assert.equal(document.pages['page-1'].nodes['stable-table'].cells[0][0],'甲草稿续写')
      assert.equal(document.pages['page-1'].nodes['stable-table'].tableHeader,true)
      const assertRows=async locator=>{
        const rects=await locator.locator('td,th').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y}}))
        assert.ok(rects[3].y>rects[2].y,'a short row must not pull the next row into its remaining grid track')
        assert.ok(Math.abs(rects[3].y-rects[4].y)<.1,'the final row must keep both cells together')
        return rects
      }
      const nativeRows=await assertRows(table)
      const {renderPageHtml,EXPORT_PAGE_CSS}=await import('../src/features/artifacts/native/export/render.ts')
      const {ExportResources}=await import('../src/features/artifacts/native/export/common.ts')
      const source=document.pages['page-1'],slim={...source,nodeOrder:['stable-table'],nodes:{'stable-table':source.nodes['stable-table']}}
      const html=await renderPageHtml(slim,new ExportResources(document,{format:'html'})),exportPage=await browser.newPage()
      let exportedRows
      try{await exportPage.setContent(`<style>${EXPORT_PAGE_CSS}</style>${html}`);exportedRows=await assertRows(exportPage.locator('table'))}finally{await exportPage.close()}
      assert.deepEqual(errors,[])
      return{kind:'isolated-table-stability-diagnostic',mode:kind,remoteHeaderPreservesDraftAndFocus:true,continuedDraftSaved:true,raggedRows:{native:nativeRows,html:exportedRows},scope:'actual React editing, shared reducer and HTML export; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='table') {
      assert.equal(kind,'slides')
      const waitSaved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      const before=new Set(document.pages['page-1'].nodeOrder)
      await page.getByLabel('插入表格',{exact:true}).click()
      await page.waitForFunction(ids=>[...document.querySelectorAll('[data-page-id="page-1"] [data-node-type=table]')].some(e=>!ids.includes(e.dataset.nodeId)),[...before],{timeout:2000})
      await waitSaved()
      const tableNode=Object.values(document.pages['page-1'].nodes).find(node=>!before.has(node.id)&&node.type==='table');assert.ok(tableNode)
      assert.equal(tableNode.tableHeader,true);assert.deepEqual(tableNode.cells,[['列标题','列标题','列标题'],['','',''],['','','']])
      const table=page.locator(`[data-node-id="${tableNode.id}"] table`)
      assert.equal(await table.locator('[role=columnheader]').count(),3);assert.equal(await table.locator('[role=cell]').count(),6)
      const geometry=await page.locator(`[data-node-id="${tableNode.id}"]`).evaluate(e=>{const r=e.getBoundingClientRect(),paper=e.closest('[data-page-id]').getBoundingClientRect(),scale=paper.width/1920;return {x:(r.x-paper.x)/scale,y:(r.y-paper.y)/scale,width:r.width/scale,height:r.height/scale}})
      assert.ok(Math.abs(geometry.x-128)<.1&&Math.abs(geometry.width-900)<.1&&Math.abs(geometry.y+geometry.height/2-540)<.1)
      const appearance=await table.evaluate(e=>{const cell=e.querySelector('[role=columnheader]'),s=getComputedStyle(cell);return {display:getComputedStyle(e).display,fontWeight:s.fontWeight,fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,background:s.backgroundColor,border:getComputedStyle(e).borderTopWidth}})
      assert.deepEqual(appearance,{display:'grid',fontWeight:'600',fontSize:'32px',lineHeight:'44.8px',padding:'11.2px 19.2px',background:'color(srgb 0.0784314 0.0784314 0.0745098 / 0.08)',border:'2px'})
      await page.mouse.click(1000,700);await page.screenshot({path:join(output,'slides-table-inserted.png')})
      await table.locator('[role=columnheader]').first().dblclick();await table.locator('[role=columnheader]').first().fill('中文标题');await table.locator('[role=columnheader]').first().press('Tab');await waitSaved()
      assert.equal(document.pages['page-1'].nodes[tableNode.id].cells[0][0],'中文标题')
      await page.mouse.click(1000,700);await page.keyboard.press('Control+z');await page.waitForFunction(id=>document.querySelector(`[data-node-id="${id}"] [role=columnheader]`)?.textContent==='列标题',tableNode.id);await waitSaved();assert.equal(document.pages['page-1'].nodes[tableNode.id].cells[0][0],'列标题')
      await page.keyboard.press('Control+y');await page.waitForFunction(id=>document.querySelector(`[data-node-id="${id}"] [role=columnheader]`)?.textContent==='中文标题',tableNode.id);await waitSaved();assert.equal(document.pages['page-1'].nodes[tableNode.id].cells[0][0],'中文标题')
      await page.reload();await ready(1);assert.equal(await table.locator('[role=columnheader]').first().textContent(),'中文标题')
      await table.locator('[role=columnheader]').first().click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const header=page.getByRole('checkbox',{name:'标题行',exact:true});await header.uncheck();await waitSaved();assert.equal(document.pages['page-1'].nodes[tableNode.id].tableHeader,false);assert.equal(await table.locator('[role=columnheader]').count(),0)
      await header.check();await waitSaved();assert.equal(await table.locator('[role=columnheader]').count(),3)
      await page.screenshot({path:join(output,'slides-table-inspector.png')})
      assert.deepEqual(errors,[])
      return {kind:'isolated-table-editor-diagnostic',mode:kind,immediateThreeByThree:true,chineseDefaultHeadings:true,headerSavedAndReopened:true,cellSharedUndoRedo:true,headerToggle:true,geometry,appearance,scope:'actual React editor with controlled HTTP reducer; not real API or full source table parity',consoleOrPageErrors:errors}
    }
    if(options.checks==='shapes') {
      if(kind==='slides') {
        for(const [label,shape]of [['右箭头','arrow-right'],['左箭头','arrow-left'],['上箭头','arrow-up'],['下箭头','arrow-down']]){
          await page.getByLabel('插入图形',{exact:true}).click();await page.getByRole('button',{name:label,exact:true}).click()
          await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
          const node=Object.values(document.pages['page-1'].nodes).find(node=>node.shape===shape);assert.ok(node)
          assert.equal(await page.locator(`[data-node-id="${node.id}"] polygon`).count(),1)
        }
        await page.reload();await ready(1)
        for(const shape of ['arrow-right','arrow-left','arrow-up','arrow-down'])assert.ok(Object.values(document.pages['page-1'].nodes).some(node=>node.shape===shape))
      } else {
        await page.getByLabel('插入图形',{exact:true}).click();await page.getByRole('button',{name:/^箭头/}).click()
        await select(1)
        const box=await page.locator('[data-page-id="page-1"]').boundingBox(),before=Object.keys(document.pages['page-1'].nodes)
        await page.mouse.move(box.x+150,box.y+120);await page.mouse.down();await page.mouse.move(box.x+270,box.y+160,{steps:6});await page.mouse.up()
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
        const node=Object.values(document.pages['page-1'].nodes).find(node=>!before.includes(node.id));assert.equal(node?.type,'line');assert.equal(node.lineEnd,'arrow')
      }
      assert.deepEqual(errors,[])
      return {kind:'isolated-shape-roundtrip-diagnostic',mode:kind,directionalArrows:kind==='slides',drawnArrow:kind==='design',consoleOrPageErrors:errors}
    }
    if(options.checks==='rail') {
      assert.equal(kind,'slides')
      const unselected=await page.locator('[data-page-target="page-2"] .native-page-preview').boundingBox()
      assert.ok(Math.abs(unselected.width-124)<=1&&Math.abs(unselected.height-69.75)<=1,'filmstrip previews must retain the reference 124 × 69.75 size')
      const first=page.locator('[data-page-target="page-1"]');await first.focus();await page.keyboard.press('Shift+ArrowRight');await ready(2)
      await page.keyboard.press('Shift+ArrowRight');await ready(3)
      assert.equal(await page.locator('.native-page-button[aria-pressed=true]').count(),3,'shift navigation must extend from a stable selection anchor')
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-page-target')),'page-3')
      await page.keyboard.press('ArrowRight');await ready(4)
      assert.equal(await page.locator('.native-page-button[aria-pressed=true]').count(),1)
      await page.keyboard.press('End');await ready(50)
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-page-target')),'page-50','virtualized keyboard navigation must focus the newly rendered current page')
      await page.getByRole('button',{name:'网格视图',exact:true}).click()
      await page.locator('.native-page-grid [data-page-target="page-50"]').waitFor({timeout:2000})
      await page.locator('.native-page-grid [data-page-target="page-50"]').focus();await page.keyboard.press('Home')
      await page.locator('.native-page-grid [data-page-target="page-1"]').waitFor({timeout:2000})
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-page-target')),'page-1')
      await page.keyboard.press('End');await page.locator('.native-page-grid [data-page-target="page-50"]').waitFor({timeout:2000})
      assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-page-target')),'page-50')
      assert.deepEqual(errors,[])
      return {kind:'isolated-filmstrip-navigation-diagnostic',mode:kind,referenceThumbnailSize:true,stableRangeSelection:true,virtualizedKeyboardFocus:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='history') {
      if(kind==='design')await select(1)
      await page.locator(`[data-node-id="${historyNode.id}"]`).first().click();await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('ArrowRight')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      assert.equal(revisionReads.length,0,'version history must load on demand')
      await page.getByRole('button',{name:'版本历史',exact:true}).click()
      const history=page.getByRole('dialog',{name:'版本历史',exact:true});await history.getByRole('button',{name:/^版本 0/}).click()
      const writesBeforePreview=contextWrites.length
      await history.getByRole('button',{name:'预览',exact:true}).click()
      const preview=page.getByRole('dialog',{name:'历史版本预览',exact:true});await preview.locator('[data-revision="0"] [data-node-type=image] img').waitFor()
      const node=preview.locator(`[data-node-id="${historyNode.id}"]`).first()
      assert.equal(await node.evaluate(e=>Number.parseFloat(e.style.left)),historyNode.x)
      const liveBeforePreview=pageHash(document),receiptsBeforePreview=receipts.length,undoBeforePreview=historyRequests.length
      await node.click();await preview.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Control+z');await page.keyboard.press('Control+y')
      await preview.locator('[data-native-artifact-editor]').evaluate(element=>{const data=new DataTransfer();data.setData('text/plain','不得写入当前稿件');element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:data}))})
      await preview.getByRole('button',{name:'恢复此版本',exact:true}).focus();await page.keyboard.press('Control+z')
      await preview.getByRole('button',{name:'恢复此版本',exact:true}).evaluate(element=>{const data=new DataTransfer();data.setData('text/plain','不得从预览操作区写入');element.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:data}))})
      await page.waitForTimeout(150)
      assert.equal(pageHash(document),liveBeforePreview,'historical editor and modal actions must not alter the live document')
      assert.equal(historyRequests.length,undoBeforePreview,'historical previews cannot consume live undo/redo')
      assert.equal(receipts.length,receiptsBeforePreview,'historical previews cannot enter the operation chain')
      assert.equal(contextWrites.length,writesBeforePreview,'historical selection must not overwrite the current editor context')
      await preview.getByRole('button',{name:'关闭',exact:true}).click()
      await history.getByRole('button',{name:'恢复此版本',exact:true}).click()
      await page.waitForFunction(({id,x})=>Number.parseFloat(document.querySelector(`[data-native-artifact-editor]:not([data-revision]) [data-node-id="${id}"]`)?.style.left)===x,{id:historyNode.id,x:historyNode.x})
      assert.equal(revisionRestores.length,1);assert.equal(document.pages['page-1'].nodes[historyNode.id].x,historyNode.x)
      assert.deepEqual(errors,[])
      return {kind:'isolated-version-history-diagnostic',mode:kind,onDemand:true,readonlyPreview:true,restoredThroughExistingApi:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='comments') {
      if(kind==='design')await select(1)
      const control=page.getByRole('button',{name:'评论',exact:true}),rect=await control.boundingBox();assert.ok(rect.y<60,'comments belong in the reference top toolbar')
      const before=await page.locator('[data-page-id="page-1"]').boundingBox();await control.click()
      assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-tool'),'comment')
      const shape=Object.values(document.pages['page-1'].nodes).find(node=>node.type==='shape'),box=await page.locator(`[data-node-id="${shape.id}"]`).boundingBox()
      await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
      const form=page.locator('.native-comment-composer');await form.getByRole('textbox',{name:'评论内容',exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'评论内容','a new comment must focus its visible composer');await form.getByRole('textbox',{name:'评论内容',exact:true}).fill('请检查这个图形');holdCommentAck=true;await form.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('button',{name:'正在保存…',exact:true}).waitFor();assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).isEditable(),false,'a pending submission must prevent input that its ACK would clear');await form.getByRole('textbox',{name:'评论内容',exact:true}).focus();await page.keyboard.type('x');assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).inputValue(),'请检查这个图形');holdCommentAck=false;releaseCommentAck?.()
      await page.waitForFunction(()=>document.querySelectorAll('.native-comment-message').length===1)
      assert.equal(commentThreads.length,1);const anchor=decodeCommentAnchor(commentThreads[0].anchor);assert.equal(anchor.nodeId,shape.id);assert.ok(Math.abs(anchor.x-.5)<.01&&Math.abs(anchor.y-.5)<.01)
      assert.deepEqual(await page.locator('[data-page-id="page-1"]').boundingBox(),before,'floating comments must not resize or move the page')
      await form.getByRole('textbox',{name:'评论内容',exact:true}).fill('待发送回复草稿');await page.getByRole('button',{name:'关闭评论',exact:true}).click()
      if(await page.locator('[data-native-artifact-editor]').getAttribute('data-tool')!=='comment')await control.click()
      const paper=await page.locator('[data-page-id="page-1"]').boundingBox();await page.mouse.click(paper.x+paper.width-80,paper.y+50)
      await form.getByRole('textbox',{name:'评论内容',exact:true}).fill('第二条评论');await form.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('第二条评论',{exact:true}).waitFor()
      await page.getByRole('button',{name:/^评论 1：/}).click();await page.getByText('请检查这个图形',{exact:true}).waitFor()
      assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).inputValue(),'待发送回复草稿','switching pins and reopening a thread must retain its unsent reply')
      assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-save-state'),'draft')
      await form.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:/^评论 1：/}).click();await form.getByRole('textbox',{name:'评论内容',exact:true}).waitFor();assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).inputValue(),'','explicit cancel clears only this draft');assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-save-state'),'saved')
      await page.getByRole('button',{name:'编辑评论',exact:true}).click();await form.getByRole('textbox',{name:'评论内容',exact:true}).fill('修改后的评论');await page.getByRole('button',{name:'关闭评论',exact:true}).click();await page.getByRole('button',{name:/^评论 1：/}).click();await page.getByRole('button',{name:'编辑评论',exact:true}).click();assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).inputValue(),'修改后的评论','editing drafts survive closing and reopening');await form.getByRole('button',{name:'保存',exact:true}).click()
      await page.getByText('修改后的评论',{exact:true}).waitFor()
      await form.getByRole('textbox',{name:'评论内容',exact:true}).fill('补充回复');rejectCommentReply=true;expectedCommentError=true;await form.getByRole('button',{name:'发送',exact:true}).click();await page.getByRole('alert').filter({hasText:'尚未确认保存'}).waitFor();assert.equal(commentThreads[0].messages.length,1);await page.getByRole('button',{name:'关闭评论',exact:true}).click();await page.getByRole('button',{name:/^评论 1：/}).click();await form.getByRole('textbox',{name:'评论内容',exact:true}).waitFor();assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).inputValue(),'补充回复','a failed reply remains recoverable after closing');rejectCommentReply=false;await form.getByRole('button',{name:'发送',exact:true}).click();await page.getByText('补充回复',{exact:true}).waitFor();expectedCommentError=false
      holdCommentAck=true;await form.getByRole('textbox',{name:'评论内容',exact:true}).fill('等待确认的回复');await form.getByRole('button',{name:'发送',exact:true}).click();await form.getByRole('button',{name:'正在保存…',exact:true}).waitFor()
      await page.getByRole('button',{name:'关闭评论',exact:true}).click();await page.getByRole('button',{name:/^评论 1：/}).click();await form.getByRole('textbox',{name:'评论内容',exact:true}).waitFor()
      assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).isEditable(),false,'a reopened popover must retain the pending request');assert.equal(await form.getByRole('button',{name:'正在保存…',exact:true}).isDisabled(),true)
      holdCommentAck=false;releaseCommentAck?.();await page.waitForFunction(()=>document.querySelector('.native-comment-composer textarea')?.readOnly===false);assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).inputValue(),'')
      await form.getByRole('textbox',{name:'评论内容',exact:true}).fill('确认后的新草稿');await page.getByRole('button',{name:'关闭评论',exact:true}).click();await page.getByRole('button',{name:/^评论 1：/}).click();await form.getByRole('textbox',{name:'评论内容',exact:true}).waitFor();assert.equal(await form.getByRole('textbox',{name:'评论内容',exact:true}).inputValue(),'确认后的新草稿');await form.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:/^评论 1：/}).click()
      assert.equal(commentThreads[0].messages.length,3)
      await page.getByRole('button',{name:'解决评论',exact:true}).click();await page.getByRole('button',{name:'关闭评论',exact:true}).click()
      await page.getByLabel('评论选项',{exact:true}).click();await page.getByRole('button',{name:/显示全部评论/}).click()
      const all=page.getByRole('complementary',{name:'全部评论',exact:true});await all.getByLabel('评论筛选',{exact:true}).click();await all.getByRole('button',{name:'显示已解决的评论',exact:true}).click()
      const firstThread=all.locator(`[data-comment-id="${commentThreads[0].id}"]`);await firstThread.getByRole('button',{name:'重新打开评论',exact:true}).click();await firstThread.getByRole('button',{name:'发送给智能体',exact:true}).click();await firstThread.getByText('已发送，等待智能体接收',{exact:true}).waitFor()
      for(const id of commentThreads.map(thread=>thread.id)){const card=all.locator(`[data-comment-id="${id}"]`);await card.getByLabel('评论操作',{exact:true}).click();await card.getByRole('button',{name:'删除评论',exact:true}).click();await card.waitFor({state:'detached'})}await all.getByText('暂无评论',{exact:true}).waitFor();assert.equal(commentThreads.length,0)
      assert.deepEqual(errors,[])
      return {kind:'isolated-comment-editor-diagnostic',mode:kind,stableNodeAnchor:true,floatingGeometry:true,createReplyEditResolveReopenSendDelete:true,replyAndEditDraftsRetained:true,explicitCancelClearsDraft:true,pendingSubmitReadOnly:true,pendingReopenReadOnly:true,postAckDraftRetained:true,failedReplyRecoverable:true,pinSwitchKeepsPopover:true,composerAutofocus:true,scope:'controlled same-origin HTTP protocol fixture; real auth/Worker validated separately',consoleOrPageErrors:errors}
    }
    if(options.checks==='export-ink') {
      const ink=await page.evaluate(async root=>{
        const {captureWithBleed}=await import(`/@fs/${root}/src/features/artifacts/native/export/capture.ts`)
        const host=document.createElement('div'),node=document.createElement('div')
        Object.assign(node.style,{width:'240px',height:'1px'})
        node.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;width:100%;height:100%" viewBox="0 0 240 1"><defs><marker id="ink-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><polyline points="0,0 240,0" stroke="black" stroke-width="12" marker-end="url(#ink-arrow)"/></svg>'
        host.append(node);document.body.append(host)
        try {
          const captures=[]
          for(const width of [12,2]) {
            node.querySelector('polyline').setAttribute('stroke-width',String(width))
            const {data,padding}=await captureWithBleed(host,node,width===12?[{strokeWidth:12}]:[{}]),image=new Image();image.src=data;await image.decode()
            const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0)
            const pixels=ctx.getImageData(0,0,image.width,image.height).data;let left=image.width,top=image.height,right=0,bottom=0
            for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>128){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
            captures.push({width:image.width,height:image.height,padding,left,top,right,bottom,inkHeight:bottom-top+1})
          }
          Object.assign(host.style,{color:'rgb(255,0,0)',fontFamily:'monospace',fontSize:'48px'})
          Object.assign(node.style,{width:'80px',height:'64px'});node.textContent='X'
          const {data}=await captureWithBleed(document.body,node,[{}]),image=new Image();image.src=data;await image.decode()
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0)
          const pixels=ctx.getImageData(0,0,image.width,image.height).data;let red=0,black=0
          for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>128){if(pixels[i]>200&&pixels[i+1]<30&&pixels[i+2]<30)red++;else if(pixels[i]<30&&pixels[i+1]<30&&pixels[i+2]<30)black++}
          return {captures,inheritedRedPixels:red,inheritedBlackPixels:black}
        }finally{host.remove()}
      },root)
      assert.ok(ink.captures[0].inkHeight>=100,'arrow ink must exceed the authored one-pixel height')
      for(const capture of ink.captures)assert.ok(capture.left>0&&capture.top>0&&capture.right<capture.width-1&&capture.bottom<capture.height-1,`explicit and default strokes must not touch capture boundaries: ${JSON.stringify(ink)}`)
      assert.ok(ink.inheritedRedPixels>100&&ink.inheritedBlackPixels===0,'captured text must keep its inherited group color')
      return {kind:'isolated-export-ink-diagnostic',mode:kind,...ink,scope:'actual Chromium html-to-image rasterizer; not a full PPTX rendering comparison'}
    }
    if (options.checks === 'parity') {
      const screenshots = []
      for (const [width,height] of [[1920,1200],[1440,1000],[768,1024],[390,844]]) {
        await page.setViewportSize({width,height})
        await page.reload({waitUntil:'domcontentloaded'});await ready(1)
        for (const theme of ['light','dark']) {
          await page.locator('[data-native-artifact-editor]').evaluate((e,theme) => e.setAttribute('data-theme',theme),theme)
          await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200)
          if(width===1440&&theme==='light')await writeFile(join(output,`${kind}-dom.json`),JSON.stringify(await page.locator('[data-page-id] [data-node-id]').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.nodeId,html:e.outerHTML.slice(0,2000),rect:e.getBoundingClientRect().toJSON(),children:[...e.querySelectorAll('h1,.native-text-content,img')].map(c=>({tag:c.tagName,rect:c.getBoundingClientRect().toJSON(),color:getComputedStyle(c).color,display:getComputedStyle(c).display,position:getComputedStyle(c).position,font:getComputedStyle(c).font}))}))),null,2))
          await page.screenshot({path:join(output,`${kind}-${width}-${theme}.png`)})
          screenshots.push({width,height,theme,path:`${kind}-${width}-${theme}.png`,controls:await visualControls(page)})
        }
      }
      const reset=async()=>{await page.setViewportSize({width:1440,height:1000});await page.reload({waitUntil:'domcontentloaded'});await ready(1);await page.locator('[data-native-artifact-editor]').evaluate(e=>e.setAttribute('data-theme','light'));await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120)}
      const capture=async state=>{await page.waitForTimeout(120);const path=`${kind}-${state}.png`;await page.screenshot({path:join(output,path)});screenshots.push({width:1440,height:1000,theme:'light',state,path,controls:await visualControls(page)})}
      const menus=kind==='design'?[['pages','页面菜单'],['drawing','绘图工具'],['shapes','插入图形'],['export','导出格式'],['zoom','画布缩放'],['history','版本历史'],['comment-options','评论选项']]:[['shapes','插入图形'],['export','导出格式'],['zoom','画布缩放'],['layouts','添加页面'],['history','版本历史'],['comment-options','评论选项']]
      for(const [state,label]of menus){await reset();if(['history','layouts'].includes(state))await page.getByRole('button',{name:label,exact:true}).click();else await page.getByLabel(label,{exact:true}).click();if(state==='history')await page.getByRole('dialog',{name:'版本历史',exact:true}).getByRole('button',{name:/^版本/}).waitFor();await capture(state)}
      await reset();await page.getByRole('button',{name:'评论',exact:true}).click();await capture('comments-active');await page.mouse.click(kind==='design'?100:800,kind==='design'?500:600);await page.getByRole('textbox',{name:'评论内容',exact:true}).waitFor();await capture('comment-composer')
      await reset();await page.getByLabel('评论选项',{exact:true}).click();await page.getByRole('button',{name:/显示全部评论/}).click();await page.getByText('暂无评论',{exact:true}).waitFor();await capture('all-comments')
      await reset();await page.getByRole('button',{name:'显示属性',exact:true}).click();await capture('inspector')
      await page.getByRole('button',{name:'背景',exact:true}).click();await page.getByRole('dialog',{name:'背景颜色',exact:true}).waitFor();await capture('color-theme');await page.getByRole('button',{name:'自定义',exact:true}).click();await capture('color-custom')
      await reset();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.locator('[data-node-id=page-1-heading]').click();await capture('heading-inspector')
      assert.equal(await page.getByRole('complementary',{name:'属性面板'}).count(),1)
      assert.deepEqual(errors,[])
      return {kind:'isolated-native-editor-visual-diagnostic',mode:kind,screenshots,scope:'controlled HTTP reducer fixture; screenshots only, not measured source parity, real API or performance acceptance',consoleOrPageErrors:errors}
    }
    if (kind==='design') { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'50%',exact:true}).click() }
    await page.getByRole('button',{name:'显示属性',exact:true}).click()
    if(options.checks==='legacy-colors') {
      const waitSaved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      for(const color of ['#f00','rgb(255,0,0)','rgba(255,0,0,0.25)']) {
        if(color!=='#f00'){document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{background:color}}])).document;history.version=document.seq;await page.waitForFunction(color=>document.querySelector('.native-color-field>button')?.textContent.includes(color.toUpperCase()),color)}
        await page.getByRole('button',{name:'背景',exact:true}).click();await page.getByRole('button',{name:'自定义',exact:true}).click()
        await page.getByLabel('颜色透明度',{exact:true}).press('Home');await waitSaved();assert.equal(document.pages['page-1'].background,'#ff000000')
        await page.getByRole('button',{name:'关闭颜色选择',exact:true}).click()
      }
      await page.locator('[data-node-id="page-1-shape"]').click()
      await page.locator('.native-property-disclosure>summary').filter({hasText:'效果'}).click();await page.locator('.native-inspector-section>summary').filter({hasText:'阴影'}).click()
      await page.getByRole('checkbox',{name:'阴影',exact:true}).check();await waitSaved()
      assert.match(await page.getByRole('button',{name:'阴影颜色',exact:true}).innerText(),/#00000040/i)
      return {kind:'isolated-legacy-color-diagnostic',mode:kind,shortHexAndCssRgbPreserved:true,shadowAlphaPreserved:true,scope:'actual color popover and shared reducer through HTTP fixture'}
    }
    if(options.checks==='color-cas') {
      await page.getByRole('button',{name:'背景',exact:true}).click()
      document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{background:'#0000ff'}}])).document;history.version=document.seq
      await page.waitForFunction(()=>document.querySelector('.native-color-field>button')?.textContent.includes('#0000FF'))
      await page.getByRole('button',{name:'自定义',exact:true}).click()
      await page.getByLabel('颜色透明度',{exact:true}).press('Home');await page.waitForTimeout(200)
      assert.equal(document.pages['page-1'].background,'#0000ff','an open color editor must not overwrite the newer Agent color')
      assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'conflict')
      return {kind:'isolated-color-cas-diagnostic',mode:kind,remoteColorPreserved:true,staleEditConflicts:true,scope:'actual focus changes and shared CAS through controlled HTTP fixture'}
    }
    if(options.checks==='colors') {
      const waitSaved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      await page.getByRole('button',{name:'背景',exact:true}).click()
      const picker=page.getByRole('dialog',{name:'背景颜色',exact:true});await picker.waitFor()
      await picker.getByRole('button',{name:'自定义',exact:true}).click()
      const hex=picker.getByLabel('十六进制颜色',{exact:true});await hex.fill('#12345680')
      assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'draft')
      holdAcknowledgment=true;await hex.press('Control+s')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='pending')
      assert.equal(document.pages['page-1'].background,'#12345680')
      assert.equal(await hex.evaluate(e=>document.activeElement===e),true)
      holdAcknowledgment=false;releaseAcknowledgment?.();releaseAcknowledgment=null;await waitSaved()
      await picker.getByRole('slider',{name:'饱和度和亮度',exact:true}).press('ArrowRight');await waitSaved()
      assert.match(document.pages['page-1'].background,/^#[\da-f]{6}80$/i)
      await picker.getByLabel('关闭颜色选择',{exact:true}).click();assert.equal(await picker.count(),0)
      assert.equal(await page.getByRole('button',{name:'背景',exact:true}).evaluate(e=>document.activeElement===e),true)
      const saved=document.pages['page-1'].background;await page.reload({waitUntil:'domcontentloaded'});await ready(1)
      await page.getByRole('button',{name:'显示属性',exact:true}).click();assert.match(await page.getByRole('button',{name:'背景',exact:true}).innerText(),new RegExp(saved,'i'))
      assert.deepEqual(errors,[])
      return {kind:'isolated-color-editor-diagnostic',mode:kind,alphaPreserved:true,keyboardColorChange:true,focusRestored:true,reloadRetained:true,scope:'actual color popover and shared reducer through HTTP fixture',consoleOrPageErrors:errors}
    }
    if (options.checks === 'interactions') {
      const waitSaved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      const before=artifactPageIds(document).reduce((count,id)=>count+document.pages[id].nodeOrder.length,0),artboardBeforeText=pageHash(document.pages['page-1'])
      await page.getByRole('button',{name:'文本',exact:true}).click()
      const box=await page.locator('[data-page-id="page-1"] .native-page-scaled').boundingBox();assert.ok(box)
      const scale=box.width/document.pages['page-1'].width
      await page.mouse.click(box.x+120*scale,box.y+820*scale)
      const input=page.locator('[data-native-text-editor]');await input.waitFor();await input.fill('原生编辑操作回归');await input.press('Control+s');await waitSaved();await input.press('Escape')
      assert.equal(artifactPageIds(document).reduce((count,id)=>count+document.pages[id].nodeOrder.length,0),before+1)
      const textPage=kind==='design'?document.pages[document.canvasPages[0].contentId]:document.pages['page-1'];assert.ok(Object.values(textPage.nodes).some(n=>n.text==='原生编辑操作回归'));if(kind==='design')assert.equal(pageHash(document.pages['page-1']),artboardBeforeText,'设计文字属于独立画布，不改写原画板')
      const shape=page.locator('[data-node-id="page-1-shape"]');await shape.click()
      await page.locator('.native-property-disclosure>summary').filter({hasText:'效果'}).click()
      await page.locator('.native-inspector-section').filter({has:page.locator('summary',{hasText:'渐变'})}).locator('summary').click()
      await page.getByLabel('填充类型',{exact:true}).selectOption('linear');await waitSaved()
      assert.equal(document.pages['page-1'].nodes['page-1-shape'].style.gradient.type,'linear')
      const y=document.pages['page-1'].nodes['page-1-shape'].y
      await page.getByLabel('版本历史',{exact:true}).click();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape')
      assert.equal(document.pages['page-1'].nodes['page-1-shape'].y,y,'menu navigation must not move an object')
      const image=page.locator('[data-node-id="page-1-image"]');await image.dblclick()
      const handle=page.getByLabel('裁剪右下角',{exact:true});await handle.waitFor();const edge=await handle.boundingBox();assert.ok(edge)
      await page.mouse.move(edge.x+edge.width/2,edge.y+edge.height/2);await page.mouse.down();await page.mouse.move(edge.x-60,edge.y-30,{steps:5});await page.mouse.up()
      await page.getByRole('button',{name:'完成裁剪',exact:true}).click();await waitSaved()
      assert.ok(document.pages['page-1'].nodes['page-1-image'].crop.width<1)
      await image.dblclick();assert.equal(await image.locator('img').evaluate(e=>e.style.width),'100%','reopened crop must show the full source image')
      await page.getByRole('button',{name:'取消裁剪',exact:true}).click()
      if(kind==='design'){await page.getByLabel('播放',{exact:true}).click();await page.getByRole('group',{name:'播放选项',exact:true}).getByRole('button',{name:document.pages['page-2'].title,exact:true}).click();const preview=page.getByRole('region',{name:'画板全窗口预览',exact:true});await preview.waitFor();await preview.getByRole('button',{name:'返回画布',exact:true}).click()}else{
      await page.getByRole('button',{name:'放映',exact:true}).click()
      await page.getByRole('button',{name:'下一页',exact:true}).focus();await page.keyboard.press('ArrowRight')
      await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')==='page-2')
      await page.getByRole('button',{name:'退出放映',exact:true}).focus();await page.keyboard.press('Escape')
      assert.equal(await page.locator('.native-presenting').count(),0)}await select(1)
      let drawing=false,layouts=false,multiplePages=false
      if(kind==='design') {
        await page.getByRole('button',{name:'铅笔',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]')?.dataset.penReady==='true')
        await page.mouse.move(box.x+800*scale,box.y+820*scale);await page.mouse.down();await page.mouse.move(box.x+900*scale,box.y+880*scale,{steps:12});await page.mouse.up();await waitSaved()
        const stroke=Object.values(document.pages[document.canvasPages[0].contentId].nodes).find(n=>n.type==='drawing');assert.ok(stroke);assert.match(stroke.path?.d??'',/^M.+[LC]/);assert.equal(stroke.scope,'canvas');drawing=true
      } else {
        await page.getByRole('button',{name:/^添加页面/}).click();await page.getByRole('button',{name:'标题与正文',exact:true}).click();await waitSaved()
        const created=document.pages[document.pageOrder[1]];assert.equal(created.nodeOrder.length,2);layouts=true
        await page.getByRole('button',{name:'网格视图',exact:true}).click()
        await page.locator('[data-page-target="page-1"]').click();await page.locator('[data-page-target="page-2"]').click({modifiers:['Shift']})
        await page.locator('[data-page-target="page-2"]').hover();await page.getByLabel('页面 3 操作',{exact:true}).click();await page.getByRole('button',{name:'复制页面',exact:true}).click();await waitSaved()
        assert.equal(document.pageOrder.length,54);multiplePages=true
      }
      assert.deepEqual(errors,[])
      await page.screenshot({path:join(output,`${kind}-interactions.png`)})
      return {kind:'isolated-native-editor-interaction-diagnostic',mode:kind,textInsertion:true,gradientSaved:true,menuKeysDoNotNudge:true,cropReopensFullSource:true,presentationKeysFromControls:kind==='slides',designPlayMenuOpensPreview:kind==='design',drawing,layouts,multiplePages,scope:'controlled HTTP shared reducer fixture, not authenticated product integration',consoleOrPageErrors:errors}
    }
    if (options.checks === 'cas') {
      const table = editorCase === 'table', nodeId = table ? 'page-1-table' : 'page-1-heading'
      const target = page.locator(`[data-node-id="${nodeId}"]`)
      const active = table ? target.locator('td').first() : page.locator('[data-native-text-editor]')
      await (table ? active : target).dblclick()
      if (table) await page.waitForFunction(() => window.document.querySelector('[data-node-id="page-1-table"] td')?.getAttribute('contenteditable') === 'true')
      else await active.waitFor()
      await active.focus()
      const before = await active.innerText(), remote = table ? 'REMOTE CELL AUTHOR' : 'REMOTE AUTHOR VERSION'
      const cells = document.pages['page-1'].nodes[nodeId].cells?.map(row => [...row])
      if (cells) cells[0][0] = remote
      const remoteObserved = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/editor-context') && request.postDataJSON()?.version === String(document.seq))
      document = applyOperations(document, prepareBatch(document, [{ type: 'node.patch', pageId: 'page-1', nodeId, patch: table ? { cells } : { text: remote } }])).document
      await remoteObserved
      assert.equal(await active.innerText(), before, 'remote refresh must retain the active draft content')
      // Word selection is a second real double click inside the same editor.
      // It must not replace the original CAS snapshot with the remote revision.
      await active.dblclick(); await page.keyboard.press('End'); await page.keyboard.insertText(' AFTER REENTRY'); await active.press('Control+s')
      await page.waitForFunction(() => window.document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === 'conflict')
      const saved = table ? document.pages['page-1'].nodes[nodeId].cells[0][0] : document.pages['page-1'].nodes[nodeId].text
      assert.equal(saved, remote, 'remote value must survive the rejected stale draft')
      assert.equal(receipts.length, 0, 'no stale mutation may be submitted')
      const pending = page.waitForEvent('download')
      await page.getByRole('button', { name: '下载本地副本', exact: true }).click()
      const recoveryPath = join(workspace, `${kind}-${editorCase}-recovery.json`)
      await (await pending).saveAs(recoveryPath)
      const recovery = JSON.parse(await readFile(recoveryPath, 'utf8'))
      const expected = before + ' AFTER REENTRY'
      const recoverableDraft = recovery.operations.flatMap(batch => batch.operations).some(operation => table ? operation.patch?.cells?.[0]?.[0] === expected : operation.patch?.text === expected)
      assert.ok(recoverableDraft, 'the exact local rejected draft must remain recoverable')
      const versionKey = `node/page-1/${nodeId}/field/${table ? 'cells' : 'text'}`
      assert.equal(recovery.operations.at(-1)?.expectedVersions[versionKey], 0)
      assert.equal(document.versions[versionKey], 1)
      assert.deepEqual(errors, [])
      return { kind: 'isolated-cas-doubleclick-reentry-diagnostic', mode: kind, editor: editorCase, fixtureVersion: fixture.manifest.version,
        scope: 'HTTP fixture and real shared reducer; not real API, database, Agent runtime, or performance acceptance',
        remoteObservedBeforeDoubleClick: true, remotePreserved: saved === remote, saveState: 'conflict', recoverableDraft,
        committedManualBatches: receipts.length, capturedVersion: 0, currentVersion: 1, consoleOrPageErrors: errors }
    }
    if (options.checks === 'save') {
      await page.locator('.native-property-disclosure>summary').filter({hasText:'高级'}).click()
      const editor = page.locator('[data-native-artifact-editor]')
      const waitState = value => page.waitForFunction(value => window.document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === value, value)
      const assertPending = async () => { await waitState('pending'); assert.match(await page.locator('.native-save-status').innerText(), /正在保存/); assert.ok(releaseAcknowledgment, 'Transport acknowledgment must still be held') }
      const release = async () => { holdAcknowledgment = false; releaseAcknowledgment?.(); releaseAcknowledgment = null; await waitState('saved') }
      const saveControl = async (control, value, verify) => {
        await control.fill(value)
        await waitState('draft')
        assert.match(await page.locator('.native-save-status').innerText(), /未保存/)
        holdAcknowledgment = true
        await control.press('Control+s')
        await assertPending()
        assert.equal(await control.evaluate(element => document.activeElement === element), true, 'Ctrl+S must save without blur')
        verify(); await release()
      }
      await saveControl(page.getByLabel('标题', { exact: true }), 'Focused property save', () => assert.equal(document.pages['page-1'].title, 'Focused property save'))
      await saveControl(page.getByLabel('宽', { exact: true }), '1800', () => assert.equal(document.pages['page-1'].width, 1800))
      if (kind === 'design') {
        await saveControl(page.getByLabel('画板 X', { exact: true }), '32', () => assert.equal(document.pages['page-1'].x, 32))
        await saveControl(page.getByLabel('画板 Y', { exact: true }), '48', () => assert.equal(document.pages['page-1'].y, 48))
      }
      if (kind === 'slides') await page.getByRole('button',{name:'讲者备注',exact:true}).click(); else { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'讲者备注',exact:true}).click() }
      const notes = page.getByRole('textbox', { name: '讲者备注', exact: true })
      for (const value of ['备注草稿一', '备注草稿二']) await saveControl(notes, value, () => assert.equal(document.pages['page-1'].notes, value))
      await page.locator('[data-node-id="page-1-heading"]').dblclick()
      const text = page.locator('[data-native-text-editor]'); await text.waitFor(); await page.keyboard.press('End')
      const cdp = await page.context().newCDPSession(page), beforeComposition = receipts.length
      await cdp.send('Input.imeSetComposition', { text: '未确认', selectionStart: 3, selectionEnd: 3 })
      await waitState('draft'); await text.press('Control+s'); await page.waitForTimeout(800)
      assert.equal(receipts.length, beforeComposition, 'Ctrl+S must not submit an IME composition')
      assert.equal(await editor.getAttribute('data-save-state'), 'draft')
      holdAcknowledgment = true
      await cdp.send('Input.insertText', { text: '确认后保存' })
      await assertPending(); await release(); await cdp.detach(); await page.keyboard.press('Escape')
      assert.ok(document.pages['page-1'].nodes['page-1-heading'].text.endsWith('确认后保存'))
      const cell = page.locator('[data-node-id="page-1-table"] td').first()
      await cell.dblclick()
      await page.waitForFunction(() => window.document.querySelector('[data-node-id="page-1-table"] td')?.getAttribute('contenteditable') === 'true')
      for (const value of ['表格草稿一', '表格草稿二']) await saveControl(cell, value, () => assert.equal(document.pages['page-1'].nodes['page-1-table'].cells[0][0], value))
      await page.locator('[data-node-id="page-1-heading"]').click()
      const fontSize = page.getByLabel('字号', { exact: true })
      await fontSize.fill('64'); await waitState('draft')
      document = applyOperations(document, prepareBatch(document, [{ type: 'node.patch', pageId: 'page-1', nodeId: 'page-1-heading', patch: { style: { color: '#7c3aed' } } }])).document
      history.version = document.seq
      await page.waitForFunction(() => getComputedStyle(window.document.querySelector('[data-node-id="page-1-heading"]')).color === 'rgb(124, 58, 237)')
      await saveControl(fontSize, '64', () => { assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.fontSize, 64); assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.color, '#7c3aed') })
      await page.locator('[data-node-id="page-1-heading"]').dblclick(); await text.waitFor(); await page.keyboard.press('End')
      const beforeUndo = document.pages['page-1'].nodes['page-1-heading'].text
      await page.keyboard.insertText(' redo-check'); await text.press('Control+s'); await waitState('saved')
      await text.press('Control+z')
      await page.waitForFunction(value => window.document.querySelector('[data-node-id="page-1-heading"]')?.textContent === value, beforeUndo)
      await page.locator('[data-node-id="page-1-heading"]').dblclick(); await text.waitFor()
      await text.press('Control+y')
      await page.waitForFunction(value => window.document.querySelector('[data-node-id="page-1-heading"]')?.textContent === value, beforeUndo + ' redo-check')
      assert.deepEqual(historyRequests, ['undo', 'redo'])
      assert.equal(await text.count(), 0, 'Shared redo must finish the active rich-text editor')
      await page.reload({ waitUntil: 'domcontentloaded' }); await ready(1)
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      if (kind === 'slides') await page.getByRole('button',{name:'讲者备注',exact:true}).click(); else { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'讲者备注',exact:true}).click() }
      await page.locator('.native-property-disclosure>summary').filter({hasText:'高级'}).click()
      assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), 'Focused property save')
      assert.equal(await page.getByLabel('宽', { exact: true }).inputValue(), '1800')
      assert.equal(await page.getByRole('textbox', { name: '讲者备注', exact: true }).inputValue(), '备注草稿二')
      assert.equal(await page.locator('[data-node-id="page-1-table"] td').first().innerText(), '表格草稿二')
      if (kind === 'design') { assert.equal(await page.getByLabel('画板 X', { exact: true }).inputValue(), '32'); assert.equal(await page.getByLabel('画板 Y', { exact: true }).inputValue(), '48') }
      assert.deepEqual(errors, [])
      return { kind: 'isolated-native-editor-save-diagnostic', mode: kind, focusedPropertyCtrlS: true, focusedTableCtrlS: true, repeatedFocusedNotesSave: true,
        dirtyBeforeSubmit: true, pendingUntilAcknowledged: true, compositionNotSubmittedByCtrlS: true, unrelatedAgentStylePreserved: true, activeRichTextSharedUndoRedo: true, reloadRetainedAllValues: true, designBoardCoordinates: kind === 'design', consoleOrPageErrors: errors }
    }
    let maxMountedPages = 0, maxMountedNodes = 0
    const editedPages = [1, 25, 50], expected = new Map()
    let chineseIme = false
    for (let index = 1; index <= 50; index++) {
      await select(index)
      const mounted = await page.locator('[data-page-id]').count()
      assert.ok(mounted <= (kind === 'slides' ? 1 : 9), `Unbounded ${kind} page DOM: ${mounted}`)
      maxMountedPages = Math.max(maxMountedPages, mounted)
      maxMountedNodes = Math.max(maxMountedNodes, await page.locator('[data-page-id] [data-node-id]').count())
      if (editedPages.includes(index)) {
        const nodeId = `page-${index}-heading`, suffix = index === 1 ? ' 中文验收' : ` verified-${index}`
        expected.set(index, document.pages[`page-${index}`].nodes[nodeId].text + suffix)
        await page.locator(`[data-node-id="${nodeId}"]`).dblclick()
        await page.locator('[data-native-text-editor]').waitFor()
        const baseline = receipts.length
        await page.waitForTimeout(800)
        assert.equal(receipts.length, baseline, 'Opening text without changes must not create history')
        await page.keyboard.press('End')
        if (index === 1) {
          const cdp = await page.context().newCDPSession(page)
          await cdp.send('Input.imeSetComposition', { text: ' 中文', selectionStart: 3, selectionEnd: 3 })
          await page.waitForTimeout(800)
          assert.equal(receipts.length, baseline, 'Partial Chinese composition must not save')
          await cdp.send('Input.imeSetComposition', { text: ' 中文验', selectionStart: 4, selectionEnd: 4 })
          await page.waitForTimeout(800)
          assert.equal(receipts.length, baseline, 'Updated Chinese composition must not save')
          await cdp.send('Input.insertText', { text: suffix })
          await cdp.detach(); chineseIme = true
        } else await page.keyboard.insertText(suffix)
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => window.document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === 'saved')
        assert.equal(document.pages[`page-${index}`].nodes[nodeId].text, expected.get(index))
      }
    }
    assert.equal(receipts.length, 3, 'Each manual text edit must be one committed batch')
    const waitSaved = () => page.waitForFunction(() => window.document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === 'saved')
    await select(25)
    await page.locator('[data-node-id="page-25-formula"]').click()
    const formula = '\\frac{25}{2}+x^{3}'
    const formulaSource = page.getByLabel('公式排版源码', { exact: true })
    await formulaSource.fill(formula); await formulaSource.press('Control+s'); await waitSaved(); await ready(25)
    assert.equal(document.pages['page-25'].nodes['page-25-formula'].source, formula)
    await select(50)
    await page.locator('[data-node-id="page-50-image"]').click()
    await page.locator('.native-property-disclosure>summary').filter({hasText:'高级'}).click()
    for (const [label, value] of [['宽度', '0.75'], ['横坐标', '0.1']]) { const control = page.getByLabel(`裁剪${label}`, { exact: true }); await control.fill(value); await control.press('Control+s'); await waitSaved() }
    assert.deepEqual(document.pages['page-50'].nodes['page-50-image'].crop, { x: .1, y: 0, width: .75, height: 1 })
    await select(1)
    await page.getByRole('button',{name:'主题',exact:true}).click()
    await page.getByRole('button',{name:'默认主题',exact:true}).click(); await waitSaved(); assert.equal(document.themeId,null)
    await page.getByRole('button',{name:'使用主题 验收主题',exact:true}).click(); await waitSaved(); assert.equal(document.themeId,'fixture-theme')
    await page.getByRole('button',{name:'属性',exact:true}).click()
    await select(50)
    await page.locator('[data-native-artifact-editor]').focus(); await page.keyboard.press('Alt+ArrowUp'); await waitSaved()
    assert.equal(document.pageOrder[48], 'page-50')
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(100); await waitSaved()
    assert.equal(document.pageOrder[49], 'page-50')
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(100); await waitSaved()
    assert.equal(document.pageOrder[48], 'page-50')
    assert.deepEqual(historyRequests, ['undo', 'redo'])
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(1)
    for (const index of editedPages) { await select(index); assert.equal(await page.locator(`[data-node-id="page-${index}-heading"]`).innerText(), expected.get(index)) }
    assert.equal(document.pages['page-25'].nodes['page-25-formula'].source, formula)
    assert.deepEqual(document.pages['page-50'].nodes['page-50-image'].crop, { x: .1, y: 0, width: .75, height: 1 })
    assert.equal(document.themeId, 'fixture-theme'); assert.equal(document.pageOrder[48], 'page-50')
    await page.screenshot({ path: join(output, `${kind}.png`) })
    const agentBatch = prepareBatch(document, [{ type: 'node.patch', pageId: 'page-50', nodeId: 'page-50-heading', patch: { text: 'Agent collaborative heading' } }])
    const agentChange = applyOperations(document, agentBatch)
    document = agentChange.document; historyEntry = { inverse: agentChange.inverse, forward: agentBatch.operations }
    history.version = document.seq; history.undo = agentBatch.operationId; history.redo = null
    await page.waitForFunction(() => window.document.querySelector('[data-node-id="page-50-heading"]')?.textContent === 'Agent collaborative heading')
    await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+z')
    await page.waitForFunction(value => window.document.querySelector('[data-node-id="page-50-heading"]')?.textContent === value, expected.get(50))
    await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+y')
    await page.waitForFunction(() => window.document.querySelector('[data-node-id="page-50-heading"]')?.textContent === 'Agent collaborative heading')
    assert.deepEqual(historyRequests, ['undo', 'redo', 'undo', 'redo'])
    const changedPageIds = document.pageOrder.filter(id => pageHash(document.pages[id]) !== initialPageHashes[id]).sort()
    assert.deepEqual(changedPageIds, ['page-1', 'page-25', 'page-50'])
    let isolatedInteraction = false
    if (document.pages['page-25'].nodes['page-25-isolated']) {
      await select(25)
      if(kind==='design'){await page.getByLabel('播放',{exact:true}).click();await page.getByRole('group',{name:'播放选项',exact:true}).getByRole('button',{name:document.pages['page-25'].title,exact:true}).click();await page.getByRole('region',{name:'画板全窗口预览',exact:true}).waitFor()}else await page.getByRole('button', { name: '放映', exact: true }).click()
      const iframe = (kind==='design'?page.getByRole('region',{name:'画板全窗口预览',exact:true}):page).locator('[data-node-id="page-25-isolated"] iframe')
      await iframe.waitFor()
      assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts')
      const image = iframe.contentFrame().locator('img')
      await image.waitFor()
      await image.evaluate(() => new Promise(resolve => {
        if (document.readyState === 'complete') resolve()
        else window.addEventListener('load', () => resolve(), { once: true })
      }))
      // Frame descendants report unscaled coordinates in this Chromium/Playwright
      // combination. Send trusted pointer input at the iframe's rendered centre.
      const frameBounds = await iframe.boundingBox()
      assert.ok(frameBounds)
      await page.mouse.click(frameBounds.x + frameBounds.width / 2, frameBounds.y + frameBounds.height / 2)
      await image.evaluate(element => new Promise((resolve, reject) => {
        const deadline = performance.now() + 3000
        const check = () => { if (getComputedStyle(element).opacity === '0.35') resolve(); else if (performance.now() > deadline) reject(new Error('Isolated image click did not run')); else requestAnimationFrame(check) }
        check()
      }))
      isolatedInteraction = true
    }
    assert.deepEqual(errors, [])
    return { kind: 'isolated-native-editor-ui-diagnostic', mode: kind, fixtureVersion: fixture.manifest.version, fixtureSemanticSha256: fixture.manifest.semanticSha256, scope: 'HTTP fixture and real shared reducer; not real API, database, Agent runtime, or performance acceptance', pagesTraversed: 50,
      activePageImageDecodedAndFormulaReady: 50, maxMountedPages, maxMountedNodes, editedPages, reloadedPages: editedPages, committedManualBatches: receipts.length,
      openingTextWithoutChangesDoesNotSave: true, chineseIme, formulaEditedAndReopened: 25, imageCropEditedAndReopened: 50, themeSwitchedAndRestored: true,
      pageOrderChangedAndReopened: true, pageOrderSharedUndoRedo: true, agentSharedUndoRedo: true, changedPageIds, untouchedPageHashes: 47,
      agentPlainTextPatchVisible: true, isolatedInteraction, consoleOrPageErrors: errors }
  } catch(error) { await page.screenshot({path:join(output,`${kind}-failure.png`)}); const diagnostic=await page.evaluate(()=>({geometry:window.__geometryLog,zoom:document.querySelector('[aria-label="画布缩放"]')?.textContent,stage:[...document.querySelectorAll('.native-stage')].map(e=>({scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,w:e.clientWidth,h:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight})),boards:[...document.querySelectorAll('[data-artboard-id]')].map(e=>({id:e.dataset.artboardId,rect:e.getBoundingClientRect().toJSON()})),notices:[...document.querySelectorAll('.native-notice')].map(e=>e.textContent)}));await writeFile(join(output,`${kind}-failure.json`),JSON.stringify({message:String(error),errors,diagnostic},null,2));throw error } finally { svgFontsHeld=false;releaseSvgFonts?.();releaseAcknowledgment?.(); await page.close() }
}

async function visualControls(page){return page.locator('button,[role=button],[role=tab],input,select,textarea,[role=menuitem],summary').evaluateAll(elements=>elements.filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden').map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')??e.getAttribute('title')??e.textContent?.slice(0,100),role:e.getAttribute('role')??e.tagName.toLowerCase(),rect:{x:r.x,y:r.y,width:r.width,height:r.height},fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,background:s.backgroundColor,border:s.border,shadow:s.boxShadow,radius:s.borderRadius,cursor:s.cursor,transition:s.transition}}))}
