import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions } from '@lingxi-org/lingxios'
import { createWorker } from '@lingxi-org/lingxios/worker'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { nativeText } from '../im/message-types.js'
import { lingxiOSControl, runtimeModelConfiguration } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { checkArtifact } from '../modules/artifacts/check.js'
import { checkArtifactDocument } from '../../../shared/artifact-check.js'
import type { ArtifactDocument, ArtifactPage } from '../../../shared/artifact-document.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

const live = process.env.LINGXIOS_LIVE_SLIDES === '1'
const strategy = process.env.SLIDES_SAVE_STRATEGY ?? 'incremental'
assert.ok(['incremental','whole'].includes(strategy))
const content = '请制作一份可编辑的6页Slides演示文稿，主题是“TCP怎样可靠传输数据”。对象是计算机专业一年级学生。6页依次讲：1目标与不保证的边界；2序号与字节流；3确认与累计确认；4超时重传和重复确认；5滑动窗口与流量控制；6完整传输小例子与总结。每页一个明确标题、2到3条简洁要点，可用一个简单图示帮助理解；不要封面凑页数，不用外部图片或视频，不需要网络检索。采用内置默认设计风格。必须保存实际页面并运行Slides格式检查，最后如实告诉我保存和检查结果。'
const policy = strategy === 'incremental'
  ? '保存策略：先读取 native-model.md、read_document 和需要修改的 read_page，用带版本校验的 apply_ops 填充初始空白页；之后每批最多新增2页，pageOrder 只包含已完成页面，最终正好6页。保留已保存内容，不要整稿重写。'
  : '保存策略：先读取 native-model.md、read_document 和初始页的 read_page，准备完整6页的原生节点，再在同一次 apply_ops 中填充初始页并创建另外5页，最终 pageOrder 正好6页。保留默认主题及观察到的目标版本。'
after(async()=>{await teardownAll()})

test(`real-provider Slides ${strategy} generation and measured native delivery`,{skip:!live,timeout:540_000},async()=>{
  assert.equal(env.OPENAI_MODEL,'deepseek-ai/DeepSeek-V4.1-Flash')
  assert.equal(new URL(env.OPENAI_BASE_URL).hostname,'api.siliconflow.cn')
  assert.equal(releaseVersions.runtime,'4.0.0')
  const directory=process.env.SLIDES_EVIDENCE_PATH
  assert.ok(directory,'explicit evidence path required')
  await mkdir(directory,{recursive:true})
  await ensureSchemaOnce();await resetAllTables()
  const im=await installRecordingWukong()
  const {companyId,projectId,agentId}=await seedCompanyWithAgent()
  const userId='test-owner',channelId='slides-live-pilot',members=[userId,agentId]
  await seedUserMembership(userId,companyId)
  await pool.query('UPDATE participants SET capabilities=$1 WHERE company_id=$2 AND id=$3',[JSON.stringify(['slides','design']),companyId,agentId])
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Slides generation pilot',$4::jsonb)",[channelId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[channelId,companyId,JSON.stringify({channelType:2,members})])
  const api=await lingxiOSControl(),conversationPolicy=await syncConversationPolicy(api,companyId,channelId)
  const model=runtimeModelConfiguration({id:env.OPENAI_MODEL,apiKey:env.OPENAI_API_KEY,baseUrl:env.OPENAI_BASE_URL},180_000)
  const worker=createWorker({controlPlane:api,policy:new ProductRuntimePolicy(),model,
    modelBudget:{maxModelCalls:32,maxTokens:2_000_000,wallClockMs:480_000},worker:{id:'slides-generation-pilot',concurrency:1}})
  const request=content+'\n'+policy
  let runError=false
  try{
    const accepted=await api.conversations.ingest({tenantId:companyId,conversationId:channelId,policyVersion:conversationPolicy.version,
      messageId:'question',version:1,author:{id:userId,kind:'human'},text:request,mentions:[agentId]},
    {mode:'execute',codeExecution:'disabled',deliveryMode:'auto',executionClass:'conversation'})
    const run=accepted.runs[0];assert.ok(run);await bindProductRun(pool,run,channelId)
    try{assert.equal(await worker.runNext(),true)}catch{runError=true}
    const deadline=AbortSignal.timeout(5_000)
    let state=await api.readRunState(run)
    while(state?.delivery==='pending'){deadline.throwIfAborted();await delay(20);state=await api.readRunState(run)}
    const work=(await pool.query('SELECT created_at,started_at,finished_at,status,goal_outcome FROM lingxios.agent_work_items WHERE id=$1',[run.runId])).rows[0]
    const start=new Date(work.created_at).getTime()
    const elapsed=(date:unknown)=>date?(date instanceof Date?date.getTime():new Date(String(date)).getTime())-start:null
    const budget=(await pool.query('SELECT max_model_calls,max_tokens,model_calls,tokens,max_execution_ms FROM lingxios.agent_model_budgets WHERE root_work_id=$1',[run.runId])).rows
    const budgetCalls=(await pool.query('SELECT * FROM lingxios.agent_model_budget_calls WHERE work_id=$1',[run.runId])).rows
    const receipts=(await pool.query(`SELECT i.intent->'action'->>'action' AS action,i.intent->'action'->'args' AS args,r.result,i.recorded_at
      FROM lingxios.agent_action_intents i LEFT JOIN lingxios.agent_action_ledger r USING(idempotency_key)
      WHERE i.intent->>'workId'=$1 ORDER BY i.recorded_at,i.idempotency_key`,[run.runId])).rows
    const events=(await pool.query('SELECT kind,stage,data,recorded_at FROM lingxios.agent_run_events WHERE run_id=$1 ORDER BY seq',[run.runId])).rows
    const calls=(await pool.query('SELECT model,input_tokens,cached_input_tokens,output_tokens,latency_ms,status,extras FROM llm_calls WHERE run_id=$1 ORDER BY created_at,id',[run.runId])).rows
    const deck=(await pool.query("SELECT id FROM artifacts WHERE company_id=$1 AND conversation_id=$2 AND kind='slides' ORDER BY created_at",[companyId,channelId])).rows[0]
    const files=deck?(await pool.query('SELECT path,body,sha256 FROM artifact_files WHERE artifact_id=$1 ORDER BY path',[deck.id])).rows:[]
    const revisions=deck?(await pool.query('SELECT seq,files,created_at FROM artifact_revisions WHERE artifact_id=$1 ORDER BY seq',[deck.id])).rows:[]
    const versions=deck?(await pool.query('SELECT sha256,body FROM artifact_file_versions WHERE artifact_id=$1',[deck.id])).rows:[]
    const bodies=new Map<string,Buffer>(versions.map(row=>[row.sha256,row.body]))
    let firstSaved: {elapsedMs:number|null;revisionTimestampMs:number|null;seq:string;pages:number}|null=null
    for(const revision of revisions){
      try{
        const text=bodies.get(revision.files['project/document.json']?.sha256)?.toString('utf8')
        const manifest=JSON.parse(text??'{}') as Omit<ArtifactDocument,'pages'> & {pageFiles?:Record<string,string>}
        if(!Array.isArray(manifest.pageOrder)||manifest.pageOrder.length===0||!manifest.pageFiles)continue
        const {pageFiles,...metadata}=manifest
        const pages:Record<string,ArtifactPage>={}
        for(const id of manifest.pageOrder){
          const bytes=bodies.get(pageFiles[id]??'')
          if(bytes)pages[id]=JSON.parse(bytes.toString('utf8')) as ArtifactPage
        }
        const report=checkArtifactDocument({...metadata,pages})
        if(report.problems===0&&report.checkedPageIds.length===manifest.pageOrder.length){
          firstSaved={elapsedMs:null,revisionTimestampMs:elapsed(revision.created_at),seq:String(revision.seq),pages:manifest.pageOrder.length};break
        }
      }catch{ /* Blank or incomplete native snapshots are not editable-page readiness. */ }
    }
    if(firstSaved){
      const completed=events.find(row=>row.kind==='tool.completed'&&row.data.result?.status==='completed'
        &&row.data.result.value?.artifactId===deck?.id&&String(row.data.result.value?.result?.seq)===firstSaved!.seq)
      firstSaved.elapsedMs=elapsed(completed?.recorded_at)
    }
    let checked: {problems?:number;checkedPageIds?:string[]}|null=null
    if(deck)try{checked=await checkArtifact(pool,{id:deck.id,kind:'slides'}) as {problems:number;checkedPageIds?:string[]}}catch{checked=null}
    let order: string[]=[]
    try{order=JSON.parse(files.find(row=>row.path==='project/document.json')?.body.toString('utf8')??'{}').pageOrder??[]}catch{}
    const failures=receipts.filter(row=>!row.result?.ok||row.result.executionState==='unknown'||row.result.approval)
    const answerEvent=events.find(row=>row.kind==='public.text.delta'&&row.data.purpose==='answer'&&typeof row.data.text==='string'&&row.data.text.trim())
    const operationEvent=events.find(row=>row.kind==='public.text.operation'&&row.data.purpose==='answer')
    const assistantText=im.messages.filter(message=>message.payload.role==='assistant').map(message=>nativeText(message.payload)).filter(Boolean)
    const evidence={sampleId:process.env.SLIDES_SAMPLE_ID??'pilot',strategy,runtime:releaseVersions.runtime,model:env.OPENAI_MODEL,
      provider:new URL(env.OPENAI_BASE_URL).hostname,binding:model.publicAnswerTool,maxOutputTokens:model.maxOutputTokens,
      budget,canonicalModelCalls:budgetCalls.length,modelLedgerComplete:calls.length===budgetCalls.length,
      requestSha256:createHash('sha256').update(request).digest('hex'),contentRequest:content,savePolicy:policy,
      measurement:'first saved revision matched to post-write tool.completed event; not browser first paint',createdAt:work.created_at,
      queueMs:elapsed(work.started_at),firstSaved,firstAnswerOperationMs:elapsed(operationEvent?.recorded_at),firstAnswerDeltaMs:elapsed(answerEvent?.recorded_at),
      finalMs:elapsed(work.finished_at),runStatus:work.status,outcome:state?.run.goalOutcome??work.goal_outcome,delivery:state?.delivery,
      modelCalls:calls.length,correctionCalls:calls.filter(row=>row.extras.operation==='correction').length,
      inputTokens:calls.reduce((sum,row)=>sum+row.input_tokens,0),cachedInputTokens:calls.reduce((sum,row)=>sum+row.cached_input_tokens,0),
      outputTokens:calls.reduce((sum,row)=>sum+row.output_tokens,0),summedModelLatencyMs:calls.reduce((sum,row)=>sum+row.latency_ms,0),
      calls:calls.map(row=>({model:row.model,inputTokens:row.input_tokens,cachedInputTokens:row.cached_input_tokens,outputTokens:row.output_tokens,latencyMs:row.latency_ms,status:row.status,operation:row.extras.operation??null,firstContentMs:row.extras.firstContentMs??null,
        failure:row.extras.failure?{category:row.extras.failure.category,retryable:row.extras.failure.retryable,status:row.extras.failure.status??null}:null})),
      actions:receipts.map(row=>({action:row.action,ok:row.result?.ok??false,code:row.result?.code??null,elapsedMs:elapsed(row.recorded_at),
        ...(row.action==='slides.apply_ops'?{operationId:row.args.operationId,operationCount:row.args.operations?.length??0,changedPages:[...new Set((row.args.operations??[]).map((operation:{pageId?:string;page?:{id:string}})=>operation.pageId??operation.page?.id).filter(Boolean))].length}: {})})),
      failures:failures.map(row=>({action:row.action,code:row.result?.code??null,executionState:row.result?.executionState??null,diagnostics:row.result?.diagnostics??null,
        ...(row.action==='slides.apply_ops'?{operationId:row.args.operationId,operationCount:row.args.operations?.length??0}: {})})),
      formatProblems:checked?.problems??null,pageCount:order.length,files:files.map(row=>({path:row.path,sha256:row.sha256})),
      assistantText,runError,browserValidated:false,productionRequestCovered:false,
      accepted:!runError&&failures.length===0&&work.status==='succeeded'&&state?.run.goalOutcome?.status==='satisfied'
        &&state?.delivery==='delivered'&&order.length===6&&checked?.problems===0&&checked.checkedPageIds?.length===6
        &&receipts.some(row=>row.action==='slides.read_document')&&receipts.some(row=>row.action==='slides.read_page')
        &&receipts.some(row=>row.action==='slides.apply_ops')}
    await writeFile(`${directory}/result.json`,JSON.stringify(evidence,null,2)+'\n')
    for(const file of files)await writeFile(`${directory}/${file.path.replaceAll('/','-')}`,file.body)
    await writeFile(`${directory}/revisions.json`,JSON.stringify(revisions.map(row=>({seq:row.seq,elapsedMs:elapsed(row.created_at),fileCount:Object.keys(row.files).length})),null,2)+'\n')
    console.info(JSON.stringify({sample:evidence.sampleId,strategy,accepted:evidence.accepted,firstSaved,finalMs:evidence.finalMs,calls:evidence.modelCalls,pageCount:evidence.pageCount,formatProblems:evidence.formatProblems}))
    assert.equal(evidence.accepted,true,'live result failed acceptance; see retained result.json')
  }finally{await worker.stop();await im.close()}
})
