import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'

/** Real downloads through the existing isolated export entry. */
export async function verifyTextPropertiesExports({page,browser,output,getDocument,errors,expectedFont,expectedFontWeight,expectedHeadingName}){
 const original=JSON.stringify(getDocument()),results=[],navigations=[],networkErrors=[]
 page.context().on('requestfailed',request=>networkErrors.push({url:request.url(),failure:request.failure()}))
 page.context().on('response',response=>{if(response.status()>=400)networkErrors.push({url:response.url(),status:response.status()})})
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(new URL(frame.url()).pathname)})
 const {default:JSZip}=await import('jszip')
 for(const [format,label]of [['html','网页'],['pdf','便携文档'],['pptx','演示文稿'],['svg','当前画板 · 矢量图'],['png','当前画板 · 透明位图'],['jpeg','当前画板 · 压缩位图']]){
  await page.getByLabel('导出格式',{exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();let download;try{download=await pending}catch(error){await writeFile(join(output,'text-export-failure.json'),JSON.stringify({format,navigations,networkErrors,realmErrors:await Promise.all(page.frames().map(frame=>frame.evaluate(()=>window.__exportErrors??[]).catch(()=>[]))),alerts:await page.getByRole('alert').allTextContents(),statuses:await page.getByRole('status').allTextContents()},null,2));throw error}const bytes=await readFile(await download.path()),path=join(output,`text-properties.${format}`),result={format,bytes:bytes.length};await writeFile(path,bytes);assert.ok(bytes.length>100)
  if(format==='html'){
   const offline=await browser.newPage({viewport:{width:1920,height:1200}})
   try{
    await offline.setContent(bytes.toString('utf8'));const node=offline.locator('[data-node-id=page-1-heading]')
    result.style=await node.evaluate(element=>({case:getComputedStyle(element).textTransform,decoration:getComputedStyle(element).textDecorationLine,items:element.querySelectorAll('ul li').length}))
    if(expectedFont){result.fontFamily=await node.evaluate(element=>getComputedStyle(element).fontFamily);assert.ok(result.fontFamily.includes(expectedFont),result.fontFamily)}
    if(expectedHeadingName)assert.equal(await offline.getByRole('heading',{name:expectedHeadingName,exact:true}).count(),1,'离线标题须保持作者的可访问名称');
    if(expectedFontWeight!==undefined){result.fontWeight=await node.evaluate(element=>getComputedStyle(element).fontWeight);assert.equal(result.fontWeight,String(expectedFontWeight))}
    if(!expectedFont)assert.deepEqual(result.style,{case:'uppercase',decoration:'underline',items:1});await offline.screenshot({path:join(output,'text-properties-offline.png')})
   }finally{await offline.close()}
  }
  if(format==='pdf'){assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.match(execFileSync('pdfinfo',[path],{encoding:'utf8'}),/Pages:\s+3/);result.independentReader=true}
  if(format==='pptx'){const zip=await JSZip.loadAsync(bytes),presentation=await zip.file('ppt/presentation.xml').async('string');assert.equal((presentation.match(/<p:sldId /g)??[]).length,3);assert.ok(Object.keys(zip.files).some(name=>/^ppt\/media\//.test(name)));if(expectedFont){const slide=await zip.file('ppt/slides/slide1.xml').async('string');assert.ok(slide.includes(`typeface="${expectedFont}"`),`演示文稿未保留字体：${expectedFont}`);result.fontFamily=expectedFont;if(expectedFontWeight!==undefined){const run=[...slide.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].find(match=>match[1].includes('<a:t>LingxiLoop 1</a:t>'));assert.ok(run,'演示文稿须保留可编辑标题文字');const properties=run[1].match(/<a:rPr\b[^>]*>/)?.[0]??'';result.bold=/\bb="1"/.test(properties);assert.equal(result.bold,expectedFontWeight>=600,'演示文稿须保留标题实际字重')}}result.packageParsed=true}
  if(['svg','png','jpeg'].includes(format)){
   result.decoded=await page.evaluate(async({base64,type})=>{const image=new Image();image.src=`data:${type};base64,${base64}`;await image.decode();return{width:image.naturalWidth,height:image.naturalHeight}}, {base64:bytes.toString('base64'),type:format==='svg'?'image/svg+xml':format==='png'?'image/png':'image/jpeg'})
   assert.equal(result.decoded.width,format==='svg'?1920:3840);assert.equal(result.decoded.height,format==='svg'?1080:2160)
  }
  results.push(result)
 }
 assert.equal(JSON.stringify(getDocument()),original);assert.deepEqual(errors,[]);assert.deepEqual(navigations,[])
 return{kind:expectedFont?'字体继承六格式实际导出':'文本可选属性六格式实际导出',formats:results,documentUnchanged:true,consoleOrPageErrors:errors,scope:expectedFont?'受控HTTP夹具；网页重读CSS，演示文稿检查字体，其他格式独立解析/解码；未验证PDF/PPTX像素保真':'受控HTTP夹具；网页重读CSS与列表，其他格式独立解析/解码；未验证PDF/PPTX像素保真'}
}
