import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { ForbiddenError } from '../modules/access/public.js'
import { KnowledgeApplication, KnowledgeApplicationError } from '../modules/knowledge/application.js'
import { MAX_SOURCE_BYTES } from '../modules/knowledge/policy.js'
import {
  claimIngestionJob,
  completeIngestion,
  markExternalSource,
  recordIngestionFailure,
} from '../modules/knowledge/ingestion-repository.js'
import {
  findKnowledgeRetrievalProject,
  listKnowledgeRetrievalSources,
} from '../modules/knowledge/retrieval-repository.js'
import { ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll } from './_helpers.js'

const USER_ID = 'u-knowledge-slice'
const STUDENT_A_ID = 'u-knowledge-student-a'
const STUDENT_B_ID = 'u-knowledge-student-b'
const TEACHER_ID = 'u-knowledge-teacher'
const TA_ID = 'u-knowledge-ta'
const COMPANY_ID = 'co-knowledge-slice'
const PROJECT_ID = 'project-knowledge-slice'
const SAME_COMPANY_PROJECT_ID = 'project-knowledge-same-company'
const OTHER_COMPANY_ID = 'co-knowledge-other'
const OTHER_PROJECT_ID = 'project-knowledge-other'

const objects = new Map<string, Buffer>()
const objectSizes = new Map<string, number>()
const objectMimes = new Map<string, string>()
const sourceTextCalls: string[] = []
const retryCalls: string[] = []
const deleteCalls: string[] = []
const application = new KnowledgeApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  notebookEnabled: () => true,
  ensureNotebook: async () => undefined,
  syncNotebookMetadata: async () => undefined,
  sourceText: async (sourceId) => { sourceTextCalls.push(sourceId); return 'extracted' },
  retrySource: async (sourceId) => { retryCalls.push(sourceId) },
  deleteSource: async (sourceId) => { deleteCalls.push(sourceId) },
  putObject: async (key, body, mime) => {
    objects.set(key, body); objectSizes.set(key, body.byteLength); objectMimes.set(key, mime)
  },
  presignPut: async (key, mime) => {
    objectMimes.set(key, mime)
    return { uploadUrl: `https://r2.invalid/${key}` }
  },
  statObject: async (key) => ({
    sizeBytes: objectSizes.get(key) ?? objects.get(key)?.byteLength ?? 0,
    contentType: objectMimes.get(key) ?? null,
  }),
  publicUrl: async (key) => `https://r2.invalid/${key}`,
  maxSourceBytes: MAX_SOURCE_BYTES,
})

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  objects.clear()
  objectSizes.clear()
  objectMimes.clear()
  sourceTextCalls.length = 0
  retryCalls.length = 0
  deleteCalls.length = 0
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id)
     VALUES ($1,'Knowledge Slice','knowledge-slice','EDUCATION','plan-personal-free'),
            ($2,'Knowledge Other','knowledge-other','EDUCATION','plan-personal-free')`,
    [COMPANY_ID, OTHER_COMPANY_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID)
  for (const userId of [STUDENT_A_ID, STUDENT_B_ID, TEACHER_ID, TA_ID]) {
    await seedUserMembership(userId, COMPANY_ID)
  }
  await seedUserMembership(STUDENT_A_ID, OTHER_COMPANY_ID)
  await pool.query(
    `INSERT INTO projects (id,company_id,kind,name,color,created_by,is_default)
     VALUES ($1,$2,'INSTITUTIONAL_COURSE','Knowledge Project','#000',$6,FALSE),
            ($3,$2,'INSTITUTIONAL_COURSE','Same Company Project','#222',$6,FALSE),
            ($4,$5,'INSTITUTIONAL_COURSE','Other Project','#111',$6,FALSE)`,
    [PROJECT_ID, COMPANY_ID, SAME_COMPANY_PROJECT_ID, OTHER_PROJECT_ID, OTHER_COMPANY_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES ($1,$2,$3,'OWNER'),
            ($1,$2,$4,'STUDENT'),
            ($1,$2,$5,'STUDENT'),
            ($1,$2,$6,'TEACHER'),
            ($1,$2,$7,'TA'),
            ($1,$8,$3,'OWNER'),
            ($1,$8,$4,'STUDENT'),
            ($9,$10,$4,'STUDENT')`,
    [COMPANY_ID, PROJECT_ID, USER_ID, STUDENT_A_ID, STUDENT_B_ID, TEACHER_ID, TA_ID,
      SAME_COMPANY_PROJECT_ID, OTHER_COMPANY_ID, OTHER_PROJECT_ID],
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
  const row = await pool.query<{
    company_id: string
    project_id: string
    storage_key: string
    visibility_scope: string
    owner_user_id: string
    created_by_user_id: string
    created_via: string
  }>(
    `SELECT company_id,project_id,storage_key,visibility_scope,owner_user_id,created_by_user_id,created_via
       FROM knowledge_sources WHERE id=$1`,
    [created.id],
  )
  const persisted = row.rows[0]!
  const { storage_key: storageKey, ...ownership } = persisted
  assert.deepEqual(ownership, {
    company_id: COMPANY_ID,
    project_id: PROJECT_ID,
    visibility_scope: 'PROJECT',
    owner_user_id: USER_ID,
    created_by_user_id: USER_ID,
    created_via: 'USER',
  })
  assert.equal(objects.get(storageKey)?.toString('utf8'), 'authoritative text')

  await application.editSource(
    { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    created.id,
    { title: 'Renamed source' },
  )
  const renamed = await pool.query<{ title: string }>(
    `SELECT title FROM knowledge_sources WHERE id=$1`,
    [created.id],
  )
  assert.equal(renamed.rows[0]?.title, 'Renamed source')

  await assert.rejects(
    application.source({ companyId: OTHER_COMPANY_ID, projectId: OTHER_PROJECT_ID, userId: USER_ID }, created.id),
    (error) => error instanceof ForbiddenError && error.status === 404,
  )
})

test('[integration] direct Agent retrieval resolves only for the authorized conversation member', async () => {
  const conversationId = 'knowledge-direct-authorization'
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id,project_id)
     VALUES ($1,'direct','Private Agent',$2::jsonb,$3,$4)`,
    [conversationId, JSON.stringify([STUDENT_A_ID, 'agent-private']), COMPANY_ID, PROJECT_ID],
  )

  assert.equal(
    await findKnowledgeRetrievalProject(pool, COMPANY_ID, conversationId, STUDENT_A_ID),
    PROJECT_ID,
  )
  assert.equal(
    await findKnowledgeRetrievalProject(pool, COMPANY_ID, conversationId, STUDENT_B_ID),
    null,
  )
})

test('[integration] Source authorization is PROJECT plus only the current user PRIVATE scope', async () => {
  const studentPrivate = await application.createSource(
    { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    null,
    { kind: 'text', idempotencyKey: 'student-a-private', title: 'Student A private', text: 'private A' },
  )
  const otherStudentPrivate = await application.createSource(
    { userId: STUDENT_B_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    null,
    { kind: 'text', idempotencyKey: 'student-b-private', title: 'Student B private', text: 'private B' },
  )
  const taPrivate = await application.createSource(
    { userId: TA_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    null,
    { kind: 'text', idempotencyKey: 'ta-private', title: 'TA private', text: 'private TA' },
  )
  const teacherProject = await application.createSource(
    { userId: TEACHER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    null,
    { kind: 'text', idempotencyKey: 'teacher-project', title: 'Teacher project', text: 'class source' },
  )
  const sourceIds = [studentPrivate.id, otherStudentPrivate.id, taPrivate.id, teacherProject.id]
  await pool.query(
    `UPDATE knowledge_sources
        SET status='ready',stage='ready',external_source_id='external-' || id
      WHERE id=ANY($1::text[])`,
    [sourceIds],
  )

  const provenance = await pool.query<{
    id: string
    visibility_scope: string
    owner_user_id: string
    created_by_user_id: string
    created_via: string
  }>(
    `SELECT id,visibility_scope,owner_user_id,created_by_user_id,created_via
       FROM knowledge_sources WHERE id=ANY($1::text[]) ORDER BY id`,
    [sourceIds],
  )
  assert.deepEqual(provenance.rows, [
    { id: studentPrivate.id, visibility_scope: 'PRIVATE', owner_user_id: STUDENT_A_ID,
      created_by_user_id: STUDENT_A_ID, created_via: 'USER' },
    { id: otherStudentPrivate.id, visibility_scope: 'PRIVATE', owner_user_id: STUDENT_B_ID,
      created_by_user_id: STUDENT_B_ID, created_via: 'USER' },
    { id: taPrivate.id, visibility_scope: 'PRIVATE', owner_user_id: TA_ID,
      created_by_user_id: TA_ID, created_via: 'USER' },
    { id: teacherProject.id, visibility_scope: 'PROJECT', owner_user_id: TEACHER_ID,
      created_by_user_id: TEACHER_ID, created_via: 'USER' },
  ].sort((left, right) => left.id.localeCompare(right.id)))

  const idsVisibleTo = async (userId: string) => (
    await application.sources({ userId, companyId: COMPANY_ID, projectId: PROJECT_ID })
  ).map((source) => String(source.id)).sort()
  assert.deepEqual(await idsVisibleTo(STUDENT_A_ID), [studentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await idsVisibleTo(STUDENT_B_ID), [otherStudentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await idsVisibleTo(TA_ID), [taPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await idsVisibleTo(TEACHER_ID), [teacherProject.id])
  assert.deepEqual(await idsVisibleTo(USER_ID), [teacherProject.id])

  const retrievalConversationId = 'knowledge-retrieval-authorization'
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id,project_id)
     VALUES ($1,'group','Knowledge retrieval authorization',$2::jsonb,$3,$4)`,
    [retrievalConversationId, JSON.stringify([
      STUDENT_A_ID, STUDENT_B_ID, TEACHER_ID, TA_ID, USER_ID,
    ]), COMPANY_ID, PROJECT_ID],
  )
  const retrievalIdsFor = async (authorizationUserId: string) => (
    await listKnowledgeRetrievalSources(pool, {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      conversationId: retrievalConversationId,
      authorizationUserId,
    })
  ).map((source) => source.id).sort()
  assert.deepEqual(await retrievalIdsFor(STUDENT_A_ID), [studentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await retrievalIdsFor(STUDENT_B_ID), [otherStudentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await retrievalIdsFor(TEACHER_ID), [teacherProject.id])
  assert.deepEqual(await retrievalIdsFor(TA_ID), [taPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await retrievalIdsFor(USER_ID), [teacherProject.id])

  for (const actorUserId of [STUDENT_B_ID, USER_ID, TEACHER_ID, TA_ID]) {
    const actorScope = { userId: actorUserId, companyId: COMPANY_ID, projectId: PROJECT_ID }
    await assert.rejects(
      application.source(actorScope, studentPrivate.id),
      (error) => error instanceof KnowledgeApplicationError && error.code === 'not_found',
    )
    await assert.rejects(
      application.retry(actorScope, studentPrivate.id),
      (error) => error instanceof ForbiddenError && error.status === 404,
    )
    await assert.rejects(
      application.delete(actorScope, studentPrivate.id),
      (error) => error instanceof ForbiddenError && error.status === 404,
    )
  }
  assert.deepEqual({ sourceTextCalls, retryCalls, deleteCalls }, {
    sourceTextCalls: [], retryCalls: [], deleteCalls: [],
  })

  for (const foreignScope of [
    { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: SAME_COMPANY_PROJECT_ID },
    { userId: STUDENT_A_ID, companyId: OTHER_COMPANY_ID, projectId: OTHER_PROJECT_ID },
  ]) {
    await assert.rejects(
      application.source(foreignScope, studentPrivate.id),
      (error) => error instanceof KnowledgeApplicationError && error.code === 'not_found',
    )
  }
  assert.deepEqual(sourceTextCalls, [])

  const ownSource = await application.source(
    { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    studentPrivate.id,
  )
  assert.equal(ownSource.extractedText, 'extracted')
  await application.retry(
    { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    studentPrivate.id,
  )
  await application.delete(
    { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    studentPrivate.id,
  )
  assert.deepEqual({ sourceTextCalls, retryCalls, deleteCalls }, {
    sourceTextCalls: [studentPrivate.id],
    retryCalls: [studentPrivate.id],
    deleteCalls: [studentPrivate.id],
  })
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

test('[integration] presigned upload confirmation rejects an oversized object from HEAD metadata', async () => {
  const scope = { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }
  const pending = await application.presignSource(scope, null, {
    idempotencyKey: 'knowledge-file-oversized-head', name: 'source.pdf', mime: 'application/pdf', size: 5,
  })
  const source = await pool.query<{ storage_key: string }>(
    `SELECT storage_key FROM knowledge_sources WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [pending.id, COMPANY_ID, PROJECT_ID],
  )
  objectSizes.set(source.rows[0]?.storage_key ?? '', MAX_SOURCE_BYTES + 1)

  await assert.rejects(
    application.completeUpload(scope, pending.id),
    (error) => error instanceof KnowledgeApplicationError && error.code === 'upload_size_mismatch',
  )
  const queued = await pool.query(`SELECT 1 FROM knowledge_source_jobs WHERE source_id=$1`, [pending.id])
  assert.equal(queued.rowCount, 0)
})

test('[integration] presigned upload confirmation rejects mismatched HEAD Content-Type metadata', async () => {
  const scope = { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }
  const pending = await application.presignSource(scope, null, {
    idempotencyKey: 'knowledge-file-content-type', name: 'source.pdf', mime: 'application/pdf', size: 5,
  })
  const source = await pool.query<{ storage_key: string }>(
    `SELECT storage_key FROM knowledge_sources WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [pending.id, COMPANY_ID, PROJECT_ID],
  )
  const storageKey = source.rows[0]?.storage_key ?? ''
  objectSizes.set(storageKey, 5)
  objectMimes.set(storageKey, 'text/plain; charset=utf-8')

  await assert.rejects(
    application.completeUpload(scope, pending.id),
    (error) => error instanceof KnowledgeApplicationError && error.code === 'upload_size_mismatch',
  )
  const queued = await pool.query(`SELECT 1 FROM knowledge_source_jobs WHERE source_id=$1`, [pending.id])
  assert.equal(queued.rowCount, 0)
})

test('[integration] an expired worker cannot overwrite a job reclaimed by a second worker', async () => {
  const sourceId = 'ks-reclaimed-lease'
  await pool.query(
    `INSERT INTO knowledge_sources
       (id,company_id,project_id,kind,title,mime_type,size_bytes,status,stage,
        visibility_scope,owner_user_id,created_by_user_id,created_via)
     VALUES ($1,$2,$3,'file','Lease source','text/plain',5,'queued','queued',
             'PROJECT',$4,$4,'USER')`,
    [sourceId, COMPANY_ID, PROJECT_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO knowledge_source_jobs (id,source_id,status,available_at)
     VALUES ('ksj-reclaimed-lease',$1,'queued',NOW())`,
    [sourceId],
  )

  const first = await withTransaction(pool, (db) => claimIngestionJob(db, 'worker-first', 120_000))
  assert.ok(first)
  await pool.query(
    `UPDATE knowledge_source_jobs SET leased_until=NOW()-INTERVAL '1 second' WHERE source_id=$1`,
    [sourceId],
  )
  const second = await withTransaction(pool, (db) => claimIngestionJob(db, 'worker-second', 120_000))
  assert.ok(second)
  assert.notEqual(first.leaseToken, second.leaseToken)

  assert.equal(await markExternalSource(pool, {
    sourceId,
    leaseToken: first.leaseToken,
    externalSourceId: 'external-stale',
    externalCommandId: null,
  }), false)
  assert.equal(await withTransaction(pool, (db) => completeIngestion(db, {
    sourceId,
    leaseToken: first.leaseToken,
    status: 'ready',
    stage: 'ready',
    error: null,
    chunkCount: 1,
    externalCommandId: null,
    clearStorageKey: false,
  })), false)
  assert.equal(await withTransaction(pool, (db) => recordIngestionFailure(db, {
    sourceId,
    leaseToken: first.leaseToken,
    message: 'stale worker failure',
    maxAttempts: 5,
  })), null)

  assert.equal(await markExternalSource(pool, {
    sourceId,
    leaseToken: second.leaseToken,
    externalSourceId: 'external-current',
    externalCommandId: 'command-current',
  }), true)
  const persisted = await pool.query<{
    external_source_id: string | null; external_command_id: string | null; status: string
  }>(
    `SELECT external_source_id,external_command_id,status FROM knowledge_sources WHERE id=$1`,
    [sourceId],
  )
  assert.deepEqual(persisted.rows[0], {
    external_source_id: 'external-current',
    external_command_id: 'command-current',
    status: 'processing',
  })
})

test('[integration] conversation Source exclusions are per-user and accept only authorized Sources', async () => {
  const own = await application.createSource(
    { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }, null,
    { kind: 'url', idempotencyKey: 'knowledge-url-1', url: 'https://example.com/own' },
  )
  const studentPrivate = await application.createSource(
    { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }, null,
    { kind: 'text', idempotencyKey: 'selection-student-a', text: 'student private' },
  )
  const foreignId = 'ks-foreign-source'
  await pool.query(
    `INSERT INTO knowledge_sources
       (id,company_id,project_id,kind,title,size_bytes,status,stage,
        visibility_scope,owner_user_id,created_by_user_id,created_via)
     VALUES ($1,$2,$3,'url','Foreign',0,'queued','queued','PRIVATE',$4,$4,'USER')`,
    [foreignId, OTHER_COMPANY_ID, OTHER_PROJECT_ID, USER_ID],
  )
  const conversationId = 'knowledge-selection-conversation'
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id,project_id)
     VALUES ($1,'group','Knowledge selection',$2::jsonb,$3,$4)`,
    [conversationId, JSON.stringify([USER_ID, STUDENT_A_ID, STUDENT_B_ID]), COMPANY_ID, PROJECT_ID],
  )
  const ownerResult = await application.selectSources(
    { userId: USER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    conversationId,
    [own.id, studentPrivate.id, foreignId],
  )
  assert.deepEqual(ownerResult.excludedSourceIds, [own.id])
  const studentResult = await application.selectSources(
    { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    conversationId,
    [own.id, studentPrivate.id, foreignId],
  )
  assert.deepEqual(studentResult.excludedSourceIds.sort(), [own.id, studentPrivate.id].sort())
  await application.selectSources(
    { userId: STUDENT_B_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    conversationId,
    [own.id, studentPrivate.id],
  )

  const exclusions = await pool.query<{ source_id: string; user_id: string }>(
    `SELECT source_id,user_id FROM conversation_source_exclusions
      WHERE conversation_id=$1 ORDER BY user_id,source_id`,
    [conversationId],
  )
  assert.deepEqual(exclusions.rows, [
    { source_id: own.id, user_id: STUDENT_A_ID },
    { source_id: studentPrivate.id, user_id: STUDENT_A_ID },
    { source_id: own.id, user_id: STUDENT_B_ID },
    { source_id: own.id, user_id: USER_ID },
  ].sort((left, right) => left.user_id.localeCompare(right.user_id)
    || left.source_id.localeCompare(right.source_id)))
})
