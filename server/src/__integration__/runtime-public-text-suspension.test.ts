import { installModelWireSummary } from './_model-wire-summary.js'
import { readAdminModelStageCalls, runStageTiming } from '../modules/platform-operations/model-stage-timing.js'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import test, { after } from 'node:test'
import { releaseVersions } from '@lingxi-org/lingxios'
import { createWorker } from '@lingxi-org/lingxios/worker'
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
  override publicTextSafety(input:Parameters<ProductRuntimePolicy['publicTextSafety']>[0],context:Parameters<ProductRuntimePolicy['publicTextSafety']>[1]) {
    const result=super.publicTextSafety(input,context)
    return input.isFinal?result:{...result,safeThrough:Math.min(3,result.safeThrough)}
  }
}
for(const {delayedAck,rejectSeal,invalidReplacement} of [{delayedAck:false,rejectSeal:false,invalidReplacement:false},{delayedAck:true,rejectSeal:false,invalidReplacement:false},{delayedAck:true,rejectSeal:true,invalidReplacement:false},{delayedAck:false,rejectSeal:false,invalidReplacement:true}].filter(value=>!value.invalidReplacement||['3.8.23','3.8.24','3.8.25','4.0.0'].includes(actual)))test(`real product native-v3 bounded preview; delayed ACK=${delayedAck}, host rejects seal=${rejectSeal}, invalid replacement=${invalidReplacement}`,{timeout:30000},async()=>{
  assert.ok(['3.8.20','3.8.21','3.8.22','3.8.23','3.8.24','3.8.25','4.0.0'].includes(actual))
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
      const args=JSON.stringify({operation:invalidReplacement?{kind:'replace',supersedes:['synthetic-nonexistent-source']}:{kind:'append',supersedes:[]},answer:body,commentary:'',outcome:{status:'satisfied',gaps:[]}})
      const cut=args.indexOf(body)+body.length
      res.writeHead(200,{'content-type':'text/event-stream'})
      res.write(`data: ${JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'suspended-answer',type:'function',function:{name:'public_answer',arguments:args.slice(0,cut)}}]},finish_reason:null}],...(invalidReplacement?{usage:{prompt_tokens:10,completion_tokens:20}}:{})})}\n\n`)
      await delay(1250)
      res.end(`data: ${JSON.stringify({choices:[{delta:{tool_calls:[{index:0,function:{arguments:args.slice(cut)}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:10,completion_tokens:20}})}\n\ndata: [DONE]\n\n`)
    }catch(error){handlerError??=error;res.end()}
  })
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve))
  const address=provider.address();assert.ok(address&&typeof address!=='string')
  const wire=installModelWireSummary(`http://127.0.0.1:${address.port}/v1`)
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
    if(invalidReplacement){
      assert.equal(state?.run.status,'failed');assert.equal(seals,0);assert.deepEqual(reasons,[])
      assert.equal((await pool.query('SELECT result_id FROM lingxios.agent_work_items WHERE id=$1',[run.runId])).rows[0].result_id,null)
      assert.equal((await api.readDiagnostics(run))?.runtimeFailure?.errorName,'ModelDriverError')
      const failure=events.find(event=>event.kind==='model.failed')?.data.modelDiagnostics
      assert.equal(failure?.kind,['3.8.24','3.8.25','4.0.0'].includes(actual)?'output':'provider');assert.equal(failure?.category,'unknown')
      if(['3.8.24','3.8.25','4.0.0'].includes(actual))assert.equal(failure?.outputCallback,'operation')
    }else if(rejectSeal){
      assert.equal(sealRejected,true);assert.equal(state?.run.status,'failed');assert.equal(seals,0)
      assert.equal((await pool.query('SELECT result_id FROM lingxios.agent_work_items WHERE id=$1',[run.runId])).rows[0].result_id,null)
    }else if(actual==='3.8.20'&&!delayedAck){
      assert.equal(state?.run.status,'failed');assert.equal(seals,0);assert.ok(reasons.includes('interrupted'))
    }else{
      assert.equal(state?.run.status,'succeeded');assert.equal(state?.message?.body,body)
      assert.deepEqual(reasons,['completed']);assert.equal(seals,1)
    }
    if(['3.8.22','3.8.23','3.8.24','3.8.25','4.0.0'].includes(actual)){
      const deadline=Date.now()+8000
      let modelStages=await readAdminModelStageCalls(pool,run,1)
      while(!modelStages.calls.length&&Date.now()<deadline){await delay(25);modelStages=await readAdminModelStageCalls(pool,run,1)}
      assert.equal(modelStages.calls.length,1,'actual model callback must reach the shared ledger')
      const stages=modelStages.calls[0].stages
      assert.equal(stages.providerTime,'unavailable');assert.equal(stages.httpToFirstContentMs,undefined,'tool-only HTTP has no content-first zero')
      if(invalidReplacement){
        assert.equal(stages.streamCompleted,false);assert.equal(stages.outputCallbackCount,1)
        if(['3.8.24','3.8.25','4.0.0'].includes(actual))assert.deepEqual(modelStages.calls[0].failureAttribution,{kind:'output',outputCallback:'operation'})
      }
      else{assert.ok((stages.observedStreamMs??0)>=1000);assert.ok((stages.httpToFirstCompleteToolCallMs??0)>=1000)}
      const diagnostics=await api.readDiagnostics(run),projected=runStageTiming(run,1,modelStages,diagnostics)
      assert.ok(projected.publicationTimings.length>0,'use the formal authorized public diagnostic reader')
      assert.ok(projected.publicationTimings.every(value=>value.requestVersion===1&&value.callId===modelStages.calls[0].callId))
      if(invalidReplacement){
        assert.ok(projected.publicationTimings.every(value=>value.publicationCount===0&&value.acknowledgedCount===0))
        assert.equal(wire.records[0].response.streamEnd,'consumer-cancelled')
        assert.ok(wire.records[0].response.toolCallParts>0);assert.equal(wire.records[0].response.finishTools,0);assert.equal(wire.records[0].response.doneFrames,0)
      }
      if(delayedAck)assert.ok(projected.publicationTimings.some(value=>value.publicationWaitMs>=1000))
      if(rejectSeal)assert.ok(projected.publicationTimings.some(value=>value.failure?.stage==='seal'&&value.failure.code==='persistence_rejected'))
      assert.equal(projected.unattributedRunMs,null)
    }
    if(delayedAck)assert.equal(delayed,true)
    console.info(JSON.stringify({qualification:invalidReplacement?'synthetic-operation-callback-rejection-matching-failure-signature':rejectSeal?'product-host-seal-rejection-control':actual==='3.8.20'?delayedAck?'formal20-product-ack-control':'formal20-product-baseline-reproduction':`formal${actual}-product-suspension-qualification`,runtime:actual,delayedAck,rejectSeal,calls,status:state?.run.status,seals,reasons,realPostgres:true,provider:'synthetic',browserValidated:false}))
  }finally{await wire.close(async()=>{await worker?.stop();await stopLingxiOSControl();await im.close();provider.closeAllConnections();await new Promise<void>(resolve=>provider.close(()=>resolve()))})}
})
