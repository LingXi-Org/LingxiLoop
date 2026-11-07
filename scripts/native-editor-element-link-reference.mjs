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
const sourceRoot=resolve(args['reference-root']),output=resolve(args.output??join(tmpdir(),'lingxi-source-links'))
const inventory=JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-inventory.json',import.meta.url),'utf8'))
for(const source of inventory.sources)assert.equal(createHash('sha256').update(await readFile(join(sourceRoot,source.path))).digest('hex'),source.sha256,`参考资源已变化：${source.path}`)
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const browser=await chromium.launch({headless:true,...(args.browser?{executablePath:args.browser}:{}),args:['--no-sandbox']})
await mkdir(output,{recursive:true})
const cases=[]
try{
  for(const name of args.case?.split(',')??['base','http','relative','mail','tel','anchor','clear','save','edit']){
    const project=await mkdtemp(join(tmpdir(),'lingxi-source-link-'));let server,page
    try{
      for(const [file,bytes]of createVisualFixture('design').legacyFiles){const path=join(project,file);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)}
      server=spawn(process.execPath,[join(sourceRoot,'skills/claude-design/scripts/server.mjs'),project,'--port','0','--host','127.0.0.1'],{stdio:['ignore','pipe','ignore']})
      const url=await new Promise((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('参考服务启动超时')),15000);server.stdout.on('data',bytes=>{raw+=bytes;try{const data=JSON.parse(raw);if(data.url){clearTimeout(timer);resolve(data.url)}}catch{}});server.once('exit',()=>{clearTimeout(timer);reject(Error('参考服务退出'))})})
      page=await browser.newPage({viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},colorScheme:args.theme??'light',reducedMotion:'reduce'})
      await page.goto(url,{waitUntil:'networkidle'});await waitForReferenceVisualDocument(page,'design')
      await page.getByRole('button',{name:'Properties',exact:true}).click()
      const board=page.locator('[data-mega-artboard]').first(),rect=await board.boundingBox()
      await page.mouse.dblclick(rect.x+rect.width*.8,rect.y+rect.height*.75)
      const frame=await(await board.locator('iframe').elementHandle()).contentFrame(),heading=frame.locator('h1')
      const textRect=await heading.boundingBox();await page.mouse.click(textRect.x+8,textRect.y+textRect.height*.5)
      await page.getByRole('button',{name:'Font: Arial',exact:true}).waitFor()
      const field=page.getByRole('textbox',{name:'Destination',exact:true});await field.waitFor()
      const savedHeading=async(predicate)=>{
        const deadline=Date.now()+10_000;let last=''
        while(Date.now()<deadline){
          const body=await readFile(join(project,'project/Page1.dc.html'),'utf8');last=body.match(/<h1\b[\s\S]*?<\/h1>/)?.[0]??''
          if(predicate(last))return
          await page.waitForTimeout(25)
        }
        throw new Error('参考链接尚未落盘：'+last)
      }
      const href=({relative:'example.test',mail:'mailto:hello@example.test',tel:'tel:+861234567890',anchor:'#section'})[name]??'https://example.test/中文'
      let shortcut
      if(name!=='base'){
        await field.fill(href)
        if(name==='save'){
          await field.press('Control+s');await page.waitForTimeout(600)
          const body=await readFile(join(project,'project/Page1.dc.html'),'utf8')
          shortcut={keepsEditing:await field.isVisible(),notCommitted:!body.includes('<a href=')}
          assert.deepEqual(shortcut,{keepsEditing:true,notCommitted:true})
        }
        await field.press('Enter')
        await savedHeading(html=>html.includes(`href="${href}"`))
        if(name==='clear'){await field.fill('');await field.press('Enter');await savedHeading(html=>!html.includes('<a '))}
        if(name==='edit'){
          const box=await heading.boundingBox();await page.mouse.dblclick(box.x+8,box.y+box.height*.5);await page.keyboard.press('End');await page.keyboard.type('内容');await page.keyboard.press('Escape')
          await savedHeading(html=>html.includes('LingxiLoop 1内容'))
        }
        await page.keyboard.press('Control+s');await page.waitForTimeout(600)
      }
      const input=await field.evaluate(element=>{const style=getComputedStyle(element);return{value:element.value,type:element.type,inputMode:element.inputMode,spellcheck:element.spellcheck,rect:element.getBoundingClientRect().toJSON(),fontSize:style.fontSize,lineHeight:style.lineHeight,padding:style.padding,border:style.border,borderRadius:style.borderRadius,shadow:style.boxShadow,outline:style.outline,color:style.color,background:style.backgroundColor}})
      const html=await readFile(join(project,'project/Page1.dc.html'),'utf8'),snippet=html.match(/<h1\b[\s\S]*?<\/h1>/)?.[0]
      await page.screenshot({path:join(output,`link-${name}.png`)})
      cases.push({name,href:name==='base'||name==='clear'?'':href,input,shortcut,snippet,linkHrefs:[...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map(match=>match[1]),focus:await page.evaluate(()=>({tag:document.activeElement?.tagName,label:document.activeElement?.getAttribute('aria-label')}))})
      await writeFile(join(output,'reference.json'),JSON.stringify({sourceCommit:'016b39d7fdcc30bfacee31ea5541498ac53921c6',referenceResourceHashesVerified:inventory.sources.length,browser:browser.version(),theme:args.theme??'light',viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},cases},null,2)+'\n')
      console.log(name+' 已捕获')
      if(name==='clear')assert.ok(!snippet.includes('<a '));else if(name!=='base')assert.ok(snippet.includes(`href="${href}"`))
      if(name==='edit')assert.match(snippet,/>LingxiLoop 1内容<\/a>/)
    }finally{await page?.close();server?.kill('SIGTERM');await rm(project,{recursive:true,force:true})}
  }
}finally{await browser.close()}
