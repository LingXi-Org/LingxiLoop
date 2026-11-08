import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'

/** Actual downloads and independent readers, never an export implementation mock. */
export async function verifySizingExports({page,browser,kind,output,getDocument,errors,layout=false}){
  const node=getDocument().pages['page-1'].nodes['page-1-heading']
  if(layout){assert.equal(node.style.padding,20);assert.equal(node.css['box-sizing'],'content-box')}else{assert.equal(node.css.width,'50%');assert.equal(node.css['max-width'],'900px');assert.equal(node.implicitHeight,true)}
  const before=JSON.stringify(getDocument()),results=[],labelKind=layout?'layout':'sizing'
  const readGeometry=(element,layout)=>{const style=getComputedStyle(element);return{width:style.width,height:style.height,color:style.color,...(layout?{padding:style.padding,boxSizing:style.boxSizing,layoutWidth:element.offsetWidth,layoutHeight:element.offsetHeight}:{})}}
  const ui=await page.locator('[data-page-id="page-1"] [data-node-id="page-1-heading"]').evaluate(readGeometry,layout)
  assert.deepEqual(ui,layout?{width:'1152px',height:'76px',color:'rgb(24, 51, 43)',padding:'20px',boxSizing:'content-box',layoutWidth:1192,layoutHeight:116}:{width:'900px',height:'60px',color:'rgb(24, 51, 43)'})
  const {default:JSZip}=await import('jszip')
  const navigations=[];page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations.push(new URL(frame.url()).pathname)})
  for(const [format,label]of [['html','网页'],['pdf','便携文档'],['pptx','演示文稿'],['svg',`当前${kind==='design'?'画板':'页面'} · 矢量图`],['png',`当前${kind==='design'?'画板':'页面'} · 透明位图`],['jpeg',`当前${kind==='design'?'画板':'页面'} · 压缩位图`]]){
    await page.getByLabel('导出格式',{exact:true}).click()
    const pending=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click()
    let download;try{download=await pending}catch(error){await writeFile(join(output,`${kind}-${labelKind}-download-failure.json`),JSON.stringify({format,navigations,alerts:await page.getByRole('alert').allTextContents(),statuses:await page.getByRole('status').allTextContents(),inspector:await page.locator('.native-inspector').count()},null,2));throw error}
    const bytes=await readFile(await download.path()),path=join(output,`${kind}-${labelKind}.${format}`),result={format,bytes:bytes.length}
    await writeFile(path,bytes);assert.ok(bytes.length>100)
    if(format==='html'){
      const offline=await browser.newPage({viewport:{width:1920,height:1200}})
      try{
        await offline.setContent(bytes.toString('utf8'))
        const geometry=await offline.locator('[data-node-id="page-1-heading"]').evaluate(readGeometry,layout)
        assert.deepEqual(geometry,ui);result.reparsedGeometry=geometry
        await offline.screenshot({path:join(output,`${kind}-${labelKind}-offline.png`)})
      }finally{await offline.close()}
    }
    if(format==='pdf'){
      assert.equal(bytes.subarray(0,5).toString(),'%PDF-')
      const info=execFileSync('pdfinfo',[path],{encoding:'utf8'}),text=execFileSync('pdftotext',[path,'-'],{encoding:'utf8'})
      assert.match(info,/Pages:\s+3/);assert.ok(text.replace(/\s+/g,' ').includes('LingxiLoop 1'));result.independentReader=true
      if(layout){
        const prefix=join(output,`${kind}-layout-pdf-page`);execFileSync('pdftoppm',['-f','1','-l','2','-r','96','-png',path,prefix])
        const pictures=await Promise.all([1,2].map(index=>readFile(prefix+'-'+index+'.png')))
        result.rasterInk=await page.evaluate(async images=>Promise.all(images.map(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const canvas=document.createElement('canvas');canvas.width=800;canvas.height=180;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,800,180).data;let left=800,top=180,count=0;for(let y=0;y<180;y++)for(let x=0;x<800;x++){const i=(y*800+x)*4;if(Math.abs(pixels[i]-24)<20&&Math.abs(pixels[i+1]-51)<20&&Math.abs(pixels[i+2]-43)<20){left=Math.min(left,x);top=Math.min(top,y);count++}}return{left,top,count}})),pictures.map(bytes=>bytes.toString('base64')))
        assert.ok(result.rasterInk.every(box=>box.count>1000));assert.ok(Math.abs(result.rasterInk[0].left-result.rasterInk[1].left-20)<=1);assert.ok(Math.abs(result.rasterInk[0].top-result.rasterInk[1].top-20)<=1)
      }
    }
    if(format==='pptx'){
      const zip=await JSZip.loadAsync(bytes),presentation=await zip.file('ppt/presentation.xml').async('string')
      assert.equal((presentation.match(/<p:sldId /g)??[]).length,3)
      assert.ok(Object.keys(zip.files).some(name=>/^ppt\/media\//.test(name)));result.packageParsed=true
    }
    if(['svg','png','jpeg'].includes(format)){
      result.pixels=await page.evaluate(async({base64,type})=>{
        const image=new Image();image.src=`data:${type};base64,${base64}`;await image.decode()
        const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0)
        const scale=image.naturalWidth/1920,data=context.getImageData(64*scale,40*scale,400*scale,80*scale).data
        let ink=0;for(let i=0;i<data.length;i+=4)if(Math.abs(data[i]-24)<20&&Math.abs(data[i+1]-51)<20&&Math.abs(data[i+2]-43)<20)ink++
        return{width:image.naturalWidth,height:image.naturalHeight,ink}
      },{base64:bytes.toString('base64'),type:format==='svg'?'image/svg+xml':format==='png'?'image/png':'image/jpeg'})
      assert.equal(result.pixels.width,format==='svg'?1920:3840);assert.equal(result.pixels.height,format==='svg'?1080:2160);assert.ok(result.pixels.ink>1000)
    }
    results.push(result)
  }
  assert.equal(JSON.stringify(getDocument()),before);assert.deepEqual(errors,[]);assert.deepEqual(navigations,[],'导出期间主编辑器不得发生重新导航')
  return{kind:layout?'实际内边距六格式导出回归':'实际尺寸声明六格式导出回归',mode:kind,ui,formats:results,documentUnchanged:true,consoleOrPageErrors:errors,scope:'受控HTTP组件与真实隔离导出；不代表真实授权产品端到端或全部CSS属性'}
}
