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

const USER_ID = 'u-calendar-owner'
const COMPANY_ID = 'co-calendar-owner'
const PROJECT_ID = 'project-calendar-owner'
const OTHER_COMPANY_ID = 'co-calendar-other'
const OTHER_PROJECT_ID = 'project-calendar-other'
const AGENT_ID = 'agent-calendar-owner'
const OTHER_AGENT_ID = 'agent-calendar-other'
const CONVERSATION_ID = 'conversation-calendar-owner'
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
     VALUES ($1, 'Calendar Owner', 'calendar-owner', 'EDUCATION', 'plan-personal-free'),
            ($2, 'Calendar Other', 'calendar-other', 'EDUCATION', 'plan-personal-free')`,
    [COMPANY_ID, OTHER_COMPANY_ID],
  )
  await seedUserMembership(USER_ID, COMPANY_ID)
  await pool.query(
    `INSERT INTO company_memberships (company_id, user_id, role)
     VALUES ($1, $2, 'OWNER')`,
    [OTHER_COMPANY_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES ('contract-calendar-other',$1,'plan-personal-free','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',1)`,
    [OTHER_COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
     VALUES ('seat-calendar-other',$1,'contract-calendar-other',$2,'ACTIVE')`,
    [OTHER_COMPANY_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO projects (id, company_id, kind, name, created_by, is_default)
     VALUES ($1, $2, 'INSTITUTIONAL_COURSE', 'Calendar Owner', $5, TRUE),
            ($3, $4, 'INSTITUTIONAL_COURSE', 'Calendar Other', $5, TRUE)`,
    [PROJECT_ID, COMPANY_ID, OTHER_PROJECT_ID, OTHER_COMPANY_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role,status) VALUES
       ($1,$2,$5,'OWNER','ACTIVE'),
       ($3,$4,$5,'OWNER','ACTIVE')`,
    [COMPANY_ID, PROJECT_ID, OTHER_COMPANY_ID, OTHER_PROJECT_ID, USER_ID],
  )
  await pool.query(
    `INSERT INTO participants (id, kind, name, initial, avatar_bg, status, company_id)
     VALUES ($1, 'agent', 'Calendar Agent', 'C', '#000000', 'avail', $2),
            ($3, 'agent', 'Other Agent', 'O', '#000000', 'avail', $4)`,
    [AGENT_ID, COMPANY_ID, OTHER_AGENT_ID, OTHER_COMPANY_ID],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, company_id, project_id)
     VALUES ($1, 'group', 'Calendar Slice', $2::jsonb, $3, $4)`,
    [CONVERSATION_ID, JSON.stringify([USER_ID, AGENT_ID]), COMPANY_ID, PROJECT_ID],
  )
})

after(async () => {
  await teardownAll(server)
})

function request(
  path: string,
  options: RequestInit = {},
  scope = { companyId: COMPANY_ID, projectId: PROJECT_ID },
) {
  return fetch(`${baseUrl}/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-company-id': scope.companyId,
      'x-project-id': scope.projectId,
      ...options.headers,
    },
  })
}

function validAgentTask() {
  return {
    title: 'Prepare the launch brief',
    kind: 'agent_task',
    assigneeId: AGENT_ID,
    targetConversationId: CONVERSATION_ID,
    startAt: '2027-01-02T03:04:05.000Z',
  }
}

async function assertStatus(response: Response, expected: number): Promise<void> {
  assert.equal(response.status, expected, response.status === expected ? '' : await response.text())
}

test('[integration] calendar create stores explicit tenant and workspace ownership', async () => {
  const response = await request('/calendar/events', {
    method: 'POST',
    body: JSON.stringify(validAgentTask()),
  })
  await assertStatus(response, 201)
  const payload = await response.json() as { event: { id: string; companyId: string } }
  assert.equal(payload.event.companyId, COMPANY_ID)

  const stored = await pool.query<{ company_id: string; project_id: string }>(
    `SELECT company_id, project_id FROM calendar_events WHERE id = $1`,
    [payload.event.id],
  )
  assert.deepEqual(stored.rows, [{ company_id: COMPANY_ID, project_id: PROJECT_ID }])
})

test('[integration] calendar rejects cross-tenant references and unknown request fields', async () => {
  const crossTenant = await request('/calendar/events', {
    method: 'POST',
    body: JSON.stringify({ ...validAgentTask(), assigneeId: OTHER_AGENT_ID }),
  })
  await assertStatus(crossTenant, 400)

  const unknownField = await request('/calendar/events', {
    method: 'POST',
    body: JSON.stringify({ ...validAgentTask(), legacyFallback: true }),
  })
  await assertStatus(unknownField, 400)
  assert.equal((await pool.query(`SELECT 1 FROM calendar_events`)).rowCount, 0)
})

test('[integration] calendar hides ids across tenants and rejects incoherent partial reminders', async () => {
  const created = await request('/calendar/events', {
    method: 'POST',
    body: JSON.stringify(validAgentTask()),
  })
  await assertStatus(created, 201)
  const { event } = await created.json() as { event: { id: string } }

  const hidden = await request(
    `/calendar/events/${event.id}`,
    {},
    { companyId: OTHER_COMPANY_ID, projectId: OTHER_PROJECT_ID },
  )
  await assertStatus(hidden, 404)

  const incoherent = await request(`/calendar/events/${event.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ reminderChannel: 'toast' }),
  })
  await assertStatus(incoherent, 400)
  const stored = await pool.query<{ reminder_channel: string | null }>(
    `SELECT reminder_channel FROM calendar_events WHERE id = $1`,
    [event.id],
  )
  assert.equal(stored.rows[0]?.reminder_channel, null)
})
