#!/usr/bin/env node
import {verifySizingExports} from './native-editor-sizing-export-check.mjs'
import {elementLink,elementLinkPatch} from '../shared/artifact-element-link.ts'
/** Isolated HTTP-fixture UI diagnostic, NOT full API acceptance or a benchmark.
 * Run: PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
 *   node --import tsx scripts/native-editor-ui-acceptance.mjs --mode=both --browser=/usr/bin/chromium --output=/tmp/lingxi-ui
 * Uses installed Vite/React and a separately available Playwright package. No SDK,
 * real credentials, database, external service or general E2E framework is used.
 */
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink } from 'node:fs/promises'
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
const supportedChecks = ['element-layout','element-sizing','element-link','board-title','board-transform','design-artboard','os-ime','page-radius','design-outline','slides-toolbar','inspector-code','code-style','inspector-load', 'slides-present-controls', 'slides-skipped-export', 'slide-speaker', 'slide-transitions', 'undo-focus', 'asset-colors', 'canvas-play-menu', 'asset-reads', 'canvas-board-export', 'canvas-board-preview', 'canvas-board-preview-load', 'canvas-contents', 'canvas-empty', 'canvas-fit-body', 'canvas-fit-switch', 'canvas-flow', 'canvas-import', 'canvas-layout-cache', 'canvas-links', 'canvas-pages', 'canvas-pages-cas', 'canvas-pen', 'canvas-title', 'canvas-vector', 'canvas-vector-edit', 'canvas-vector-edit-cas', 'canvas-vector-edit-load', 'canvas-vector-edit-retention', 'canvas-vector-load', 'canvas-vector-retention', 'cas', 'color-cas', 'colors', 'comments', 'export-ink', 'font-cas', 'fonts', 'fonts-lazy', 'fonts-readonly', 'history', 'interactions', 'legacy-colors', 'menu-resize', 'narrow', 'parity', 'rail', 'save', 'shapes', 'svg-font', 'svg-font-cancel', 'svg-font-error', 'svg-font-module', 'table', 'table-stability', 'viewport-loading']
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
if(options.checks==='element-layout'&&options['layout-case']?.split(',').some(name=>['exports','capture'].includes(name))||options.checks==='element-sizing'&&options['sizing-case']==='exports'||options.checks==='element-link'&&['exports','nested-export','same-node'].includes(options['link-case'])||options.checks==='slides-skipped-export'||options.checks==='page-radius'&&['exports','jpeg'].includes(options['radius-case'])||options.checks==='design-artboard'&&options['artboard-case']==='exports')await symlink(dependencyRoot,join(workspace,'node_modules'),'dir')
const mocks = {
  http: `export async function http(path,init){const response=await fetch('/api'+path,{...init,headers:{'Content-Type':'application/json',...init?.headers}});if(!response.ok)throw Object.assign(new Error(await response.text()),{status:response.status});return response.json()}`,
  realtime: ['inspector-code','board-title','element-link','element-sizing','element-layout'].includes(options.checks)?`const listeners=new Set();window.__codeChanged=()=>{for(const fn of listeners)fn({type:'artifact.changed',artifactId:'fixture'})};export const ws={on:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}}`:'export const ws={on:()=>()=>{}}',
  transport: 'export const lingxiApiFetch=(...args)=>fetch(...args)',
  auth: "export const getActiveCompanyId=()=> 'fixture-company'",
  workspaceSession: "export const getWorkspaceSession=()=>({companyId:'fixture-company',projectId:'fixture-project'})",
}
for (const [name, source] of Object.entries(mocks)) await writeFile(join(workspace, `${name}.js`), source)
await writeFile(join(workspace, 'index.html'), '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"></head><body style="margin:0"><div id="root" style="height:100vh"></div><script type="module" src="/entry.tsx"></script></body></html>')
await writeFile(join(workspace, 'entry.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import NativeEditor from ${JSON.stringify(join(root, 'src/features/artifacts/native/NativeEditor'))};${options.checks==='slides-present-controls'?"const taskRoot=createRoot(document.getElementById('root'));window.__nativeUiRoot=taskRoot;taskRoot":"createRoot(document.getElementById('root')!)"}.render(<${options['strict-mode']==='false'?'React.Fragment':'React.StrictMode'}>${options.checks==='canvas-pages'?'<div style={{height:"100%"}} data-fixture-workspace onKeyDown={event=>{if(event.key==="Escape"&&!event.defaultPrevented)event.currentTarget.hidden=true}}>':''}<NativeEditor artifactId="fixture" kind={new URLSearchParams(location.search).get('kind')==='design'||new URLSearchParams(location.search).has('design')?'design':'slides'} title="原生编辑器验收" />${options.checks==='canvas-pages'?'</div>':''}</${options['strict-mode']==='false'?'React.Fragment':'React.StrictMode'}>)`)
await writeFile(join(workspace,'artifact-export.html'),(await readFile(join(root,'artifact-export.html'),'utf8')).replace('/src/features/artifacts/native/export/realm-entry.ts',`/@fs${root}/src/features/artifacts/native/export/realm-entry.ts`))
let server, browser
try {
  server = await createServer({ configFile: false, root: workspace, publicDir: join(root, 'public'), plugins: [react()], logLevel: 'error',
    cacheDir:join(workspace,'.vite'),
    // Late CommonJS discovery reloads the fixture during PPTX export, even with HMR off.
    optimizeDeps: options.checks==='element-layout'&&options['layout-case']?.split(',').some(name=>['exports','capture'].includes(name))||options.checks==='element-sizing'&&options['sizing-case']==='exports'||options.checks==='element-link'&&['exports','nested-export','same-node'].includes(options['link-case'])||options.checks==='slides-skipped-export'||options.checks==='page-radius'&&['exports','jpeg'].includes(options['radius-case'])||options.checks==='design-artboard'&&options['artboard-case']==='exports'?{noDiscovery:true,include:['react','react-dom','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','pptxgenjs','html-to-image','jszip','katex']}:undefined,
    resolve: { alias: [
      ...Object.entries({ '@/api/core/http': 'http', '@/api/core/realtime': 'realtime', '@/api/transport': 'transport', '@/stores/auth': 'auth', '@/lib/workspaceSession': 'workspaceSession' }).map(([find, name]) => ({ find, replacement: join(workspace, `${name}.js`) })),
      { find: 'react', replacement: dirname(require.resolve('react/package.json')) },
      { find: 'react-dom', replacement: dirname(require.resolve('react-dom/package.json')) },
    ] }, server: { host: '127.0.0.1', port: 0, hmr:false, fs: { allow: [root, workspace, dependencyRoot] } } })
  await server.listen()
  const address = server.httpServer.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: options.headed!=='true', ...(options.browser ? { executablePath: options.browser } : {}), args: ['--no-sandbox',...(options.checks==='os-ime'?['--ozone-platform=x11','--gtk-version=3','--disable-dev-shm-usage']:[])] })
  for (const kind of mode === 'both' ? ['slides', 'design'] : [mode]) {
    for (const editorCase of options.checks==='element-layout'?(options['layout-case']?.split(',')??['padding','margin','padding-expand','margin-expand','padding-top','margin-left','reset-padding','reset-margin','history','cancel','padding-step-down','margin-step-down','readonly','conflict','permission','invalid','save','locked','lock-draft']):options.checks==='element-sizing'?(options['sizing-case']?.split(',')??['base','width','auto','percent','width-hug','width-fill','height-hug','height-fill','position-inline','position-relative','position-fixed','position-sticky','min-width','max-width','min-height','max-height','right','bottom','offset','reset-width','escape','blank','save','history','readonly','conflict','permission','invalid']):options.checks==='element-link'?(options['link-case']?.split(',')??['http','relative','mail','anchor','clear','history','edit','relative-edit','image','readonly','conflict','permission','independent','tel','save','unchanged','invalid','group','mixed-cancel','mixed-change']):options.checks==='board-title'?(options['title-case']?.split(',')??['enter','escape','blur','blank','spaces','unchanged','history','save','composing','readonly','conflict','permission']):options.checks==='board-transform'?options['board-case']?options['board-case'].split(','):['move','move-unsnapped','resize','resize-unsnapped','ratio','minimum','ratio-minimum','maximum','copy','copy-history','copy-late','copy-release','copy-late-still','copy-release-still','cancel','copy-cancel','history','keyboard','readonly','multi','multi-toggle','multi-copy','comment-resize','pending-width','selection-camera','cross-canvas','gap-middle','gap-aligned','gap-left','gap-bypass','gap-vertical','gap-cancel','gap-history','group-resize','group-ratio','group-minimum','group-cancel','group-history','group-keyboard','group-readonly',...['n','e','s','w','nw','ne','sw'].map(handle=>'edge-'+handle)]:options.checks==='canvas-fit-body'?options['fit-case']?[options['fit-case']]:['first','rapid','restored']:options.checks === 'canvas-vector-edit-retention' ? options['vector-case']?[options['vector-case']]:['readonly','denied','space','middle','touch'] : options.checks === 'canvas-vector-edit-cas' ? options['vector-case']?[options['vector-case']]:['rotation','path','style','reload','parent-idle','parent-active','parent-cancel','parent-cancel-click','padding','padding-rotated','padding-change','padding-active'] : options.checks === 'canvas-vector-edit' ? options['vector-case']?[options['vector-case']]:['initial','anchor-drag','nudge','smooth','delete','insert','tab','pull','shift-drag','handle','break','cancel','group-nudge','save-in-mode','undo-point','redo-point','keyboard-enter'] : options.checks === 'canvas-vector-retention' ? options['vector-case']?[options['vector-case']]:['permission','permission-single','page','denied','denied-single','single-switch','space','middle'] : options.checks === 'canvas-vector' ? options['vector-case']?[options['vector-case']]:['open-enter','open-escape','single-escape','closed','first-handle','middle-handle','shift-angle','backspace','switch-tool','near-point','oversize','draft-undo','draft-redo','draft-delete','draft-save'] : options.checks === 'cas' ? ['rte', 'table'] : options.checks === 'fonts-lazy' ? ['outside', 'escape'] : [null]) {
      if(options.checks==='element-link'&&kind==='slides'&&!['edit','relative-edit','exports'].includes(editorCase))continue
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

async function verifyWholeAndInlineClicks(page,rootSelector='body'){
  const results=[]
  for(const [href,whole]of [['https://parent.test/',true],['https://child.test/',false]]){
    const point=await page.locator(rootSelector).evaluate((root,{href,whole})=>{
      const anchor=[...root.querySelectorAll('a[href]')].find(element=>element.getAttribute('href')===href),rect=anchor.getBoundingClientRect()
      return{x:rect.left+2,y:rect.top+rect.height*(whole?.9:.5)}
    },{href,whole})
    await page.evaluate(()=>{window.__nativeLinkClick=null;document.addEventListener('click',event=>{event.preventDefault();window.__nativeLinkClick={href:event.target.closest('a[href]')?.getAttribute('href'),trusted:event.isTrusted}},{capture:true,once:true})})
    await page.mouse.click(point.x,point.y)
    const click=await page.evaluate(()=>window.__nativeLinkClick)
    assert.deepEqual(click,{href,trusted:true},'真实点击必须分别命中整体和局部链接')
    results.push({point,...click})
  }
  return results
}

async function verifyMode(kind, browser, baseUrl, editorCase) {
  const visualChecks=['element-layout','element-sizing','element-link','board-title','board-transform','design-artboard','page-radius','design-outline','slides-toolbar','inspector-code','code-style','inspector-load','slides-present-controls','slides-skipped-export','slide-speaker','slide-transitions','parity','table','table-stability','fonts','font-cas','fonts-lazy','fonts-readonly','svg-font','svg-font-error','svg-font-cancel','svg-font-module','canvas-pages','canvas-pages-cas','canvas-flow','canvas-contents','canvas-import','canvas-empty','canvas-layout-cache','canvas-links','canvas-title','canvas-pen','canvas-vector','canvas-vector-load','canvas-vector-retention','canvas-vector-edit','canvas-vector-edit-cas','canvas-vector-edit-retention','canvas-vector-edit-load','canvas-fit-switch','canvas-fit-body','canvas-board-preview','canvas-board-export','canvas-board-preview-load','asset-reads','canvas-play-menu','asset-colors']
  const fixture = visualChecks.includes(options.checks) ? createVisualFixture(kind) : createFixture(kind, 'fixture', Array.from({ length: 50 }, (_, index) => `/api/artifacts/fixture/assets/image-${index + 1}`))
  const cameraReference=options['source-runtime']?JSON.parse(await readFile(resolve(options['source-runtime']),'utf8')):JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-fit-camera.json'),'utf8'))
  if(options['source-runtime']){assert.equal(cameraReference.sourceCommit,'016b39d7fdcc30bfacee31ea5541498ac53921c6');assert.equal(cameraReference.referenceResourceHashesVerified,12)}
  let document = fixture.document
  if(options.checks==='element-sizing'&&['text-align-css','text-align-important','text-align-history'].includes(editorCase))document.pages['page-1'].nodes['page-1-heading'].css={'text-align':editorCase==='text-align-important'?'center !important':'center'}
  if(options.checks==='element-sizing'&&editorCase==='text-align-locked')document.pages['page-1'].nodes['page-1-heading'].locked=true
  if(options.checks==='element-sizing'&&editorCase==='text-align-inherited')document.pages['page-1'].nodes['page-1-root'].style.textAlign='center'
  if(options.checks==='element-sizing'&&['text-align-logical-start','text-align-logical-end'].includes(editorCase))document.pages['page-1'].nodes['page-1-heading'].css={'text-align':editorCase.endsWith('start')?'start':'end'}
  if(options.checks==='element-sizing'&&editorCase==='exports'&&kind==='slides'){const node=document.pages['page-1'].nodes['page-1-heading'];node.css={width:'50%',height:'auto','max-width':'900px'};node.implicitHeight=true}
  if(options.checks==='element-layout'&&editorCase==='capture')document.pages['page-1'].nodes['page-1-heading'].style.backgroundColor='#ed3521'
  if(options.checks==='element-sizing'&&options['sizing-stroke']==='true')Object.assign(document.pages['page-1'].nodes['page-1-shape'].style,{stroke:'#18332b',strokeWidth:2,borderStyle:'dashed'})
  if(options.checks==='element-sizing'&&editorCase==='theme-fill'){
    assert.equal(options['sizing-node'],'shape')
    document.themeId='sizing-theme';document.themes['sizing-theme']={id:'sizing-theme',name:'尺寸主题',tokens:{accent:'#ff0000'}}
    document.pages['page-1'].nodes['page-1-shape'].style={themeFill:'accent',borderRadius:12}
  }
  if(options.checks==='board-title'&&['narrow-long','wide-long'].includes(editorCase)){document.pages['page-1'].width=editorCase==='narrow-long'?120:1920;document.pages['page-1'].title='非常长的中文画板标题'.repeat(12)}
  if(options.checks==='element-link'&&editorCase==='same-node'){const node=document.pages['page-1'].nodes['page-1-heading'];node.attributes={href:'https://old-parent.test/'};node.text='前链接后';node.richText={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'前'},{type:'text',text:'链接',marks:[{type:'link',attrs:{href:'https://child.test/'}}]},{type:'text',text:'后'}]}]}}
  if(options.checks==='element-link'&&editorCase==='nested-export'){const node=document.pages['page-1'].nodes['page-1-heading'];node.richText={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:node.text,marks:[{type:'link',attrs:{href:'https://child.test/'}}]}]}]}}
  if(options.checks==='element-link'&&editorCase?.startsWith('mixed-'))document.pages['page-1'].nodes['page-1-heading'].richText={type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'Lingxi'},{type:'text',text:'Loop',marks:[{type:'link',attrs:{href:'https://old.test/'}}]},{type:'text',text:' 1'}]}]}
  if(options.checks==='element-link'&&editorCase==='group')delete document.pages['page-1'].nodes['page-1-heading'].style.color
  if(options.checks==='element-link'&&kind==='slides'){const node=document.pages['page-1'].nodes['page-1-heading'];Object.assign(node,elementLinkPatch(node,editorCase==='relative-edit'?'example.test':'https://example.test/中文').patch)}
  if(options.checks==='design-outline'&&options['outline-case']==='large'){
    const original=structuredClone(document.pages['page-3'])
    for(let index=4;index<=50;index++){
      const value=structuredClone(original),prefix=`page-${index}`
      value.id=prefix;value.title=`Page ${index}`;value.x=(index-1)*2080
      const ids=new Map(value.nodeOrder.map(id=>[id,id.replace('page-3',prefix)]))
      value.nodes=Object.fromEntries(value.nodeOrder.map(id=>{const node=value.nodes[id];node.id=ids.get(id);if(node.parentId)node.parentId=ids.get(node.parentId);if(node.text){node.text=`LingxiLoop ${index}`;node.richText={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:node.text}]}]}}return[node.id,node]}))
      value.nodeOrder=value.nodeOrder.map(id=>ids.get(id));document.pages[prefix]=value;document.pageOrder.push(prefix)
    }
  }
  if(options.checks==='code-style'&&['geometry','drag'].includes(options['code-case']))document.pages['page-1'].nodes['page-1-shape'].css={left:'120px !important'}
  if(options.checks==='code-style'){const node=document.pages['page-1'].nodes['page-1-heading'];node.css={filter:'blur(1px) !important','max-width':'1800px',...(options['code-case']==='important-same'?{color:node.style.color+' !important'}:{})};node.attributes={'data-label':'中文测试',title:'中文说明',href:'https://example.test/',target:'_blank'}}
  if(options.checks==='slides-present-controls')document.pages['page-1'].notes='全屏与演讲者控制备注。'
  if (options.checks === 'slides-skipped-export') {
    const skipped = document.pages['page-2']
    skipped.skip = true
    skipped.notes = '不应导出的跳过页备注'
    const embed = { ...createNode('embed', 'skipped-embed'), embed: { format: 'html', source: '<p>不应执行的跳过页内容</p>' } }
    skipped.nodes[embed.id] = embed
    skipped.nodeOrder.push(embed.id)
    if (options['export-case'] === 'all-skipped') for (const page of Object.values(document.pages)) page.skip = true
  }
  if(options.checks==='slide-speaker'){document.pages['page-1'].notes='第一点：介绍设计。\n第二点：说明交互。';document.pages['page-2'].skip=true}
  if(options.checks==='slide-speaker'&&options['speaker-case']==='executable-preview'){
    const page=document.pages['page-1'],original=page.nodes['page-1-image'],source='<script>parent.postMessage({type:"native-speaker-program-start"},"*")</script><p>隔离内容</p>'
    page.nodes['speaker-embed']={...original,id:'speaker-embed',type:'embed',embed:{format:'html',source,sourceHash:createHash('sha256').update(source).digest('hex'),previewAssetId:original.assetId}};delete page.nodes['speaker-embed'].assetId;page.nodeOrder.push('speaker-embed')
  }
  if(options.checks==='slide-speaker'&&options['speaker-case']==='visual'){document.pages['page-1'].notes='第一点：介绍设计。 第二点：说明交互。';document.pages['page-2'].skip=false}
  if(options.checks==='slide-speaker'&&options['speaker-case']==='no-notes')for(const page of Object.values(document.pages))page.notes=''
  if(options.checks==='slide-speaker'&&options['speaker-case']==='all-skipped')for(const page of Object.values(document.pages))page.skip=true
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
    Object.assign(first,{width:800,height:600,sizing:'flow'});Object.assign(heading,{x:50,y:50,width:700,height:100})
    const shape={...createNode('shape','flow-bottom'),x:0,y:900,width:100,height:100}
    const image=Object.values(first.nodes).find(node=>node.type==='image');Object.assign(image,{x:50,y:200,width:100,height:100})
    heading.parentId=null;image.parentId=null
    first.nodeOrder=[heading.id,image.id,shape.id];first.nodes={[heading.id]:heading,[image.id]:image,[shape.id]:shape}
    Object.assign(other,{canvasPageId:'canvas-second',x:0,y:options['flow-overlap']?0:700,width:800,height:600})
  }
  if(options.checks==='board-transform'&&editorCase==='gap-vertical')document.pageOrder.forEach((id,index)=>{document.pages[id].x=0;document.pages[id].y=index*1240})
  if(options.checks==='board-transform'&&editorCase==='cross-canvas'){document.canvasPages=[{id:'canvas-page-1',name:'页面 1'},{id:'second',name:'页面 2'}];document.pages['page-3'].canvasPageId='second'}
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
  if(options.checks==='board-transform'&&editorCase==='comment-resize')commentThreads=[{id:'board-anchor',anchor:encodeCommentAnchor({pageId:'page-1',x:.5,y:.5}),label:'画板局部坐标',status:'open',messages:[{id:'anchor-message',text:'缩放定位',author:{kind:'user',id:'fixture-user',name:'验收用户'},at:'2026-11-07T00:00:00.000Z'}]}]
  const pageHash = page => createHash('sha256').update(JSON.stringify(page)).digest('hex')
  const initialPageHashes = Object.fromEntries(document.pageOrder.map(id => [id, pageHash(document.pages[id])]))
  const history = { version: 0, undo: null, redo: null }, receipts = [], errors = []
  let holdAcknowledgment = false, releaseAcknowledgment = null
  let historyEntry = null
  const historyRequests = [],expectedCodeNetworkErrors=[]
  let denyCodeAccess=false
  let rejectSpeakerSave=['notes-network','notes-denied','notes-write-denied'].includes(options['speaker-case']);let denySpeakerRead=false;const speakerSaveIds=[]
  let fixtureWrite=!(options.checks==='element-layout'&&editorCase==='readonly')&&!(options.checks==='element-sizing'&&['readonly','text-align-readonly'].includes(editorCase))&&!(options.checks==='element-link'&&editorCase==='readonly')&&!(options.checks==='board-title'&&editorCase==='readonly')&&!(options.checks==='board-transform'&&['readonly','group-readonly'].includes(editorCase))&&options['artboard-case']!=='readonly'&&options['code-case']!=='readonly'&&options['preview-readonly']!=='true'&&options['speaker-case']!=='readonly'
  let holdImageReads=options.checks==='asset-reads',releaseImageReads
  const imageReadGate=new Promise(resolve=>{releaseImageReads=resolve}),physicalImageReads=[]
  const pageReads=[]
  let releaseCanvasBody,canvasBodyLoaded=false,notifyCanvasBody
  const canvasBodyRequested=new Promise(resolve=>{notifyCanvasBody=resolve})
  let speakerPreviewFailure=options['speaker-case']==='preview-error'
  const delayedPageId=speakerPreviewFailure?'page-3':options.checks==='canvas-fit-body'?'positioned-body':options['preview-body-delay']==='true'?'page-2':null
  const snapshot = () => ({ document:delayedPageId&&!canvasBodyLoaded?{...document,pages:{...document.pages,[delayedPageId]:{...document.pages[delayedPageId],nodes:{},nodeOrder:[]}}}:options.checks==='viewport-loading'?{...document,pages:Object.fromEntries(artifactPageIds(document).map(id=>[id,id==='page-1'?document.pages[id]:{...document.pages[id],nodes:{},nodeOrder:[]}]))}:document, history, write: fixtureWrite, loadedPageIds:delayedPageId&&!canvasBodyLoaded?artifactPageIds(document).filter(id=>id!==delayedPageId):options.checks==='viewport-loading'?['page-1']:artifactPageIds(document),
    pageVersions: Object.fromEntries(artifactPageIds(document).map(id => [id, String(document.versions[`page/${id}`] ?? 0)])) })
  const page = await browser.newPage({ hasTouch:options['speaker-case']==='coarse'||options['presentation-case']==='touch', viewport: { width: Number(options.width??1440), height: Number(options.height??1000) },colorScheme:options['canvas-theme']==='dark'?'dark':'light',reducedMotion:options.checks==='slide-transitions'?'no-preference':'reduce' })
  if (options.checks === 'slides-skipped-export') await page.addInitScript(() => {
    window.__exportDownloadAttempts = []
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function(...args) { if(this.download)window.__exportDownloadAttempts.push({name:this.download,at:performance.now()});return click.apply(this,args) }
  })
  if(options['speaker-case']==='executable-preview')await page.addInitScript(()=>{window.__speakerProgramStarts=0;window.addEventListener('message',event=>{if(event.data?.type==='native-speaker-program-start')window.__speakerProgramStarts++})})
  if(options.checks==='canvas-layout-cache')await page.addInitScript(()=>{window.__naturalProbePeak=0;new MutationObserver(()=>{window.__naturalProbePeak=Math.max(window.__naturalProbePeak,document.querySelectorAll('[data-native-measure-node]').length)}).observe(document,{childList:true,subtree:true})})
  if(options['canvas-theme']==='dark')await page.addInitScript(()=>{const apply=()=>{if(window===top)document.documentElement?.classList.add('dark')};apply();document.addEventListener('DOMContentLoaded',apply,{once:true})})
  let svgFontsBlocked=options.checks==='svg-font-error',svgFontsHeld=options.checks==='svg-font-cancel',releaseSvgFonts=null,svgFontFailures=0,svgModuleBlocked=options.checks==='svg-font-module',svgModuleRequests=0
  const editorFontRequests=[]
  let presentationModuleRequests=0,speakerModuleRequests=0
  let boardModuleBlocked=options.checks==='canvas-board-preview-load',boardModuleRequests=0
  let pointModuleBlocked=options.checks==='canvas-vector-edit-load',pointModuleRequests=0
  let expectedVectorDenied=false;let vectorModuleBlocked=options.checks==='canvas-vector-load',vectorModuleRequests=0
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/fonts/editors/'))editorFontRequests.push(new URL(request.url()).pathname)})
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.includes('/CanvasPenTool.tsx'))vectorModuleRequests++;if(path.includes('/CanvasPointEditor.tsx'))pointModuleRequests++;if(path.includes('/BoardPreview.tsx'))boardModuleRequests++;if(path.includes('/SlidesPresentation.tsx'))presentationModuleRequests++;if(path.includes('/SlidesSpeaker.tsx'))speakerModuleRequests++})
  const exportNavigations=[]
  if(options.checks==='slides-skipped-export')page.on('framenavigated',frame=>{if(frame===page.mainFrame())exportNavigations.push(new URL(frame.url()).pathname)})
  if(options.checks==='slides-present-controls'&&options['presentation-case']==='denied')await page.addInitScript(()=>{Element.prototype.requestFullscreen=()=>Promise.reject(new DOMException('拒绝全屏','NotAllowedError'))})
  if(options.checks==='slides-present-controls'&&options['presentation-case']==='module-error')await page.route('**/SlidesPresentation.tsx*',route=>route.abort('failed'))
  let inspectorModuleRequests=0,blockInspector=options['inspector-case']==='failed',releaseInspector
  if(options.checks==='inspector-load'){
    const held=options['inspector-case']==='cancel'?new Promise(resolve=>{releaseInspector=resolve}):Promise.resolve()
    await page.route('**/NativeInspector.tsx*',async route=>{inspectorModuleRequests++;await held;if(blockInspector)await route.abort('failed');else await route.continue()})
  }
  page.setDefaultTimeout(30_000)
  if(options['presentation-portrait']==='true')await page.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=(fn,delay,...args)=>original(fn,[570,670,730].includes(delay)?delay*10:delay,...args)})
  await page.addInitScript(()=>{window.__geometryLog=[];window.__geometryMessages=0;window.__penRequests=0;const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{if(Array.isArray(e.data?.value)){window.__geometryLog.push({direction:'reply',...e.data});window.__geometryLog=window.__geometryLog.slice(-60)}})}postMessage(message,...args){window.__geometryMessages++;if(message?.task?.kind==='pen')window.__penRequests++;if(['visible','update-pages','elements'].includes(message?.task?.kind)){window.__geometryLog.push({direction:'request',...message});window.__geometryLog=window.__geometryLog.slice(-60)}return super.postMessage(message,...args)}}})
  if(options.checks==='viewport-loading')await page.addInitScript(()=>{window.__holdVisible=false;window.__heldVisible=[];const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.visibleIds=new Set();this.addEventListener('message',event=>{if(this.visibleIds.delete(event.data?.id)&&window.__holdVisible){event.stopImmediatePropagation();window.__heldVisible.push(()=>this.dispatchEvent(new MessageEvent('message',{data:event.data})))}})}postMessage(message,...args){if(message?.task?.kind==='visible')this.visibleIds.add(message.id);return super.postMessage(message,...args)}}})
  if(options.checks==='canvas-pen')await page.addInitScript(()=>{window.__holdPen=false;window.__heldPen=[];const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.penIds=new Set();this.addEventListener('message',event=>{if(this.penIds.delete(event.data?.id)&&window.__holdPen){event.stopImmediatePropagation();window.__heldPen.push(()=>this.dispatchEvent(new MessageEvent('message',{data:event.data})))}})}postMessage(message,...args){window.__geometryMessages++;if(message?.task?.kind==='pen')this.penIds.add(message.id);return super.postMessage(message,...args)}}})
  page.on('pageerror', error => errors.push(error.message))
  if(options.checks==='slides-present-controls')page.on('pageerror',error=>{void writeFile(join(output,'page-error-details.json'),JSON.stringify({message:error.message,stack:error.stack},null,2))})
  page.on('console', message => { if(options.checks==='inspector-code'&&message.type()==='error'&&(options['code-case']==='cas'&&message.location().url.includes('/operations')&&message.text().includes('409')||['access-composing','discard-recovery'].includes(options['code-case'])&&/\/(changes|document)(?:\?|$)/.test(message.location().url)&&message.text().includes('403'))){expectedCodeNetworkErrors.push(message.text());return} if (message.type() === 'error'&&!(expectedVectorDenied&&message.text().includes('403')&&message.location().url.includes('/changes'))&&!(options['preview-save-retry']==='true'&&message.location().url.includes('/operations')&&message.text().includes('503'))&&!(expectedCommentError&&message.text().includes('503')&&message.location().url.includes('/comments/'))&&!(options.checks==='canvas-board-preview-load'&&message.location().url.includes('/BoardPreview.tsx'))&&!(['svg-font-error','svg-font-cancel'].includes(options.checks)&&message.location().url.includes('/fonts/editors/'))&&!(options.checks==='svg-font-module'&&message.location().url.includes('/svg-font-image.ts'))&&!(options.checks==='canvas-vector-load'&&message.location().url.includes('/CanvasPenTool.tsx'))&&!(options.checks==='canvas-vector-edit-load'&&message.location().url.includes('/CanvasPointEditor.tsx'))) errors.push(message.text()) })
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
    if(denyCodeAccess&&(url.pathname.endsWith('/changes')||url.pathname.endsWith('/document'))){await route.fulfill({status:403,json:{error:'无权访问'}});return}
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
    if(denySpeakerRead&&url.pathname.endsWith('/document')){await route.fulfill({status:403,json:{error:'无权访问'}});return}
    let result = snapshot()
    if(options['speaker-case']==='preview-error'&&url.pathname.endsWith('/pages/page-3')){pageReads.push('page-3');if(speakerPreviewFailure){await route.fulfill({status:503,json:{error:'页面加载失败'}});return}canvasBodyLoaded=true;await route.fulfill({status:200,json:{page:document.pages['page-3']}});return}
    if(delayedPageId&&url.pathname.endsWith('/pages/'+delayedPageId)){pageReads.push(delayedPageId);await new Promise(resolve=>{releaseCanvasBody=resolve;notifyCanvasBody()});canvasBodyLoaded=true;await route.fulfill({status:200,json:{page:document.pages[delayedPageId]}});return}
    if(options.checks==='viewport-loading'&&url.pathname.includes('/pages/')){const id=url.pathname.split('/pages/')[1];pageReads.push(id);await route.fulfill({status:200,json:{page:document.pages[id]}});return}
    if (url.pathname.endsWith('/operations')) {
      const batch = request.postDataJSON()
      if(['notes-network','notes-denied','notes-write-denied'].includes(options['speaker-case'])){speakerSaveIds.push(batch.operationId);if(rejectSpeakerSave){if(options['speaker-case']!=='notes-network'){fixtureWrite=false;denySpeakerRead=options['speaker-case']==='notes-denied'}await route.fulfill({status:options['speaker-case']==='notes-network'?503:403,json:{error:'暂未保存'}});return}}
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
  const revealPresentationControls=async()=>{await page.mouse.move(10,10);await page.mouse.move(20,20)}
  const startSlides=async()=>{await page.getByLabel('放映',{exact:true}).click();await page.getByRole('menuitem',{name:'放映',exact:true}).click()}
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
    assert.equal(await page.evaluate(()=>document.compatMode),'CSS1Compat','隔离回归必须与产品和固定参考使用相同标准模式')
    if(options.checks==='canvas-empty')await page.locator('[data-native-artifact-editor]').waitFor();else await ready(1)
    if(options['canvas-theme']==='dark')await page.evaluate(()=>document.documentElement.classList.add('dark'))
    if(options.checks==='element-sizing'&&editorCase==='exports'){
      if(kind==='design'){
        await page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
        const section=page.locator('.native-element-sizing'),saved=()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200)
        const width=section.getByRole('textbox',{name:'宽度',exact:true});await width.fill('50%');let pending=saved();await width.press('Enter');await pending
        await section.getByLabel('添加尺寸属性',{exact:true}).click();await section.getByRole('menuitem',{name:'最大宽度',exact:true}).click();const max=section.getByRole('textbox',{name:'最大宽度',exact:true});await max.fill('900');pending=saved();await max.press('Enter');await pending
        await section.getByLabel('高度模式：固定',{exact:true}).click();pending=saved();await section.getByRole('menuitemradio',{name:'自适应',exact:true}).click();await pending
      }
      return await verifySizingExports({page,browser,kind,output,getDocument:()=>document,errors})
    }
    if(options.checks==='element-layout'){
      const original=structuredClone(document),nodeId='page-1-heading',node=page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`)
      if(options['sizing-zoom']){await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:options['sizing-zoom'],exact:true}).click();await scrollCanvasTo(document.pages['page-1'])}
      await node.click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const layout=page.locator('.native-element-layout')
      await layout.waitFor();assert.equal(await layout.count(),1,'画板元素布局区必须提供内边距和外边距')
      const property=editorCase.includes('margin')?'margin':'padding',label=property==='padding'?'内边距':'外边距',field=layout.getByRole('textbox',{name:label,exact:true}),saved=()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200)
      if(['locked','lock-draft'].includes(editorCase)){
        const dirty=editorCase==='lock-draft';if(dirty)await field.fill('21')
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId,patch:{locked:true}}],'peer-layout-lock')).document
        const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/document')&&response.status()===200);await page.evaluate(()=>window.__codeChanged());await refreshed;await page.waitForFunction(()=>document.querySelector('.native-element-layout [aria-label="内边距"]')?.readOnly===true)
        await field.press('ArrowUp');assert.equal(await field.inputValue(),dirty?'21':'0','锁定后的步进不得修改新值或既有草稿');assert.equal(receipts.length,0)
        if(dirty){await page.getByRole('button',{name:'关闭属性',exact:true}).click();const backup=page.getByRole('button',{name:'下载本地副本',exact:true});await backup.waitFor();const pending=page.waitForEvent('download');await backup.click();const recovery=JSON.parse(await readFile(await(await pending).path(),'utf8'));assert.ok(JSON.stringify(recovery).includes('21'))}
        assert.equal(document.pages['page-1'].nodes[nodeId].locked,true);assert.equal(document.pages['page-1'].nodes[nodeId].style.padding,original.pages['page-1'].nodes[nodeId].style.padding);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'中文元素锁定边距回归',mode:kind,case:editorCase,noWrites:true,draftRetained:dirty,consoleOrPageErrors:errors}
      }
      if(editorCase==='readonly'){assert.equal(await field.isEditable(),false);assert.equal(receipts.length,0);assert.deepEqual(document,original);assert.deepEqual(errors,[]);return{kind:'中文元素内外边距回归',mode:kind,case:editorCase,noWrites:true,consoleOrPageErrors:errors}}
      if(['conflict','permission'].includes(editorCase)){
        await field.fill('21');fixtureWrite=editorCase!=='permission'
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId,patch:{css:{padding:'30px'}}}],'peer-layout')).document
        const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/document')&&response.status()===200);await page.evaluate(()=>window.__codeChanged());await refreshed
        if(editorCase==='permission')await page.getByRole('button',{name:'关闭属性',exact:true}).click();else await field.press('Enter')
        const backup=page.getByRole('button',{name:'下载本地副本',exact:true});await backup.waitFor();const pending=page.waitForEvent('download');await backup.click();const recovery=JSON.parse(await readFile(await(await pending).path(),'utf8'))
        assert.ok(JSON.stringify(recovery).includes('21'));assert.equal(receipts.length,0);assert.equal(document.pages['page-1'].nodes[nodeId].css.padding,'30px');assert.deepEqual(errors,[])
        return{kind:'中文元素内外边距回归',mode:kind,case:editorCase,peerPreserved:true,draftRecoverable:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(editorCase==='invalid'){
        const raw='20px;position:fixed';await field.fill(raw);await field.press('Enter');await layout.getByRole('alert').waitFor();assert.equal(receipts.length,0)
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click();const recovery=JSON.parse(await readFile(await(await pending).path(),'utf8'));assert.ok(JSON.stringify(recovery).includes(raw));assert.deepEqual(errors,[])
        return{kind:'中文元素内外边距回归',mode:kind,case:editorCase,invalidDraftRecoverable:true,noWrites:true,consoleOrPageErrors:errors}
      }
      const expanded=editorCase.endsWith('-expand')||['padding-top','margin-left'].includes(editorCase)
      if(expanded){await layout.getByRole('button',{name:`分别设置${label}`,exact:true}).click();assert.equal(receipts.length,0,'展开四边不写入文档');for(const side of ['上','右','下','左'])await layout.getByRole('textbox',{name:`${side}${label}`,exact:true}).waitFor()}
      if(editorCase.endsWith('-step-down')){
        let pending;if(property==='margin')pending=saved();await field.press('ArrowDown');if(pending)await pending
        assert.equal(await field.inputValue(),property==='padding'?'0':'-1');if(property==='padding')assert.equal(receipts.length,0)
      }else if(!editorCase.endsWith('-expand')){
        const input=expanded?layout.getByRole('textbox',{name:`${editorCase==='padding-top'?'上':'左'}${label}`,exact:true}):field
        await input.fill(options['layout-value']??'20');assert.equal(receipts.length,0,'确认前保留本地草稿')
        if(editorCase==='save'){await input.press('Control+s');assert.equal(receipts.length,0);assert.equal(await input.evaluate(element=>element===document.activeElement),true)}
        if(editorCase==='cancel'){await input.press('Escape');assert.equal(receipts.length,0);assert.deepEqual(document,original)}
        else{let pending=saved();await input.press('Enter');await pending
          if(editorCase.startsWith('reset-')){pending=saved();await layout.getByRole('button',{name:`还原${label}`,exact:true}).click();await pending}
          if(editorCase==='history'){const edited=structuredClone(document.pages['page-1'].nodes[nodeId]);await page.locator('[data-native-artifact-editor]').focus();pending=saved();await page.keyboard.press('Control+z');await pending;assert.deepEqual(document.pages['page-1'].nodes[nodeId],original.pages['page-1'].nodes[nodeId]);pending=saved();await page.keyboard.press('Control+Shift+z');await pending;assert.deepEqual(document.pages['page-1'].nodes[nodeId],edited)}
        }
      }
      if(options['layout-resize']){
        await page.waitForFunction(nodeId=>{const element=document.querySelector(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`),selection=document.querySelector('.native-selection');if(!element||!selection)return false;const box=element.getBoundingClientRect(),chrome=selection.getBoundingClientRect();return Math.abs(box.width-chrome.width)<=1&&Math.abs(box.height-chrome.height)<=1},nodeId)
        const handle=page.locator(`.native-selection .native-handle-${options['layout-resize']}`),box=await handle.boundingBox(),pending=saved();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:6});await page.mouse.up();await pending
      }
      if(editorCase==='capture'){
        const captured=await node.evaluate(async(element,root)=>{
          const {captureWithBleed}=await import(`/@fs${root}/src/features/artifacts/native/export/capture.ts`),result=await captureWithBleed(element.closest('[data-page-id]'),element,[])
          const image=new Image();image.src=result.data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0)
          return{width:canvas.width,height:canvas.height,padding:result.padding,right:[...context.getImageData(canvas.width-1,canvas.height/2,1,1).data],bottom:[...context.getImageData(canvas.width/2,canvas.height-1,1,1).data],middle:[...context.getImageData(canvas.width/2,canvas.height/2,1,1).data]}
        },root);await writeFile(join(output,'content-box-capture.json'),JSON.stringify(captured,null,2));assert.equal(captured.right[3],0,'内容盒捕获必须保留右侧透明出血，不能重复叠加内边距');assert.equal(captured.bottom[3],0);assert.deepEqual(captured.middle,[237,53,33,255])
      }
      if(editorCase==='exports')return await verifySizingExports({page,browser,kind,output,getDocument:()=>document,errors,layout:true})
      const readGeometry=()=>node.evaluate(element=>{const style=getComputedStyle(element);return{layoutWidth:element.offsetWidth,layoutHeight:element.offsetHeight,...Object.fromEntries(['width','height','left','top','boxSizing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft'].map(key=>[key,style[key]]))}})
      const geometry=await readGeometry(),snapshot=structuredClone(document.pages['page-1'].nodes[nodeId])
      await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(20,200)
      const controls=await layout.locator('input,button,h3').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return{tag:element.tagName,label:element.getAttribute('aria-label'),text:element.tagName==='H3'?element.textContent:undefined,value:element.value,rect:element.getBoundingClientRect().toJSON(),color:style.color,fontSize:style.fontSize,lineHeight:style.lineHeight}}))
      await page.screenshot({path:join(output,`layout-${editorCase}.png`)});await page.reload();await ready(1);assert.deepEqual(document.pages['page-1'].nodes[nodeId],snapshot);assert.deepEqual(await readGeometry(),geometry)
      for(const id of original.pageOrder.filter(id=>id!=='page-1'))assert.deepEqual(document.pages[id],original.pages[id]);assert.deepEqual(errors,[])
      return{kind:'中文元素内外边距回归',mode:kind,case:editorCase,node:snapshot,geometry,controls,batches:receipts.length,savedAndReopened:true,otherPagesUnchanged:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='element-sizing'){
      const original=structuredClone(document),nodeId=`page-1-${options['sizing-node']==='group'?'root':options['sizing-node']??'heading'}`
      if(editorCase==='selection-scale'){
        assert.equal(kind,'design')
        const observations=[]
        for(const percent of ['50%','25%','20%','25%']){
          await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:percent==='20%'?'25%':percent,exact:true}).click()
          if(percent==='20%'){await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('ControlOrMeta+-')}
          await scrollCanvasTo(document.pages['page-1'])
          await page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`).click()
          const selection=page.locator('[data-page-id="page-1"] .native-selection');await selection.waitFor()
          const count=await selection.locator('.native-resize-handle,.native-rotate-handle').count()
          observations.push({percent,handles:count});assert.equal(count,percent==='20%'?0:9,'画板元素在25%以下保留选择轮廓并隐藏交互手柄')
        }
        assert.equal(receipts.length,0);assert.deepEqual(document,original);assert.deepEqual(errors,[])
        return{kind:'画板元素缩放手柄门槛',observations,noWrites:true,documentUnchanged:true,consoleOrPageErrors:errors,scope:'受控HTTP夹具，真实缩放、选择和快捷键；不是完整来源或性能验收'}
      }
      const sizingZoom=options['sizing-zoom']??(['width-hug-resize','width-hug-cancel','width-percent-click','width-important-click'].includes(editorCase)?'50%':undefined)
      if(sizingZoom){await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:sizingZoom,exact:true}).click();await scrollCanvasTo(document.pages['page-1'])}
      if(editorCase==='theme-fill')assert.equal(await page.locator(`[data-node-id="${nodeId}"] svg rect`).getAttribute('fill'),'#ff0000')
      await page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`).click()
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const section=page.locator('.native-element-sizing'),field=section.getByRole('textbox',{name:'宽度',exact:true})
      await field.waitFor()
      const saved=()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200)
      if(editorCase.startsWith('text-align-')){
        const group=page.getByRole('radiogroup',{name:'文本对齐',exact:true}),node=page.locator(`[data-node-id="${nodeId}"]`),before=structuredClone(document.pages['page-1'].nodes[nodeId]),labels={left:'文本左对齐',center:'文本居中',right:'文本右对齐',justify:'文本两端对齐'}
        assert.equal(await group.getByRole('radio').count(),4)
        if(editorCase.startsWith('text-align-logical-')){assert.equal(receipts.length,0);for(const radio of await group.getByRole('radio').all())assert.equal(await radio.getAttribute('aria-checked'),'false')}
        if(editorCase==='text-align-inherited'){assert.equal(await group.getByRole('radio',{name:labels.center,exact:true}).getAttribute('aria-checked'),'true');assert.equal(await node.evaluate(element=>getComputedStyle(element).textAlign),'center')}
        if(['text-align-readonly','text-align-locked','text-align-permission'].includes(editorCase)){
          let expected=original
          if(editorCase==='text-align-permission'){
            await group.getByRole('radio',{name:labels.left,exact:true}).focus();fixtureWrite=false
            document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{title:'权限变更后的页面'}}],'peer-text-alignment-access')).document;expected=structuredClone(document)
            const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/document')&&response.status()===200);await page.evaluate(()=>window.__codeChanged());await refreshed
          }
          await page.waitForFunction(()=>document.querySelector('[aria-label="文本左对齐"]')?.getAttribute('aria-disabled')==='true')
          for(const radio of await group.getByRole('radio').all())assert.equal(await radio.isDisabled(),true)
          await group.getByRole('radio',{name:labels.left,exact:true}).focus();await page.keyboard.press('ArrowRight')
          assert.equal(receipts.length,0);assert.deepEqual(document,expected);assert.deepEqual(errors,[])
          return{kind:'文本对齐正常禁用回归',case:editorCase,noWrites:true,documentUnchanged:editorCase!=='text-align-permission',peerChangePreserved:editorCase==='text-align-permission',consoleOrPageErrors:errors}
        }
        const choose=async value=>{const changed=saved();await group.getByRole('radio',{name:labels[value],exact:true}).click();await changed;assert.equal(await node.evaluate(element=>getComputedStyle(element).textAlign),value,'文本对齐必须更新实际优先声明，不能只改被CSS覆盖的类型化字段');assert.equal(await group.getByRole('radio',{name:labels[value],exact:true}).getAttribute('aria-checked'),'true')}
        if(editorCase==='text-align-all')for(const value of ['left','center','right','justify'])await choose(value)
        else if(editorCase==='text-align-keyboard'){
          await group.getByRole('radio',{name:labels.left,exact:true}).focus()
          for(const value of ['center','right','justify']){const changed=saved();await page.keyboard.press('ArrowRight');await changed;assert.equal(await node.evaluate(element=>getComputedStyle(element).textAlign),value)}
        }else await choose(Object.hasOwn(labels,editorCase.slice('text-align-'.length))?editorCase.slice('text-align-'.length):'right')
        let finalValue=editorCase==='text-align-all'||editorCase==='text-align-keyboard'?'justify':Object.hasOwn(labels,editorCase.slice('text-align-'.length))?editorCase.slice('text-align-'.length):'right'
        if(editorCase==='text-align-reset'||editorCase==='text-align-inherited'){
          const changed=saved();await page.getByLabel('还原文本对齐',{exact:true}).click();await changed
          assert.equal(document.pages['page-1'].nodes[nodeId].style.textAlign,undefined);assert.equal(document.pages['page-1'].nodes[nodeId].css?.['text-align'],undefined);finalValue=editorCase==='text-align-inherited'?'center':'left'
        }
        if(editorCase==='text-align-history'){
          await page.locator('[data-native-artifact-editor]').focus();let changed=saved();await page.keyboard.press('Control+z');await changed;assert.deepEqual(document.pages['page-1'].nodes[nodeId],before);assert.equal(await node.evaluate(element=>getComputedStyle(element).textAlign),'center')
          changed=saved();await page.keyboard.press('Control+Shift+z');await changed;assert.equal(await node.evaluate(element=>getComputedStyle(element).textAlign),'right')
        }
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
        const geometry=await group.evaluate(element=>{const style=getComputedStyle(element),thumb=element.querySelector('[data-native-alignment-thumb]'),thumbStyle=thumb&&getComputedStyle(thumb);return{group:element.getBoundingClientRect().toJSON(),background:style.backgroundColor,borderRadius:style.borderRadius,padding:style.padding,thumb:thumb&&{rect:thumb.getBoundingClientRect().toJSON(),background:thumbStyle.backgroundColor,borderRadius:thumbStyle.borderRadius,boxShadow:thumbStyle.boxShadow},radios:[...element.querySelectorAll('[role=radio]')].map(radio=>({label:radio.getAttribute('aria-label'),checked:radio.getAttribute('aria-checked'),rect:radio.getBoundingClientRect().toJSON()}))}})
        await page.screenshot({path:join(output,`${editorCase}.png`)})
        await page.reload();await ready(1);await page.locator(`[data-node-id="${nodeId}"]`).click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await group.waitFor()
        assert.equal(await group.getByRole('radio',{name:labels[finalValue],exact:true}).getAttribute('aria-checked'),'true');const computed=await node.evaluate(element=>getComputedStyle(element).textAlign);assert.equal(editorCase==='text-align-reset'&&computed==='start'?'left':computed,finalValue)
        for(const key of ['x','y','width','height','rotation','parentId'])assert.equal(document.pages['page-1'].nodes[nodeId][key],before[key],'文本单选和方向键不得移动或变换画布对象')
        assert.deepEqual(document.pages['page-2'],original.pages['page-2']);assert.deepEqual(document.pages['page-3'],original.pages['page-3']);assert.deepEqual(errors,[])
        return{kind:'中文文本对齐单选与声明回归',case:editorCase,beforeNode:before,savedNode:document.pages['page-1'].nodes[nodeId],geometry,computedAlignment:computed,selectedAlignment:finalValue,batches:receipts.length,savedAndReopened:true,otherPagesUnchanged:true,consoleOrPageErrors:errors}
      }
      if(options['align-position']){
        const label={static:'普通',relative:'相对',fixed:'固定',sticky:'粘性'}[options['align-position']]
        await section.getByLabel('位置：绝对',{exact:true}).click();const changed=saved();await section.getByRole('menuitemradio',{name:label,exact:true}).click();await changed
        const toolbar=page.getByRole('group',{name:'元素对齐',exact:true})
        for(const name of ['顶部对齐','垂直居中','底部对齐'])assert.equal(await toolbar.getByRole('button',{name,exact:true}).isEnabled(),options['align-position']==='fixed')
      }
      if(editorCase==='readonly'){assert.equal(await field.isEditable(),false);assert.equal(receipts.length,0);assert.deepEqual(document,original);assert.deepEqual(errors,[]);return{kind:'中文元素尺寸回归',case:editorCase,noWrites:true,consoleOrPageErrors:errors}}
      if(['conflict','permission'].includes(editorCase)){
        await field.fill('800');fixtureWrite=editorCase!=='permission'
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId,patch:{css:{width:'50%'}}}],'peer-sizing')).document
        const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/document')&&response.status()===200);await page.evaluate(()=>window.__codeChanged());await refreshed
        if(editorCase==='permission')await page.getByRole('button',{name:'关闭属性',exact:true}).click();else await field.press('Enter')
        const backup=page.getByRole('button',{name:'下载本地副本',exact:true});await backup.waitFor();const pending=page.waitForEvent('download');await backup.click();const recovery=JSON.parse(await readFile(await(await pending).path(),'utf8'))
        assert.ok(JSON.stringify(recovery).includes('800'));assert.equal(receipts.length,0);assert.equal(document.pages['page-1'].nodes[nodeId].css.width,'50%');assert.deepEqual(errors,[])
        return{kind:'中文元素尺寸回归',case:editorCase,peerPreserved:true,draftRecoverable:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(editorCase==='invalid'){
        await field.fill('800px;position:fixed');await field.press('Enter');await section.getByRole('alert').waitFor();assert.equal(receipts.length,0)
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click();const recovery=JSON.parse(await readFile(await(await pending).path(),'utf8'));assert.ok(JSON.stringify(recovery).includes('800px;position:fixed'));assert.deepEqual(errors,[])
        return{kind:'中文元素尺寸回归',case:editorCase,invalidDraftRecoverable:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(editorCase.endsWith('-add')){
        const property=editorCase.slice(0,-4),label={'min-width':'最小宽度','max-width':'最大宽度','min-height':'最小高度','max-height':'最大高度',right:'右侧',bottom:'底部'}[property]
        await section.getByLabel('添加尺寸属性',{exact:true}).click();await section.getByRole('menuitem',{name:label,exact:true}).click();const input=section.getByRole('textbox',{name:label,exact:true});await input.waitFor()
        const expected=property.startsWith('min-')?'0':property==='right'?'704':property==='bottom'?'964':'';assert.equal(await input.inputValue(),expected);assert.equal(receipts.length,0);assert.deepEqual(document,original);assert.deepEqual(errors,[])
        return{kind:'新增尺寸属性行不写文档',case:editorCase,value:expected,noWrites:true,documentUnchanged:true,consoleOrPageErrors:errors}
      }
      let pending
      if(['width','auto','percent','escape','blank','save','history','width-percent-click','width-important-click','theme-fill'].includes(editorCase)){
        await field.fill(editorCase==='auto'?'auto':['percent','width-percent-click','theme-fill'].includes(editorCase)?'50%':editorCase==='width-important-click'?'50% !important':editorCase==='blank'?'':'800')
        if(editorCase==='save'){await field.press('Control+s');await page.waitForTimeout(300);assert.equal(receipts.length,0);assert.equal(await field.inputValue(),'800')}
        if(editorCase==='escape'){await field.press('Escape');assert.equal(receipts.length,0);assert.equal(await field.inputValue(),'1152px')}
        else{pending=saved();await field.press('Enter');await pending}
      }else if(editorCase.endsWith('-hug')||editorCase.endsWith('-fill')||['width-hug-resize','width-hug-cancel'].includes(editorCase)){
        const label=editorCase.startsWith('width')?'宽度':'高度',mode=editorCase.includes('-hug')?'自适应':'填充'
        await section.getByLabel(label+'模式：固定',{exact:true}).click();pending=saved();await section.getByRole('menuitemradio',{name:mode,exact:true}).click();await pending
      }else if(editorCase.startsWith('align-')){
        const toolbar=page.getByRole('group',{name:'元素对齐',exact:true});await toolbar.waitFor()
        const beforeAlignment=structuredClone(document.pages['page-1'].nodes[nodeId])
        for(const direction of editorCase.slice(6).split('-')){
          const label={left:'左对齐',center:'水平居中',right:'右对齐',top:'顶部对齐',middle:'垂直居中',bottom:'底部对齐'}[direction]
          pending=saved();await toolbar.getByRole('button',{name:label,exact:true}).click();await pending
        }
        if(options['align-nudge']){
          const target=page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`),before=structuredClone(document.pages['page-1'].nodes[nodeId])
          await page.locator('[data-native-artifact-editor]').focus()
          const centered=editorCase==='align-center',key=options['align-nudge']
          pending=saved();await page.keyboard.press(key);await pending
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
          const after=structuredClone(document.pages['page-1'].nodes[nodeId]);if(centered){assert.equal(after.css.right,'0px');assert.equal(after.x,key==='Shift+ArrowRight'?10:1)}else{assert.equal(after.css.left,'auto');assert.equal(after.css.right,key==='Shift+ArrowRight'?'-10px':'-1px')}
          await writeFile(join(output,'alignment-nudge.json'),JSON.stringify({before,after},null,2));await target.waitFor()
        }
        if(options['after-width']){await field.fill(options['after-width']);pending=saved();await field.press('Enter');await pending}
        if(options['after-height']){const height=section.getByRole('textbox',{name:'高度',exact:true});await height.fill(options['after-height']);pending=saved();await height.press('Enter');await pending}
        if(!options['align-position']||options['align-position']==='fixed'){
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
          const direction=editorCase.split('-').at(-1),horizontal=['left','center','right'].includes(direction)
          assert.equal(await section.getByRole('textbox',{name:horizontal?'水平偏移':'垂直偏移',exact:true}).inputValue(),direction==='right'||direction==='bottom'?'auto':options['align-nudge']&&horizontal?(options['align-nudge'].startsWith('Shift+')?'10':'1'):'0','偏移输入显示作者声明，而非自动边距后的绘制坐标')
          assert.equal(await section.getByRole('textbox',{name:horizontal?'右侧':'底部',exact:true}).count(),direction==='left'||direction==='top'?0:1,'自动相反锚点不展开附加属性行')
        }
        if(options['align-drag']){
          const element=page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`),before=await element.boundingBox(),delta=Number(options['align-drag'])
          const locked=editorCase.split('-').at(-1)==='center',cancel=options['align-cancel']==='true',writes=receipts.length,beforeDrag=structuredClone(document.pages['page-1'].nodes[nodeId])
          if(!locked&&!cancel)pending=saved()
          await page.mouse.move(before.x+8,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+8+delta,before.y+before.height/2,{steps:6});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(!locked&&!cancel)await pending
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
          const after=await element.boundingBox();await writeFile(join(output,'alignment-drag.json'),JSON.stringify({before,after,delta,node:document.pages['page-1'].nodes[nodeId]},null,2))
          assert.ok(Math.abs(after.x-before.x-(locked||cancel?0:delta))<=1,'双侧锚点锁定对应拖动方向，其余按实际绘制位置移动')
          if(locked||cancel){assert.equal(receipts.length,writes,'锁定轴或取消拖动没有文档写入');assert.deepEqual(document.pages['page-1'].nodes[nodeId],beforeDrag)}
        }
        if(options['align-resize']){
          const handle=page.locator(`.native-selection .native-handle-${options['align-resize']}`),box=await handle.boundingBox()
          const cancel=options['align-cancel']==='true',writes=receipts.length,beforeResize=structuredClone(document.pages['page-1'].nodes[nodeId]);if(!cancel)pending=saved();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:6});if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(!cancel)await pending;else{assert.equal(receipts.length,writes);assert.deepEqual(document.pages['page-1'].nodes[nodeId],beforeResize)}
          await writeFile(join(output,'alignment-resize.json'),JSON.stringify(document.pages['page-1'].nodes[nodeId],null,2))
          if(editorCase==='align-center'&&options['align-resize']==='e')assert.equal(document.pages['page-1'].nodes[nodeId].x,0,'东侧缩放不把自动边距后的绘制坐标写入左侧声明')
        }
        if(options['align-history']==='true'){
          const aligned=structuredClone(document.pages['page-1'].nodes[nodeId]);await page.locator('[data-native-artifact-editor]').focus();pending=saved();await page.keyboard.press('Control+z');await pending;assert.deepEqual(document.pages['page-1'].nodes[nodeId],beforeAlignment);pending=saved();await page.keyboard.press('Control+Shift+z');await pending;assert.deepEqual(document.pages['page-1'].nodes[nodeId],aligned)
        }
      }else if(editorCase.startsWith('position-')){
        const label={'position-inline':'普通','position-relative':'相对','position-fixed':'固定','position-sticky':'粘性'}[editorCase]
        await section.getByLabel('位置：绝对',{exact:true}).click();pending=saved();await section.getByRole('menuitemradio',{name:label,exact:true}).click();await pending
      }else if(['min-width','max-width','min-height','max-height','right','bottom'].includes(editorCase)){
        const label={'min-width':'最小宽度','max-width':'最大宽度','min-height':'最小高度','max-height':'最大高度',right:'右侧',bottom:'底部'}[editorCase]
        await section.getByLabel('添加尺寸属性',{exact:true}).click();await section.getByRole('menuitem',{name:label,exact:true}).click();assert.equal(receipts.length,0,'添加属性行只展开控件，不改文档')
        const input=section.getByRole('textbox',{name:label,exact:true});await input.fill(options['sizing-value']??(editorCase.includes('max')?'900':'20'));pending=saved();await input.press('Enter');await pending
      }else if(editorCase==='offset'){
        for(const [label,value]of [['水平偏移','120'],['垂直偏移','80']]){const input=section.getByRole('textbox',{name:label,exact:true});await input.fill(value);pending=saved();await input.press('Enter');await pending}
      }else if(editorCase==='reset-width'){pending=saved();await section.getByRole('button',{name:'还原宽度',exact:true}).click();await pending}
      if(['width-hug-resize','width-hug-cancel','width-percent-click','width-important-click'].includes(editorCase)){
        const node=page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]');await node.click({position:{x:8,y:8}})
        const expected=editorCase.includes('hug')?'auto':'50%'
        assert.equal(await node.evaluate(element=>element.style.width),expected,'点击不应覆盖已保存的尺寸声明')
        assert.equal(await node.evaluate(element=>element.style.getPropertyPriority('width')),editorCase==='width-important-click'?'important':'')
        const before=await node.boundingBox(),paper=await page.locator('[data-artboard-id="page-1"]').boundingBox(),scale=paper.width/document.pages['page-1'].width
        const handle=page.locator('.native-selection .native-handle-e');await handle.waitFor();const box=await handle.boundingBox()
        if(editorCase==='width-hug-resize')pending=saved()
        const writes=receipts.length
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2,{steps:6})
        if(editorCase!=='width-hug-resize')await page.keyboard.press('Escape')
        await page.mouse.up()
        if(editorCase==='width-hug-resize'){
        await pending
        const resized=document.pages['page-1'].nodes[nodeId];await writeFile(join(output,'resize-observation.json'),JSON.stringify({before,paper,scale,handle:box,resized,after:await node.boundingBox()},null,2));assert.ok(Math.abs(resized.width-(before.width+20)/scale)<=1,'自动宽度缩放应从实际绘制边缘开始');assert.equal(resized.implicitWidth,undefined)
        await page.locator('[data-native-artifact-editor]').focus();pending=saved();await page.keyboard.press('Control+z');await pending;assert.equal(document.pages['page-1'].nodes[nodeId].implicitWidth,true)
        }else{
          assert.equal(receipts.length,writes,'取消缩放不写入文档')
          assert.equal(await node.evaluate(element=>element.style.width),expected)
          assert.equal(await node.evaluate(element=>element.style.getPropertyPriority('width')),editorCase==='width-important-click'?'important':'')
        }
      }
      if(editorCase==='history'){
        pending=saved();await field.press('Control+z');await pending;assert.equal(document.pages['page-1'].nodes[nodeId].width,1152)
        pending=saved();await field.press('Control+Shift+z');await pending;assert.equal(document.pages['page-1'].nodes[nodeId].width,800)
      }
      await page.evaluate(()=>document.activeElement?.blur())
      if(editorCase==='auto')assert.equal(await field.inputValue(),'auto')
      const snapshot=structuredClone(document.pages['page-1'].nodes[nodeId])
      if(editorCase==='theme-fill')assert.equal(await page.locator(`[data-node-id="${nodeId}"]`).evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 0, 0)','CSS矩形必须使用已解析主题填充色')
      const geometry=await page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`).evaluate(element=>{const style=getComputedStyle(element);return{width:style.width,height:style.height,position:style.position,left:style.left,top:style.top,minWidth:style.minWidth,maxWidth:style.maxWidth,minHeight:style.minHeight,maxHeight:style.maxHeight,right:style.right,bottom:style.bottom}})
      if(options['sizing-node']==='shape'&&!options['sizing-stroke']&&editorCase==='width-hug')assert.equal(geometry.width,'0px','空矩形自动宽度不得被SVG子元素撑开')
      if(options['sizing-node']==='shape'&&!options['sizing-stroke']&&editorCase==='height-hug')assert.equal(geometry.height,'0px','空矩形自动高度不得保留SVG行盒')
      const controls=await section.locator('input,summary').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return{label:element.getAttribute('aria-label'),value:element.value,rect:element.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,borderRadius:style.borderRadius,color:style.color,background:style.backgroundColor}}))
      if(options['align-state']){
        const target=page.getByRole('group',{name:'元素对齐',exact:true}).getByRole('button',{name:'左对齐',exact:true})
        if(options['align-state']==='hover')await target.hover()
        else if(options['align-state']==='focus'){
          await field.focus()
          for(let index=0;index<20&&!await target.evaluate(element=>element===document.activeElement);index++)await page.keyboard.press('Shift+Tab')
          assert.equal(await target.evaluate(element=>element===document.activeElement),true)
        }
      }
      if(options['align-key']){
        const writes=receipts.length,before=JSON.stringify(document)
        await page.keyboard.press(options['align-key']);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
        assert.equal(await page.getByRole('group',{name:'元素对齐',exact:true}).getByRole('button',{name:'左对齐',exact:true}).evaluate(element=>element===document.activeElement),true)
        assert.equal(receipts.length,writes);assert.equal(JSON.stringify(document),before)
      }
      if(options['align-state'])await page.waitForTimeout(250)
      const alignmentControls=await page.getByRole('group',{name:'元素对齐',exact:true}).getByRole('button').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return{label:element.getAttribute('aria-label'),disabled:element.disabled,rect:element.getBoundingClientRect().toJSON(),color:style.color,background:style.backgroundColor,opacity:style.opacity,outline:style.outline,boxShadow:style.boxShadow,borderRadius:style.borderRadius,iconRect:element.querySelector('svg')?.getBoundingClientRect().toJSON()}}))
      for(const id of original.pageOrder.filter(id=>id!=='page-1'))assert.deepEqual(document.pages[id],original.pages[id])
      await page.screenshot({path:join(output,`sizing-${editorCase}.png`)})
      await page.reload();await ready(1);assert.deepEqual(document.pages['page-1'].nodes[nodeId],snapshot)
      const reopened=await page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`).evaluate(element=>{const style=getComputedStyle(element);return{width:style.width,height:style.height,position:style.position,left:style.left,top:style.top,minWidth:style.minWidth,maxWidth:style.maxWidth,minHeight:style.minHeight,maxHeight:style.maxHeight,right:style.right,bottom:style.bottom}})
      assert.deepEqual(reopened,geometry);assert.deepEqual(errors,[])
      if(editorCase==='theme-fill')assert.equal(await page.locator(`[data-node-id="${nodeId}"]`).evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(255, 0, 0)','重开后仍保留主题填充色')
      return{kind:'中文元素尺寸回归',mode:kind,case:editorCase,node:snapshot,geometry,controls,alignmentControls,batches:receipts.length,savedAndReopened:true,otherPagesUnchanged:true,consoleOrPageErrors:errors}
    }
  if(options.checks==='element-link'&&['nested-export','same-node'].includes(editorCase)){
      const same=editorCase==='same-node',group=page.locator(`[data-page-id="page-1"] [data-node-id="page-1-${same?'heading':'root'}"]`);await group.click();await page.getByRole('button',{name:'显示属性',exact:true}).click();const field=page.getByRole('textbox',{name:'链接目标',exact:true});await field.fill('https://parent.test/');const saved=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/operations')&&r.status()===200);await field.press('Enter');await saved
      const native=await group.evaluate(element=>({childCount:element.querySelectorAll('[data-node-id]').length,links:[...element.querySelectorAll('a[href]')].map(e=>e.getAttribute('href')),frame:element.getBoundingClientRect().toJSON()}));await page.getByLabel('导出格式',{exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'网页',exact:true}).click();const downloaded=await pending;const html=await readFile(await downloaded.path(),'utf8');await writeFile(join(output,'nested.html'),html);const offline=await browser.newPage({viewport:{width:1920,height:1200}});await offline.setContent(html);const parsed=await offline.evaluate(()=>({groups:[...document.querySelectorAll('[data-node-id="page-1-root"]')].map(e=>({tag:e.tagName,childCount:e.querySelectorAll('[data-node-id]').length,frame:e.getBoundingClientRect().toJSON()})),heading:[...document.querySelectorAll('[data-node-id="page-1-heading"]')].map(e=>({tag:e.tagName,parent:e.parentElement?.dataset.nodeId,closestGroup:!!e.closest('[data-node-id="page-1-root"]'),frame:e.getBoundingClientRect().toJSON()})),links:[...document.querySelectorAll('a[href]')].map(e=>({href:e.getAttribute('href'),node:e.dataset.nodeId,rect:e.getBoundingClientRect().toJSON()}))}));await offline.screenshot({path:join(output,'nested-offline.png')});const hits=await offline.evaluate(()=>{const section=document.querySelector('.artifact-export-page').getBoundingClientRect(),child=document.querySelector('[data-node-id="page-1-heading"] a[href="https://child.test/"]'),rect=child.getBoundingClientRect(),heading=document.querySelector('[data-node-id="page-1-heading"]').getBoundingClientRect(),same=document.querySelector('[data-node-id="page-1-heading"] .artifact-export-element-link');return{child:document.elementFromPoint(rect.left+2,rect.top+rect.height/2)?.closest('a[href]')?.getAttribute('href'),parent:document.elementFromPoint(same?heading.left+2:section.left+1000,same?heading.top+heading.height/2:section.top+900)?.closest('a[href]')?.getAttribute('href')}});const offlineClicks=await verifyWholeAndInlineClicks(offline);await offline.close();assert.equal(parsed.groups.length,1);assert.equal(parsed.groups[0].childCount,3);assert.equal(parsed.heading[0].closestGroup,true);assert.equal(native.childCount,same?0:3);assert.deepEqual(hits,{child:'https://child.test/',parent:'https://parent.test/'});const exports=[];for(const [format,label]of [['pdf','便携文档'],['pptx','演示文稿']]){await page.getByLabel('导出格式',{exact:true}).click();const download=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const bytes=await readFile(await(await download).path()),path=join(output,'nested.'+format);await writeFile(path,bytes);if(format==='pdf'){const urls=execFileSync('pdfinfo',['-url',path],{encoding:'utf8'});execFileSync('pdftoppm',['-f','1','-l','1','-singlefile','-scale-to','1000','-png',path,join(output,'nested-pdf-page')]);assert.ok(urls.includes('child.test')&&urls.includes('parent.test'));exports.push({format,urls,childUrlPresent:true})}else{const{default:JSZip}=await import('jszip');const zip=await JSZip.loadAsync(bytes),rels=await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'),xml=await zip.file('ppt/slides/slide1.xml').async('string'),presentation=await zip.file('ppt/presentation.xml').async('string');await writeFile(join(output,'slide1.xml'),xml);await writeFile(join(output,'slide1.xml.rels'),rels);const relation=rels.match(/<Relationship[^>]*Target="https:\/\/child.test\/"[^>]*\/>/),id=relation?.[0].match(/Id="([^"]+)"/)?.[1],shape=id?[...xml.matchAll(/<p:sp>.*?<\/p:sp>/g)].map(x=>x[0]).find(s=>s.includes('r:id="'+id+'"')):null;assert.ok(id&&shape);const cy=Number(presentation.match(/<p:sldSz[^>]*cy="(\d+)"/)?.[1]),offset=Number(shape.match(/<a:off[^>]*y="(\d+)"/)?.[1]);assert.ok(offset>=0&&offset<cy,'子链接命中区必须留在幻灯片内');assert.ok(rels.includes('https://parent.test/'));exports.push({format,childRelationship:id,childOffsetY:offset,slideHeight:cy})}}await page.getByLabel('全窗口查看画板 Page 1',{exact:true}).click();await page.getByRole('region',{name:'画板全窗口预览',exact:true}).locator('a[href="https://child.test/"]').waitFor();const nativeClicks=await verifyWholeAndInlineClicks(page,'[aria-label="画板全窗口预览"]');await page.screenshot({path:join(output,'nested-native-preview.png')});assert.deepEqual(errors,[]);return{kind:'组合及内联链接导出解析',case:editorCase,native,parsed,hits,offlineClicks,nativeClicks,exports,consoleOrPageErrors:errors}
    }
    if(options.checks==='element-link'){
      const original=structuredClone(document),nodeId=editorCase==='image'?'page-1-image':editorCase==='group'?'page-1-root':'page-1-heading'
      await page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`).click()
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const beforeGroup=editorCase==='group'?{rect:await page.locator('[data-node-id="page-1-root"]').boundingBox(),color:await page.locator('[data-node-id="page-1-heading"]').evaluate(element=>getComputedStyle(element).color)}:null
      const field=page.getByRole('textbox',{name:'链接目标',exact:true});if(kind==='design')await field.waitFor();else assert.equal(await field.count(),0,'链接目标属性区按原版仅出现在Design')
      if(editorCase==='readonly'){assert.equal(await field.isEditable(),false);assert.equal(receipts.length,0);assert.deepEqual(document,original);return{kind:'原生元素链接回归',mode:kind,case:editorCase,noWrites:true,consoleOrPageErrors:errors}}
      const url=({relative:'example.test','relative-edit':'example.test',mail:'mailto:hello@example.test',tel:'tel:+861234567890',anchor:'#section'})[editorCase]??'https://example.test/中文'
      const saved=()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200)
      if(editorCase?.startsWith('mixed-'))assert.equal(await field.getAttribute('placeholder'),'混合')
      if(editorCase==='mixed-cancel'){await field.dispatchEvent('compositionstart');await field.dispatchEvent('compositionend',{data:''});await field.press('Enter');await page.waitForTimeout(250);assert.equal(receipts.length,0,'取消混合目标的组词不得清除原链接');assert.deepEqual(document,original);assert.deepEqual(errors,[]);return{kind:'原生元素链接回归',mode:kind,case:editorCase,mixedValue:true,cancelPreservesOriginalLinks:true,syntheticComposition:true,noWrites:true,consoleOrPageErrors:errors}}
      if(editorCase==='invalid'){
        const raw='javascript:window.__linkExecuted=true';await field.fill(raw);await field.press('Enter');await page.getByRole('alert').filter({hasText:'链接格式无效'}).waitFor();assert.equal(receipts.length,0);assert.deepEqual(document,original)
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();const backup=page.getByRole('button',{name:'下载本地副本',exact:true});await backup.waitFor();let downloading=page.waitForEvent('download');await backup.click();const recovery=JSON.parse(await readFile(await(await downloading).path(),'utf8'));assert.ok(JSON.stringify(recovery).includes(raw));assert.equal(await page.evaluate(()=>window.__linkExecuted),undefined)
        downloading=page.waitForEvent('download');await page.getByRole('button',{name:'保留副本并重新载入',exact:true}).click();await downloading;await ready(1);await page.getByRole('button',{name:'显示属性',exact:true}).click();await field.waitFor();assert.equal(await field.inputValue(),'');assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'原生元素链接回归',mode:kind,case:editorCase,rawDraftDownloaded:true,recoveryClearsDraft:true,noExecution:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(['conflict','permission'].includes(editorCase)){
        await field.fill(url)
        fixtureWrite=editorCase!=='permission'
        const remote=editorCase==='conflict'?{attributes:{href:'https://peer.test/'}}:{text:'权限更新的标题'}
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId,patch:remote}],'remote-link-change')).document
        const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/document')&&response.status()===200);await page.evaluate(()=>window.__codeChanged());await refreshed
        if(editorCase==='permission')await page.getByRole('button',{name:'关闭属性',exact:true}).click();else await field.press('Enter')
        const backup=page.getByRole('button',{name:'下载本地副本',exact:true});await backup.waitFor();const downloading=page.waitForEvent('download');await backup.click();const recovery=JSON.parse(await readFile(await(await downloading).path(),'utf8'))
        assert.ok(JSON.stringify(recovery).includes(url));assert.equal(receipts.length,0);if(editorCase==='conflict')assert.equal(document.pages['page-1'].nodes[nodeId].attributes.href,'https://peer.test/');assert.deepEqual(errors,[])
        return{kind:'原生元素链接回归',mode:kind,case:editorCase,localLinkRecoverable:true,peerRetained:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(editorCase==='independent'){
        await field.fill(url);document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId,patch:{style:{color:'#123456'}}}],'remote-independent-color')).document
        const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/document')&&response.status()===200);await page.evaluate(()=>window.__codeChanged());await refreshed
      }
      if(kind==='design'){const pending=saved();await field.fill(url);if(editorCase==='save'){await field.press('Control+s');await page.waitForTimeout(300);assert.equal(receipts.length,0);assert.equal(await field.inputValue(),url)}await field.press('Enter');await pending;if(editorCase==='unchanged'){await field.fill(url);await field.press('Enter');await page.waitForTimeout(200);assert.equal(receipts.length,1)}}
      const links=page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"] a[href],[data-page-id="page-1"] [data-node-id="${nodeId}"][href]`)
      const link=links.first();await link.waitFor();assert.ok((await links.evaluateAll(elements=>elements.map(element=>element.getAttribute('href')))).every(href=>href===url))
      if(!['image','group'].includes(editorCase))assert.equal(await link.evaluate(element=>getComputedStyle(element).color),editorCase==='independent'?'rgb(18, 52, 86)':'rgb(24, 51, 43)','链接应保留原文字颜色')
      if(beforeGroup){const after=await page.locator('[data-node-id="page-1-root"]').boundingBox();for(const key of ['width','height'])assert.ok(Math.abs(after[key]-beforeGroup.rect[key])<=1,'组合链接不能改变原来的布局尺寸');assert.equal(await page.locator('[data-node-id="page-1-heading"]').evaluate(element=>getComputedStyle(element).color),beforeGroup.color,'组合链接应保留继承的文字颜色')}
      const location=page.url();if(['image','group'].includes(editorCase))await page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`).click();else await link.click();assert.equal(page.url(),location,'编辑中点击链接只能选择对象')
      if(editorCase==='clear'){
        const pending=saved();await field.fill('');await field.press('Enter');await pending;await link.waitFor({state:'detached'});assert.equal(await link.count(),0)
      }
      if(editorCase==='history'){
        await page.locator('[data-native-artifact-editor]').focus();let pending=saved();await page.keyboard.press('Control+z');await pending;await link.waitFor({state:'detached'});assert.equal(await link.count(),0)
        pending=saved();await page.keyboard.press('Control+Shift+z');await pending;await link.waitFor()
      }
      if(editorCase==='edit'||editorCase==='relative-edit'){
        await page.locator(`[data-page-id="page-1"] [data-node-id="${nodeId}"]`).dblclick();await page.locator('[data-native-text-editor]').waitFor();await page.waitForFunction(()=>document.activeElement?.closest('[data-native-text-editor]'));await page.keyboard.press('End');await page.keyboard.type('内容');const pending=saved();await page.keyboard.press('Escape');await pending;await writeFile(join(output,`${kind}-link-edit-state.json`),JSON.stringify({node:document.pages['page-1'].nodes[nodeId],operations:receipts.map(receipt=>receipt.operations),focus:await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))},null,2));assert.equal(document.pages['page-1'].nodes[nodeId].text,original.pages['page-1'].nodes[nodeId].text+'内容');assert.equal(await link.getAttribute('href'),url);assert.equal(await link.textContent(),original.pages['page-1'].nodes[nodeId].text+'内容','新增文字应留在原版链接内')
      }
      if(kind==='design'&&['http','relative','save'].includes(editorCase))await field.focus()
      const fieldStyle=kind==='design'?await field.evaluate(element=>{const style=getComputedStyle(element);return{rect:element.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,border:style.border,borderRadius:style.borderRadius,shadow:style.boxShadow,outline:style.outline,color:style.color,background:style.backgroundColor}}):null
      if(kind==='design'&&['http','relative','save'].includes(editorCase))await page.screenshot({path:join(output,`link-${editorCase}.png`)})
      const exported=[]
      if(editorCase==='exports'){
        const {default:JSZip}=await import('jszip')
        for(const [format,label]of [['html','网页'],['pdf','便携文档'],['pptx','演示文稿'],['svg',`当前${kind==='design'?'画板':'页面'} · 矢量图`],['png',`当前${kind==='design'?'画板':'页面'} · 透明位图`],['jpeg',`当前${kind==='design'?'画板':'页面'} · 压缩位图`]]){
          await page.getByLabel('导出格式',{exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const downloaded=await pending,bytes=await readFile(await downloaded.path()),path=join(output,`${kind}-link.${format}`);await writeFile(path,bytes);const result={format,bytes:bytes.length}
          assert.ok(bytes.length>100)
          if(format==='html'){assert.ok(bytes.toString('utf8').includes(url));assert.match(bytes.toString('utf8'),/<a[^>]*style="color: inherit"/)}
          if(format==='pdf'){assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const urls=execFileSync('pdfinfo',['-url',path],{encoding:'utf8'});assert.ok(decodeURI(urls).includes(url));result.hasUriAnnotation=true}
          if(format==='pptx'){const zip=await JSZip.loadAsync(bytes),rels=await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string'),xml=await zip.file('ppt/slides/slide1.xml').async('string');assert.ok(decodeURI(rels).includes(url));assert.match(xml,/<a:hlinkClick/);result.hasHyperlinkRelationship=true}
          if(format==='svg')assert.ok(bytes.toString('utf8').includes(url))
          if(['png','jpeg','svg'].includes(format)){
            result.image=await page.evaluate(async({base64,type})=>{const image=new Image();image.src=`data:${type};base64,${base64}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const scale=image.naturalWidth/1920,data=context.getImageData(64*scale,40*scale,400*scale,80*scale).data;let inheritedInk=0,defaultBlue=0;for(let i=0;i<data.length;i+=4){if(Math.abs(data[i]-24)<20&&Math.abs(data[i+1]-51)<20&&Math.abs(data[i+2]-43)<20)inheritedInk++;if(data[i]<25&&data[i+1]<25&&data[i+2]>200)defaultBlue++}return{width:image.naturalWidth,height:image.naturalHeight,inheritedInk,defaultBlue}},{base64:bytes.toString('base64'),type:format==='svg'?'image/svg+xml':format==='jpeg'?'image/jpeg':'image/png'})
            assert.ok(result.image.inheritedInk>100,'实际图片需保留原文字颜色');assert.equal(result.image.defaultBlue,0,'实际图片不能变成默认蓝色链接')
          }
          exported.push(result)
        }
      }
      for(const id of original.pageOrder.slice(1))assert.deepEqual(document.pages[id],original.pages[id])
      await page.reload();await ready(1);if(editorCase==='clear')assert.equal(await link.count(),0);else{await link.waitFor();assert.equal(await link.getAttribute('href'),url)}
      assert.deepEqual(errors,[])
      return{kind:'原生元素链接回归',mode:kind,case:editorCase,savedAndReopened:true,otherPagesUnchanged:true,fieldStyle,exported,consoleOrPageErrors:errors}
    }
    if(options.checks==='board-title'&&['narrow-long','wide-long'].includes(editorCase)){
      const label=page.locator('[data-artboard-id="page-1"] .native-board-label'),read=()=>label.evaluate(element=>{const rect=element.getBoundingClientRect(),style=getComputedStyle(element);return{rect:rect.toJSON(),minWidth:style.minWidth,color:style.color,radius:style.borderRadius,opacity:style.opacity,hitCenter:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)?.closest('button')===element}})
      const before=await read();assert.equal(before.hitCenter,true,'窄画板的标题中心必须仍可命中');if(editorCase==='narrow-long')assert.equal(before.opacity,'0');await label.focus();const focused=await read();assert.equal(focused.opacity,'1');await label.evaluate(element=>element.blur())
      await page.mouse.click(before.rect.x+2,before.rect.y+before.rect.height/2);const selected=await read();assert.equal(selected.color,options['canvas-theme']==='dark'?'rgb(106, 171, 241)':'rgb(23, 87, 172)')
      await page.mouse.dblclick(before.rect.x+before.rect.width/2,before.rect.y+before.rect.height/2)
      const input=page.getByRole('textbox',{name:'画板名称',exact:true});await input.waitFor();assert.equal(await input.inputValue(),document.pages['page-1'].title);const editing=await input.boundingBox()
      await page.screenshot({path:join(output,`board-title-${editorCase}.png`)});await input.press('Escape');assert.equal(receipts.length,0);assert.deepEqual(errors,[])
      return{kind:'窄画板长标题命中与原位改名',case:editorCase,before,focused,selected,editing,focusProbe:'程序化CSS焦点检查，不代表Tab全流程',trustedCenterDoubleClick:true,renameOpened:true,cancelPreservesOriginal:true,noWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='board-title'){
      assert.equal(kind,'design')
      const original=structuredClone(document),label=page.locator('[data-artboard-id="page-1"] .native-board-label')
      const saved=()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200)
      await label.dblclick()
      const input=page.getByRole('textbox',{name:'画板名称',exact:true})
      if(editorCase==='readonly'){
        assert.equal(await input.count(),0);assert.equal(receipts.length,0);assert.deepEqual(document,original)
        return{kind:'isolated-board-title',case:editorCase,readonlyHasNoRename:true,consoleOrPageErrors:errors}
      }
      await input.waitFor();assert.equal(await input.inputValue(),original.pages['page-1'].title)
      assert.deepEqual(await input.evaluate(element=>[element.selectionStart,element.selectionEnd]),[0,original.pages['page-1'].title.length])
      const geometry=await input.evaluate(element=>{const style=getComputedStyle(element);return{rect:element.getBoundingClientRect().toJSON(),fontFamily:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,borderRadius:style.borderRadius,color:style.color,background:style.backgroundColor,shadow:style.boxShadow}})
      assert.equal(geometry.background,options['canvas-theme']==='dark'?'rgb(11, 11, 11)':'rgb(249, 249, 249)','原位改名底色需匹配原版页面色')
      const value=editorCase==='blank'?'':editorCase==='spaces'?'   ':editorCase==='unchanged'?original.pages['page-1'].title:'  中文画板  '
      await input.fill(value)
      await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(output,`board-title-${editorCase}-editing.png`)})
      if(['conflict','permission'].includes(editorCase)){
        fixtureWrite=editorCase!=='permission'
        document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:editorCase==='conflict'?{title:'他人更新的画板'}:{notes:'权限已更新'}}],'remote-title-change')).document
        const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/document')&&response.status()===200)
        await page.evaluate(()=>window.__codeChanged());await refreshed
        if(editorCase==='permission')await page.waitForFunction(()=>document.querySelector('[aria-label="画板名称"]')?.readOnly===true)
        await input.press('Enter');await page.getByRole('button',{name:'下载本地副本',exact:true}).waitFor()
        const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click()
        const recovery=JSON.parse(await readFile(await(await downloading).path(),'utf8'))
        assert.ok(JSON.stringify(recovery.operations).includes('中文画板')||JSON.stringify(recovery.drafts).includes('中文画板'),'本地标题必须可恢复')
        assert.equal(document.pages['page-1'].title,editorCase==='conflict'?'他人更新的画板':original.pages['page-1'].title)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-board-title',case:editorCase,localChineseDraftRecoverable:true,peerDocumentRetained:true,noWrites:true,consoleOrPageErrors:errors}
      }
      const writes=!['escape','blank','spaces','unchanged'].includes(editorCase)
      if(editorCase==='composing'){
        await input.dispatchEvent('compositionstart');await page.keyboard.press('Control+s');await page.waitForTimeout(250)
        assert.equal(receipts.length,0,'选词期间不能保存中间标题');assert.equal(await input.count(),1)
        await input.dispatchEvent('compositionend',{data:value});await page.waitForTimeout(150);assert.equal(receipts.length,0);assert.equal(await input.count(),1,'保存快捷键不结束标题编辑');const pending=saved();await input.press('Enter');await pending
      }else{
        const pending=writes?saved():null
        if(editorCase==='blur')await page.getByRole('button',{name:'显示属性',exact:true}).click()
        else if(editorCase==='save'){await input.press('Control+s');await page.waitForTimeout(250);assert.equal(receipts.length,0,'原版标题保存快捷键不提前提交');assert.equal(await input.count(),1);assert.equal(await input.inputValue(),value);await input.press('Enter')}
        else await input.press(editorCase==='escape'?'Escape':'Enter')
        if(pending)await pending;else await page.waitForTimeout(200)
      }
      await input.waitFor({state:'detached'})
      if(editorCase==='blur')assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'显示属性','普通失焦不得抢回点击目标')
      assert.equal(document.pages['page-1'].title,writes?'中文画板':original.pages['page-1'].title)
      assert.equal(receipts.length,writes?1:0)
      if(writes){assert.deepEqual(receipts[0].operations,[{type:'page.patch',pageId:'page-1',patch:{title:'中文画板'}}]);assert.deepEqual({...document.pages['page-1'],title:original.pages['page-1'].title},original.pages['page-1'])}
      for(const id of original.pageOrder.slice(1))assert.deepEqual(document.pages[id],original.pages[id])
      if(['history','save'].includes(editorCase)){
        let pending=saved();await page.keyboard.press('Control+z');await pending;await label.filter({hasText:original.pages['page-1'].title}).waitFor()
        assert.equal(document.pages['page-1'].title,original.pages['page-1'].title)
        pending=saved();await page.keyboard.press('Control+Shift+z');await pending;await label.filter({hasText:'中文画板'}).waitFor()
      }
      await page.reload();await ready(1);assert.equal(await label.textContent(),writes?'中文画板':original.pages['page-1'].title)
      assert.deepEqual(errors,[])
      return{kind:'isolated-board-title',case:editorCase,geometry,operationBatches:receipts.length,sharedHistory:['history','save'].includes(editorCase),reopened:true,otherPageHashesUnchanged:true,syntheticComposition:editorCase==='composing',realOsImeVerified:false,consoleOrPageErrors:errors}
    }
    if(options.checks==='board-transform'){
      assert.equal(kind,'design')
      const before=structuredClone(document.pages['page-1']),others=document.pageOrder.slice(1).map(id=>pageHash(document.pages[id])),originalIds=[...document.pageOrder]
      await page.locator('[data-page-id="page-1"] .native-board-label').click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByLabel('画板宽度',{exact:true}).waitFor()
      const board=page.locator('[data-artboard-id="page-1"]'),bounds=await board.boundingBox(),scale=bounds.width/before.width,scenario=editorCase
      const previewGeometry=[]
      const saved=()=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200)
      const drag=async({resize=false,group=false,pageId='page-1',handle='se',dx=40,dy=30,modifier,phase,stationary=false,cancel=false,expectWrite=true,inspectPreview}={})=>{
        const dragBoard=page.locator(`[data-artboard-id="${pageId}"]`)
        const target=group?page.locator(`[data-board-group-selection] [data-board-handle="${handle}"]`):dragBoard.locator(resize?`[data-board-handle="${handle}"]`:'.native-board-heading')
        let rect=null
        for(let attempt=0;attempt<3&&!rect;attempt++){await target.hover();rect=await target.boundingBox()}
        assert.ok(rect,'画板手势目标必须可见且已稳定挂载')
        const x=rect.x+rect.width/2,y=rect.y+rect.height/2
        if(modifier)await page.keyboard.down(modifier)
        await page.mouse.move(x,y);await page.mouse.down();if(phase){await page.mouse.move(x+dx/2,y+dy/2,{steps:3});if(phase==='press')await page.keyboard.down('Alt');else await page.keyboard.up('Alt')}if(!stationary)await page.mouse.move(x+dx,y+dy,{steps:5});else await page.waitForTimeout(120)
        if(phase==='press'||modifier==='Alt'&&phase!=='release'){if(phase)assert.equal(await page.locator('[data-board-copy="page-1"]').count(),1,'拖动中按下Alt需立即显示副本框');await page.locator('[data-board-copy="page-1"]').waitFor();assert.equal(document.pageOrder.length,3,'复制预览不能提前保存副本')}
        if(!cancel&&scenario!=='readonly'){await page.waitForFunction(()=>!document.querySelector('.native-stage .native-page-content [aria-busy="true"]')&&[...document.querySelectorAll('.native-stage .native-page-content img')].every(image=>image.complete&&image.naturalWidth>0));await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:join(output,`board-${scenario}-preview.png`)})}
        previewGeometry.push({...(scenario.startsWith('gap-')?{spacingSurface:{labels:await page.locator('[data-board-gap-label]').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return{text:element.textContent,rect:element.getBoundingClientRect().toJSON(),color:style.color,background:style.backgroundColor,fontFamily:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,borderRadius:style.borderRadius}})),lines:await page.locator('[data-board-spacing-guide]').evaluateAll(elements=>elements.map(element=>({rect:element.getBoundingClientRect().toJSON(),stroke:getComputedStyle(element).stroke,strokeWidth:getComputedStyle(element).strokeWidth})))}}:{}),...(group?{memberRings:await page.locator('.native-board-member-selection').evaluateAll(elements=>elements.map(element=>({id:element.parentElement.dataset.artboardId,rect:element.getBoundingClientRect().toJSON(),outline:getComputedStyle(element).outline}))),groupOutline:await page.locator('[data-board-group-selection] .native-board-selection').evaluate(element=>getComputedStyle(element).outline)}:{}),selection:await page.locator('[data-board-group-selection]').count()?await page.locator('[data-board-group-selection]').boundingBox():null,frame:await dragBoard.boundingBox(),heading:await dragBoard.locator('.native-board-heading').boundingBox(),ghost:await page.locator('[data-board-copy="page-1"]').count()?await page.locator('[data-board-copy="page-1"]').boundingBox():null})
        if(scenario==='minimum'){const value=previewGeometry.at(-1);assert.ok(Math.abs(value.frame.width-value.heading.width)<=1,'最小画板标题不能保留额外最小宽度')}
        if(inspectPreview)await inspectPreview()
        if(cancel)await page.keyboard.press('Escape')
        const pending=!cancel&&scenario!=='readonly'&&expectWrite?saved():null
        await page.mouse.up();if(modifier)await page.keyboard.up(modifier);if(phase==='press')await page.keyboard.up('Alt')
        if(pending)await pending;else await page.waitForTimeout(350)
      }
      if(scenario==='readonly'){
        assert.equal(await board.locator('[data-board-handle]').count(),0);await drag();assert.equal(receipts.length,0);assert.equal(pageHash(document.pages['page-1']),pageHash(before))
      }else if(scenario==='cancel'||scenario==='copy-cancel'){
        await drag({modifier:scenario==='copy-cancel'?'Alt':undefined,cancel:true});assert.equal(receipts.length,0);assert.deepEqual(document.pageOrder,originalIds);assert.equal(pageHash(document.pages['page-1']),pageHash(before));assert.equal(await page.locator('[data-board-copy]').count(),0)
      }else if(scenario.startsWith('gap-')){
        const vertical=scenario==='gap-vertical',left=scenario==='gap-left',id=left?'page-1':'page-2',original=structuredClone(document.pages[id]);await page.locator(`[data-artboard-id="${id}"] .native-board-label`).click()
        await drag({pageId:id,dx:vertical?30:left?-5:5,dy:vertical?5:scenario==='gap-aligned'?0:30,expectWrite:scenario!=='gap-aligned',modifier:scenario==='gap-bypass'?'Control':undefined,cancel:scenario==='gap-cancel',inspectPreview:async()=>{assert.deepEqual(await page.locator('[data-board-gap-label]').allTextContents(),scenario==='gap-bypass'?[]:['160','160']);assert.equal(await page.locator('[data-board-spacing-guide]').count(),scenario==='gap-bypass'?0:2)}})
        const expectedX=vertical?Math.round(30/scale):scenario==='gap-bypass'?2103:left?0:2080,expectedY=vertical?1240:scenario==='gap-aligned'?0:136
        if(scenario==='gap-cancel'){assert.equal(receipts.length,0);assert.equal(pageHash(document.pages[id]),pageHash(original))}else{assert.equal(document.pages[id].x,expectedX,'画板需按原版等距或取消吸附');assert.equal(document.pages[id].y,expectedY);assert.equal(receipts.length,scenario==='gap-aligned'?0:1)}
        if(scenario==='gap-history'){const after=pageHash(document.pages[id]);let pending=saved();await page.keyboard.press('Control+z');await pending;assert.equal(pageHash(document.pages[id]),pageHash(original));await page.waitForFunction(()=>document.querySelector('[data-artboard-id="page-2"]')?.getBoundingClientRect().y<430);pending=saved();await page.keyboard.press('Control+Shift+z');await pending;assert.equal(pageHash(document.pages[id]),after)}
        if(!left)assert.equal(pageHash(document.pages['page-1']),pageHash(before));assert.equal(pageHash(document.pages['page-3']),others[1])
      }else if(scenario.startsWith('group-')){
        const originalSecond=structuredClone(document.pages['page-2']);await page.locator('[data-artboard-id="page-2"] .native-board-label').click();await board.locator('.native-board-label').click({modifiers:['Shift']});await page.waitForFunction(()=>document.querySelectorAll('[data-board-selected="true"]').length===2)
        assert.equal(await page.locator('[data-board-group-selection]').count(),1,'多选需统一外框');assert.equal(await page.locator('[data-board-handle]').count(),scenario==='group-readonly'?0:8,'成员画板不应保留独立手柄');assert.equal(await page.getByLabel('画板宽度',{exact:true}).count(),0,'原版多选画板显示属性空态')
        if(scenario==='group-keyboard'){const handle=page.locator('[data-board-group-selection] [data-board-handle="se"]');await handle.focus();const pending=saved();await handle.press('Shift+ArrowDown');await pending}else if(scenario==='group-readonly'){await board.locator('.native-board-label').focus();await page.keyboard.press('ArrowRight');assert.equal(receipts.length,0)}else await drag({resize:true,group:true,modifier:scenario==='group-ratio'?'Shift':undefined,cancel:scenario==='group-cancel',...(scenario==='group-minimum'?{dx:-1000,dy:-500}:{})})
        if(scenario==='group-cancel'||scenario==='group-readonly'){assert.equal(receipts.length,0);assert.equal(pageHash(document.pages['page-1']),pageHash(before));assert.equal(pageHash(document.pages['page-2']),pageHash(originalSecond))}else{
          const width=scenario==='group-keyboard'?1920:scenario==='group-minimum'?120:scenario==='group-ratio'?2161:1997,height=scenario==='group-keyboard'?1090:scenario==='group-minimum'?120:1216,x=scenario==='group-keyboard'?2080:scenario==='group-minimum'?130:scenario==='group-ratio'?2341:2163
          assert.deepEqual([document.pages['page-1'].x,document.pages['page-1'].y,document.pages['page-1'].width,document.pages['page-1'].height],[0,0,width,height]);assert.deepEqual([document.pages['page-2'].x,document.pages['page-2'].y,document.pages['page-2'].width,document.pages['page-2'].height],[x,0,width,height]);assert.equal(receipts.length,1);assert.equal(receipts[0].operations.length,2)
          if(scenario==='group-history'){const result=document.pageOrder.map(id=>pageHash(document.pages[id]));let pending=saved();await page.keyboard.press('Control+z');await pending;assert.equal(pageHash(document.pages['page-1']),pageHash(before));assert.equal(pageHash(document.pages['page-2']),pageHash(originalSecond));await page.waitForFunction(()=>document.querySelector('[data-artboard-id="page-1"]')?.getBoundingClientRect().width<430);pending=saved();await page.keyboard.press('Control+Shift+z');await pending;assert.deepEqual(document.pageOrder.map(id=>pageHash(document.pages[id])),result)}
        }
        assert.equal(JSON.stringify(document.pages['page-2'].nodes),JSON.stringify(originalSecond.nodes));assert.equal(pageHash(document.pages['page-3']),others[1])
      }else if(scenario==='cross-canvas'){
        await page.getByLabel('页面菜单',{exact:true}).click();await page.getByRole('button',{name:'页面 2',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.canvasPageId==='second');const label=page.locator('[data-artboard-id="page-3"] .native-board-label');await label.click({modifiers:['Shift']});await label.focus();const pending=saved();await label.press('ArrowRight');await pending;assert.equal(document.pages['page-1'].x,before.x,'画布外旧选区不得接收标题方向键');assert.equal(document.pages['page-3'].x,4161);assert.deepEqual(receipts.at(-1).operations.map(operation=>operation.pageId),['page-3'])
      }else if(['copy-late','copy-release','copy-late-still','copy-release-still'].includes(scenario)){
        const late=scenario.startsWith('copy-late'),stationary=scenario.endsWith('still');await drag({modifier:late?undefined:'Alt',phase:late?'press':'release',stationary});assert.equal(receipts.length,1);assert.equal(document.pageOrder.length,late?4:3);if(late){assert.equal(pageHash(document.pages['page-1']),pageHash(before));const copy=document.pages[document.pageOrder.at(-1)];assert.equal(copy.x,stationary?90:160);assert.equal(copy.y,stationary?68:136)}else{assert.equal(document.pages['page-1'].x,stationary?90:160);assert.equal(document.pages['page-1'].y,stationary?68:136);assert.equal(previewGeometry[0].ghost,null,'松开Alt后静止预览也必须移除副本框')}
      }else if(scenario==='move-unsnapped'||scenario==='resize-unsnapped'){
        await drag({resize:scenario==='resize-unsnapped',modifier:'Control'});const value=document.pages['page-1'];assert.equal(value.x,scenario==='move-unsnapped'?181:0);assert.equal(value.width,scenario==='resize-unsnapped'?2101:1920);assert.equal(value.y,scenario==='move-unsnapped'?136:0);assert.equal(value.height,scenario==='resize-unsnapped'?1216:1080);assert.equal(receipts.length,1)
      }else if(scenario==='selection-camera'){
        await page.locator('[data-artboard-id="page-2"] .native-board-label').click({modifiers:['Shift']});await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]').dataset.currentPage==='page-2');await page.waitForTimeout(100);const after=await board.boundingBox();assert.ok(Math.abs(after.x-bounds.x)<1&&Math.abs(after.y-bounds.y)<1,'标题选择不得跳转或平移画布相机');assert.equal(receipts.length,0)
      }else if(scenario==='multi-copy'){
        await page.locator('[data-artboard-id="page-2"] .native-board-label').click();await board.locator('.native-board-label').click({modifiers:['Shift']});await page.waitForFunction(()=>document.querySelectorAll('[data-board-selected="true"]').length===2)
        await drag({modifier:'Alt'});assert.equal(receipts.length,1);assert.equal(document.pageOrder.length,5)
        const copies=document.pageOrder.slice(3).map(id=>document.pages[id]);assert.deepEqual(copies.map(page=>[page.title,page.x,page.y]),[['Page 1 副本',160,136],['Page 2 副本',2240,136]])
      }else if(scenario==='pending-width'){
        await page.getByLabel('画板宽度',{exact:true}).fill('2000');assert.equal(receipts.length,0);await drag({resize:true});assert.equal(document.pages['page-1'].width,2181);assert.equal(receipts.length,2)
      }else if(scenario==='comment-resize'){
        const pin=board.getByLabel('评论 1：画板局部坐标',{exact:true}),anchor=commentThreads[0].anchor;await pin.waitFor()
        await drag({resize:true,inspectPreview:async()=>{const frame=await board.boundingBox(),point=await pin.boundingBox();assert.ok(Math.abs(point.x-frame.x-frame.width/2)<1,'缩放预览中的评论横坐标需跟随画板');assert.ok(Math.abs(point.y-frame.y-frame.height/2)<1,'缩放预览中的评论纵坐标需跟随画板')}});assert.equal(commentThreads[0].anchor,anchor)
      }else if(scenario.startsWith('edge-')){
        const handle=scenario.slice(5),expected=({n:[0,136,1920,944],e:[0,0,2080,1080],s:[0,0,1920,1216],w:[181,0,1739,1080],nw:[181,136,1739,944],ne:[0,136,2080,944],sw:[181,0,1739,1216]})[handle]
        await drag({resize:true,handle});const result=document.pages['page-1'];assert.deepEqual([result.x,result.y,result.width,result.height],expected);assert.equal(receipts.length,1)
      }else if(scenario==='keyboard'){
        const label=board.locator('.native-board-label');await label.focus();let pending=saved();await label.press('ArrowRight');await pending;assert.equal(document.pages['page-1'].x,1)
        const handle=board.locator('[data-board-handle="se"]');await handle.focus();pending=saved();await handle.press('Shift+ArrowDown');await pending;assert.equal(document.pages['page-1'].height,1090);assert.equal(document.pages['page-1'].width,1920)
      }else if(scenario==='multi'||scenario==='multi-toggle'){
        await page.locator('[data-artboard-id="page-2"] .native-board-label').click({modifiers:['Shift']});await scrollCanvasTo(before);await page.waitForFunction(()=>{const rect=document.querySelector('[data-artboard-id="page-1"] .native-board-heading')?.getBoundingClientRect();return rect&&rect.x>=0&&rect.y>=30});await page.waitForFunction(()=>document.querySelectorAll('[data-board-selected="true"]').length===2)
        if(scenario==='multi-toggle'){await board.locator('.native-board-label').click({modifiers:['Shift']});await page.waitForFunction(()=>document.querySelectorAll('[data-board-selected="true"]').length===1);assert.equal(receipts.length,0)}else{await drag();assert.equal(document.pages['page-2'].x-document.pages['page-1'].x,2080);assert.equal(document.pages['page-2'].y,document.pages['page-1'].y);assert.equal(receipts.length,1);assert.equal(receipts[0].operations.length,2)}
      }else{
        await drag({resize:['resize','ratio','minimum','ratio-minimum','maximum'].includes(scenario),modifier:scenario.startsWith('copy')?'Alt':scenario.startsWith('ratio')?'Shift':undefined,...(scenario.includes('minimum')?{dx:-500,dy:-300}:scenario==='maximum'?{dx:3000,dy:2000}:{})})
        if(scenario==='copy'||scenario==='copy-history'){
          assert.equal(document.pageOrder.length,4);assert.equal(pageHash(document.pages['page-1']),pageHash(before));const id=document.pageOrder.find(id=>!originalIds.includes(id)),copy=document.pages[id];assert.equal(document.pageOrder.at(-1),id,'原版Alt复制追加到画板顺序末尾');assert.equal(copy.x,160);assert.equal(copy.y,Math.round(30/scale));assert.match(copy.title,/副本/);assert.equal(copy.nodeOrder.length,before.nodeOrder.length);assert.ok(copy.nodeOrder.every(id=>!before.nodes[id]));assert.equal(receipts.length,1)
        }else if(['resize','ratio','minimum','ratio-minimum','maximum'].includes(scenario)){
          assert.equal(document.pages['page-1'].width,scenario==='maximum'?8000:scenario==='ratio-minimum'?213:scenario==='minimum'?120:scenario==='ratio'?2162:2080);assert.equal(document.pages['page-1'].height,scenario==='maximum'?8000:scenario.includes('minimum')?120:1216);assert.equal(document.pages['page-1'].x,0);assert.equal(document.pages['page-1'].y,0)
          assert.equal(receipts.length,1,'一次缩放应只创建一项共享历史记录')
        }else{
          assert.equal(document.pages['page-1'].x,160,'画板标题拖动需使用原版边缘吸附');assert.equal(document.pages['page-1'].y,Math.round(30/scale));assert.equal(receipts.length,1)
        }
        if(scenario==='history'||scenario==='copy-history'){
          const moved=document.pageOrder.map(id=>pageHash(document.pages[id]));assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('[data-native-artifact-editor]')),true,'画板手势后焦点应保持在编辑器内');await page.getByLabel('画板宽度',{exact:true}).waitFor();let pending=saved();await page.keyboard.press('Control+z');await pending;assert.equal(pageHash(document.pages['page-1']),pageHash(before));assert.deepEqual(document.pageOrder,originalIds);await page.waitForFunction(x=>Math.abs((document.querySelector('[data-artboard-id="page-1"]')?.getBoundingClientRect().x??Infinity)-x)<1,bounds.x);pending=saved();await page.keyboard.press('Control+Shift+z');await pending;assert.deepEqual(document.pageOrder.map(id=>pageHash(document.pages[id])),moved);assert.deepEqual(historyRequests,['undo','redo'])
        }
      }
      assert.equal(JSON.stringify(document.pages['page-1'].nodes),JSON.stringify(before.nodes));if(scenario!=='multi'&&scenario!=='cross-canvas'&&!scenario.startsWith('gap-')&&!scenario.startsWith('group-'))assert.deepEqual(originalIds.slice(1).map(id=>pageHash(document.pages[id])),others)
      const final=JSON.stringify(document);await page.reload();await ready(1);assert.equal(JSON.stringify(document),final);assert.deepEqual(errors,[])
      return{kind:'画板变换回归',scenario,scale,previewGeometry,savedAndReopened:true,nodesUnchanged:true,committedBatches:receipts.length,scope:'真实组件与可信输入，受控HTTP文档服务，不代替真实授权API或完整视觉验收',consoleOrPageErrors:errors}
    }
    if(options.checks==='design-artboard'){
      assert.equal(kind,'design')
      if(options['artboard-case']==='exports'){
        const results=await page.evaluate(async({root,document})=>{
          const {exportDocument}=await import('/@fs'+root+'/src/features/artifacts/native/export/pdf.ts'),{createNode}=await import('/@fs'+root+'/shared/artifact-document.ts')
          const top={...createNode('shape','print-top'),x:0,y:0,width:800,height:240,style:{fill:'#123456'}},bottom={...createNode('shape','print-bottom'),x:0,y:1280,width:800,height:200,style:{fill:'#ff0000'}}
          const base={...document.pages['page-1'],width:800,height:240,radius:undefined,sizing:undefined,paper:'A4',nodes:{[top.id]:top,[bottom.id]:bottom},nodeOrder:[top.id,bottom.id]},results=[]
          for(const mode of ['flow','fixed']){
            const single={...document,pageOrder:[base.id],pages:{[base.id]:{...base,print:mode}},assets:{}},before=JSON.stringify(single),result=await exportDocument(single,{format:'pdf'})
            if(JSON.stringify(single)!==before)throw Error('导出不得改写画板')
            results.push({mode,base64:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(result.blob)}),warnings:result.warnings})
          }
          return results
        },{root,document})
        for(const result of results){
          const file=join(output,`print-${result.mode}.pdf`);await writeFile(file,Buffer.from(result.base64,'base64'));delete result.base64
          const info=execFileSync('pdfinfo',[file],{encoding:'utf8'});result.pages=Number(info.match(/^Pages:\s+(\d+)/m)[1]);assert.equal(result.pages,result.mode==='flow'?2:1);result.pageSize=info.match(/^Page size:\s+([^\n]+)/m)[1]
          if(result.mode==='flow')assert.match(result.pageSize,/595\.28 x 841\.89 pts/);else assert.match(result.pageSize,/600 x 180 pts/)
          const target=join(output,`print-${result.mode}`),height=result.mode==='flow'?1131:240
          execFileSync('pdftoppm',['-f',result.mode==='flow'?'2':'1','-singlefile','-scale-to-x','800','-scale-to-y',String(height),'-png',file,target],{stdio:'pipe'})
          result.pixel=await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return[...ctx.getImageData(400,200,1,1).data]},(await readFile(target+'.png')).toString('base64'))
          const expected=result.mode==='flow'?[255,0,0]:[18,52,86];assert.ok(result.pixel.slice(0,3).every((value,index)=>Math.abs(value-expected[index])<=3))
        }
        assert.deepEqual(errors,[]);return{kind:'画板固定与流式PDF局部回归',independentParser:'pdfinfo / pdftoppm',results,consoleOrPageErrors:errors}
      }
      const originalNodes=JSON.stringify(document.pages['page-1'].nodes),otherHashes=document.pageOrder.slice(1).map(id=>pageHash(document.pages[id]))
      await page.locator('[data-page-id="page-1"] .native-board-label').click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const inspector=page.getByRole('complementary',{name:'属性面板',exact:true})
      assert.equal(await inspector.getByText('转场',{exact:true}).count(),0,'画板表单不显示幻灯片转场')
      assert.equal(await inspector.locator('summary').filter({hasText:'高级'}).count(),0,'画板尺寸应直接呈现，符合来源表单')
      const mode=inspector.getByRole('radiogroup',{name:'打印模式',exact:true}),paper=inspector.getByRole('radiogroup',{name:'打印纸张',exact:true}),saved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      await mode.getByRole('radio',{name:'固定',exact:true}).waitFor()
      if(options['artboard-case']==='fit-hidden'){
        const root=Object.values(document.pages['page-1'].nodes).find(node=>node.type==='group'&&!node.parentId),row=inspector.locator(`[data-outline-node="${root.id}"]`)
        await row.hover();await row.getByRole('button',{name:/^隐藏图层 /}).click();await saved();assert.equal(document.pages['page-1'].nodes[root.id].hidden,true)
        await page.getByLabel('画板高度',{exact:true}).fill('240');await page.getByLabel('画板高度',{exact:true}).press('Enter');await saved()
        const baseline={receipts:receipts.length,seq:document.seq,history:JSON.stringify(history)}
        await page.getByLabel('高度操作',{exact:true}).click();await page.getByRole('menuitem',{name:'适应内容高度',exact:true}).click();await page.waitForTimeout(500)
        assert.equal(document.pages['page-1'].height,240,'隐藏祖先的后代不能扩大画板');assert.equal(receipts.length,baseline.receipts);assert.equal(document.seq,baseline.seq);assert.equal(JSON.stringify(history),baseline.history)
        assert.deepEqual(errors,[]);return{kind:'隐藏组合不扩大画板回归',hiddenThroughRealLayerControl:true,height:240,noFitWrites:true,noHistoryEntries:true,consoleOrPageErrors:errors}
      }
      if(options['artboard-case']==='fit-policy'){
        for(const height of [1100,1400]){
          await page.getByLabel('画板高度',{exact:true}).fill(String(height));await page.getByLabel('画板高度',{exact:true}).press('Enter');await saved();const baseline=receipts.length
          await page.getByLabel('高度操作',{exact:true}).click();await page.getByRole('menuitem',{name:'适应内容高度',exact:true}).click();await page.waitForTimeout(500)
          assert.equal(document.pages['page-1'].height,height,'普通固定画板按原版只增大，不自动缩小');assert.equal(receipts.length,baseline)
        }
        await mode.getByRole('radio',{name:'流式',exact:true}).click();await saved();assert.equal(await page.getByLabel('高度操作',{exact:true}).count(),0,'原版流式打印不显示高度操作入口')
        assert.deepEqual(errors,[]);return{kind:'原版高度适配资格回归',ordinaryFixedDoesNotShrink:true,flowHidesHeightAction:true,consoleOrPageErrors:errors}
      }
      if(options['artboard-case']==='fit-repeat'){
        const baseline={document:JSON.stringify(document),history:JSON.stringify(history),receipts:receipts.length}
        for(let index=0;index<3;index++){
          await page.getByLabel('高度操作',{exact:true}).click();await page.getByRole('menuitem',{name:'适应内容高度',exact:true}).click();await page.waitForTimeout(500)
          assert.equal(receipts.length,baseline.receipts,'已经适配的画板不得重复保存或污染撤销历史');assert.equal(JSON.stringify(history),baseline.history);assert.equal(JSON.stringify(document),baseline.document)
        }
        assert.deepEqual(errors,[]);return{kind:'已适配画板重复操作回归',repeatedActions:3,noWrites:true,noHistoryEntries:true,documentUnchanged:true,consoleOrPageErrors:errors}
      }
      if(options['artboard-case']==='readonly'){
        for(const label of ['画板宽度','画板高度','圆角','背景'])assert.ok(await page.getByLabel(label,{exact:true}).isDisabled())
        assert.ok(await mode.getByRole('radio',{name:'流式',exact:true}).isDisabled())
        assert.equal(await page.getByLabel('高度操作',{exact:true}).count(),0)
        for(const label of ['添加布局参考线']){const trigger=page.getByLabel(label,{exact:true});assert.equal(await trigger.getAttribute('aria-disabled'),'true');await trigger.click({force:true});assert.equal(await page.locator('.native-artboard-properties details[open]').count(),0)}
        assert.equal(receipts.length,0);assert.deepEqual(errors,[]);return{kind:'只读画板属性回归',fieldsAndActionsDisabled:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['artboard-case']==='visual'){
        await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.native-stage .native-page-content:not(.native-canvas-content) img')],first=document.querySelector('.native-stage [data-page-id="page-1"] .native-page-content:not(.native-canvas-content) img');return first?.complete&&first.naturalWidth>0&&images.every(image=>image.complete&&image.naturalWidth>0)});await page.evaluate(()=>{document.activeElement?.blur();return document.fonts.ready});await page.mouse.move(10,100)
        const geometry=await inspector.locator('input,button,[role=radio],summary,.native-artboard-properties h3').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>({label:e.getAttribute('aria-label')??e.textContent,rect:e.getBoundingClientRect().toJSON(),font:getComputedStyle(e).font,background:getComputedStyle(e).backgroundColor,parentBackground:getComputedStyle(e.parentElement).backgroundColor,parentShadow:getComputedStyle(e.parentElement).boxShadow})))
        await page.screenshot({path:join(output,'design-artboard-default.png')});assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        const surface=await inspector.evaluate(e=>{const s=getComputedStyle(e);return{rect:e.getBoundingClientRect().toJSON(),shadow:s.boxShadow,background:s.backgroundColor,border:s.border,borderRadius:s.borderRadius}})
        assert.equal(surface.shadow,'none','来源属性面板无外阴影，不能遮盖画布或工作区')
        return{kind:'画板属性默认状态截图',width:Number(options.width??1440),height:Number(options.height??1000),theme:options['canvas-theme']??'light',surface,geometry,noWrites:true,consoleOrPageErrors:errors,qualified:false}
      }
      assert.equal(await mode.getByRole('radio',{name:'固定',exact:true}).getAttribute('aria-checked'),'true')
      assert.ok(await paper.getByRole('radio',{name:'A4',exact:true}).isDisabled())
      assert.equal(await paper.locator('[aria-checked=true]').count(),0)
      await mode.getByRole('radio',{name:'流式',exact:true}).click();await saved();await paper.getByRole('radio',{name:'A4',exact:true}).click();await saved()
      assert.deepEqual([document.pages['page-1'].width,document.pages['page-1'].height],[1920,1080]);assert.equal(document.pages['page-1'].sizing,undefined);assert.equal(document.pages['page-1'].print,'flow');assert.equal(document.pages['page-1'].paper,'A4')
      await page.reload();await ready(1);await page.locator('[data-page-id="page-1"] .native-board-label').click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      assert.equal(await mode.getByRole('radio',{name:'流式',exact:true}).getAttribute('aria-checked'),'true');assert.equal(await paper.getByRole('radio',{name:'A4',exact:true}).getAttribute('aria-checked'),'true')
      const historyPaper=async(kind,key,checked)=>{
        const response=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().method()==='POST'&&response.request().postDataJSON()?.kind===kind)
        await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press(key);assert.equal((await response).status(),200)
        await page.waitForFunction(checked=>[...document.querySelectorAll('[aria-label="打印纸张"] [role=radio]')].find(element=>element.textContent==='A4')?.getAttribute('aria-checked')===String(checked),checked);await saved()
      }
      await historyPaper('undo','Control+z',false);assert.equal(document.pages['page-1'].paper,undefined);assert.equal(document.pages['page-1'].print,'flow')
      await historyPaper('redo','Control+Shift+z',true);assert.equal(document.pages['page-1'].paper,'A4')
      assert.equal(await page.getByLabel('高度操作',{exact:true}).count(),0);await mode.getByRole('radio',{name:'固定',exact:true}).click();await saved()
      await page.getByLabel('画板宽度',{exact:true}).fill('96');await page.getByLabel('画板宽度',{exact:true}).press('Enter');await saved();assert.equal(document.pages['page-1'].width,120)
      await page.getByLabel('画板宽度',{exact:true}).fill('9000');await page.getByLabel('画板宽度',{exact:true}).press('Enter');await saved();assert.equal(document.pages['page-1'].width,8000)
      await page.getByLabel('画板宽度',{exact:true}).fill('1920');await page.getByLabel('画板宽度',{exact:true}).press('Enter');await saved()
      await page.getByLabel('画板高度',{exact:true}).fill('240');await page.getByLabel('画板高度',{exact:true}).press('Enter');await saved()
      await page.getByLabel('高度操作',{exact:true}).click();await page.getByRole('menuitem',{name:'适应内容高度',exact:true}).click();await saved();assert.equal(document.pages['page-1'].height,1080)
      assert.equal(JSON.stringify(document.pages['page-1'].nodes),originalNodes);assert.deepEqual(document.pageOrder.slice(1).map(id=>pageHash(document.pages[id])),otherHashes)
      await page.waitForFunction(()=>{const images=[...document.querySelectorAll('.native-stage .native-page-content:not(.native-canvas-content) img')];return images.length===3&&images.every(image=>image.complete&&image.naturalWidth>0)});await page.evaluate(()=>document.fonts.ready)
      const geometry=await inspector.locator('input,button,[role=radio],summary,.native-artboard-properties h3').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>({label:e.getAttribute('aria-label')??e.textContent,rect:e.getBoundingClientRect().toJSON(),background:getComputedStyle(e).backgroundColor})))
      await page.screenshot({path:join(output,'design-artboard.png')});assert.deepEqual(errors,[])
      return{kind:'画板属性局部回归',printAndPaperDoNotResize:true,savedAndReopened:true,paperSharedUndoRedo:true,sourceDimensionsBounds:true,fitHeight:true,nodesAndOtherPagesUnchanged:true,geometry,consoleOrPageErrors:errors}
    }
    if(options.checks==='os-ime'&&options['ime-target']==='element-sizing'){
      assert.equal(kind,'design');assert.equal(options.headed,'true');await select(1)
      await page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const original=structuredClone(document.pages['page-1'].nodes['page-1-heading']),field=page.locator('.native-element-sizing').getByRole('textbox',{name:'宽度',exact:true}),prefix='calc(800px /*'
      await field.waitFor();await field.fill(prefix);await field.press('End')
      const title='LingxiLoop 尺寸输入法验收'
      await page.evaluate(title=>{document.title=title;window.__osImeEvents=[];window.__osImeProgrammaticEnds=[];const dispatch=EventTarget.prototype.dispatchEvent;EventTarget.prototype.dispatchEvent=function(event){if(event.type==='compositionend')window.__osImeProgrammaticEnds.push(new Error().stack);return dispatch.call(this,event)};for(const type of ['compositionstart','compositionupdate','compositionend','beforeinput','input'])document.addEventListener(type,event=>window.__osImeEvents.push({type,data:event.data??null,inputType:event.inputType??null,trusted:event.isTrusted}),true)},title)
      const windows=execFileSync('xdotool',['search','--sync','--onlyvisible','--name',title],{encoding:'utf8',timeout:10_000}).trim().split('\n');execFileSync('xdotool',['windowfocus','--sync',windows.at(-1)])
      execFileSync('fcitx5-remote',['-s','pinyin']);execFileSync('fcitx5-remote',['-o'])
      execFileSync('xdotool',['type','--clearmodifiers','--delay','150','nihao'])
      await page.waitForFunction(()=>window.__osImeEvents.some(event=>event.type==='compositionstart'&&event.trusted));await page.waitForTimeout(900);assert.equal(receipts.length,0)
      execFileSync('xdotool',['key','ctrl+s']);await page.waitForTimeout(150);assert.equal(receipts.length,0);assert.equal(await field.isVisible(),true)
      execFileSync('scrot',['--overwrite',join(output,'design-sizing-os-ime-candidates.png')])
      execFileSync('xdotool',['key','space']);await page.waitForFunction(()=>window.__osImeEvents.some(event=>event.type==='compositionend'&&event.data==='你好'));assert.equal(await field.inputValue(),prefix+'你好');assert.equal(receipts.length,0)
      const starts=await page.evaluate(()=>window.__osImeEvents.filter(event=>event.type==='compositionstart').length)
      execFileSync('xdotool',['type','--clearmodifiers','--delay','150','zhongwen']);await page.waitForFunction(starts=>window.__osImeEvents.filter(event=>event.type==='compositionstart').length>starts,starts);await page.waitForTimeout(900);assert.equal(receipts.length,0)
      execFileSync('xdotool',['key','Escape']);await page.waitForFunction(prefix=>document.querySelector('.native-element-sizing [aria-label="宽度"]')?.value===prefix+'你好',prefix);assert.equal(await field.isVisible(),true);assert.equal(receipts.length,0)
      const events=await page.evaluate(()=>window.__osImeEvents),programmaticEnds=await page.evaluate(()=>window.__osImeProgrammaticEnds);assert.deepEqual(programmaticEnds,[]);assert.ok(events.some(event=>event.type==='input'&&event.data==='你好'&&event.trusted))
      execFileSync('fcitx5-remote',['-c']);await field.pressSequentially('*/)');const final=prefix+'你好*/)';let pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200);await field.press('Enter');await pending;assert.equal(receipts.length,1);assert.equal(document.pages['page-1'].nodes['page-1-heading'].css.width,final)
      pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind==='undo'&&response.status()===200);await field.press('Control+z');await pending;assert.deepEqual(document.pages['page-1'].nodes['page-1-heading'],original)
      pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind==='redo'&&response.status()===200);await field.press('Control+Shift+z');await pending;assert.equal(document.pages['page-1'].nodes['page-1-heading'].css.width,final)
      await page.reload();await ready(1);await select(1);await page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await field.waitFor();assert.equal(await field.inputValue(),final);await page.screenshot({path:join(output,'design-sizing-os-ime-reopened.png')});assert.deepEqual(errors,[])
      return{kind:'真实系统尺寸输入法回归',browserVersion:browser.version(),platform:'Linux、X11、Fcitx5拼音',target:'宽度中的中文样式注释',testDispatchesCompositionEvents:false,compositionEvents:events,compositionEndTrusted:events.find(event=>event.type==='compositionend')?.trusted,noSaveDuringComposition:true,saveShortcutKeepsEditing:true,cancelDoesNotExit:true,oneCommittedBatch:true,immediateSharedHistoryInsideConfirmedField:true,savedAndReopened:true,scope:'HTTP文档夹具与真实系统输入；其他操作系统未验收',consoleOrPageErrors:errors}
    }
    if(options.checks==='os-ime'&&options['ime-target']==='element-link'){
      assert.equal(kind,'design');assert.equal(options.headed,'true');await select(1)
      await page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const field=page.getByRole('textbox',{name:'链接目标',exact:true}),prefix='https://example.test/'
      await field.waitFor();await field.fill(prefix);await field.press('End')
      const title='LingxiLoop 链接输入法验收'
      await page.evaluate(title=>{document.title=title;window.__osImeEvents=[];window.__osImeProgrammaticEnds=[];const dispatch=EventTarget.prototype.dispatchEvent;EventTarget.prototype.dispatchEvent=function(event){if(event.type==='compositionend')window.__osImeProgrammaticEnds.push(new Error().stack);return dispatch.call(this,event)};for(const type of ['compositionstart','compositionupdate','compositionend','beforeinput','input'])document.addEventListener(type,event=>window.__osImeEvents.push({type,data:event.data??null,inputType:event.inputType??null,trusted:event.isTrusted}),true)},title)
      const windows=execFileSync('xdotool',['search','--sync','--onlyvisible','--name',title],{encoding:'utf8',timeout:10_000}).trim().split('\n');execFileSync('xdotool',['windowfocus','--sync',windows.at(-1)])
      execFileSync('fcitx5-remote',['-s','pinyin']);execFileSync('fcitx5-remote',['-o'])
      execFileSync('xdotool',['type','--clearmodifiers','--delay','150','nihao'])
      await page.waitForFunction(()=>window.__osImeEvents.some(event=>event.type==='compositionstart'&&event.trusted));await page.waitForTimeout(900);assert.equal(receipts.length,0)
      execFileSync('xdotool',['key','ctrl+s']);await page.waitForTimeout(150);assert.equal(receipts.length,0);assert.equal(await field.isVisible(),true)
      execFileSync('scrot',['--overwrite',join(output,'design-link-os-ime-candidates.png')])
      execFileSync('xdotool',['key','space']);await page.waitForFunction(()=>window.__osImeEvents.some(event=>event.type==='compositionend'&&event.data==='你好'));assert.equal(await field.inputValue(),prefix+'你好');assert.equal(receipts.length,0)
      const starts=await page.evaluate(()=>window.__osImeEvents.filter(event=>event.type==='compositionstart').length)
      execFileSync('xdotool',['type','--clearmodifiers','--delay','150','zhongwen']);await page.waitForFunction(starts=>window.__osImeEvents.filter(event=>event.type==='compositionstart').length>starts,starts);await page.waitForTimeout(900);assert.equal(receipts.length,0)
      execFileSync('xdotool',['key','Escape']);await page.waitForFunction(prefix=>document.querySelector('[aria-label="链接目标"]')?.value===prefix+'你好',prefix);assert.equal(await field.isVisible(),true);assert.equal(receipts.length,0)
      const events=await page.evaluate(()=>window.__osImeEvents),programmaticEnds=await page.evaluate(()=>window.__osImeProgrammaticEnds);assert.deepEqual(programmaticEnds,[]);assert.ok(events.some(event=>event.type==='input'&&event.data==='你好'&&event.trusted))
      execFileSync('fcitx5-remote',['-c']);let pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200);await field.press('Enter');await pending;assert.equal(receipts.length,1);assert.equal(elementLink(document.pages['page-1'].nodes['page-1-heading']),prefix+'你好')
      await page.locator('[data-native-artifact-editor]').focus();pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind==='undo'&&response.status()===200);await page.keyboard.press('Control+z');await pending;assert.equal(elementLink(document.pages['page-1'].nodes['page-1-heading']),'')
      pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind==='redo'&&response.status()===200);await page.keyboard.press('Control+Shift+z');await pending;assert.equal(elementLink(document.pages['page-1'].nodes['page-1-heading']),prefix+'你好')
      await page.reload();await ready(1);await select(1);await page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await field.waitFor();assert.equal(await field.inputValue(),prefix+'你好');await page.screenshot({path:join(output,'design-link-os-ime-reopened.png')});assert.deepEqual(errors,[])
      return{kind:'真实系统链接输入法回归',browserVersion:browser.version(),platform:'Linux、X11、Fcitx5拼音',target:'链接目标',testDispatchesCompositionEvents:false,compositionEvents:events,compositionEndTrusted:events.find(event=>event.type==='compositionend')?.trusted,noSaveDuringComposition:true,saveShortcutKeepsEditing:true,cancelDoesNotExit:true,oneCommittedBatch:true,sharedHistoryAfterLeavingField:true,savedAndReopened:true,scope:'HTTP文档夹具与真实系统输入；其他操作系统未验收',consoleOrPageErrors:errors}
    }
    if(options.checks==='os-ime'){
      assert.equal(options.headed,'true','系统输入法需要有界面的浏览器')
      await select(1)
      const title='LingxiLoop 中文输入法验收'
      await page.evaluate(title=>{document.title=title;window.__osImeEvents=[];window.__osImeProgrammaticEnds=[];const dispatch=EventTarget.prototype.dispatchEvent;EventTarget.prototype.dispatchEvent=function(event){if(event.type==='compositionend')window.__osImeProgrammaticEnds.push(new Error().stack);return dispatch.call(this,event)};for(const type of ['compositionstart','compositionupdate','compositionend','beforeinput','input'])document.addEventListener(type,event=>window.__osImeEvents.push({type,data:event.data??null,inputType:event.inputType??null,isComposing:event.isComposing??null,trusted:event.isTrusted}),true)},title)
      const boardTitle=options['ime-target']==='board-title',nodeId='page-1-heading',original=boardTitle?document.pages['page-1'].title:document.pages['page-1'].nodes[nodeId].text
      await page.locator(boardTitle?'[data-artboard-id="page-1"] .native-board-label':`[data-node-id="${nodeId}"]`).dblclick();const text=boardTitle?page.getByRole('textbox',{name:'画板名称',exact:true}):page.locator('[data-native-text-editor]');await text.waitFor();await page.keyboard.press('End')
      const windows=execFileSync('xdotool',['search','--sync','--onlyvisible','--name',title],{encoding:'utf8',timeout:10_000}).trim().split('\n');assert.ok(windows[0],'未找到浏览器系统窗口')
      execFileSync('xdotool',['windowfocus','--sync',windows.at(-1)])
      execFileSync('fcitx5-remote',['-s','pinyin']);execFileSync('fcitx5-remote',['-o'])
      const baseline=receipts.length
      execFileSync('xdotool',['type','--clearmodifiers','--delay','150','nihao'])
      await page.waitForFunction(()=>window.__osImeEvents.some(event=>event.type==='compositionstart'&&event.trusted))
      await page.waitForTimeout(900)
      assert.equal(receipts.length,baseline,'真实拼音组词期间不得保存')
      execFileSync('scrot',['--overwrite',join(output,`${kind}-os-ime-candidates.png`)])
      if(boardTitle){execFileSync('xdotool',['key','ctrl+s']);await page.waitForTimeout(150);assert.equal(receipts.length,baseline);assert.equal(await text.isVisible(),true,'真实组词中保存快捷键应保留标题编辑')}
      execFileSync('xdotool',['key','space'])
      await page.waitForFunction(()=>window.__osImeEvents.some(event=>event.type==='compositionend'&&event.data==='你好'))
      if(boardTitle)assert.equal(await text.inputValue(),original+'你好');else{
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes[nodeId].text,original+'你好')
      }
      const committedCount=baseline+(boardTitle?0:1)
      assert.equal(receipts.length,committedCount,boardTitle?'标题选词后需等待确认':'选词只提交一个共享操作批次')
      const committedEvents=await page.evaluate(()=>window.__osImeEvents);assert.ok(committedEvents.some(event=>event.type==='input'&&event.data==='你好'&&event.trusted),'汉字输入事件必须来自浏览器')
      const starts=committedEvents.filter(event=>event.type==='compositionstart').length
      execFileSync('xdotool',['type','--clearmodifiers','--delay','150','zhongwen'])
      await page.waitForFunction(starts=>window.__osImeEvents.filter(event=>event.type==='compositionstart').length>starts,starts);await page.waitForTimeout(900);assert.equal(receipts.length,committedCount)
      execFileSync('xdotool',['key','Escape']);await page.waitForFunction(boardTitle=>{const element=document.querySelector(boardTitle?'[aria-label="画板名称"]':'[data-native-text-editor]');return (boardTitle?element?.value:element?.textContent)?.endsWith('你好')},boardTitle);assert.equal(await text.isVisible(),true,'取消拼音候选不能退出文本编辑');await page.waitForTimeout(700);assert.equal(receipts.length,committedCount,'取消组词不得新增保存')
      const events=await page.evaluate(()=>window.__osImeEvents),programmaticEnds=await page.evaluate(()=>window.__osImeProgrammaticEnds);assert.deepEqual(programmaticEnds,[],'系统输入法测试不得用脚本派发结束事件')
      execFileSync('fcitx5-remote',['-c']);const titleSaved=boardTitle?page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.status()===200):null;await page.keyboard.press(boardTitle?'Enter':'Escape');if(titleSaved)await titleSaved
      assert.equal(receipts.length,baseline+1,'确认后仅有一个共享操作批次')
      if(boardTitle){let pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind==='undo'&&response.status()===200);await page.keyboard.press('Control+z');await pending;assert.equal(document.pages['page-1'].title,original);pending=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind==='redo'&&response.status()===200);await page.keyboard.press('Control+Shift+z');await pending;assert.equal(document.pages['page-1'].title,original+'你好')}
      await page.reload();await ready(1);assert.equal(await page.locator(boardTitle?'[data-artboard-id="page-1"] .native-board-label':`[data-node-id="${nodeId}"]`).innerText(),original+'你好')
      await page.screenshot({path:join(output,`${kind}-os-ime-reopened.png`)})
      assert.deepEqual(errors,[])
      return{kind:'真实系统拼音输入法局部回归',editor:kind,target:boardTitle?'画板名称':'画布文字',platform:'Linux、X11、Fcitx5拼音、真实Chromium窗口',browserVersion:browser.version(),osIme:true,titleSaveKeepsComposition:boardTitle,immediateSharedHistoryAfterTitleConfirm:boardTitle,testDispatchesCompositionEvents:false,compositionEvents:events,compositionEndTrusted:events.find(event=>event.type==='compositionend')?.trusted,noSaveDuringComposition:true,oneBatchAfterCommit:true,cancelledCompositionDoesNotSaveOrExit:true,savedAndReopened:true,scope:'HTTP夹具及真实共享操作链路，不代替真实授权服务或其他操作系统输入法验收',consoleOrPageErrors:errors}
    }
    if(options.checks==='inspector-code'){
      assert.equal(kind,'design')
      const heading=page.locator('.native-stage [data-node-id="page-1-heading"]')
      if(options['code-case']!=='empty')await heading.click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      await page.getByRole('tab',{name:'代码',exact:true}).click()
      const field=page.getByRole('textbox',{name:'样式与属性',exact:true})
      if(options['code-case']==='empty'){
        await page.locator('.native-code-pane').waitFor()
        assert.equal(await field.count(),0,'固定来源在没有选择时不渲染代码输入框或占位提示')
        await page.screenshot({path:join(output,'design-code-empty.png')})
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-empty-code',sourceMatchedNoField:true,noPlaceholderWithoutSelection:true,noWrites:true,consoleOrPageErrors:errors}
      }
      await field.waitFor();const initial=await field.inputValue()
      assert.ok(initial.includes('width:'))
      if(options['code-case']==='geometry'){
        const original=document.pages['page-1'].nodes['page-1-heading'].width
        await field.fill(initial.replace(/^width:.*$/m,'width: 480px;'));await field.press('Control+s')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].width,480)
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].css?.width,undefined)
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();await page.keyboard.press('Control+z')
        await page.waitForFunction(expected=>Math.abs(Number.parseFloat(getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).width)-expected)<.01,original)
        assert.equal(receipts.length,1);assert.deepEqual(errors,[])
        return{kind:'isolated-code-native-geometry',typedWidth:true,noCompetingCssWidth:true,sharedUndo:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='readonly'){
        assert.equal(await field.getAttribute('readonly'),'')
        await field.press('Control+a');await field.press('x');assert.equal(await field.inputValue(),initial)
        await page.context().grantPermissions(['clipboard-read','clipboard-write'])
        await field.press('Control+a');await field.press('Control+c')
        assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),initial)
        await field.press('Control+s');assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-readonly-code',chineseField:true,copyable:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='cas'||options['code-case']==='clean-remote'){
        if(options['code-case']==='cas')await field.fill(initial+'\nfilter: blur(1px)')
        const source=document.pages['page-1'].nodes['page-1-heading']
        document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:source.id,patch:{css:{filter:'blur(4px)'}}}],'remote-code-style')).document
        await page.evaluate(()=>window.__codeChanged())
        if(options['code-case']==='clean-remote')await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).filter==='blur(4px)')
        if(options['code-case']==='cas'){
          await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='conflict')
          assert.equal(document.pages['page-1'].nodes[source.id].css.filter,'blur(4px)')
          const download=page.waitForEvent('download');await page.getByRole('button',{name:'下载本地副本',exact:true}).click();const file=await download
          const recovery=JSON.parse(await readFile(await file.path(),'utf8'))
          assert.ok(JSON.stringify(recovery.operations).includes('blur(1px)'))
          assert.equal(receipts.length,0);assert.deepEqual(errors,[])
          return{kind:'isolated-code-conflict',peerStyleRetained:true,localStyleRecoverable:true,noSilentOverwrite:true,expectedOperationConflicts:expectedCodeNetworkErrors.length,consoleOrPageErrors:errors}
        }
        await page.getByRole('tab',{name:'属性',exact:true}).click();await page.getByRole('tab',{name:'代码',exact:true}).click()
        assert.ok((await field.inputValue()).includes('filter: blur(4px);'))
        await field.fill((await field.inputValue()).replace('blur(4px)','blur(3px)'));await field.press('Control+s')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes[source.id].css.filter,'blur(3px)');assert.equal(receipts.length,1);assert.deepEqual(errors,[])
        return{kind:'isolated-code-refocus',cleanRemoteValueRefreshed:true,matchingBaseSnapshot:true,noFalseConflict:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='mixed'){
        const shape=page.locator('.native-stage [data-node-id="page-1-shape"]')
        await shape.click({modifiers:['Shift']})
        const snapshot=JSON.stringify(document.pages['page-1'].nodes),mixed=await field.inputValue()
        assert.ok(!/^width:/m.test(mixed));assert.ok(mixed.includes('// width: （混合值）'))
        await field.fill(mixed+'\nopacity: .5');await field.press('Control+s')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        for(const id of ['page-1-heading','page-1-shape'])assert.equal(document.pages['page-1'].nodes[id].style.opacity,.5)
        await page.screenshot({path:join(output,'design-code-mixed.png')})
        const before=JSON.parse(snapshot)
        for(const id of ['page-1-heading','page-1-shape']){assert.equal(document.pages['page-1'].nodes[id].width,before[id].width);assert.equal(document.pages['page-1'].nodes[id].style.color,before[id].style.color)}
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();await page.keyboard.press('Control+z')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-shape"]')).opacity==='1')
        assert.equal(receipts.length,1);assert.deepEqual(errors,[])
        return{kind:'isolated-mixed-code',commonDeclarationsOnly:true,mixedValuesPreserved:true,singleSharedUndo:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='tabs'){
        await page.getByRole('tab',{name:'代码',exact:true}).focus();await page.keyboard.press('ArrowRight')
        assert.equal(await page.getByRole('tab',{name:'主题',exact:true}).getAttribute('aria-selected'),'true')
        await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'属性',exact:true}).getAttribute('aria-selected'),'true')
        await page.keyboard.press('ArrowRight')
        assert.equal(await page.getByRole('tab',{name:'代码',exact:true}).evaluate(element=>element===element.ownerDocument.activeElement),true)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-inspector-tabs',chineseLabels:true,arrowKeys:true,home:true,rovingFocus:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='background-replacement'){
        await field.fill(initial+'\nbackground-color: #123456;');await field.press('Control+s')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).backgroundColor==='rgb(18, 52, 86)')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        await field.fill((await field.inputValue()).replace(/^background-color:.*$/m,'background-color: 480 !important;'));await field.press('Control+s')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).backgroundColor==='rgba(0, 0, 0, 0)')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        const exportColor=await page.evaluate(async({root,document})=>{
          const {renderPageHtml}=await import('/@fs'+root+'/src/features/artifacts/native/export/render.ts'),{ExportResources}=await import('/@fs'+root+'/src/features/artifacts/native/export/common.ts')
          const node=document.pages['page-1'].nodes['page-1-heading'],single={...document.pages['page-1'],nodeOrder:[node.id],nodes:{[node.id]:node}}
          const html=await renderPageHtml(single,new ExportResources(document,{format:'html'})),parsed=new DOMParser().parseFromString('<!doctype html>'+html,'text/html'),target=parsed.querySelector('[data-node-id]')
          return target.style.backgroundColor
        },{root,document})
        assert.equal(exportColor,'','无效声明不能在导出中复活原背景色')
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();await page.keyboard.press('Control+z')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).backgroundColor==='rgb(18, 52, 86)')
        await page.keyboard.press('Control+Shift+z')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).backgroundColor==='rgba(0, 0, 0, 0)')
        await page.reload();await ready(1)
        assert.equal(await heading.evaluate(element=>getComputedStyle(element).backgroundColor),'rgba(0, 0, 0, 0)')
        assert.deepEqual(errors,[])
        return{kind:'isolated-code-background-replacement',validColorThenInvalid:true,nativeAndOfflineTransparent:true,sharedUndoRedo:true,reopened:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='unitless-length'){
        const before=document.pages['page-1'].nodes['page-1-heading'].width
        await field.fill(initial.replace(/^width:.*$/m,'width: 480;'));await field.press('Control+s')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].width,before,'缺少单位的非零长度不能变成480px')
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].css.width,'480')
        assert.equal(await heading.evaluate(element=>element.style.width),'','浏览器应忽略无单位非零宽度')
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();await page.keyboard.press('Control+z')
        await page.waitForFunction(()=>document.querySelector('.native-stage [data-node-id="page-1-heading"]').style.width==='1152px')
        await page.keyboard.press('Control+Shift+z')
        await page.waitForFunction(()=>document.querySelector('.native-stage [data-node-id="page-1-heading"]').style.width==='')
        await page.reload();await ready(1);await heading.click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByRole('tab',{name:'代码',exact:true}).click()
        assert.ok((await field.inputValue()).includes('width: 480;'))
        const reopened=await field.inputValue()
        await field.fill(reopened.replace(/^font-size:.*$/m,'font-size: 0px;'));await field.press('Control+s')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).fontSize==='0px')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].css['font-size'],'0px')
        const fontZero=await field.inputValue()
        await field.fill(fontZero.replace(/^color:.*$/m,'color: #123456 !important;'));await field.press('Control+s')
        await page.waitForFunction(()=>document.querySelector('.native-stage [data-node-id="page-1-heading"]').style.getPropertyPriority('color')==='important')
        assert.equal(await heading.evaluate(element=>getComputedStyle(element).color),'rgb(18, 52, 86)')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        await page.reload();await ready(1)
        assert.equal(await heading.evaluate(element=>element.style.getPropertyPriority('color')),'important')
        const exported=await page.evaluate(async({root,document})=>{
          const {renderPageHtml}=await import('/@fs'+root+'/src/features/artifacts/native/export/render.ts'),{ExportResources}=await import('/@fs'+root+'/src/features/artifacts/native/export/common.ts')
          const node=document.pages['page-1'].nodes['page-1-heading'],single={...document.pages['page-1'],nodeOrder:[node.id],nodes:{[node.id]:node}}
          const html=await renderPageHtml(single,new ExportResources(document,{format:'html'})),parsed=new DOMParser().parseFromString('<!doctype html>'+html,'text/html'),element=parsed.querySelector('[data-node-id]')
          return{mode:parsed.compatMode,width:element.style.width,fontSize:element.style.fontSize,color:element.style.color,priority:element.style.getPropertyPriority('color')}
        },{root,document})
        assert.deepEqual(exported,{mode:'CSS1Compat',width:'',fontSize:'0px',color:'rgb(18, 52, 86)',priority:'important'})
        assert.deepEqual(errors,[])
        return{kind:'isolated-code-length-units',nonzeroUnitlessPreserved:true,noPixelRewrite:true,browserIgnoresInvalidLength:true,sharedUndoRedo:true,reopened:true,zeroFontSizePreserved:true,importantPrioritySavedAndReopened:true,offlineDeclarationsParsedInBrowser:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='lineheight'){
        const before=document.pages['page-1'].nodes['page-1-heading'].style.lineHeight
        await field.fill(initial.replace(/^line-height:.*$/m,'line-height: 2px;'));await field.press('Control+s')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).lineHeight==='2px')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].style.lineHeight,before)
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].css['line-height'],'2px')
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();await page.keyboard.press('Control+z')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).lineHeight==='60px')
        await page.keyboard.press('Control+Shift+z')
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).lineHeight==='2px')
        await page.reload();await ready(1)
        assert.equal(await heading.evaluate(element=>getComputedStyle(element).lineHeight),'2px')
        assert.equal(receipts.length,1);assert.deepEqual(errors,[])
        return{kind:'isolated-code-lineheight',pixelUnitPreserved:true,computedLineHeight:'2px',nativeRatioUnchanged:true,sharedUndoRedo:true,reopened:true,consoleOrPageErrors:errors}
      }
      if(['access-composing','discard-recovery'].includes(options['code-case'])){
        await field.evaluate(element=>{window.__codeImeEvents=[];for(const type of ['compositionstart','compositionend'])element.addEventListener(type,event=>window.__codeImeEvents.push({type:event.type,trusted:event.isTrusted}))})
        if(options['code-case']==='discard-recovery')await field.fill(initial+'\n@data-label: ')
        await field.press('Control+End')
        const cdp=await page.context().newCDPSession(page)
        await cdp.send('Input.imeSetComposition',{text:'中文组字恢复',selectionStart:6,selectionEnd:6})
        assert.ok((await field.inputValue()).includes('中文组字恢复'))
        denyCodeAccess=true;await page.evaluate(()=>window.__codeChanged())
        await page.getByRole('textbox',{name:'样式与属性',exact:true}).waitFor({state:'detached'})
        const events=await page.evaluate(()=>window.__codeImeEvents)
        assert.ok(events.some(event=>event.type==='compositionstart'&&event.trusted))
        const backup=page.getByRole('button',{name:'下载本地副本',exact:true});await backup.waitFor()
        const download=page.waitForEvent('download');await backup.click();const file=await download
        const recovery=JSON.parse(await readFile(await file.path(),'utf8'))
        assert.ok(recovery.codeDrafts.some(draft=>draft.text.includes('中文组字恢复')))
        assert.equal(receipts.length,0)
        denyCodeAccess=false;await page.getByRole('button',{name:'重试',exact:true}).click();await ready(1);await field.waitFor()
        assert.ok((await field.inputValue()).includes('中文组字恢复'))
        await page.waitForTimeout(260);assert.equal(receipts.length,0)
        if(options['code-case']==='discard-recovery'){
          const downloaded=page.waitForEvent('download'),reread=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/document')&&request.method()==='GET')
          await page.getByRole('button',{name:'保留副本并重新载入',exact:true}).click()
          const backup=await downloaded;await reread
          const saved=JSON.parse(await readFile(await backup.path(),'utf8'))
          assert.ok(saved.codeDrafts.some(draft=>draft.text.includes('中文组字恢复')))
          await page.waitForFunction(()=>!document.querySelector('[aria-label="样式与属性"]')?.value.includes('中文组字恢复')&&document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
          await page.getByRole('button',{name:'关闭属性',exact:true}).click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await field.waitFor()
          assert.ok(!(await field.inputValue()).includes('中文组字恢复'))
          assert.equal(await page.getByRole('button',{name:'下载本地副本',exact:true}).count(),0)
          assert.equal(receipts.length,0);assert.deepEqual(errors,[])
          return{kind:'isolated-code-explicit-reset',trustedComposition:true,validRawAttribute:true,backupDownloaded:true,realDocumentReload:true,fieldAndOwnerCleared:true,noResurrectionAfterPanelClose:true,noWrites:true,consoleOrPageErrors:errors}
        }
        await page.getByRole('button',{name:'关闭属性',exact:true}).click()
        await page.getByRole('button',{name:'显示属性',exact:true}).click();await field.waitFor()
        assert.ok((await field.inputValue()).includes('中文组字恢复'));assert.equal(receipts.length,0)
        await field.fill(initial+'\n@data-label: 中文恢复已保存');await field.press('Control+s')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].attributes['data-label'],'中文恢复已保存')
        assert.equal(receipts.length,1);assert.deepEqual(errors,[])
        return{kind:'isolated-code-composing-access-recovery',trustedBrowserComposition:true,events,rawChineseSurvivesUnmount:true,downloaded:true,recoveredFieldAfterRetry:true,recoveredDraftSurvivesAnotherPanelClose:true,noAutomaticWrite:true,explicitEditSaved:true,realOsImeUnverified:true,expectedAccessDenials:expectedCodeNetworkErrors.length,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='permission'){
        await field.dispatchEvent('compositionstart',{data:'中'})
        await field.fill(initial+'\n@data-label: 中文权限草稿')
        fixtureWrite=false
        document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{notes:'远端权限更新'}}],'permission-change')).document
        await page.evaluate(()=>window.__codeChanged())
        await page.waitForFunction(()=>document.querySelector('[aria-label="样式与属性"]')?.readOnly===true)
        await field.dispatchEvent('compositionend',{data:'中文权限草稿'})
        await page.getByRole('button',{name:'关闭属性',exact:true}).click()
        const backup=page.getByRole('button',{name:'下载本地副本',exact:true})
        await backup.waitFor()
        const download=page.waitForEvent('download');await backup.click();const file=await download
        const recovery=JSON.parse(await readFile(await file.path(),'utf8'))
        assert.ok(JSON.stringify(recovery).includes('中文权限草稿'))
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-code-permission-retention',draftSurvivesPanelClose:true,recoveryContainsChineseDraft:true,noUnauthorizedWrites:true,consoleOrPageErrors:errors}
      }
      if(options['code-case']==='ime'){
        await field.dispatchEvent('compositionstart',{data:'中'})
        await field.fill(initial+'\n@data-label: 中');await field.press('Control+s')
        await page.waitForTimeout(260);assert.equal(receipts.length,0)
        await field.fill(initial+'\n@data-label: 中文输入')
        await field.dispatchEvent('compositionend',{data:'中文输入'})
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes['page-1-heading'].attributes['data-label'],'中文输入')
        assert.equal(receipts.length,1);assert.deepEqual(errors,[])
        return{kind:'isolated-code-composition',syntheticCompositionOnly:true,noIntermediateWrite:true,saveAfterComposition:true,oneBatch:true,realOsImeUnverified:true,consoleOrPageErrors:errors}
      }
      await field.fill(initial+'\nfilter: blur(1px);\n@data-label: 中文测试')
      await field.press('Control+s')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].css.filter,'blur(1px)')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].attributes['data-label'],'中文测试')
      assert.equal(await heading.getAttribute('data-label'),'中文测试')
      const next=(await field.inputValue()).replace('blur(1px)','blur(2px)')
      await field.fill(next);await field.press('Control+s')
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).filter==='blur(2px)')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].css.filter,'blur(2px)')
      await page.screenshot({path:join(output,'design-code-edit.png')})
      await field.fill(next+'\nwidth: calc(100%')
      await page.waitForFunction(()=>document.querySelector('[aria-label="样式与属性"]')?.getAttribute('aria-invalid')==='true')
      assert.equal(await field.getAttribute('aria-invalid'),'true')
      await page.getByRole('tab',{name:'属性',exact:true}).click()
      await page.getByRole('tab',{name:'代码',exact:true}).click()
      assert.ok(!(await field.inputValue()).includes('calc(100%'))
      await field.fill((await field.inputValue())+'\n@onclick: alert(1)')
      await field.press('Control+s')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].attributes.onclick,undefined)
      await page.getByRole('tab',{name:'属性',exact:true}).click()
      await page.getByRole('button',{name:'关闭属性',exact:true}).click()
      await page.keyboard.press('Control+z')
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).filter==='blur(1px)')
      await page.reload();await ready(1)
      await heading.click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByRole('tab',{name:'代码',exact:true}).click()
      assert.ok((await field.inputValue()).includes('filter: blur(1px);'))
      assert.deepEqual(errors,[])
      return{kind:'isolated-native-inspector-code',chineseField:true,savedAndReopened:true,repeatedFocusedSave:true,invalidBlurRestores:true,activeAttributesRejected:true,sharedUndo:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='code-style'){
      const node=page.locator('.native-stage [data-node-id="page-1-heading"]')
      assert.equal(await node.evaluate(element=>getComputedStyle(element).filter),'blur(1px)')
      assert.equal(await node.evaluate(element=>element.style.getPropertyPriority('filter')),'important')
      assert.equal(await node.getAttribute('data-label'),'中文测试')
      assert.equal(await node.getAttribute('title'),'中文说明')
      assert.equal(await node.evaluate(element=>element.tagName),'A')
      if(options['code-case']==='drag'){
        const shape=page.locator('.native-stage [data-node-id="page-1-shape"]'),before=await shape.boundingBox()
        await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+before.width/2+20,before.y+before.height/2,{steps:4});await page.mouse.up()
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        const after=await shape.boundingBox();assert.ok(Math.abs(after.x-before.x-20)<1,JSON.stringify({before,after}))
        await page.keyboard.press('Control+z')
        await page.waitForFunction(()=>document.querySelector('.native-stage [data-node-id="page-1-shape"]').style.left==='120px')
        const undone=await shape.boundingBox();assert.ok(Math.abs(undone.x-before.x)<.01)
      }
      if(options['code-case']==='geometry'){
        const shape=page.locator('.native-stage [data-node-id="page-1-shape"]')
        await shape.click();const before=await shape.boundingBox()
        await page.keyboard.press('ArrowRight')
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(document.pages['page-1'].nodes['page-1-shape'].x,121)
        assert.equal(document.pages['page-1'].nodes['page-1-shape'].css.left,'121px !important')
        const after=await shape.boundingBox();assert.ok(after.x>before.x&&after.x-before.x<2,JSON.stringify({before,after}))
        await page.keyboard.press('Control+z')
        await page.waitForFunction(()=>document.querySelector('.native-stage [data-node-id="page-1-shape"]').style.left==='120px')
        const undone=await shape.boundingBox();assert.ok(Math.abs(undone.x-before.x)<.01)
      }
      await node.click();assert.equal(new URL(page.url()).pathname,'/')
      const original=await node.elementHandle()
      document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:'page-1-heading',patch:{},unset:['css']}],'remote-remove-code')).document
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-heading"]')).filter==='none')
      assert.equal(await original.evaluate(element=>element===document.querySelector('.native-stage [data-node-id="page-1-heading"]')),true)
      assert.equal(await node.evaluate(element=>element.style.getPropertyPriority('filter')),'')
      assert.equal(await node.evaluate(element=>element.style.getPropertyPriority('color')),'')
      await page.screenshot({path:join(output,`${kind}-code-style.png`)})
      assert.deepEqual(errors,[])
      return{kind:'isolated-native-code-style',case:options['code-case']??'normal',cssGeometryMovesFromPaintedPosition:options['code-case']==='geometry',cssPaint:true,important:true,remoteRemovalClearsImportantWithoutRemount:true,chineseAttributes:true,editingLinkDoesNotNavigate:true,noWrites:receipts.length===0,consoleOrPageErrors:errors}
    }
    if(options.checks==='inspector-load'){
      assert.equal(inspectorModuleRequests,0)
      const toggle=page.getByRole('button',{name:'显示属性',exact:true})
      if(!['failed','cancel'].includes(options['inspector-case']))await page.locator('.native-stage [data-node-id="page-1-shape"]').click()
      await toggle.click()
      if(options['inspector-case']==='failed'){
        await page.getByRole('status').filter({hasText:'属性面板未能加载，请刷新页面后重试。'}).waitFor()
        assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-inspector-open'),'false')
        assert.equal(await toggle.evaluate(element=>element===element.ownerDocument.activeElement),true)
        assert.equal(receipts.length,0)
        blockInspector=false;await page.reload();await ready(1);await toggle.click()
        await page.getByRole('complementary',{name:'属性面板',exact:true}).getByRole('tab',{name:'属性',exact:true}).waitFor()
        assert.ok(inspectorModuleRequests>=2)
        const expected=errors.filter(value=>value==='Failed to load resource: net::ERR_FAILED'),unexpected=errors.filter(value=>value!=='Failed to load resource: net::ERR_FAILED');assert.deepEqual(unexpected,[])
        return{kind:'isolated-inspector-module-error',lazyUntilOpened:true,chineseFailure:true,editorRetained:true,focusRestored:true,refreshRecovered:true,noWrites:true,expectedNetworkErrors:expected,consoleOrPageErrors:unexpected}
      }
      if(options['inspector-case']==='cancel'){
        await page.getByRole('status').filter({hasText:'正在加载属性…'}).waitFor()
        await page.getByRole('button',{name:'关闭属性',exact:true}).click()
        assert.equal(await toggle.evaluate(element=>element===element.ownerDocument.activeElement),true)
        const loaded=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/NativeInspector.tsx'))
        releaseInspector();await loaded
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
        assert.equal(await page.locator('[data-native-artifact-editor]').getAttribute('data-inspector-open'),'false')
        assert.equal(await page.getByRole('complementary',{name:'属性面板',exact:true}).count(),0)
        await toggle.click();await page.getByRole('tab',{name:'属性',exact:true}).waitFor()
        assert.equal(inspectorModuleRequests,1);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-inspector-load-cancellation',lazyUntilOpened:true,closeWhileLoading:true,lateModuleDoesNotReopen:true,cachedReentry:true,focusRestored:true,noWrites:true,consoleOrPageErrors:errors}
      }
      const radius=page.getByRole('spinbutton',{name:'圆角',exact:true})
      await radius.waitFor();assert.equal(await radius.inputValue(),'12')
      await radius.fill('20');await radius.press('Control+s')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-shape'].style.borderRadius,20)
      await page.getByRole('button',{name:'关闭属性',exact:true}).click()
      assert.equal(await toggle.evaluate(element=>element===element.ownerDocument.activeElement),true)
      await page.keyboard.press('Control+z')
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-stage [data-node-id="page-1-shape"]')).borderRadius==='12px')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-shape'].style.borderRadius,12)
      await toggle.click();await radius.waitFor();assert.equal(await radius.inputValue(),'12')
      assert.equal(inspectorModuleRequests,1);assert.equal(receipts.length,1);assert.deepEqual(errors,[])
      return{kind:'isolated-lazy-inspector-field',lazyUntilOpened:true,fieldDraftSaved:true,sharedUndo:true,reopenedValue:true,cachedReentry:true,focusRestored:true,consoleOrPageErrors:errors}
    }
    if (options.checks === 'slides-present-controls') {
      const width=Number(options.width??1440),height=Number(options.height??1000)
      if(['touch','pen'].includes(options['presentation-case'])){
        const input=options['presentation-case']
        if(input==='touch')await page.getByRole('button',{name:'放映',exact:true}).click();else await startSlides()
        await page.evaluate(()=>{window.__presentationPointers=[];document.addEventListener('pointerdown',event=>window.__presentationPointers.push({type:event.pointerType,trusted:event.isTrusted}),true)})
        const inputSession=input==='pen'?await page.context().newCDPSession(page):null
        const tap=async(x,y)=>{if(!inputSession)return page.touchscreen.tap(x,y);await inputSession.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1,pointerType:'pen'});await inputSession.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1,pointerType:'pen'})}
        const presentation=page.getByRole('region',{name:'幻灯片放映',exact:true})
        await presentation.waitFor()
        await page.waitForFunction(()=>getComputedStyle(document.querySelector('.native-present-controls')).opacity==='0')
        const stage=await page.locator('.native-slides-presentation-stage').boundingBox()
        await tap(stage.x+stage.width*.8,stage.y+stage.height/2)
        await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.dataset.currentPage==='page-2')
        assert.equal(await page.locator('.native-present-controls').getAttribute('data-controls-visible'),'true','真实指针翻页必须唤回控制条')
        assert.equal(await page.locator('.native-present-controls').evaluate(element=>getComputedStyle(element).opacity),'1')
        const exit=await presentation.getByRole('button',{name:'退出放映',exact:true}).boundingBox()
        await tap(exit.x+exit.width/2,exit.y+exit.height/2)
        await presentation.waitFor({state:'detached'})
        await page.waitForFunction(()=>!document.fullscreenElement)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        const pointers=await page.evaluate(()=>window.__presentationPointers);assert.equal(pointers.length,2);assert.ok(pointers.every(event=>event.type===input&&event.trusted));await inputSession?.detach()
        return{kind:'isolated-presentation-pointer-controls',input,pointers,trustedInputAfterIdle:true,pageAdvanced:true,controlsRevealed:true,trustedInputExit:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['presentation-case']==='initial-speaker'){
        await page.getByLabel('放映',{exact:true}).click()
        const opening=page.waitForEvent('popup')
        await page.getByRole('menuitem',{name:'使用演讲者视图放映',exact:true}).click()
        const speaker=await opening
        await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor()
        assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false)
        await page.bringToFront()
        await page.locator('.native-slides-presentation-stage').click({position:{x:width*.85,y:Math.min(300,height/2)}})
        await page.waitForFunction(()=>document.fullscreenElement===document.documentElement)
        assert.equal(await page.locator('[data-current-page]').getAttribute('data-current-page'),'page-1')
        await page.getByRole('button',{name:'关闭讲者备注窗口',exact:true}).click()
        await page.getByRole('button',{name:'退出放映',exact:true}).click()
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-initial-speaker-fullscreen',popupDoesNotEnterFullscreen:true,firstClickEntersWithoutPaging:true,noWrites:true,consoleOrPageErrors:errors}
      }
      await startSlides()
      if(options['presentation-case']==='module-error'){
        await page.getByRole('status').filter({hasText:'放映组件未能加载，请刷新页面后重试。'}).waitFor()
        await page.waitForFunction(()=>!document.fullscreenElement)
        assert.equal(await page.getByRole('region',{name:'幻灯片放映',exact:true}).count(),0)
        assert.equal(await page.locator('[data-native-artifact-editor]').count(),1)
        const expected=errors.filter(value=>value==='Failed to load resource: net::ERR_FAILED'),unexpected=errors.filter(value=>value!=='Failed to load resource: net::ERR_FAILED')
        assert.deepEqual(unexpected,[]);assert.equal(receipts.length,0)
        return{kind:'isolated-presentation-module-error',chineseError:true,fullscreenCleaned:true,editorRetained:true,expectedNetworkErrors:expected,consoleOrPageErrors:unexpected}
      }
      const presentation = page.getByRole('region', { name: '幻灯片放映', exact: true })
      await presentation.waitFor()
      if(options['presentation-case']==='denied'){
        await presentation.getByRole('alert').filter({hasText:'此处无法使用全屏，可继续在窗口中放映。'}).waitFor()
        assert.equal(await presentation.getByRole('button',{name:'此处无法使用全屏',exact:true}).getAttribute('aria-disabled'),'true')
        assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false)
        await presentation.focus();await page.keyboard.press('ArrowRight')
        await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.dataset.currentPage==='page-2')
        await page.keyboard.press('Escape');await presentation.waitFor({state:'detached'})
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-fullscreen-denied',chineseError:true,normalDisabledState:true,windowedPlaybackContinues:true,exitWorks:true,consoleOrPageErrors:errors}
      }
      await page.waitForFunction(() => document.fullscreenElement === document.documentElement, undefined, { timeout: 3000 })
      assert.equal(await page.locator('[data-current-page]').getAttribute('data-current-page'), 'page-1')
      if(options['presentation-case']==='blocked'){
        await page.evaluate(()=>{window.open=()=>null})
        await page.getByRole('button',{name:'显示讲者备注（将离开全屏，点击画面可返回）',exact:true}).click()
        assert.equal(await page.locator('.native-presentation-notes').innerText(),'全屏与演讲者控制备注。')
        const warning=presentation.getByRole('status').filter({hasText:'演讲者窗口未能打开，讲者备注已显示在放映窗口中。'})
        await warning.waitFor({timeout:3000})
        assert.equal(await warning.evaluate(element=>{const rect=element.getBoundingClientRect();return element.contains(element.ownerDocument.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2))}),true)
        assert.equal(await page.evaluate(()=>document.fullscreenElement===document.documentElement),true)
        await page.getByRole('button',{name:'隐藏讲者备注',exact:true}).click()
        assert.equal(await page.locator('.native-presentation-notes').count(),0)
        await page.getByRole('button',{name:'退出放映',exact:true}).click()
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-present-speaker-blocked',dockedFallback:true,chineseNoticeActuallyVisible:true,fullscreenRetained:true,noPopup:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['presentation-case']==='owner-unmount'){
        await page.evaluate(()=>window.__nativeUiRoot.unmount())
        await page.waitForFunction(()=>!document.fullscreenElement)
        assert.equal(await page.locator('[data-native-artifact-editor]').count(),0)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-presentation-owner-unmount',fullscreenCleaned:true,ownerUnmounted:true,noWrites:true,consoleOrPageErrors:errors}
      }
      await page.getByRole('button', { name: '退出全屏（F）', exact: true }).click()
      await page.waitForFunction(() => !document.fullscreenElement)
      assert.equal(await presentation.isVisible(), true)
      await presentation.focus()
      await page.keyboard.press('f')
      await page.waitForFunction(() => !!document.fullscreenElement)
      const popupPromise = page.waitForEvent('popup')
      await page.getByRole('button', { name: '显示讲者备注（将离开全屏，点击画面可返回）', exact: true }).click()
      const speaker = await popupPromise
      await speaker.getByRole('region', { name: '讲者备注', exact: true }).waitFor()
      await page.waitForFunction(() => !document.fullscreenElement)
      await page.bringToFront()
      await page.mouse.move(width/2-48.5,height-35)
      await page.screenshot({path:join(output,'popup-open.png')})
      await page.locator('.native-slides-presentation-stage').click({position:{x:width*.85,y:Math.min(300,height/2)}})
      await page.waitForFunction(() => document.fullscreenElement === document.documentElement)
      assert.equal(await page.locator('[data-current-page]').getAttribute('data-current-page'), 'page-1', '首次画面点击只恢复全屏')
      await page.getByRole('button', { name: '关闭讲者备注窗口', exact: true }).click()
      assert.equal(speaker.isClosed(), true)
      await page.locator('.native-slides-presentation-stage').click({position:{x:width*.85,y:Math.min(300,height/2)}})
      await page.waitForFunction(() => document.querySelector('[data-current-page]')?.dataset.currentPage === 'page-2')
      await page.locator('.native-slides-presentation-stage').click({position:{x:width*.1,y:Math.min(300,height/2)}})
      await page.waitForFunction(() => document.querySelector('[data-current-page]')?.dataset.currentPage === 'page-1')
      const controls = page.getByRole('navigation', { name: '放映控制', exact: true })
      await page.mouse.move(width/2,height-35)
      const geometry = await controls.boundingBox()
      assert.equal(geometry.height,40)
      assert.equal(geometry.width,217)
      assert.equal(geometry.y,height-60)
      assert.equal(geometry.x,(width-217)/2)
      assert.equal(await controls.getByRole('button', { name: '上一页', exact: true }).isDisabled(), false)
      const notesControl=controls.getByRole('button',{name:'显示讲者备注（将离开全屏，点击画面可返回）',exact:true})
      await presentation.focus()
      for(let index=0;index<3;index++)await page.keyboard.press('Tab')
      assert.equal(await notesControl.evaluate(element=>element===element.ownerDocument.activeElement),true)
      const tip=controls.getByRole('tooltip',{name:'显示讲者备注（将离开全屏，点击画面可返回）',exact:true})
      await tip.waitFor();const tipRect=await tip.boundingBox();assert.ok(tipRect.x>=7.9&&tipRect.x+tipRect.width<=width-7.9)

      await presentation.focus()
      await page.mouse.move(width*.85,Math.min(300,height/2))
      await controls.waitFor({state:'attached'})
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.native-present-controls')).opacity === '0')
      await page.screenshot({path:join(output,'regular-idle.png')})
      await page.keyboard.press('Tab')
      assert.equal(await controls.getByRole('button',{name:'上一页',exact:true}).evaluate(element=>element===element.ownerDocument.activeElement),true)
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.native-present-controls')).opacity === '1')
      await controls.getByRole('tooltip',{name:'上一页',exact:true}).waitFor()
      await page.screenshot({path:join(output,'regular-keyboard.png')})
      await page.keyboard.press('Shift+Tab')
      assert.equal(await controls.getByRole('button',{name:'退出放映',exact:true}).evaluate(element=>element===element.ownerDocument.activeElement),true)
      await page.keyboard.press('Escape')
      await presentation.waitFor({state:'detached'})
      await page.waitForFunction(() => !document.fullscreenElement)
      assert.equal(receipts.length,0)
      assert.deepEqual(errors,[])
      return {kind:'isolated-slide-presentation-controls',fixtureSemanticSha256:createHash('sha256').update(JSON.stringify(document)).digest('hex'),theme:options['canvas-theme']??'light',regularAutoFullscreen:true,fullscreenToggle:true,popupFromPresentation:true,returnClickDoesNotAdvance:true,stageLeftBackRightNext:true,controlsGeometry:geometry,idleHidden:true,keyboardFocusVisibleAndTrapped:true,exitCleansFullscreen:true,noWrites:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='slide-transitions'&&options['presentation-executable-target']==='true'){
      await page.evaluate(()=>{window.__motionEmbedStarts=0;window.__overlayEmbedPeak=0;window.addEventListener('message',event=>{if(event.data?.type==='native-motion-embed-start')window.__motionEmbedStarts++});new MutationObserver(()=>{window.__overlayEmbedPeak=Math.max(window.__overlayEmbedPeak,document.querySelectorAll('.native-magic-overlay iframe').length)}).observe(document.body,{childList:true,subtree:true})})
      await page.getByLabel('显示属性',{exact:true}).click();await page.locator('.native-transition-menu>summary').click();await page.getByRole('menuitemradio',{name:'神奇移动',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      await startSlides();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await show.press('ArrowRight');await page.waitForFunction(()=>window.__motionEmbedStarts>=1);await page.waitForFunction(()=>!document.querySelector('.native-slides-presentation-outgoing'));await page.waitForTimeout(250)
      const observation=await page.evaluate(()=>({starts:window.__motionEmbedStarts,maximumOverlayIframes:window.__overlayEmbedPeak,currentIframes:document.querySelectorAll('.native-slides-presentation-current iframe').length}))
      assert.deepEqual(observation,{starts:1,maximumOverlayIframes:0,currentIframes:1},'目标配对组新增隔离内容时也必须只执行一次')
      await show.press('Escape');assert.deepEqual(errors,[]);return{kind:'isolated-motion-executable-target',observation,consoleOrPageErrors:errors}
    }
    if(options.checks==='slide-speaker'){
      assert.equal(kind,'slides');assert.equal(speakerModuleRequests,0,'演讲者组件在普通编辑时不加载')
      if(options['speaker-case']==='notes-main'){
        await page.getByRole('button',{name:'讲者备注',exact:true}).click();const field=page.getByRole('textbox',{name:'讲者备注',exact:true}),local='主备注与讲者窗口共享的未提交草稿。';await field.fill(local);const refresh=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/editor-context')&&request.postDataJSON()?.version==='1');fixtureWrite=false;document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{title:'权限撤回'}}])).document;await refresh;assert.equal(await field.inputValue(),local);assert.equal(await field.getAttribute('readonly'),'');await page.getByRole('button',{name:'关闭备注',exact:true}).click();await page.getByRole('alert').filter({hasText:'本地备注草稿已保留'}).waitFor();assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),'draft');await page.getByLabel('导出格式',{exact:true}).click();await page.getByRole('button',{name:'网页',exact:true}).click();await page.getByRole('alert').filter({hasText:'导出前需保存本地修改'}).waitFor();await page.getByLabel('放映',{exact:true}).click();const opening=page.waitForEvent('popup');await page.getByRole('menuitem',{name:'使用演讲者视图放映',exact:true}).click();const popup=await opening;await popup.getByRole('region',{name:'讲者备注',exact:true}).filter({hasText:local}).waitFor();assert.equal(receipts.length,0);assert.deepEqual(errors,[]);return{kind:'isolated-main-and-speaker-note-draft',mainDraftRetainedAfterReadOnly:true,mainRecoveryVisible:true,popupShowsSameDraft:true,exportDoesNotSilentlyOmitDraft:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['speaker-case']==='coarse'){await page.getByRole('button',{name:'放映',exact:true}).click();await page.getByRole('region',{name:'幻灯片放映',exact:true}).waitFor();assert.equal(await page.locator('.native-presentation-notes').innerText(),'第一点：介绍设计。\n第二点：说明交互。');assert.equal(page.context().pages().length,1);assert.equal(speakerModuleRequests,0);assert.deepEqual(errors,[]);return{kind:'isolated-speaker-coarse-pointer',directPresentationWithDockedNotes:true,noPopup:true,consoleOrPageErrors:errors}}
      if(options['speaker-case']==='executable-preview'){await page.waitForFunction(()=>window.__speakerProgramStarts>=1);await page.evaluate(()=>{window.__speakerProgramStarts=0})}
      if(options['speaker-case']==='all-skipped'){assert.equal(await page.getByLabel('放映',{exact:true}).getAttribute('aria-disabled'),'true');assert.equal(speakerModuleRequests,0);return{kind:'isolated-speaker-all-skipped',presentDisabled:true,consoleOrPageErrors:errors}}
      if(options['speaker-case']==='skipped-current')await select(2)
      if(options['speaker-case']==='blocked')await page.evaluate(()=>{window.open=()=>null})
      if(options['speaker-case']==='module-error')await page.route('**/SlidesSpeaker.tsx*',route=>route.abort('failed'))
      await page.getByLabel('放映',{exact:true}).click()
      const speakerAction=page.getByRole('menuitem',{name:'使用演讲者视图放映',exact:true})
      await speakerAction.waitFor({timeout:5000})
      if(options['speaker-case']==='no-notes'){assert.equal(await speakerAction.isDisabled(),true);assert.equal(speakerModuleRequests,0);return{kind:'isolated-speaker-no-notes',speakerDisabled:true,consoleOrPageErrors:errors}}
      if(options['speaker-case']==='blocked'){
        await speakerAction.click();await page.getByRole('region',{name:'幻灯片放映',exact:true}).waitFor();assert.equal(await page.locator('.native-presentation-notes').innerText(),'第一点：介绍设计。\n第二点：说明交互。');assert.equal(speakerModuleRequests,0);await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();assert.deepEqual(errors,[]);return{kind:'isolated-speaker-blocked',dockedNotesFallback:true,consoleOrPageErrors:errors}
      }
      const popupPromise=page.waitForEvent('popup')
      await speakerAction.click()
      const speaker=await popupPromise
      speaker.on('pageerror',error=>errors.push(error.message))
      if(options['speaker-case']==='module-error'){
        await page.getByRole('alert').filter({hasText:'演讲者视图未能加载'}).waitFor();assert.equal(speaker.isClosed(),true);assert.equal(await page.getByRole('region',{name:'幻灯片放映',exact:true}).isVisible(),true);return{kind:'isolated-speaker-module-error',audienceViewRetained:true,popupClosed:true,expectedNetworkErrors:errors.filter(text=>text==='Failed to load resource: net::ERR_FAILED'),consoleOrPageErrors:errors.filter(text=>text!=='Failed to load resource: net::ERR_FAILED')}
      }
      if(options['speaker-case']==='skipped-current'){
        await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-current-page]').dataset.currentPage==='page-3');assert.equal(await speaker.locator('[data-speaker-position]').innerText(),'第 2 / 2 页');await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();await speaker.getByRole('region',{name:'讲者备注等待视图',exact:true}).waitFor();assert.equal(speaker.isClosed(),false);await speaker.close();assert.deepEqual(errors,[]);return{kind:'isolated-speaker-skipped-current',startedAtNextPresentable:true,consoleOrPageErrors:errors}
      }
      if (options['speaker-case'] === 'notes-repeat-save') {
        await speaker.getByRole('region', { name: '讲者备注', exact: true }).waitFor()
        await speaker.getByRole('switch', { name: '编辑备注', exact: true }).click()
        const field = speaker.getByRole('textbox', { name: '讲者备注', exact: true })
        const first = '第一次按快捷键保存的备注。', second = `${first}继续输入并再次保存。`
        for (const [index, text] of [first, second].entries()) {
          await field.fill(text)
          await field.press('Control+s')
          await page.waitForFunction(() => ['saved', 'conflict'].includes(document.querySelector('[data-save-state]')?.dataset.saveState))
          assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'), 'saved')
          assert.equal(document.pages['page-1'].notes, text)
          assert.equal(receipts.length, index + 1)
          assert.equal(await field.evaluate(element => element.ownerDocument.activeElement === element), true)
        }
        assert.equal(await speaker.getByRole('alert').count(), 0)
        assert.deepEqual(errors, [])
        return { kind: 'isolated-speaker-repeat-save', bothSavesCommitted: true, focusRetained: true, noSelfConflict: true, consoleOrPageErrors: errors }
      }
      if (options['speaker-case'] === 'notes-stale-refocus') {
        await speaker.getByRole('region', { name: '讲者备注', exact: true }).waitFor()
        await speaker.getByRole('switch', { name: '编辑备注', exact: true }).click()
        const field = speaker.getByRole('textbox', { name: '讲者备注', exact: true }), remote = '远端已经保存的全新备注。'
        const refreshed = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/editor-context') && request.postDataJSON()?.version === '1')
        document = applyOperations(document, prepareBatch(document, [{ type: 'page.patch', pageId: 'page-1', patch: { notes: remote } }])).document
        await refreshed
        await speaker.getByRole('button', { name: '暂停', exact: true }).click()
        await field.focus()
        assert.equal(await field.inputValue(), remote, '无本地草稿时重新聚焦必须显示远端备注')
        await field.press('End')
        await field.press('!')
        await field.press('Control+s')
        await page.waitForFunction(() => document.querySelector('[data-save-state]')?.dataset.saveState === 'saved')
        assert.equal(document.pages['page-1'].notes, `${remote}!`)
        assert.equal(receipts.length, 1)
        assert.equal(await speaker.getByRole('alert').count(), 0)
        assert.deepEqual(errors, [])
        return { kind: 'isolated-speaker-stale-refocus', remoteTextRetained: true, editUsesMatchingBase: true, consoleOrPageErrors: errors }
      }
      if(options['speaker-case']==='notes-compose-close'){
        await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor();await speaker.getByRole('switch',{name:'编辑备注',exact:true}).click();const field=speaker.getByRole('textbox',{name:'讲者备注',exact:true}),local='窗口关闭后保留的中文组字草稿。';await field.dispatchEvent('compositionstart');await field.fill(local);await speaker.close();await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='draft');assert.equal(receipts.length,0);await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();await page.getByLabel('放映',{exact:true}).click();const opening=page.waitForEvent('popup');await page.getByRole('menuitem',{name:'使用演讲者视图放映',exact:true}).click();const resumed=await opening;await resumed.getByRole('region',{name:'讲者备注',exact:true}).filter({hasText:local}).waitFor();assert.equal(receipts.length,0,'重开不能偷偷提交未结束的组字');await resumed.getByRole('button',{name:'重试保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.equal(receipts.length,1);assert.equal(document.pages['page-1'].notes,local);assert.deepEqual(errors,[]);return{kind:'isolated-speaker-composition-close',draftSurvivesPopup:true,notPrematurelyCommitted:true,explicitSaveWorks:true,consoleOrPageErrors:errors}
      }
      if(options['speaker-case']==='notes-write-denied'){
        await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor();await speaker.getByRole('switch',{name:'编辑备注',exact:true}).click();const local='只失去写权限后仍可恢复保存的备注。';await speaker.getByRole('textbox',{name:'讲者备注',exact:true}).fill(local);await speaker.keyboard.press('Control+s');await speaker.getByRole('alert').filter({hasText:'尚未保存'}).waitFor();assert.equal(receipts.length,0);const downloading=page.waitForEvent('download');await speaker.getByRole('button',{name:'下载本地副本',exact:true}).click();await(await downloading).saveAs(join(output,'notes-write-denied-recovery.json'));assert.equal(JSON.parse(await readFile(join(output,'notes-write-denied-recovery.json'),'utf8')).operations[0].operations[0].patch.notes,local);fixtureWrite=true;rejectSpeakerSave=false;await speaker.getByRole('button',{name:'重新检查权限',exact:true}).click();await speaker.getByRole('button',{name:'重试保存',exact:true}).waitFor();await speaker.getByRole('button',{name:'重试保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.equal(document.pages['page-1'].notes,local);assert.equal(receipts.length,1);assert.equal(new Set(speakerSaveIds).size,1);const expectedNetworkErrors=errors.filter(text=>/Failed to load resource:.*403/.test(text)),unexpected=errors.filter(text=>!/Failed to load resource:.*403/.test(text));assert.deepEqual(unexpected,[]);return{kind:'isolated-speaker-write-denied-retry',unsavedStatusRetainedAfterRead:true,backupContainsLocalNote:true,permissionRecheckedWithoutDocumentChange:true,originalOperationRetried:true,committedOnce:true,expectedNetworkErrors,consoleOrPageErrors:unexpected}
      }
      if(options['speaker-case']==='notes-denied'){
        await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor();await speaker.getByRole('switch',{name:'编辑备注',exact:true}).click();const field=speaker.getByRole('textbox',{name:'讲者备注',exact:true}),local='服务器拒绝写入时也必须能下载的备注。';await field.fill(local);await field.press('Control+s');await speaker.getByRole('alert',{name:'讲者备注恢复',exact:true}).waitFor();assert.equal(receipts.length,0);const downloading=page.waitForEvent('download');await speaker.getByRole('button',{name:'下载本地副本',exact:true}).click();await(await downloading).saveAs(join(output,'notes-denied-recovery.json'));const recovery=JSON.parse(await readFile(join(output,'notes-denied-recovery.json'),'utf8'));assert.equal(recovery.operations[0].operations[0].patch.notes,local);fixtureWrite=false;denySpeakerRead=false;const copied=page.waitForEvent('download');await speaker.getByRole('button',{name:'保留副本并重新载入',exact:true}).click();await copied;await speaker.getByRole('region',{name:'讲者备注等待视图',exact:true}).waitFor();assert.equal(document.pages['page-1'].notes,'第一点：介绍设计。\n第二点：说明交互。');assert.equal(receipts.length,0);const expectedNetworkErrors=errors.filter(text=>/Failed to load resource:.*403/.test(text)),unexpected=errors.filter(text=>!/Failed to load resource:.*403/.test(text));assert.deepEqual(unexpected,[]);return{kind:'isolated-speaker-denied-write-recovery',deniedByServer:true,popupRecoveryVisible:true,queuedTextDownloaded:true,noUnauthorizedWrite:true,readonlyDocumentRestored:true,expectedNetworkErrors,consoleOrPageErrors:unexpected}
      }
      if(options['speaker-case']==='notes-network'){
        await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor();await speaker.getByRole('switch',{name:'编辑备注',exact:true}).click();const field=speaker.getByRole('textbox',{name:'讲者备注',exact:true}),local='网络恢复后只保存一次的中文备注。';await field.fill(local);await field.press('Control+s');await speaker.getByRole('alert').filter({hasText:'未保存'}).waitFor();assert.equal(await field.inputValue(),local);assert.equal(receipts.length,0);assert.notEqual(document.pages['page-1'].notes,local);const downloading=page.waitForEvent('download');await speaker.getByRole('button',{name:'下载本地副本',exact:true}).click();await(await downloading).saveAs(join(output,'notes-network-recovery.json'));const recovery=JSON.parse(await readFile(join(output,'notes-network-recovery.json'),'utf8'));assert.equal(recovery.operations[0].operations[0].patch.notes,local);rejectSpeakerSave=false;await speaker.getByRole('button',{name:'重试保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.equal(document.pages['page-1'].notes,local);assert.equal(receipts.length,1);assert.equal(speakerSaveIds.length,2);assert.equal(speakerSaveIds[0],speakerSaveIds[1]);const expectedNetworkErrors=errors.filter(text=>/Failed to load resource:.*503/.test(text)),unexpected=errors.filter(text=>!/Failed to load resource:.*503/.test(text));assert.deepEqual(unexpected,[]);return{kind:'isolated-speaker-note-network-recovery',popupErrorVisible:true,queuedNoteRecovered:true,originalOperationIdRetried:true,committedOnce:true,expectedNetworkErrors,consoleOrPageErrors:unexpected}
      }
      if(['notes-permission','notes-permission-reload','notes-conflict','notes-equal'].includes(options['speaker-case'])){
        await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor();await speaker.getByRole('switch',{name:'编辑备注',exact:true}).click();const field=speaker.getByRole('textbox',{name:'讲者备注',exact:true}),local='必须保留且不能覆盖远端的中文讲者备注。';await field.fill(local)
        const refresh=page.waitForRequest(request=>new URL(request.url()).pathname.endsWith('/editor-context')&&request.postDataJSON()?.version==='1')
        if(['notes-permission','notes-permission-reload'].includes(options['speaker-case'])){fixtureWrite=false;document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{title:'远端权限变更'}}])).document}
        else document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-1',patch:{notes:options['speaker-case']==='notes-equal'?local:'远端已保存的备注。'}}])).document
        await refresh
        if(options['speaker-case']==='notes-equal'){await field.press('Control+s');await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.equal(document.pages['page-1'].notes,local);assert.equal(receipts.length,0);assert.equal(await speaker.getByRole('alert').count(),0);assert.deepEqual(errors,[]);return{kind:'isolated-speaker-equal-remote-note',noFalseConflict:true,noDuplicateWrite:true,consoleOrPageErrors:errors}}
        if(options['speaker-case']==='notes-conflict'){await field.press('Control+s');await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='conflict')}
        else await speaker.waitForFunction(()=>document.querySelector('[role="switch"]').disabled)
        await field.waitFor({state:'attached'});assert.equal(await field.inputValue(),local,'失去写权限或冲突时本地文字必须仍可读');assert.equal(await field.getAttribute('readonly'),'','保留只读输入，不丢弃本地草稿')
        await speaker.getByRole('alert').filter({hasText:/本地|保留/}).waitFor();assert.equal(receipts.length,0);assert.equal(await page.locator('[data-save-state]').getAttribute('data-save-state'),options['speaker-case']==='notes-conflict'?'conflict':'draft')
        const downloading=page.waitForEvent('download');await speaker.getByRole('button',{name:'下载本地副本',exact:true}).click();const download=await downloading;await download.saveAs(join(output,'notes-recovery.json'));const recovery=JSON.parse(await readFile(join(output,'notes-recovery.json'),'utf8'));assert.equal(recovery.speakerNoteDrafts['page-1'].text,local)
        await speaker.screenshot({path:join(output,'speaker-preserved-draft.png')})
        if(['notes-conflict','notes-permission-reload'].includes(options['speaker-case'])){
          const downloaded=page.waitForEvent('download');await speaker.getByRole('button',{name:'保留副本并重新载入',exact:true}).click();await downloaded;await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');const expected=options['speaker-case']==='notes-conflict'?'远端已保存的备注。':'第一点：介绍设计。\n第二点：说明交互。';await speaker.getByRole('region',{name:'讲者备注',exact:true}).filter({hasText:expected}).waitFor();assert.equal(document.pages['page-1'].notes,expected)
          if(options['speaker-case']==='notes-permission-reload'){await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();await page.getByLabel('导出格式',{exact:true}).click();const exporting=page.waitForEvent('download');await page.getByRole('button',{name:'网页',exact:true}).click();const file=await exporting;assert.ok(file.suggestedFilename().endsWith('.html'));assert.equal(receipts.length,0)}
        }else{
          await speaker.close();await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();await page.getByLabel('放映',{exact:true}).click();const opening=page.waitForEvent('popup');await page.getByRole('menuitem',{name:'使用演讲者视图放映',exact:true}).click();const resumed=await opening;await resumed.getByRole('region',{name:'讲者备注',exact:true}).filter({hasText:local}).waitFor();fixtureWrite=true;await resumed.getByRole('button',{name:'重新检查权限',exact:true}).click();await resumed.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);await resumed.getByRole('button',{name:'重试保存',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.equal(document.pages['page-1'].notes,local);assert.equal(document.pages['page-1'].title,'远端权限变更');assert.equal(receipts.length,1)
        }
        assert.deepEqual(errors,[]);return{kind:'isolated-speaker-'+options['speaker-case'],localDraftRetained:true,popupRecoveryVisible:true,recoveryDownloaded:true,remoteNotOverwritten:true,permissionRestoreRetries:options['speaker-case']==='notes-permission',readonlySavedDocumentExported:options['speaker-case']==='notes-permission-reload',consoleOrPageErrors:errors}
      }
      if(options['speaker-case']==='readonly'){
        await speaker.getByRole('switch',{name:'编辑备注',exact:true}).waitFor();assert.equal(await speaker.getByRole('switch',{name:'编辑备注',exact:true}).isDisabled(),true);const original=JSON.stringify(document);await speaker.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-current-page]').dataset.currentPage==='page-3');assert.equal(JSON.stringify(document),original);await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();await speaker.getByRole('region',{name:'讲者备注等待视图',exact:true}).waitFor();assert.equal(speaker.isClosed(),false);await speaker.close();assert.deepEqual(errors,[]);return{kind:'isolated-speaker-readonly',notesDisabled:true,navigationRetained:true,documentUnchanged:true,consoleOrPageErrors:errors}
      }
      if(options['speaker-case']==='preview-error'){
        const retry=speaker.getByRole('button',{name:'重新加载下一页预览',exact:true});await retry.waitFor();await speaker.screenshot({path:join(output,'speaker-preview-error.png')});assert.equal(pageReads.filter(id=>id==='page-3').length,1);speakerPreviewFailure=false;await retry.click();await speaker.getByRole('button',{name:'转到下一页',exact:true}).waitFor();await speaker.locator('[data-node-id="page-3-image"] img').waitFor();assert.equal(pageReads.filter(id=>id==='page-3').length,2);const expectedNetworkErrors=errors.filter(text=>/Failed to load resource:.*503/.test(text)),unexpected=errors.filter(text=>!/Failed to load resource:.*503/.test(text));assert.deepEqual(unexpected,[]);return{kind:'isolated-speaker-preview-recovery',attempts:2,recovered:true,expectedNetworkErrors,consoleOrPageErrors:unexpected}
      }
      if(options['speaker-case']==='executable-preview'){
        await speaker.locator('[data-node-id="speaker-embed"] img').waitFor();await page.waitForFunction(()=>window.__speakerProgramStarts>=1);await speaker.waitForTimeout(150);assert.equal(await speaker.locator('iframe').count(),0);assert.equal(await page.evaluate(()=>window.__speakerProgramStarts),1);assert.equal(await page.locator('.native-slides-presentation-current iframe').count(),1);assert.equal(document.pages['page-1'].nodes['speaker-embed'].type,'embed');assert.deepEqual(errors,[]);return{kind:'isolated-speaker-executable-preview',speakerUsesStaticSnapshot:true,speakerIframes:0,audienceIframes:1,programStarts:1,originalUnchanged:true,consoleOrPageErrors:errors}
      }
      if(options['speaker-case']==='visual'){
        await speaker.getByRole('button',{name:'暂停',exact:true}).click();await speaker.getByRole('button',{name:'重置',exact:true}).click();const screenshots=[]
        assert.equal(await speaker.getByRole('button',{name:'转到下一页',exact:true}).getAttribute('title'),'LingxiLoop 2','相同文档的预览标题应来自幻灯片正文标题')
        for(const [width,height]of [[1000,640],[1920,1200],[1440,1000],[768,1024],[390,844]]){
          await speaker.setViewportSize({width,height});await speaker.waitForFunction(w=>document.querySelector('.native-speaker').classList.contains('native-speaker-wide')===(w>=640),width)
          if(width>=640)await speaker.waitForFunction(()=>{const preview=document.querySelector('.native-speaker-current [data-speaker-preview]'),content=preview?.querySelector('.native-page-content');return content&&Math.abs(content.getBoundingClientRect().width-preview.clientWidth)<1&&[...document.images].length>=2&&[...document.images].every(img=>img.complete&&img.naturalWidth>0)})
          await speaker.evaluate(()=>document.fonts.ready);await speaker.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
          await speaker.screenshot({path:join(output,width+'x'+height+'.png')});screenshots.push({width,height,file:width+'x'+height+'.png'})
        }
        assert.deepEqual(errors,[]);return{kind:'isolated-speaker-visual-states',screenshots,qualification:false,consoleOrPageErrors:errors}
      }
      if(options['speaker-case']==='close-draft'){
        await speaker.getByRole('switch',{name:'编辑备注',exact:true}).click();await speaker.getByRole('textbox',{name:'讲者备注',exact:true}).fill('关闭讲者窗口前保留的中文备注。');await speaker.close();await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved');assert.equal(document.pages['page-1'].notes,'关闭讲者窗口前保留的中文备注。');assert.equal(await page.getByRole('region',{name:'幻灯片放映',exact:true}).isVisible(),true);assert.deepEqual(errors,[]);return{kind:'isolated-speaker-close-draft',savedOnClose:true,audienceContinues:true,consoleOrPageErrors:errors}
      }
      await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor()
      await writeFile(join(output,'speaker-layout.json'),JSON.stringify(await speaker.locator('.native-speaker,.native-speaker-left,.native-speaker-bar,.native-speaker-clock,.native-speaker-current>.native-speaker-preview,.native-speaker-adjacent,.native-speaker-head,.native-speaker-notes').evaluateAll(es=>es.map(e=>{const style=getComputedStyle(e);return{class:e.className,rect:e.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight}})),null,2))
      assert.deepEqual(speaker.viewportSize(),{width:1000,height:640})
      await page.locator('.native-slides-presentation').waitFor()
      assert.equal(await speaker.getByRole('region',{name:'讲者备注',exact:true}).innerText(),'第一点：介绍设计。\n第二点：说明交互。')
      await speaker.getByRole('button',{name:'暂停',exact:true}).hover();assert.equal(await speaker.getByRole('button',{name:'暂停',exact:true}).evaluate(element=>getComputedStyle(element).backgroundColor),'rgba(255, 255, 255, 0.1)');assert.equal(await speaker.getByRole('button',{name:'上一页',exact:true}).evaluate(element=>getComputedStyle(element).opacity),'1')
      await speaker.getByRole('button',{name:'暂停',exact:true}).click()
      const paused=await speaker.locator('[data-speaker-clock]').innerText()
      await speaker.waitForTimeout(1100)
      assert.equal(await speaker.locator('[data-speaker-clock]').innerText(),paused)
      await speaker.getByRole('button',{name:'重置',exact:true}).click()
      assert.equal(await speaker.locator('[data-speaker-clock]').innerText(),'0:00')
      await speaker.getByRole('button',{name:'继续',exact:true}).click()
      await speaker.getByRole('switch',{name:'编辑备注',exact:true}).click()
      const notes=speaker.getByRole('textbox',{name:'讲者备注',exact:true})
      const text='中文演讲备注：第一部分。'
      await notes.fill(text)
      await notes.dispatchEvent('compositionstart')
      await notes.fill(text+'正在输入')
      await page.keyboard.press('Control+s')
      assert.notEqual(document.pages['page-1'].notes,text+'正在输入','中文组字未结束时不得提前提交')
      await notes.dispatchEvent('compositionend')
      await notes.press('Escape')
      await speaker.getByRole('region',{name:'讲者备注',exact:true}).waitFor()
      assert.equal(await page.getByRole('region',{name:'幻灯片放映',exact:true}).isVisible(),true,'讲者备注中的Escape只结束编辑，不关闭放映')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].notes,text+'正在输入')
      await speaker.getByRole('button',{name:'下一页',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-current-page]').dataset.currentPage==='page-3')
      assert.equal(await speaker.locator('[data-speaker-position]').innerText(),'第 2 / 2 页')
      await speaker.keyboard.press('ArrowLeft')
      await page.waitForFunction(()=>document.querySelector('[data-current-page]').dataset.currentPage==='page-1')
      await speaker.getByRole('region',{name:'讲者备注',exact:true}).filter({hasText:text}).waitFor()
      await speaker.screenshot({path:join(output,'speaker-wide.png')})
      await speaker.keyboard.press('Tab');await speaker.getByRole('region',{name:'讲者备注',exact:true}).focus();const focus=await speaker.getByRole('region',{name:'讲者备注',exact:true}).evaluate(element=>({visible:element.matches(':focus-visible'),outline:getComputedStyle(element).outlineWidth,outlineStyle:getComputedStyle(element).outlineStyle,shadow:getComputedStyle(element).boxShadow}));await writeFile(join(output,'speaker-focus.json'),JSON.stringify({focus,styles:await speaker.getByRole('region',{name:'讲者备注',exact:true}).evaluate(element=>({class:element.className,forced:matchMedia('(forced-colors:active)').matches,matches:[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].filter(rule=>rule.selectorText&&element.matches(rule.selectorText)).map(rule=>rule.cssText)}catch{return []}})}))},null,2));assert.equal(focus.visible,true);assert.equal(focus.outlineStyle,'none');assert.match(focus.shadow,/inset/);
      await speaker.setViewportSize({width:390,height:844})
      await speaker.waitForFunction(()=>!document.querySelector('[data-speaker-preview]'))
      assert.equal(await speaker.locator('[data-speaker-preview]').first().isVisible(),false)
      await speaker.screenshot({path:join(output,'speaker-narrow.png')})
      await speaker.close()
      assert.equal(await page.locator('.native-slides-presentation').isVisible(),true,'关闭讲者窗口继续主窗口放映')
      await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click()
      await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+z')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].notes,'第一点：介绍设计。\n第二点：说明交互。')
      await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+Shift+z')
      await page.waitForFunction(()=>document.querySelector('[data-save-state]').dataset.saveState==='saved')
      await page.reload();await ready(1)
      await page.getByLabel('放映',{exact:true}).click()
      const secondPopup=page.waitForEvent('popup');await page.getByRole('menuitem',{name:'使用演讲者视图放映',exact:true}).click()
      const reopened=await secondPopup
      await reopened.getByRole('region',{name:'讲者备注',exact:true}).filter({hasText:text}).waitFor()
      await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();await reopened.getByRole('region',{name:'讲者备注等待视图',exact:true}).waitFor();assert.equal(reopened.isClosed(),false);await reopened.screenshot({path:join(output,'speaker-waiting.png')})
      await select(3);await reopened.getByRole('region',{name:'讲者备注等待视图',exact:true}).filter({hasText:'LingxiLoop 3'}).waitFor()
      const popupCount=page.context().pages().length;await startSlides();await reopened.getByRole('button',{name:'暂停',exact:true}).waitFor();assert.equal(page.context().pages().length,popupCount,'已有讲者窗口应随再次放映恢复，不新增窗口')
      await revealPresentationControls();await page.getByRole('button',{name:'退出放映',exact:true}).click();await reopened.getByRole('region',{name:'讲者备注等待视图',exact:true}).waitFor();await reopened.close()
      assert.ok(speakerModuleRequests>0);assert.deepEqual(errors,[])
      return{kind:'isolated-slide-speaker',popupSize:{width:1000,height:640},timer:true,sharedNavigation:true,skippedPageOmitted:true,notesSaveReopenUndoRedo:true,compositionProtected:true,compactPreviewHidden:true,waitingViewFollowsSelection:true,existingWindowReused:true,consoleOrPageErrors:errors}
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
            await startSlides();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await show.focus()
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
        await startSlides();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await show.focus()
        const trail=[]
        for(let n=0;n<20;n++){await page.keyboard.press('Tab');const state=await page.evaluate(()=>({tag:document.activeElement?.tagName,outerRoot:document.activeElement?.matches('[data-native-artifact-editor]'),label:document.activeElement?.getAttribute('aria-label')}));trail.push(state);if(state.outerRoot)break}
        await page.keyboard.press('Control+z');await page.waitForTimeout(150)
        await writeFile(join(output,'presentation-tab.json'),JSON.stringify({trail,seqBefore:JSON.parse(saved).seq,seqAfter:document.seq,historyRequests},null,2))
        assert.deepEqual(historyRequests,[],'放映Tab循环不能撤销底层文档');assert.equal(JSON.stringify(document),saved)
        assert.equal(await root.getAttribute('tabindex'),'-1')
        await root.focus();for(const key of ['Control+z','Control+y','Delete','Backspace'])await page.keyboard.press(key)
        await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:baseUrl});await page.evaluate(()=>navigator.clipboard.writeText('放映期间不能插入的文字'));await page.keyboard.press('Control+v');await page.waitForTimeout(150)
        assert.deepEqual(historyRequests,[]);assert.equal(JSON.stringify(document),saved);assert.equal(await show.count(),1)
        await page.keyboard.press('Control+s');await page.keyboard.press('Escape');await page.getByLabel('放映',{exact:true}).waitFor();assert.equal(await root.getAttribute('tabindex'),'0');assert.equal(JSON.stringify(document),saved);assert.deepEqual(errors,[])
        return{kind:'isolated-presentation-keyboard-isolation',trustedTabCannotUndo:true,programmaticOuterFocusCannotEditOrPaste:true,rootExcludedFromTabOrder:true,saveAndEscapePreserved:true,consoleOrPageErrors:errors}
      }
      if(options['presentation-focus-return']==='true'){
        const focus=[]
        for(let opening=0;opening<2;opening++){
          await startSlides();const show=page.getByRole('region',{name:'幻灯片放映',exact:true});await show.waitFor();await page.waitForTimeout(100)
          focus.push(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')))
          assert.equal(focus.at(-1),'幻灯片放映','冷/热模块放映均须保留键盘焦点')
          await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')==='page-2');await page.keyboard.press('Escape');await page.getByLabel('放映',{exact:true}).waitFor();await select(1)
        }
        assert.deepEqual(errors,[]);return{kind:'isolated-presentation-focus-return',coldAndWarmFocus:focus,keyboardNavigationWithoutForcedFocus:true,consoleOrPageErrors:errors}
      }
      assert.equal(kind,'slides');assert.equal(presentationModuleRequests,0,'放映代码在普通编辑时不加载')
      const waitSaved=()=>page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      const root=page.locator('[data-native-artifact-editor]'),records=[]
      await page.addInitScript(()=>{window.__slideAnimations=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,timing){window.__slideAnimations.push({nodeId:this.getAttribute('data-node-id'),className:this.className,frames,timing});return animate.call(this,frames,timing)}})
      await page.getByLabel('显示属性',{exact:true}).click()
      await page.getByRole('complementary',{name:'属性面板',exact:true}).getByRole('tab',{name:'属性',exact:true}).waitFor()
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
        await startSlides()
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
        await presentation.press('Escape');await page.getByLabel('放映',{exact:true}).waitFor();records.push({kind,duration,forwardAnimations:forward.length,backwardAnimations:backward.length})
      }
      await page.emulateMedia({reducedMotion:'reduce'});await startSlides();const presentation=page.getByRole('region',{name:'幻灯片放映',exact:true});await presentation.waitFor();await page.evaluate(()=>{window.__slideAnimations=[]});await presentation.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(id=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')===id,copyId);assert.deepEqual(await page.evaluate(()=>window.__slideAnimations),[])
      assert.equal(await presentation.getByRole('button',{name:/^显示讲者备注/}).count(),document.pageOrder.some(id=>document.pages[id].notes.trim())?1:0);assert.equal(await presentation.getByRole('textbox').count(),0)
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
    if (options.checks === 'slides-skipped-export') {
      const before = JSON.stringify(document), exports = [], navigationCountBeforeExport = exportNavigations.length
      await page.getByLabel('导出格式', { exact: true }).click()
      if (options['export-case'] === 'all-skipped') {
        for (const name of ['便携文档', '网页', '演示文稿']) {
          const item = page.getByRole('button', { name, exact: true })
          assert.equal(await item.isDisabled(), true)
          assert.equal(await item.getAttribute('title'), '所有页面均已跳过，请先恢复至少一页。')
        }
        assert.equal(await page.getByRole('button', { name: '当前页面 · 透明位图', exact: true }).isDisabled(), false)
        assert.equal(receipts.length, 0)
        assert.deepEqual(errors, [])
        return { kind: 'isolated-slides-skipped-export-disabled', wholeDeckDisabled: true, selectedImageStillAvailable: true, chineseReason: true, consoleOrPageErrors: errors }
      }
      await page.keyboard.press('Escape')
      const { default: JSZip } = await import('jszip')
      for (const [name, format] of [['网页', 'html'], ['便携文档', 'pdf'], ['演示文稿', 'pptx']]) {
        await page.getByLabel('导出格式', { exact: true }).click()
        const downloading = page.waitForEvent('download')
        await page.getByRole('button', { name, exact: true }).click()
        let file
        try { file = await downloading } catch (error) {
          await writeFile(join(output, 'export-failure.json'), JSON.stringify({format, exportNavigations, attempts: await page.evaluate(() => window.__exportDownloadAttempts), errors, notice: await page.locator('.native-notice').allTextContents(), alerts: await page.getByRole('alert').allTextContents(), status: await page.getByRole('status').allTextContents()}, null, 2))
          throw error
        }
        const bytes = await readFile(await file.path())
        assert.ok(file.suggestedFilename().endsWith(`.${format}`))
        if (format === 'html') {
          const html = bytes.toString()
          assert.equal((html.match(/<article(?:\s|>)/g) ?? []).length, 2)
          assert.ok(!html.includes('LingxiLoop 2') && !html.includes('不应导出') && !html.includes('不应执行'))
        } else if (format === 'pdf') assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length, 2)
        else {
          const archive = await JSZip.loadAsync(bytes)
          const slides = Object.keys(archive.files).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
          assert.equal(slides.length, 2)
          const text = (await Promise.all(Object.values(archive.files).filter(file => file.name.endsWith('.xml')).map(file => file.async('string')))).join('')
          assert.ok(!text.includes('LingxiLoop 2') && !text.includes('不应导出'))
        }
        exports.push({ format, pages: 2, bytes: bytes.length })
        await page.waitForFunction(() => !document.querySelector('[data-artifact-export-realm]'))
      }
      assert.equal(JSON.stringify(document), before)
      assert.equal(receipts.length, 0)
      assert.deepEqual(errors, [])
      assert.equal(exportNavigations.length, navigationCountBeforeExport, '导出期间测试页不能重载')
      assert.equal(await page.evaluate(() => window.__exportDownloadAttempts.length), 3)
      return { kind: 'isolated-slides-skipped-export', noFixtureReload: true, exports, skippedEmbedNeverCaptured: true, sourceSnapshotUnchanged: true, consoleOrPageErrors: errors }
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
          const labelMetrics=await page.locator('.native-board-heading>.native-board-label').evaluateAll(es=>es.map(e=>{const range=document.createRange();range.selectNodeContents(e);const s=getComputedStyle(e);return{rect:e.getBoundingClientRect().toJSON(),textRect:range.getBoundingClientRect().toJSON(),fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,color:s.color,borderRadius:s.borderRadius}})),labels=labelMetrics.map(label=>label.textRect);geometry.labelTextRects=labels;geometry.labelMetrics=labelMetrics
          for(let i=0;i<geometry.surfaces.length;i++){
            const actual=geometry.surfaces[i].children.find(child=>child.shadow!=='none'),expected=sample.surfaces[i].surface;assert.ok(actual,'每个画板在缩略视图也应保留参考阴影');assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);assert.equal(actual.shadow.includes('oklab('),expected.shadow.includes('oklab('),'松散路径编辑应保留参考的画板焦点描边');assert.ok(actual.shadow.includes('0px 2px 4px 0px')&&actual.shadow.includes('0px 6px 16px 0px'),'缩略画板保持自然尺寸下的参考模糊几何');assert.ok(Math.abs(labels[i].x-sample.surfaces[i].labelTextRect.x)<=1,'画板标题文字的左边缘应与源码相差1px以内');const sourceLabel=sample.controls.find(control=>control.label.startsWith(`Artboard ${i+1} of `));assert.ok(sourceLabel);for(const key of ['x','y','width','height'])assert.ok(Math.abs(labelMetrics[i].rect[key]-sourceLabel.rect[key])<=1,`画板标题控件${key}应符合源码：实际${labelMetrics[i].rect[key]}，参考${sourceLabel.rect[key]}`);for(const key of ['fontSize','fontWeight','lineHeight','color'])assert.equal(labelMetrics[i][key],sourceLabel[key],`画板标题${key}应符合源码`);assert.equal(labelMetrics[i].borderRadius,sourceLabel.radius,'画板标题圆角应符合源码')
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
      await page.locator('.native-board-label').first().click()
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
      await page.locator('[data-page-id="page-1"] .native-board-label').click()
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.getAttribute('data-save-state')==='saved')
      await page.waitForTimeout(1000)
      assert.ok(document.pages['page-1'].height>=1000&&document.pages['page-1'].height<=1003,'a flow board grows despite boards on another canvas')
      assert.equal(pageHash(document.pages['page-2']),initialPageHashes['page-2'],'flow growth must not move or change boards on another canvas')
      assert.deepEqual(errors,[])
      return{kind:'isolated-canvas-flow-diagnostic',mode:kind,otherCanvasOverlaps:!!options['flow-overlap'],height:document.pages['page-1'].height,otherCanvasHashUnchanged:true,scope:'actual React, Worker geometry, content measurement and shared operations; controlled HTTP fixture',consoleOrPageErrors:errors}
    }
    if(options.checks==='board-transform'&&editorCase==='gap-vertical')document.pageOrder.forEach((id,index)=>{document.pages[id].x=0;document.pages[id].y=index*1240})
  if(options.checks==='board-transform'&&editorCase==='cross-canvas'){document.canvasPages=[{id:'canvas-page-1',name:'页面 1'},{id:'second',name:'页面 2'}];document.pages['page-3'].canvasPageId='second'}
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
      await page.setViewportSize({width:900,height:1000});if(kind==='design')await page.locator('.native-board-label').first().click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByRole('button',{name:'背景',exact:true}).click();await page.getByRole('dialog',{name:'背景颜色',exact:true}).waitFor()
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
      const outside=page.getByRole('tab',{name:'属性',exact:true})
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
    if(options.checks==='page-radius'){
      assert.equal(kind,'design');const originalNodes=JSON.stringify(document.pages['page-1'].nodes)
      await page.locator('[data-page-id="page-1"] .native-board-label').click();await page.getByRole('button',{name:'显示属性',exact:true}).click()
      const radius=page.getByLabel('圆角',{exact:true}),content=page.locator('[data-page-id="page-1"] [data-content-layer]:not(.native-canvas-content)')
      const captureRadius=async name=>{await page.waitForFunction(()=>{const es=[...document.querySelectorAll('.native-stage .native-page-content:not(.native-canvas-content) img')];return es.length===3&&es.every(e=>e.complete&&e.naturalWidth>0)});await page.evaluate(()=>{document.activeElement?.blur();return document.fonts.ready});await page.mouse.move(10,100);await page.screenshot({path:join(output,`radius-${name}.png`)})}
      await captureRadius('default')
      await radius.fill('80');await radius.press('Tab');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-page-id="page-1"] [data-content-layer]:not(.native-canvas-content)')).borderTopLeftRadius==='80px');await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].radius,80)
      await page.getByRole('button',{name:'分别设置圆角',exact:true}).click();await page.getByLabel('左上圆角',{exact:true}).fill('40');await page.getByLabel('左上圆角',{exact:true}).press('Tab');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-page-id="page-1"] [data-content-layer]:not(.native-canvas-content)')).borderTopLeftRadius==='40px');await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      await page.getByLabel('右下圆角',{exact:true}).fill('20');await page.getByLabel('右下圆角',{exact:true}).press('Tab');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-page-id="page-1"] [data-content-layer]:not(.native-canvas-content)')).borderBottomRightRadius==='20px');await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.deepEqual(document.pages['page-1'].radius,[40,80,20,80])
      await captureRadius('corners')
      await page.locator('[data-native-artifact-editor]').focus();await page.keyboard.press('Control+z');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-page-id="page-1"] [data-content-layer]:not(.native-canvas-content)')).borderBottomRightRadius==='80px')
      await page.keyboard.press('Control+Shift+z');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-page-id="page-1"] [data-content-layer]:not(.native-canvas-content)')).borderBottomRightRadius==='20px');await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      await page.reload();await ready(1);assert.equal(await content.evaluate(element=>getComputedStyle(element).borderRadius),'40px 80px 20px')
      assert.equal(JSON.stringify(document.pages['page-1'].nodes),originalNodes,'画板圆角不得改写内部对象')
      assert.equal(await content.evaluate(element=>getComputedStyle(element.closest('.native-page-scaled')).borderRadius),'40px 80px 20px','画板轮廓与阴影必须使用相同圆角')
      if(options['radius-case']==='jpeg'){
        const results=await page.evaluate(async({root,document})=>{
          const {exportDocument}=await import('/@fs'+root+'/src/features/artifacts/native/export/image.ts'),page={...document.pages['page-1'],nodes:{},nodeOrder:[],background:'#123456',radius:80},single={...document,pageOrder:[page.id],pages:{[page.id]:page},assets:{}}
          const results=[];for(const format of ['png','jpeg']){
            const result=await exportDocument(single,{format,pixelRatio:1}),image=new Image(),url=URL.createObjectURL(result.blob);image.src=url;await image.decode();const canvas=window.document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];const base64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(result.blob)});results.push({format,center:pixel(960,540),corner:pixel(0,0),warnings:result.warnings,base64});URL.revokeObjectURL(url)
          }return results
        },{root,document})
        for(const result of results){await writeFile(join(output,'empty-rounded.'+result.format),Buffer.from(result.base64,'base64'));delete result.base64}
        for(const result of results){assert.ok(result.center.slice(0,3).every((value,index)=>Math.abs(value-[18,52,86][index])<=2),'压缩位图必须保留画板原底色');assert.equal(result.corner[3],result.format==='png'?0:255);if(result.format==='jpeg')assert.ok(result.corner.slice(0,3).every(value=>value>=250),'圆角以外使用白色纸张')}
        assert.deepEqual(errors,[]);return{kind:'rounded-image-background',results,errors}
      }
      if(options['radius-case']==='preview'){
        await page.getByLabel('全窗口查看画板 Page 1',{exact:true}).click();const preview=page.getByRole('region',{name:'画板全窗口预览',exact:true});await preview.waitFor();await preview.locator('img').waitFor();await page.waitForTimeout(150)
        const records=await preview.locator('.native-board-preview-frame,.native-page-scaled,.native-page-content,.native-board-preview-viewport').evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return{class:e.className,box:e.getBoundingClientRect().toJSON(),radius:s.borderRadius,background:s.backgroundColor,shadow:s.boxShadow,overflow:s.overflow}}))
        assert.equal(records.find(row=>row.class==='native-board-preview-frame').radius,'40px 80px 20px','全窗口预览的裁切、底色与阴影使用同一圆角');assert.deepEqual(errors,[]);await page.screenshot({path:join(output,'rounded-board-preview.png')});return{kind:'rounded-board-preview',records,errors}
      }
      const exports=[]
      if(['exports','jpeg'].includes(options['radius-case'])){
        await page.locator('[data-page-id="page-1"] .native-board-label').click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByRole('button',{name:'背景',exact:true}).click()
        const picker=page.getByRole('dialog',{name:'背景颜色',exact:true});await picker.getByRole('button',{name:'自定义',exact:true}).click();const hex=picker.getByLabel('十六进制颜色',{exact:true});await hex.fill('#123456');await hex.press('Control+s');await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');await picker.getByLabel('关闭颜色选择',{exact:true}).click();assert.equal(document.pages['page-1'].background,'#123456')
        const pixels=async(bytes,type)=>page.evaluate(async({base64,type})=>{const image=new Image();image.src=`data:${type};base64,${base64}`;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);const at=(x,y)=>[...context.getImageData(Math.round(x),Math.round(y),1,1).data];return{width:canvas.width,height:canvas.height,corner:at(0,0),edge:at(canvas.width/2,0),topLeft:at(10*canvas.width/1920,10*canvas.height/1080),bottomRight:at(canvas.width-10*canvas.width/1920,canvas.height-10*canvas.height/1080)}},{base64:bytes.toString('base64'),type})
        const rounded=async(bytes,type)=>{const result=await pixels(bytes,type);assert.equal(result.corner[3],0);assert.equal(result.edge[3],255);assert.equal(result.topLeft[3],0);assert.equal(result.bottomRight[3],255);return result}
        for(const [format,label]of [['html','网页'],['pdf','便携文档'],['pptx','演示文稿'],['svg','当前画板 · 矢量图'],['png','当前画板 · 透明位图']]){
          await page.getByLabel('导出格式',{exact:true}).click();const done=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const download=await done,bytes=await readFile(await download.path());assert.ok(bytes.length>100);await writeFile(join(output,`radius.${format}`),bytes)
          const result={format,bytes:bytes.length}
          if(format==='html')assert.match(bytes.toString('utf8'),/border-radius:40px 80px 20px 80px/)
          if(format==='pdf'){assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const path=join(output,'pdf-page');execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to-x','1920','-scale-to-y','1080','-png',join(output,'radius.pdf'),path],{stdio:'pipe'});result.pixels=await pixels(await readFile(path+'.png'),'image/png');assert.ok(result.pixels.corner.slice(0,3).every(v=>v>=250));assert.ok(result.pixels.topLeft.slice(0,3).every(v=>v>=250));assert.ok(result.pixels.bottomRight[0]>=240&&result.pixels.bottomRight[2]<250);result.rasterizer='pdftoppm'}
          if(format==='png'||format==='svg')result.pixels=await rounded(bytes,format==='png'?'image/png':'image/svg+xml')
          if(format==='pptx'){
            const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(bytes),xml=await zip.file('ppt/slides/slide1.xml').async('string'),rels=await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string')
            assert.match(xml,/<p:bg>[\s\S]*?val="FFFFFF"/);assert.equal((xml.match(/<p:pic>/g)??[]).length,1,'圆角第一页使用完整裁切图片');assert.doesNotMatch(xml,/<a:t>/)
            const target=rels.match(/Target="\.\.\/media\/([^"<]+)"/)[1],image=await zip.file('ppt/media/'+target).async('nodebuffer');result.pixels=await rounded(image,'image/png')
            assert.ok((await page.locator('.native-notice').innerText()).includes('画板圆角以整页图片保留'))
          }
          exports.push(result)
        }
      }
      assert.deepEqual(errors,[]);return{kind:'isolated-page-radius',uniformAndCorners:true,savedAndReopened:true,sharedUndoRedo:true,nodesUnchanged:true,exports,consoleOrPageErrors:errors}
    }
    if(options.checks==='design-outline'){
      assert.equal(kind,'design')
      if(options['outline-case']==='menu'){
        await page.setViewportSize({width:390,height:844});await page.getByLabel('画布缩放',{exact:true}).click();await page.getByRole('button',{name:'图层',exact:true}).click()
        await page.getByRole('tab',{name:'图层',exact:true}).waitFor()
        assert.equal(await page.getByRole('tab',{name:'图层',exact:true}).getAttribute('aria-selected'),'true','首次从菜单打开图层必须保留请求的窄屏选项卡')
        assert.equal(await page.getByRole('tree',{name:'图层',exact:true}).isVisible(),true);assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-outline-menu',firstNarrowMenuOpenShowsTree:true,noWrites:true,consoleOrPageErrors:errors}
      }
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      await page.getByText('未选择任何内容',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'背景',exact:true}).count(),0)
      const tree=page.getByRole('tree',{name:'图层',exact:true})
      await tree.waitFor()
      if(options['outline-case']==='visual'){
        const screenshots=[]
        for(const [width,height]of [[1920,1200],[1440,1000],[768,1024],[390,844]])for(const theme of ['light','dark']){
          await page.setViewportSize({width,height});await page.reload({waitUntil:'domcontentloaded'});await ready(1)
          await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme)
          await page.locator('[data-native-artifact-editor]').evaluate((element,theme)=>element.setAttribute('data-theme',theme),theme)
          await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.getByRole('tab',{name:'属性',exact:true}).waitFor()
          for(const [state,label]of [['properties','属性'],['code','代码'],...(width<600?[['outline','图层']]:[])]){
            await page.getByRole('tab',{name:label,exact:true}).click();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120)
            const file=`design-outline-${width}-${theme}-${state}.png`;await page.screenshot({path:join(output,file)})
            screenshots.push({width,height,theme,state,file,panel:await page.getByRole('complementary',{name:'属性面板',exact:true}).boundingBox(),header:await page.locator('.native-inspector-header').boundingBox(),tree:await tree.isVisible()?await tree.boundingBox():null,rows:await tree.getByRole('treeitem').evaluateAll(es=>es.map(element=>({label:element.getAttribute('aria-label'),level:element.getAttribute('aria-level'),rect:element.getBoundingClientRect().toJSON()})))})
          }
        }
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-design-outline-visual',fixtureSemanticSha256:fixture.manifest.semanticSha256,renderingMode:'CSS1Compat',productThemeAncestor:true,screenshots,noWrites:true,matchedStateVerified:false,scope:'固定同层级文档；截图仍需独立几何/像素验收；微调等未完成状态没有获得资格',consoleOrPageErrors:errors}
      }
      const header=await page.locator('.native-inspector-header').boundingBox(),bounds=await tree.boundingBox()
      assert.ok(Math.abs(header.height-40)<=1,'Design面板标题高度应为40px')
      assert.ok(Math.abs(bounds.y-41)<=1&&Math.abs(bounds.height-168)<=1,'宽面板图层区应从41px开始且高168px')
      assert.equal(await tree.getAttribute('aria-multiselectable'),'true')
      const board=tree.getByRole('treeitem',{name:'Page 1',exact:true})
      assert.equal(await board.getAttribute('aria-expanded'),'true')
      if(options['outline-case']==='width-tools'){
        await page.setViewportSize({width:600,height:844});const grip=page.getByRole('separator',{name:'调整属性面板宽度',exact:true});await grip.focus();await grip.press('End');await page.waitForFunction(()=>document.querySelector('[aria-label="调整属性面板宽度"]')?.getAttribute('aria-valuenow')==='480')
        const controls=[]
        for(const name of ['播放','显示属性','画布缩放']){const control=page.getByLabel(name,{exact:true});controls.push({name,box:await control.boundingBox(),hit:await control.evaluate(element=>{const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return element===hit||element.contains(hit)})})}
        await writeFile(join(output,'layout.json'),JSON.stringify(await page.locator('.native-toolbar,.native-insert-tools,.native-view-tools,.native-toolbar-secondary,.native-toolbar-tail,.native-toolbar-tail-slot,.native-toolbar-fixed,.native-toolbar-tail>.native-toolbar-separator').evaluateAll(es=>es.map(e=>({className:e.className,rect:e.getBoundingClientRect().toJSON(),flex:getComputedStyle(e).flex,padding:getComputedStyle(e).padding,gap:getComputedStyle(e).gap,margin:getComputedStyle(e).margin,minWidth:getComputedStyle(e).minWidth}))),null,2));await writeFile(join(output,'hit-test.json'),JSON.stringify(controls,null,2));assert.ok(controls.every(x=>x.hit),'600px最大侧栏不能遮挡播放、属性及缩放')
        const tabs=[];for(const name of ['属性','代码','主题']){const tab=page.getByRole('tab',{name,exact:true});tabs.push({name,box:await tab.boundingBox(),hit:await tab.evaluate(element=>{const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return element===hit||element.contains(hit)})})}await writeFile(join(output,'tab-hit-test.json'),JSON.stringify(tabs,null,2));assert.ok(tabs.every(x=>x.hit),'中文属性标签必须保留来源槽宽，不能被固定尾部挡住')
        for(const [name,x]of [['播放',42],['显示属性',70],['画布缩放',98]])assert.ok(Math.abs(controls.find(c=>c.name===name).box.x-x)<=1,'600/480来源固定尾部坐标应在1px内')
        await page.screenshot({path:join(output,'width-tools.png')})
        const box=controls.find(x=>x.name==='显示属性').box;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.getByRole('complementary',{name:'属性面板',exact:true}).waitFor({state:'detached'})
        assert.equal(receipts.length,0);assert.deepEqual(errors,[]);return{kind:'isolated-design-width-tools',controls,tabs,actualPointerClosesInspector:true,noDocumentWrites:true,consoleOrPageErrors:errors}
      }
      if(options['outline-case']==='width'){
        const grip=page.getByRole('separator',{name:'调整属性面板宽度',exact:true}),panel=page.getByRole('complementary',{name:'属性面板',exact:true})
        await grip.waitFor();await grip.focus()
        const width=async value=>{assert.equal(await grip.getAttribute('aria-valuenow'),String(value));assert.ok(Math.abs((await panel.boundingBox()).width-value)<=1)}
        await width(336);await grip.press('ArrowLeft');await width(344);await grip.press('Shift+ArrowLeft');await width(376);await grip.press('ArrowRight');await width(368)
        await grip.press('Home');await width(285);await grip.press('End');await width(560)
        await grip.dblclick();await width(336)
        const rect=await grip.boundingBox();await page.mouse.move(rect.x+6,rect.y+100);await page.mouse.down();await page.mouse.move(rect.x-74,rect.y+100,{steps:4});await page.mouse.up();await width(416)
        await page.getByRole('button',{name:'关闭属性',exact:true}).click();await page.getByRole('button',{name:'显示属性',exact:true}).click();await width(416)
        await page.reload();await ready(1);await page.getByRole('button',{name:'显示属性',exact:true}).click();await width(416)
        await page.setViewportSize({width:640,height:844});const maxBeforeObserver=await grip.getAttribute('aria-valuemax');await page.waitForFunction(()=>document.querySelector('[aria-label="调整属性面板宽度"]')?.getAttribute('aria-valuemax')==='520');await width(416);assert.equal(await grip.getAttribute('aria-valuemax'),'520')
        await grip.focus();await grip.press('End');await width(520)
        await page.setViewportSize({width:390,height:844});await grip.waitFor({state:'detached'});assert.equal(await page.getByRole('tab',{name:'图层',exact:true}).count(),1)
        await page.setViewportSize({width:1440,height:1000});await grip.waitFor();await width(285)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-design-inspector-width',sourceKeyboardSteps:true,pointerDrag:true,doubleClickResets:true,persistsAcrossCloseAndReload:true,containerMaximum:true,maxBeforeObserver,maxAfterObserver:520,sheetHidesGrip:true,noDocumentWrites:true,consoleOrPageErrors:errors}
      }
      if(options['outline-case']==='large'){
        await board.focus();await board.press('End')
        await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]')?.dataset.currentPage==='page-50')
        await tree.getByRole('treeitem',{name:'Page 50',exact:true}).waitFor()
        const mounted=await tree.getByRole('treeitem').count();assert.ok(mounted<=30,'50画板图层区只挂载可见行及有界预取')
        await tree.getByRole('treeitem',{name:'Page 50',exact:true}).press('Home')
        await page.waitForFunction(()=>document.querySelector('[data-native-artifact-editor]')?.dataset.currentPage==='page-1')
        await board.waitFor();assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-design-outline-large',pages:50,maxObservedRows:mounted,homeEndFocusRestored:true,noWrites:true,consoleOrPageErrors:errors}
      }
      const title=await board.locator('.native-outline-label').boundingBox(),inspector=await page.getByRole('complementary',{name:'属性面板',exact:true}).boundingBox()
      assert.ok(Math.abs(title.x-inspector.x-51)<=1,'画板标签与固定来源应保持51px相对缩进')
      const rootGroup=tree.locator('[data-outline-node="page-1-root"]');if(await rootGroup.count())await rootGroup.getByRole('button',{name:'展开组合 LingxiLoop 1',exact:true}).click()
      const heading=tree.locator('[data-outline-node="page-1-heading"]')
      if(options['outline-case']==='narrow-context'){
        await page.setViewportSize({width:390,height:844});await page.getByRole('tab',{name:'图层',exact:true}).click();await heading.click({button:'right'})
        const menu=page.getByRole('menu',{name:'编辑操作',exact:true});await menu.waitFor()
        const box=await menu.boundingBox();assert.ok(box.y>=4&&box.y+box.height<=840,'窄屏图层菜单必须完整位于编辑器可见边界内')
        await page.keyboard.press('End');assert.equal(await page.locator('[data-native-artifact-editor]').evaluate(element=>element.scrollTop),0,'末项聚焦不能滚走整个编辑器')
        const last=await menu.getByRole('menuitem',{name:/^删除/}).boundingBox();assert.ok(last.y+last.height<=844)
        await page.keyboard.press('Escape');await menu.waitFor({state:'detached'});assert.equal(await heading.evaluate(element=>element===document.activeElement),true)
        assert.equal(receipts.length,0);assert.deepEqual(errors,[])
        return{kind:'isolated-outline-narrow-context',menuFitsEditor:true,lastActionVisibleWithKeyboard:true,editorDoesNotScroll:true,escapeRestoresFocus:true,noWrites:true,consoleOrPageErrors:errors}
      }
      if(options['outline-case']==='space'){
        await heading.click();const hide=heading.getByRole('button',{name:'隐藏图层 LingxiLoop 1',exact:true});await hide.focus();await hide.press('Space')
        await page.waitForFunction(()=>!document.querySelector('.native-stage [data-node-id="page-1-heading"]'))
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.equal(document.pages['page-1'].nodes['page-1-heading'].hidden,true)
        const show=heading.getByRole('button',{name:'显示图层 LingxiLoop 1',exact:true});await show.focus();await show.press('Space')
        await page.waitForFunction(()=>!!document.querySelector('.native-stage [data-node-id="page-1-heading"]'));assert.deepEqual(errors,[])
        return{kind:'isolated-outline-space',nativeButtonSpaceHidesAndShows:true,consoleOrPageErrors:errors}
      }
      if(options['outline-case']==='context'){
        await tree.locator('[data-outline-node="page-1-image"]').click()
        await heading.click({button:'right'})
        const menu=page.getByRole('menu',{name:'编辑操作',exact:true})
        await menu.getByRole('menuitem',{name:/创建副本/}).click()
        await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
        assert.equal(Object.values(document.pages['page-1'].nodes).filter(node=>node.type==='text').length,2,'右击文字行的动作必须作用于文字，而不是先前选中的图片')
        await page.keyboard.press('Control+z')
        await page.waitForFunction(()=>document.querySelectorAll('.native-stage [data-node-type=text]').length===3)
        await heading.focus();await heading.press('Shift+F10');await menu.waitFor()
        const before=document.seq
        await page.keyboard.press('ArrowDown');assert.equal(document.seq,before,'菜单方向键不能移动画布对象')
        assert.equal(await menu.evaluate(element=>element.contains(document.activeElement)),true)
        await page.keyboard.press('Escape');await menu.waitFor({state:'detached'})
        assert.equal(await heading.evaluate(element=>element===document.activeElement),true)
        assert.deepEqual(errors,[])
        return{kind:'isolated-outline-context',rightClickTargetsCorrectNode:true,sharedUndoAfterAction:true,keyboardMenu:true,noCanvasNudge:true,escapeRestoresTreeFocus:true,consoleOrPageErrors:errors}
      }
      await heading.click()
      assert.equal(await heading.getAttribute('aria-selected'),'true')
      await page.keyboard.press('ArrowDown')
      assert.equal(receipts.length,0,'图层键盘浏览不能移动画布对象')
      const focused=await tree.evaluate(element=>element.ownerDocument.activeElement?.getAttribute('role'))
      assert.equal(focused,'treeitem')
      await tree.getByRole('button',{name:'收起画板 Page 1',exact:true}).click()
      assert.equal(await heading.count(),0)
      await tree.getByRole('button',{name:'展开画板 Page 1',exact:true}).click();await heading.waitFor()
      await heading.hover();await heading.getByRole('button',{name:'隐藏图层 LingxiLoop 1',exact:true}).click()
      await page.waitForFunction(()=>!document.querySelector('.native-stage [data-node-id="page-1-heading"]'))
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      await page.keyboard.press('Control+z')
      await page.waitForFunction(()=>!!document.querySelector('.native-stage [data-node-id="page-1-heading"]'))
      await heading.click({button:'right'});await page.getByRole('menuitem',{name:'锁定图层',exact:true}).click()
      await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved')
      assert.equal(document.pages['page-1'].nodes['page-1-heading'].locked,true)
      const unlocked=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind==='undo');await page.keyboard.press('Control+z');await unlocked;await page.waitForFunction(()=>document.querySelector('[data-save-state]')?.dataset.saveState==='saved');assert.notEqual(document.pages['page-1'].nodes['page-1-heading'].locked,true)
      const handle=page.getByRole('separator',{name:'调整图层列表高度',exact:true})
      await handle.focus();await handle.press('ArrowDown');assert.equal(await handle.getAttribute('aria-valuenow'),'176')
      await handle.press('Shift+ArrowDown');assert.equal(await handle.getAttribute('aria-valuenow'),'208')
      await handle.press('ArrowUp');assert.equal(await handle.getAttribute('aria-valuenow'),'200')
      await page.setViewportSize({width:640,height:844})
      await tree.waitFor();await page.waitForTimeout(100)
      assert.equal(await page.getByRole('tab',{name:'图层',exact:true}).count(),0,'Design在600px以上保持侧栏')
      const side=await page.getByRole('complementary',{name:'属性面板',exact:true}).boundingBox();assert.ok(Math.abs(side.width-336)<=1&&side.y===0)
      await page.setViewportSize({width:390,height:844})
      await page.getByRole('tab',{name:'图层',exact:true}).waitFor()
      await page.getByRole('tab',{name:'代码',exact:true}).click();assert.equal(await tree.isVisible(),false)
      await page.getByRole('tab',{name:'图层',exact:true}).click();await tree.waitFor()
      const bottom=await page.getByRole('complementary',{name:'属性面板',exact:true}).boundingBox();assert.ok(Math.abs(bottom.height-Math.max((844-68)*.47,Math.min(136,844-68)))<=1,'Design底部面板使用固定来源的47%有效高度')
      await page.screenshot({path:join(output,'design-outline-narrow.png')})
      assert.deepEqual(errors,[])
      return{kind:'isolated-design-outline',chineseTree:true,wideGeometry:true,selectsCanvasNode:true,keyboardNavigationWithoutWrites:true,collapseAndExpand:true,narrowOutlineTab:true,hideAndLockWithSharedUndo:true,heightKeyboardSteps:true,consoleOrPageErrors:errors}
    }
    if(options.checks==='slides-toolbar'){
      assert.equal(kind,'slides')
      const records=[]
      for(const [width,height] of [[1920,1200],[1440,1000],[768,1024],[390,844]]){
        await page.setViewportSize({width,height});await page.reload({waitUntil:'domcontentloaded'});await ready(1)
        for(const theme of ['light','dark']){
          await page.locator('[data-native-artifact-editor]').evaluate((e,theme)=>{e.setAttribute('data-theme',theme);document.documentElement.classList.toggle('dark',theme==='dark')},theme)
          await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100)
          const labels=['文本','图片或视频','插入表格','插入图形','导出格式','版本历史','评论','评论选项','放映','显示属性','画布缩放']
          const controls=[]
          for(const label of labels){const element=page.getByLabel(label,{exact:true});controls.push({label,...await element.boundingBox()})}
          records.push({width,height,theme,controls})
          await writeFile(join(output,'toolbar-measured.json'),JSON.stringify(records,null,2))
          const get=label=>controls.find(control=>control.label===label)
          for(const control of controls){const expected=control.label==='版本历史'?18:['评论','评论选项'].includes(control.label)?14:16;assert.ok(Math.abs(control.y-expected)<=1,`${width}px ${control.label}纵坐标应为${expected}，实际${control.y}`)}
          assert.ok(Math.abs(get('文本').x-(width>=768?16:12))<=1,'768px容器应保留12px工具栏边距')
          for(const label of ['导出格式','放映'])assert.ok(Math.abs(get(label).width-28)<=1,`${label}应保持原版28px尺寸`)
          assert.ok(Math.abs(get('画布缩放').width-64.671875)<=1,'缩放按钮应为三位数读数保留固定宽度')
          assert.ok(Math.abs(get('显示属性').x-(get('放映').x+28)-13)<=1,'属性前分隔间距应为13px')
          assert.ok(Math.abs(get('画布缩放').x-(get('显示属性').x+28)-13)<=1,'缩放前分隔间距应为13px')
          await page.screenshot({path:join(output,`slides-toolbar-${width}-${theme}.png`)})
        }
      }
      assert.deepEqual(errors,[])
      return {kind:'isolated-slides-toolbar-geometry',mode:kind,records,scope:'固定来源局部控件尺寸、边距和分隔；公开分享入口按登记删除，不代表全部视觉验收',consoleOrPageErrors:errors}
    }
    if (options.checks === 'parity') {
      const screenshots = []
      for (const [width,height] of [[1920,1200],[1440,1000],[768,1024],[390,844]]) {
        await page.setViewportSize({width,height})
        await page.reload({waitUntil:'domcontentloaded'});await ready(1)
        for (const theme of ['light','dark']) {
          await page.locator('[data-native-artifact-editor]').evaluate((e,theme) => {e.setAttribute('data-theme',theme);document.documentElement.classList.toggle('dark',theme==='dark')},theme)
          await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200)
          if(width===1440&&theme==='light')await writeFile(join(output,`${kind}-dom.json`),JSON.stringify(await page.locator('[data-page-id] [data-node-id]').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.nodeId,html:e.outerHTML.slice(0,2000),rect:e.getBoundingClientRect().toJSON(),children:[...e.querySelectorAll('h1,.native-text-content,img')].map(c=>({tag:c.tagName,rect:c.getBoundingClientRect().toJSON(),color:getComputedStyle(c).color,display:getComputedStyle(c).display,position:getComputedStyle(c).position,font:getComputedStyle(c).font}))}))),null,2))
          await page.screenshot({path:join(output,`${kind}-${width}-${theme}.png`)})
          screenshots.push({width,height,theme,path:`${kind}-${width}-${theme}.png`,controls:await visualControls(page)})
        }
      }
      if(options['defaults-only']==='true'){assert.deepEqual(errors,[]);return {kind:'isolated-native-editor-default-visual-diagnostic',mode:kind,screenshots,scope:'只记录默认界面，不替代菜单/面板或像素验收',consoleOrPageErrors:errors}}
      const reset=async()=>{await page.setViewportSize({width:1440,height:1000});await page.reload({waitUntil:'domcontentloaded'});await ready(1);await page.locator('[data-native-artifact-editor]').evaluate(e=>{e.setAttribute('data-theme','light');document.documentElement.classList.remove('dark')});await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120)}
      const capture=async state=>{await page.waitForTimeout(120);const path=`${kind}-${state}.png`;await page.screenshot({path:join(output,path)});screenshots.push({width:1440,height:1000,theme:'light',state,path,controls:await visualControls(page)})}
      const menus=kind==='design'?[['pages','页面菜单'],['drawing','绘图工具'],['shapes','插入图形'],['export','导出格式'],['zoom','画布缩放'],['history','版本历史'],['comment-options','评论选项']]:[['shapes','插入图形'],['export','导出格式'],['zoom','画布缩放'],['layouts','添加页面'],['history','版本历史'],['comment-options','评论选项']]
      for(const [state,label]of menus){await reset();if(['history','layouts'].includes(state))await page.getByRole('button',{name:label,exact:true}).click();else await page.getByLabel(label,{exact:true}).click();if(state==='history')await page.getByRole('dialog',{name:'版本历史',exact:true}).getByRole('button',{name:/^版本/}).waitFor();await capture(state)}
      await reset();await page.getByRole('button',{name:'评论',exact:true}).click();await capture('comments-active');await page.mouse.click(kind==='design'?100:800,kind==='design'?500:600);await page.getByRole('textbox',{name:'评论内容',exact:true}).waitFor();await capture('comment-composer')
      await reset();await page.getByLabel('评论选项',{exact:true}).click();await page.getByRole('button',{name:/显示全部评论/}).click();await page.getByText('暂无评论',{exact:true}).waitFor();await capture('all-comments')
      await reset();await page.getByRole('button',{name:'显示属性',exact:true}).click();await capture('inspector')
      if(kind==='slides'){await page.getByRole('button',{name:'背景',exact:true}).click();await page.getByRole('dialog',{name:'背景颜色',exact:true}).waitFor();await capture('color-theme');await page.getByRole('button',{name:'自定义',exact:true}).click();await capture('color-custom')}
      await reset();await page.getByRole('button',{name:'显示属性',exact:true}).click();await page.locator('[data-node-id=page-1-heading]').click();await capture('heading-inspector')
      assert.equal(await page.getByRole('complementary',{name:'属性面板'}).count(),1)
      assert.deepEqual(errors,[])
      return {kind:'isolated-native-editor-visual-diagnostic',mode:kind,screenshots,scope:'controlled HTTP reducer fixture; screenshots only, not measured source parity, real API or performance acceptance',consoleOrPageErrors:errors}
    }
    if (kind==='design') { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'50%',exact:true}).click();await page.locator('.native-board-label').first().click() }
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
      if(kind==='design')await page.locator('.native-board-label').first().click();await page.getByRole('button',{name:'显示属性',exact:true}).click();assert.match(await page.getByRole('button',{name:'背景',exact:true}).innerText(),new RegExp(saved,'i'))
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
      await startSlides()
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
      if(kind==='slides')await page.locator('.native-property-disclosure>summary').filter({hasText:'高级'}).click()
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
      if(kind==='design'){
        await page.locator('[data-page-id="page-1"] .native-board-label').dblclick()
        const title=page.getByRole('textbox',{name:'画板名称',exact:true}),writes=receipts.length
        await title.fill('聚焦属性保存');await waitState('draft');await title.press('Control+s')
        assert.equal(receipts.length,writes,'原版标题保存快捷键保留改名草稿，不提前确认')
        assert.equal(await title.evaluate(element=>document.activeElement===element),true)
        holdAcknowledgment=true;await title.press('Enter');await assertPending();assert.equal(document.pages['page-1'].title,'聚焦属性保存');await release()
      }else{
        await saveControl(page.getByLabel('标题', { exact: true }), '聚焦属性保存', () => assert.equal(document.pages['page-1'].title, '聚焦属性保存'))
      }
      await saveControl(page.getByLabel(kind==='design'?'画板宽度':'宽', { exact: true }), '1800', () => assert.equal(document.pages['page-1'].width, 1800))
      if (kind === 'slides') await page.getByRole('button',{name:'讲者备注',exact:true}).click(); else { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'讲者备注',exact:true}).click() }
      const notes = page.getByRole('textbox', { name: '讲者备注', exact: true })
      for (const value of ['备注草稿一', '备注草稿二']) await saveControl(notes, value, () => assert.equal(document.pages['page-1'].notes, value))
      await page.locator('[data-node-id="page-1-heading"]').dblclick()
      const text = page.locator('[data-native-text-editor]'); await text.waitFor(); await page.keyboard.press('End')
      const cdp = await page.context().newCDPSession(page), beforeComposition = receipts.length
      await page.evaluate(()=>{window.__saveImeEvents=[];for(const name of ['compositionstart','compositionupdate','compositionend','keydown','input'])document.addEventListener(name,event=>window.__saveImeEvents.push({type:event.type,key:event.key,data:event.data,isComposing:event.isComposing,isTrusted:event.isTrusted,target:event.target.tagName}),true)})
      await cdp.send('Input.imeSetComposition', { text: '未确认', selectionStart: 3, selectionEnd: 3 })
      await waitState('draft'); await text.press('Control+s'); await page.waitForTimeout(800)
      await writeFile(join(output,`${kind}-save-ime.json`),JSON.stringify({events:await page.evaluate(()=>window.__saveImeEvents),operations:receipts.slice(beforeComposition)},null,2))
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
      if(kind==='design')await page.locator('[data-page-id="page-1"] .native-board-label').click()
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      if (kind === 'slides') await page.getByRole('button',{name:'讲者备注',exact:true}).click(); else { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'讲者备注',exact:true}).click() }
      if(kind==='slides'){
        await page.locator('.native-property-disclosure>summary').filter({hasText:'高级'}).click()
        assert.equal(await page.getByLabel('标题', { exact: true }).inputValue(), '聚焦属性保存')
      }else assert.equal(await page.locator('[data-page-id="page-1"] .native-board-label').textContent(),'聚焦属性保存')
      assert.equal(await page.getByLabel(kind==='design'?'画板宽度':'宽', { exact: true }).inputValue(), '1800')
      assert.equal(await page.getByRole('textbox', { name: '讲者备注', exact: true }).inputValue(), '备注草稿二')
      assert.equal(await page.locator('[data-node-id="page-1-table"] td').first().innerText(), '表格草稿二')
      assert.deepEqual(errors, [])
      return { kind: 'isolated-native-editor-save-diagnostic', mode: kind, focusedPropertyCtrlS: true, focusedTableCtrlS: true, repeatedFocusedNotesSave: true,
        dirtyBeforeSubmit: true, pendingUntilAcknowledged: true, compositionNotSubmittedByCtrlS: true, unrelatedAgentStylePreserved: true, activeRichTextSharedUndoRedo: true, reloadRetainedAllValues: true, designTitleRequiresConfirmation:kind==='design',coordinateCoverage:'board-transform keyboard/move regressions',consoleOrPageErrors: errors }
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
    await page.getByRole('tab',{name:'主题',exact:true}).click()
    await page.getByRole('button',{name:'默认主题',exact:true}).click(); await waitSaved(); assert.equal(document.themeId,null)
    await page.getByRole('button',{name:'使用主题 验收主题',exact:true}).click(); await waitSaved(); assert.equal(document.themeId,'fixture-theme')
    await page.getByRole('tab',{name:'属性',exact:true}).click()
    await select(50)
    await page.locator('[data-native-artifact-editor]').focus(); await page.keyboard.press('Alt+ArrowUp'); await waitSaved()
    assert.equal(document.pageOrder[48], 'page-50')
    const historyReceipt=kind=>page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/operations')&&response.request().postDataJSON()?.kind===kind&&response.status()===200)
    let historyAck=historyReceipt('undo');await page.keyboard.press('Control+z');await historyAck;await waitSaved()
    assert.equal(document.pageOrder[49], 'page-50')
    historyAck=historyReceipt('redo');await page.keyboard.press('Control+y');await historyAck;await waitSaved()
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
      if(kind==='design'){await page.getByLabel('播放',{exact:true}).click();await page.getByRole('group',{name:'播放选项',exact:true}).getByRole('button',{name:document.pages['page-25'].title,exact:true}).click();await page.getByRole('region',{name:'画板全窗口预览',exact:true}).waitFor()}else await startSlides()
      const iframe = (kind==='design'?page.getByRole('region',{name:'画板全窗口预览',exact:true}):page).locator('[data-node-id="page-25-isolated"] iframe')
      await iframe.waitFor()
      assert.equal(await iframe.getAttribute('sandbox'), 'allow-scripts')
      const image = iframe.contentFrame().locator('img')
      await image.waitFor()
      await image.evaluate(() => new Promise(resolve => {
        if (document.readyState === 'complete') resolve()
        else window.addEventListener('load', () => resolve(), { once: true })
      }))
      // Wait for the iframe's first painted frame before trusted hit testing.
      await image.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      // Frame descendants report unscaled coordinates in this Chromium/Playwright
      // combination. Send trusted pointer input at the iframe's rendered centre.
      const frameBounds = await iframe.boundingBox()
      assert.ok(frameBounds)
      await writeFile(join(output,'isolated-hit.json'),JSON.stringify({frameBounds,hit:await page.evaluate(({x,y})=>{const target=document.elementFromPoint(x,y);return{tag:target?.tagName,class:target?.className,outer:target?.outerHTML.slice(0,400)}},{x:frameBounds.x+frameBounds.width/2,y:frameBounds.y+frameBounds.height/2}),iframe:await iframe.evaluate(element=>({box:element.getBoundingClientRect().toJSON(),pointer:getComputedStyle(element).pointerEvents,inert:element.closest('[inert]')?.className}))},null,2))
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
  } catch(error) { await page.screenshot({path:join(output,`${kind}-failure.png`)}); const diagnostic=await page.evaluate(()=>({osImeEvents:window.__osImeEvents,geometry:window.__geometryLog,zoom:document.querySelector('[aria-label="画布缩放"]')?.textContent,stage:[...document.querySelectorAll('.native-stage')].map(e=>({scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,w:e.clientWidth,h:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight})),boards:[...document.querySelectorAll('[data-artboard-id]')].map(e=>({id:e.dataset.artboardId,rect:e.getBoundingClientRect().toJSON()})),notices:[...document.querySelectorAll('.native-notice')].map(e=>e.textContent)}));await writeFile(join(output,`${kind}-failure.json`),JSON.stringify({message:String(error),errors,diagnostic},null,2));throw error } finally { svgFontsHeld=false;releaseSvgFonts?.();releaseAcknowledgment?.(); await page.close() }
}

async function visualControls(page){return page.locator('button,[role=button],[role=tab],input,select,textarea,[role=menuitem],summary').evaluateAll(elements=>elements.filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden').map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {label:e.getAttribute('aria-label')??e.getAttribute('title')??e.textContent?.slice(0,100),role:e.getAttribute('role')??e.tagName.toLowerCase(),rect:{x:r.x,y:r.y,width:r.width,height:r.height},fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,background:s.backgroundColor,border:s.border,shadow:s.boxShadow,radius:s.borderRadius,cursor:s.cursor,transition:s.transition}}))}
