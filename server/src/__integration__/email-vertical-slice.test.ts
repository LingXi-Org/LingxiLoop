import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import {
  __setEmailProviderOverrideForTesting,
  findOrCreateEmailConversation,
  persistEmailMessage,
} from '../modules/email/index.js'
import { pool } from '../db/pool.js'
import {
  buildApiTestApp,
  ensureSchemaOnce,
  resetAllTables,
  seedUserMembership,
  teardownAll,
} from './_helpers.js'

const USER_ID = 'u-email-slice'
const COMPANY_ID = 'co-email-slice'
const PROJECT_ID = 'project-email-slice'
let server: Server
let baseUrl = ''

before(async () => {
  await ensureSchemaOnce()
  const app = await buildApiTestApp(USER_ID)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const address = server.address()
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
  await pool.query(
    `INSERT INTO companies (id, name, slug, type, plan_id)
     VALUES ($1, 'Email Slice', 'email-slice', 'EDUCATION', 'plan-education')`,
    [COMPANY_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID)
  await pool.query(
    `INSERT INTO projects (id, company_id, kind, name, created_by, is_default)
     VALUES ($1, $2, 'INSTITUTIONAL_COURSE', 'Course', $3, TRUE)`,
    [PROJECT_ID, COMPANY_ID, USER_ID],
  )
})

afterEach(() => __setEmailProviderOverrideForTesting(null))
after(async () => teardownAll(server))

function send(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/email/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': COMPANY_ID },
    body: JSON.stringify(body),
  })
}

const validBody = {
  idempotencyKey: 'email-vertical-slice-1',
  to: ['recipient@example.com'],
  subject: 'First release',
  body: 'Architecture is explicit.',
}

test('[integration] mail page lists only member threads in its project and sends into that project', async () => {
  const secondProject = 'project-email-second'
  await pool.query(`INSERT INTO projects(id,company_id,kind,name,created_by,is_default)
    VALUES($1,$2,'INSTITUTIONAL_COURSE','Second',$3,FALSE)`, [secondProject, COMPANY_ID, USER_ID])
  __setEmailProviderOverrideForTesting(async input => ({ ok: true, smtpMessageId: input.messageId, error: null }))
  const headers = { 'content-type': 'application/json', 'x-company-id': COMPANY_ID, 'x-project-id': secondProject }
  const response = await fetch(`${baseUrl}/api/email/send`, { method: 'POST', headers, body: JSON.stringify(validBody) })
  assert.equal(response.status, 200)
  const sent = await response.json() as { conversationId: string }
  assert.equal((await pool.query('SELECT project_id FROM conversations WHERE id=$1', [sent.conversationId])).rows[0]?.project_id, secondProject)
  await findOrCreateEmailConversation({ companyId: COMPANY_ID, projectId: secondProject, inReplyTo: null, references: [], subject: 'Private other member', memberIds: ['someone-else'], idempotencyKey: 'mail-not-a-member' })
  assert.equal((await send({ ...validBody, idempotencyKey: 'mail-default-project' })).status, 200)
  const list = async (q = '', projectId = secondProject) => {
    const res = await fetch(`${baseUrl}/api/email/threads?q=${encodeURIComponent(q)}`, { headers: { ...headers, 'x-project-id': projectId } })
    assert.equal(res.status, 200)
    return res.json() as Promise<{ items: Array<{ conversationId: string; lastFrom: string }>; hasMore: boolean }>
  }
  const page = await list()
  assert.deepEqual(page.items.map(row => row.conversationId), [sent.conversationId])
  assert.equal(page.hasMore, false)
  assert.equal((await list('First release')).items.length, 1)
  assert.equal((await list(page.items[0].lastFrom)).items.length, 1)
  assert.equal((await list('no matches')).items.length, 0)
  assert.equal((await list('', PROJECT_ID)).items.some(row => row.conversationId === sent.conversationId), false)
  const history = await fetch(`${baseUrl}/api/conversations/${sent.conversationId}/messages`, { headers })
  assert.equal(history.status, 200)
  assert.equal(((await history.json()) as Array<{ body: string }>)[0]?.body, validBody.body)
  const forbidden = await fetch(`${baseUrl}/api/email/threads`, { headers: { ...headers, 'x-project-id': 'foreign-project' } })
  assert.equal(forbidden.status, 404)
})

test('[integration] email rejects retired or unknown request fields', async () => {
  const response = await send({ ...validBody, mock: true })
  assert.equal(response.status, 400)
  assert.equal((await pool.query(`SELECT 1 FROM email_messages`)).rowCount, 0)
})

test('[integration] missing Resend configuration fails before persistence side effects', async () => {
  const previous = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = ''
  try {
    const response = await send(validBody)
    assert.equal(response.status, 500)
    assert.equal((await pool.query(`SELECT 1 FROM email_messages`)).rowCount, 0)
    assert.equal((await pool.query(`SELECT 1 FROM conversations WHERE kind = 'email'`)).rowCount, 0)
  } finally {
    process.env.RESEND_API_KEY = previous
  }
})

test('[integration] explicit provider injection uses the real persistence path without mock semantics', async () => {
  __setEmailProviderOverrideForTesting(async () => ({
    ok: true,
    smtpMessageId: 'provider-message@example.com',
    error: null,
  }))
  const response = await send(validBody)
  assert.equal(response.status, 200)
  const payload = await response.json() as Record<string, unknown>
  assert.equal(payload.transportStatus, 'sent')
  assert.equal('mock' in payload, false)
  const stored = await pool.query<{ company_id: string; transport_status: string }>(
    `SELECT company_id, transport_status FROM email_messages`,
  )
  assert.deepEqual(stored.rows, [{ company_id: COMPANY_ID, transport_status: 'sent' }])
})


test('[integration] email persistence rejects cross-tenant conversations and projects', async () => {
  const otherCompanyId = 'co-email-slice-other'
  await pool.query(
    `INSERT INTO companies (id, name, slug, type, plan_id)
     VALUES ($1, 'Other Email Slice', 'other-email-slice', 'EDUCATION', 'plan-education')`,
    [otherCompanyId],
  )
  const conversation = await findOrCreateEmailConversation({
    companyId: COMPANY_ID,
    projectId: PROJECT_ID,
    inReplyTo: null,
    references: [],
    subject: 'Owned conversation',
    memberIds: [USER_ID],
  })
  await assert.rejects(persistEmailMessage({
    conversationId: conversation.conversationId,
    companyId: otherCompanyId,
    authorId: USER_ID,
    direction: 'out',
    transportStatus: 'queued',
    smtpMessageId: 'cross-tenant-message@example.com',
    inReplyTo: null,
    references: [],
    subject: 'Must fail closed',
    fromAddr: 'sender@example.com',
    toAddrs: ['recipient@example.com'],
    body: 'No cross-tenant write.',
  }), /does not belong/)
  await assert.rejects(findOrCreateEmailConversation({
    companyId: otherCompanyId,
    projectId: PROJECT_ID,
    inReplyTo: null,
    references: [],
    subject: 'Cross-tenant project',
    memberIds: [USER_ID],
  }), /does not belong/)
  assert.equal((await pool.query(
    `SELECT 1 FROM email_messages WHERE company_id = $1`,
    [otherCompanyId],
  )).rowCount, 0)
})
