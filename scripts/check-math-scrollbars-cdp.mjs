// Focused opaque-iframe counterpart to check-math-scrollbars.py. Uses the same
// CDP context discovery as check-visualize-reopen.mjs; local public fixture only.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
const origin=process.env.VISUALIZE_TEST_ORIGIN??'http://127.0.0.1:5299'
assert.match(origin,/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/)
const baseline=process.argv.includes('--baseline')
const out='artifacts/issue-644';const phase=baseline?'before':'after'
await mkdir(out,{recursive:true})
const directory=await mkdtemp(join(tmpdir(),'math644-cdp-'))
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
  const screenshot=async(name)=>{const r=await call('Page.captureScreenshot',{format:'png'});await writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'))}
  await call('Page.enable');await call('Runtime.enable');await call('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true})
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false})
  await call('Page.navigate',{url:origin+'/scripts/fixtures/visualize-math.html?mode=scrollbars'})
  const measureSource=(await readFile('scripts/fixtures/math-scrollbar-metrics.js','utf8')).replace('export default ','')
  const measure=async()=>{const c=await guest();await wait(async()=>await evaluate("document.querySelectorAll('.katex').length===10",c));await evaluate('document.fonts.ready.then(()=>true)',c);return evaluate(`(${measureSource})()`,c)}
  const check=rows=>{assert.equal(rows.length,10);assert.ok(rows.some(r=>r.matrix));assert.ok(rows.some(r=>r.frac));if(!baseline)assert.ok(rows.filter(r=>r.short).every(r=>r.range===0),JSON.stringify(rows.filter(r=>r.short)))}
  let rows=await measure();check(rows);if(baseline)assert.ok(rows.some(r=>r.short&&r.range>0));reports.push({scenario:'initial',rows});await screenshot(`inline-${phase}`)
  for(const scale of [.8,1,1.25,1.5]){
    await evaluate(`document.body.style.zoom=${scale}`,await guest());rows=await measure();check(rows);reports.push({scenario:'zoom-'+scale,rows})
  }
  await evaluate('document.body.style.zoom=1;document.getElementById("math-fixture").style.width="241.375px"',await guest());rows=await measure();check(rows)
  const long=rows.filter(r=>r.source.includes('underbrace')||r.source.includes('a_{11}'));assert.ok(long.every(r=>r.range>20&&r.tab===0));reports.push({scenario:'narrow-fractional',rows})
  await evaluate("document.querySelector('[data-math-case=long] .katex-display').focus()",await guest())
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  const moved=await wait(async()=>await evaluate("document.querySelector('[data-math-case=long] .katex-display').scrollLeft>0",await guest()));assert.ok(moved)
  await evaluate("document.getElementById('dynamic').textContent='$'+String.fromCharCode(92)+'sqrt{x_2}$'",await guest());await wait(async()=>await evaluate("document.querySelector('#dynamic annotation')?.textContent===String.fromCharCode(92)+'sqrt{x_2}'",await guest()));check(await measure());reports.push({scenario:'dynamic-and-keyboard',passed:true});await screenshot(`inline-${phase}-narrow`)
  await call('Page.reload');check(await measure());reports.push({scenario:'refresh',passed:true})
  const report={browser:'cloud Chromium via CDP; no CSP override',phase,scope:'real GenUiCard/opaque frames; independent public formulas; no original artwork or production writes',reports}
  await writeFile(`${out}/inline-${phase}.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({phase,scenarios:reports.map(r=>r.scenario)}))
}finally{socket?.close();child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(directory,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
