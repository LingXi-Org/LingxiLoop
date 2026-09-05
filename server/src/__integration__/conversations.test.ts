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
    `INSERT INTO companies (id, name, slug, type, plan_id)
     VALUES ($1, 'Direct Title Co', 'direct-title-co', 'EDUCATION', 'plan-personal-free')`,
    [companyId],
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
    `INSERT INTO projects (id, company_id, kind, name, color, created_by, is_default)
     VALUES ($1, $2, 'INSTITUTIONAL_COURSE', 'Course', '#667085', $3, TRUE)`,
    [projectId, companyId, ME_USER_ID],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES
       ($1,$2,$3,'OWNER'),($1,$2,$4,'STUDENT')`,
    [companyId, projectId, ME_USER_ID, OTHER_USER_ID],
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

async function seedGroupConversationFixture(): Promise<{
  companyId: string; agentId: string; conversationId: string
}> {
  const companyId = 'c-group-workspace'
  const agentId = 'agent-workspace'
  const generalId = 'p-general'
  const currentId = 'p-current'
  const conversationId = 'group-current'
  await pool.query(
    `INSERT INTO companies (id, name, slug, type, plan_id) VALUES ($1, 'Workspace Co', 'workspace-co', 'EDUCATION', 'plan-personal-free')`,
    [companyId],
  )
  await seedUserMembership(ME_USER_ID, companyId)
  await pool.query(
    `INSERT INTO participants (id, kind, name, initial, avatar_bg, status, company_id)
     VALUES ($1, 'agent', 'Workspace Agent', 'W', '#000', 'online', $2)`,
    [agentId, companyId],
  )
  await pool.query(
    `INSERT INTO projects (id, company_id, kind, name, color, created_by, is_default)
     VALUES ($1,$3,'INSTITUTIONAL_COURSE','Default Course','#000',$4,TRUE),
            ($2,$3,'INSTITUTIONAL_COURSE','Current Course','#111',$4,FALSE)`,
    [generalId, currentId, companyId, ME_USER_ID],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES
       ($1,$2,$4,'OWNER'),($1,$3,$4,'OWNER')`,
    [companyId, generalId, currentId, ME_USER_ID],
  )
  const members = JSON.stringify([ME_USER_ID, agentId])
  await pool.query(
    `INSERT INTO conversations(id,company_id,project_id,kind,title,members,leader_id)
     VALUES ($1,$2,$3,'group','Original title',$4::jsonb,$5)`,
    [conversationId, companyId, currentId, members, agentId],
  )
  await pool.query(
    `INSERT INTO im_channel_bindings(channel_id,company_id,profile)
     VALUES ($1,$2,$3::jsonb)`,
    [conversationId, companyId, JSON.stringify({ channelId: conversationId, channelType: 2, title: 'Original title', members: [ME_USER_ID, agentId] })],
  )
  return { companyId, agentId, conversationId }
}

test('[integration] Agent metadata commands share the locked Conversations domain path', async () => {
  const { companyId, agentId, conversationId } = await seedGroupConversationFixture()
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

test('[integration] Agent mute seals the read cursor in the same domain transaction', async () => {
  const { agentId, conversationId } = await seedGroupConversationFixture()
  const { runCli } = await import('../agents/cli.js')

  const muted = await runCli(['mute', conversationId, '--for', '30m', '--as', agentId])
  assert.equal(muted.ok, true, muted.text)
  const persisted = await pool.query<{ muted: boolean; read: boolean }>(
    `SELECT
       EXISTS(SELECT 1 FROM conversation_mutes
         WHERE user_id = $1 AND conversation_id = $2) AS muted,
       EXISTS(SELECT 1 FROM conversation_reads
         WHERE user_id = $1 AND conversation_id = $2) AS read`,
    [agentId, conversationId],
  )
  assert.deepEqual(persisted.rows, [{ muted: true, read: true }])

  const listed = await runCli(['mute', 'list', '--json', '--as', agentId])
  assert.equal(listed.ok, true, listed.text)
  assert.equal((JSON.parse(listed.text) as Array<{ id: string }>)[0]?.id, conversationId)

  const followed = await runCli(['follow', conversationId, '--as', agentId])
  assert.match(followed.text, /^Following/)
  const alreadyFollowing = await runCli(['follow', conversationId, '--as', agentId])
  assert.match(alreadyFollowing.text, /was not muted/)
  assert.equal((await pool.query(
    `SELECT 1 FROM conversation_mutes WHERE user_id = $1 AND conversation_id = $2`,
    [agentId, conversationId],
  )).rowCount, 0)
})
