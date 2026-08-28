import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import {
  buildApiTestApp,
  ensureSchemaOnce,
  resetAllTables,
  seedUserMembership,
  teardownAll,
} from './_helpers.js'

const USER_ID = 'u-message-owner'
const COMPANY_ID = 'co-message-owner'
const OTHER_COMPANY_ID = 'co-message-other'
const AGENT_ID = 'agent-message-author'
const CONVERSATION_ID = 'conversation-message-slice'
const MESSAGE_ID = 'message-reaction-slice'
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
     VALUES ($1, 'Message Owner', 'message-owner', $3),
            ($2, 'Message Other', 'message-other', $3)`,
    [COMPANY_ID, OTHER_COMPANY_ID, USER_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID)
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [OTHER_COMPANY_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO participants (id, kind, name, initial, avatar_bg, status, company_id)
     VALUES ($1, 'agent', 'Message Agent', 'M', '#000000', 'avail', $2)`,
    [AGENT_ID, COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, company_id)
     VALUES ($1, 'group', 'Message Slice', $2::jsonb, $3)`,
    [CONVERSATION_ID, JSON.stringify([USER_ID, AGENT_ID]), COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
     VALUES ($1, $2, $3, 'text', 'hello', 1, $4)`,
    [MESSAGE_ID, CONVERSATION_ID, AGENT_ID, COMPANY_ID],
  )
})

after(async () => {
  await teardownAll(server)
})

function react(companyId: string, emoji = '👍') {
  return fetch(`${baseUrl}/api/messages/${MESSAGE_ID}/reactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({ emoji }),
  })
}

test('[integration] reaction mutation and climate projection retain explicit tenant ownership', async () => {
  const response = await react(COMPANY_ID)
  assert.equal(response.status, 200, await response.text())

  const reaction = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM message_reactions WHERE message_id = $1`,
    [MESSAGE_ID],
  )
  assert.deepEqual(reaction.rows.map((row) => row.company_id), [COMPANY_ID])

  const climate = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM agent_climate WHERE agent_id = $1 AND about_id = $2`,
    [AGENT_ID, USER_ID],
  )
  assert.deepEqual(climate.rows.map((row) => row.company_id), [COMPANY_ID])
})

test('[integration] another tenant cannot discover or react to a message id', async () => {
  const response = await react(OTHER_COMPANY_ID)
  assert.equal(response.status, 404, await response.text())
  const stored = await pool.query(`SELECT 1 FROM message_reactions WHERE message_id = $1`, [MESSAGE_ID])
  assert.equal(stored.rowCount, 0)
})

test('[integration] concurrent reaction toggles serialize on the owning message row', async () => {
  const responses = await Promise.all([react(COMPANY_ID), react(COMPANY_ID)])
  assert.deepEqual(responses.map((response) => response.status), [200, 200])
  const stored = await pool.query(
    `SELECT 1 FROM message_reactions WHERE message_id = $1 AND company_id = $2`,
    [MESSAGE_ID, COMPANY_ID],
  )
  assert.equal(stored.rowCount, 0)
})
