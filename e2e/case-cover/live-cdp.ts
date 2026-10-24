// Targeted media/touch/tab controls missing from the official engine's Browser
// facade. Test navigation, selectors, screenshots and assertions stay official.
import WebSocket from 'ws'
export async function connectLiveCoverPage(exactURL:string){
 const endpoint=process.env.E2E_CASE_COVER_CDP_URL??'http://127.0.0.1:9337'
 const targets=await fetch(endpoint+'/json/list').then(response=>response.json()) as {id:string;type:string;url:string;webSocketDebuggerUrl:string}[]
 const own=targets.filter(target=>target.type==='page'&&target.url===exactURL)
 if(own.length!==1)throw Error('expected one exact live fixture target')
 const target=own[0],socket=new WebSocket(target.webSocketDebuggerUrl)
 await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject)})
 let sequence=0
 const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>()
 socket.on('message',bytes=>{const message=JSON.parse(bytes.toString());const entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(Error(message.error.message)):entry.resolve(message.result)})
 const send=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'))},5000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}))})
 let extra:string|undefined
 return {send,async background(){extra=(await send('Target.createTarget',{url:'about:blank',background:false})).targetId;await send('Target.activateTarget',{targetId:extra})},async foreground(){await send('Target.activateTarget',{targetId:target.id});if(extra){await send('Target.closeTarget',{targetId:extra});extra=undefined}},async close(){if(extra)await send('Target.closeTarget',{targetId:extra});socket.close()}}
}
