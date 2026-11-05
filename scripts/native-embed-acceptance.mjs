// Run with node --import tsx. Exercises the real isolated DC/JSX runtime and capture bridge.
import { createServer } from 'node:http'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { nativeEmbedRuntime, renderNativeEmbedSource, renderNativeDcModule } from '../server/src/modules/artifacts/native-embed-source.ts'

const output = resolve(process.argv[2] ?? '/workspace/scratch/native-embed-acceptance'), temporary = await mkdtemp(join(tmpdir(), 'lingxi-embed-'))
await mkdir(output, { recursive: true })
const source = `<html><head><script src="./support.js"></script><link rel="stylesheet" href="./ds/fixture/tokens.css"><script src="./ds/fixture/components.js"></script></head><body><x-dc><helmet><style>body{margin:0;font:24px system-ui;background:#faf8f4}button{font:inherit;margin:8px;padding:12px}h1{color:#18332b}</style></helmet><h1>{{title}}</h1><sc-for list="{{items}}" as="item"><button onClick="{{item.pick}}">{{item.label}}</button></sc-for><sc-if value="{{show}}"><p id="count">Clicked {{count}}</p></sc-if><dc-import name="Card" item="{{card}}" hint-size="100%,80px"></dc-import><x-import component-from-global-scope="Cds.Button" icon-only="{{true}}" on-change="{{pick}}">组件按钮</x-import></x-dc><script type="text/x-dc" data-dc-script data-props='{"title":{"editor":"text","default":"原始 DC 组件"}}'>class Component extends DCLogic {state={count:0};renderVals(){return {title:this.props.title,count:this.state.count,show:this.state.count>0,items:[{label:'增加',pick:()=>this.setState({count:this.state.count+1})},{label:'保留'}],card:{label:'子组件内容'},pick:()=>this.setState({count:this.state.count+1})}}}</script><script>let clicked=false,globalClicked=false;const probe=setInterval(()=>{const button=document.querySelector('button');if(button&&!clicked){clicked=true;button.click()}const child=document.querySelector('#child');const count=document.querySelector('#count');const globalButton=document.querySelector('[data-global]');if(globalButton&&!globalClicked&&count?.textContent==='Clicked 1'){globalClicked=true;globalButton.click()}parent.postMessage({type:'fixture-debug',body:document.body.innerText,main:typeof globalThis.__lingxiDCMain,base:document.baseURI},'*');if(child&&count?.textContent==='Clicked 2'){let isolated=false;try{parent.document}catch{isolated=true}parent.postMessage({type:'fixture-probe',title:document.querySelector('h1').textContent,count:count.textContent,child:child.textContent,buttons:document.querySelectorAll('button').length,globalComponent:document.querySelector('[data-global]')?.textContent,globalProp:document.querySelector('[data-global]')?.getAttribute('data-icon-only'),globalBackground:getComputedStyle(globalButton).backgroundColor,isolated},'*');clearInterval(probe)}},40);</script></body></html>`
const child = `<x-dc><p id="child">{{item.label}}</p></x-dc><script type="text/x-dc" data-dc-script>class Component extends DCLogic {renderVals(){return {item:this.props.item}}}</script>`
const runtime = await nativeEmbedRuntime()
const html = await renderNativeEmbedSource(source, 'html', { runtimeUrl: '/runtime.js', nonce: 'fixture-nonce', resourceBaseUrl: '/native/original-resources/revision/project/' })
const childModule = await renderNativeDcModule(child, '/native/original-resources/revision/project/Card.dc.html')
let childRequestedAt = 0, childServedAt = 0, installedComponentLoads = 0
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  response.setHeader('access-control-allow-origin', '*')
  if(path.endsWith('/ds/fixture/tokens.css')){response.setHeader('content-type','text/css');response.end('.fixture-button{background:#d97757;color:white;border:0}');return}
  if(path.endsWith('/ds/fixture/components.js')){installedComponentLoads++;response.setHeader('content-type','text/javascript');response.end(`globalThis.Cds={Button:props=>React.createElement('button',{className:'fixture-button','data-global':'true','data-icon-only':String(props.iconOnly),onClick:props.onChange},props.children)};`);return}
  if (path === '/runtime.js' || path.endsWith('/Card.dc.html')) { response.setHeader('content-type', 'text/javascript'); if(path !== '/runtime.js'){childRequestedAt=Date.now();await new Promise(resolve=>setTimeout(resolve,3000));childServedAt=Date.now()}response.end(path === '/runtime.js' ? runtime : childModule); return }
  if (path === '/embed') {
    response.setHeader('content-type', 'text/html')
    response.setHeader('content-security-policy', "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; base-uri 'self'; form-action 'none'")
    response.end(html); return
  }
  if (path === '/capture' && request.method === 'POST') { const chunks=[];for await(const chunk of request)chunks.push(chunk);await writeFile(join(output,'dc-preview.png'),Buffer.concat(chunks));response.end('saved');return }
  response.setHeader('content-type', 'text/html')
  response.end(`<html><body><iframe id="embed" sandbox="allow-scripts" src="/embed" style="width:800px;height:500px;border:0"></iframe><script>window.receipts=[];window.addEventListener('message',event=>{if(event.source!==document.querySelector('#embed').contentWindow)return;if(event.data.type==='fixture-probe')window.probe=event.data;if(event.data.type==='fixture-debug'){window.debug=event.data;if(!window.earlyCapture)window.earlyCapture=window.capture('early')};if(event.data.type==='lingxi:embed:captured')window.receipts.push(event.data)});window.capture=async(requestId='onload')=>{const startedAt=Date.now(),prior=window.receipts.length;const frame=document.querySelector('#embed');frame.contentWindow.postMessage({type:'lingxi:embed:capture',nonce:'wrong',requestId:'wrong'},'*');await new Promise(r=>setTimeout(r,100));if(window.receipts.length!==prior)throw Error('wrong nonce was accepted');frame.contentWindow.postMessage({type:'lingxi:embed:capture',nonce:'fixture-nonce',requestId},'*');for(let i=0;i<400;i++){const receipt=window.receipts.find(x=>x.requestId===requestId);if(receipt){if(receipt.error)throw Error(receipt.error);const blob=await fetch(receipt.dataUrl).then(r=>r.blob());await fetch('/capture',{method:'POST',body:blob});return{type:blob.type,bytes:blob.size,nonceRejected:true,startedAt,finishedAt:Date.now()}}await new Promise(r=>setTimeout(r,50))}throw Error('capture timed out')};document.querySelector('#embed').addEventListener('load',()=>{window.immediateCapture=window.capture();window.immediateCapture.catch(error=>{window.captureError=error.message})},{once:true});</script></body></html>`)
})
await new Promise(resolve => server.listen(5326, '127.0.0.1', resolve))
const chrome = spawn('/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=9436', `--user-data-dir=${join(temporary,'chromium')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore'] })
let socket
try {
  for(let i=0;i<100;i++){try{await fetch('http://127.0.0.1:9436/json/version');break}catch{await new Promise(r=>setTimeout(r,100))}}
  const target=await fetch('http://127.0.0.1:9436/json/new?about:blank',{method:'PUT'}).then(r=>r.json())
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
  let next=0;const pending=new Map(),errors=[]
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p?.reject(Error(data.error.message)):p?.resolve(data.result)}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails)})
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
  await call('Runtime.enable');await call('Page.navigate',{url:'http://127.0.0.1:5326/'})
  let probe
  for(let i=0;i<400;i++){const result=await call('Runtime.evaluate',{expression:'window.probe',returnByValue:true});if(result.result?.value){probe=result.result.value;break}await new Promise(r=>setTimeout(r,50))}
  if(!probe){const debug=await call('Runtime.evaluate',{expression:'window.debug',returnByValue:true});throw Error(`DC render failed: ${JSON.stringify({errors,debug:debug.result?.value})}`)}
  if(probe.title!=='原始 DC 组件'||probe.count!=='Clicked 2'||probe.child!=='子组件内容'||probe.buttons!==3||probe.globalComponent!=='组件按钮'||probe.globalProp!=='true'||probe.globalBackground!=='rgb(217, 119, 87)'||!probe.isolated)throw Error(JSON.stringify(probe))
  const captured=await call('Runtime.evaluate',{expression:'window.immediateCapture',awaitPromise:true,returnByValue:true,timeout:30000})
  if(captured.exceptionDetails)throw Error(JSON.stringify(captured.exceptionDetails))
  const early=await call('Runtime.evaluate',{expression:'window.earlyCapture',awaitPromise:true,returnByValue:true,timeout:30000});if(early.exceptionDetails)throw Error(JSON.stringify(early.exceptionDetails));
  if(!captured.result.value||captured.result.value.finishedAt<childServedAt||!early.result.value||early.result.value.startedAt>=childServedAt||early.result.value.finishedAt<childServedAt)throw Error('capture did not wait for the delayed child');const report={probe,capture:captured.result.value,earlyCapture:early.result.value,childRequestedAt,childServedAt,delayedChildMs:3000,installedComponentLoads,errors,runtimeBytes:Buffer.byteLength(runtime),sourcePreserved:source.includes('type="text/x-dc"')}
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
}finally{socket?.close();chrome.kill('SIGTERM');server.close();if(chrome.exitCode===null)await new Promise(resolve=>chrome.once('exit',resolve));await rm(temporary,{recursive:true,force:true})}
