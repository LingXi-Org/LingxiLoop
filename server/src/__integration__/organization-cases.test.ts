import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { CasesApplication, canReadCaseFile } from '../modules/cases/application.js'
import type { CaseContent } from '../modules/cases/contracts.js'
import { storage } from '../storage.js'
import { openNotebookClient } from '../modules/knowledge/provider.js'
import { retrieveKnowledgeState, runKnowledgeWorkerOnce } from '../modules/knowledge/runtime.js'
import { listCaseRetrievalSources } from '../modules/knowledge/retrieval-repository.js'
import type { ActionContext, RequestSnapshot } from '@lyyzka/lingxios'
import { knowledgeTools } from '../modules/knowledge/agent-tools.js'
import { createProductContext } from '../agent-runtime/context.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll, installFakeWukong } from './_helpers.js'

// Failure modes defined before exercising the implementation: tenant/role bypass,
// draft content/search/image disclosure, shared-teacher lost updates, source version
// reuse, failed publication invalidating live content, stale upstream search hits,
// reader membership revocation, and widened private/course source authorization.
const companyId = 'cases-school'
const teacher = { companyId, userId: 'cases-teacher' }
const colleague = { companyId, userId: 'cases-colleague' }
const student = { companyId, userId: 'cases-student' }
const peer = { companyId, userId: 'cases-peer' }
const outsider = { companyId: 'cases-other', userId: 'cases-outsider' }
const application = new CasesApplication(pool, {
  transaction: work => withTransaction(pool, work),
  putObject: async (key, body, mime) => { await storage.put(key, body, mime) },
})
const content = (title = 'Geometry'): CaseContent => ({ title, summary: 'Published explanation',
  body: 'A triangle has half the area of its enclosing parallelogram.', cover: null,
  category: 'Mathematics', tags: ['geometry'] })
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
const servers: import('node:http').Server[] = []
const originalNotebookEnabled = process.env.OPEN_NOTEBOOK_ENABLED
before(ensureSchemaOnce)
beforeEach(async () => {
  await resetAllTables()
  await pool.query(`INSERT INTO companies(id,name,slug,type,plan_id)
    VALUES($1,'Cases School',$1,'EDUCATION','plan-education'),($2,'Other School',$2,'EDUCATION','plan-education')`, [companyId, outsider.companyId])
  for (const scope of [teacher, colleague, student, peer, outsider]) {
    await seedUserMembership(scope.userId, scope.companyId, { role: [teacher, colleague, outsider].includes(scope) ? 'TEACHER' : 'STUDENT', isAdmin: false })
  }
  for (const id of ['cases-course', 'cases-other-course']) {
    await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by)
      VALUES($1,$2,'INSTITUTIONAL_COURSE',$1,$3)`, [id, companyId, teacher.userId])
    for (const scope of [teacher, student, peer]) await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role)
      VALUES($1,$2,$3,$4)`, [companyId, id, scope.userId, scope === teacher ? 'TEACHER' : 'STUDENT'])
  }
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('cases-room',$1,'cases-course','group','Cases conversation',$2::jsonb)`, [companyId, JSON.stringify([teacher.userId, student.userId, peer.userId])])
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
})
afterEach(async () => {
  mock.restoreAll()
  for (const server of servers.splice(0)) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  if (originalNotebookEnabled === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
  else process.env.OPEN_NOTEBOOK_ENABLED = originalNotebookEnabled
})
after(() => teardownAll())

async function api(userId: string) {
  const server = (await buildApiTestApp(userId)).listen(0, '127.0.0.1')
  servers.push(server)
  await once(server, 'listening')
  const address = server.address() as import('node:net').AddressInfo
  return (path: string, method = 'GET', body?: unknown, company = companyId) => fetch(`http://127.0.0.1:${address.port}/api${path}`, {
    method, headers: { 'x-company-id': company, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}
async function sourceOf(id: string) {
  return (await pool.query<{ id: string; external_source_id: string | null; deleted_at: string | null; case_version: number; status: string; storage_key: string | null }>(
    'SELECT s.* FROM knowledge_sources s JOIN organization_cases c ON c.source_id=s.id WHERE c.id=$1', [id])).rows[0]!
}
async function publish(title?: string) {
  const draft = await application.create(teacher, content(title))
  return application.publish(teacher, draft.id, draft.version)
}

test('[integration] cases enforce organization teacher writes and published-only student reads at HTTP boundaries', async () => {
  const draft = await application.create(teacher, content())
  assert.equal((await application.list(student)).items.length, 0)
  await assert.rejects(application.detail(student, draft.id))
  await assert.rejects(application.detail(outsider, draft.id))
  const request = await api(student.userId)
  for (const [method, path, input] of [
    ['POST', '/cases', content()], ['PUT', `/cases/${draft.id}`, { ...content(), version: draft.version }],
    ...['publish', 'unpublish', 'retry-index'].map(action => ['POST', `/cases/${draft.id}/${action}`, { version: draft.version }]),
    ['POST', `/cases/${draft.id}/images`, { mime: 'image/png', data: png }],
  ] as [string, string, unknown][]) assert.ok([403, 404].includes((await request(path, method, input)).status), path)
  assert.equal((await request(`/cases/${draft.id}`)).status, 404)
  const foreign = await api(outsider.userId)
  assert.equal((await foreign(`/cases/${draft.id}`, 'GET', undefined, outsider.companyId)).status, 404)
  assert.ok([403, 404].includes((await foreign('/cases', 'GET', undefined, companyId)).status))
  // The colleague has no membership in either course. Organization role owns maintenance.
  const edited = await application.save(colleague, draft.id, content('Colleague article'), draft.version)
  const live = await application.publish(colleague, draft.id, edited.version)
  assert.equal((await application.detail(student, draft.id)).title, 'Colleague article')
  assert.equal(live.canManage, true)
  await assert.rejects(application.save(teacher, draft.id, content('Lost update'), draft.version), { status: 409 })
})

test('[integration] draft edits do not alter public article, search, categories, or active index until explicit publication', async () => {
  const live = await publish()
  const originalSource = await sourceOf(live.id)
  const edited = await application.save(colleague, live.id, { ...content('Secret draft title'), body: 'Secret draft body', category: 'Secret category' }, live.version)
  assert.equal(edited.hasUnpublishedChanges, true)
  assert.equal((await application.detail(student, live.id)).title, 'Geometry')
  assert.equal((await application.list(student, 'Secret')).items.length, 0)
  assert.deepEqual((await application.list(student)).categories, ['Mathematics'])
  assert.equal((await application.list(student, '', 'Secret category')).items.length, 0)
  assert.equal((await sourceOf(live.id)).id, originalSource.id)
  const next = await application.publish(teacher, live.id, edited.version)
  const newSource = await sourceOf(live.id)
  assert.notEqual(newSource.id, originalSource.id)
  assert.equal(newSource.case_version, next.publishedVersion)
  assert.equal((await application.list(student, 'Secret')).items.length, 1)
  assert.ok((await pool.query('SELECT deleted_at FROM knowledge_sources WHERE id=$1', [originalSource.id])).rows[0].deleted_at)
  assert.equal((await pool.query('SELECT status FROM knowledge_source_jobs WHERE source_id=$1', [originalSource.id])).rows[0].status, 'failed')
  const off = await application.unpublish(colleague, live.id, next.version)
  assert.equal(off.status, 'unpublished')
  assert.equal((await application.list(student)).items.length, 0)
  await assert.rejects(application.detail(student, live.id))
  await assert.rejects(application.retry(teacher, live.id, off.version), { status: 409 })
})

test('[integration] managed case images follow the published snapshot, organization and current role even with generic upload grants', async () => {
  const draft = await application.create(teacher, content())
  const first = await application.uploadImage(teacher, draft.id, 'image/png', png)
  assert.equal(await canReadCaseFile(pool, first.key, student.userId), false)
  assert.equal(await canReadCaseFile(pool, first.key, colleague.userId), true)
  const saved = await application.save(teacher, draft.id, { ...content(), cover: first.url, body: `![Figure](${first.url})\n\nExplanation` }, draft.version)
  const live = await application.publish(teacher, draft.id, saved.version)
  assert.equal(await canReadCaseFile(pool, first.key, student.userId), true)
  assert.equal(await canReadCaseFile(pool, first.key, outsider.userId), false)
  const second = await application.uploadImage(colleague, draft.id, 'image/png', png)
  const pending = await application.save(colleague, draft.id, { ...content(), cover: second.url }, live.version)
  // Forged unrelated upload grants must not override the dedicated case-image authorization.
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,user_id,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`, [second.key, companyId, student.userId])
  const request = await api(student.userId)
  assert.equal((await request(first.url.slice('/api'.length))).status, 200)
  assert.equal((await request(second.url.slice('/api'.length))).status, 404)
  const other = await application.create(teacher, content('Another case'))
  await assert.rejects(application.save(teacher, other.id, { ...content(), cover: first.url }, other.version), { status: 400 })
  await assert.rejects(application.save(teacher, other.id, { ...content(), body: '![private](/api/files?key=attachments%2Fprivate)' }, other.version), { status: 400 })
  await assert.rejects(application.uploadImage(teacher, draft.id, 'image/png', Buffer.from('<svg/>').toString('base64')), { status: 400 })
  const updated = await application.publish(teacher, draft.id, pending.version)
  assert.equal((await request(first.url.slice('/api'.length))).status, 404)
  assert.equal((await request(second.url.slice('/api'.length))).status, 200)
  await application.unpublish(teacher, draft.id, updated.version)
  assert.equal((await request(second.url.slice('/api'.length))).status, 404)
  await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [companyId, colleague.userId])
  assert.equal(await canReadCaseFile(pool, second.key, colleague.userId), false)
})

test('[integration] failed publish keeps the prior public version and concurrent teacher saves cannot overwrite each other', async () => {
  const live = await publish()
  const oldSource = await sourceOf(live.id)
  const saved = await application.save(teacher, live.id, content('Next version'), live.version)
  const broken = new CasesApplication(pool, { transaction: work => withTransaction(pool, work), putObject: async () => { throw new Error('Storage temporarily unavailable') } })
  await assert.rejects(broken.publish(teacher, live.id, saved.version), /Storage temporarily unavailable/)
  assert.equal((await application.detail(student, live.id)).title, 'Geometry')
  assert.equal((await sourceOf(live.id)).id, oldSource.id)
  assert.equal((await sourceOf(live.id)).deleted_at, null)
  const updates = await Promise.allSettled([application.save(teacher, live.id, content('Teacher A'), saved.version), application.save(colleague, live.id, content('Teacher B'), saved.version)])
  assert.equal(updates.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(updates.filter(result => result.status === 'rejected').length, 1)
})

async function readySource(id: string) {
  const source = await sourceOf(id)
  await pool.query("UPDATE knowledge_sources SET status='ready',stage='ready',external_source_id=$2 WHERE id=$1", [source.id, `external-${source.id}`])
  return { ...source, external_source_id: `external-${source.id}` }
}
function recordNotebook() {
  mock.method(openNotebookClient, 'createNotebook', async (input: { externalKey: string }) => ({ id: `notebook-${input.externalKey}`, name: 'Test notebook', description: '', archived: false }))
}
const retrieval = () => ({ companyId, conversationId: 'cases-room', authorizationUserId: student.userId, query: 'geometry' })

test('[integration] organization retrieval uses only the current published source and rejects retained vectors after update or unpublish', async () => {
  recordNotebook()
  const live = await publish()
  const first = await readySource(live.id)
  let providerHits = [{ id: 'old-chunk', parent_id: first.external_source_id, content: 'old published text' }]
  const searches = mock.method(openNotebookClient, 'search', async () => providerHits)
  let result = await retrieveKnowledgeState(retrieval())
  assert.equal(result.citations[0]?.sourceId, first.id)
  assert.equal(result.citations[0]?.sourceUrl, `/cases/${live.id}?company=${companyId}`)
  assert.ok(searches.mock.calls.every(call => call.arguments[0]?.sourceIds.includes(first.external_source_id)))
  const pending = await application.save(teacher, live.id, content('Changed body'), live.version)
  assert.equal((await retrieveKnowledgeState(retrieval())).citations[0]?.sourceId, first.id)
  const updated = await application.publish(teacher, live.id, pending.version)
  result = await retrieveKnowledgeState(retrieval())
  assert.equal(result.status, 'processing')
  assert.equal(result.citations.length, 0)
  const second = await readySource(live.id)
  providerHits = [...providerHits, { id: 'current-chunk', parent_id: second.external_source_id, content: 'new published text' }]
  result = await retrieveKnowledgeState(retrieval())
  assert.deepEqual(result.citations.map(c => c.sourceId), [second.id])
  assert.equal((await listCaseRetrievalSources(pool, outsider.companyId)).length, 0)
  // Simulate removal while the external search is in flight, before results are accepted.
  let unpublish: Promise<unknown> | undefined
  mock.method(openNotebookClient, 'search', async () => {
    unpublish ??= application.unpublish(colleague, live.id, updated.version)
    await unpublish
    return providerHits
  })
  assert.equal((await retrieveKnowledgeState(retrieval())).citations.length, 0)
  assert.equal((await listCaseRetrievalSources(pool, companyId)).length, 0)
  assert.equal((await retrieveKnowledgeState(retrieval())).status, 'no_sources')
  assert.ok((await pool.query('SELECT external_source_id FROM knowledge_sources WHERE id=$1', [second.id])).rows[0].external_source_id,
    'the vector still exists upstream; PostgreSQL publication state is the retrieval gate')
})

test('[integration] case retrieval preserves course/private audience intersection and revocation across external search', async () => {
  recordNotebook()
  const live = await publish()
  const source = await readySource(live.id)
  for (const [id, project, visibility, owner] of [
    ['class-public', 'cases-course', 'PROJECT', teacher.userId],
    ['my-private', 'cases-course', 'PRIVATE', student.userId],
    ['peer-private', 'cases-course', 'PRIVATE', peer.userId],
    ['other-course', 'cases-other-course', 'PROJECT', teacher.userId],
  ]) await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,kind,title,visibility_scope,owner_user_id,created_by_user_id,created_via,status,external_source_id)
    VALUES($1,$2,$3,'text',$1,$4,$5,$5,'USER','ready','external-'||$1)`, [id, companyId, project, visibility, owner])
  const searches = mock.method(openNotebookClient, 'search', async (input: { sourceIds: string[] }) => input.sourceIds.map(id => ({ id: `chunk-${id}`, parent_id: id, content: id })))
  let result = await retrieveKnowledgeState(retrieval())
  assert.deepEqual(new Set(result.citations.map(c => c.sourceId)), new Set([source.id, 'class-public', 'my-private']))
  result = await retrieveKnowledgeState({ ...retrieval(), audienceUserIds: [student.userId, peer.userId] })
  assert.deepEqual(new Set(result.citations.map(c => c.sourceId)), new Set([source.id, 'class-public']))
  assert.ok(searches.mock.calls.every(call => !call.arguments[0].sourceIds.includes('external-other-course') && !call.arguments[0].sourceIds.includes('external-peer-private')))
  const request = await api(teacher.userId)
  assert.equal((await request(`/projects/cases-course/sources/${source.id}`)).status, 404)
  assert.equal((await request(`/projects/cases-course/sources/${source.id}`, 'DELETE')).status, 404)
  // A frozen conversation reader losing organization access while search runs removes cases.
  let revoke: Promise<unknown> | undefined
  mock.method(openNotebookClient, 'search', async (input: { sourceIds: string[] }) => {
    revoke ??= pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [companyId, peer.userId])
    await revoke
    return input.sourceIds.map(id => ({ id: `chunk-${id}`, parent_id: id, content: id }))
  })
  result = await retrieveKnowledgeState({ ...retrieval(), audienceUserIds: [student.userId, peer.userId] })
  assert.equal(result.citations.some(c => c.sourceId === source.id), false)
  await assert.rejects(retrieveKnowledgeState({ ...retrieval(), audienceUserIds: [outsider.userId] }))
})

test('[integration] cases use existing worker ingestion, bounded failure/retry and invalidated lease fencing', async () => {
  recordNotebook()
  const createdBodies: string[] = []
  let fail = true
  mock.method(openNotebookClient, 'createTextSource', async (input: { idempotencyKey: string; content: string }) => {
    createdBodies.push(input.content)
    if (fail) throw new Error('Synthetic index outage')
    return { id: `external-${input.idempotencyKey}`, status: 'ready', embedded_chunks: 1 }
  })
  const live = await publish()
  const first = await sourceOf(live.id)
  for (let attempt = 0; attempt < 5; attempt++) {
    await pool.query('UPDATE knowledge_source_jobs SET available_at=NOW() WHERE source_id=$1', [first.id])
    assert.equal(await runKnowledgeWorkerOnce('case-fixture-worker'), true)
  }
  assert.equal((await sourceOf(live.id)).status, 'failed')
  assert.equal((await retrieveKnowledgeState(retrieval())).citations.length, 0)
  await application.retry(colleague, live.id, live.version)
  fail = false
  assert.equal(await runKnowledgeWorkerOnce('case-fixture-worker'), true)
  assert.equal((await sourceOf(live.id)).status, 'ready')
  assert.ok(createdBodies.every(body => body.includes('A triangle has half the area')))
  const pending = await application.save(teacher, live.id, { ...content('New article'), body: 'A completely new published explanation.' }, live.version)
  const published = await application.publish(teacher, live.id, pending.version)
  const second = await sourceOf(live.id)
  let unpublished = false
  mock.method(openNotebookClient, 'createTextSource', async (input: { idempotencyKey: string }) => {
    await application.unpublish(teacher, live.id, published.version)
    unpublished = true
    return { id: `external-${input.idempotencyKey}`, status: 'ready', embedded_chunks: 1 }
  })
  assert.equal(await runKnowledgeWorkerOnce('case-fixture-worker'), true)
  assert.equal(unpublished, true)
  assert.ok((await pool.query('SELECT deleted_at FROM knowledge_sources WHERE id=$1', [second.id])).rows[0].deleted_at)
  assert.equal((await listCaseRetrievalSources(pool, companyId)).length, 0)
  assert.equal((await retrieveKnowledgeState(retrieval())).citations.length, 0)
})

test('[integration] publication, removal and retry share worker job-before-source lock order', async () => {
  for (const action of ['publish', 'unpublish', 'retry'] as const) {
    const live = await publish(`Lock ordering ${action}`)
    const source = await sourceOf(live.id)
    const worker = await pool.connect()
    let mutation: Promise<{ error?: unknown }> | undefined
    try {
      await worker.query('BEGIN')
      await worker.query("SET LOCAL lock_timeout='1500ms'")
      await worker.query("UPDATE knowledge_source_jobs SET status='processing' WHERE source_id=$1", [source.id])
      mutation = application[action](teacher, live.id, live.version).then(() => ({}), error => ({ error }))
      const deadline = Date.now() + 5_000
      let waiting = false
      while (Date.now() < deadline) {
        waiting = (await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
          AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%UPDATE knowledge_source_jobs%'`)).rows.length > 0
        if (waiting) break
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.equal(waiting, true, `${action} reaches the worker-owned job lock`)
      // This would time out/deadlock if the teacher locked source before waiting for job.
      await worker.query("UPDATE knowledge_sources SET status='ready',stage='ready' WHERE id=$1", [source.id])
      await worker.query('COMMIT')
      const result = await mutation
      assert.equal(result.error, undefined, `${action} completes after worker releases the job`)
    } finally {
      await worker.query('ROLLBACK')
      worker.release()
      await mutation
    }
  }
})

// Agent boundary failures: published cases missing from the course-only version
// map, replay rejected by generic source authorization, draft leakage through
// read_source, stale publication versions, forged versions, foreign organizations,
// an audience member losing access, and case reads widening course write policies.
async function caseAgent() {
  const agentId = 'cases-knowledge-agent', members = [student.userId, peer.userId, agentId]
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,capabilities)
    VALUES($1,$2,'agent','Case reader','C','#123456','avail','["knowledge"]')`, [agentId, companyId])
  await pool.query('UPDATE conversations SET members=$2::jsonb WHERE id=$1', ['cases-room', JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id)
    VALUES('cases-room',$1,$2::jsonb,$3)`, [companyId, JSON.stringify({ channelType: 2, members }), agentId])
  const work: ActionContext['work'] = { id: 'case-evidence-work', tenantId: companyId, agentId, principalId: student.userId,
    sessionId: 'cases-room', kind: 'turn', lane: 'interactive', triggerRef: 'case-question', fence: 1, homeEpoch: 1,
    createdAt: new Date().toISOString(), meta: { conversationId: 'cases-room', text: 'Explain geometry' },
    conversation: { conversationId: 'cases-room', source: { messageId: 'case-question' }, audience: { participantIds: members } } as ActionContext['work']['conversation'] }
  const unexpected = async (): Promise<never> => { throw new Error('Unexpected side effect in case read') }
  const context = (action: string): ActionContext => ({ work, database: pool, signal: new AbortController().signal, requestVersion: 1,
    writeMemory: unexpected, forgetMemory: unexpected, requestSnapshot: unexpected, enqueueGraph: unexpected, readGraph: unexpected,
    waitForChildren: unexpected, createSharedState: unexpected, readSharedState: unexpected, updateSharedState: unexpected,
    enqueueChild: unexpected, readChild: unexpected, cancelChild: unexpected, reviseChild: unexpected, createArtifact: unexpected,
    deadlineAt: new Date(Date.now()+30_000).toISOString(), action: { runId: work.id, cellId: action, callIndex: 0, idempotencyKey: action, action, args: {} } })
  const invoke = async (action: string, args: Record<string, unknown>) => {
    const tool = knowledgeTools.find(tool => tool.action === action)!, ctx = context(action), input = tool.parse(args)
    await tool.authorize(ctx, input)
    return tool.execute(ctx, input)
  }
  const provider = createProductContext(knowledgeTools).contextProvider
  const request = (evidence: NonNullable<Awaited<ReturnType<typeof invoke>>['evidence']>): RequestSnapshot => ({
    version: 1, workId: work.id, tenantId: companyId, sessionId: work.sessionId, authorId: student.userId,
    sourceRef: 'case-question', originalText: 'Explain geometry', attachments: [], revisions: [],
    evidence: { version: 1, id: 'case-evidence', items: evidence.map((item, index) => ({ ...item, marker: `S${index+1}` })) },
  })
  return { work, invoke, request, load: () => provider.loadContext(work), authorize: (snapshot: RequestSnapshot) => provider.authorizeRequest!(work, snapshot) }
}

test('[integration] real Agent knowledge tools consume published case evidence without widening generic source writes', async () => {
  recordNotebook()
  const live = await publish(), source = await readySource(live.id), agent = await caseAgent()
  mock.method(openNotebookClient, 'search', async () => [{ id: 'case-chunk', parent_id: source.external_source_id, content: 'A triangle has half the area.' }])
  const search = await agent.invoke('knowledge.search', { query: 'triangle' })
  assert.equal(search.evidence?.[0].sourceId, source.id)
  await agent.authorize(agent.request(search.evidence!))
  // Automatic first-turn retrieval must freeze the same publication version as
  // explicit tool results, or the subsequent session authorization rejects it.
  installFakeWukong()
  const automatic = await agent.load()
  assert.equal(automatic.evidence![0].sourceVersion, search.evidence![0].sourceVersion)
  await agent.authorize(agent.request(automatic.evidence!))
  await application.save(teacher, live.id, { ...content(), body: 'Secret unpublished replacement' }, live.version)
  const read = await agent.invoke('knowledge.read_source', { sourceId: source.id, limit: 16000 })
  assert.match(read.evidence![0].excerpt, /enclosing parallelogram/)
  assert.doesNotMatch(read.evidence![0].excerpt, /Secret unpublished/)
  assert.equal(read.evidence![0].sourceVersion, search.evidence![0].sourceVersion)
  await agent.authorize(agent.request(read.evidence!))
  const forged = agent.request(search.evidence!)
  forged.evidence.items[0].sourceVersion = 'forged-version'
  await assert.rejects(agent.authorize(forged))
  const generic = await api(teacher.userId)
  assert.equal((await generic(`/projects/cases-course/sources/${source.id}`)).status, 404)
  await assert.rejects(agent.invoke('knowledge.delete_source', { sourceId: source.id }))
})

test('[integration] Agent case evidence is rejected after republish, unpublish and audience revocation', async () => {
  recordNotebook()
  const live = await publish(), first = await readySource(live.id), agent = await caseAgent()
  let hits = [{ id: 'case-old', parent_id: first.external_source_id, content: 'A triangle has half the area.' }]
  mock.method(openNotebookClient, 'search', async () => hits)
  const frozen = agent.request((await agent.invoke('knowledge.search', { query: 'triangle' })).evidence!)
  await agent.authorize(frozen)
  const updated = await application.publish(colleague, live.id, live.version), second = await readySource(live.id)
  await assert.rejects(agent.authorize(frozen))
  await assert.rejects(agent.invoke('knowledge.read_source', { sourceId: first.id }))
  hits = [...hits, { id: 'case-new', parent_id: second.external_source_id, content: 'The current published explanation.' }]
  const current = await agent.invoke('knowledge.search', { query: 'triangle' })
  assert.deepEqual(current.evidence!.map(item => item.sourceId), [second.id])
  const snapshot = agent.request(current.evidence!)
  await agent.authorize(snapshot)
  await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [companyId, peer.userId])
  await assert.rejects(agent.authorize(snapshot))
  await assert.rejects(agent.invoke('knowledge.read_source', { sourceId: second.id }))
  await pool.query("UPDATE company_memberships SET status='ACTIVE' WHERE company_id=$1 AND user_id=$2", [companyId, peer.userId])
  const foreignDraft = await application.create(outsider, content('Foreign case'))
  const foreign = await application.publish(outsider, foreignDraft.id, foreignDraft.version)
  const foreignSource = await readySource(foreign.id)
  const injected = agent.request(current.evidence!)
  injected.evidence.items[0].sourceId = foreignSource.id
  await assert.rejects(agent.authorize(injected))
  await assert.rejects(agent.invoke('knowledge.read_source', { sourceId: foreignSource.id }))
  await application.unpublish(teacher, live.id, updated.version)
  await assert.rejects(agent.authorize(snapshot))
  await assert.rejects(agent.invoke('knowledge.read_source', { sourceId: second.id }))
  assert.equal((await agent.invoke('knowledge.search', { query: 'triangle' })).evidence?.length, 0)
})

test('[integration] context reauthorizes current case source versions independently of course knowledge resources', async () => {
  const live = await publish(), source = await readySource(live.id), agent = await caseAgent()
  const snapshot = agent.request([{ sourceId: source.id, sourceVersion: `case:${live.id}:${live.publishedVersion}`,
    title: live.title, chunkId: 'case-chunk', excerpt: 'Published explanation', truncated: true }])
  await agent.authorize(snapshot)
  await application.unpublish(teacher, live.id, live.version)
  await assert.rejects(agent.authorize(snapshot))
})
