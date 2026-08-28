/**
 * Integration tests for conversation list/search shaping.
 *
 * Direct conversation rows are shared by both participants, so the stored
 * `conversations.title` can only ever be correct for one viewer. The API must
 * return a viewer-specific title based on the other member instead.
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import {
  buildApiTestApp, ensureSchemaOnce, resetAllTables, seedUserMembership, teardownAll,
  installFakeWukong,
} from './_helpers.js'
import { pool } from '../db/pool.js'

const ME_USER_ID = 'u-me'
const OTHER_USER_ID = 'u-ada'
let server: Server
let baseUrl = ''

before(async () => {
  await ensureSchemaOnce()
  installFakeWukong()
  const app = await buildApiTestApp(ME_USER_ID)
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') baseUrl = `http://127.0.0.1:${addr.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
})

after(async () => {
  await teardownAll(server)
})

async function seedHumanDirectWithSelfStoredTitle(): Promise<{ companyId: string; projectId: string; conversationId: string }> {
  const companyId = 'c-direct-title'
  const conversationId = 'direct-ada-yetone'
  const projectId = 'general-c-direct-title'
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id)
     VALUES ($1, 'Direct Title Co', 'direct-title-co', $2)`,
    [companyId, ME_USER_ID],
  )
  await seedUserMembership(ME_USER_ID, companyId, {
    email: 'yetone@test.local',
    displayName: 'Yetone',
  })
  await seedUserMembership(OTHER_USER_ID, companyId, {
    email: 'ada@test.local',
    displayName: 'Ada',
  })
  await pool.query(
    `INSERT INTO projects (id, company_id, name, color, created_by, is_general)
     VALUES ($1, $2, 'General', '#667085', $3, TRUE)`,
    [projectId, companyId, ME_USER_ID],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id, project_id)
     VALUES ($1, 'direct', 'Yetone', $2::jsonb, 'human', $3, $4)`,
    [conversationId, JSON.stringify([OTHER_USER_ID, ME_USER_ID]), companyId, projectId],
  )
  return { companyId, projectId, conversationId }
}

test('[integration] retired GET /conversations has no compatibility data plane', async () => {
  const { companyId, projectId, conversationId } = await seedHumanDirectWithSelfStoredTitle()

  const res = await fetch(`${baseUrl}/api/conversations`, {
    headers: { 'x-company-id': companyId, 'x-project-id': projectId },
  })
  const raw = await res.text()
  assert.equal(res.status, 404, `${conversationId}: ${raw}`)
})

test('[integration] GET /search uses the same perspective-specific direct title', async () => {
  const { companyId, projectId, conversationId } = await seedHumanDirectWithSelfStoredTitle()

  const res = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent('Ada')}`, {
    headers: { 'x-company-id': companyId, 'x-project-id': projectId },
  })
  const raw = await res.text()
  assert.equal(res.status, 200, raw)
  const body = JSON.parse(raw) as { rooms: Array<{ id: string; title: string }> }
  const direct = body.rooms.find((r) => r.id === conversationId)

  assert.equal(direct?.title, 'Ada')
})

async function seedGroupCreationFixture(): Promise<{ companyId: string; agentId: string; generalId: string; currentId: string }> {
  const companyId = 'c-group-workspace'
  const agentId = 'agent-workspace'
  const generalId = 'p-general'
  const currentId = 'p-current'
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, 'Workspace Co', 'workspace-co', $2)`,
    [companyId, ME_USER_ID],
  )
  await seedUserMembership(ME_USER_ID, companyId)
  await pool.query(
    `INSERT INTO participants (id, kind, name, initial, avatar_bg, status, company_id)
     VALUES ($1, 'agent', 'Workspace Agent', 'W', '#000', 'online', $2)`,
    [agentId, companyId],
  )
  await pool.query(
    `INSERT INTO projects (id, company_id, name, color, created_by, is_general)
     VALUES ($1,$3,'General','#000',$4,TRUE), ($2,$3,'Current','#111',$4,FALSE)`,
    [generalId, currentId, companyId, ME_USER_ID],
  )
  return { companyId, agentId, generalId, currentId }
}

test('[integration] new group binds to the current workspace immediately', async () => {
  const { companyId, agentId, currentId } = await seedGroupCreationFixture()
  const res = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({ clientRequestId: 'group-current-0001', title: 'Current group', members: [agentId], leaderId: agentId, workspaceId: currentId }),
  })
  assert.equal(res.status, 201)
  const body = await res.json() as { id: string; projectId: string }
  assert.equal(body.projectId, currentId)
  const stored = await pool.query<{ project_id: string }>(`SELECT project_id FROM conversations WHERE id=$1`, [body.id])
  assert.equal(stored.rows[0]?.project_id, currentId)
  const binding = await pool.query<{ profile: { members: string[] } }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [body.id, companyId],
  )
  assert.deepEqual(binding.rows[0]?.profile.members.sort(), [ME_USER_ID, agentId].sort())

  const duplicate = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({ clientRequestId: 'group-current-0001', title: 'Current group', members: [agentId], leaderId: agentId, workspaceId: currentId }),
  })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json() as { id: string; created: boolean }).id, body.id)
  const count = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM conversations WHERE id=$1`, [body.id])
  assert.equal(count.rows[0]?.count, '1')
})

test('[integration] Agent metadata commands share the locked Conversations domain path', async () => {
  const { companyId, agentId, currentId } = await seedGroupCreationFixture()
  const created = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({
      clientRequestId: 'agent-metadata-0001',
      title: 'Original title',
      members: [agentId],
      leaderId: agentId,
      workspaceId: currentId,
    }),
  })
  assert.equal(created.status, 201)
  const conversationId = (await created.json() as { id: string }).id
  const { runCli } = await import('../agents/cli.js')

  const renamed = await runCli([
    'rename', conversationId, 'Canonical title',
    '--if-equals', 'Original title', '--as', agentId,
  ])
  assert.equal(renamed.ok, true, renamed.text)
  assert.equal(renamed.sideEffects?.length, 1)

  const noOp = await runCli(['rename', conversationId, 'Canonical title', '--as', agentId])
  assert.equal(noOp.ok, true, noOp.text)
  assert.match(noOp.text, /no-op/)
  assert.equal(noOp.sideEffects?.length ?? 0, 0)

  const stale = await runCli([
    'rename', conversationId, 'Conflicting title',
    '--if-equals', 'Original title', '--as', agentId,
  ])
  assert.equal(stale.ok, false)
  assert.match(stale.text, /stale: current title is "Canonical title"/)

  const topic = await runCli(['topic-set', conversationId, 'One domain path', '--as', agentId])
  assert.equal(topic.ok, true, topic.text)
  assert.equal(topic.sideEffects?.length, 1)
  const read = await runCli(['topic', conversationId, '--as', agentId])
  assert.equal(read.text, 'One domain path')

  const stored = await pool.query<{ title: string; topic: string }>(
    `SELECT title, topic FROM conversations WHERE id = $1 AND company_id = $2`,
    [conversationId, companyId],
  )
  assert.deepEqual(stored.rows, [{ title: 'Canonical title', topic: 'One domain path' }])
})

test('[integration] new group rejects a missing current workspace', async () => {
  const { companyId, agentId } = await seedGroupCreationFixture()
  const res = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-company-id': companyId },
    body: JSON.stringify({ clientRequestId: 'group-missing-0001', title: 'General group', members: [agentId], leaderId: agentId }),
  })
  assert.equal(res.status, 400)
  const body = await res.json() as { error: string }
  assert.match(body.error, /workspaceId required/)
})
