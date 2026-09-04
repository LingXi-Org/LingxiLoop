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
     VALUES ($1, 'Email Slice', 'email-slice', 'EDUCATION', 'plan-personal-free')`,
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

test('[integration] Agent Email CLI uses one tenant-scoped idempotent domain path', async () => {
  const agentId = 'agent-email-slice'
  await pool.query(
    `INSERT INTO participants
       (id, company_id, kind, name, role, initial, avatar_bg, status, email)
     VALUES ($1, $2, 'agent', 'Mailer', 'operator', 'M', '#000000', 'avail', $3)`,
    [agentId, COMPANY_ID, 'mailer@email-slice.example'],
  )
  let providerCalls = 0
  __setEmailProviderOverrideForTesting(async () => {
    providerCalls += 1
    return { ok: true, smtpMessageId: 'agent-provider-message@example.com', error: null }
  })
  const { runCli } = await import('../agents/cli.js')
  const argv = [
    'email', 'send',
    '--to', 'recipient@example.com',
    '--subject', 'Agent domain boundary',
    '--body', 'One authoritative path.',
    '--as', agentId,
  ]
  const identity = { idempotencyKey: 'agent-email-vertical-slice-1', projectId: PROJECT_ID }
  const first = await runCli(argv, identity)
  const replay = await runCli(argv, identity)
  assert.match(first.text, /^sent ·/)
  assert.match(replay.text, /^sent \(replayed\) ·/)
  assert.equal(first.sideEffects?.length, 1)
  assert.equal(replay.sideEffects?.length ?? 0, 0)
  assert.equal(providerCalls, 1)
  const stored = await pool.query<{ project_id: string; message_count: number }>(
    `SELECT conversation.project_id, COUNT(email.message_id)::int AS message_count
       FROM conversations conversation
       JOIN email_messages email ON email.conversation_id = conversation.id
      WHERE conversation.company_id = $1 AND conversation.kind = 'email'
      GROUP BY conversation.project_id`,
    [COMPANY_ID],
  )
  assert.deepEqual(stored.rows, [{ project_id: PROJECT_ID, message_count: 1 }])
})

test('[integration] email persistence rejects cross-tenant conversations and projects', async () => {
  const otherCompanyId = 'co-email-slice-other'
  await pool.query(
    `INSERT INTO companies (id, name, slug, type, plan_id)
     VALUES ($1, 'Other Email Slice', 'other-email-slice', 'EDUCATION', 'plan-personal-free')`,
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
