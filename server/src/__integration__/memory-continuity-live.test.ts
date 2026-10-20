import assert from 'node:assert/strict'
import {test} from 'node:test'
import {setTimeout as delay} from 'node:timers/promises'
import {mkdir,writeFile} from 'node:fs/promises'
import {createWorker} from '@lyyzka/lingxios/worker'
import {pool} from '../db/pool.js'
import {env} from '../env.js'
import {lingxiOSControl,runtimeModelConfiguration} from '../agent-runtime/runtime.js'
import {ProductRuntimePolicy} from '../agent-runtime/context.js'
import {bindProductRun} from '../agent-runtime/identity.js'
import {syncConversationPolicy} from '../agent-runtime/conversations.js'
import {ensureSchemaOnce,resetAllTables,seedCompanyWithAgent,seedUserMembership,teardownAll} from './_helpers.js'
import {installRecordingWukong} from './_recording-wukong.js'

// Real provider acceptance: transactional explicit tool save, first new-room input,
// native semantic index and proactive recall, segmented automatic synthesis, and
// current-version/forget behavior. The observer forwards every request unchanged.
test('live native memory saves, recalls semantically and extracts long-source tails across rooms',{
  skip:process.env.LINGXIOS_LIVE_CONTINUITY!=='1',timeout:600000,
},async()=>{
  assert.ok(['/lingxiloop_memory_continuity_model_test','/lingxiloop_memory_continuity_qualification_test','/lingxiloop_memory_continuity_candidate_test','/lingxiloop_memory_continuity_final_test','/lingxiloop_memory_continuity_scoped_test','/lingxiloop_memory_continuity_combined358_test'].includes(new URL(env.DATABASE_URL).pathname))
  await ensureSchemaOnce();await resetAllTables()
  const recording=await installRecordingWukong(),originalFetch=globalThis.fetch
  let worker:ReturnType<typeof createWorker>|undefined,phase='save',completed=false
  const operations:Array<{phase:string;operation:string;startedAt:string;elapsedMs:number;error?:string}>=[]
  const operationStats:Record<string,{count:number;totalMs:number;maxMs:number;errors:number}>={}
  const slowOperations:typeof operations=[]
  const waits:Array<{phase:string;waiting:number;blocked:number;categories:string[]}>=[]
  async function measured<T>(operation:string,call:()=>Promise<T>):Promise<T>{
    const started=performance.now(),entry={phase,operation,startedAt:new Date().toISOString(),elapsedMs:0} as typeof operations[number]
    try{return await call()}catch(error){entry.error=error instanceof Error && ['Error','AssertionError','AbortError','TimeoutError'].includes(error.name)?error.name:'OtherError';throw error}
    finally{entry.elapsedMs=Math.round(performance.now()-started);operations.push(entry);if(operations.length>512)operations.shift()
      const stats=operationStats[operation]??={count:0,totalMs:0,maxMs:0,errors:0};stats.count++;stats.totalMs+=entry.elapsedMs;stats.maxMs=Math.max(stats.maxMs,entry.elapsedMs);stats.errors+=entry.error?1:0
      if((entry.elapsedMs>=500||entry.error)&&slowOperations.length<128)slowOperations.push(entry)
    }
  }
  const next=()=>measured('worker.runNext',()=>worker!.runNext())
  let sampling=false
  const waitTimer=setInterval(()=>{
    if(sampling)return;sampling=true
    void pool.query<{waiting:number;blocked:number;categories:string[]}>(`SELECT COUNT(*)::int AS waiting,
      COUNT(*) FILTER(WHERE cardinality(pg_blocking_pids(pid))>0)::int AS blocked,
      array_agg(DISTINCT wait_event_type) AS categories FROM pg_stat_activity
      WHERE datname=current_database() AND state='active' AND wait_event_type IS NOT NULL AND pid<>pg_backend_pid()`)
      .then(result=>{const row=result.rows[0];if(row?.waiting && waits.length<256)waits.push({phase,...row})})
      .catch(()=>{}).finally(()=>{sampling=false})
  },500)
  waitTimer.unref()
  const observed:Array<{phase:string;kind:string;status:number;elapsedMs:number;core:boolean;middle:boolean;tail:boolean;automaticMiddle:boolean;automaticTail:boolean}>=[]
  const core='先给三个要点，再给待办事项',middle='我习惯用思维导图梳理复杂概念',tail='我的长期目标是在十二月完成概率论研究报告'
  globalThis.fetch=async(...args)=>{
    const target=String(args[0] instanceof Request ? args[0].url : args[0])
    if(!target.startsWith(env.OPENAI_BASE_URL)) return originalFetch(...args)
    const start=Date.now(),body=String(args[1]?.body ?? ''),currentPhase=phase
    const response=await originalFetch(...args)
    observed.push({phase:currentPhase,kind:target.includes('/embeddings')?'embedding':'chat',status:response.status,
      elapsedMs:Date.now()-start,core:/三个要点/.test(body)&&/待办/.test(body),middle:body.includes(middle),tail:body.includes(tail),automaticMiddle:/周六|星期六/.test(body),automaticTail:body.includes('星河')})
    return response
  }
  try {
    const {companyId,projectId,agentId}=await seedCompanyWithAgent()
    await seedUserMembership('test-owner',companyId)
    const app=await measured('control.initialize',()=>lingxiOSControl()),nativeMemory=app.memory!
    const memory=new Proxy(nativeMemory,{get(target,key,receiver){const value=Reflect.get(target,key,receiver)
      return typeof value==='function'? (...args:unknown[])=>measured('memory.'+String(key),async()=>Reflect.apply(value,target,args)):value
    }})
    worker=createWorker({controlPlane:app,policy:new ProductRuntimePolicy(),worker:{id:'continuity-live'},
      model:runtimeModelConfiguration({id:env.OPENAI_MODEL,apiKey:env.OPENAI_API_KEY,baseUrl:env.OPENAI_BASE_URL},90000)})
    let serial=0
    async function turn(room:string,text:string,revision?:string){
      const members=['test-owner',agentId]
      await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
        VALUES($1,$2,$3,'group','Continuity qualification',$4::jsonb) ON CONFLICT(id) DO NOTHING`,[room,companyId,projectId,JSON.stringify(members)])
      await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb) ON CONFLICT(channel_id) DO NOTHING`,
        [room,companyId,JSON.stringify({channelType:2,members})])
      const policy=await syncConversationPolicy(app,companyId,room)
      const accepted=await app.conversations.ingest({tenantId:companyId,conversationId:room,policyVersion:policy.version,
        messageId:`continuity-live-${++serial}`,version:1,author:{id:'test-owner',kind:'human'},text,mentions:[agentId]},
        {mode:'execute',executionClass:'conversation',codeExecution:'disabled'})
      const run=accepted.runs[0];assert.ok(run);await bindProductRun(pool,run,room)
      if(revision) await app.revise(run,revision)
      assert.equal(await next(),true)
      const message=await app.readMessage(run)
      if(!message){
        const state=(await pool.query('SELECT status,terminal_reason FROM lingxios.agent_work_items WHERE id=$1',[run.runId])).rows[0]
        assert.fail(`live turn did not commit: ${JSON.stringify(state)}`)
      }
      return {run,message,identity:{...run,workId:run.runId,principalId:'test-owner'}}
    }
    const filler='这是测试课程材料，包含练习过程与普通说明，不表示已经掌握知识。'.repeat(170)
    const saved=await turn('live-continuity-a',`请明确保存我的个人长期偏好，之后换新对话也能使用。核心偏好：${core}。\n${filler}\n个人详细偏好：${middle}。\n${filler}\n个人详细目标：${tail}。请保存两份档案：核心短档案只放表达格式；思维导图习惯和概率论目标独立放入详细资料，不放核心。确认已提交后简短回复。`)
    assert.ok((await app.readEvents(saved.run,0)).events.some(event=>event.kind==='tool.started' && event.data.name==='memory.apply'))
    const personal=(await memory.scopes(saved.identity)).find(scope=>scope.scopeType==='learner');assert.ok(personal)
    const documents=async()=>Promise.all((await memory.list(saved.identity,personal)).items.map(item=>memory.read(saved.identity,personal,item.id)))
    let docs=await documents(),bodies=docs.map(doc=>doc?.body).join('\n')
    assert.ok(/三个要点/.test(bodies),'core preference committed');assert.ok(/思维导图/.test(bodies),'middle preference committed');assert.ok(/概率论/.test(bodies),'tail goal committed')
    const initialCount=docs.length
    // The next private room must work immediately, before waiting for any indexing.
    phase='immediate'
    const immediate=await turn('live-continuity-b','按我的长期表达格式，用最短篇幅给出一份通用学习安排。无需询问缺少的课程细节，直接给出可采用的安排。')
    assert.ok(/待办/.test(immediate.message.body),'new-room answer follows the saved format')
    assert.ok(observed.some(item=>item.phase==='immediate' && item.kind==='chat' && item.core),'actual provider input includes committed core')
    phase='index'
    let jobs=0
    while(await next()){assert.ok(++jobs<=32,'bounded index work')}
    const indexed=(await pool.query(`SELECT COUNT(*)::int AS count,MIN(cardinality(e.embedding))::int AS dimensions,COUNT(DISTINCT e.model_key)::int AS spaces
      FROM lingxios.agent_memory_embeddings e JOIN lingxios.agent_memories m ON m.tenant_id=e.tenant_id AND m.id=e.memory_id AND m.version=e.version
      WHERE m.tenant_id=$1 AND m.scope_type=$2 AND m.scope_id=$3`,[companyId,personal.scopeType,personal.scopeId])).rows[0]
    assert.ok(indexed.count>=initialCount);assert.equal(indexed.dimensions,1024);assert.equal(indexed.spaces,1)
    phase='semantic'
    const semantic=await turn('live-continuity-c','我平时把彼此相连的知识节点画成什么形式，以便看清它们之间的关系？按我的已有习惯回答，一句话即可，不要搜索历史对话。')
    assert.ok(/思维导图|导图/.test(semantic.message.body),'nonlexical question recalls the correct presentation preference')
    // The public event projection intentionally strips internal diagnostics.
    // Inspect only the native sanitized diagnostic, never stored prompts/bodies.
    const snapshot=(await pool.query(`SELECT data->'memorySnapshot' AS summary FROM lingxios.agent_run_events
      WHERE run_id=$1 AND kind='model.started' AND data ? 'memorySnapshot' ORDER BY seq LIMIT 1`,[semantic.run.runId])).rows[0]?.summary as
      {retrieval:string[];counts:{recalled:number};diagnostics:{indices:Array<{dimensions:number;matchedCurrent:number}>}}
    assert.ok(snapshot?.retrieval?.includes('hybrid'),'actual automatic context uses current semantic vectors')
    assert.ok(snapshot.diagnostics.indices.some((item:{dimensions:number;matchedCurrent:number})=>item.dimensions===1024 && item.matchedCurrent>0))
    assert.ok(snapshot.counts.recalled>0,'related reference memory is actively injected')
    phase='capture'
    const autoMiddle='我每周六上午在图书馆做统计实验',autoTail='我正在筹备名为星河的数学科普展'
    const source=await turn('live-continuity-d',`本轮只简短确认收到，不要主动调用记忆工具；材料留给后台整理。\n${filler}\n${autoMiddle}。\n${filler}\n我正在筹备名为海洋的数学科普展。`,
      `有效修订：${autoTail}。之前的海洋名称已作废。请仍只确认收到，不要在本轮调用记忆工具。`)
    const deadline=Date.now()+15000
    while(!(await pool.query('SELECT 1 FROM lingxios.agent_memory_evidence WHERE source_run_id=$1',[source.run.runId])).rowCount){assert.ok(Date.now()<deadline,'durable evidence capture');await delay(100)}
    phase='background'
    let pages=0
    const extractionDeadline=Date.now()+240000
    for(;;){
      assert.ok(Date.now()<extractionDeadline,'bounded extraction wall time')
      await memory.reflect(source.identity,personal)
      while(await next()){assert.ok(++pages<=32,'bounded extraction/index work')}
      const row: {status:string;segment_cursor:number;segments:number}|undefined=(await pool.query(`SELECT s.status,s.segment_cursor,(SELECT count(*)::int FROM lingxios.agent_memory_evidence_segments p WHERE p.source_run_id=s.source_run_id) AS segments
        FROM lingxios.agent_memory_evidence_scopes s WHERE s.source_run_id=$1 AND s.scope_type=$2 AND s.scope_id=$3`,[source.run.runId,personal.scopeType,personal.scopeId])).rows[0]
      assert.ok(row);if(row.status==='processed'){assert.equal(row.segment_cursor,row.segments);break}
      assert.equal(row.status,'pending','rejected extraction must fail acceptance')
      assert.ok(pages<32,'extraction progress must complete');await delay(100)
    }
    docs=await documents();bodies=docs.map(doc=>doc?.body).join('\n')
    assert.ok(/周六|星期六/.test(bodies),'background captures the middle fact');assert.ok(/星河/.test(bodies),'background captures the tail fact')
    assert.ok(docs.some(doc=>doc?.sources.some(ref=>ref.workId===source.run.runId && ref.synthesisWorkId)),'facts came from durable background synthesis')
    phase='background-new-room'
    const inherited=await turn('live-continuity-e','我正在筹备的数学科普活动现用名称是什么，通常哪天做统计实验？请直接根据已保存资料只回答现用名称和时间，不补充历史名称，不询问补充信息。')
    assert.ok(/星河/.test(inherited.message.body) && /周六|星期六/.test(inherited.message.body),'new room uses complete background evidence')
    assert.ok(observed.find(item=>item.phase==='background-new-room'&&item.kind==='chat')?.automaticMiddle && observed.find(item=>item.phase==='background-new-room'&&item.kind==='chat')?.automaticTail,'first new-room provider input contains committed background facts')
    assert.ok(!/海洋/.test(inherited.message.body),'effective revision replaces the obsolete name')
    const forgotten=docs.find(doc=>doc?.body.includes('星河'));assert.ok(forgotten)
    await memory.apply(source.identity,{scope:personal,changes:[{action:'delete',id:forgotten.id,expectedVersion:forgotten.version}],idempotencyKey:'live-forget-tail',sourceRef:'live-settings'})
    await memory.reindex(source.identity,personal)
    while(await next()){assert.ok(++pages<=48,'bounded post-forget index work')}
    assert.equal(await memory.read(source.identity,personal,forgotten.id),null)
    assert.ok(!(await memory.search(source.identity,personal,{query:'星河'})).items.some(item=>'excerpt' in item && item.excerpt.includes('星河')))
    assert.equal((await pool.query('SELECT 1 FROM lingxios.agent_memory_embeddings WHERE tenant_id=$1 AND memory_id=$2',[companyId,forgotten.id])).rowCount,0)
    const usage=(await pool.query(`SELECT count(*)::int AS calls,COALESCE(sum(cost_micros),0)::int AS "costMicros",
      COUNT(*) FILTER(WHERE observation->>'purpose'='embedding')::int AS "embeddingCalls",
      COUNT(*) FILTER(WHERE observation->'usage'->>'available'='true')::int AS measured
      FROM lingxios.agent_model_budget_calls c JOIN lingxios.agent_work_items w ON w.id=c.work_id WHERE w.tenant_id=$1`,[companyId])).rows[0]
    assert.ok(usage.embeddingCalls>0 && usage.measured>0 && usage.costMicros<1000000)
    completed=true
    await mkdir('artifacts/memory/continuity-live',{recursive:true})
    await writeFile('artifacts/memory/continuity-live/model-results.json',JSON.stringify({passed:true,model:env.OPENAI_MODEL,embeddingModel:env.OPENAI_EMBEDDING_MODEL,
      observed,initialCount,indexed,jobs,pages,usage,diagnostics:snapshot.diagnostics,checks:['explicit-middle-tail','immediate-new-room-input','hybrid-current-index','proactive-reference-injection','background-middle-tail','background-new-room-first-input','effective-revision','durable-cursor','forget-index'],
      reproduce:`${process.env.MEMORY_CONTINUITY_QUALIFICATION?`MEMORY_CONTINUITY_QUALIFICATION=${process.env.MEMORY_CONTINUITY_QUALIFICATION} `:''}OPENAI_EMBEDDING_MODEL=${env.OPENAI_EMBEDDING_MODEL} EVAL_CANDIDATE_MODEL=zai-org/GLM-5.2 EVAL_CANDIDATE_INPUT_CNY_PER_MILLION=8 EVAL_CANDIDATE_OUTPUT_CNY_PER_MILLION=28 lingxi-prod model-run node e2e/server/memory-regression.mjs --live-continuity`},null,2))
  } finally {
    clearInterval(waitTimer);globalThis.fetch=originalFetch
    await mkdir('artifacts/memory/continuity-live',{recursive:true})
    await writeFile('artifacts/memory/continuity-live/operation-diagnostics.json',JSON.stringify({completed,phase,operations,operationStats,slowOperations,waits,observed},null,2))
    await worker?.stop();await recording.close();await teardownAll()
  }
})
