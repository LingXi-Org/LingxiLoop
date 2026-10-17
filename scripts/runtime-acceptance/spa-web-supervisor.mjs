import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { openSync, appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { isolatedSpa } from '../../e2e/acceptance/profile.mjs'
const root=resolve(process.env.ACCEPTANCE_FIXTURE_ROOT??'.')
assert.ok(root.startsWith('/workspace/'))
const output=resolve(root,'.e2e/spa-web-restart')
mkdirSync(output,{recursive:true})
const log=openSync(`${output}/web.log`,'a',0o600)
const record=event=>appendFileSync(`${output}/lifecycle.jsonl`,JSON.stringify({at:new Date().toISOString(),event})+'\n')
let child, stopping=false
async function stop() {
  if(!child) return
  const current=child
  const exited=new Promise(resolve=>current.once('exit',resolve))
  process.kill(-current.pid,'SIGTERM')
  await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Test Web did not stop')),15000).unref())])
  child=undefined
  record('stopped')
}
async function start() {
  if(child) return
  child=spawn(process.execPath,['e2e/local-api.mjs','--api-only'],{cwd:root,detached:true,stdio:['ignore',log,log],
    env:{PATH:process.env.PATH,HOME:process.env.HOME,...(isolatedSpa ? {E2E_SPA_ISOLATED:'1'} : {})}})
  record('starting')
  for(let attempt=0;attempt<120;attempt++) {
    assert.equal(child.exitCode,null,'Test Web exited during startup')
    if(await fetch(`http://127.0.0.1:${isolatedSpa?.apiPort ?? 5181}/api/readyz`,{signal:AbortSignal.timeout(1000)}).then(r=>r.ok).catch(()=>false)) {record('ready');return}
    await new Promise(resolve=>setTimeout(resolve,250))
  }
  throw new Error('Test Web readiness timed out')
}
await start()
const server=createServer(async(req,res)=>{
  if(req.method!=='POST'||req.headers['x-acceptance-fixture']!=='local-web-only'||!['/start','/stop'].includes(req.url)) {res.writeHead(404).end();return}
  try {await (req.url==='/stop'?stop():start());res.writeHead(200).end('ok')}
  catch {res.writeHead(500).end('fixture lifecycle failed')}
})
server.listen(isolatedSpa?.supervisorPort ?? 5185,'127.0.0.1',()=>record('supervisor-ready'))
for(const signal of ['SIGTERM','SIGINT']) process.on(signal,async()=>{if(stopping)return;stopping=true;server.close();await stop();process.exit(0)})
