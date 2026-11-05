#!/usr/bin/env node
/** Read-only screenshots of the pinned, separately running reference. No
 * reference executable/font is copied to the product or to the evidence. */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
const args=Object.fromEntries(process.argv.slice(2).map(value=>value.replace(/^--/,'').split('=')))
const sourceRoot=resolve(args['reference-root']??''),output=resolve(args.output??'/tmp/lingxi-reference-evidence')
assert.ok(args['reference-root'],'--reference-root must identify the separately downloaded pinned release')
const inventory=JSON.parse(await readFile(new URL('../docs/evidence/issue-707/source-inventory.json',import.meta.url),'utf8'))
for(const source of inventory.sources) {
  const bytes=await readFile(join(sourceRoot,source.path))
  assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256,`Reference changed: ${source.path}`)
}
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright')
const browser=await chromium.launch({headless:true,...(args.browser?{executablePath:args.browser}:{}),args:['--no-sandbox']})
await mkdir(output,{recursive:true})
const results=[]
try {
  for(const kind of ['design','slides']) {
    const url=new URL(args[`${kind}-url`]);assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Reference must run separately on loopback')
    for(const [width,height] of [[1920,1200],[1440,1000],[768,1024],[390,844]])for(const theme of ['light','dark']) {
      const page=await browser.newPage({viewport:{width,height},colorScheme:theme,reducedMotion:'reduce'})
      try {
        await page.goto(url.href,{waitUntil:'networkidle'});await ready(page,kind);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300)
        await capture(page,kind,`${width}-${theme}`,width,height,theme)
      }finally{await page.close()}
    }
    let page
    try {
      const reset=async()=>{await page?.close();page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'});await page.goto(url.href,{waitUntil:'networkidle'});await ready(page,kind);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(200)}
      const menus=kind==='design'?[['pages',/pages$/],['drawing','More drawing tools'],['shapes','More shapes'],['export','Export'],['zoom',/%, Zoom$/],['history','Version history'],['comment-options','Comment options']]:[['shapes','Shapes'],['export','Download'],['zoom',/%, Zoom$/],['layouts','Add slide'],['history','Version history'],['comment-options','Comment options']]
      for(const [state,name]of menus){await reset();await page.getByRole('button',{name,exact:typeof name==='string'}).click();await capture(page,kind,state,1440,1000,'light')}
      await reset();await page.getByRole('button',{name:'Comments',exact:true}).click();await capture(page,kind,'comments-active',1440,1000,'light');await page.mouse.click(kind==='design'?100:800,kind==='design'?500:600);await page.getByRole('textbox',{name:'Comment',exact:true}).waitFor();await capture(page,kind,'comment-composer',1440,1000,'light')
      await reset();await page.getByRole('button',{name:'Comment options',exact:true}).click();await page.getByText('Show all comments',{exact:true}).click();await capture(page,kind,'all-comments',1440,1000,'light')
      await reset();await page.getByRole('button',{name:'Properties',exact:true}).click();await capture(page,kind,'inspector',1440,1000,'light')
      if(kind==='slides') {
        await page.getByText('#FAF8F4',{exact:true}).click();await capture(page,kind,'color-theme',1440,1000,'light')
        await page.getByText('Custom',{exact:true}).first().click();await capture(page,kind,'color-custom',1440,1000,'light')
        await reset();await page.getByRole('button',{name:'Properties',exact:true}).click();await page.getByText('LingxiLoop 1',{exact:true}).first().click();await page.getByRole('button',{name:'Font: Arial',exact:true}).waitFor();await capture(page,kind,'heading-inspector',1440,1000,'light')
        await page.getByRole('button',{name:'Weight: Bold',exact:true}).click();await capture(page,kind,'font-weight',1440,1000,'light');await page.keyboard.press('Escape')
        await page.getByRole('button',{name:'Font: Arial',exact:true}).click();await page.getByRole('textbox',{name:'Search fonts',exact:true}).waitFor();await capture(page,kind,'font-picker',1440,1000,'light')
        await page.getByRole('textbox',{name:'Search fonts',exact:true}).fill('无匹配字体');await capture(page,kind,'font-empty',1440,1000,'light')
      }
    }finally{await page?.close()}
  }
  if(args['table-url']) {
    const url=new URL(args['table-url']);assert.ok(['127.0.0.1','localhost'].includes(url.hostname))
    const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light',reducedMotion:'reduce'})
    try {
      await page.goto(url.href,{waitUntil:'networkidle'});await ready(page,'slides')
      const cell=page.locator('[data-cell="0.0"]').first();await cell.waitFor();await page.evaluate(()=>document.fonts.ready)
      const table=await cell.evaluate(e=>{const grid=e.parentElement,s=getComputedStyle(e),g=getComputedStyle(grid),paper=e.closest('[data-slide-surface]')?.getBoundingClientRect(),r=grid.getBoundingClientRect();return {cells:grid.querySelectorAll('[data-cell]').length,firstHeader:e.textContent,cell:{fontWeight:s.fontWeight,fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,background:s.backgroundColor,borderRight:s.borderRight},grid:{width:g.width,height:g.height,fontFamily:g.fontFamily},rect:r.toJSON(),paper:paper?.toJSON()}})
      assert.equal(table.cells,9);assert.equal(table.firstHeader,'Column')
      await capture(page,'slides','table-inserted',1440,1000,'light');results.at(-1).table=table
      await cell.click();await page.getByRole('button',{name:'Properties',exact:true}).first().click();await capture(page,'slides','table-inspector',1440,1000,'light')
    }finally{await page.close()}
  }
}finally{await browser.close()}
await writeFile(join(output,'reference.json'),JSON.stringify({referenceCommit:inventory.referenceCommit,fixture:'native-editor-visual-fixture.mjs',browser:browser.version(),screenshots:results},null,2)+'\n')
console.log(JSON.stringify({referenceCommit:inventory.referenceCommit,screenshots:results.length,output}))
async function capture(page,kind,state,width,height,theme) {
  await page.waitForTimeout(120)
  const filename=`${kind}-${state}.png`;await page.screenshot({path:join(output,filename)})
  const metrics=await page.locator('button,[role=button],[role=tab],input,select,textarea,[role=menuitem],summary').evaluateAll(elements=>elements.filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1&&r.right>0&&r.bottom>0&&r.x<innerWidth&&r.y<innerHeight&&e.checkVisibility({opacityProperty:true,visibilityProperty:true})}).map(e=>{
    const s=getComputedStyle(e),r=e.getBoundingClientRect()
    return {label:e.getAttribute('aria-label')??e.getAttribute('title')??e.textContent?.slice(0,100),role:e.getAttribute('role')??e.tagName.toLowerCase(),rect:{x:r.x,y:r.y,width:r.width,height:r.height},fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,background:s.backgroundColor,border:s.border,shadow:s.boxShadow,radius:s.borderRadius,cursor:s.cursor,transition:s.transition}
  }))
  results.push({kind,state,width,height,theme,file:filename,controls:metrics})
}

async function ready(page,kind){
  if(kind==='slides')await page.getByText('LingxiLoop 1',{exact:true}).first().waitFor({timeout:60000})
  else {await page.getByRole('button',{name:'Open artboard Page 1 full window',exact:true}).waitFor({timeout:60000});await page.waitForFunction(()=>!document.body.innerText.includes('Loading…'),null,{timeout:60000})}
}
