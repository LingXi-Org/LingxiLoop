// Internal local rehearsal subprocess. Never import from application startup.
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {resolve,join} from 'node:path'
import {readFile,mkdtemp,writeFile,rm,readdir,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
const [phase,checkout]=process.argv.slice(2), base=resolve(checkout??'')
const url=new URL(process.env.DATABASE_URL??'')
assert.equal(url.hostname,'127.0.0.1');assert.notEqual(url.port,'55432')
assert.match(url.pathname,/^\/restore216_[a-f0-9]{12}_(source|target)_test$/)
assert.equal(process.env.RESTORE_REHEARSAL_CHILD,'1')
let fetchAttempts=0
// This fixture never needs an HTTP provider or other external service.
globalThis.fetch=async()=>{fetchAttempts++;throw Error('rehearsal HTTP forbidden')}
const api=await import(pathToFileURL(join(base,'restore-runtime-public.mjs')).href)
const {pool,closeDatabasePools}=await import(pathToFileURL(join(base,'server/src/db/pool.ts')).href)
const {migrateDatabase,assertMigrationsCurrent}=await import(pathToFileURL(join(base,'server/src/db/migrate.ts')).href)
const load=path=>import(pathToFileURL(join(base,path)).href)
let app
const result={phase,passed:false,providerRequests:0}
const company='restore-tenant',principal='test-owner',agent='restore-agent',peer='restore-peer'
const content=name=>({path:`${name}.md`,title:'Synthetic retained preference',description:'Synthetic fixture only',body:`synthetic-restored-${name}`,layer:'core',locked:true})
const asIdentity=run=>({...run,workId:run.runId})
async function memoryApp(){
 const {resolveMemoryScopes}=await load('server/src/modules/memory/public.ts')
 return api.createLingxiOS({database:pool,background:{role:'passive'},memory:{resolveScopes:resolveMemoryScopes}})
}
async function room(id,members=[principal,agent],human=principal){
 const project=`general-${company}`
 await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
 VALUES($1,$2,$3,'group','Synthetic restore',$4::jsonb) ON CONFLICT DO NOTHING`,[id,company,project,JSON.stringify(members)])
 await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)
 ON CONFLICT DO NOTHING`,[id,company,JSON.stringify({channelType:2,members})])
 const {syncConversationPolicy}=await load('server/src/agent-runtime/conversations.ts')
 const policy=await syncConversationPolicy(app,company,id)
 const accepted=await app.conversations.ingest({tenantId:company,conversationId:id,policyVersion:policy.version,
 messageId:`source-${id}`,version:1,author:{id:human,kind:'human'},text:'Please explicitly save the three synthetic preferences, then correct the first preference as requested.',mentions:[agent]},
 {mode:'execute',executionClass:'conversation',codeExecution:'disabled'})
 const run=accepted.runs[0];assert.ok(run)
 await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,thread_id,internal,message_protocol)
 VALUES($1,$2,$3,$4,$5,$6,$7,false,2) ON CONFLICT DO NOTHING`,[run.runId,run.tenantId,id,run.sessionId,run.agentId,run.principalId,run.threadId??null])
 return asIdentity(run)
}
// The old administrative API intentionally lacks source workId. Use the actual
// 3.5.6 Worker/native reviewer/tool path for provable legacy migration positives.
async function nativeSave(actor,scope,names,correct=false){
 let calls=0,reviews=0
 const usage={available:true,inputTokens:100,outputTokens:10}
 const worker=api.createWorker({controlPlane:app,worker:{id:'restore-source-worker'},model:{
  modelId:'synthetic-restore',contextWindowTokens:200000,
  async run(){
   calls++
   if(calls===1 || correct&&calls===2){
    const changes=calls===1?names.map(name=>({action:'create',content:content(name)})):
     [{action:'update',id:(await app.memory.list(actor,scope)).items.find(d=>d.path==='eligible-a.md').id,
       expectedVersion:1,content:{...content('eligible-a'),body:'synthetic-corrected-before-backup'}}]
    return {text:'',output:[{type:'function_call',callId:`restore-native-${calls}`,name:'memory__apply',
      arguments:JSON.stringify({scopeType:scope.scopeType,scopeId:scope.scopeId,changes})}],usage}
   }
   assert.ok(calls<=4,'bounded synthetic worker calls')
   return {text:'The requested synthetic preferences were saved.',output:[{role:'assistant',content:'The requested synthetic preferences were saved.'}],usage}
  },
  async structured(input){
   if(input.purpose==='memory-synthesis'){reviews++;return {value:{approved:true,explicit:true,confidence:1},model:'synthetic-restore',usage}}
   return {value:{missing:[]},model:'synthetic-restore',usage}
  },async compact(){throw Error('unexpected compaction')}
 }})
 try{
  assert.equal(await worker.runNext(),true)
  assert.ok(await app.readMessage(actor),'real source worker commits its final response')
  const docs=(await app.memory.list(actor,scope)).items.filter(d=>names.includes(d.path.replace(/\.md$/,'')))
  assert.equal(docs.length,names.length)
  for(const d of docs){const full=await app.memory.read(actor,scope,d.id);assert.ok(full.sources.length&&full.sources.every(ref=>ref.workId===actor.workId))}
  assert.equal(reviews,correct?2:1)
  const events=(await app.readEvents(actor,0)).events
  const receipts=events.filter(event=>event.kind==='tool.completed'&&event.data.name==='memory.apply')
  assert.equal(receipts.length,reviews,'each old native write has a durable completion')
  result.nativeSourceWrites=(result.nativeSourceWrites??0)+reviews
  return docs
 }finally{await worker.stop()}
}
async function identity(id){
 const row=(await pool.query('SELECT run_id FROM agent_run_bindings WHERE company_id=$1 AND conversation_id=$2 ORDER BY created_at LIMIT 1',[company,id])).rows[0]
 assert.ok(row);return asIdentity(await api.readRunReference(pool,company,row.run_id))
}
async function provenance(){return (await pool.query(`SELECT (SELECT version FROM lingxios.schema_version WHERE singleton) AS native,
 (SELECT max(version) FROM schema_migrations) AS product,(SELECT count(*)::int FROM schema_migrations) AS count,
 runtime_version AS runtime,schema_version AS installed,protocol_version AS protocol,schema_sha256 AS hash FROM lingxios_installation`)).rows[0]}
try {
 if(phase==='bootstrap'){
  const applied=await migrateDatabase();await assertMigrationsCurrent()
  Object.assign(result,{applied:applied.length,provenance:await provenance()})
 }else if(phase==='seed'){
  await assertMigrationsCurrent()
  const {seedCompanyWithAgent,seedUserMembership}=await load('server/src/__integration__/_helpers.ts')
  await seedCompanyWithAgent({companyId:company,agentId:agent})
  await seedUserMembership(principal,company);await seedUserMembership(peer,company)
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES('restore-course',$1,$2,$3)`,[company,`general-${company}`,principal])
  app=await memoryApp()
  const first=await room('restore-source'),memory=app.memory,scope=(await memory.scopes(first)).find(s=>s.scopeType==='learner')
  assert.ok(scope)
  const docs=(await memory.initialize(first,{scope,documents:['admin-only','expired','ambiguous'].map(content),idempotencyKey:'source-docs',sourceRef:'synthetic-settings'})).documents
  await memory.apply(first,{scope,changes:[{action:'expire',id:docs[1].id,expectedVersion:1}],idempotencyKey:'source-expired',sourceRef:'synthetic-settings'})
  // Actual old administrative writes remain ambiguous; never manufacture workId.
  assert.ok(docs.every(d=>d.sources.every(ref=>!ref.workId)))
  await nativeSave(first,scope,['eligible-a','eligible-b','eligible-c'],true)
  const group=await room('restore-group',[principal,peer,agent]),groupScope=(await memory.scopes(group)).find(s=>s.scopeType==='learner')
  await nativeSave(group,groupScope,['group'])
  const foreign=await room('restore-peer-room',[peer,agent],peer),foreignScope=(await memory.scopes(foreign)).find(s=>s.scopeType==='learner')
  await memory.initialize(foreign,{scope:foreignScope,documents:[content('other-principal')],idempotencyKey:'source-peer',sourceRef:'synthetic-settings'})
  const forgotten=await room('restore-forgotten'),forgottenScope=(await memory.scopes(forgotten)).find(s=>s.scopeType==='learner')
  await memory.initialize(forgotten,{scope:forgottenScope,documents:[content('forgotten')],idempotencyKey:'source-forgotten',sourceRef:'synthetic-settings'})
  await memory.forget(forgotten,forgottenScope)
  await pool.query(`INSERT INTO lingxios.agent_os_sessions(session_key,tenant_id,agent_id,session_id,summary,history,compaction_epoch)
 VALUES('restore-historical-session',$1,$2,'restore-history','Synthetic retained summary','[{"role":"user","content":"Synthetic retained history"}]',2)`,[company,agent])
  await pool.query(`CREATE TABLE public.restore_snapshot_control(id integer PRIMARY KEY);
 INSERT INTO public.restore_snapshot_control VALUES(1);
 INSERT INTO course_forum_posts(id,company_id,project_id,author_user_id,kind,title,body)
 VALUES('restore-post','restore-tenant','general-restore-tenant','test-owner','share','Synthetic old post','Synthetic literal **text**');
 INSERT INTO homeworks(id,company_id,project_id,course_id,created_by,title,instructions,criteria,visible_hash)
 VALUES('restore-homework','restore-tenant','general-restore-tenant','restore-course','test-owner','Synthetic','Synthetic old instructions','["Synthetic criterion"]','synthetic-visible-hash')`)
  Object.assign(result,{memories:(await pool.query('SELECT count(*)::int AS n FROM lingxios.agent_memories')).rows[0].n,
  versions:(await pool.query('SELECT count(*)::int AS n FROM lingxios.agent_memory_versions')).rows[0].n,
  forgottenScopes:(await pool.query('SELECT count(*)::int AS n FROM lingxios.agent_memory_scopes WHERE epoch>0 AND forgotten_at IS NOT NULL')).rows[0].n})
 }else if(phase==='upgrade'){
  assert.equal(api.releaseVersions.schema,13)
  const installation=()=>pool.query('SELECT * FROM lingxios_installation').then(r=>r.rows)
  const source=await provenance();assert.equal(source.product,46);assert.equal(source.native,12)
  // Production-mode refusal is real, before allowing this drained synthetic DB.
  const oldNodeEnv=process.env.NODE_ENV;process.env.NODE_ENV='production';delete process.env.LINGXIOS_SCHEMA_UPGRADE_DRAINED
  await assert.rejects(migrateDatabase(),e=>/verified drain/.test(e.cause?.message??''))
  assert.deepEqual(await provenance(),source);process.env.LINGXIOS_SCHEMA_UPGRADE_DRAINED='true'
  const temp=await mkdtemp(join(tmpdir(),'restore216-migrations-'))
  try{
   for(const name of await readdir(join(base,'server/src/db/migrations')))await copyFile(join(base,'server/src/db/migrations',name),join(temp,name))
   const last=join(temp,'0048_native_content_documents.sql')
   await writeFile(last,(await readFile(last,'utf8'))+'\nSELECT independent_restore_expected_failure();\n')
   await assert.rejects(migrateDatabase(pool,pathToFileURL(temp+'/')),/migration 48_native_content_documents failed/)
   const partial=await provenance();assert.equal(partial.product,47);assert.equal(partial.native,13);assert.equal(partial.installed,13)
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='homeworks' AND column_name='editor_document'")).rows[0].n,0)
   assert.deepEqual(await migrateDatabase(),['0048_native_content_documents'])
  }finally{await rm(temp,{recursive:true,force:true});process.env.NODE_ENV=oldNodeEnv;delete process.env.LINGXIOS_SCHEMA_UPGRADE_DRAINED}
  await assertMigrationsCurrent();const final=await installation(),history=(await pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows
  assert.deepEqual(await migrateDatabase(),[]);assert.deepEqual(await installation(),final)
  assert.deepEqual((await pool.query('SELECT * FROM schema_migrations ORDER BY version')).rows,history)
  const columns=[['course_forum_posts','editor_document'],['course_forum_comments','editor_document'],['course_forum_submissions','editor_document'],['course_forum_feedback','editor_document'],['course_forum_feedback','attachments'],['course_forum_feedback','links'],['homeworks','editor_document'],['homeworks','criteria_document'],['homework_teacher_decisions','editor_document'],['homework_teacher_decisions','attachments'],['homework_teacher_decisions','links']]
  for(const [table,column]of columns)assert.deepEqual((await pool.query("SELECT data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",[table,column])).rows,[{data_type:'jsonb',is_nullable:'YES'}])
  Object.assign(result,{provenance:await provenance(),missingDrainRejected:true,failed48Preserved47:true,repairedOnly48:true,nullableColumns:columns.length,exactNoop:true})
 }else if(phase==='old-refusal'){
  assert.equal(api.releaseVersions.runtime,'3.5.6')
  const before=await provenance();assert.equal(before.native,13)
  await assert.rejects(assertMigrationsCurrent(),/migration|mismatch/)
  await assert.rejects(api.createLingxiOS({database:pool,background:{role:'passive'}}),/requires.*schema version 12/)
  assert.deepEqual(await provenance(),before)
  Object.assign(result,{oldProductReadinessRejected:true,oldPublicRuntimeStartupRejected:true,provenanceUnchanged:true})
 }else if(phase==='backfill'){
  await assertMigrationsCurrent();app=await memoryApp();const memory=app.memory,current=await room('restore-target')
  const scopes=await memory.scopes(current),personal=scopes.find(s=>s.scopeType==='learner');assert.ok(personal)
  const dry=await memory.migrateLegacy(current,{dryRun:true,limit:32});result.dryRunCounts=Object.fromEntries([...new Set(dry.items.map(i=>i.reason??i.outcome))].map(key=>[key,dry.items.filter(i=>(i.reason??i.outcome)===key).length]));assert.deepEqual(result.dryRunCounts,{eligible:3,unproven_owner_or_source:2,inactive:1,ownership_or_audience_not_proven:1})
  assert.equal((await memory.list(current,personal)).items.length,0)
  const items=[];let cursor,pages=0
  do{const page=await memory.migrateLegacy(current,{limit:2,...cursor?{cursor}:{}});items.push(...page.items);cursor=page.nextCursor;pages++;assert.ok(pages<20)}while(cursor)
  const migrated=items.filter(i=>i.outcome==='migrated');assert.equal(migrated.length,3);assert.ok(pages>1)
  assert.equal(items.filter(i=>i.outcome==='isolated').length,4)
  assert.ok(!(await memory.migrateLegacy(current,{limit:32})).items.some(i=>i.outcome==='migrated'))
  const visible=(await memory.list(current,personal)).items;assert.equal(visible.length,3)
  const corrected=visible.find(d=>d.path==='eligible-a.md');assert.ok(corrected)
  assert.equal((await memory.read(current,personal,corrected.id)).version,3)
  await assert.rejects(memory.apply(current,{scope:personal,changes:[{action:'delete',id:corrected.id,expectedVersion:1}],idempotencyKey:'stale-delete',sourceRef:'synthetic-settings'}))
  const foreign=await identity('restore-peer-room'),shared=await identity('restore-group')
  await assert.rejects(memory.read(foreign,personal,corrected.id));await assert.rejects(memory.read(shared,personal,corrected.id))
  await assert.rejects(memory.read({...current,tenantId:'foreign-tenant'},personal,corrected.id))
  // Current legal deletion remains possible after the historical source room's authorization is revoked.
  const members=JSON.stringify([peer,agent])
  await pool.query("UPDATE conversations SET members=$1::jsonb WHERE id='restore-source'",[members])
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$1::jsonb) WHERE channel_id='restore-source'",[members])
  await memory.apply(current,{scope:personal,changes:[{action:'delete',id:corrected.id,expectedVersion:3}],idempotencyKey:'current-delete',sourceRef:'synthetic-settings'})
  await memory.migrateLegacy(current,{limit:32});assert.equal(await memory.read(current,personal,corrected.id),null)
  await app.stop();app=await memoryApp();assert.equal(await app.memory.read(current,personal,corrected.id),null)
  await pool.query('UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2',[company,agent])
  await assert.rejects(app.memory.scopes(current))
  Object.assign(result,{dryRun:true,pages,migrated:migrated.length,isolated:items.filter(i=>i.outcome==='isolated').length,repeatNoMoves:true,
  principalTenantGroupRejected:true,staleCasRejected:true,sourceRevokedCurrentDelete:true,deleteNotResurrectedAfterRestart:true,currentAgentRevoked:true})
 }else throw Error('unknown rehearsal phase')
 assert.equal(fetchAttempts,0);result.passed=true
}catch(error){result.errorName=error?.name??'Error';result.errorCode=/^[A-Z0-9_]+$/.test(error?.code??'')?error.code:undefined;result.failureLine=String(error?.stack??'').split('\n').find(line=>line.includes('independent-memory-restore-step'))?.replace(base,'<checkout>');process.exitCode=1}
finally{await app?.stop();await closeDatabasePools();result.providerRequests=fetchAttempts;console.log(JSON.stringify(result))}
