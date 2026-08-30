import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { ForbiddenError } from '../modules/access/public.js'
import { KnowledgeApplication, KnowledgeApplicationError } from '../modules/knowledge/application.js'
import { ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

const USER_ID = 'u-knowledge-slice'
const COMPANY_ID = 'co-knowledge-slice'
const PROJECT_ID = 'project-knowledge-slice'
const OTHER_COMPANY_ID = 'co-knowledge-other'
const OTHER_PROJECT_ID = 'project-knowledge-other'

const objects = new Map<string, Buffer>()
const application = new KnowledgeApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  notebookEnabled: () => true,
  ensureNotebook: async () => undefined,
  syncNotebookMetadata: async () => undefined,
  sourceText: async () => 'extracted',
  retrySource: async () => undefined,
  deleteSource: async () => undefined,
  putObject: async (key, body) => { objects.set(key, body) },
  presignPut: async (key) => ({ uploadUrl: `https://r2.invalid/${key}` }),
  readObject: async (key) => objects.get(key) ?? Buffer.alloc(0),
  publicUrl: async (key) => `https://r2.invalid/${key}`,
  maxSourceBytes: 25 * 1024 * 1024,
})

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  objects.clear()
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id)
     VALUES ($1,'Knowledge Slice','knowledge-slice','EDUCATION','plan-personal-free'),
            ($2,'Knowledge Other','knowledge-other','EDUCATION','plan-personal-free')`,
    [COMPANY_ID, OTHER_COMPANY_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID)
  await pool.query(
    `INSERT INTO projects (id,company_id,kind,name,color,created_by,is_default)
     VALUES ($1,$2,'INSTITUTIONAL_COURSE','Knowledge Project','#000',$5,FALSE),
            ($3,$4,'INSTITUTIONAL_COURSE','Other Project','#111',$5,FALSE)`,
    [PROJECT_ID, COMPANY_ID, OTHER_PROJECT_ID, OTHER_COMPANY_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES ($1,$2,$3,'OWNER')`,
    [COMPANY_ID, PROJECT_ID, USER_ID],
  )
})
after(async () => { await teardownAll() })

test('[integration] knowledge source creation keeps explicit tenant and project ownership', async () => {
  const projects = await application.projects(COMPANY_ID, USER_ID) as Array<{
    id: string; companyId: string; kind: string; planId: string | null
  }>
  assert.equal(projects.some((project) => project.id === PROJECT_ID), true)
  assert.deepEqual(
    projects.find((project) => project.id === PROJECT_ID),
    { ...projects.find((project) => project.id === PROJECT_ID)!, companyId: COMPANY_ID,
      kind: 'INSTITUTIONAL_COURSE', planId: null },
  )
  const created = await application.createSource(
    { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    null,
    { kind: 'text', idempotencyKey: 'knowledge-text-1', title: 'Strict source', text: 'authoritative text' },
  )
  const queued = await pool.query(`SELECT 1 FROM knowledge_source_jobs WHERE source_id=$1 AND status='queued'`, [created.id])
  assert.equal(queued.rowCount, 1)
  const row = await pool.query<{ company_id: string; project_id: string; storage_key: string }>(
    `SELECT company_id,project_id,storage_key FROM knowledge_sources WHERE id=$1`,
    [created.id],
  )
  assert.equal(row.rows[0]?.company_id, COMPANY_ID)
  assert.equal(row.rows[0]?.project_id, PROJECT_ID)
  assert.equal(objects.get(row.rows[0]?.storage_key ?? '')?.toString('utf8'), 'authoritative text')

  await assert.rejects(
    application.source({ companyId: OTHER_COMPANY_ID, projectId: OTHER_PROJECT_ID, userId: USER_ID }, created.id),
    (error) => error instanceof ForbiddenError && error.status === 404,
  )
})

test('[integration] Project creation fixes kind from the use case and enforces CompanyType', async () => {
  const personalCompanyId = 'co-knowledge-personal'
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,personal_owner_user_id,plan_id)
     VALUES($1,'Personal Learning','knowledge-personal','PERSONAL',$2,'plan-personal-free')`,
    [personalCompanyId, USER_ID],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role) VALUES($1,$2,'OWNER')`,
    [personalCompanyId, USER_ID],
  )
  const created = await application.createPersonalLearningProject({
    companyId: personalCompanyId,
    userId: USER_ID,
    name: '考研数学',
    description: '个人学习空间',
  })
  assert.equal(created.kind, 'PERSONAL_LEARNING')
  assert.equal(created.companyId, personalCompanyId)
  assert.equal(created.planId, null)
  assert.equal(created.isDefault, false)
  await assert.rejects(
    application.createPersonalLearningProject({
      companyId: COMPANY_ID,
      userId: USER_ID,
      name: 'Invalid',
      description: '',
    }),
    (error) => error instanceof KnowledgeApplicationError && error.code === 'forbidden',
  )
})

test('[integration] presigned upload confirmation rejects a mismatched R2 object size', async () => {
  const scope = { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }
  const pending = await application.presignSource(scope, null, {
    idempotencyKey: 'knowledge-file-1', name: 'source.txt', mime: 'text/plain', size: 5,
  })
  const source = await pool.query<{ storage_key: string }>(
    `SELECT storage_key FROM knowledge_sources WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [pending.id, COMPANY_ID, PROJECT_ID],
  )
  objects.set(source.rows[0]?.storage_key ?? '', Buffer.from('bad'))
  await assert.rejects(
    application.completeUpload(scope, pending.id),
    (error) => error instanceof KnowledgeApplicationError && error.code === 'upload_size_mismatch',
  )
  const queued = await pool.query(`SELECT 1 FROM knowledge_source_jobs WHERE source_id=$1`, [pending.id])
  assert.equal(queued.rowCount, 0)
})

test('[integration] conversation source selection accepts only same-tenant project sources', async () => {
  const own = await application.createSource(
    { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }, null,
    { kind: 'url', idempotencyKey: 'knowledge-url-1', url: 'https://example.com/own' },
  )
  const foreignId = 'ks-foreign-source'
  await pool.query(
    `INSERT INTO knowledge_sources
       (id,company_id,project_id,kind,title,size_bytes,status,stage,created_by)
     VALUES ($1,$2,$3,'url','Foreign',0,'queued','queued',$4)`,
    [foreignId, OTHER_COMPANY_ID, OTHER_PROJECT_ID, USER_ID],
  )
  const conversationId = 'knowledge-selection-conversation'
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id,project_id)
     VALUES ($1,'group','Knowledge selection',$2::jsonb,$3,$4)`,
    [conversationId, JSON.stringify([USER_ID]), COMPANY_ID, PROJECT_ID],
  )
  const result = await application.selectSources(
    { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    conversationId,
    [own.id, foreignId],
  )
  assert.deepEqual(result.excludedSourceIds, [own.id])
  const exclusions = await pool.query<{ source_id: string }>(
    `SELECT source_id FROM conversation_source_exclusions WHERE conversation_id=$1`,
    [conversationId],
  )
  assert.deepEqual(exclusions.rows.map((row) => row.source_id), [own.id])
})
