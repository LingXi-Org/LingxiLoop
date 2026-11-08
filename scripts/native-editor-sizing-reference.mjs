#!/usr/bin/env node
/** Fixed release in a disposable project; no reference runtime enters product assets. */
import {measureTextChrome,measureFontPopup} from './native-editor-text-chrome.mjs'
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
      for(const [file,bytes]of createVisualFixture('design').legacyFiles){const path=join(project,file);await mkdir(dirname(path),{recursive:true});let content=bytes
        if(file.endsWith('/Page1.dc.html')){
          content=String(bytes)
          if(args['style-current-size-unset']==='true')content=content.replace('font-size:48px;','')
          if(args['style-current-variable']==='true')content=content.replace('font-size:48px','font-size:var(--custom-size)').replace('style="position:relative','style="--custom-size:43px;position:relative')
          if(args['font-parent-family'])content=content.replace('style="position:relative','style="font-family:'+args['font-parent-family']+';position:relative')
          if(args['weight-current'])content=content.replace('font-weight:700;','font-weight:'+args['weight-current']+';')
          if(args['weight-current-italic']==='true')content=content.replace('line-height:1.25;','font-style:italic;line-height:1.25;')
          if(args['weight-inherit']==='true')content=content.replace('font-weight:700;','').replace('font-style:italic;','')
          if(args['weight-parent'])content=content.replace('style="position:relative','style="font-weight:'+args['weight-parent']+';font-style:'+(args['weight-parent-style']??'normal')+';position:relative')
          if(args['font-current-family'])content=content.replace('font-family:Arial;','font-family:'+args['font-current-family']+';')
          if(args['font-current-italic']==='true')content=content.replace('font-weight:700;','font-weight:700;font-style:italic;')
          if(args['style-current-family'])content=content.replace('font-family:Arial','font-family:'+args['style-current-family'])
          if(args['style-census-fixture']==='true')content=content.replace('</x-dc>','<h2 style="position:absolute;left:1000px;top:200px;font-size:32px;font-family:Arial">次级标题</h2><p style="position:absolute;left:1000px;top:300px;font-size:18px;font-family:Arial">正文内容</p><small style="position:absolute;left:1000px;top:400px;font-size:14px;font-family:Arial">补充说明</small></x-dc>')
          if(args['text-align-initial'])content=content.replace('<h1 style="',`<h1 style="text-align:${args['text-align-initial']};`)
          if(args['contrast-color'])content=content.replace('color:#18332b',`color:${args['contrast-color']}`)
          if(args['contrast-size'])content=content.replace('font-size:48px',`font-size:${args['contrast-size']}px`)
          if(args['contrast-opacity'])content=content.replace('<h1 style="',`<h1 style="opacity:${args['contrast-opacity']};`)
          if(name==='contrast-gradient')content=content.replace('<h1 style="','<h1 style="background-image:linear-gradient(red,blue);')
          if(name==='contrast-clipped')content=content.replace('<h1 style="','<h1 style="background-clip:text;')
        }
        await writeFile(path,content)}
      server=spawn(process.execPath,[join(sourceRoot,'skills/claude-design/scripts/server.mjs'),project,'--port','0','--host','127.0.0.1'],{stdio:['ignore','pipe','ignore']})
      const url=await new Promise((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('参考服务启动超时')),15000);server.stdout.on('data',bytes=>{raw+=bytes;try{const data=JSON.parse(raw);if(data.url){clearTimeout(timer);resolve(data.url)}}catch{}});server.once('exit',()=>{clearTimeout(timer);reject(Error('参考服务退出'))})})
      page=await browser.newPage({viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},colorScheme:args.theme??'light',hasTouch:args.touch==='true',reducedMotion:'reduce'})
      await page.addInitScript(()=>{window.__sizingChrome=[];window.addEventListener('message',event=>{if(event.data?.__dcEditorEvt?.type==='chrome')window.__sizingChrome.push(event.data.__dcEditorEvt)})});await page.goto(url,{waitUntil:'networkidle'});const startupPreviewExited=args['exit-preview']==='true'&&await page.getByRole('button',{name:'Back to canvas',exact:true}).count()>0;if(startupPreviewExited)await page.getByRole('button',{name:'Back to canvas',exact:true}).click();try{await waitForReferenceVisualDocument(page,'design',args['ready-timeout']?{timeout:Number(args['ready-timeout'])}:{})}catch(error){await page.screenshot({path:join(output,'reference-not-ready.png')});await writeFile(join(output,'reference-not-ready.json'),JSON.stringify(await page.evaluate(()=>({text:document.body.innerText,boards:document.querySelectorAll('[data-mega-artboard]').length,frames:document.querySelectorAll('iframe').length,buttons:[...document.querySelectorAll('button')].map(button=>({label:button.getAttribute('aria-label'),text:button.textContent}))})),null,2)+'\n');throw error}
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
      if(args['style-multi']==='true')await frame.locator('p').first().click({modifiers:['Shift']})
      if(args['text-editing']==='true')await heading.dblclick()
      if(!args.node)await page.getByRole('button',{name:/^Font:/}).waitFor();else await page.getByRole('textbox',{name:'Width',exact:true}).waitFor()
      if(args.node)await page.waitForFunction(expected=>document.querySelector('input[aria-label="Width"]')?.value===expected,({image:'640px',shape:'180px',group:'1920px'})[args.node])
      if(args.position){await page.getByRole('button',{name:'Position: Absolute',exact:true}).click();await page.getByRole('menuitemradio',{name:args.position,exact:true}).click()}
      const original=await readFile(join(project,'project/Page1.dc.html'),'utf8')
      let dragObservation
      if(name==='contrast-color-probe')await writeFile(join(output,'color-controls.json'),JSON.stringify(await page.getByRole('button').evaluateAll(elements=>elements.map(element=>({label:element.getAttribute('aria-label'),title:element.getAttribute('title'),text:element.textContent.slice(0,60)}))),null,2)+'\n')
      const width=page.getByRole('textbox',{name:'Width',exact:true})
      if(['contrast-color-open','contrast-color-custom','contrast-color-edit'].includes(name)){
        await page.getByRole('button',{name:/^Color: /}).click()
        if(name!=='contrast-color-open')await page.getByRole('tab',{name:'Custom',exact:true}).click()
        await writeFile(join(output,'color-popover-controls.json'),JSON.stringify({inputs:await page.locator('input').evaluateAll(elements=>elements.map(element=>({type:element.type,label:element.getAttribute('aria-label'),placeholder:element.getAttribute('placeholder'),value:element.value}))),buttons:await page.getByRole('button').evaluateAll(elements=>elements.map(element=>({label:element.getAttribute('aria-label'),text:element.textContent.slice(0,70)}))),dialogs:await page.getByRole('dialog').evaluateAll(elements=>elements.map(element=>({label:element.getAttribute('aria-label'),text:element.textContent.slice(0,300)})))},null,2)+'\n')
        if(name==='contrast-color-edit'){const hex=page.getByRole('textbox',{name:'Hex color',exact:true});await hex.fill(args['color-target']??'#faf8f4');await hex.press('Enter');await page.getByRole('button',{name:'Close',exact:true}).click()}
      }else if(['width','percent','escape','blank','save','auto'].includes(name)){
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
      }else if(['padding','margin','padding-expand','margin-expand','padding-step-down','margin-step-down','padding-blank','margin-blank'].includes(name)){
        const property=name.startsWith('padding')?'padding':'margin',label=property==='padding'?'Padding':'Margin'
        if(name.endsWith('-expand'))await page.getByRole('button',{name:`Edit ${property} per side`,exact:true}).click()
        else{const input=page.getByRole('textbox',{name:label,exact:true});if(name.endsWith('-step-down'))await input.press('ArrowDown');else{await input.fill(name.endsWith('-blank')?'':args.value??'20');await input.press('Enter')}}
      }else if(name.startsWith('text-align-')){
        const group=page.getByRole('radiogroup',{name:'Align',exact:true}),value=name.slice('text-align-'.length),label={left:'Left',center:'Center',right:'Right',justify:'Justify'}[value]
        await group.getByRole('radio',{name:value==='reset'?'Right':label,exact:true}).click()
        if(value==='reset')await page.getByRole('button',{name:'Unset Align (use inherited)',exact:true}).click()
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
      if(args['align-nudge']){
        await heading.click();await page.keyboard.press(args['align-nudge']);await page.waitForTimeout(450)
      }
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
      const readGeometry=()=>heading.evaluate(element=>{const style=getComputedStyle(element);return{...(element.ownerDocument.defaultView?.top!==element.ownerDocument.defaultView?{outerHTML:element.outerHTML,parentHTML:element.parentElement?.outerHTML}:{}),layoutWidth:element.offsetWidth,layoutHeight:element.offsetHeight,boxSizing:style.boxSizing,paddingTop:style.paddingTop,paddingRight:style.paddingRight,paddingBottom:style.paddingBottom,paddingLeft:style.paddingLeft,marginTop:style.marginTop,marginRight:style.marginRight,marginBottom:style.marginBottom,marginLeft:style.marginLeft,style:element.getAttribute('style'),rect:element.getBoundingClientRect().toJSON(),width:style.width,height:style.height,position:style.position,left:style.left,top:style.top,minWidth:style.minWidth,maxWidth:style.maxWidth,minHeight:style.minHeight,maxHeight:style.maxHeight,right:style.right,bottom:style.bottom,textAlign:style.textAlign}})
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
      if(args['link-state']){const destination=page.getByRole('textbox',{name:'Destination',exact:true});if(args['link-state']==='hover')await destination.hover();else if(args['link-state']==='focus')await destination.focus();await page.waitForTimeout(250)}
      let textMenuData=null
      if(args['text-menu']==='true'||args['text-property']){await panel.locator('[data-testid=dc-add-text] button').click();await page.getByRole('menu').waitFor();textMenuData=await page.getByRole('menuitem').evaluateAll(elements=>elements.map(element=>({text:element.textContent,label:element.getAttribute('aria-label'),disabled:element.getAttribute('aria-disabled'),html:element.outerHTML})));if(args['text-property']){await page.getByRole('menuitem',{name:args['text-property'],exact:true}).click();if(await page.getByRole('menu').isVisible())await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'})}}
      if(args['text-property']){await writeFile(join(output,'text-property-aria.txt'),await panel.ariaSnapshot());await writeFile(join(output,'text-property-panel.html'),await panel.evaluate(element=>element.outerHTML))}
      if(args['text-action']==='underline')await page.getByRole('button',{name:'Underline',exact:true}).click()
      if(args['text-action']==='strikethrough')await page.getByRole('button',{name:'Strikethrough',exact:true}).click()
      if(args['text-action']==='list-bullet')await page.getByRole('radio',{name:'Bulleted list',exact:true}).click()
      if(args['text-action']==='list-number')await page.getByRole('radio',{name:'Numbered list',exact:true}).click()
      if(args['text-action']==='case-uppercase'){await page.getByRole('button',{name:'Case: None',exact:true}).click();const menu=page.getByRole('menu');await menu.waitFor();await writeFile(join(output,'case-menu-aria.txt'),await menu.ariaSnapshot());await menu.getByRole('menuitemradio',{name:/uppercase/i}).click()}
      if(args['text-action']==='case-menu'){await page.getByRole('button',{name:'Case: None',exact:true}).click();await page.getByRole('menu').waitFor();await writeFile(join(output,'case-menu.json'),JSON.stringify(await page.getByRole('menu').locator('[role^=menuitem]').evaluateAll(elements=>elements.map(element=>({role:element.getAttribute('role'),text:element.textContent,label:element.getAttribute('aria-label')}))),null,2)+'\n')}
      if(args['text-action']&&!args['text-action'].endsWith('-menu')){await page.keyboard.press('Control+s');await page.waitForTimeout(600);await writeFile(join(output,'text-action-saved.html'),await readFile(join(project,'project/Page1.dc.html'),'utf8'))}
      const controls=await readControls(),geometry=await readGeometry()
      const textAlignmentChrome=args.node?null:await panel.getByText('Align',{exact:true}).evaluate(label=>{
        const row=label.parentElement.parentElement
        const group=row.querySelector('[role=radiogroup]'),style=group&&getComputedStyle(group),thumb=group?.querySelector('[data-flip-at]'),thumbStyle=thumb&&getComputedStyle(thumb)
        return{html:row.outerHTML,rect:row.getBoundingClientRect().toJSON(),group:group&&{rect:group.getBoundingClientRect().toJSON(),background:style.backgroundColor,borderRadius:style.borderRadius,padding:style.padding,height:style.height},thumb:thumb&&{rect:thumb.getBoundingClientRect().toJSON(),background:thumbStyle.backgroundColor,borderRadius:thumbStyle.borderRadius,boxShadow:thumbStyle.boxShadow},controls:[...row.querySelectorAll('[role=radio]')].map(element=>{const css=getComputedStyle(element);return{tag:element.tagName,role:element.getAttribute('role'),label:element.getAttribute('aria-label')??element.querySelector('[aria-label]')?.getAttribute('aria-label'),title:element.getAttribute('title'),checked:element.getAttribute('aria-checked'),pressed:element.getAttribute('aria-pressed'),value:element.getAttribute('value'),rect:element.getBoundingClientRect().toJSON(),color:css.color,background:css.backgroundColor,borderRadius:css.borderRadius,boxShadow:css.boxShadow,outline:css.outline,tabIndex:element.tabIndex}})}
      })
      if(args['text-style-menu']==='true'){const styleTrigger=panel.getByRole('button',{name:/^Text style:/});if(args['text-style-trigger-key']){await styleTrigger.focus();await styleTrigger.press(args['text-style-trigger-key'])}else await styleTrigger.click();await page.getByRole('menu').waitFor();await writeFile(join(output,'text-style-menu-aria.txt'),await page.getByRole('menu').ariaSnapshot());const styleSearch=page.getByRole('textbox',{name:'Search styles',exact:true});if(args['text-style-query']){await styleSearch.fill(args['text-style-query']);await page.getByRole('menuitem',{name:'No matches',exact:true}).waitFor();await writeFile(join(output,'text-style-menu-aria.txt'),await page.getByRole('menu').ariaSnapshot())}await writeFile(join(output,'text-style-popup-chrome.json'),JSON.stringify(await styleSearch.evaluate(measureFontPopup),null,2)+'\n');if(args['text-style-key'])await page.keyboard.press(args['text-style-key']);if(args['text-style-select']){await page.getByRole('menuitemradio',{name:new RegExp(' '+args['text-style-select']+'px$')}).click();await frame.waitForFunction(expected=>getComputedStyle(document.querySelector('h1')).fontSize===expected,args['text-style-select']+'px');await page.keyboard.press('Control+s');for(let attempt=0;attempt<100;attempt++){const saved=await readFile(join(project,'project/Page1.dc.html'),'utf8');if(new RegExp('font-size:\\s*'+args['text-style-select']+'px').test(saved))break;if(attempt===99)throw Error('来源字号尚未写入文件');await new Promise(resolve=>setTimeout(resolve,50))}await writeFile(join(output,'text-style-action.json'),JSON.stringify(await frame.locator('h1,h2,p,small').evaluateAll(elements=>elements.map(element=>({tag:element.tagName,text:element.textContent,fontSize:getComputedStyle(element).fontSize,fontWeight:getComputedStyle(element).fontWeight,fontFamily:getComputedStyle(element).fontFamily}))),null,2)+'\n')}}
      if(args['font-reset']==='true'||args['font-select']){
        if(args['font-reset']==='true'){await panel.getByText('Font',{exact:true}).hover();const reset=panel.getByRole('button',{name:'Unset Font (use inherited)',exact:true});await writeFile(join(output,'font-reset-chrome.json'),JSON.stringify(await reset.evaluate(element=>{const result=[];for(let node=element,depth=0;node&&depth<3;node=node.parentElement,depth++){const css=getComputedStyle(node);result.push({tag:node.tagName,rect:node.getBoundingClientRect().toJSON(),display:css.display,padding:css.padding,position:css.position,opacity:css.opacity,html:depth===1?node.outerHTML:null})}return result}),null,2)+'\n');await reset.click()}
        else{await panel.getByRole('button',{name:/^Font:/}).click();const query=page.getByRole('textbox',{name:'Search fonts',exact:true});await query.fill(args['font-select']);await page.getByRole('menuitemradio',{name:args['font-select'],exact:true}).last().click()}
        await page.keyboard.press('Control+s')
        for(let attempt=0;attempt<100;attempt++){const saved=await readFile(join(project,'project/Page1.dc.html'),'utf8'),text=saved.match(/<h1\b[\s\S]*?<\/h1>/)?.[0]??'';if(args['font-select']?text.includes(args['font-select']):!text.includes('font-family'))break;if(attempt===99)throw Error('来源字体尚未写入文件');await new Promise(resolve=>setTimeout(resolve,50))}
        await writeFile(join(output,'font-action.json'),JSON.stringify({before:original.match(/<h1\b[\s\S]*?<\/h1>/)?.[0],after:(await readFile(join(project,'project/Page1.dc.html'),'utf8')).match(/<h1\b[\s\S]*?<\/h1>/)?.[0],computed:await heading.evaluate(element=>{const css=getComputedStyle(element);return{fontFamily:css.fontFamily,fontSize:css.fontSize,fontWeight:css.fontWeight,fontStyle:css.fontStyle}})},null,2)+'\n');await writeFile(join(output,'font-action-aria.txt'),await panel.ariaSnapshot());if(args['font-weight-menu']==='true'){await panel.getByRole('button',{name:/^Weight:/}).click();await writeFile(join(output,'font-weight-aria.txt'),await page.getByRole('menu').ariaSnapshot())}
      }
      if(args['weight-menu']==='true'||args['weight-reset']==='true'||args['weight-select']){
        const trigger=panel.getByRole('button',{name:/^Weight:/});await trigger.waitFor()
        if(args['weight-reset']==='true'){
          await panel.getByText('Weight',{exact:true}).hover();const reset=panel.getByRole('button',{name:'Unset Weight (use inherited)',exact:true});await reset.waitFor();await writeFile(join(output,'weight-reset-chrome.json'),JSON.stringify(await reset.evaluate(element=>{const rows=[];for(let node=element,depth=0;node&&depth<4;node=node.parentElement,depth++){const css=getComputedStyle(node);rows.push({tag:node.tagName,text:node.textContent,rect:node.getBoundingClientRect().toJSON(),font:css.font,padding:css.padding,gap:css.gap,color:css.color})}return rows}),null,2)+'\n');await page.screenshot({path:join(output,'weight-reset-before.png')});await reset.click()
        }else{
          await trigger.click();const menu=page.getByRole('menu');await menu.waitFor();await writeFile(join(output,'weight-menu-aria.txt'),await menu.ariaSnapshot());await writeFile(join(output,'weight-menu-chrome.json'),JSON.stringify(await menu.evaluate(element=>{const measure=node=>{const css=getComputedStyle(node);return{rect:node.getBoundingClientRect().toJSON(),font:css.font,fontSize:css.fontSize,lineHeight:css.lineHeight,fontWeight:css.fontWeight,padding:css.padding,borderRadius:css.borderRadius,background:css.backgroundColor,color:css.color}};return{popup:measure(element),options:[...element.querySelectorAll('[role=menuitemradio]')].map(node=>({text:node.textContent,checked:node.getAttribute('aria-checked'),icon:(()=>{const marker=node.querySelector('svg')??[...node.querySelectorAll('*')].find(child=>/^[\ue000-\uf8ff]$/.test(child.textContent.trim()));return marker?{color:getComputedStyle(marker).color,width:marker.getBoundingClientRect().width,height:marker.getBoundingClientRect().height}:null})(),...measure(node)}))}}),null,2)+'\n');await page.screenshot({path:join(output,'weight-menu.png')});if(args['weight-select'])await menu.getByRole('menuitemradio',{name:args['weight-select'],exact:true}).click()
        }
        if(args['weight-reset']==='true'||args['weight-select']){await page.keyboard.press('Control+s');await page.waitForTimeout(350);await writeFile(join(output,'weight-action.json'),JSON.stringify({before:original.match(/<h1\b[\s\S]*?<\/h1>/)?.[0],after:(await readFile(join(project,'project/Page1.dc.html'),'utf8')).match(/<h1\b[\s\S]*?<\/h1>/)?.[0],computed:await heading.evaluate(element=>{const css=getComputedStyle(element);return{weight:css.fontWeight,style:css.fontStyle,family:css.fontFamily}}),active:await page.evaluate(()=>({label:document.activeElement?.getAttribute('aria-label'),text:document.activeElement?.textContent}))},null,2)+'\n')}
      }
      if(args['font-popup']==='true'){const fontTrigger=panel.getByRole('button',{name:'Font: Arial',exact:true});if(args['font-keyboard']==='true')await fontTrigger.press('ArrowDown');else await fontTrigger.click();await page.waitForTimeout(150);await writeFile(join(output,'font-popup-aria.txt'),await page.locator('body').ariaSnapshot());const fontInput=page.locator('input[placeholder*="font" i],input[aria-label*="font" i]').first();await fontInput.waitFor();if(args['font-query'])await fontInput.fill(args['font-query']);await page.waitForTimeout(350);await writeFile(join(output,'font-popup-chrome.json'),JSON.stringify(await fontInput.evaluate(measureFontPopup),null,2)+'\n');await writeFile(join(output,'font-popup-controls.json'),JSON.stringify(await fontInput.evaluate(element=>{const result=[];let node=element;for(let depth=0;depth<5&&node;depth++,node=node.parentElement){const style=getComputedStyle(node);result.push({tag:node.tagName,role:node.getAttribute('role'),label:node.getAttribute('aria-label'),rect:node.getBoundingClientRect().toJSON(),padding:style.padding,fontSize:style.fontSize,lineHeight:style.lineHeight,html:depth===2?node.outerHTML:null})}return result}),null,2)+'\n');if(args['font-keyboard']==='true'){await page.screenshot({path:join(output,'font-keyboard-open.png')});const steps=[],record=async step=>steps.push({step,active:await page.evaluate(()=>{const element=document.activeElement;return{tag:element?.tagName,role:element?.getAttribute('role'),label:element?.getAttribute('aria-label'),text:element?.textContent,value:element?.value,group:element?.closest('[role=group]')?.getAttribute('aria-label'),menu:element?.closest('[role=menu]')?.getAttribute('aria-label')}})});await record('open');await page.keyboard.press('End');await record('end');await page.keyboard.press('Home');await record('home');await page.keyboard.press('b');await record('type');await fontInput.fill('Arial');await fontInput.press('Tab');await record('tab');if(args['font-keyboard-forward']==='true'){await page.keyboard.press('Tab');await record('tab-forward')}else{await page.keyboard.press('Shift+Tab');await record('shift-tab');await page.keyboard.press('Tab');await record('tab-again');await page.keyboard.press('Tab');await record('tab-out')}await writeFile(join(output,'font-keyboard.json'),JSON.stringify(steps,null,2)+'\n')}}
      if(args['text-scroll']==='true')await panel.locator('[data-testid=dc-add-text]').locator('..').locator('..').locator('..').evaluate(element=>element.scrollIntoView({block:'end'}))
      const textChrome=args['capture-text-structure']==='true'?await panel.locator('[data-testid=dc-add-text]').locator('..').locator('..').locator('..').evaluate(measureTextChrome):null
      const linkChrome=args['capture-link-structure']==='true'?await page.getByRole('textbox',{name:'Destination',exact:true}).evaluate(input=>{
        const result=[];let element=input
        for(let depth=0;depth<6&&element;depth++,element=element.parentElement){const css=getComputedStyle(element);result.push({tag:element.tagName,class:element.className,html:element.outerHTML,rect:element.getBoundingClientRect().toJSON(),padding:css.padding,margin:css.margin,fontFamily:css.fontFamily,fontSize:css.fontSize,lineHeight:css.lineHeight,fontWeight:css.fontWeight,color:css.color,background:css.backgroundColor,boxShadow:css.boxShadow,borderTop:css.borderTop,borderBottom:css.borderBottom,labels:depth===4?[...element.querySelectorAll('h3>span,[data-property-row]>div>span')].map(label=>{const style=getComputedStyle(label);return{text:label.textContent,rect:label.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight,fontWeight:style.fontWeight,color:style.color}}):null})}
        return result
      }):null
      const contrastLockup=panel.locator('[data-dc=contrast-row] [data-kit=contrast-lockup]')
      const textContrastChrome=name.startsWith('contrast-')&&await contrastLockup.count()?await contrastLockup.first().evaluate(lockup=>{
        const ancestors=[];let element=lockup.lastElementChild
        for(let depth=0;depth<4&&element;depth++,element=element.parentElement){const style=getComputedStyle(element);ancestors.push({tag:element.tagName,role:element.getAttribute('role'),rect:element.getBoundingClientRect().toJSON(),html:element.outerHTML,color:style.color,background:style.backgroundColor,fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,margin:style.margin})}
        const swatch=lockup.querySelector('[data-kit=contrast-swatch]'),style=swatch&&getComputedStyle(swatch)
        const structure=[];let parent=lockup.parentElement
        for(let depth=0;depth<6&&parent;depth++,parent=parent.parentElement){structure.push({tag:parent.tagName,dc:parent.getAttribute('data-dc'),class:parent.className,children:[...parent.children].slice(0,25).map(child=>{const css=getComputedStyle(child);return{tag:child.tagName,dc:child.getAttribute('data-dc'),text:child.textContent.slice(0,90),rect:child.getBoundingClientRect().toJSON(),margin:css.margin,padding:css.padding,height:css.height}})})}
        return{present:true,title:lockup.getAttribute('title'),verdict:lockup.getAttribute('data-verdict'),swatch:swatch&&{color:style.color,background:style.backgroundColor},ancestors,structure}
      }):name.startsWith('contrast-')?{present:false}:null
      const selectionHandles=[]
      for(const scope of page.frames())for(const candidate of await scope.locator('[data-resize-handle]').all()){
        const rect=await candidate.boundingBox();if(rect&&rect.width>0&&rect.height>0)selectionHandles.push({rotate:await candidate.getAttribute('data-rotate-handle')!==null,rect})
      }
      const layoutChrome=await panel.getByText('Layout',{exact:true}).evaluate(element=>[element,element.parentElement,element.parentElement.parentElement].map(node=>{const css=getComputedStyle(node);return{tag:node.tagName,rect:node.getBoundingClientRect().toJSON(),padding:css.padding,margin:css.margin,height:css.height,fontSize:css.fontSize,lineHeight:css.lineHeight}}))
      const html=await readFile(join(project,'project/Page1.dc.html'),'utf8'),snippet=html.match(/<h1\b[\s\S]*?<\/h1>/)?.[0]
      if(/^(padding|margin)/.test(name))await page.mouse.move(20,200)
      await page.screenshot({path:join(output,`sizing-${name}.png`)})
      const frameRect=await board.locator('iframe').boundingBox(),camera={beforeDomEntry:rect,frameRect,scale:frameRect.width/1920,headingScreenRect:await heading.boundingBox()}
      cases.push({name,textAction:args['text-action']??null,addedTextProperty:args['text-property']??null,textMenuData,textChrome,textScrolled:args['text-scroll']==='true',startupPreviewExited,layoutChrome,textAlignmentChrome,textContrastChrome,linkChrome,initialTextAlignment:args['text-align-initial']??null,beforeActionSnippet:original.match(/<h1\b[\s\S]*?<\/h1>/)?.[0],subject:args.node??'text',camera,selectionHandles,dragObservation,snippet,geometry,controls,geometryBeforeGlobalSave,controlsBeforeGlobalSave,beforeGlobalSaveUnchanged:beforeGlobalSave===original,unchanged:html===original,focus:await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))})
      await writeFile(join(output,'reference.json'),JSON.stringify({sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',referenceResourceHashesVerified:inventory.sources.length,browser:browser.version(),theme:args.theme??'light',viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},cases},null,2)+'\n')
      console.log(name+' 已捕获')
    }finally{await page?.close();server?.kill('SIGTERM');await rm(project,{recursive:true,force:true})}
  }
}finally{await browser.close()}
