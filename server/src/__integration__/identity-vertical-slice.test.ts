import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { provisionPersonalWorkspace } from '../modules/companies/public.js'
import {
  buildApiTestApp,
  ensureSchemaOnce,
  resetAllTables,
  teardownAll,
} from './_helpers.js'

const USER_ID = 'u-identity-slice'
let companyId = ''
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
  const provisioned = await withTransaction(pool, async (db) => {
    await db.query(
      `INSERT INTO users (id,email,display_name,email_verified_at)
       VALUES ($1,'identity@example.com','Identity User',NOW())`,
      [USER_ID],
    )
    await db.query(
      `INSERT INTO user_identities (provider, provider_id, user_id, email_lower)
       VALUES ('lingxi', 'identity-provider-user', $1, 'identity@example.com')`,
      [USER_ID],
    )
    return provisionPersonalWorkspace(db, USER_ID)
  })
  companyId = provisioned.companyId
  await pool.query(
    `INSERT INTO participants (id,kind,name,initial,avatar_bg,status,company_id)
     VALUES ($1,'human','Identity User','I','#FF8870','avail',$2)`,
    [USER_ID, companyId],
  )
})

after(async () => teardownAll(server))

test('[integration] identity snapshot is assembled by the application boundary', async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`)
  assert.equal(response.status, 200)
  const payload = await response.json() as {
    user: { id: string; providers: string[] }
    companies: Array<{ id: string; name: string; slug: string; role: string }>
    activeCompanyId: string
  }
  assert.equal(payload.user.id, USER_ID)
  assert.deepEqual(payload.user.providers, ['lingxi'])
  assert.equal(payload.companies.length, 1)
  assert.equal(payload.companies[0]?.id, companyId)
  assert.equal(payload.companies[0]?.name, "Identity User's workspace")
  assert.match(payload.companies[0]?.slug ?? '', /^identity-/)
  assert.equal(payload.companies[0]?.role, 'owner')
  assert.equal(payload.activeCompanyId, companyId)
})

test('[integration] account deletion atomically scrubs identity and access rows', async () => {
  const expiresAt = new Date(Date.now() + 60_000)
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [createHash('sha256').update('session').digest('hex'), USER_ID, expiresAt],
  )
  await pool.query(
    `INSERT INTO ws_tickets (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [createHash('sha256').update('ticket').digest('hex'), USER_ID, expiresAt],
  )

  const response = await fetch(`${baseUrl}/api/me/account`, { method: 'DELETE' })
  assert.equal(response.status, 200)
  const user = await pool.query<{
    email: string
    display_name: string
    deleted_at: Date | null
  }>(`SELECT email, display_name, deleted_at FROM users WHERE id = $1`, [USER_ID])
  assert.equal(user.rows[0]?.email, `deleted+${USER_ID}@lingxiloop.invalid`)
  assert.equal(user.rows[0]?.display_name, 'Deleted user')
  assert.ok(user.rows[0]?.deleted_at)
  for (const table of ['sessions', 'ws_tickets', 'user_identities']) {
    const rows = await pool.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [USER_ID])
    assert.equal(rows.rowCount, 0)
  }
  const participant = await pool.query<{ departed_at: Date | null }>(
    `SELECT departed_at FROM participants WHERE id = $1 AND company_id = $2`,
    [USER_ID, companyId],
  )
  assert.ok(participant.rows[0]?.departed_at)
})

test('[integration] repeated account deletion fails closed without recreating compatibility state', async () => {
  assert.equal((await fetch(`${baseUrl}/api/me/account`, { method: 'DELETE' })).status, 200)
  assert.equal((await fetch(`${baseUrl}/api/me/account`, { method: 'DELETE' })).status, 404)
  assert.equal((await pool.query(`SELECT 1 FROM users WHERE id = $1`, [USER_ID])).rowCount, 1)
})
