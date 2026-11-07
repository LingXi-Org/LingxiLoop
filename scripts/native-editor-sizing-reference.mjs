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
      await page.addInitScript(()=>{window.__sizingChrome=[];window.addEventListener('message',event=>{if(event.data?.__dcEditorEvt?.type==='chrome')window.__sizingChrome.push(event.data.__dcEditorEvt)})});await page.goto(url,{waitUntil:'networkidle'});await waitForReferenceVisualDocument(page,'design')
      if(args.zoom){await page.getByRole('button',{name:/^\d+%, Zoom$/}).click();await writeFile(join(output,'zoom-menu.txt'),await page.locator('body').innerText());await page.getByText(args.zoom,{exact:true}).last().click()}
      await page.getByRole('button',{name:'Properties',exact:true}).click()
      const board=page.locator('[data-mega-artboard]').first()
      if(args.zoom){for(let attempt=0;attempt<4;attempt++){const bounds=await board.boundingBox(),dx=Math.max(-800,Math.min(800,48-bounds.x));if(Math.abs(dx)<1)break;await page.keyboard.down('Space');await page.mouse.move(dx>0?100:950,150);await page.mouse.down();await page.mouse.move((dx>0?100:950)+dx,150,{steps:8});await page.mouse.up();await page.keyboard.up('Space');await page.waitForTimeout(200)}}
      const rect=await board.boundingBox()
      await page.mouse.dblclick(rect.x+rect.width*.8,rect.y+rect.height*.75)
      const frame=await(await board.locator('iframe').elementHandle()).contentFrame(),heading=args.node==='image'?frame.locator('img').first():args.node==='shape'?frame.locator('h1').locator('..').locator(':scope > div').last():args.node==='group'?frame.locator('h1').locator('..'):frame.locator('h1')
      const textRect=await heading.boundingBox();await page.mouse.click(textRect.x+(args.node?textRect.width*.5:8),textRect.y+textRect.height*.5)
      if(args.node==='shape'){const expand=page.getByRole('button',{name:/^Expand group/}).first();if(await expand.count())await expand.click();await page.getByRole('treeitem',{name:'group',exact:true}).click()}
      if(args['outline-element']==='true')await page.getByRole('treeitem',{name:'Heading, “LingxiLoop 1”',exact:true}).click()
      if(!args.node)await page.getByRole('button',{name:'Font: Arial',exact:true}).waitFor();else await page.getByRole('textbox',{name:'Width',exact:true}).waitFor()
      if(args.node)await page.waitForFunction(expected=>document.querySelector('input[aria-label="Width"]')?.value===expected,({image:'640px',shape:'180px',group:'1920px'})[args.node])
      if(args.position){await page.getByRole('button',{name:'Position: Absolute',exact:true}).click();await page.getByRole('menuitemradio',{name:args.position,exact:true}).click()}
      const original=await readFile(join(project,'project/Page1.dc.html'),'utf8')
      let dragObservation
      const width=page.getByRole('textbox',{name:'Width',exact:true})
      if(['width','percent','escape','blank','save','auto'].includes(name)){
        await width.fill(name==='auto'?'auto':name==='percent'?'50%':name==='blank'?'':'800')
        await width.press(name==='escape'?'Escape':name==='save'?'Control+s':'Enter')
      }else if(name.endsWith('-hug')||name.endsWith('-fill')){
        const axis=name.startsWith('width')?'Width':'Height',mode=name.endsWith('-hug')?'Hug':'Fill'
        await page.getByRole('button',{name:axis+' mode: Fixed',exact:true}).click()
        await page.getByRole('menuitemradio',{name:mode,exact:true}).click()
      }else if(name.startsWith('align-')){
        for(const direction of name.slice(6).split('-')){
          const label={left:'Align left',center:'Align horizontal centers',right:'Align right',top:'Align top',middle:'Align vertical centers',bottom:'Align bottom'}[direction]
          await page.getByRole('button',{name:label,exact:true}).click()
        }
        if(args['after-width']){await width.fill(args['after-width']);await width.press('Enter')}
        if(args['after-height']){const height=page.getByRole('textbox',{name:'Height',exact:true});await height.fill(args['after-height']);await height.press('Enter')}
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
      if(args['align-drag']){
        await page.waitForTimeout(450)
        const box=await heading.boundingBox(),delta=Number(args['align-drag'])
        const observe=()=>{window.__refSizingDrag=[];for(const name of ['pointerdown','pointermove','pointerup'])document.addEventListener(name,event=>window.__refSizingDrag.push({type:event.type,x:event.clientX,y:event.clientY,target:event.target.tagName,html:event.target.outerHTML?.slice(0,180),trusted:event.isTrusted}),true)}
        await page.evaluate(observe);await frame.evaluate(observe)
        dragObservation={beforeBox:box,beforeDom:await heading.evaluate(element=>({rect:element.getBoundingClientRect().toJSON(),style:element.getAttribute('style')}))}

        await page.mouse.move(box.x+8,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+8+delta,box.y+box.height/2,{steps:6});await page.mouse.up()
      }
      if(args['align-resize']){
        await page.waitForTimeout(450)
        const box=await heading.boundingBox(),direction=args['align-resize'],point={x:direction.includes('w')?box.x:direction.includes('e')?box.x+box.width:box.x+box.width/2,y:direction.includes('n')?box.y:direction.includes('s')?box.y+box.height:box.y+box.height/2}
        await page.mouse.move(box.x+8,box.y+box.height/2);await page.waitForTimeout(450)
        const handles=[]
        for(const scope of page.frames())for(const candidate of await scope.locator('[data-resize-handle]:not([data-rotate-handle])').all()){
          const r=await candidate.boundingBox();if(r&&r.width>0&&r.height>0)handles.push({x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height})
        }
        const handle=handles.sort((a,b)=>(a.x-point.x)**2+(a.y-point.y)**2-(b.x-point.x)**2-(b.y-point.y)**2)[0]
        await writeFile(join(output,'resize-handle-observation.json'),JSON.stringify({box,handles,chrome:await page.evaluate(()=>window.__sizingChrome.slice(-3)),tree:await page.getByRole('treeitem').evaluateAll(elements=>elements.map(element=>({label:element.getAttribute('aria-label'),selected:element.getAttribute('aria-selected'),text:element.textContent.slice(0,120)}))),frameBody:await frame.locator('body').evaluate(element=>({attributes:[...element.attributes].map(a=>[a.name,a.value]),rootRuntime:typeof window.__dcRootName==='function',rootName:typeof window.__dcRootName==='function'?window.__dcRootName():null,scopes:[...document.querySelectorAll('[data-sc-name]')].map(node=>[node.tagName,node.getAttribute('data-sc-name')])}))},null,2))
        assert.ok(handle&&Math.hypot(handle.x-point.x,handle.y-point.y)<10,'必须命中所选元素的缩放手柄')
        await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+20,handle.y,{steps:6});await page.mouse.up()
      }
      await page.waitForTimeout(450)
      if(dragObservation){dragObservation.mainEvents=await page.evaluate(()=>window.__refSizingDrag);dragObservation.frameEvents=await frame.evaluate(()=>window.__refSizingDrag)}
      const panel=page.getByRole('complementary',{name:'Properties panel',exact:true})
      const readControls=()=>panel.locator('button,input').evaluateAll(elements=>elements.map(element=>{const style=getComputedStyle(element);return{tag:element.tagName,label:element.getAttribute('aria-label'),disabled:element.disabled,text:element.textContent,value:element.value,placeholder:element.getAttribute('placeholder'),rect:element.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,borderRadius:style.borderRadius,color:style.color,background:style.backgroundColor,opacity:style.opacity,outline:style.outline,boxShadow:style.boxShadow,iconGeometry:element.getAttribute('aria-label')?.startsWith('Align')?[...element.querySelectorAll('svg,i,span')].map(child=>{const css=getComputedStyle(child);return{tag:child.tagName,rect:child.getBoundingClientRect().toJSON(),fontSize:css.fontSize,strokeWidth:css.strokeWidth,display:css.display,color:css.color,background:css.backgroundColor,opacity:css.opacity}}):undefined}}))
      const controlsBeforeGlobalSave=await readControls()
      const readGeometry=()=>heading.evaluate(element=>{const style=getComputedStyle(element);return{style:element.getAttribute('style'),rect:element.getBoundingClientRect().toJSON(),width:style.width,height:style.height,position:style.position,left:style.left,top:style.top,minWidth:style.minWidth,maxWidth:style.maxWidth,minHeight:style.minHeight,maxHeight:style.maxHeight,right:style.right,bottom:style.bottom}})
      const geometryBeforeGlobalSave=await readGeometry()
      const beforeGlobalSave=await readFile(join(project,'project/Page1.dc.html'),'utf8');await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Control+s');await page.waitForTimeout(600)
      if(args['align-state']){
        const target=page.getByRole('button',{name:'Align left',exact:true})
        if(args['align-state']==='hover')await target.hover()
        else if(args['align-state']==='focus'){
          await width.focus()
          for(let index=0;index<20&&!await target.evaluate(element=>element===document.activeElement);index++)await page.keyboard.press('Shift+Tab')
          assert.equal(await target.evaluate(element=>element===document.activeElement),true)
        }
      }
      if(args['align-key']){await page.keyboard.press(args['align-key']);await page.waitForTimeout(450)}
      if(args['align-state'])await page.waitForTimeout(250)
      const controls=await readControls(),geometry=await readGeometry()
      const html=await readFile(join(project,'project/Page1.dc.html'),'utf8'),snippet=html.match(/<h1\b[\s\S]*?<\/h1>/)?.[0]
      await page.screenshot({path:join(output,`sizing-${name}.png`)})
      const frameRect=await board.locator('iframe').boundingBox(),camera={beforeDomEntry:rect,frameRect,scale:frameRect.width/1920,headingScreenRect:await heading.boundingBox()}
      cases.push({name,subject:args.node??'text',camera,dragObservation,snippet,geometry,controls,geometryBeforeGlobalSave,controlsBeforeGlobalSave,beforeGlobalSaveUnchanged:beforeGlobalSave===original,unchanged:html===original,focus:await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))})
      await writeFile(join(output,'reference.json'),JSON.stringify({sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',referenceResourceHashesVerified:inventory.sources.length,browser:browser.version(),theme:args.theme??'light',viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},cases},null,2)+'\n')
      console.log(name+' 已捕获')
    }finally{await page?.close();server?.kill('SIGTERM');await rm(project,{recursive:true,force:true})}
  }
}finally{await browser.close()}
