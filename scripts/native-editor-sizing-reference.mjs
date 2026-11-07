#!/usr/bin/env node
/** Fixed release in a disposable project; no reference runtime enters product assets. */
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
assert.ok(args['reference-root'],'需要独立参考目录 --reference-root')
const sourceRoot=resolve(args['reference-root']),output=resolve(args.output??join(tmpdir(),'lingxi-source-sizing'))
const inventory=JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-inventory.json',import.meta.url),'utf8'))
for(const source of inventory.sources)assert.equal(createHash('sha256').update(await readFile(join(sourceRoot,source.path))).digest('hex'),source.sha256,`参考资源已变化：${source.path}`)
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const browser=await chromium.launch({headless:true,...(args.browser?{executablePath:args.browser}:{}),args:['--no-sandbox']})
await mkdir(output,{recursive:true})
const cases=[]
try{
  for(const name of args.case?.split(',')??['base','width','percent','width-hug','width-fill','height-hug','height-fill','position-inline','position-relative','position-fixed','position-sticky','min-width','max-width','min-height','max-height','right','bottom','offset','reset-width','escape','blank','save']){
    const project=await mkdtemp(join(tmpdir(),'lingxi-source-sizing-'));let server,page
    try{
      for(const [file,bytes]of createVisualFixture('design').legacyFiles){const path=join(project,file);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)}
      server=spawn(process.execPath,[join(sourceRoot,'skills/claude-design/scripts/server.mjs'),project,'--port','0','--host','127.0.0.1'],{stdio:['ignore','pipe','ignore']})
      const url=await new Promise((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('参考服务启动超时')),15000);server.stdout.on('data',bytes=>{raw+=bytes;try{const data=JSON.parse(raw);if(data.url){clearTimeout(timer);resolve(data.url)}}catch{}});server.once('exit',()=>{clearTimeout(timer);reject(Error('参考服务退出'))})})
      page=await browser.newPage({viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},colorScheme:args.theme??'light',reducedMotion:'reduce'})
      await page.goto(url,{waitUntil:'networkidle'});await waitForReferenceVisualDocument(page,'design')
      await page.getByRole('button',{name:'Properties',exact:true}).click()
      const board=page.locator('[data-mega-artboard]').first(),rect=await board.boundingBox()
      await page.mouse.dblclick(rect.x+rect.width*.8,rect.y+rect.height*.75)
      const frame=await(await board.locator('iframe').elementHandle()).contentFrame(),heading=args.node==='image'?frame.locator('img').first():args.node==='shape'?frame.locator('h1').locator('..').locator(':scope > div').last():args.node==='group'?frame.locator('h1').locator('..'):frame.locator('h1')
      const textRect=await heading.boundingBox();await page.mouse.click(textRect.x+(args.node?textRect.width*.5:8),textRect.y+textRect.height*.5)
      if(args.node==='shape'){const expand=page.getByRole('button',{name:/^Expand group/}).first();if(await expand.count())await expand.click();await page.getByRole('treeitem',{name:'group',exact:true}).click()}
      if(!args.node)await page.getByRole('button',{name:'Font: Arial',exact:true}).waitFor();else await page.getByRole('textbox',{name:'Width',exact:true}).waitFor()
      if(args.node)await page.waitForFunction(expected=>document.querySelector('input[aria-label="Width"]')?.value===expected,({image:'640px',shape:'180px',group:'1920px'})[args.node])
      const original=await readFile(join(project,'project/Page1.dc.html'),'utf8')
      const width=page.getByRole('textbox',{name:'Width',exact:true})
      if(['width','percent','escape','blank','save','auto'].includes(name)){
        await width.fill(name==='auto'?'auto':name==='percent'?'50%':name==='blank'?'':'800')
        await width.press(name==='escape'?'Escape':name==='save'?'Control+s':'Enter')
      }else if(name.endsWith('-hug')||name.endsWith('-fill')){
        const axis=name.startsWith('width')?'Width':'Height',mode=name.endsWith('-hug')?'Hug':'Fill'
        await page.getByRole('button',{name:axis+' mode: Fixed',exact:true}).click()
        await page.getByRole('menuitemradio',{name:mode,exact:true}).click()
      }else if(name.startsWith('position-')){
        await page.getByRole('button',{name:'Position: Absolute',exact:true}).click()
        const label=name.slice(9);await page.getByRole('menuitemradio',{name:label[0].toUpperCase()+label.slice(1),exact:true}).click()
      }else if(['min-width','max-width','min-height','max-height','right','bottom'].includes(name)){
        const label=name[0].toUpperCase()+name.slice(1).replace('-',' ')
        await page.getByRole('button',{name:'Add to Size',exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click()
        const target=page.getByRole('textbox',{name:label,exact:true});await target.fill(args.value??(name.includes('max')?'900':'20'));await target.press('Enter')
      }else if(name==='offset'){
        await page.getByRole('textbox',{name:'Offset X',exact:true}).fill('120');await page.getByRole('textbox',{name:'Offset X',exact:true}).press('Enter')
        await page.getByRole('textbox',{name:'Offset Y',exact:true}).fill('80');await page.getByRole('textbox',{name:'Offset Y',exact:true}).press('Enter')
      }else if(name==='reset-width'){await page.getByTitle('Width',{exact:true}).first().hover();await page.getByRole('button',{name:'Unset Width (use inherited)',exact:true}).click()}
      await page.waitForTimeout(450)
      const panel=page.getByRole('complementary',{name:'Properties panel',exact:true})
      const readControls=()=>panel.locator('button,input').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return{tag:element.tagName,label:element.getAttribute('aria-label'),text:element.textContent,value:element.value,placeholder:element.getAttribute('placeholder'),rect:element.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,borderRadius:style.borderRadius,color:style.color,background:style.backgroundColor}}))
      const controlsBeforeGlobalSave=await readControls()
      const readGeometry=()=>heading.evaluate(element=>{const style=getComputedStyle(element);return{style:element.getAttribute('style'),rect:element.getBoundingClientRect().toJSON(),width:style.width,height:style.height,position:style.position,left:style.left,top:style.top,minWidth:style.minWidth,maxWidth:style.maxWidth,minHeight:style.minHeight,maxHeight:style.maxHeight,right:style.right,bottom:style.bottom}})
      const geometryBeforeGlobalSave=await readGeometry()
      const beforeGlobalSave=await readFile(join(project,'project/Page1.dc.html'),'utf8');await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+s');await page.waitForTimeout(600)
      const controls=await readControls(),geometry=await readGeometry()
      const html=await readFile(join(project,'project/Page1.dc.html'),'utf8'),snippet=html.match(/<h1\b[\s\S]*?<\/h1>/)?.[0]
      await page.screenshot({path:join(output,`sizing-${name}.png`)})
      cases.push({name,subject:args.node??'text',snippet,geometry,controls,geometryBeforeGlobalSave,controlsBeforeGlobalSave,beforeGlobalSaveUnchanged:beforeGlobalSave===original,unchanged:html===original,focus:await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))})
      await writeFile(join(output,'reference.json'),JSON.stringify({sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',referenceResourceHashesVerified:inventory.sources.length,browser:browser.version(),theme:args.theme??'light',viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},cases},null,2)+'\n')
      console.log(name+' 已捕获')
    }finally{await page?.close();server?.kill('SIGTERM');await rm(project,{recursive:true,force:true})}
  }
}finally{await browser.close()}
