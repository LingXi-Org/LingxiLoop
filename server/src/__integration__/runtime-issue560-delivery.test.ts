// Ported from LingxiOS PR76 at1fa2ee98. Synthetic model; no live provider/browser claim.
import assert from 'node:assert/strict'
import { issue560ProbeVerdict } from './_issue560-probe-verdict.js'
import { test, after } from 'node:test'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { skillIndex } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { ForbiddenError } from '../modules/access/public.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { readAuthorizedVisualizeSnapshot } from '../im/visualize.js'
import { nativeText } from '../im/message-types.js'
import { DEFAULT_AGENT_CAPABILITIES } from '../../../src/lib/agentCapabilities.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async()=>{await teardownAll()})

// Real Worker, authorization, storage and IM outbox for all published bindings.
// Keep native-v1/v2 coverage while qualifying the opt-in native-v3 producer.
for (const { budgetProbe, explanationWorkflow, binding } of [
  { budgetProbe: false, explanationWorkflow: true, binding: 'native-v2' as const },
  { budgetProbe: true, explanationWorkflow: true, binding: 'native-v2' as const },
  { budgetProbe: false, explanationWorkflow: false, binding: 'native-v2' as const },
  { budgetProbe: false, explanationWorkflow: true, binding: 'native-v1' as const },
  { budgetProbe: false, explanationWorkflow: false, binding: 'native-v1' as const },
  { budgetProbe: false, explanationWorkflow: true, binding: 'native-v3' as const },
  { budgetProbe: true, explanationWorkflow: true, binding: 'native-v3' as const },
  { budgetProbe: false, explanationWorkflow: false, binding: 'native-v3' as const },
]) test(binding==='native-v3' ? `native-v3 ${budgetProbe?'bounded-call failure':explanationWorkflow?'explanation-before-authoring':'authoring-only'} preserves activation and delivery` : binding==='native-v1' ? `native-v1 compatibility ${explanationWorkflow?'explanation-before-authoring':'authoring-only'} preserves activation and delivery` : budgetProbe
  ? 'six valid intermediate generations hit the probe call limit without a protocol rejection or artifact delivery'
  : explanationWorkflow ? 'corrected explanation completes actual visualize save, authorized readback and delivery'
    : 'authoring-only delivery activates without an explanation declaration and still verifies the saved result', {timeout:30000}, async()=>{
  await ensureSchemaOnce();await resetAllTables()
  const im=await installRecordingWukong()
  const {companyId,projectId,agentId}=await seedCompanyWithAgent()
  const userId='test-owner',channelId='issue560-delivery',members=[userId,agentId]
  await seedUserMembership(userId,companyId);await seedUserMembership('not-in-room',companyId,{role:'STUDENT',isAdmin:false})
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'not-in-room','STUDENT')",[projectId,companyId])
  await pool.query('UPDATE participants SET capabilities=$1 WHERE company_id=$2 AND id=$3',[JSON.stringify(DEFAULT_AGENT_CAPABILITIES),companyId,agentId])
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Synthetic workflow',$4::jsonb)",[channelId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[channelId,companyId,JSON.stringify({channelType:2,members})])
  const text=explanationWorkflow?'请解释并创建交互图。Q 与 K 计算得分。softmax 把得分变成权重。权重对 V 加权求和。':'创建一个展示注意力流程的交互图。'
  const explanation='Q 与 K 计算得分，softmax 得到权重，再对 V 加权求和。'
  const html='<div><label>查询位置 <input id="query" type="range" min="1" max="3" value="1"></label><output id="selected">1</output><p>Q × K → softmax → 加权 V</p></div><script>document.getElementById("query").addEventListener("input", e => { document.getElementById("selected").textContent = e.target.value; });</script>'
  let calls=0,runId='',handlerError:unknown
  const provider=createServer(async(request,response)=>{try{
    let raw='';for await(const chunk of request)raw+=chunk
    const input=JSON.parse(raw);calls++;assert.ok(calls<=(budgetProbe?6:binding==='native-v1'?(explanationWorkflow?6:5):4));const phase=binding==='native-v1'?calls-1:calls,refreshStage=binding==='native-v1'&&explanationWorkflow,authoringPhase=refreshStage?4:3,terminalPhase=refreshStage?5:4
    const exposed=input.tools.map((tool:{function:{name:string}})=>tool.function.name)
    const steps=(await pool.query("SELECT input->>'partId' AS id FROM lingxios.agent_steps WHERE work_id=$1 AND kind='runtime.answer_segment' ORDER BY step_seq",[runId])).rows
    const operation=phase===2?{kind:'replace',supersedes:[steps[0].id]}:{kind:'append',supersedes:[]}
    let answer=phase===1?'待修正的说明。':phase===2?explanation:'\n用查询位置滑块查看这三个步骤。',outcome:unknown=null
    const business:Array<{name:string;args:unknown}>=[]
    if(phase===(binding==='native-v1'?0:1)){const {name,version,hash}=skillIndex(visualizeSkill);business.push({name:'skills__activate',args:{name,version,hash,...(explanationWorkflow?{explanation:{explanationQuote:'请解释',authoringQuote:'创建交互图',factQuotes:['Q 与 K 计算得分。','softmax 把得分变成权重。','权重对 V 加权求和。']}}:{})}})}
    if(binding==='native-v1'&&phase===1)assert.equal(exposed.includes('visualize__save'),!explanationWorkflow,'activation with explanation keeps authoring hidden until public explanation publication')
    if(phase===2)assert.equal(exposed.includes('visualize__save'),!explanationWorkflow||binding==='native-v1')
    if(refreshStage&&phase===3){assert.equal(exposed.includes('visualize__save'),false,'replacing the prior explanation reopens its stage until a new current explanation is published');answer=explanation}
    if(phase>=authoringPhase)assert.ok(exposed.includes('visualize__save'))
    if(phase===authoringPhase&&!budgetProbe){business.push({name:'visualize__save',args:{name:'attention-flow',html}})}
    if(phase===terminalPhase&&!budgetProbe){const saved=(await pool.query('SELECT path FROM im_visualize_documents WHERE run_id=$1',[runId])).rows;assert.equal(saved.length,1);answer='\n::visualize'+JSON.stringify({path:saved[0].path});outcome={status:'satisfied',gaps:[]}}
    const mixedCalls=[{index:0,id:`answer-${calls}`,type:'function',function:{name:'public_answer',arguments:JSON.stringify({operation,answer,commentary:'',outcome})}},...business.map((item,index)=>({index:index+1,id:`business-${calls}-${index}`,type:'function',function:{name:item.name,arguments:JSON.stringify(item.args)}}))]
    const toolCalls=binding!=='native-v1'?mixedCalls:business.length?mixedCalls.slice(1).map((call,index)=>({...call,index})):mixedCalls.slice(0,1)
    response.writeHead(200,{'content-type':'text/event-stream'});response.end(`data: ${JSON.stringify({choices:[{delta:{tool_calls:toolCalls},finish_reason:'tool_calls'}],usage:{prompt_tokens:10,completion_tokens:20}})}\n\ndata: [DONE]\n\n`)
  }catch(error){handlerError??=error;response.writeHead(500);response.end('{}')}})
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve))
  let worker:ReturnType<typeof createWorker>|undefined
  try{
    const api=await lingxiOSControl(),policy=await syncConversationPolicy(api,companyId,channelId)
    const address=provider.address();assert.ok(address&&typeof address!=='string')
    worker=createWorker({modelBudget:{maxModelCalls:binding==='native-v1'?7:6},controlPlane:api,policy:new ProductRuntimePolicy(),model:{...runtimeModelConfiguration({id:'deepseek-ai/DeepSeek-V4.1-Flash',apiKey:'synthetic-only',baseUrl:'https://api.siliconflow.cn/v1'},90000),baseUrl:`http://127.0.0.1:${address.port}/v1`,publicAnswerTool:binding,capabilities:{parallelTools:binding!=='native-v1',jsonObjectWithTools:false}},worker:{id:'issue560-delivery',concurrency:1}})
    const run=(await api.conversations.ingest({tenantId:companyId,conversationId:channelId,policyVersion:policy.version,messageId:'question',version:1,author:{id:userId,kind:'human'},text,mentions:[agentId]},{mode:'execute',codeExecution:'disabled',deliveryMode:'auto',executionClass:'conversation'})).runs[0];assert.ok(run);runId=run.runId
    await bindProductRun(pool,run,channelId);await worker.runNext();assert.equal(handlerError,undefined)
    const deadline=AbortSignal.timeout(5000);let state=await api.readRunState(run)
    while(state?.delivery==='pending'){deadline.throwIfAborted();await delay(20);state=await api.readRunState(run)}
    const failures=(await pool.query("SELECT data->'modelDiagnostics' AS diagnostics,data->'budgetLimit' AS budget FROM lingxios.agent_run_events WHERE run_id=$1 AND kind IN ('model.failed','run.failed')",[runId])).rows
    const protocolRejected=failures.some(row=>row.diagnostics?.kind==='protocol')
    const budgetLimit=failures.find(row=>row.budget)?.budget
    if(budgetProbe){
      assert.equal(calls,6);assert.equal(state?.run.status,'failed')
      assert.equal(protocolRejected,false);assert.deepEqual(budgetLimit,{code:'budget_limit',dimension:'calls'})
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM im_visualize_documents WHERE run_id=$1',[runId])).rows[0].n,0)
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM lingxios.agent_skill_activations WHERE work_id=$1 AND resolution='delivered'",[runId])).rows[0].n,0)
      const verdict=issue560ProbeVerdict({saved:false,authorizedReadback:false,referenceDelivered:false,accepted:false,protocolRejected,calls,probeCallLimit:6,budgetLimit})
      assert.equal(verdict,'inconclusive_probe_call_limit')
      assert.equal(issue560ProbeVerdict({saved:false,authorizedReadback:false,referenceDelivered:false,accepted:false,protocolRejected,calls,probeCallLimit:6}),'incomplete_unclassified','missing historical terminal metadata is not proof of a budget stop')
      assert.equal(issue560ProbeVerdict({saved:false,authorizedReadback:false,referenceDelivered:false,accepted:false,protocolRejected:true,calls,probeCallLimit:6,budgetLimit}),'protocol_rejected','an earlier protocol rejection cannot be hidden by a later budget stop')
      console.info(JSON.stringify({qualification:'synthetic-model-probe-classification',verdict,calls,protocolRejected,budgetLimit,saved:0,artifactDelivered:false}))
      return
    }
    assert.equal(state?.run.status,'succeeded');assert.equal(state?.delivery,'delivered');assert.equal(calls,binding==='native-v1'?(explanationWorkflow?6:5):4)
    const docs=(await pool.query('SELECT path FROM im_visualize_documents WHERE run_id=$1',[runId])).rows;assert.equal(docs.length,1)
    const saved=await readAuthorizedVisualizeSnapshot({companyId,channelId,userId,path:docs[0].path})
    assert.equal(saved.html,html);assert.equal(saved.version,1);assert.equal(saved.run_id,runId)
    assert.equal(saved.source_hash,createHash('sha256').update(html).digest('hex'))
    await assert.rejects(readAuthorizedVisualizeSnapshot({companyId,channelId,userId:'not-in-room',path:saved.path}),error=>error instanceof ForbiddenError&&error.reason==='RESOURCE_MEMBERSHIP_REQUIRED'&&error.status===404)
    assert.equal((await pool.query('SELECT resolution FROM lingxios.agent_skill_activations WHERE work_id=$1',[runId])).rows[0].resolution,'delivered')
    assert.ok(state?.message?.body.includes(explanation));assert.ok(!state?.message?.body.includes('待修正'))
    assert.ok(im.messages.some(message=>message.channelId===channelId&&nativeText(message.payload).includes(saved.path)))
    assert.equal(issue560ProbeVerdict({saved:true,authorizedReadback:true,referenceDelivered:true,accepted:true,protocolRejected,calls,probeCallLimit:6,budgetLimit}),'delivered')
    assert.equal(issue560ProbeVerdict({saved:true,authorizedReadback:true,referenceDelivered:true,accepted:true,protocolRejected:true,calls,probeCallLimit:6}),'delivered','a recovered protocol rejection does not invalidate verified final delivery')
    console.info(JSON.stringify({qualification:'synthetic-model-real-product-delivery',calls,saved:1,authorizedReadback:true,unauthorizedReadRejected:true,sourceHash:saved.source_hash,version:saved.version,delivery:state?.delivery,browserValidation:false}))
  }finally{await worker?.stop();await stopLingxiOSControl();await im.close();await new Promise<void>(resolve=>provider.close(()=>resolve()))}
})
