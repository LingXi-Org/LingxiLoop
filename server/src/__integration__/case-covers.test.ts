import assert from 'node:assert/strict'
import type { QueryResultRow } from 'pg'
import { once } from 'node:events'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { CasesApplication } from '../modules/cases/application.js'
import { claimCaseCover, completeCaseCover, failCaseCover } from '../modules/cases/cover-repository.js'
import { createCaseCoverWorker } from '../modules/cases/cover-worker.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

// Owning boundary: real transaction identity, published/draft isolation, expired
// leases, regeneration fences, revocation, bounded retries and resumable backfill.
// Reader view always selects the published cover, including for teachers; direct
// draft asset access also requires cases:manage after an organization turns read-only.
const teacher = { companyId: 'covers-school', userId: 'covers-teacher' }
const student = { companyId: teacher.companyId, userId: 'covers-student' }
const app = new CasesApplication(pool, { transaction: work => withTransaction(pool, work), putObject: async () => {} })
const content = (title = 'Router') => ({ title, summary: 'A network', body: 'Packets travel between networks.', category: 'Computing', tags: ['networks'], cover: null })
const artifact = { objectName: '路由器', rationale: '连接网络', altText: '路由器的等距细线图', html: '<html></html>', staticSvg: '<svg xmlns="http://www.w3.org/2000/svg"/>', sourceVersion: 'fixture', metadata: {} }
const makeDue = () => pool.query("UPDATE organization_case_cover_jobs SET available_at=NOW() WHERE status='pending'")
const claim = async () => { await makeDue(); return withTransaction(pool, db => claimCaseCover(db, 'fixture-worker', 2)) }
const complete = (job: NonNullable<Awaited<ReturnType<typeof claim>>>) => withTransaction(pool, db => completeCaseCover(db, job, artifact))
const servers: import('node:http').Server[] = []
afterEach(async () => { for (const server of servers.splice(0)) await new Promise<void>((resolve,reject) => server.close(error => error?reject(error):resolve())) })
async function api(userId: string) {
  const server = (await buildApiTestApp(userId)).listen(0,'127.0.0.1')
  servers.push(server); await once(server,'listening')
  const address = server.address() as import('node:net').AddressInfo
  return (path: string, method = 'GET', body?: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`,{
    method,headers:{'content-type':'application/json',...(method==='GET'?{}:{'x-company-id':teacher.companyId})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}) })
}
before(ensureSchemaOnce)
beforeEach(async () => {
  await resetAllTables()
  await pool.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES($1,'Cover school',$1,'EDUCATION','plan-education')`, [teacher.companyId])
  await seedUserMembership(teacher.userId, teacher.companyId, { role: 'TEACHER', isAdmin: false })
  await seedUserMembership(student.userId, student.companyId, { role: 'STUDENT', isAdmin: false })
})
after(() => teardownAll())

test('cover jobs reuse content across saves/publication and completion never changes article version or indexing', async () => {
  const draft = await app.create(teacher, content())
  const saved = await app.save(teacher, draft.id, content(), draft.version)
  const live = await app.publish(teacher, draft.id, saved.version)
  assert.equal((await pool.query('SELECT * FROM organization_case_cover_jobs')).rows.length, 1)
  const job = await claim(); assert.ok(job)
  assert.equal(await claim(), null)
  await complete(job)
  const ready = await app.detail(student, live.id)
  assert.equal(ready.generatedCover?.status, 'ready')
  assert.equal(ready.version, live.version)
  assert.equal((await app.detail(teacher, live.id, 'manage')).hasUnpublishedChanges, false)
  assert.equal((await pool.query('SELECT * FROM knowledge_source_jobs')).rows.length, 1)
  const asset = ready.generatedCover!.previewUrl!
  assert.ok(asset)
})

test('draft B cannot leak to published A; stale, expired and manually retried workers cannot install assets', async () => {
  const draft = await app.create(teacher, content('A'))
  const live = await app.publish(teacher, draft.id, draft.version)
  const a = await claim(); assert.ok(a)
  await complete(a)
  const edited = await app.save(teacher, live.id, content('B'), live.version)
  const b = await claim(); assert.ok(b)
  assert.equal((await app.detail(student, live.id)).generatedCover?.fingerprint, a.fingerprint)
  const teacherReader = await app.detail(teacher, live.id)
  assert.equal(teacherReader.generatedCover?.fingerprint, a.fingerprint)
  assert.equal(teacherReader.generatedCover?.canRetry, false)
  await pool.query("UPDATE organization_case_cover_jobs SET leased_until=NOW()-interval '1 second' WHERE id=$1", [b.id])
  assert.equal(await complete(b), false)
  const replacement = await claim(); assert.ok(replacement)
  assert.equal(await complete(b), false)
  await complete(replacement)
  const current = await app.detail(teacher, edited.id, 'manage')
  await app.retryCover(teacher, edited.id, 'draft', current.generatedCover!.fingerprint, current.generatedCover!.generation)
  assert.equal(await complete(replacement), false)
  assert.equal((await app.detail(student, edited.id)).generatedCover?.fingerprint, a.fingerprint)
  await assert.rejects(app.coverAsset(student, edited.id, b.id, replacement.generation, 'preview', 'draft'))
  await assert.rejects(app.retryCover(student, edited.id, 'draft', b.fingerprint, b.generation))
})

test('unpublish and permission revocation fence in-flight work and assets; backfill is idempotent and bounded', async () => {
  const draft = await app.create(teacher, content())
  const live = await app.publish(teacher, draft.id, draft.version)
  const job = await claim(); assert.ok(job)
  await app.unpublish(teacher, live.id, live.version)
  assert.equal(await complete(job), false)
  await assert.rejects(app.coverAsset(student, live.id, job.id, job.generation, 'preview', 'published'))
  const page = await app.backfillCovers(teacher, '', 1)
  assert.equal(page.scanned, 1)
  await app.backfillCovers(teacher, '', 1)
  assert.equal((await pool.query('SELECT * FROM organization_case_cover_jobs')).rows.length, 1)
  const next = await claim(); assert.ok(next)
  await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [teacher.companyId, teacher.userId])
  assert.equal(await complete(next), false)
})

test('failure retries are bounded and teacher retry advances generation while retaining safe prior asset', async () => {
  const draft = await app.create(teacher, content())
  for (let index = 0; index < 3; index++) {
    const job = await claim(); assert.ok(job)
    await withTransaction(pool, db => failCaseCover(db, job, 'generation_failed', 3))
    await pool.query('UPDATE organization_case_cover_jobs SET available_at=NOW()')
  }
  assert.equal(await claim(), null)
  const failed = await app.detail(teacher, draft.id, 'manage')
  assert.equal(failed.generatedCover?.status, 'failed')
  assert.equal(failed.generatedCover?.canRetry, true)
})


test('asset HTTP boundary works without company header and exposes only selected snapshot with restrictive content types', async () => {
  const draft = await app.create(teacher,content())
  const live = await app.publish(teacher,draft.id,draft.version)
  const job = await claim(); assert.ok(job); await complete(job)
  const ready = await app.detail(student,live.id), cover=ready.generatedCover!
  const reader=await api(student.userId)
  const preview=await reader(cover.previewUrl!)
  assert.equal(preview.status,200)
  assert.match(preview.headers.get('content-type')!,/image\/svg\+xml/)
  assert.match(preview.headers.get('content-security-policy')!,/sandbox/)
  assert.match(preview.headers.get('cache-control')!,/no-store/)
  const interactive=await reader(cover.interactiveUrl!)
  assert.match(interactive.headers.get('content-type')!,/application\/json/)
  assert.deepEqual(await interactive.json(),{html:artifact.html})
  assert.equal((await reader(cover.previewUrl!.replace('snapshot=published','snapshot=draft'))).status,404)
  assert.equal((await reader(`/api/cases/${live.id}/retry-cover`,'POST',{snapshot:'published',fingerprint:cover.fingerprint,expectedGeneration:cover.generation,idempotencyKey:'duplicate'})).status,403)
  assert.equal((await reader('/api/cases/covers/backfill','POST',{})).status,403)
  await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2",[student.companyId,student.userId])
  assert.equal((await reader(cover.previewUrl!)).status,403)
})

test('read-only teachers can read published covers but cannot read direct draft assets', async () => {
  const draft = await app.create(teacher, content('Published cover'))
  const live = await app.publish(teacher, draft.id, draft.version)
  const publishedJob = await claim(); assert.ok(publishedJob); await complete(publishedJob)
  const publishedCover = (await app.detail(student, live.id)).generatedCover!
  await app.save(teacher, live.id, content('Draft cover'), live.version)
  const draftJob = await claim(); assert.ok(draftJob); await complete(draftJob)
  const draftCover = (await app.detail(teacher, live.id, 'manage')).generatedCover!
  const request = await api(teacher.userId)
  assert.equal((await request(draftCover.previewUrl!)).status, 200)
  await pool.query("UPDATE companies SET status='READ_ONLY' WHERE id=$1", [teacher.companyId])
  assert.equal((await request(draftCover.previewUrl!)).status, 404)
  assert.equal((await request(publishedCover.previewUrl!)).status, 200)
  assert.equal((await app.detail(teacher, live.id)).generatedCover?.fingerprint, publishedCover.fingerprint)
})

test('duplicate retry requests advance exactly once and old generations cease access after replacement', async () => {
  const draft=await app.create(teacher,content()), first=await claim(); assert.ok(first); await complete(first)
  const old=await app.detail(teacher,draft.id,'manage'), cover=old.generatedCover!
  const outcomes=await Promise.all([
    app.retryCover(teacher,draft.id,'draft',cover.fingerprint,cover.generation,'same-request'),
    app.retryCover(teacher,draft.id,'draft',cover.fingerprint,cover.generation,'same-request'),
  ])
  assert.ok(outcomes.every(value=>value.generatedCover!.generation===cover.generation+1))
  assert.equal(await app.coverAsset(teacher,draft.id,first.id,first.generation,'preview','draft'),artifact.staticSvg)
  const second=await claim(); assert.ok(second); await complete(second)
  await assert.rejects(app.coverAsset(teacher,draft.id,first.id,first.generation,'preview','draft'),{status:404})
  await assert.rejects(app.retryCover(teacher,draft.id,'draft',cover.fingerprint,cover.generation,'another-request'),{status:409})
})

test('save and publish return while generator waits; worker completion switches shared cover asynchronously', async () => {
  let finish!: (value:typeof artifact)=>void
  let entered!: ()=>void
  const begun=new Promise<void>(resolve=>{entered=resolve})
  const worker=createCaseCoverWorker({db:pool,transaction:work=>withTransaction(pool,work),enabled:()=>true,
    generate:async input=>{assert.equal(input.snapshot.content,content().body);entered();return new Promise(resolve=>{finish=resolve})}})
  const draft=await app.create(teacher,content())
  assert.equal(await worker.runOnce(),false,'new snapshots have a short coalescing window')
  await makeDue()
  const processing=worker.runOnce()
  await begun
  const published=await app.publish(teacher,draft.id,draft.version)
  assert.equal((await app.detail(student,draft.id)).generatedCover!.status,'generating')
  finish(artifact); await processing
  const ready=await app.detail(student,draft.id)
  assert.equal(ready.generatedCover!.status,'ready')
  assert.equal(ready.version,published.version)
})

test('worker timeout settles and persists bounded retry without accepting late generation', async () => {
  let signal: AbortSignal|undefined
  let finish!: (value:typeof artifact)=>void
  const worker=createCaseCoverWorker({db:pool,transaction:work=>withTransaction(pool,work),enabled:()=>true,timeoutMs:100,maxAttempts:1,
    generate:async input=>{signal=input.signal;return new Promise(resolve=>{finish=resolve})}})
  const draft=await app.create(teacher,content())
  await makeDue(); await worker.runOnce()
  assert.equal(signal?.aborted,true)
  finish(artifact)
  assert.equal((await app.detail(teacher,draft.id,'manage')).generatedCover!.status,'failed')
  assert.equal((await pool.query('SELECT * FROM organization_case_cover_assets')).rows.length,0)
})

test('logical deletion retains covers and fences pending, in-flight and backfill work',async()=>{
  const draft=await app.create(teacher,content()), job=await claim();assert.ok(job)
  await app.remove(teacher,draft.id,draft.version)
  assert.equal(await complete(job),false)
  assert.equal((await pool.query('SELECT status FROM organization_case_cover_jobs WHERE id=$1',[job.id])).rows[0].status,'cancelled')
  const ready=await app.create(teacher,content()), readyJob=await claim();assert.ok(readyJob);await complete(readyJob)
  const oldCover=(await app.detail(teacher,ready.id,'manage')).generatedCover!
  await app.remove(teacher,ready.id,ready.version)
  const request=await api(teacher.userId)
  assert.equal((await request(oldCover.previewUrl!)).status,404)
  assert.equal((await request(oldCover.interactiveUrl!)).status,404)
  assert.equal((await pool.query('SELECT * FROM organization_case_cover_assets')).rows.length,1)
  await assert.rejects(app.retryCover(teacher,ready.id,'draft',oldCover.fingerprint,oldCover.generation),{status:404})
  const pending=await app.create(teacher,content('Pending'))
  await app.remove(teacher,pending.id,pending.version)
  assert.equal((await app.backfillCovers(teacher)).scanned,0)
  assert.equal(await claim(),null)
  assert.equal((await pool.query("SELECT 1 FROM organization_case_cover_jobs WHERE status IN ('pending','generating')")).rows.length,0)
  const survivor=await app.create(teacher,content('Survivor')), survivorJob=await claim();assert.ok(survivorJob)
  assert.equal(await complete(survivorJob),true)
  assert.equal((await app.detail(teacher,survivor.id,'manage')).generatedCover!.status,'ready')
})


test('new draft B supersedes A and late A cannot overwrite B; reads enqueue nothing',async()=>{
  const a=await app.create(teacher,content('A')), aJob=await claim();assert.ok(aJob)
  const b=await app.save(teacher,a.id,content('B'),a.version),bJob=await claim();assert.ok(bJob)
  await complete(bJob)
  assert.equal(await complete(aJob),false)
  assert.equal((await app.detail(teacher,b.id,'manage')).generatedCover!.fingerprint,bJob.fingerprint)
  for(let index=0;index<3;index++){await app.detail(teacher,b.id,'manage');await app.list(teacher,'','','manage')}
  assert.equal((await pool.query('SELECT * FROM organization_case_cover_jobs')).rows.length,2)
  assert.equal((await pool.query('SELECT * FROM organization_case_cover_assets')).rows.length,1)
})

test('authorized teacher in another organization cannot read case assets; revoked requester is rejected before claim',async()=>{
  const draft=await app.create(teacher,content()),job=await claim();assert.ok(job);await complete(job)
  await pool.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES('cover-other','Other','cover-other','EDUCATION','plan-education')`)
  await seedUserMembership('covers-foreign-teacher','cover-other',{role:'TEACHER',isAdmin:false})
  await assert.rejects(app.coverAsset({companyId:'cover-other',userId:'covers-foreign-teacher'},draft.id,job.id,job.generation,'preview','draft'),{status:404})
  const another=await app.create(teacher,content('Another'))
  await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2",[teacher.companyId,teacher.userId])
  assert.equal(await claim(),null)
  const status=(await pool.query('SELECT status FROM organization_case_cover_jobs WHERE case_id=$1',[another.id])).rows[0].status
  assert.equal(status,'cancelled')
})


test('claim candidate authorization cannot cancel or admit a newer teacher retry generation',async()=>{
  const draft=await app.create(teacher,content()),cover=draft.generatedCover!
  const colleague={companyId:teacher.companyId,userId:'cover-claim-colleague'}
  await seedUserMembership(colleague.userId,colleague.companyId,{role:'TEACHER',isAdmin:false})
  await makeDue()
  let replaced=false
  const result=await withTransaction(pool,async db=>claimCaseCover({query:async<T extends QueryResultRow>(text:string,params?:readonly unknown[])=>{
    const rows=await db.query<T>(text,params?[...params]:undefined)
    if(!replaced && text.includes('SELECT j.* FROM organization_case_cover_jobs j')) {
      replaced=true
      await app.retryCover(colleague,draft.id,'draft',cover.fingerprint,cover.generation,'new-teacher')
      await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2",[teacher.companyId,teacher.userId])
    }
    return rows
  }},'stale-candidate-worker',2))
  assert.equal(replaced,true)
  assert.equal(result,null)
  assert.equal((await app.detail(colleague,draft.id,'manage')).generatedCover!.status,'pending')
  const next=await claim();assert.ok(next)
  assert.equal(next.requested_by,colleague.userId)
  assert.equal(next.generation,cover.generation+1)
})
