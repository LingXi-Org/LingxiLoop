import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdir,writeFile} from 'node:fs/promises'
import {createWorker} from '@lyyzka/lingxios/worker'
import {pool} from '../db/pool.js'
import {lingxiOSControl,stopLingxiOSControl} from '../agent-runtime/runtime.js'
import {bindProductRun} from '../agent-runtime/identity.js'
import {syncConversationPolicy} from '../agent-runtime/conversations.js'
import {ensureSchemaOnce,resetAllTables,seedCompanyWithAgent,seedUserMembership,teardownAll} from './_helpers.js'
import {installRecordingWukong} from './_recording-wukong.js'

// Product behavior failures: private cross-room/Agent recall, real course binding,
// recipient or membership widening, missing actual input injection, correction,
// forgetting and reconstruction after control restart. Provider is scripted here.
test('product stable memory crosses authorized rooms and Agents while current recipients fence private facts',{timeout:180000},async()=>{
  await ensureSchemaOnce();await resetAllTables()
  const recording=await installRecordingWukong()
  let worker:ReturnType<typeof createWorker>|undefined
  try {
    const {companyId,projectId,agentId}=await seedCompanyWithAgent()
    await seedUserMembership('test-owner',companyId)
    await seedUserMembership('test-peer',companyId)
    await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES('continuity-course',$1,$2,'test-owner')`,[companyId,projectId])
    const otherAgent='continuity-other-agent'
    await pool.query(`INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
      VALUES($1,$2,'agent','Other','tester','O','#abcdef','avail')`,[otherAgent,companyId])
    let app=await lingxiOSControl(),serial=0
    const enqueue=async(room:string,agent:string,members=['test-owner',agent])=>{
      await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
        VALUES($1,$2,$3,'group','Continuity test',$4::jsonb) ON CONFLICT(id) DO NOTHING`,[room,companyId,projectId,JSON.stringify(members)])
      await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)
        ON CONFLICT(channel_id) DO NOTHING`,[room,companyId,JSON.stringify({channelType:2,members})])
      const policy=await syncConversationPolicy(app,companyId,room)
      const accepted=await app.conversations.ingest({tenantId:companyId,conversationId:room,policyVersion:policy.version,
        messageId:`continuity-${++serial}`,version:1,author:{id:'test-owner',kind:'human'},text:'按照我的长期偏好回答。',mentions:[agent]},
        {mode:'execute',executionClass:'conversation',codeExecution:'disabled'})
      const run=accepted.runs[0];assert.ok(run);await bindProductRun(pool,run,room)
      return {run,identity:{...run,workId:run.runId,principalId:'test-owner'}}
    }
    const a=await enqueue('continuity-a',agentId),memory=app.memory!
    const scopes=await memory.scopes(a.identity),personal=scopes.find(s=>s.scopeType==='learner')!,course=scopes.find(s=>s.scopeType==='learner_course')!
    assert.ok(personal.scopeId.startsWith('stable-memory:'));assert.ok(course)
    const content={path:'preference.md',title:'Presentation preference',description:'Preferred output format',body:'先给三个要点，再给待办事项。',layer:'core' as const,locked:true}
    const saved=await memory.apply(a.identity,{scope:personal,changes:[{action:'create',content}],idempotencyKey:'continuity-save',sourceRef:'test-settings'})
    const document=saved.documents[0];assert.ok(document)
    const b=await enqueue('continuity-b',otherAgent)
    assert.ok((await memory.scopes(b.identity)).some(s=>s.scopeId===personal.scopeId))
    assert.ok((await memory.scopes(b.identity)).some(s=>s.scopeId===course.scopeId))
    assert.equal((await memory.read(b.identity,personal,document.id))?.body,content.body)
    const injected:boolean[]=[],usage={available:true as const,inputTokens:100,outputTokens:20}
    worker=createWorker({controlPlane:app,worker:{id:'continuity-fixture'},model:{modelId:'continuity-fixture',contextWindowTokens:200000,
      async run(input){injected.push(JSON.stringify(input).includes(content.body));return {output:[{role:'assistant',content:'三个要点。待办事项。'}],text:'三个要点。待办事项。',model:'continuity-fixture',usage}},
      async structured(){return {value:{missing:[]},model:'continuity-fixture',usage}},async compact(){throw new Error('unexpected compaction')}}})
    assert.equal(await worker.runNext(),true);assert.equal(await worker.runNext(),true)
    assert.deepEqual(injected,[true,true],'both actual model inputs contain the committed private core')
    const shared=await enqueue('continuity-shared',agentId,['test-owner','test-peer',agentId])
    assert.ok(!(await memory.scopes(shared.identity)).some(s=>s.scopeType==='learner'||s.scopeType==='learner_course'))
    await assert.rejects(memory.read(shared.identity,personal,document.id),/revoked/)
    await assert.rejects(memory.read({...b.identity,principalId:'test-peer'},personal,document.id))
    await assert.rejects(memory.read({...b.identity,tenantId:'foreign'},personal,document.id))
    const update=await memory.apply(b.identity,{scope:personal,changes:[{action:'update',id:document.id,expectedVersion:1,content:{...content,body:'先给待办事项。'}}],idempotencyKey:'continuity-update',sourceRef:'test-settings'})
    assert.equal(update.documents[0].version,2)
    assert.equal((await memory.history(b.identity,personal,document.id)).items.length,2)
    await worker.stop();worker=undefined;await stopLingxiOSControl();app=await lingxiOSControl()
    assert.equal((await app.memory!.read(b.identity,personal,document.id))?.body,'先给待办事项。')
    await app.memory!.apply(b.identity,{scope:personal,changes:[{action:'delete',id:document.id,expectedVersion:2}],idempotencyKey:'continuity-forget',sourceRef:'test-settings'})
    assert.equal(await app.memory!.read(b.identity,personal,document.id),null)
    assert.equal((await app.memory!.search(b.identity,personal,{query:'待办'})).items.length,0)
    await pool.query(`UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2`,[companyId,otherAgent])
    await assert.rejects(app.memory!.scopes(b.identity),/revoked/)
    await mkdir('artifacts/issue216',{recursive:true})
    await writeFile('artifacts/issue216/product-results.json',JSON.stringify({passed:true,provider:'scripted fixture; not live provider evidence',
      actualInputInjection:injected,checks:['cross-room','cross-Agent','real-course','shared-audience','tenant','principal','correction-history','control-restart','forget','Agent-revocation']},null,2))
  } finally {await worker?.stop();await recording.close();await teardownAll()}
})
