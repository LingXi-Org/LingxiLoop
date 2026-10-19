import {spawn} from 'node:child_process'
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import type {BrowserLease,BrowserProvider} from '@e2e-dev/web'

const origin='http://127.0.0.1:5193'
type LocalLease=BrowserLease&{pid:number;profile:string}
const children=new Map<number,ReturnType<typeof spawn>>()
async function stop(pid:number){const child=children.get(pid);if(!child||child.pid===undefined)return;children.delete(pid);if(child.exitCode!==null||child.signalCode!==null)return;await new Promise<void>(resolve=>{child.once('exit',()=>resolve());child.kill('SIGTERM')})}
// CDP is restricted to test-context permission setup/reset. All page navigation,
// input, observation and screenshots remain official @e2e-dev/web operations.
async function permission(endpoint:string,method:'Browser.grantPermissions'|'Browser.resetPermissions'){
  const socket=new WebSocket(endpoint)
  try {
    await new Promise<void>((resolve,reject)=>{socket.addEventListener('open',()=>resolve(),{once:true});socket.addEventListener('error',()=>reject(new Error('Local clipboard CDP connection failed')),{once:true})})
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Local clipboard permission setup timed out')),10000)
      socket.addEventListener('message',event=>{const result=JSON.parse(String(event.data));if(result.id!==1)return;clearTimeout(timer);result.error?reject(new Error(result.error.message)):resolve()})
      socket.send(JSON.stringify({id:1,method,params:method==='Browser.grantPermissions'?{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']}:{}}))
    })
  } finally {socket.close()}
}
export const clipboardProvider:BrowserProvider={
  name:'issue193-local-clipboard',scope:'attempt',
  async acquire(request){
    const profile=await mkdtemp(join(tmpdir(),'issue193-clipboard-'))
    const executable=request.env.E2E_VISUALIZE_CHROMIUM??'/workspace/.lingxi-setup/cache/ms-playwright/chromium-1243/chrome-linux64/chrome'
    const stderrPath=resolve(request.env.E2E_VISUALIZE_OUTPUT??'.e2e/visualize-clipboard-env','chromium-stderr.log')
    await Promise.all([mkdir(join(profile,'config'),{recursive:true}),mkdir(join(profile,'cache'),{recursive:true}),mkdir(join(profile,'crashes'),{recursive:true}),mkdir(resolve(stderrPath,'..'),{recursive:true})])
    let stderr=''
    const child=spawn(executable,['--headless','--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,`--crash-dumps-dir=${join(profile,'crashes')}`],{env:{...request.env,XDG_CONFIG_HOME:join(profile,'config'),XDG_CACHE_HOME:join(profile,'cache')},stdio:['ignore','ignore','pipe']})
    children.set(child.pid!,child)
    try {
      const endpoint=await new Promise<string>((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Local clipboard browser startup timed out')),30000)
        child.stderr.on('data',chunk=>{stderr+=String(chunk);const found=/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/.exec(stderr);if(found){clearTimeout(timer);resolve(found[1])}})
        child.once('error',error=>{clearTimeout(timer);reject(error)})
        child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Local clipboard browser exited ${code}: ${stderr.slice(-2000)}`))})
        request.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Local clipboard browser cancelled'))},{once:true})
      })
      await writeFile(stderrPath,stderr)
      await permission(endpoint,'Browser.grantPermissions')
      request.log(`Clipboard permission initialized only for ${origin}`)
      return {id:`issue193-clipboard-${child.pid}`,cdpEndpoint:endpoint,reconnectEndpoint:endpoint,pid:child.pid!,profile}
    } catch(error){await stop(child.pid!);await writeFile(stderrPath,stderr);await rm(profile,{recursive:true,force:true});throw error}
  },
  async release(lease,context){
    const local=lease as LocalLease
    try {await permission(lease.cdpEndpoint,'Browser.resetPermissions')} finally {
      await stop(local.pid)
      await rm(local.profile,{recursive:true,force:true})
      context.log('Local clipboard permissions reset and temporary browser removed')
    }
  },
}
