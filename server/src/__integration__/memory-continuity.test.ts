import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdir,writeFile} from 'node:fs/promises'
import {createWorker} from '@lyyzka/lingxios/worker'
import {createLingxiOS} from '@lyyzka/lingxios'
import {pool} from '../db/pool.js'
import {lingxiOSControl,stopLingxiOSControl} from '../agent-runtime/runtime.js'
import {bindProductRun} from '../agent-runtime/identity.js'
import {syncConversationPolicy} from '../agent-runtime/conversations.js'
import {resolveMemoryScopes} from '../modules/memory/public.js'
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
    const enqueue=async(room:string,agent:string,members=['test-owner',agent],project=projectId,threadId?:string)=>{
      await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
        VALUES($1,$2,$3,'group','Continuity test',$4::jsonb) ON CONFLICT(id) DO NOTHING`,[room,companyId,project,JSON.stringify(members)])
      await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)
        ON CONFLICT(channel_id) DO NOTHING`,[room,companyId,JSON.stringify({channelType:2,members})])
      const policy=await syncConversationPolicy(app,companyId,room)
      if(threadId) await app.conversations.registerThread({tenantId:companyId,conversationId:room,threadId,policyVersion:policy.version})
      const accepted=await app.conversations.ingest({tenantId:companyId,conversationId:room,policyVersion:policy.version,
        messageId:`continuity-${++serial}`,version:1,author:{id:'test-owner',kind:'human'},text:'按照我的长期偏好回答。',mentions:[agent],...threadId?{threadId}:{}},
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
    let b=await enqueue('continuity-b',otherAgent)
    assert.equal(await app.revise(b.run,'保留前述长期偏好并按最新要求回答。'),true,'queued human revision is accepted before execution')
    assert.ok((await memory.scopes(b.identity)).some(s=>s.scopeId===personal.scopeId))
    assert.ok((await memory.scopes(b.identity)).some(s=>s.scopeId===course.scopeId))
    assert.equal((await memory.read(b.identity,personal,document.id))?.body,content.body)
    const injected:boolean[]=[],usage={available:true as const,inputTokens:100,outputTokens:20}
    worker=createWorker({controlPlane:app,worker:{id:'continuity-fixture'},model:{modelId:'continuity-fixture',contextWindowTokens:200000,
      async run(input){injected.push(JSON.stringify(input).includes(content.body));return {output:[{role:'assistant',content:'三个要点。待办事项。'}],text:'三个要点。待办事项。',model:'continuity-fixture',usage}},
      async structured(){return {value:{missing:[]},model:'continuity-fixture',usage}},async compact(){throw new Error('unexpected compaction')}}})
    assert.equal(await worker.runNext(),true);assert.equal(await worker.runNext(),true)
    assert.deepEqual(injected,[true,true],'both actual model inputs contain the committed private core')
    assert.ok((await memory.scopes(b.identity)).find(s=>s.scopeType==='agent_role')?.scopeId!==scopes.find(s=>s.scopeType==='agent_role')?.scopeId)
    const thread=await enqueue('continuity-b',otherAgent,undefined,projectId,'new-thread')
    assert.equal((await memory.read(thread.identity,personal,document.id))?.body,content.body)
    const courseDoc=(await memory.apply(a.identity,{scope:course,changes:[{action:'create',content:{...content,path:'course.md',body:'个人课程项目经历，当前学情以业务记录为准。'}}],idempotencyKey:'course-save',sourceRef:'test-settings'})).documents[0]
    assert.ok(await memory.read(b.identity,course,courseDoc.id))
    await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by)
      SELECT 'continuity-other-project',company_id,kind,'Other course',created_by FROM projects WHERE id=$1`,[projectId])
    const elsewhere=await enqueue('continuity-other-course',agentId,undefined,'continuity-other-project')
    await assert.rejects(memory.read(elsewhere.identity,course,courseDoc.id),/revoked/)
    assert.ok(await memory.read(elsewhere.identity,personal,document.id),'course change retains only authorized personal facts')
    const shared=await enqueue('continuity-shared',agentId,['test-owner','test-peer',agentId])
    assert.ok(!(await memory.scopes(shared.identity)).some(s=>s.scopeType==='learner'||s.scopeType==='learner_course'))
    await assert.rejects(memory.read(shared.identity,personal,document.id),/revoked/)
    await assert.rejects(memory.read({...b.identity,principalId:'test-peer'},personal,document.id))
    await assert.rejects(memory.read({...b.identity,tenantId:'foreign'},personal,document.id))
    // Exercise the old consumer's native public contract, then migrate through
    // the current product resolver. No legacy partition algorithm is copied.
    const legacy=await createLingxiOS({database:pool,background:{role:'passive'},memory:{resolveScopes:async(actor,db)=>{
      await resolveMemoryScopes(actor,db)
      return [{tenantId:actor.tenantId,scopeType:'learner',scopeId:actor.principalId}]
    }}})
    try {
      const old=(await legacy.memory!.scopes(a.identity))[0]
      const oldDocs=(await legacy.memory!.initialize(a.identity,{scope:old,documents:['proven','ambiguous','expired'].map(name=>({...content,path:`legacy-${name}.md`})),idempotencyKey:'legacy-seed',sourceRef:'test-settings'})).documents
      await pool.query(`UPDATE lingxios.agent_memories SET source_refs='[{"sourceRef":"legacy","authorId":"test-owner"}]',version=version+1 WHERE tenant_id=$1 AND id=$2`,[companyId,oldDocs[1].id])
      await legacy.memory!.apply(a.identity,{scope:old,changes:[{action:'expire',id:oldDocs[2].id,expectedVersion:1}],idempotencyKey:'legacy-expire',sourceRef:'test-settings'})
      const sharedOld=(await legacy.memory!.scopes(shared.identity))[0]
      const group=(await legacy.memory!.initialize(shared.identity,{scope:sharedOld,documents:[{...content,path:'legacy-group.md'}],idempotencyKey:'legacy-group',sourceRef:'test-settings'})).documents[0]
      const migration=await memory.migrateLegacy(b.identity)
      assert.equal(migration.items.find(item=>item.id===oldDocs[0].id)?.outcome,'migrated')
      for(const id of [oldDocs[1].id,oldDocs[2].id,group.id]) assert.equal(migration.items.find(item=>item.id===id)?.outcome,'isolated')
      assert.ok(await memory.read(b.identity,personal,oldDocs[0].id))
      assert.ok(!(await memory.migrateLegacy(b.identity)).items.some(item=>item.outcome==='migrated'))
      await memory.apply(b.identity,{scope:personal,changes:[{action:'delete',id:oldDocs[0].id,expectedVersion:2}],idempotencyKey:'forget-migrated',sourceRef:'test-settings'})
      await memory.migrateLegacy(b.identity)
      assert.equal(await memory.read(b.identity,personal,oldDocs[0].id),null)
    } finally {await legacy.stop()}
    b=await enqueue('continuity-b',otherAgent)
    const update=await memory.apply(b.identity,{scope:personal,changes:[{action:'update',id:document.id,expectedVersion:1,content:{...content,body:'先给待办事项。'}}],idempotencyKey:'continuity-update',sourceRef:'test-settings'})
    assert.equal(update.documents[0].version,2)
    assert.equal((await memory.history(b.identity,personal,document.id)).items.length,2)
    await worker.stop();worker=undefined;await stopLingxiOSControl();app=await lingxiOSControl()
    assert.equal((await app.memory!.read(b.identity,personal,document.id))?.body,'先给待办事项。')
    await app.memory!.apply(b.identity,{scope:personal,changes:[{action:'delete',id:document.id,expectedVersion:2}],idempotencyKey:'continuity-forget',sourceRef:'test-settings'})
    assert.equal(await app.memory!.read(b.identity,personal,document.id),null)
    assert.equal((await app.memory!.search(b.identity,personal,{query:'待办'})).items.length,0)
    const wider=JSON.stringify(['test-owner','test-peer',otherAgent])
    await pool.query("UPDATE conversations SET members=$2::jsonb WHERE id='continuity-b' AND company_id=$1",[companyId,wider])
    await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id='continuity-b' AND company_id=$1",[companyId,wider])
    await syncConversationPolicy(app,companyId,'continuity-b')
    await assert.rejects(app.memory!.read(b.identity,course,courseDoc.id),/revoked/,'teacher/peer intervention invalidates prior private scope access')
    await pool.query(`UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2`,[companyId,otherAgent])
    await assert.rejects(app.memory!.scopes(b.identity),/revoked/)
    await mkdir('artifacts/issue216',{recursive:true})
    await writeFile('artifacts/issue216/product-results.json',JSON.stringify({passed:true,provider:'scripted fixture; not live provider evidence',
      actualInputInjection:injected,checks:['cross-room','cross-thread','cross-Agent','queued-revision','real-course','cross-course','shared-audience','intervention','tenant','principal','proven-legacy-move','ambiguous-legacy-isolation','expired-legacy-isolation','group-legacy-isolation','correction-history','control-restart','forget-migrated','forget','Agent-revocation']},null,2))
  } finally {await worker?.stop();await recording.close();await teardownAll()}
})
