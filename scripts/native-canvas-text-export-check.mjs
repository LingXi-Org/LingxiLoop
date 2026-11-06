// Production-bundled text appearance regression; controlled fixture, no product API.
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname,join,resolve,extname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createServer} from 'node:http'
import {build} from 'vite'
import JSZip from 'jszip'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'lingxi-canvas-export-')),output=resolve(process.argv[2]??'/tmp/lingxi-canvas-text-export.json')
const fixtureFont=process.env.NATIVE_CANVAS_EXPORT_FONT??'system-ui'
const penFixture=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-pen.json'),'utf8')).cases[0].result
const vectorFixture=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-vector.json'),'utf8')).cases[3].result
const editedVectorFixture=JSON.parse(await readFile(join(root,'docs/evidence/issue-707/source-design-vector-edit.json'),'utf8')).runtimeCases.find(row=>row.name==='break').savedNodes[0][1]
const runner=process.env.PLAYWRIGHT_MODULE??'playwright',{chromium}=await import(runner.startsWith('/')?pathToFileURL(runner).href:runner)
let server,browser
try{
  await writeFile(join(temporary,'index.html'),'<html><meta charset="utf-8"><script type="module" src="/entry.js"></script></html>')
  await writeFile(join(temporary,'artifact-export.html'),(await readFile(join(root,'artifact-export.html'),'utf8')).replace('/src/features/artifacts/native/export/realm-entry.ts',join(root,'src/features/artifacts/native/export/realm-entry.ts')))
  await writeFile(join(temporary,'entry.js'),`
import {createDocument,createPage} from ${JSON.stringify(join(root,'shared/artifact-document.ts'))};
import {canvasPenNode} from ${JSON.stringify(join(root,'shared/artifact-editor-actions.ts'))};
import {createCanvasText,canvasFontPatch,canvasTextMetrics} from ${JSON.stringify(join(root,'shared/artifact-canvas-typography.ts'))};
import {exportArtifact} from ${JSON.stringify(join(root,'src/features/artifacts/native/export-artifact.ts'))};
const makeFixture=()=>{
 const doc=createDocument('slides','fixture','中文标题'),page=createPage('p'),node=createCanvasText('title','text');node.text='画布中文标题';node.x=20;node.y=20;node.style={...node.style,...canvasFontPatch(node,{fontSize:72}),fontFamily:${JSON.stringify(fixtureFont)}};node.height=canvasTextMetrics(72).minHeight;const uniform=createCanvasText('uniform','text');uniform.text='统一内边距标题';uniform.x=20;uniform.y=180;uniform.style={...uniform.style,padding:30,paddingX:30,paddingY:30,fontFamily:${JSON.stringify(fixtureFont)}};page.nodes={title:node,uniform};page.nodeOrder=['title','uniform'];doc.pages={p:page};doc.pageOrder=['p'];
 const pen=canvasPenNode('pen',${JSON.stringify(penFixture)});Object.assign(pen,{x:600,y:400,width:400,height:100});page.nodes.pen=pen;page.nodeOrder.push('pen');
 const vector=canvasPenNode('vector',${JSON.stringify(vectorFixture)});Object.assign(vector,{x:600,y:560,width:400,height:100});page.nodes.vector=vector;page.nodeOrder.push('vector');const edited=canvasPenNode('edited',${JSON.stringify(editedVectorFixture)});Object.assign(edited,{x:20,y:560,width:400,height:100});edited.style={...edited.style,padding:30,paddingX:30,paddingY:30};page.nodes.edited=edited;page.nodeOrder.push('edited');return doc;
};
window.check=async format=>{
 const doc=makeFixture(),before=JSON.stringify(doc),result=await exportArtifact(doc,{format}),bytes=new Uint8Array(await result.blob.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 let nonWhitePixels;if(format==='png'){const bitmap=await createImageBitmap(result.blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;nonWhitePixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]&&(pixels[i]<235||pixels[i+1]<235||pixels[i+2]<235))nonWhitePixels++;bitmap.close()}return{base64:btoa(binary),bytes:bytes.length,nonWhitePixels,unchanged:before===JSON.stringify(doc),realms:document.querySelectorAll('[data-artifact-export-realm]').length,mountedPages:document.querySelectorAll('.artifact-export-page').length};
};window.ready=true;`)
  await build({configFile:false,root:temporary,publicDir:join(root,'public'),logLevel:'error',build:{outDir:join(temporary,'dist'),target:'esnext',rollupOptions:{input:{main:join(temporary,'index.html'),export:join(temporary,'artifact-export.html')}}},worker:{format:'es'}})
  const dist=join(temporary,'dist'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.ttf':'font/ttf'}
  server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),path=resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));if(!path.startsWith(dist+'/')){res.writeHead(404);res.end();return}const data=await readFile(path);res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end()}})
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??'/usr/bin/chromium',args:['--no-sandbox']})
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.name));await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready)
  const rows=[]
  for(const format of ['html','pdf','pptx','svg','png']){
    const result=await page.evaluate(format=>window.check(format),format),bytes=Buffer.from(result.base64,'base64');delete result.base64
    assert.equal(result.unchanged,true);assert.equal(result.realms,0);assert.equal(result.mountedPages,0);assert.ok(bytes.length>100)
    if(format==='html'){const html=bytes.toString('utf8');assert.match(html,/padding:16px 24px/);assert.match(html,/max-width:2000px/);assert.match(html,/padding:30px 30px/);assert.ok(Math.abs(Number(/line-height:([^;"\s]+)/.exec(/data-node-id="title" style="([^"]+)"/.exec(html)?.[1]??'')?.[1])-1.102)<1e-12)}
    if(format==='html')for(const node of [penFixture,vectorFixture,editedVectorFixture])assert.ok(bytes.toString('utf8').includes(`d="${node.d}"`))
    if(format==='svg'){for(const node of [penFixture,vectorFixture,editedVectorFixture])assert.ok(bytes.toString('utf8').includes(node.d));await writeFile(output+'.svg',bytes)}
    if(format==='pdf')assert.equal(bytes.subarray(0,5).toString(),'%PDF-')
    if(format==='png'){await writeFile(output+'.png',bytes);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),2560);assert.equal(bytes.readUInt32BE(20),1440);assert.ok(result.nonWhitePixels>500)}
    if(format==='pptx'){const archive=await JSZip.loadAsync(bytes),xml=await archive.file('ppt/slides/slide1.xml').async('string');assert.match(xml,/spc="-108"/);assert.match(xml,/spcPct val="110200"/);assert.match(xml,/lIns="228600"/);assert.match(xml,/tIns="152400"/);const uniform=xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g).find(part=>part.includes('统一内边距标题'));for(const side of ['lIns','rIns','tIns','bIns'])assert.ok(uniform.includes(side+'="285750"'))}
    if(format==='png'){
      const pixels=await page.evaluate(async base64=>{const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+base64)).blob()),canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d');context.drawImage(image,0,0);image.close();return[[1180,780],[1180,1100],[40,1100]].map(([left,top])=>{const data=context.getImageData(left,top,840,240).data;let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>0&&data[i]<220&&data[i+1]<220&&data[i+2]<220)count++;return count})},bytes.toString('base64'));assert.ok(pixels.every(count=>count>300),'the isolated PNG contains the actual freehand, vector, and padded edited strokes')
    }
    if(format==='pptx'){const archive=await JSZip.loadAsync(bytes),media=Object.keys(archive.files).filter(name=>name.startsWith('ppt/media/')&&!archive.files[name].dir);assert.ok(media.length>=2,'native curves use the existing picture fallback in PPTX')}
    rows.push({format,...result})
  }
  assert.deepEqual(errors,[])
  const report={kind:'isolated-production-canvas-text-export',scope:'真实生产构建及隔离导出；固定夹具，不代替授权API、离线文件打开、完整视觉或性能验收',browser:browser.version(),fixtureFont,paddingAndTypography:true,uniformPadding:true,penPath:true,vectorPath:true,editedVectorPath:true,paddedEditedVector:true,rows,consoleOrPageErrors:errors}
  await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}finally{await browser?.close();await new Promise(r=>server?server.close(r):r());await rm(temporary,{recursive:true,force:true})}
