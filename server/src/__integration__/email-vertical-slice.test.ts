import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { __setEmailProviderOverrideForTesting } from '../email.js'
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
    `INSERT INTO companies (id, name, slug, owner_user_id)
     VALUES ($1, 'Email Slice', 'email-slice', $2)`,
    [COMPANY_ID, USER_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID)
  await pool.query(
    `INSERT INTO projects (id, company_id, name, created_by, is_general)
     VALUES ($1, $2, 'General', $3, TRUE)`,
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
