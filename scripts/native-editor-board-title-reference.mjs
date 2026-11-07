#!/usr/bin/env node
/** Read-only fixed release; disposable project per title state. */
import {createVisualFixture} from './native-editor-visual-fixture.mjs'
import {waitForReferenceVisualDocument} from './native-editor-reference-ready.mjs'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {spawn} from 'node:child_process'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')))
assert.ok(args['reference-root'],'需要独立参考目录 --reference-root')
const sourceRoot=resolve(args['reference-root']),output=resolve(args.output??join(tmpdir(),'lingxi-source-titles'))
await mkdir(output,{recursive:true})
const inventory=JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-inventory.json',import.meta.url),'utf8'))
for(const source of inventory.sources)assert.equal(createHash('sha256').update(await readFile(join(sourceRoot,source.path))).digest('hex'),source.sha256,`参考资源已变化：${source.path}`)
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const cases=[],browser=await chromium.launch({...(args.browser?{executablePath:args.browser}:{}),headless:true,args:['--no-sandbox']})
try{
 for(const name of (args.case?.split(',')??['enter','escape','blur','blank','spaces'])){
  const root=await mkdtemp(join(tmpdir(),'lingxi-source-title-'));let server,page
  try{
   for(const [file,bytes]of createVisualFixture('design').legacyFiles){const path=join(root,file);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)}
   server=spawn(process.execPath,[join(sourceRoot,'skills/claude-design/scripts/server.mjs'),root,'--port','0','--host','127.0.0.1'],{stdio:['ignore','pipe','ignore']})
   const url=await new Promise((resolve,reject)=>{let raw='';const timer=setTimeout(()=>reject(Error('参考服务启动超时')),15000);server.stdout.on('data',bytes=>{raw+=bytes;try{const parsed=JSON.parse(raw);if(parsed.url){clearTimeout(timer);resolve(parsed.url)}}catch{}});server.once('exit',()=>{clearTimeout(timer);reject(Error('参考服务退出'))})})
   page=await browser.newPage({viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},reducedMotion:'reduce',colorScheme:args.theme==='dark'?'dark':'light'});await page.goto(url,{waitUntil:'networkidle'});await waitForReferenceVisualDocument(page,'design')
   await page.getByTestId('mega-artboard-title-Page1.dc.html').dblclick();const input=page.getByRole('textbox',{name:'Artboard name',exact:true});await input.waitFor();const initial=await input.inputValue(),style=await input.evaluate(element=>{const s=getComputedStyle(element);return{rect:element.getBoundingClientRect().toJSON(),fontFamily:s.fontFamily,fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,border:s.border,borderRadius:s.borderRadius,color:s.color,background:s.backgroundColor,shadow:s.boxShadow,outline:s.outline,selection:[element.selectionStart,element.selectionEnd]}})
   await input.fill(name==='blank'?'':name==='spaces'?'   ':'  中文画板  ');await page.screenshot({path:join(output,'title-'+name+'-editing.png')})
   if(name==='blur')await page.getByRole('button',{name:'Properties',exact:true}).click();else await input.press(name==='escape'?'Escape':'Enter')
   await page.keyboard.press('Control+s');await page.waitForTimeout(600);const after=JSON.parse(await readFile(join(root,'project/canvas.json'),'utf8')),display=await page.getByTestId('mega-artboard-title-Page1.dc.html').innerText();cases.push({name,initial,style,after,display,inputClosed:await input.count()===0});await writeFile(join(output,'title-source.json'),JSON.stringify({sourceCommit:inventory.sourceCommit??'016b39d7fdcc30bfacee31ea5541498ac53921c6',referenceResourceHashesVerified:inventory.sources.length,viewport:{width:Number(args.width??1440),height:Number(args.height??1000)},theme:args.theme??'light',cases},null,2)+'\n');console.log(name+' 已捕获')
  }finally{await page?.close();server?.kill('SIGTERM');await rm(root,{recursive:true,force:true})}
 }
}finally{await browser.close()}
