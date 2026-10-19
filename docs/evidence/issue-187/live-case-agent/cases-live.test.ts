import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, afterEach, before, beforeEach, mock, test } from 'node:test'
import { pool } from '../../../../server/src/db/pool.js'
import { withTransaction } from '../../../../server/src/db/transaction.js'
import { CasesApplication, canReadCaseFile } from '../../../../server/src/modules/cases/application.js'
import type { CaseContent } from '../../../../server/src/modules/cases/contracts.js'
import { storage } from '../../../../server/src/storage.js'
import { openNotebookClient } from '../../../../server/src/modules/knowledge/provider.js'
import { retrieveKnowledgeState, runKnowledgeWorkerOnce } from '../../../../server/src/modules/knowledge/runtime.js'
import { listCaseRetrievalSources } from '../../../../server/src/modules/knowledge/retrieval-repository.js'
import type { ActionContext, RequestSnapshot } from '@lyyzka/lingxios'
import { knowledgeTools } from '../../../../server/src/modules/knowledge/agent-tools.js'
import { createProductContext } from '../../../../server/src/agent-runtime/context.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll, installFakeWukong } from '../../../../server/src/__integration__/_helpers.ts'

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


async function readySource(id: string) {
  const source = await sourceOf(id)
  await pool.query("UPDATE knowledge_sources SET status='ready',stage='ready',external_source_id=$2 WHERE id=$1", [source.id, `external-${source.id}`])
  return { ...source, external_source_id: `external-${source.id}` }
}
function recordNotebook() {
  mock.method(openNotebookClient, 'createNotebook', async (input: { externalKey: string }) => ({ id: `notebook-${input.externalKey}`, name: 'Test notebook', description: '', archived: false }))
}
const retrieval = () => ({ companyId, conversationId: 'cases-room', authorizationUserId: student.userId, query: 'geometry' })


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

// Failure modes: HTTP provider contracts diverge from mocks; ingestion never
// reaches ready; real case hits fail Agent evidence/version authorization;
// draft/private/foreign text leaks; retained upstream vectors survive unpublish
// or replacement; frozen evidence remains usable after reader revocation.
test('live Notebook case ingestion reaches real Agent tools and rejects stale evidence', { timeout: 120_000 }, async () => {
  installFakeWukong()
  assert.equal(await openNotebookClient.ready(), true)
  const agent = await caseAgent()
  const waitForReady = async (id: string) => {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      const source = await sourceOf(id)
      if (source.status === 'ready') return source
      assert.notEqual(source.status, 'failed')
      await pool.query('UPDATE knowledge_source_jobs SET available_at=NOW() WHERE source_id=$1', [source.id])
      await runKnowledgeWorkerOnce('cases-live-review')
      await new Promise(resolve => setTimeout(resolve, 150))
    }
    throw new Error('Live case ingestion did not become ready')
  }
  const live = await publish('Geometry live contract')
  try {
    const first = await waitForReady(live.id)
    assert.ok(first.external_source_id)
    const search = await agent.invoke('knowledge.search', { query: 'triangle' })
    assert.equal(search.evidence?.[0].sourceId, first.id)
    const frozen = agent.request(search.evidence!)
    await agent.authorize(frozen)
    const automatic = await agent.load()
    assert.equal(automatic.evidence?.[0].sourceVersion, search.evidence![0].sourceVersion)
    await agent.authorize(agent.request(automatic.evidence!))
    const saved = await application.save(teacher, live.id, { ...content(), body: 'Private unpublished revision: tetrahedron.' }, live.version)
    const read = await agent.invoke('knowledge.read_source', { sourceId: first.id })
    assert.match(read.evidence![0].excerpt, /parallelogram/)
    assert.doesNotMatch(read.evidence![0].excerpt, /tetrahedron/)
    assert.equal(read.evidence![0].sourceVersion, search.evidence![0].sourceVersion)
    const republished = await application.publish(colleague, live.id, saved.version)
    const second = await waitForReady(live.id)
    assert.notEqual(second.id, first.id)
    await assert.rejects(agent.authorize(frozen))
    await assert.rejects(agent.invoke('knowledge.read_source', { sourceId: first.id }))
    // Old vectors still exist upstream: PostgreSQL publication state must fence them.
    assert.equal((await openNotebookClient.getSource(first.external_source_id!)).status, 'completed')
    const latest = await agent.invoke('knowledge.search', { query: 'tetrahedron' })
    assert.deepEqual([...new Set(latest.evidence!.map(item => item.sourceId))], [second.id])
    const current = agent.request(latest.evidence!)
    await agent.authorize(current)
    await pool.query("UPDATE company_memberships SET status='SUSPENDED' WHERE company_id=$1 AND user_id=$2", [companyId, peer.userId])
    await assert.rejects(agent.authorize(current))
    await assert.rejects(agent.invoke('knowledge.read_source', { sourceId: second.id }))
    await pool.query("UPDATE company_memberships SET status='ACTIVE' WHERE company_id=$1 AND user_id=$2", [companyId, peer.userId])
    await application.unpublish(teacher, live.id, republished.version)
    assert.equal((await openNotebookClient.getSource(second.external_source_id!)).status, 'completed')
    await assert.rejects(agent.authorize(current))
    await assert.rejects(agent.invoke('knowledge.read_source', { sourceId: second.id }))
    assert.equal((await agent.invoke('knowledge.search', { query: 'tetrahedron' })).evidence?.length, 0)
    console.log(JSON.stringify({ actualNotebookHttp: true, actualSurrealDb: true, actualIngestionWorker: true,
      actualKnowledgeTools: true, actualContextAuthorization: true, publishedDraftIsolation: true,
      replacementRejectsFrozenEvidence: true, unpublishRejectsRetainedVectors: true, audienceRevocation: true,
      embeddings: 'synthetic constant 1024', runtime: '3.5.2 source qualification; not 3.5.3 release acceptance' }))
  } finally {
    const { rows } = await pool.query('SELECT external_source_id FROM knowledge_sources WHERE company_id=$1 AND case_id=$2', [companyId, live.id])
    for (const row of rows) if (row.external_source_id) await openNotebookClient.deleteSource(row.external_source_id)
  }
})
