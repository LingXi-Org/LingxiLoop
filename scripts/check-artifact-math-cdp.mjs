// Focused opaque-iframe counterpart to check-artifact-math.py. Uses the same
// CDP context discovery as check-visualize-reopen.mjs; local public fixture only.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const origin=process.env.VISUALIZE_TEST_ORIGIN??'http://127.0.0.1:5285'
assert.match(origin,/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/)
const out='artifacts/issue-613-followup'
await mkdir(out,{recursive:true})
const directory=await mkdtemp(join(tmpdir(),'math613-cdp-'))
const child=spawn('/usr/bin/chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${directory}`,'about:blank'],{stdio:['ignore','ignore','pipe']})
let socket,nextId=0
const pending=new Map(),contexts=new Map(),reports=[]
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let text='';const timer=setTimeout(()=>reject(new Error('Chromium startup timed out')),15000)
    child.stderr.on('data',chunk=>{text+=chunk;const m=text.match(/DevTools listening on (ws:\/\/\S+)/);if(m){clearTimeout(timer);resolve(m[1])}})
    child.once('error',reject)
  })
  const tabs=await(await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json()
  socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}))
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}))})
  socket.addEventListener('message',event=>{
    const data=JSON.parse(event.data)
    if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p?.reject(new Error(data.error.message)):p?.resolve(data.result)}
    if(data.method==='Runtime.executionContextCreated'&&data.params.context.auxData?.isDefault) contexts.set(data.params.context.auxData.frameId,{id:data.params.context.id,sessionId:data.sessionId})
    if(data.method==='Runtime.executionContextsCleared') for(const [key,context] of contexts) if(context.sessionId===data.sessionId) contexts.delete(key)
    if(data.method==='Target.attachedToTarget') void call('Runtime.enable',{},data.params.sessionId)
  })
  const evaluate=async(expression,context)=>{
    const r=await call('Runtime.evaluate',{expression,contextId:context?.id,returnByValue:true,awaitPromise:true,allowUnsafeEvalBlockedByCSP:false},context?.sessionId)
    if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text)
    return r.result.value
  }
  const wait=async(check)=>{const deadline=Date.now()+25000;while(Date.now()<deadline){const r=await check();if(r)return r;await delay(100)}throw new Error('Local fixture timed out')}
  const guest=()=>wait(async()=>{for(const context of contexts.values())try{if(await evaluate('!!document.getElementById("math-fixture")',context))return context}catch{} })
  const verify=async(expected=8)=>{
    const c=await guest()
    await wait(async()=>await evaluate(`document.querySelectorAll('.katex').length===${expected}`,c))
    await evaluate('document.fonts.ready.then(()=>true)',c)
    return evaluate(`({matrix:document.querySelectorAll('#matrix .mtable').length,aligned:document.querySelectorAll('#aligned .mtable').length,attention:document.querySelectorAll('#attention .mfrac').length,dollarAttention:document.querySelectorAll('#dollar-attention .mfrac').length,count:document.querySelectorAll('.katex').length,rnn:document.querySelector('#roadmap-rnn annotation')?.textContent,price:document.getElementById('ordinary')?.textContent,code:document.getElementById('inline-code')?.textContent,font:document.querySelector('.katex')?getComputedStyle(document.querySelector('.katex')).fontSize:null})`,c)
  }
  const click=async(selector)=>{
    const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView();const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',...r})
    await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...r})
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...r})
  }
  const screenshot=async(name)=>{const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'))}
  await call('Page.enable');await call('Runtime.enable');await call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true})
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false})
  await call('Page.navigate',{url:origin+'/scripts/fixtures/visualize-math.html'})
  let result=await verify();assert.equal(result.rnn,'h_t = f(h_{t-1}, x_t)');assert.match(result.price,/\$5 and \$10/);assert.match(result.code,/`\$h_t=f\(x_t\)\$`/)
  assert.equal(result.matrix,1);assert.equal(result.aligned,1);assert.equal(result.attention,1);assert.equal(result.dollarAttention,1);reports.push({scenario:'initial',...result});await screenshot('inline-cdp-after')
  await evaluate(`document.getElementById('roadmap-rnn').textContent=${JSON.stringify('Budget $5; RNN $h_{t+1} = f(h_t, x_{t+1})$')}`,await guest())
  await wait(async()=>await evaluate(`document.querySelector('#roadmap-rnn annotation')?.textContent==='h_{t+1} = f(h_t, x_{t+1})'`,await guest()))
  reports.push({scenario:'single-dollar-update',...await verify()})
  await evaluate('document.getElementById("math-fixture").style.width="240px"',await guest())
  const narrow=await evaluate(`([...document.querySelectorAll('.katex-display')].map(e=>({width:e.clientWidth,content:e.scrollWidth,tab:e.tabIndex})))`,await guest())
  assert.ok(narrow.every(e=>e.width<=240&&e.tab===0));assert.ok(narrow.some(e=>e.content>e.width));reports.push({scenario:'narrow-240px',formulas:narrow});await screenshot('inline-cdp-narrow')
  await evaluate('document.getElementById("math-fixture").style.width=""',await guest())
  await click('button[aria-label="放大"]');await verify();await click('button[aria-label="收起"]');await verify()
  await click('#close');await click('#open');await verify();await call('Page.reload');await verify()
  reports.push({scenario:'expand-collapse-reopen-refresh',passed:true})
  await call('Page.navigate',{url:origin+'/scripts/fixtures/visualize-math.html?mode=dollar-dynamic'})
  const c=await guest();assert.equal(await evaluate(`document.querySelectorAll('.katex').length`,c),0)
  await evaluate(`document.getElementById('dynamic').textContent=${JSON.stringify('Budget $5; RNN $h_t = f(h_{t-1}, x_t)$')}`,c)
  await wait(async()=>await evaluate(`document.querySelector('annotation')?.textContent==='h_t = f(h_{t-1}, x_t)'`,await guest()))
  assert.equal(await evaluate(`document.querySelectorAll('.katex').length`,await guest()),1)
  reports.push({scenario:'single-dollar-after-price-only-mount',passed:true});await screenshot('inline-cdp-late')
  const report={browser:'cloud Chromium via CDP; no CSP override',scope:'real GenUiCard/opaque frames; independent public samples; no original Roadmap file or production artwork writes',reports}
  await writeFile(`${out}/browser-cdp.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report))
}finally{socket?.close();child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(directory,{recursive:true,force:true})}
