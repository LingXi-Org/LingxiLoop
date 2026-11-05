// Fault acceptance on three representative pages of the fixed 50-page fixture.
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
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
await Promise.all([0, 24, 49].map(index => writeFile(join(temporary, 'public/native-artifact-fixture', fixture.images[index].filename), fixture.images[index].bytes)))
await writeFile(join(temporary, 'public/document.json'), JSON.stringify(fixture.document))
await writeFile(join(temporary, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Export faults</title></head><body><output id="status">loading</output><script type="module" src="/entry.ts"></script></body></html>')
await writeFile(join(temporary, 'entry.ts'), `
const original=await fetch('/document.json').then(r=>r.json());
const OriginalWorker=globalThis.Worker;const workers=new Set();globalThis.Worker=class extends OriginalWorker{constructor(...args){super(...args);workers.add(this)}terminate(){workers.delete(this);super.terminate()}};
window.attempt=async(format,cancelAfterPage)=>{
 const before=JSON.stringify(original),progress=[],controller=new AbortController();let result,error;
 try{const {exportArtifact}=await import(${JSON.stringify(join(repository,'src/features/artifacts/native/export-artifact.ts'))});result=await exportArtifact(original,{format,signal:controller.signal,onProgress:(done,total)=>{progress.push({done,total});if(done===cancelAfterPage)controller.abort()}})}catch(failure){error={name:failure.name,message:failure.message}}
 const immutable=before===JSON.stringify(original),mountedPages=document.querySelectorAll('.artifact-export-page').length;
 if(!immutable||mountedPages||workers.size)throw Error('export leaked document, DOM, or worker state');
 return {format,ok:!!result,error,bytes:result?.blob.size,progress,immutable,mountedPages,workers:workers.size};
};window.fixtureReady=true;
`)
await build({configFile:false,root:temporary,logLevel:'error',build:{outDir:join(temporary,'dist'),target:'esnext'},worker:{format:'es'}})
let fault, injected=[]
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf'}
const server=createServer(async(request,response)=>{try{
 const pathname=new URL(request.url??'/','http://localhost').pathname;
 if(request.method==='POST'&&pathname==='/_fault'){const chunks=[];for await(const chunk of request)chunks.push(chunk);fault=JSON.parse(Buffer.concat(chunks).toString());response.end('armed');return}
 response.setHeader('cache-control','no-store');
 if(fault&&fault.remaining>0&&new RegExp(fault.pattern).test(pathname)){fault.remaining--;injected.push({pathname,status:503});response.statusCode=503;response.end('intentional test outage');return}
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
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,timeout:180000});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result?.value};
 const arm=pattern=>fetch('http://127.0.0.1:5327/_fault',{method:'POST',body:JSON.stringify({pattern,remaining:1})});
 await call('Runtime.enable');await call('Page.navigate',{url:'http://127.0.0.1:5327/'});for(let i=0;i<100;i++){if(await evaluate('window.fixtureReady===true'))break;await new Promise(r=>setTimeout(r,100))}
 const report={browser:browser.Browser,pages:selected,fixtureSemanticSha256:fixture.manifest.semanticSha256,lazyModule:{},resourceFailure:{},midExportCancellation:[],injected,unexpectedErrors};
 await arm('/pdf-[^/]+\\.js$');report.lazyModule.failure=await evaluate('window.attempt("pdf")');report.lazyModule.retry=await evaluate('window.attempt("pdf")');
 // Preserve actual module-cache behavior as evidence even when retry is unsupported.
 await writeFile(output,JSON.stringify(report,null,2));
 if(!report.lazyModule.retry.ok){await call('Page.reload');for(let i=0;i<100;i++){if(await evaluate('window.fixtureReady===true'))break;await new Promise(r=>setTimeout(r,100))}report.lazyModule.afterRefresh=await evaluate('window.attempt("pdf")')}
 await arm('/image-25\\.png$');report.resourceFailure.failure=await evaluate('window.attempt("pdf")');report.resourceFailure.retry=await evaluate('window.attempt("pdf")');
 for(const format of ['html','pdf','pptx']){const failure=await evaluate(`window.attempt(${JSON.stringify(format)},1)`),retry=await evaluate(`window.attempt(${JSON.stringify(format)})`);report.midExportCancellation.push({format,failure,retry})}
 await writeFile(output,JSON.stringify(report,null,2));
 const failed=report.lazyModule.failure.ok||!report.lazyModule.retry.ok||report.resourceFailure.failure.ok||!report.resourceFailure.retry.ok||report.midExportCancellation.some(item=>item.failure.ok||item.failure.error?.name!=='AbortError'||item.failure.progress.length!==1||!item.retry.ok||item.retry.progress.length!==3)
 if(failed)throw Error('export fault acceptance failed; see '+output)
 console.log(JSON.stringify(report));
}finally{socket?.close();chrome.kill('SIGTERM');server.close();if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));await rm(temporary,{recursive:true,force:true})}
