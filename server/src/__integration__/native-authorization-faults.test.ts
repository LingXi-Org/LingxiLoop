import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { z } from 'zod'
import type { QueryResultRow } from 'pg'
import { NoEffectError, type ActionContext } from '@lyyzka/lingxios'
import { nativeTool } from '../agents/tools.js'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { createPermissionService, ForbiddenError } from '../modules/access/public.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

async function fixture() {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const room = 'authorization-fault-room', members = ['test-owner', agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Fixture',$4::jsonb)",
    [room,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [room,companyId,JSON.stringify({ channelType: 2,members })])
  const context = { work: { id: 'authorization-fault',tenantId: companyId,agentId,principalId: 'test-owner',
    sessionId: 'session',kind: 'turn',lane: 'interactive',triggerRef: 'fixture',fence: 1,homeEpoch: 1,
    createdAt: new Date().toISOString(),meta: { conversationId: room } },
    action: { runId: 'authorization-fault',cellId: 'cell',callIndex: 0,idempotencyKey: 'fixture',action: 'directory.self',args: {} },
    database: pool,signal: AbortSignal.timeout(10000),deadlineAt: new Date(Date.now()+10000).toISOString(),requestVersion: 1 } as unknown as ActionContext
  let executions = 0
  const tool = nativeTool('directory.self',z.object({}).strict(),{ description: 'Fixture',effect: 'read',approval: false,
    authorize: async () => {},execute: async () => { executions++; return { ok: true } } })
  return { context,tool,executions: () => executions,companyId,projectId }
}

// Inject only at the real permission repository boundary, after native principal/Agent checks.
test('[integration] native preflight keeps resolver outages distinct from denials', async () => {
  const f = await fixture()
  await f.tool.authorize(f.context,{})
  for (const fault of [Object.assign(new Error('protected SQL detail'),{ code: 'ECONNRESET' }),new TypeError('protected implementation detail')]) {
    const db: Queryable = { async query<T extends QueryResultRow>(sql: string,params?: readonly unknown[]) {
      if (sql.includes('email_verified_at')) throw fault
      return pool.query<T>(sql,params ? [...params] : undefined)
    } }
    await assert.rejects(f.tool.authorize({ ...f.context,database: db },{}),error => {
      assert.ok(error instanceof Error)
      assert.ok(!(error instanceof ForbiddenError))
      assert.ok(!(error instanceof NoEffectError && error.code === 'forbidden'))
      assert.equal(error.message,'Permission resolution is unavailable')
      assert.equal(error.cause,fault)
      return true
    })
    assert.equal((await createPermissionService(db).can({ actorUserId: 'test-owner',companyId: f.companyId,
      projectId: f.projectId,action: 'project:read' })).allowed,false)
  }
  assert.equal(f.executions(),0)
})

test('[integration] a real PostgreSQL statement timeout does not become forbidden', async () => {
  const f = await fixture(),client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL statement_timeout='20ms'")
    const db: Queryable = { async query<T extends QueryResultRow>(sql: string,params?: readonly unknown[]) {
      if (sql.includes('email_verified_at')) await client.query('SELECT pg_sleep(0.2)')
      return client.query<T>(sql,params ? [...params] : undefined)
    } }
    await assert.rejects(f.tool.authorize({ ...f.context,database: db },{}),error => {
      assert.ok(error instanceof Error)
      assert.equal(error.message,'Permission resolution is unavailable')
      assert.equal((error.cause as { code: string }).code,'57014')
      return true
    })
    assert.equal(f.executions(),0)
  } finally { await client.query('ROLLBACK'); client.release() }
})

test('[integration] actual revocation remains forbidden and arbitrary reason fields do not imply denial', async () => {
  const f = await fixture()
  const arbitrary = Object.assign(new TypeError('implementation detail'),{ reason: 'not-an-authorization-decision' })
  const tool = nativeTool('directory.self',z.object({}).strict(),{ description: 'Fixture',effect: 'read',approval: false,
    authorize: async () => { throw arbitrary },execute: async () => { throw new Error('must not execute') } })
  await assert.rejects(tool.authorize(f.context,{}),error => error === arbitrary)
  await pool.query("UPDATE users SET suspended_at=NOW() WHERE id='test-owner'")
  await assert.rejects(f.tool.authorize(f.context,{}),error => error instanceof NoEffectError && error.code === 'forbidden')
  assert.equal(f.executions(),0)
})
