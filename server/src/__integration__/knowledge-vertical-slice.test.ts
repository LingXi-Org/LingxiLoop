import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import express from 'express'
import type { AuthedRequest } from '../auth.js'
import { HttpError } from '../http/errors.js'
import { filesRouter } from '../modules/platform/files-router.js'
import { storage } from '../storage.js'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { ForbiddenError } from '../modules/access/public.js'
import { KnowledgeApplication, KnowledgeApplicationError } from '../modules/knowledge/application.js'
import { MAX_SOURCE_BYTES } from '../modules/knowledge/policy.js'
import {
  claimIngestionJob,
  completeIngestion,
  findVisibleSourceExternalId,
  markExternalSource,
  recordIngestionFailure,
  softDeleteTenantSource,
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
const TEACHER_NAME = '林老师'
const STUDENT_C_ID = 'u-knowledge-student-c'
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
let notebookEnabled = true
let downloadServer: Server
let downloadBaseUrl: string
const application = new KnowledgeApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  notebookEnabled: () => notebookEnabled,
  ensureNotebook: async () => undefined,
  syncNotebookMetadata: async () => undefined,
  sourceText: async (sourceId) => { sourceTextCalls.push(sourceId); return 'extracted' },
  retrySource: async (sourceId) => { retryCalls.push(sourceId) },
  deleteSource: async (sourceId, companyId, projectId, userId) => {
    deleteCalls.push(sourceId)
    await softDeleteTenantSource(pool, { sourceId, companyId, projectId, userId })
  },
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
  readObjectBounded: async (key, maxBytes) => {
    const body = objects.get(key)
    if (!body || body.byteLength > maxBytes) throw new Error('object missing or oversized')
    return Buffer.from(body)
  },
  publicUrl: async (key) => `https://r2.invalid/${key}`,
  maxSourceBytes: MAX_SOURCE_BYTES,
})

before(async () => {
  await ensureSchemaOnce()
  const app = express()
  // Inject only the test identity; every file request still runs the real permission resolver.
  app.use((req, _res, next) => { (req as AuthedRequest).authUserId = String(req.headers['x-test-user-id'] ?? ''); next() })
  app.use(filesRouter)
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof HttpError ? error.status : 500).json({ error: String(error) })
  })
  downloadServer = createServer(app)
  await new Promise<void>(resolve => downloadServer.listen(0, '127.0.0.1', resolve))
  const address = downloadServer.address()
  assert.ok(address && typeof address !== 'string')
  downloadBaseUrl = `http://127.0.0.1:${address.port}`
})
beforeEach(async () => {
  await resetAllTables()
  objects.clear()
  objectSizes.clear()
  objectMimes.clear()
  sourceTextCalls.length = 0
  retryCalls.length = 0
  deleteCalls.length = 0
  notebookEnabled = true
  await pool.query(
    `INSERT INTO companies (id,name,slug,type,plan_id)
     VALUES ($1,'Knowledge Slice','knowledge-slice','EDUCATION','plan-education'),
            ($2,'Knowledge Other','knowledge-other','EDUCATION','plan-education')`,
    [COMPANY_ID, OTHER_COMPANY_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID)
  for (const userId of [STUDENT_A_ID, STUDENT_B_ID, TEACHER_ID, STUDENT_C_ID]) {
    await seedUserMembership(userId, COMPANY_ID, {
      role: [STUDENT_A_ID, STUDENT_B_ID, STUDENT_C_ID].includes(userId) ? 'STUDENT' : 'TEACHER', isAdmin: false,
      displayName: userId === TEACHER_ID ? TEACHER_NAME : userId,
    })
  }
  await pool.query(
    `INSERT INTO projects (id,company_id,kind,name,color,created_by,is_default)
     VALUES ($1,$2,'INSTITUTIONAL_COURSE','Knowledge Project','#000',$6,FALSE),
            ($3,$2,'INSTITUTIONAL_COURSE','Same Company Project','#222',$6,FALSE),
            ($4,$5,'INSTITUTIONAL_COURSE','Other Project','#111',$6,FALSE)`,
    [PROJECT_ID, COMPANY_ID, SAME_COMPANY_PROJECT_ID, OTHER_PROJECT_ID, OTHER_COMPANY_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES ($1,$2,$3,'TEACHER'),
            ($1,$2,$4,'STUDENT'),
            ($1,$2,$5,'STUDENT'),
            ($1,$2,$6,'TEACHER'),
            ($1,$2,$7,'STUDENT'),
            ($1,$8,$3,'TEACHER'),
            ($1,$8,$4,'STUDENT')`,
    [COMPANY_ID, PROJECT_ID, USER_ID, STUDENT_A_ID, STUDENT_B_ID, TEACHER_ID, STUDENT_C_ID,
      SAME_COMPANY_PROJECT_ID],
  )
})
after(async () => {
  if (downloadServer) await new Promise<void>((resolve, reject) => downloadServer.close(error => error ? reject(error) : resolve()))
  await teardownAll()
})

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
  const thirdStudentPrivate = await application.createSource(
    { userId: STUDENT_C_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    null,
    { kind: 'text', idempotencyKey: 'ta-private', title: 'TA private', text: 'private TA' },
  )
  const teacherProject = await application.createSource(
    { userId: TEACHER_ID, companyId: COMPANY_ID, projectId: PROJECT_ID },
    null,
    { kind: 'text', idempotencyKey: 'teacher-project', title: 'Teacher project', text: 'class source' },
  )
  const sourceIds = [studentPrivate.id, otherStudentPrivate.id, thirdStudentPrivate.id, teacherProject.id]
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
    { id: thirdStudentPrivate.id, visibility_scope: 'PRIVATE', owner_user_id: STUDENT_C_ID,
      created_by_user_id: STUDENT_C_ID, created_via: 'USER' },
    { id: teacherProject.id, visibility_scope: 'PROJECT', owner_user_id: TEACHER_ID,
      created_by_user_id: TEACHER_ID, created_via: 'USER' },
  ].sort((left, right) => left.id.localeCompare(right.id)))

  const idsVisibleTo = async (userId: string) => (
    await application.sources({ userId, companyId: COMPANY_ID, projectId: PROJECT_ID })
  ).map((source) => String(source.id)).sort()
  assert.deepEqual(await idsVisibleTo(STUDENT_A_ID), [studentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await idsVisibleTo(STUDENT_B_ID), [otherStudentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await idsVisibleTo(STUDENT_C_ID), [thirdStudentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await idsVisibleTo(TEACHER_ID), [teacherProject.id])
  assert.deepEqual(await idsVisibleTo(USER_ID), [teacherProject.id])
  for (const userId of [TEACHER_ID, STUDENT_B_ID]) {
    assert.equal(await findVisibleSourceExternalId(pool, {
      companyId: COMPANY_ID, projectId: PROJECT_ID, userId, sourceId: studentPrivate.id,
    }), null)
  }

  const retrievalConversationId = 'knowledge-retrieval-authorization'
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id,project_id)
     VALUES ($1,'group','Knowledge retrieval authorization',$2::jsonb,$3,$4)`,
    [retrievalConversationId, JSON.stringify([
      STUDENT_A_ID, STUDENT_B_ID, TEACHER_ID, STUDENT_C_ID, USER_ID,
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
  assert.deepEqual(await retrievalIdsFor(STUDENT_C_ID), [thirdStudentPrivate.id, teacherProject.id].sort())
  assert.deepEqual(await retrievalIdsFor(USER_ID), [teacherProject.id])
  const conversationSources = await application.conversationSources({
    userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID,
  }, retrievalConversationId)
  assert.equal(conversationSources.find(source => source.id === teacherProject.id)?.ownerName, TEACHER_NAME)

  for (const actorUserId of [STUDENT_B_ID, USER_ID, TEACHER_ID, STUDENT_C_ID]) {
    const actorScope = { userId: actorUserId, companyId: COMPANY_ID, projectId: PROJECT_ID }
    await assert.rejects(
      application.source(actorScope, studentPrivate.id),
      (error) => (error instanceof KnowledgeApplicationError && error.code === 'not_found') || error instanceof ForbiddenError,
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
      (error) => (error instanceof KnowledgeApplicationError && error.code === 'not_found') || error instanceof ForbiddenError,
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

test('[integration] course materials store each original format, refresh, and enforce actual course capabilities', async () => {
  const scope = (userId: string) => ({ userId, companyId: COMPANY_ID, projectId: PROJECT_ID })
  const fixtures: Array<[string, string, Buffer]> = [
    ['lesson.pdf', 'application/pdf', Buffer.from('%PDF-1.7\noriginal pdf')],
    ['lesson.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK\x03\x04[Content_Types].xml word/document.xml')],
    ['lesson.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', Buffer.from('PK\x03\x04[Content_Types].xml ppt/presentation.xml')],
    ['lesson.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.from('PK\x03\x04[Content_Types].xml xl/workbook.xml')],
    ['notes.md', 'text/markdown', Buffer.from('# original markdown')],
    ['notes.txt', 'text/plain', Buffer.from('original text')],
    ['data.csv', 'text/csv', Buffer.from('name,value\noriginal,1\n')],
    ['data.json', 'application/json', Buffer.from('{"original":true}')],
    ['image.jpg', 'image/jpeg', Buffer.from([255, 216, 255, 224, 12, 34, 56])],
    ['image.png', 'image/png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 12, 34, 56])],
    ['archive.zip', 'application/zip', Buffer.from([80, 75, 5, 6, 0, 0, 0, 0])],
  ]
  const { KNOWLEDGE_ATTACHMENT_MIMES } = await import('../modules/knowledge/policy.js')
  const ids: string[] = []
  for (const [name, mime, body] of fixtures) {
    const input = { idempotencyKey: `original-roundtrip-${name}`, name, mime, size: body.length } as Parameters<typeof application.presignSource>[2]
    const pending = await application.presignSource(scope(STUDENT_A_ID), null, input)
    assert.equal((await application.presignSource(scope(STUDENT_A_ID), null, input)).id, pending.id)
    await assert.rejects(application.presignSource(scope(STUDENT_A_ID), null, { ...input, size: input.size + 1 }), /already used/)
    const key = (await pool.query<{ storage_key: string }>('SELECT storage_key FROM knowledge_sources WHERE id=$1', [pending.id])).rows[0]!.storage_key
    objects.set(key, body)
    await storage.put(key, body, mime)
    const complete = await application.completeUpload(scope(STUDENT_A_ID), pending.id)
    const expectedStatus = KNOWLEDGE_ATTACHMENT_MIMES.has(mime) ? 'queued' : 'stored'
    assert.equal(complete.status, expectedStatus)
    assert.equal((await application.completeUpload(scope(STUDENT_A_ID), pending.id)).status, expectedStatus)
    await assert.rejects(application.presignSource(scope(STUDENT_A_ID), null, input), /already used/)
    const detail = await application.source(scope(STUDENT_A_ID), pending.id)
    assert.equal(detail.originalFileUrl, `https://r2.invalid/${key}`)
    assert.deepEqual(objects.get(key), body)
    const download = await fetch(`${downloadBaseUrl}/files?key=${encodeURIComponent(key)}`, { headers: { 'x-test-user-id': STUDENT_A_ID } })
    assert.equal(download.status, 200)
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), body)
    assert.equal(detail.sizeBytes, body.length)
    assert.equal(detail.mimeType, mime)
    assert.deepEqual(detail.capabilities, { canDownload: true, canRename: true, canDelete: true })
    const jobs = await pool.query('SELECT 1 FROM knowledge_source_jobs WHERE source_id=$1', [pending.id])
    assert.equal(jobs.rowCount, expectedStatus === 'queued' ? 1 : 0)
    for (const userId of [STUDENT_B_ID, TEACHER_ID]) {
      const denied = await fetch(`${downloadBaseUrl}/files?key=${encodeURIComponent(key)}`, { headers: { 'x-test-user-id': userId } })
      assert.equal(denied.status, 404)
      await assert.rejects(application.source(scope(userId), pending.id))
      await assert.rejects(application.editSource(scope(userId), pending.id, { title: 'stolen' }))
      await assert.rejects(application.delete(scope(userId), pending.id))
      await assert.rejects(application.completeUpload(scope(userId), pending.id))
    }
    ids.push(pending.id)
  }
  const refreshed = await application.materials(scope(STUDENT_A_ID), 'private')
  assert.equal(refreshed.capabilities.canUpload, true)
  assert.deepEqual(refreshed.sources.map(source => source.id).sort(), ids.sort())
  assert.deepEqual((await application.materials(scope(STUDENT_B_ID), 'private')).sources, [])
  assert.deepEqual((await application.materials(scope(TEACHER_ID), 'private')).sources, [])
  assert.equal((await application.materials(scope(TEACHER_ID), 'private')).capabilities.canUpload, false)
  assert.equal((await application.materials(scope(STUDENT_A_ID), 'public')).capabilities.canUpload, false)
  assert.equal((await application.materials(scope(TEACHER_ID), 'public')).capabilities.canUpload, true)
})

test('[integration] global teacher labels cannot substitute for the actual course role', async () => {
  for (const [userId, visibility] of [[STUDENT_A_ID, 'PRIVATE'], [TEACHER_ID, 'PROJECT']] as const) {
    const scope = { userId, companyId: COMPANY_ID, projectId: PROJECT_ID }
    const created = await application.presignSource(scope, null, { idempotencyKey: 'actual-course-role', name: 'notes.txt', mime: 'text/plain', size: 5 })
    const row = (await pool.query<{ visibility_scope: string; owner_user_id: string }>('SELECT visibility_scope,owner_user_id FROM knowledge_sources WHERE id=$1', [created.id])).rows[0]!
    assert.equal(row.visibility_scope, visibility)
    assert.equal(row.owner_user_id, userId)
    assert.equal((await application.materials(scope, 'public')).capabilities.canUpload, visibility === 'PROJECT')
    if (visibility === 'PROJECT') {
      const key = (await pool.query<{ storage_key: string }>('SELECT storage_key FROM knowledge_sources WHERE id=$1', [created.id])).rows[0]!.storage_key
      objects.set(key, Buffer.from('hello'))
      await storage.put(key, Buffer.from('hello'), 'text/plain')
      await application.completeUpload(scope, created.id)
      const studentView = await application.materials({ ...scope, userId: STUDENT_B_ID }, 'public')
      assert.equal(studentView.sources[0]?.ownerName, TEACHER_NAME)
      assert.equal((await application.source({ ...scope, userId: STUDENT_B_ID }, created.id)).ownerName, TEACHER_NAME)
      assert.deepEqual(studentView.sources[0]?.capabilities, { canDownload: true, canRename: false, canDelete: false })
      for (const userId of [STUDENT_A_ID, STUDENT_B_ID]) {
        const response = await fetch(`${downloadBaseUrl}/files?key=${encodeURIComponent(key)}`, { headers: { 'x-test-user-id': userId } })
        assert.equal(response.status, 200)
        assert.equal(await response.text(), 'hello')
      }
      await assert.rejects(application.editSource({ ...scope, userId: STUDENT_B_ID }, created.id, { title: 'forbidden' }))
      await assert.rejects(application.source({ ...scope, projectId: SAME_COMPANY_PROJECT_ID }, created.id))
      await assert.rejects(application.source({ ...scope, companyId: OTHER_COMPANY_ID, projectId: OTHER_PROJECT_ID }, created.id))
    }
  }
  const unassignedTeacher = { userId: TEACHER_ID, companyId: COMPANY_ID, projectId: SAME_COMPANY_PROJECT_ID }
  await assert.rejects(application.materials(unassignedTeacher, 'public'))
  await assert.rejects(application.presignSource(unassignedTeacher, null, {
    idempotencyKey: 'unassigned-global-teacher', name: 'forbidden.txt', mime: 'text/plain', size: 5,
  }))
})

test('[integration] students cannot manage legacy public files they created, while own private files remain manageable', async () => {
  const student = { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }
  const teacher = { ...student, userId: TEACHER_ID }
  const created = await application.presignSource(student, null, {
    idempotencyKey: 'legacy-student-public', name: 'notes.txt', mime: 'text/plain', size: 5,
  })
  await application.editSource(student, created.id, { title: 'own-private.txt' })
  assert.deepEqual((await application.source(student, created.id)).capabilities,
    { canDownload: false, canRename: true, canDelete: true })
  // A historical row can predate the current server-determined upload scope.
  await pool.query(`UPDATE knowledge_sources SET visibility_scope='PROJECT' WHERE id=$1`, [created.id])
  assert.deepEqual((await application.source(student, created.id)).capabilities,
    { canDownload: false, canRename: false, canDelete: false })
  for (const userId of [STUDENT_A_ID, STUDENT_B_ID]) {
    const scope = { ...student, userId }
    await assert.rejects(application.editSource(scope, created.id, { title: 'forbidden.txt' }))
    await assert.rejects(application.delete(scope, created.id))
    await assert.rejects(application.retry(scope, created.id))
    await assert.rejects(application.completeUpload(scope, created.id))
  }
  assert.equal((await application.source(teacher, created.id)).capabilities.canRename, true)
  await application.editSource(teacher, created.id, { title: 'teacher-managed.txt' })
  assert.equal((await application.source(student, created.id)).title, 'teacher-managed.txt')
  await application.delete(teacher, created.id)
  await assert.rejects(application.source(student, created.id))
})

test('[integration] originals remain usable with indexing disabled and malformed uploads stay pending', async () => {
  notebookEnabled = false
  const scope = { userId: STUDENT_A_ID, companyId: COMPANY_ID, projectId: PROJECT_ID }
  const pending = await application.presignSource(scope, null, { idempotencyKey: 'offline-original', name: 'notes.txt', mime: 'text/plain', size: 5 })
  const key = (await pool.query<{ storage_key: string }>('SELECT storage_key FROM knowledge_sources WHERE id=$1', [pending.id])).rows[0]!.storage_key
  objects.set(key, Buffer.from('hello'))
  await storage.put(key, Buffer.from('hello'), 'text/plain')
  assert.equal((await application.completeUpload(scope, pending.id)).status, 'stored')
  await application.editSource(scope, pending.id, { title: 'renamed.txt' })
  assert.equal((await application.source(scope, pending.id)).title, 'renamed.txt')
  assert.equal((await application.materials(scope, 'private')).sources[0]?.stage, 'stored_only')
  await application.delete(scope, pending.id)
  assert.deepEqual(deleteCalls, [pending.id])
  assert.deepEqual((await application.materials(scope, 'private')).sources, [])
  assert.equal((await fetch(`${downloadBaseUrl}/files?key=${encodeURIComponent(key)}`, { headers: { 'x-test-user-id': STUDENT_A_ID } })).status, 404)
  const malformed = await application.presignSource(scope, null, { idempotencyKey: 'malformed-original', name: 'fake.png', mime: 'image/png', size: 5 })
  const malformedKey = (await pool.query<{ storage_key: string }>('SELECT storage_key FROM knowledge_sources WHERE id=$1', [malformed.id])).rows[0]!.storage_key
  objects.set(malformedKey, Buffer.from('hello'))
  await assert.rejects(application.completeUpload(scope, malformed.id), /declared format/)
  assert.equal((await application.source(scope, malformed.id)).status, 'upload_pending')
  await storage.put(malformedKey, Buffer.from('hello'), 'image/png')
  assert.equal((await fetch(`${downloadBaseUrl}/files?key=${encodeURIComponent(malformedKey)}`, { headers: { 'x-test-user-id': STUDENT_A_ID } })).status, 404)
  assert.equal((await pool.query('SELECT 1 FROM knowledge_source_jobs WHERE source_id=$1', [malformed.id])).rowCount, 0)
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
