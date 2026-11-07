// Fault acceptance on three representative pages of the fixed 50-page fixture.
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { createFixture } from './native-artifact-fixture.mjs'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] ?? '/workspace/scratch/native-export-acceptance/export-faults.json')
const temporary = await mkdtemp(join(tmpdir(), 'lingxi-export-fault-'))
const fixture = createFixture('slides'), selected = ['page-1', 'page-25', 'page-50']
fixture.document.pageOrder = selected
fixture.document.pages = Object.fromEntries(selected.map(id => [id, fixture.document.pages[id]]))
await mkdir(dirname(output), { recursive: true })
await mkdir(join(temporary, 'public/native-artifact-fixture'), { recursive: true })
await cp(join(repository, 'public/fonts'), join(temporary, 'public/fonts'), { recursive: true })
await Promise.all([0, 24, 49].map(index => writeFile(join(temporary, 'public/native-artifact-fixture', fixture.images[index].filename), fixture.images[index].bytes)))
await writeFile(join(temporary, 'public/document.json'), JSON.stringify(fixture.document))
await writeFile(join(temporary, 'artifact-export.html'), (await readFile(join(repository, 'artifact-export.html'), 'utf8')).replace('/src/features/artifacts/native/export/realm-entry.ts', join(repository, 'src/features/artifacts/native/export/realm-entry.ts')))
await writeFile(join(temporary, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Export faults</title></head><body><output id="status">loading</output><script type="module" src="/entry.ts"></script></body></html>')
await writeFile(join(temporary, 'entry.ts'), `
const original=await fetch('/document.json').then(r=>r.json());

window.attempt=async(format,cancelAfterPage,cancelDelay=0)=>{
 const before=JSON.stringify(original),progress=[],controller=new AbortController();let result,error;
 try{const {exportArtifact}=await import(${JSON.stringify(join(repository,'src/features/artifacts/native/export-artifact.ts'))});result=await exportArtifact(original,{format,signal:controller.signal,onProgress:(done,total)=>{progress.push({done,total});if(done===cancelAfterPage){if(cancelDelay)setTimeout(()=>controller.abort(),cancelDelay);else controller.abort()}}})}catch(failure){error={name:failure.name,message:failure.message}}
 const immutable=before===JSON.stringify(original),mountedPages=document.querySelectorAll('.artifact-export-page').length,realms=document.querySelectorAll('[data-artifact-export-realm]').length;
 if(!immutable||mountedPages||realms)throw Error('export leaked document, DOM, or worker state');
 return {format,ok:!!result,error,bytes:result?.blob.size,progress,immutable,mountedPages,realms};
};
window.fontAttempt=async(format,italic=false)=>{
 const snapshot=structuredClone(original);snapshot.pageOrder=[snapshot.pageOrder[0]];snapshot.pages={[snapshot.pageOrder[0]]:snapshot.pages[snapshot.pageOrder[0]]};const page=snapshot.pages[snapshot.pageOrder[0]];
 page.nodes['page-1-heading'].style.fontFamily='Inter';if(italic)page.nodes['page-1-heading'].style.fontStyle='italic';page.nodes['page-1-body'].style.fontFamily='Noto Sans SC';const before=JSON.stringify(snapshot),fonts=new Set(),faces=new Set();const observeFonts=()=>{const realm=document.querySelector('[data-artifact-export-realm]');if(realm?.contentDocument)for(const face of realm.contentDocument.fonts)if(face.status==='loaded'){fonts.add(face.family.replaceAll('\"',''));faces.add(face.family.replaceAll('\"','')+'|'+face.style+'|'+face.weight)}};const polling=setInterval(observeFonts,5);let result,error;
 try{const {exportArtifact}=await import(${JSON.stringify(join(repository,'src/features/artifacts/native/export-artifact.ts'))});result=await exportArtifact(snapshot,{format,onProgress:observeFonts})}catch(failure){error={name:failure.name,message:failure.message}}
 clearInterval(polling);
 const html=result&&format==='html'?await result.blob.text():'';const packedFontFaces=(html.match(/@font-face\\s*\\{[^}]*\\}/g)??[]).filter(rule=>/Inter|Noto Sans SC/.test(rule));
 return{format,ok:!!result,error,bytes:result?.blob.size,immutable:before===JSON.stringify(snapshot),mountedPages:document.querySelectorAll('.artifact-export-page').length,realms:document.querySelectorAll('[data-artifact-export-realm]').length,loadedFamilies:[...fonts],loadedFaces:[...faces],authoredStyle:italic?'italic':'normal',offlineFontFaces:packedFontFaces.length,offlineFontData:packedFontFaces.every(rule=>rule.includes('data:')),remoteFontReferences:html.includes('/fonts/mingli/')};
};
window.svgFontAttempt=async(mode)=>{
 const snapshot=structuredClone(original),page=snapshot.pages[snapshot.pageOrder[0]];snapshot.pageOrder=[page.id];snapshot.pages={[page.id]:page};snapshot.assets={};
 const source=mode==='inherited'?'<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="50">Inherited Inter SVG</text></svg>':mode==='explicit'?'<svg xmlns="http://www.w3.org/2000/svg" font-family="Inter"><g><text x="10" y="50">Explicit Inter SVG</text></g></svg>':'<svg xmlns="http://www.w3.org/2000/svg"><g font-family="Noto Sans SC"><text x="10" y="50">中文<tspan font-family="Inter">Latin</tspan>文字</text></g></svg>';
 page.nodeOrder=['svg'];page.nodes={svg:{id:'svg',type:'svg',x:20,y:20,width:900,height:180,rotation:0,parentId:null,style:mode==='explicit'?{}:{fontFamily:'Inter'},svg:source}};const before=JSON.stringify(snapshot);
 const {exportArtifact}=await import(${JSON.stringify(join(repository,'src/features/artifacts/native/export-artifact.ts'))});const result=await exportArtifact(snapshot,{format:'html'}),html=await result.blob.text(),faces=html.match(/@font-face\\s*\\{[^}]*\\}/g)??[];
 return{format:'html',mode,bytes:result.blob.size,immutable:before===JSON.stringify(snapshot),mountedPages:document.querySelectorAll('.artifact-export-page').length,realms:document.querySelectorAll('[data-artifact-export-realm]').length,svgTextPreserved:html.includes(mode==='inherited'?'Inherited Inter SVG':mode==='explicit'?'Explicit Inter SVG':'中文'),interFaces:faces.filter(rule=>/font-family:\\s*["']?Inter/.test(rule)).length,notoFaces:faces.filter(rule=>rule.includes('Noto Sans SC')).length,allFontData:faces.every(rule=>rule.includes('data:')),remoteFontReferences:html.includes('/fonts/mingli/')};
};window.fixtureReady=true;
`)
const bundle = await build({configFile:false,root:temporary,logLevel:'error',build:{outDir:join(temporary,'dist'),target:'esnext',rollupOptions:{input:{main:join(temporary,'index.html'),export:join(temporary,'artifact-export.html')}}},worker:{format:'es'}})
const outputs = (Array.isArray(bundle) ? bundle[0] : bundle).output
const chunkFor = suffix => outputs.find(chunk=>chunk.type==='chunk'&&Object.keys(chunk.modules).some(id=>id.replaceAll('\\','/').endsWith(suffix)))?.fileName
const sharedChunk = chunkFor('/src/features/artifacts/native/export/render.ts'),innerChunk = chunkFor('/html-to-image/es/index.js') ?? chunkFor('/html-to-image/lib/index.js')
if(!sharedChunk||!innerChunk)throw Error('Could not identify real shared/inner export chunks')
let fault, injected=[]
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'}
const server=createServer(async(request,response)=>{try{
 const pathname=new URL(request.url??'/','http://localhost').pathname;
 if(request.method==='POST'&&pathname==='/_fault'){const chunks=[];for await(const chunk of request)chunks.push(chunk);fault=JSON.parse(Buffer.concat(chunks).toString());response.end('armed');return}
 response.setHeader('cache-control','no-store');
 if(fault&&fault.remaining>0&&new RegExp(fault.pattern).test(pathname)){fault.remaining--;if(fault.delayMs){const delayMs=fault.delayMs;injected.push({pathname,delayMs});await new Promise(resolve=>setTimeout(resolve,delayMs))}else{injected.push({pathname,status:503});response.statusCode=503;response.end('intentional test outage');return}}
 const file=resolve(temporary,'dist',`.${decodeURIComponent(pathname==='/'?'/index.html':pathname)}`);if(!file.startsWith(join(temporary,'dist')+'/'))throw Error('invalid path');response.setHeader('content-type',mime[extname(file)]??'application/octet-stream');response.end(await readFile(file));
}catch{response.statusCode=404;response.end('not found')}})
await new Promise(resolve=>server.listen(5327,'127.0.0.1',resolve))
const chrome=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--remote-debugging-port=9437',`--user-data-dir=${join(temporary,'chromium')}`,'about:blank'],{stdio:'ignore'})
let socket
try{
 let browser;for(let i=0;i<100;i++){try{browser=await fetch('http://127.0.0.1:9437/json/version').then(r=>r.json());break}catch{await new Promise(r=>setTimeout(r,100))}}
 if(!browser)throw Error('Chromium did not start')
 const target=await fetch('http://127.0.0.1:9437/json/new?about:blank',{method:'PUT'}).then(r=>r.json());socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})});
 let sequence=0;const pending=new Map(),unexpectedErrors=[];socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const callback=pending.get(message.id);pending.delete(message.id);message.error?callback?.reject(Error(message.error.message)):callback?.resolve(message.result)}if(message.method==='Runtime.exceptionThrown')unexpectedErrors.push(message.params.exceptionDetails)})
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:180000});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));const value=result.result?.value;if(value&&typeof value==='object'&&'format' in value){const targets=await call('Target.getTargets');value.workers=targets.targetInfos.filter(target=>target.type==='worker'&&target.url.startsWith('http://127.0.0.1:5327/')).length;if(value.workers)throw Error('An export worker survived cleanup')}return value};
 const arm=(pattern,delayMs)=>fetch('http://127.0.0.1:5327/_fault',{method:'POST',body:JSON.stringify({pattern,remaining:1,delayMs})});
 await call('Runtime.enable');await call('Page.navigate',{url:'http://127.0.0.1:5327/'});for(let i=0;i<100;i++){if(await evaluate('window.fixtureReady===true'))break;await new Promise(r=>setTimeout(r,100))}
 const report={browser:browser.Browser,pages:selected,fixtureSemanticSha256:fixture.manifest.semanticSha256,realmLoad:{},lazyModule:{},sharedDependency:{},innerLazyModule:{},resourceFailure:{},midExportCancellation:[],packingCancellation:{},localFonts:{},svgFonts:[],injected,unexpectedErrors};
 await arm('/artifact-export\\.html$');report.realmLoad.failure=await evaluate('window.attempt("pdf")');report.realmLoad.retry=await evaluate('window.attempt("pdf")');
 await arm('/pdf-[^/]+\\.js$');report.lazyModule.failure=await evaluate('window.attempt("pdf")');report.lazyModule.retry=await evaluate('window.attempt("pdf")');
 // Preserve actual module-cache behavior as evidence even when retry is unsupported.
 await writeFile(output,JSON.stringify(report,null,2));
 if(!report.lazyModule.retry.ok){await call('Page.reload');for(let i=0;i<100;i++){if(await evaluate('window.fixtureReady===true'))break;await new Promise(r=>setTimeout(r,100))}report.lazyModule.afterRefresh=await evaluate('window.attempt("pdf")')}
 for(const [kind,path] of [['sharedDependency',sharedChunk],['innerLazyModule',innerChunk]]){await arm('^/'+path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$');report[kind].failure=await evaluate('window.attempt("pdf")');report[kind].retry=await evaluate('window.attempt("pdf")')}
 await arm('/image-25\\.png$');report.resourceFailure.failure=await evaluate('window.attempt("pdf")');report.resourceFailure.retry=await evaluate('window.attempt("pdf")');
 for(const format of ['html','pdf','pptx']){const failure=await evaluate(`window.attempt(${JSON.stringify(format)},1)`),retry=await evaluate(`window.attempt(${JSON.stringify(format)})`);report.midExportCancellation.push({format,failure,retry})}
 await arm('/pdf\\.worker-[^/]+\\.js$',3000);report.packingCancellation.failure=await evaluate('window.attempt("pdf",3,100)');report.packingCancellation.retry=await evaluate('window.attempt("pdf")');report.packingCancellation.workerLoadObserved=injected.some(request=>request.delayMs===3000);
 await arm('/inter-latin-wght-italic-[^/]+\\.woff2$');report.localFonts.italicFailure=await evaluate('window.fontAttempt("pdf",true)');report.localFonts.italicRetry=await evaluate('window.fontAttempt("pdf",true)');
 report.localFonts.pdf=await evaluate('window.fontAttempt("pdf")');await arm('/inter-latin-wght-normal-[^/]+\\.woff2$');report.localFonts.failure=await evaluate('window.fontAttempt("html")');report.localFonts.retry=await evaluate('window.fontAttempt("html")');
 for(const mode of ['inherited','explicit','nested'])report.svgFonts.push(await evaluate('window.svgFontAttempt('+JSON.stringify(mode)+')'));
 await writeFile(output,JSON.stringify(report,null,2));
 const failed=report.svgFonts.some(item=>!item.immutable||item.realms||item.mountedPages||!item.svgTextPreserved||item.interFaces!==2||!item.allFontData||item.remoteFontReferences||(item.mode==='nested'&&item.notoFaces===0))||report.localFonts.italicFailure.ok||!report.localFonts.italicRetry.ok||!report.localFonts.italicRetry.loadedFaces.some(face=>face.startsWith('LingxiLoopEditor Inter|italic|'))||!report.localFonts.pdf.ok||!['LingxiLoopEditor Inter','Noto Sans SC'].every(family=>report.localFonts.pdf.loadedFamilies.includes(family))||report.localFonts.failure.ok||!report.localFonts.retry.ok||report.localFonts.retry.offlineFontFaces<3||!report.localFonts.retry.offlineFontData||report.localFonts.retry.remoteFontReferences||!report.packingCancellation.workerLoadObserved||report.packingCancellation.failure.error?.name!=='AbortError'||!report.packingCancellation.retry.ok||[report.realmLoad,report.lazyModule,report.sharedDependency,report.innerLazyModule].some(item=>item.failure.ok||!item.retry.ok)||report.resourceFailure.failure.ok||!report.resourceFailure.retry.ok||report.midExportCancellation.some(item=>item.failure.ok||item.failure.error?.name!=='AbortError'||item.failure.progress.length!==1||!item.retry.ok||item.retry.progress.length!==3)
 if(failed)throw Error('export fault acceptance failed; see '+output)
 console.log(JSON.stringify(report));
}finally{socket?.close();chrome.kill('SIGTERM');server.close();if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
