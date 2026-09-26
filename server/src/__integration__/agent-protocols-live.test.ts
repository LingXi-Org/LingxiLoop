import type { RunStreamEvent } from '@lyyzka/lingxios/ui'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { writeFile } from 'node:fs/promises'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { assistantTextViolation } from '../agent-runtime/assistant-text.js'
import { pool } from '../db/pool.js'
import { DEFAULT_AGENT_CAPABILITIES } from '../../../src/lib/agentCapabilities.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Explicit opt-in: synthetic fixtures, isolated test DB, real metered provider calls.
test('live provider delivers full learning help and native cards with measured first text and total time', {skip:process.env.LINGXIOS_LIVE_PROTOCOL !== '1',timeout:1200000}, async ()=>{
  await ensureSchemaOnce(); await resetAllTables()
  const im=await installRecordingWukong()
  let worker:Awaited<ReturnType<typeof startLingxiOSWorker>>|undefined
  try {
    const {companyId,projectId,agentId}=await seedCompanyWithAgent()
    await seedUserMembership('test-owner',companyId)
    await pool.query('UPDATE participants SET capabilities=$1 WHERE company_id=$2 AND id=$3',[JSON.stringify(DEFAULT_AGENT_CAPABILITIES),companyId,agentId])
    process.env.LINGXIOS_SERVICE_TOKEN='live-protocol-local-test-service-token'
    process.env.AGENT_OS_WORKER_PORT='52994'
    process.env.AGENT_OS_MAX_MODEL_CALLS='12'
    process.env.AGENT_OS_MAX_WORK_MS='240000'
    const api=await lingxiOSControl()
    const port=await api.listenControlPlane({serviceToken:process.env.LINGXIOS_SERVICE_TOKEN,port:0})
    process.env.LINGXIOS_CONTROL_URL=`http://127.0.0.1:${port}`
    worker=await startLingxiOSWorker()
    const cases=[
      {id:'greenhouse',text:'我通过课设了解到一些嵌入式监测设备和手机的通信是 Wi-Fi，这样在农业大棚里有环境数据异常手机端可以收到警告。我正在认真理解智慧农业网络，请帮助我把 Wi-Fi、LoRa、TCP/IP 的关系和告警过程完整串起来。',terms:[/Wi[-‑\s]?Fi/i,/LoRa/i,/TCP/i,/IP/i,/网关|路由器/]},
      {id:'concept',text:'TCP 可靠传输是不是就意味着数据安全？结合传感器上传温度解释可靠性和保密性的区别，并说明手机和传感器在同一局域网时是否必须经过互联网。',terms:[/可靠/,/加密|保密/,/局域网/]},
      {id:'derivation',text:'请详细推导一个一阶 RC 低通滤波器的截止频率，解释每个变量和推导步骤，并用 R=1kΩ、C=1μF 算一个结果。我刚开始学电路。',terms:[/159/,/阻抗|微分|传递函数/,/截止/]},
      {id:'course',text:'请按我这门课的讲义解释大棚告警系统的网络分层，先检查可用课程资料；没有资料时请明确说明，再给出通用解释。',terms:[/资料|讲义/,/没有|未|无法|暂/]},
      {id:'practice',text:'请把“大棚温度超过 35℃ 持续 2 分钟才告警”的实践检查清单保存成 greenhouse.md 文件，再用建议卡给我一个可以选择的下一步学习建议。',terms:[/35|温度/]},
      {id:'brief',text:'只用一句话回答：Wi-Fi 是否等于互联网？',terms:[/不/]},
    ]
    const failures:string[]=[]
    for(const scenario of cases.filter(item=> !process.env.LINGXIOS_LIVE_CASES || process.env.LINGXIOS_LIVE_CASES.split(',').includes(item.id))){
      const conversationId='live-'+scenario.id,members=['test-owner',agentId]
      await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Live protocol regression',$4::jsonb)`,[conversationId,companyId,projectId,JSON.stringify(members)])
      await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[conversationId,companyId,JSON.stringify({channelType:2,members})])
      const policy=await syncConversationPolicy(api,companyId,conversationId),started=Date.now()
      const result=await api.conversations.ingest({tenantId:companyId,conversationId,policyVersion:policy.version,messageId:'question',version:1,author:{id:'test-owner',kind:'human'},text:scenario.text,mentions:[agentId]}, {mode:'execute',deliveryMode:'auto',executionClass:'operation',codeExecution:'disabled'})
      const run=result.runs[0];assert.ok(run);await bindProductRun(pool,run,conversationId)
      const cancel=new AbortController(),timeout=AbortSignal.timeout(250000)
      const stream=await api.streamRun(run,{signal:AbortSignal.any([cancel.signal,timeout])})
      let firstTextMs:number|null=null, pending='', streamValid=true, invalidPreview:string|undefined
      const attempts=new Map<string,{seq:number;draft:string}>()
      const validBody=(text:string)=>assistantTextViolation(text)===null && !/我的角色是|让我组织|让我先理清|用户在学习|Let me (?:think|structure|write|craft)|The user (?:is asking|wants)|最终(?:中文)?回复如下|我现在输出最终/.test(text)
      const reading=(async()=>{for await(const chunk of stream.body!.pipeThrough(new TextDecoderStream())) {
        pending+=chunk;if(pending.length>2_000_000)throw new Error('live preview exceeded bound')
        let end:number
        while((end=pending.indexOf('\n\n'))>=0){
          const frame=pending.slice(0,end);pending=pending.slice(end+2)
          const data=frame.split('\n').find(line=>line.startsWith('data: '));if(!data)continue
          const item=JSON.parse(data.slice(6)) as RunStreamEvent;if(item.type!=='preview')continue
          const preview=item.preview, before=attempts.get(preview.attemptId)??{seq:0,draft:''}
          if(preview.seq<=before.seq)continue
          if(preview.kind==='delta')assert.equal(preview.fromSeq,before.seq,'preview gap')
          const draft=preview.kind==='snapshot'?preview.draft:before.draft+preview.delta
          attempts.set(preview.attemptId,{seq:preview.seq,draft})
          if(draft.trim()){
            firstTextMs??=Date.now()-started
            if(!validBody(draft)){streamValid=false;invalidPreview??=draft}
          }
        }
      }})().catch(error=>{if(!cancel.signal.aborted)throw error})
      let state=await api.readRunState(run)
      try{
        while(state && (['queued','leased','waiting'].includes(state.run.status) || state.delivery==='pending')){timeout.throwIfAborted();await delay(100);state=await api.readRunState(run)}
      }finally{cancel.abort();await reading}
      if(!streamValid && process.env.LINGXIOS_LIVE_CAPTURE==='1')await writeFile(`.codex-tmp/live-preview-${scenario.id}.json`,JSON.stringify({invalidPreview,attempts:[...attempts.values()]},null,2))
      const deliveredMessages=im.messages.filter(message=>message.channelId===conversationId)
      const firstMessage=deliveredMessages.find(message=>message.payload.body?.trim())
      if(firstMessage)firstTextMs=Math.min(firstTextMs??Infinity,Math.max(0,firstMessage.timestamp*1000-started))
      const body=deliveredMessages.map(message=>message.payload.body??'').join('\n')
      const calls=await pool.query("SELECT count(*)::int AS n,coalesce(sum((extras->>'reasoningTokens')::bigint),0)::int AS reasoning_tokens FROM llm_calls WHERE company_id=$1 AND run_id=$2",[companyId,run.runId])
      const actions:string[]=[]
      let cursor=0
      for(let page=0;page<100;page++){
        const events=await api.readEvents(run,cursor)
        for(const event of events.events) if(event.kind==='tool.started' && typeof event.data.name==='string')actions.push(event.data.name)
        if(events.events.length<100)break
        cursor=events.nextSeq
      }
      const outcome=state?.run.goalOutcome
      // Missing course sources remain an honest partial outcome; malformed reviews never pass.
      const gaps=outcome?.gaps??[]
      const expectedPartial=scenario.id==='course' && outcome?.status==='partial' && gaps.length>0
        && gaps.every(gap=>/讲义|course|资料/i.test(gap) && !/unavailable or returned invalid findings|exceeds the model context budget/i.test(gap))
      const checks={streamValid,nonthinking:calls.rows[0].reasoning_tokens===0,delivered:state?.delivery==='delivered',accepted:outcome?.status==='satisfied'||expectedPartial,bodyValid:validBody(body),coverage:scenario.terms.every(term=>term.test(body)),encoding:!body.includes('\\n\\n'),brief:scenario.id!=='brief'||body.length<180,cards:scenario.id!=='practice'||actions.includes('chat.recommend')&&actions.includes('files.create'),course:scenario.id!=='course'||actions.some(action=>action.startsWith('knowledge.'))}
      console.info(JSON.stringify({scenario:scenario.id,firstTextMs,totalMs:Date.now()-started,calls:calls.rows[0].n,characters:body.length,actions,checks,status:state?.run.status}))
      if(Object.values(checks).some(value=>!value))failures.push(scenario.id)
    }
    assert.deepEqual(failures,[],'real provider regressions must not be reported as passed')
  }finally{await worker?.stop();await teardownAll();await im.close()}
})
