import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import test, { after } from 'node:test'
import { releaseVersions } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async()=>{await teardownAll()})
const actual=String(releaseVersions.runtime),body='OK safe suffix'
// Narrow the public preview only; final safety, real PostgreSQL authorization,
// binding, prefix/hash checks and terminal persistence remain unchanged.
class HeldPreviewPolicy extends ProductRuntimePolicy {
  override publicTextSafety(input:Parameters<ProductRuntimePolicy['publicTextSafety']>[0]) {
    const result=super.publicTextSafety(input)
    return input.isFinal?result:{...result,safeThrough:Math.min(3,result.safeThrough)}
  }
}
for(const {delayedAck,rejectSeal} of [{delayedAck:false,rejectSeal:false},{delayedAck:true,rejectSeal:false},{delayedAck:true,rejectSeal:true}])test(`real product native-v3 bounded preview; delayed ACK=${delayedAck}, host rejects seal=${rejectSeal}`,{timeout:30000},async()=>{
  assert.ok(['3.8.20','3.8.21'].includes(actual))
  await ensureSchemaOnce();await resetAllTables()
  const im=await installRecordingWukong(),{companyId,projectId,agentId}=await seedCompanyWithAgent()
  const userId='suspension-user',channelId='suspension-room',members=[userId,agentId]
  await seedUserMembership(userId,companyId)
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic suspension',$4::jsonb)",[channelId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[channelId,companyId,JSON.stringify({channelType:2,members})])
  let calls=0,handlerError:unknown,delayed=false,sealRejected=false
  const provider=createServer(async(req,res)=>{
    try{
      let raw='';for await(const chunk of req)raw+=chunk
      const input=JSON.parse(raw);assert.ok(input.tools.some((tool:{function:{name:string}})=>tool.function.name==='public_answer'));calls++;assert.equal(calls,1)
      const args=JSON.stringify({operation:{kind:'append',supersedes:[]},answer:body,commentary:'',outcome:{status:'satisfied',gaps:[]}})
      const cut=args.indexOf(body)+body.length
      res.writeHead(200,{'content-type':'text/event-stream'})
      res.write(`data: ${JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'suspended-answer',type:'function',function:{name:'public_answer',arguments:args.slice(0,cut)}}]},finish_reason:null}]})}\n\n`)
      await delay(1250)
      res.end(`data: ${JSON.stringify({choices:[{delta:{tool_calls:[{index:0,function:{arguments:args.slice(cut)}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:10,completion_tokens:20}})}\n\ndata: [DONE]\n\n`)
    }catch(error){handlerError??=error;res.end()}
  })
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve))
  let worker:ReturnType<typeof createWorker>|undefined
  try{
    const api=await lingxiOSControl(),policy=await syncConversationPolicy(api,companyId,channelId)
    const address=provider.address();assert.ok(address&&typeof address!=='string')
    worker=createWorker({controlPlane:{connectWorker(input){
      const host=api.connectWorker(input)
      return {...host,async emitEvent(work,event){
        if(rejectSeal&&event.kind==='public.text.sealed'){sealRejected=true;throw Error('synthetic product-host seal rejection')}
        await host.emitEvent(work,event)
        if(delayedAck&&!delayed&&event.kind==='public.text.delta'){delayed=true;await delay(1200)}
      }}
    }},policy:new HeldPreviewPolicy(),model:{...runtimeModelConfiguration({id:'deepseek-ai/DeepSeek-V4.1-Flash',baseUrl:'https://api.siliconflow.cn/v1',apiKey:'synthetic-only'},90000),baseUrl:`http://127.0.0.1:${address.port}/v1`},worker:{id:'suspension-worker',concurrency:1}})
    const run=(await api.conversations.ingest({tenantId:companyId,conversationId:channelId,policyVersion:policy.version,messageId:'request',version:1,author:{id:userId,kind:'human'},text:'Give one short answer.',mentions:[agentId]},
      {mode:'chat',codeExecution:'disabled',executionClass:'conversation'})).runs[0]
    assert.ok(run);await bindProductRun(pool,run,channelId);await worker.runNext();assert.equal(handlerError,undefined);assert.equal(calls,1)
    const state=await api.readRunState(run),events=(await pool.query('SELECT kind,data FROM lingxios.agent_run_events WHERE run_id=$1 ORDER BY seq',[run.runId])).rows
    const reasons=events.filter(event=>event.kind==='public.text.ended').map(event=>event.data.reason)
    const seals=events.filter(event=>event.kind==='public.text.sealed').length
    // The first-ACK delay overlaps this fixture's provider pause, leaving less
    // than1s of held text on source20. It is a success/control path, not the
    // SDK's separate in-flight-second-ACK race reproduction.
    if(rejectSeal){
      assert.equal(sealRejected,true);assert.equal(state?.run.status,'failed');assert.equal(seals,0)
      assert.equal((await pool.query('SELECT result_id FROM lingxios.agent_work_items WHERE id=$1',[run.runId])).rows[0].result_id,null)
    }else if(actual==='3.8.20'&&!delayedAck){
      assert.equal(state?.run.status,'failed');assert.equal(seals,0);assert.ok(reasons.includes('interrupted'))
    }else{
      assert.equal(state?.run.status,'succeeded');assert.equal(state?.message?.body,body)
      assert.deepEqual(reasons,['completed']);assert.equal(seals,1)
    }
    if(delayedAck)assert.equal(delayed,true)
    console.info(JSON.stringify({qualification:rejectSeal?'product-host-seal-rejection-control':actual==='3.8.20'?delayedAck?'formal20-product-ack-control':'formal20-product-baseline-reproduction':'formal21-product-suspension-qualification',runtime:actual,delayedAck,rejectSeal,calls,status:state?.run.status,seals,reasons,realPostgres:true,provider:'synthetic',browserValidated:false}))
  }finally{await worker?.stop();await stopLingxiOSControl();await im.close();provider.closeAllConnections();await new Promise<void>(resolve=>provider.close(()=>resolve()))}
})
