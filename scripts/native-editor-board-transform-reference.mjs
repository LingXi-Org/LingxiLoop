#!/usr/bin/env node
/** Read-only pinned application, disposable project per gesture. Reference code
 * and fonts remain outside the product; only measurements and images are saved. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join,dirname,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {pathToFileURL} from 'node:url'
import {createVisualFixture} from './native-editor-visual-fixture.mjs'
import {waitForReferenceVisualDocument} from './native-editor-reference-ready.mjs'

const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')))
assert.ok(args['reference-root'],'需要指定独立参考目录 --reference-root')
const sourceRoot=resolve(args['reference-root']),output=resolve(args.output??'/tmp/lingxi-board-source')
const inventory=JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-inventory.json',import.meta.url),'utf8'))
for(const source of inventory.sources)assert.equal(createHash('sha256').update(await readFile(join(sourceRoot,source.path))).digest('hex'),source.sha256,`参考资源已变化：${source.path}`)
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const browser=await chromium.launch({headless:true,...(args.browser?{executablePath:args.browser}:{}),args:['--no-sandbox']})
const scenarios=[
  {name:'group-resize',multi:true,selectionModifier:'Shift',resize:true,group:true},{name:'group-resize-shift',multi:true,selectionModifier:'Shift',resize:true,group:true,modifier:'Shift'},{name:'group-minimum',multi:true,selectionModifier:'Shift',resize:true,group:true,dx:-1000,dy:-500},
  {name:'gap-middle',targetFile:'Page2.dc.html',dx:5},{name:'move'},{name:'move-shift',modifier:'Shift'},{name:'move-unsnapped',modifier:'Control'},
  ...[25,28,30,42,44,46].map(dx=>({name:`snap-${dx}`,dx})),
  ...['n','e','s','w','nw','ne','sw'].map(handle=>({name:`resize-${handle}`,resize:true,handle})),
  {name:'resize',resize:true},{name:'resize-unsnapped',resize:true,modifier:'Control'},{name:'resize-shift',resize:true,modifier:'Shift'},{name:'resize-alt',resize:true,modifier:'Alt'},
  {name:'minimum',resize:true,dx:-500,dy:-300},{name:'minimum-shift',resize:true,dx:-500,dy:-300,modifier:'Shift'},
  {name:'maximum',resize:true,dx:3000,dy:2000},
  {name:'copy',modifier:'Alt'},{name:'copy-late',phase:'press'},{name:'copy-late-still',phase:'press',stationary:true},{name:'copy-release-still',modifier:'Alt',phase:'release',stationary:true},{name:'copy-release',modifier:'Alt',phase:'release'},{name:'copy-multi',modifier:'Alt',multi:true,selectionModifier:'Shift'},{name:'cancel',cancel:true},{name:'copy-cancel',modifier:'Alt',cancel:true},
]
const results=[]
await mkdir(output,{recursive:true})
try{
  for(const scenario of scenarios.filter(value=>!args.case||args.case.split(',').includes(value.name))){
    const project=await mkdtemp(join(tmpdir(),'lingxi-reference-board-'));let server,page
    try{
      for(const [file,bytes]of createVisualFixture('design').legacyFiles){const path=join(project,file);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)}
      server=spawn(process.execPath,[join(sourceRoot,'skills/claude-design/scripts/server.mjs'),project,'--port','0','--host','127.0.0.1'],{stdio:['ignore','pipe','ignore']})
      const url=await new Promise((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('参考服务启动超时')),15000);server.stdout.on('data',bytes=>{raw+=bytes;try{const parsed=JSON.parse(raw);if(parsed.url){clearTimeout(timer);resolve(parsed.url)}}catch{}});server.once('exit',()=>{clearTimeout(timer);reject(Error('参考服务退出'))})})
      assert.ok(['127.0.0.1','localhost'].includes(new URL(url).hostname))
      page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'})
      await page.goto(url,{waitUntil:'networkidle'});await waitForReferenceVisualDocument(page,'design')
      await page.getByRole('button',{name:'Properties',exact:true}).click();await page.getByRole('button',{name:'Artboard 1 of 3: Page 1',exact:true}).click()
      if(scenario.targetFile)await page.getByTestId('mega-artboard-title-'+scenario.targetFile).click()
      if(scenario.multi){await page.getByTestId('mega-artboard-title-Page2.dc.html').click();await page.getByTestId('mega-artboard-title-Page1.dc.html').click({modifiers:[scenario.selectionModifier]})}
      const before=JSON.parse(await readFile(join(project,'project/canvas.json'),'utf8'))
      const target=scenario.group?page.locator('[data-testid="mega-set-box"],[data-testid="mega-group-box"]'):page.getByTestId((scenario.resize?'mega-artboard-resize-':'mega-artboard-title-')+(scenario.targetFile??'Page1.dc.html')),bounds=await target.boundingBox()
      const handle=scenario.handle??'se'
      const start=scenario.resize?{x:bounds.x+(handle.includes('w')?0:handle.includes('e')?bounds.width:bounds.width/2),y:bounds.y+(handle.includes('n')?0:handle.includes('s')?bounds.height:bounds.height/2)}:{x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}
      if(scenario.modifier)await page.keyboard.down(scenario.modifier)
      await page.mouse.move(start.x,start.y);await page.mouse.down();if(scenario.phase){await page.mouse.move(start.x+(scenario.dx??40)/2,start.y+(scenario.dy??30)/2,{steps:3});if(scenario.phase==='press')await page.keyboard.down('Alt');else await page.keyboard.up('Alt')}if(!scenario.stationary)await page.mouse.move(start.x+(scenario.dx??40),start.y+(scenario.dy??30),{steps:5})
      await page.waitForTimeout(120)
      const frame=await (scenario.group?page.locator('[data-testid="mega-set-box"],[data-testid="mega-group-box"]'):page.getByTestId('mega-artboard-resize-'+(scenario.targetFile??'Page1.dc.html'))).boundingBox(),heading=await page.getByTestId('mega-artboard-title-'+(scenario.targetFile??'Page1.dc.html')).boundingBox()
      const spacingParts=scenario.targetFile?await page.getByTestId('mega-spacing-guides').locator('*').evaluateAll(nodes=>nodes.map(element=>{const style=getComputedStyle(element);return{tag:element.tagName,cls:String(element.className?.baseVal??element.className),text:element.children.length?null:element.textContent,style:element.getAttribute('style'),rect:element.getBoundingClientRect().toJSON(),color:style.color,background:style.backgroundColor,font:style.font,padding:style.padding,borderRadius:style.borderRadius,stroke:style.stroke,strokeWidth:style.strokeWidth}})):undefined
      const selections=scenario.group?await page.locator('[style*="outline-width"],[data-mega-chrome="group-resize"]').evaluateAll(nodes=>nodes.map(element=>{const style=getComputedStyle(element);return{tag:element.tagName,cls:String(element.className),style:element.getAttribute('style'),rect:element.getBoundingClientRect().toJSON(),outline:style.outline}})):undefined
      const decorations=scenario.targetFile?await page.locator('[data-testid],svg line,svg text').evaluateAll(nodes=>nodes.filter(element=>/gap|snap|guide/i.test(element.getAttribute('data-testid')??'')||element.tagName.toLowerCase()==='line'||element.tagName.toLowerCase()==='text').map(element=>({tag:element.tagName,testId:element.getAttribute('data-testid'),cls:String(element.className?.baseVal??element.className),style:element.getAttribute('style'),text:element.textContent,rect:element.getBoundingClientRect().toJSON(),stroke:getComputedStyle(element).stroke,color:getComputedStyle(element).color})).slice(-80)):undefined
      const preview=await page.locator('div.border-dashed').evaluateAll(nodes=>nodes.map(element=>{const style=getComputedStyle(element);return{rect:element.getBoundingClientRect().toJSON(),background:style.backgroundColor,border:style.border,borderRadius:style.borderRadius}}))
      await page.screenshot({path:join(output,`${scenario.name}-preview.png`)})
      if(scenario.cancel)await page.keyboard.press('Escape')
      await page.mouse.up();if(scenario.modifier)await page.keyboard.up(scenario.modifier);if(scenario.phase==='press')await page.keyboard.up('Alt')
      await page.keyboard.press('Control+s');await page.waitForTimeout(600)
      const after=JSON.parse(await readFile(join(project,'project/canvas.json'),'utf8'))
      results.push({scenario,bounds,frame,heading,before,after,preview,...(decorations?{decorations}:{}),...(selections?{selections}:{}),...(spacingParts?{spacingParts}:{})})
      await writeFile(join(output,'reference.json'),JSON.stringify({referenceCommit:inventory.referenceCommit,referenceResourceHashesVerified:inventory.sources.length,browser:browser.version(),fixture:'native-editor-visual-fixture.mjs',scope:'1440×1000 浅色、画板属性已打开；仅记录本文件列出的手势',results},null,2)+'\n')
      console.log(`${scenario.name} 已捕获`)
    }finally{await page?.close();server?.kill('SIGTERM');await rm(project,{recursive:true,force:true})}
  }
}finally{await browser.close()}
