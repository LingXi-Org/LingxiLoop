// Isolated pinned-reference probe. Reference executables/fonts never enter a product bundle.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises'
import {resolve,dirname,join} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {createVisualFixture} from './native-editor-visual-fixture.mjs'
import {fitDesignCamera} from '../src/features/artifacts/native/canvas-fit.ts'
let phase='固定来源'
async function main(){
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')))
assert.ok(args['reference-root'],'请指定独立的固定版本参考目录')
const reference=resolve(args['reference-root']),output=resolve(args.output??join(tmpdir(),'lingxi-fit-oracle')),golden=JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-design-fit-camera.json',import.meta.url),'utf8'))
const source=await readFile(join(reference,golden.sourceFile),'utf8')
assert.equal(createHash('sha256').update(source).digest('hex'),golden.sourceSha256)
const {start,end}=golden.functionLocation
const sourceFit=Function('e','r',source.slice(start,end)+';return _')({viewportScaleLimits:{minScale:golden.constants.minScale}},golden.constants.fitPadding)
phase='数学对照'
for(const sample of golden.cases){const expected=sourceFit(sample.bounds,{w:sample.width,h:sample.height,top:golden.constants.viewportTop});assert.deepEqual(fitDesignCamera(sample.boards,sample.annotations,sample.width,sample.height),expected);assert.deepEqual(expected,sample.result)}
await mkdir(output,{recursive:true})
const report={sourceCommit:golden.sourceCommit,mathCases:golden.cases.length,mathPassed:true,runtime:[],boardPreview:[],scope:'固定源码纯数学和可选参考运行，不替代完整视觉、授权服务或性能门槛'}
if(args.capture==='true'){
  phase='参考资源校验'
  const inventory=JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-inventory.json',import.meta.url),'utf8'))
  for(const item of inventory.sources)assert.equal(createHash('sha256').update(await readFile(join(reference,item.path))).digest('hex'),item.sha256)
  report.referenceResourceHashesVerified=inventory.sources.length
  const runner=process.env.PLAYWRIGHT_MODULE??'playwright',{chromium}=await import(runner.startsWith('/')?pathToFileURL(runner).href:runner)
  const browser=await chromium.launch({headless:true,...(args.browser?{executablePath:args.browser}:{}),args:['--no-sandbox']})
  try{for(const [width,height]of[[1920,1200],[1440,1000],[768,1024],[390,844]])for(const theme of ['light','dark']){
    const root=await mkdtemp(join(tmpdir(),'lingxi-fit-reference-')),fixture=createVisualFixture('design')
    for(const [file,bytes]of fixture.legacyFiles){const target=join(root,file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes)}
    const file=join(root,'project/canvas.json'),canvas=JSON.parse(await readFile(file,'utf8'))
    canvas.notes['editable-path']={kind:'pen',x:2497.1,y:-1360.9,w:452.381,h:226.19,d:'M0 180.952 L226.19 0 L452.381 226.19'}
    await writeFile(file,JSON.stringify(canvas))
    phase=`参考界面：${width}×${height}，${theme}`
    let child,page
    try{
      child=spawn(process.execPath,[join(reference,'skills/claude-design/scripts/server.mjs'),root,'--port','0','--host','127.0.0.1'],{stdio:['ignore','pipe','ignore']})
      const url=await new Promise((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('参考服务启动超时')),10000);child.stdout.on('data',bytes=>{raw+=bytes.toString();try{const value=JSON.parse(raw);if(value.url){clearTimeout(timer);resolve(value.url)}}catch{}});child.once('exit',()=>{clearTimeout(timer);reject(Error('参考服务退出'))})})
      page=await browser.newPage({viewport:{width,height},colorScheme:theme,reducedMotion:'reduce'})
      await page.goto(url,{waitUntil:'networkidle'});await page.locator('[data-mega-artboard]').first().waitFor();await page.evaluate(()=>document.fonts.ready)
      let loaded=0;const until=Date.now()+30000
      while(Date.now()<until){loaded=0;for(const frame of page.frames())try{if(await frame.locator('h1').filter({hasText:/^LingxiLoop [123]$/}).count()&&await frame.locator('img').evaluateAll(es=>es.every(e=>e.complete&&e.naturalWidth>0))){await frame.evaluate(()=>document.fonts.ready);loaded++}}catch{}if(loaded===3)break;await page.waitForTimeout(100)}
      assert.equal(loaded,3,'参考画板内容和图片必须完整就绪')
      const painted=page.locator('svg path[d="M0 180.952 L226.19 0 L452.381 226.19"]').first();await painted.waitFor({state:'attached'})
      const at=await painted.evaluate(path=>{const p=path.getPointAtLength(path.getTotalLength()*.25).matrixTransform(path.getScreenCTM());return{x:p.x,y:p.y}})
      await page.mouse.dblclick(at.x,at.y);const editor=page.locator('[data-mega-chrome="pen-anchors"]');await editor.waitFor({state:'attached'})
      const image=`design-fit-${width}-${height}-${theme}.png`;await page.screenshot({path:join(output,image)})
      report.runtime.push({width,height,theme,image,anchors:await editor.locator('[data-pen-part^="a"]').evaluateAll(es=>es.map(e=>{const b=e.getBoundingClientRect();return{id:e.dataset.penPart,x:b.x+b.width/2,y:b.y+b.height/2}})),boards:await page.locator('[data-mega-artboard]').evaluateAll(es=>es.map(e=>({id:e.getAttribute('data-mega-artboard'),rect:e.getBoundingClientRect().toJSON()}))),controls:await page.locator('button,[role=button]').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{label:e.getAttribute('aria-label')??e.getAttribute('title')??e.textContent,rect:b.toJSON(),fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,padding:s.padding,border:s.border,background:s.background,color:s.color,shadow:s.boxShadow,radius:s.borderRadius}}))})
      if(args['board-preview']==='true'){
        const exportButton=page.getByRole('button',{name:'Export artboard Page 1',exact:true})
        if(width===390)await exportButton.press('Enter');else await exportButton.click()
        const exportMenu=await page.locator('[role=menuitem],[role=menuitemradio],[role=menuitemcheckbox]').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>({label:e.getAttribute('aria-label')??e.textContent,role:e.getAttribute('role'),rect:e.getBoundingClientRect().toJSON()})))
        await page.screenshot({path:join(output,`artboard-export-menu-${width}-${height}-${theme}.png`)});await page.keyboard.press('Escape')
        const open=page.getByRole('button',{name:'Open artboard Page 1 full window',exact:true})
        await open.click()
        await page.waitForTimeout(300)
        const fit=await page.locator('[data-mega-artboard]').first().boundingBox()
        const controls=await page.locator('button,[role=button]').evaluateAll(es=>es.filter(e=>e.checkVisibility()).map(e=>({label:e.getAttribute('aria-label')??e.getAttribute('title')??e.textContent,rect:e.getBoundingClientRect().toJSON()})))
        await page.screenshot({path:join(output,`artboard-full-window-${width}-${height}-${theme}.png`)})
        const surfaces=await page.locator('[data-mega-artboard],[data-mega-artboard] *').evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.height>100&&getComputedStyle(e).boxShadow!=='none'}).map(e=>{const s=getComputedStyle(e);return{rect:e.getBoundingClientRect().toJSON(),width:s.width,height:s.height,transform:s.transform,shadow:s.boxShadow,border:s.border,background:s.backgroundColor}}))
        await page.getByText('Fill',{exact:true}).click();await page.waitForTimeout(300)
        const fill=await page.locator('[data-mega-artboard]').first().boundingBox()
        await page.screenshot({path:join(output,`artboard-fill-${width}-${height}-${theme}.png`)})

        report.boardPreview.push({width,height,theme,fit,fill,controls,exportMenu,surfaces,trigger:width===390?'回车；相邻标题可能遮挡导出按钮':'点击'})
      }
    }finally{await page?.close();if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited}}
  }}finally{await browser.close()}
}
await writeFile(join(output,'results.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({mathCases:report.mathCases,runtimeCases:report.runtime.length,boardPreviewCases:report.boardPreview.length,mathPassed:true}))

}
void main().catch(error=>{console.error(JSON.stringify({failed:true,phase,name:error?.name??'Error'}));process.exitCode=1})
