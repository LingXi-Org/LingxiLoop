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

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map(value => value.replace(/^--/, '').split('=')))
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
await writeFile(join(workspace, 'entry.tsx'), `import React from 'react';import{createRoot}from'react-dom/client';import NativeEditor from ${JSON.stringify(join(root, 'src/features/artifacts/native/NativeEditor'))};createRoot(document.getElementById('root')!).render(<React.StrictMode><NativeEditor artifactId="fixture" kind={new URLSearchParams(location.search).get('kind')==='design'?'design':'slides'} title="Isolated UI fixture" /></React.StrictMode>)`)
let server, browser
try {
  server = await createServer({ configFile: false, root: workspace, plugins: [react()], logLevel: 'error',
    resolve: { alias: [
      ...Object.entries({ '@/api/core/http': 'http', '@/api/core/realtime': 'realtime', '@/api/transport': 'transport', '@/stores/auth': 'auth', '@/lib/workspaceSession': 'workspaceSession' }).map(([find, name]) => ({ find, replacement: join(workspace, `${name}.js`) })),
      { find: 'react', replacement: dirname(require.resolve('react/package.json')) },
      { find: 'react-dom', replacement: dirname(require.resolve('react-dom/package.json')) },
    ] }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root, workspace, dependencyRoot] } } })
  await server.listen()
  const address = server.httpServer.address()
  const baseUrl = `http://127.0.0.1:${address.port}`
  browser = await chromium.launch({ headless: true, ...(options.browser ? { executablePath: options.browser } : {}), args: ['--no-sandbox'] })
  for (const kind of mode === 'both' ? ['slides', 'design'] : [mode]) {
    for (const editorCase of options.checks === 'cas' ? ['rte', 'table'] : [null]) {
      const result = await verifyMode(kind, browser, baseUrl, editorCase)
      await writeFile(join(output, `${kind}${editorCase ? `-${editorCase}` : ''}.json`), JSON.stringify(result, null, 2) + '\n')
      console.log(JSON.stringify(result))
    }
  }
} finally {
  await browser?.close()
  await server?.close()
  await rm(workspace, { recursive: true, force: true })
}

async function verifyMode(kind, browser, baseUrl, editorCase) {
  const fixture = options.checks === 'parity' ? createVisualFixture(kind) : createFixture(kind, 'fixture', Array.from({ length: 50 }, (_, index) => `/api/artifacts/fixture/assets/image-${index + 1}`))
  let document = fixture.document
  if(options.checks==='legacy-colors')document.pages['page-1'].background='#f00'
  if(options.checks==='color-cas')document.pages['page-1'].background='#ff0000'
  const historical=structuredClone(document),historyNode=Object.values(historical.pages['page-1'].nodes).find(node=>node.type==='text')
  if(options.checks==='history')document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-1',nodeId:historyNode.id,patch:{x:historyNode.x+80}}])).document
  const revisionReads=[],revisionRestores=[],contextWrites=[]
  const pageHash = page => createHash('sha256').update(JSON.stringify(page)).digest('hex')
  const initialPageHashes = Object.fromEntries(document.pageOrder.map(id => [id, pageHash(document.pages[id])]))
  const history = { version: 0, undo: null, redo: null }, receipts = [], errors = []
  let holdAcknowledgment = false, releaseAcknowledgment = null
  let historyEntry = null
  const historyRequests = []
  const snapshot = () => ({ document, history, write: true, loadedPageIds: document.pageOrder,
    pageVersions: Object.fromEntries(document.pageOrder.map(id => [id, String(document.versions[`page/${id}`] ?? 0)])) })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(30_000)
  await page.addInitScript(()=>{window.__geometryLog=[];const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);this.addEventListener('message',e=>{if(Array.isArray(e.data?.value)){window.__geometryLog.push({direction:'reply',...e.data});window.__geometryLog=window.__geometryLog.slice(-60)}})}postMessage(message,...args){if(['visible','update-pages'].includes(message?.task?.kind)){window.__geometryLog.push({direction:'request',...message});window.__geometryLog=window.__geometryLog.slice(-60)}return super.postMessage(message,...args)}}})
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
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
    if(url.pathname.endsWith('/editor-context'))contextWrites.push(request.postDataJSON())
    if(url.pathname.endsWith('/revisions')){
      revisionReads.push(true);await route.fulfill({status:200,json:{current:`fixture-${document.seq}`,revisions:[document.seq,0].map(seq=>({seq:String(seq),version:`fixture-${seq}`,actorId:'fixture-user',actorName:'测试用户',actorKind:'user',createdAt:new Date().toISOString(),changedPageIds:['page-1']}))}});return
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
      const image = fixture.images[Number(url.pathname.split('-').at(-1)) - 1]
      await route.fulfill({ status: 200, contentType: 'image/png', body: image.bytes }); return
    }
    let result = snapshot()
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
    if(options.checks!=='parity') await canvas.locator('[data-formula-ready=true]').waitFor()
    await canvas.locator('[data-node-type=image] img').waitFor()
    await page.waitForFunction(index => {
      const image = window.document.querySelector(`[data-page-id="page-${index}"] [data-node-type=image] img`)
      return image?.complete && image.naturalWidth > 0
    }, index)
  }
  const select = async index => {
    if (kind === 'design') {
      if (!(await page.getByLabel('画布缩放',{exact:true}).innerText()).includes('50%')) { await page.getByLabel('画布缩放',{exact:true}).click(); await page.getByRole('button',{name:'50%',exact:true}).click() }
      const p = document.pages[`page-${index}`]
      await page.locator('.native-stage').evaluate((element,point) => { element.scrollLeft=point.x*.5; element.scrollTop=point.y*.5 },p)
      await page.locator(`[data-page-id="page-${index}"] .native-board-label`).click()
      await ready(index); return
    }
    await page.locator('.native-page-list').evaluate((element, index) => { element.scrollLeft = (index - 1) * 136 }, index)
    await page.locator(`[data-page-target="page-${index}"]`).click()
    await ready(index)
  }
  try {
    await page.goto(`${baseUrl}/?kind=${kind}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await ready(1)
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
      await page.setViewportSize({width:390,height:844});await ready(1);await page.waitForTimeout(150)
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
          screenshots.push({width,height,theme,path:`${kind}-${width}-${theme}.png`})
        }
      }
      await page.setViewportSize({width:1440,height:1000})
      await page.locator('[data-native-artifact-editor]').evaluate(e=>e.setAttribute('data-theme','light'))
      await page.getByRole('button',{name:'显示属性',exact:true}).click()
      await page.waitForTimeout(200)
      await page.screenshot({path:join(output,`${kind}-inspector.png`)})
      await page.locator('[data-node-id=page-1-heading]').click();await page.waitForTimeout(100)
      await page.screenshot({path:join(output,`${kind}-heading-inspector.png`)})
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
      const before=document.pages['page-1'].nodeOrder.length
      await page.getByRole('button',{name:'文本',exact:true}).click()
      const box=await page.locator('[data-page-id="page-1"] .native-page-scaled').boundingBox();assert.ok(box)
      const scale=box.width/document.pages['page-1'].width
      await page.mouse.click(box.x+120*scale,box.y+820*scale)
      const input=page.locator('[data-native-text-editor]');await input.waitFor();await input.fill('Native action regression');await input.press('Control+s');await waitSaved();await input.press('Escape')
      assert.equal(document.pages['page-1'].nodeOrder.length,before+1)
      assert.ok(Object.values(document.pages['page-1'].nodes).some(n=>n.text==='Native action regression'))
      const shape=page.locator('[data-node-id="page-1-shape"]');await shape.click()
      await page.locator('.native-property-disclosure>summary').filter({hasText:'效果'}).click()
      await page.locator('.native-inspector-section').filter({has:page.locator('summary',{hasText:'渐变'})}).locator('summary').click()
      await page.getByLabel('填充类型',{exact:true}).selectOption('linear');await waitSaved()
      assert.equal(document.pages['page-1'].nodes['page-1-shape'].style.gradient.type,'linear')
      const y=document.pages['page-1'].nodes['page-1-shape'].y
      await page.getByLabel('历史记录',{exact:true}).click();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape')
      assert.equal(document.pages['page-1'].nodes['page-1-shape'].y,y,'menu navigation must not move an object')
      const image=page.locator('[data-node-id="page-1-image"]');await image.dblclick()
      const handle=page.getByLabel('裁剪边缘 se',{exact:true});await handle.waitFor();const edge=await handle.boundingBox();assert.ok(edge)
      await page.mouse.move(edge.x+edge.width/2,edge.y+edge.height/2);await page.mouse.down();await page.mouse.move(edge.x-60,edge.y-30,{steps:5});await page.mouse.up()
      await page.getByRole('button',{name:'完成裁剪',exact:true}).click();await waitSaved()
      assert.ok(document.pages['page-1'].nodes['page-1-image'].crop.width<1)
      await image.dblclick();assert.equal(await image.locator('img').evaluate(e=>e.style.width),'100%','reopened crop must show the full source image')
      await page.getByRole('button',{name:'取消裁剪',exact:true}).click()
      await page.getByRole('button',{name:'放映',exact:true}).click()
      await page.getByRole('button',{name:'下一页',exact:true}).focus();await page.keyboard.press('ArrowRight')
      await page.waitForFunction(()=>document.querySelector('[data-current-page]')?.getAttribute('data-current-page')==='page-2')
      await page.getByRole('button',{name:'退出放映',exact:true}).focus();await page.keyboard.press('Escape')
      assert.equal(await page.locator('.native-presenting').count(),0);await select(1)
      let drawing=false,layouts=false,multiplePages=false
      if(kind==='design') {
        await page.getByRole('button',{name:'铅笔',exact:true}).click()
        await page.mouse.move(box.x+800*scale,box.y+820*scale);await page.mouse.down();await page.mouse.move(box.x+900*scale,box.y+880*scale,{steps:12});await page.mouse.up();await waitSaved()
        const stroke=Object.values(document.pages['page-1'].nodes).find(n=>n.type==='drawing');assert.ok(stroke);assert.ok(stroke.points.length>2);drawing=true
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
      return {kind:'isolated-native-editor-interaction-diagnostic',mode:kind,textInsertion:true,gradientSaved:true,menuKeysDoNotNudge:true,cropReopensFullSource:true,presentationKeysFromControls:true,drawing,layouts,multiplePages,scope:'controlled HTTP shared reducer fixture, not authenticated product integration',consoleOrPageErrors:errors}
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
    const formulaSource = page.getByLabel('LaTeX 公式源码', { exact: true })
    await formulaSource.fill(formula); await formulaSource.press('Control+s'); await waitSaved(); await ready(25)
    assert.equal(document.pages['page-25'].nodes['page-25-formula'].source, formula)
    await select(50)
    await page.locator('[data-node-id="page-50-image"]').click()
    await page.locator('.native-property-disclosure>summary').filter({hasText:'高级'}).click()
    for (const [label, value] of [['width', '0.75'], ['x', '0.1']]) { const control = page.getByLabel(`裁剪 ${label}`, { exact: true }); await control.fill(value); await control.press('Control+s'); await waitSaved() }
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
    await page.getByLabel('历史记录',{exact:true}).click(); await page.getByRole('button', { name: '撤销',exact:true }).click()
    await page.waitForFunction(value => window.document.querySelector('[data-node-id="page-50-heading"]')?.textContent === value, expected.get(50))
    await page.getByLabel('历史记录',{exact:true}).click(); await page.getByRole('button', { name: '重做',exact:true }).click()
    await page.waitForFunction(() => window.document.querySelector('[data-node-id="page-50-heading"]')?.textContent === 'Agent collaborative heading')
    assert.deepEqual(historyRequests, ['undo', 'redo', 'undo', 'redo'])
    const changedPageIds = document.pageOrder.filter(id => pageHash(document.pages[id]) !== initialPageHashes[id]).sort()
    assert.deepEqual(changedPageIds, ['page-1', 'page-25', 'page-50'])
    let isolatedInteraction = false
    if (document.pages['page-25'].nodes['page-25-isolated']) {
      await select(25)
      await page.getByRole('button', { name: '放映', exact: true }).click()
      const iframe = page.locator('[data-node-id="page-25-isolated"] iframe')
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
  } catch(error) { await page.screenshot({path:join(output,`${kind}-failure.png`)}); const diagnostic=await page.evaluate(()=>({geometry:window.__geometryLog,zoom:document.querySelector('[aria-label="画布缩放"]')?.textContent,stage:[...document.querySelectorAll('.native-stage')].map(e=>({scrollLeft:e.scrollLeft,scrollTop:e.scrollTop,w:e.clientWidth,h:e.clientHeight,scrollWidth:e.scrollWidth,scrollHeight:e.scrollHeight})),boards:[...document.querySelectorAll('[data-artboard-id]')].map(e=>({id:e.dataset.artboardId,rect:e.getBoundingClientRect().toJSON()})),notices:[...document.querySelectorAll('.native-notice')].map(e=>e.textContent)}));await writeFile(join(output,`${kind}-failure.json`),JSON.stringify({message:String(error),errors,diagnostic},null,2));throw error } finally { releaseAcknowledgment?.(); await page.close() }
}
