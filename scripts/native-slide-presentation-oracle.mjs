// Reference runtime only; excluded upstream executables never enter the product.
import { createVisualFixture } from './native-editor-visual-fixture.mjs'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const args = Object.fromEntries(
  process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')),
)
if (!args['reference-root']) throw Error('请指定固定版本参考目录')
const reference = args['reference-root'],
  output = args.output ?? join(tmpdir(), 'lingxi-speaker-source')
await mkdir(output, { recursive: true })
const inventory = JSON.parse(
  await readFile(
    join(repositoryRoot, 'docs/evidence/issue-707/source-inventory.json'),
    'utf8',
  ),
)
for (const item of inventory.sources)
  if (
    createHash('sha256')
      .update(await readFile(join(reference, item.path)))
      .digest('hex') !== item.sha256
  )
    throw Error('参考文件哈希不符')
const modulePath = process.env.PLAYWRIGHT_MODULE ?? 'playwright',
  { chromium } = await import(
    modulePath.startsWith('/') ? pathToFileURL(modulePath).href : modulePath
  )

const root = await mkdtemp(join(tmpdir(), 'lingxi-source-speaker-'))
const visualFixture=createVisualFixture('slides')
visualFixture.document.pages['page-1'].notes='全屏与演讲者控制备注。'
for (const [file, bytes] of visualFixture.legacyFiles) {
  const path = join(root, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes)
}
const first = join(root, 'project/slides/page-1.html')
await writeFile(
  first,
  (await readFile(first, 'utf8')).replace(
    '</section>',
    '<aside>全屏与演讲者控制备注。</aside></section>',
  ),
)
let child, browser
try {
  child = spawn(
    process.execPath,
    [
      join(reference, 'skills/claude-slides/scripts/server.mjs'),
      root,
      '--port',
      '0',
      '--host',
      '127.0.0.1',
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
  const url = await new Promise((resolve, reject) => {
    let raw = ''
    const timer = setTimeout(() => reject(Error('参考服务启动超时')), 15000)
    child.stdout.on('data', (b) => {
      raw += b
      try {
        const v = JSON.parse(raw)
        if (v.url) {
          clearTimeout(timer)
          resolve(v.url)
        }
      } catch {}
    })
    child.once('exit', () => {
      clearTimeout(timer)
      reject(Error('参考服务退出'))
    })
  })
  browser = await chromium.launch({
    ...(args.browser ? { executablePath: args.browser } : {}),
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage({
    viewport: { width: Number(args.width??1440), height: Number(args.height??1000) },
    reducedMotion: 'reduce',
    colorScheme:args.theme==='dark'?'dark':'light',
  })
  await page.addInitScript(()=>{window.__fullscreenCalls=[];const original=Element.prototype.requestFullscreen;Element.prototype.requestFullscreen=function(...args){window.__fullscreenCalls.push({tag:this.tagName,at:performance.now()});return original.apply(this,args)}})
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Present', exact: true }).click()
  const popup = page.waitForEvent('popup', { timeout: 15000 })
  await page.getByRole('menuitem', { name: 'Present with speaker notes', exact: true }).click()
  const speaker = await popup
  await speaker.waitForLoadState('domcontentloaded')
  await speaker.getByRole('button', { name: /next/i }).first().waitFor()

  const inspect=async (label,reveal=true)=>{
    if(reveal)await page.mouse.move(Number(args.width??1440)/2-48.5,Number(args.height??1000)-35);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
    const record=await page.evaluate(()=>({fullscreen:document.fullscreenElement?.tagName??null,calls:window.__fullscreenCalls,focusedLabel:document.activeElement?.getAttribute('aria-label'),tooltips:[...document.querySelectorAll('[role=tooltip]')].filter(e=>e.checkVisibility()).map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON(),style:Object.fromEntries(['backgroundColor','color','padding','border','borderRadius','boxShadow','fontFamily','fontSize','lineHeight','fontWeight','maxWidth'].map(key=>[key,getComputedStyle(e)[key]]))})),pager:document.querySelector('[data-present-pager]')?{rect:document.querySelector('[data-present-pager]').getBoundingClientRect().toJSON(),opacity:getComputedStyle(document.querySelector('[data-present-pager]')).opacity,pointerEvents:getComputedStyle(document.querySelector('[data-present-pager]')).pointerEvents}:null,counter:document.querySelector('[data-present-pager]')?.innerText,buttons:[...document.querySelectorAll('button')].filter(e=>e.checkVisibility()).map(e=>({label:e.getAttribute('aria-label'),title:e.getAttribute('title'),text:e.innerText,rect:e.getBoundingClientRect().toJSON(),color:getComputedStyle(e).color,outline:getComputedStyle(e).outline,outlineOffset:getComputedStyle(e).outlineOffset,boxShadow:getComputedStyle(e).boxShadow,paint:e.querySelector('[data-cds-part=paint]')?getComputedStyle(e.querySelector('[data-cds-part=paint]')).backgroundColor:null}))}))
    await page.screenshot({path:join(output,label+'.png')});return{label,...record}
  }
  const rows=[await inspect('popup-open')]
  const sourceStyles = await page.getByRole('button', {name:'Previous', exact:true}).evaluate(element => {
    const rows=[]
    for(let node=element, depth=0;node && depth<5;node=node.parentElement, depth++) {
      const style=getComputedStyle(node)
      rows.push({tag:node.tagName,className:node.className,rect:node.getBoundingClientRect().toJSON(),text:node.textContent,children:depth===2?[...node.children].map(child=>({tag:child.tagName,text:child.textContent,rect:child.getBoundingClientRect().toJSON()})):undefined,style:Object.fromEntries(['display','position','bottom','left','padding','gap','border','borderRadius','backgroundColor','color','fontFamily','fontSize','lineHeight','fontWeight','opacity','width','height'].map(key=>[key,style[key]]))})
    }
    return rows
  })
  await page.bringToFront();await page.mouse.click(Number(args.width??1440)*.8,140);await page.waitForTimeout(100);rows.push(await inspect('popup-first-stage-click'))
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Present',exact:true}).waitFor();await speaker.close()
  await page.getByRole('button',{name:'Present',exact:true}).click();await page.getByRole('menuitem',{name:'Present',exact:true}).click();await page.getByRole('button',{name:/^Show speaker notes/}).waitFor();rows.push(await inspect('regular-present'));await page.mouse.move(20,20);await page.waitForTimeout(2100);rows.push(await inspect('regular-idle',false));await page.keyboard.press('Tab');await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-present-pager]')).opacity==='1');rows.push(await inspect('regular-keyboard',false))
  let hoverTiming
  if(args['measure-hover']==='true'){
    await page.getByRole('application',{name:'Slide show',exact:true}).focus()
    await page.mouse.move(20,20)
    await page.waitForFunction(()=>![...document.querySelectorAll('[role=tooltip]')].some(e=>e.checkVisibility()&&getComputedStyle(e).opacity!=='0'))
    await page.evaluate(()=>{
      const target=[...document.querySelectorAll('button')].find(e=>e.getAttribute('aria-label')==='Next')
      window.__hoverTiming={}
      target.addEventListener('pointerenter',()=>{
        const start=performance.now(),row=window.__hoverTiming
        const sample=()=>{
          const tip=[...document.querySelectorAll('[role=tooltip]')].find(e=>e.textContent==='Next')
          if(tip){const style=getComputedStyle(tip);row.attachedMs??=performance.now()-start;if(Number(style.opacity)>0&&style.visibility!=='hidden')row.visibleMs??=performance.now()-start;if(style.opacity==='1'&&style.visibility!=='hidden'){row.settledMs=performance.now()-start;row.transitionDuration=style.transitionDuration;row.animationDuration=style.animationDuration;row.complete=true;return}}
          if(performance.now()-start>2500){row.complete=true;return}requestAnimationFrame(sample)
        };sample()
      },{once:true})
    })
    const next=await page.getByRole('button',{name:'Next',exact:true}).boundingBox()
    await page.mouse.move(next.x+next.width/2,next.y+next.height/2)
    await page.waitForFunction(()=>window.__hoverTiming?.complete)
    hoverTiming=await page.evaluate(()=>window.__hoverTiming)
  }
  await writeFile(join(output,'results.json'),JSON.stringify({sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',fixtureSemanticSha256:createHash('sha256').update(JSON.stringify(visualFixture.document)).digest('hex'),theme:args.theme??'light',referenceResourceHashesVerified:inventory.sources.length,rows,sourceStyles,hoverTiming},null,2));console.log(JSON.stringify(rows.map(r=>({label:r.label,fullscreen:r.fullscreen,controls:r.buttons.map(b=>b.label??b.title??b.text)}))))
}finally{await browser?.close();child?.kill('SIGTERM');await rm(root,{recursive:true,force:true})}
