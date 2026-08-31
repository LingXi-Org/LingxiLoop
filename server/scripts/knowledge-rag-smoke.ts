/** Production gate for the public upload -> Open Notebook -> scoped retrieval path. */
import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../src/db/pool.js'
import { withTransaction } from '../src/db/transaction.js'
import {
  onboardCompanyStarterWorkspace,
  provisionPersonalWorkspace,
} from '../src/modules/companies/public.js'
import { retrieveKnowledge } from '../src/modules/knowledge/runtime.js'

const BASE_URL = process.env.MVP_SMOKE_BASE_URL ?? 'http://localhost:5181'
const READY_TIMEOUT_MS = Number(process.env.KNOWLEDGE_SMOKE_READY_TIMEOUT_MS ?? 180_000)
const BLOCK_ASSERT_MS = Number(process.env.KNOWLEDGE_SMOKE_BLOCK_ASSERT_MS ?? 5_000)
const BLOCK_REQUEST_TIMEOUT_MS = Number(process.env.KNOWLEDGE_SMOKE_BLOCK_REQUEST_TIMEOUT_MS ?? 45_000)
const EMBEDDING_CONTROL_URL = process.env.KNOWLEDGE_SMOKE_EMBEDDING_CONTROL_URL?.trim() ?? ''
const EMBEDDING_CONTROL_TOKEN = process.env.KNOWLEDGE_SMOKE_EMBEDDING_CONTROL_TOKEN?.trim() ?? ''
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
const userId = `u-knowledge-smoke-${suffix}`
const sessionToken = `knowledge-smoke-${randomUUID()}`
const otherUserId = `u-knowledge-smoke-other-${suffix}`
const otherSessionToken = `knowledge-smoke-other-${randomUUID()}`
const uniquePhrase = `LINGXILOOP_RAG_SMOKE_${suffix.toUpperCase()}`
let companyId = ''
let otherCompanyId = ''
let embeddingBlockAttempted = false

interface SmokeAuth {
  companyId: string
  sessionToken: string
}

const cleanupSources: Array<{ projectId: string; sourceId: string; auth: SmokeAuth }> = []

interface SourceSummary {
  id: string
  status: string
  stage: string
  error?: string | null
  chunkCount?: number
}

interface EmbeddingControlState {
  blocked: boolean
  waitingRequests: number
  blockedEmbeddingRequests: number
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function sessionHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

function minimalPdf(text: string): Buffer {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${escaped}) Tj\nET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body)
}

async function responseJson<T>(response: Response, operation: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) throw new Error(`${operation} returned ${response.status}: ${text}`)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${operation} returned invalid JSON: ${text}`)
  }
}

function headers(auth: SmokeAuth): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-company-id': auth.companyId,
    'x-session-token': auth.sessionToken,
  }
}

function primaryAuth(): SmokeAuth {
  return { companyId, sessionToken }
}

function embeddingControlEnabled(): boolean {
  if (Boolean(EMBEDDING_CONTROL_URL) !== Boolean(EMBEDDING_CONTROL_TOKEN)) {
    throw new Error('embedding block smoke requires both control URL and token')
  }
  return Boolean(EMBEDDING_CONTROL_URL)
}

async function setEmbeddingBlocked(blocked: boolean): Promise<EmbeddingControlState> {
  return responseJson<EmbeddingControlState>(
    await fetch(EMBEDDING_CONTROL_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${EMBEDDING_CONTROL_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ blocked }),
    }),
    `${blocked ? 'block' : 'unblock'} embedding provider`,
  )
}

async function embeddingControlState(): Promise<EmbeddingControlState> {
  return responseJson<EmbeddingControlState>(
    await fetch(EMBEDDING_CONTROL_URL, {
      headers: { authorization: `Bearer ${EMBEDDING_CONTROL_TOKEN}` },
    }),
    'read embedding provider control state',
  )
}

async function seed(): Promise<{ projectId: string; conversationId: string }> {
  const provisioned = await withTransaction(pool, async (db) => {
    await db.query(
      `INSERT INTO users (id,email,display_name,email_verified_at)
       VALUES ($1,$2,'Knowledge RAG Smoke',NOW())`,
      [userId, `${userId}@example.invalid`],
    )
    const workspace = await provisionPersonalWorkspace(db, userId)
    await db.query(
      `INSERT INTO sessions (token_hash,user_id,expires_at)
       VALUES ($1,$2,NOW() + INTERVAL '1 hour')`,
      [sessionHash(sessionToken), userId],
    )
    return workspace
  })
  companyId = provisioned.companyId
  await onboardCompanyStarterWorkspace(companyId)
  const { rows } = await pool.query<{ id: string; project_id: string }>(
    `SELECT id,project_id FROM conversations
      WHERE company_id=$1 AND preset_key='room:study-room' AND kind='group'
      LIMIT 1`,
    [companyId],
  )
  const room = rows[0]
  if (!room?.project_id || room.project_id !== provisioned.projectId) {
    throw new Error('starter study room was not provisioned in the personal Project')
  }
  return { projectId: provisioned.projectId, conversationId: room.id }
}

async function seedOtherCompany(): Promise<{ projectId: string; auth: SmokeAuth }> {
  const provisioned = await withTransaction(pool, async (db) => {
    await db.query(
      `INSERT INTO users (id,email,display_name,email_verified_at)
       VALUES ($1,$2,'Knowledge RAG Smoke Other',NOW())`,
      [otherUserId, `${otherUserId}@example.invalid`],
    )
    const workspace = await provisionPersonalWorkspace(db, otherUserId)
    await db.query(
      `INSERT INTO sessions (token_hash,user_id,expires_at)
       VALUES ($1,$2,NOW() + INTERVAL '1 hour')`,
      [sessionHash(otherSessionToken), otherUserId],
    )
    return workspace
  })
  otherCompanyId = provisioned.companyId
  return {
    projectId: provisioned.projectId,
    auth: { companyId: provisioned.companyId, sessionToken: otherSessionToken },
  }
}

async function createSecondProject(auth: SmokeAuth): Promise<string> {
  const project = await responseJson<{ id: string }>(
    await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: headers(auth),
      body: JSON.stringify({
        name: `RAG isolation ${suffix}`,
        description: 'Cross-Project RAG isolation smoke',
      }),
    }),
    'create isolation Project',
  )
  if (!project.id) throw new Error('isolation Project response did not include an ID')
  return project.id
}

async function uploadPdf(projectId: string, auth: SmokeAuth, label: string): Promise<string> {
  const pdf = minimalPdf(uniquePhrase)
  const uploadBody = new Uint8Array(pdf.byteLength)
  uploadBody.set(pdf)
  const presign = await responseJson<{ id: string; uploadUrl: string }>(
    await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/sources/upload/presign`, {
      method: 'POST',
      headers: headers(auth),
      body: JSON.stringify({
        idempotencyKey: `knowledge-smoke-${label}-${suffix}`,
        name: `knowledge-smoke-${label}-${suffix}.pdf`,
        mime: 'application/pdf',
        size: pdf.byteLength,
      }),
    }),
    'presign upload',
  )
  const upload = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'application/pdf' },
    body: uploadBody,
  })
  if (!upload.ok) throw new Error(`R2 upload returned ${upload.status}: ${await upload.text()}`)
  await responseJson(
    await fetch(
      `${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(presign.id)}/complete-upload`,
      { method: 'POST', headers: headers(auth) },
    ),
    'complete upload',
  )
  cleanupSources.push({ projectId, sourceId: presign.id, auth })
  return presign.id
}

async function deleteUploadedSource(projectId: string, sourceId: string, auth: SmokeAuth): Promise<void> {
  await responseJson(
    await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/sources/${encodeURIComponent(sourceId)}`, {
      method: 'DELETE',
      headers: headers(auth),
    }),
    'delete source',
  )
  const index = cleanupSources.findIndex((source) => source.sourceId === sourceId)
  if (index >= 0) cleanupSources.splice(index, 1)
}

async function waitUntilReady(projectId: string, sourceId: string, auth: SmokeAuth): Promise<SourceSummary> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const sources = await responseJson<SourceSummary[]>(
      await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/sources`, { headers: headers(auth) }),
      'list sources',
    )
    const source = sources.find((candidate) => candidate.id === sourceId)
    if (source?.status === 'failed') {
      throw new Error(`source ingestion failed at ${source.stage}: ${source.error ?? 'unknown error'}`)
    }
    if (source?.status === 'ready' && Number(source.chunkCount ?? 0) > 0) return source
    await sleep(1_000)
  }
  throw new Error(`source ${sourceId} did not reach ready with embedded chunks within ${READY_TIMEOUT_MS}ms`)
}

async function waitForBlockedEmbeddingRequest(): Promise<void> {
  const deadline = Date.now() + BLOCK_REQUEST_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await embeddingControlState()
    if (!state.blocked) throw new Error('embedding provider unexpectedly unblocked during CI assertion')
    if (state.waitingRequests > 0 && state.blockedEmbeddingRequests > 0) return
    await sleep(500)
  }
  throw new Error(`ingestion did not reach the blocked embedding provider within ${BLOCK_REQUEST_TIMEOUT_MS}ms`)
}

async function assertNotReadyWhileEmbeddingBlocked(projectId: string, sourceId: string): Promise<void> {
  const deadline = Date.now() + BLOCK_ASSERT_MS
  let observed = 0
  while (Date.now() < deadline) {
    const sources = await responseJson<SourceSummary[]>(
      await fetch(`${BASE_URL}/api/projects/${encodeURIComponent(projectId)}/sources`, { headers: headers(primaryAuth()) }),
      'list blocked source',
    )
    const source = sources.find((candidate) => candidate.id === sourceId)
    if (!source) throw new Error('blocked source disappeared from its Project')
    if (source.status === 'ready') {
      throw new Error(`source reached READY while embedding was blocked with ${source.chunkCount ?? 0} chunks`)
    }
    if (source.status === 'failed') {
      throw new Error(`blocked source failed at ${source.stage}: ${source.error ?? 'unknown error'}`)
    }
    if (!['queued', 'processing'].includes(source.status)) {
      throw new Error(`blocked source entered unexpected status ${source.status}`)
    }
    observed += 1
    await sleep(500)
  }
  if (observed === 0) throw new Error('blocked source status was never observed')
}

async function recall(conversationId: string) {
  return retrieveKnowledge({
    companyId,
    conversationId,
    authorizationUserId: userId,
    query: uniquePhrase,
    limit: 4,
  })
}

async function setExcludedSources(conversationId: string, excludedSourceIds: string[]): Promise<void> {
  await responseJson(
    await fetch(`${BASE_URL}/api/conversations/${encodeURIComponent(conversationId)}/sources`, {
      method: 'PUT',
      headers: headers(primaryAuth()),
      body: JSON.stringify({ excludedSourceIds }),
    }),
    'set source exclusions',
  )
}

async function main(): Promise<void> {
  const { projectId, conversationId } = await seed()
  const auth = primaryAuth()
  const blockEmbedding = embeddingControlEnabled()
  if (blockEmbedding) {
    embeddingBlockAttempted = true
    await setEmbeddingBlocked(true)
  }
  const sourceId = await uploadPdf(projectId, auth, 'primary')
  if (blockEmbedding) {
    await waitForBlockedEmbeddingRequest()
    await assertNotReadyWhileEmbeddingBlocked(projectId, sourceId)
    await setEmbeddingBlocked(false)
    embeddingBlockAttempted = false
  }
  const ready = await waitUntilReady(projectId, sourceId, auth)

  const isolationProjectId = await createSecondProject(auth)
  const otherCompany = await seedOtherCompany()
  const [otherProjectSourceId, otherCompanySourceId] = await Promise.all([
    uploadPdf(isolationProjectId, auth, 'other-project'),
    uploadPdf(otherCompany.projectId, otherCompany.auth, 'other-company'),
  ])
  await Promise.all([
    waitUntilReady(isolationProjectId, otherProjectSourceId, auth),
    waitUntilReady(otherCompany.projectId, otherCompanySourceId, otherCompany.auth),
  ])

  const citations = await recall(conversationId)
  const citation = citations.find((candidate) => candidate.sourceId === sourceId)
  if (!citation || !citation.excerpt.includes(uniquePhrase) || !/^S\d+$/.test(citation.marker)) {
    throw new Error(`scoped recall did not return the uploaded source and citation: ${JSON.stringify(citations)}`)
  }
  if (citations.some((candidate) => [otherProjectSourceId, otherCompanySourceId].includes(candidate.sourceId))) {
    throw new Error(`cross-Project or cross-company source was recalled: ${JSON.stringify(citations)}`)
  }

  await setExcludedSources(conversationId, [sourceId])
  if ((await recall(conversationId)).some((candidate) => candidate.sourceId === sourceId)) {
    throw new Error('excluded source was recalled')
  }
  await setExcludedSources(conversationId, [])
  if (!(await recall(conversationId)).some((candidate) => candidate.sourceId === sourceId)) {
    throw new Error('re-enabled source was not recalled')
  }

  await deleteUploadedSource(projectId, sourceId, auth)
  if ((await recall(conversationId)).some((candidate) => candidate.sourceId === sourceId)) {
    throw new Error('deleted source was recalled')
  }
  await Promise.all([
    deleteUploadedSource(isolationProjectId, otherProjectSourceId, auth),
    deleteUploadedSource(otherCompany.projectId, otherCompanySourceId, otherCompany.auth),
  ])

  console.log(
    `PASS Knowledge RAG E2E: source=${sourceId}; chunks=${ready.chunkCount}; marker=${citation.marker}; embedding gate=${blockEmbedding}; cross-Project/company isolation, exclusion and deletion enforced`,
  )
}

main().catch((error) => {
  console.error('FAIL Knowledge RAG E2E:', error)
  process.exitCode = 1
}).finally(async () => {
  if (embeddingBlockAttempted) {
    await setEmbeddingBlocked(false).catch((error) => {
      console.error('FAIL to unblock embedding provider during cleanup:', error)
    })
  }
  if (process.env.MVP_SMOKE_CLEANUP === '1') {
    await Promise.all(cleanupSources.splice(0).map(async (source) => {
      await deleteUploadedSource(source.projectId, source.sourceId, source.auth).catch(() => undefined)
    }))
    await pool.query('DELETE FROM companies WHERE id=$1', [companyId]).catch(() => undefined)
    await pool.query('DELETE FROM companies WHERE id=$1', [otherCompanyId]).catch(() => undefined)
    await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => undefined)
    await pool.query('DELETE FROM users WHERE id=$1', [otherUserId]).catch(() => undefined)
  }
  await pool.end()
})
