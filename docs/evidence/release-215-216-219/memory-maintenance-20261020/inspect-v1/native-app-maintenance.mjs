import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';
export async function executeAppMaintenance({code,transport,onProgress,apiKey,apiSecret}){
 assert.ok(typeof code==='string'&&code.length>0&&Buffer.byteLength(code)<65536&&apiKey&&apiSecret);
 const stack='lingxiloop-app-a',operation='RunStackService';
 const config=await transport.read('GetStack',{stack}),stackId=config?._id?.$oid;
 assert.ok(/^[a-f0-9]{24}$/.test(stackId??''));
 const params={stack,service:'lingxiloop',no_tty:true,no_deps:true,detach:false,service_ports:false,pull:false,
  command:['timeout','-k','10','180','node','--max-old-space-size=256','--import','tsx','--input-type=module','-e',code]};
 let submitted=false,complete=false,id;
 try{
  await onProgress({phase:'komodo',status:'submitting',operation,stack,service:'lingxiloop'});submitted=true;
  const response=await fetch('https://ops.christmas1314.xyz/execute/RunStackService',{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':apiKey,'x-api-secret':apiSecret},body:JSON.stringify(params),signal:AbortSignal.timeout(60000)});
  if(!response.ok){await response.body?.cancel();throw Error('Native maintenance submission failed')}
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2*1024*1024){await reader.cancel();throw Error('Native response bound')};chunks.push(value)}}finally{reader.releaseLock()}
  let update=JSON.parse(Buffer.concat(chunks).toString('utf8'));id=update?._id?.$oid;
  assert.ok(/^[a-f0-9]{24}$/.test(id??''));
  await onProgress({phase:'komodo',status:'pending',operation,stack,service:'lingxiloop',updateId:id});
  const deadline=Date.now()+250000;
  while(true){
   assert.equal(update?._id?.$oid,id);assert.equal(update.operation,operation);assert.deepEqual(update.target,{type:'Stack',id:stackId});
   if(update.status==='Complete'){assert.equal(typeof update.success,'boolean');complete=true;await onProgress({phase:'komodo',status:update.success?'complete':'failed',operation,stack,service:'lingxiloop',updateId:id,nativeTerminal:true});return update}
   assert.ok(['InProgress','Queued'].includes(update.status)&&Date.now()<deadline);
   await wait(2000);update=await transport.read('GetUpdate',{id});
  }
 }catch{
  const uncertain=submitted&&!complete;
  await onProgress({phase:'komodo',status:uncertain?'uncertain':'failed',operation,stack,service:'lingxiloop',.../^[a-f0-9]{24}$/.test(id??'')?{updateId:id}:{},noAutomaticRetry:true}).catch(()=>{});
  throw Object.assign(Error('Existing app maintenance stopped'),{uncertain});
 }
}
