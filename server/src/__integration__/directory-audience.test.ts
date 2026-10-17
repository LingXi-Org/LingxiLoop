// Failure inventory (before implementation): a hidden DM must not fail self or leak metadata/counts;
// every frozen human AND original principal must pass existing tenant/project policy; departed
// audience/agent, principal revocation and missing identity must fail closed; left-agent/other-tenant
// rooms must be absent; deleted candidates are opaque; enumeration, audience, policy DB timeouts
// and programming errors must fail as dependencies, never become a successful filtered response.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import type { QueryResultRow } from 'pg'
import { NoEffectError } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { ForbiddenError } from '../modules/access/public.js'
import { AgentDirectoryApplication } from '../modules/agents/directory-application.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { context, ids, readDirectory, runDirectoryTurn, seedDirectory, self } from './directory-audience-fixture.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables(); await seedDirectory() })
after(async () => { await teardownAll() })
const rooms = (result: Awaited<ReturnType<typeof self.execute>>) => (result.value as { conversations: { id: string }[] }).conversations.map(row => row.id).sort()

test('self intersects agent membership, tenant, project and all frozen readers without metadata/count side channels', async () => {
  for (const [audience, expected] of [
    ['a', ['directory-dm-a', 'directory-project-room', 'directory-shared']],
    ['b', ['directory-dm-b', 'directory-shared']],
    ['shared', ['directory-shared']],
  ] as const) {
    const result = await readDirectory(audience)
    assert.equal(result.ok, true)
    assert.deepEqual(rooms(result), expected)
    assert.deepEqual(Object.keys(result).sort(), ['ok', 'value'])
    assert.deepEqual(Object.keys(result.value as object).sort(), ['conversations', 'identity'])
    const text = JSON.stringify(result)
    for (const hidden of ['directory-dm-a', 'directory-dm-b', 'directory-project-room', 'directory-left', 'directory-other-tenant'].filter(id => !(expected as readonly string[]).includes(id))) assert.ok(!text.includes(hidden))
  }
})

test('original principal outside a narrower audience remains mandatory', async () => {
  const ctx = context('shared', ids.a)
  ctx.work.conversation!.audience.participantIds = [ids.b, ids.agent]
  await self.authorize(ctx, {})
  assert.deepEqual(rooms(await self.execute(ctx, {})), ['directory-shared'])
})

test('missing/deleted candidate is opaque and cannot fail readable identity', async () => {
  const ctx = context('a')
  const db: Queryable = { async query<T extends QueryResultRow>(sql: string, params?: readonly unknown[]) {
    const result = await pool.query<T>(sql, params ? [...params] : undefined)
    if (sql.includes('ORDER BY updated_at DESC')) await pool.query("DELETE FROM conversations WHERE id='directory-dm-b'")
    return result
  } }
  ctx.database = db
  const result = await self.execute(ctx, {})
  assert.deepEqual(rooms(result), ['directory-dm-a', 'directory-project-room', 'directory-shared'])
  assert.ok(!JSON.stringify(result).includes('directory-dm-b'))
})

test('current principal, agent, frozen audience and missing identity fail closed', async () => {
  const ctx = context('a')
  await pool.query('UPDATE users SET access_revoked_at=NOW() WHERE id=$1', [ids.a])
  await assert.rejects(self.authorize(ctx, {}), NoEffectError)
  await pool.query('UPDATE users SET access_revoked_at=NULL WHERE id=$1', [ids.a])
  await pool.query('UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2', [ids.company, ids.agent])
  await assert.rejects(self.authorize(ctx, {}), NoEffectError)
  await assert.rejects(new AgentDirectoryApplication(pool).identity(ids.agent))
  await pool.query('UPDATE participants SET departed_at=NULL WHERE company_id=$1 AND id=$2', [ids.company, ids.agent])
  await pool.query('UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2', [ids.company, ids.a])
  await assert.rejects(self.authorize(ctx, {}), NoEffectError)
  await assert.rejects(new AgentDirectoryApplication(pool).identity('directory-missing'))
  await pool.query('UPDATE participants SET departed_at=NULL WHERE company_id=$1 AND id=$2', [ids.company, ids.a])
  await pool.query('UPDATE users SET suspended_at=NOW() WHERE id=$1', [ids.a])
  await assert.rejects(self.execute(ctx, {}), (error: unknown) => error instanceof ForbiddenError && error.reason === 'ACTOR_INACTIVE')
  await assert.rejects(self.authorize(ctx, {}), NoEffectError)
  ctx.work.principalId = undefined
  await assert.rejects(self.authorize(ctx, {}), NoEffectError)
})

test('project revocation hides the candidate while current conversation remains readable', async () => {
  await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE project_id='directory-project-private' AND user_id=$1", [ids.a])
  assert.deepEqual(rooms(await readDirectory('a')), ['directory-dm-a', 'directory-shared'])
  const ctx = context('a')
  await pool.query('UPDATE project_memberships SET status=\'SUSPENDED\' WHERE project_id=(SELECT project_id FROM conversations WHERE id=\'directory-dm-a\') AND user_id=$1', [ids.a])
  await assert.rejects(self.authorize(ctx, {}), NoEffectError)
})

test('query timeout and code faults are dependencies, not successful empty directories or authorization refusals', async () => {
  for (const target of ['FROM participants\n', 'ORDER BY updated_at DESC', 'SELECT id,kind,departed_at', 'FROM conversations WHERE id=$1']) {
    for (const fault of [Object.assign(new Error('synthetic statement timeout'), { code: '57014' }), new TypeError('synthetic programming fault')]) {
      const ctx = context('a')
      const db: Queryable = { async query<T extends QueryResultRow>(sql: string, params?: readonly unknown[]) {
        if (sql.includes(target)) throw fault
        return pool.query<T>(sql, params ? [...params] : undefined)
      } }
      ctx.database = db
      await assert.rejects(self.execute(ctx, {}), (error: unknown) => error instanceof Error && !(error instanceof ForbiddenError) && !(error instanceof NoEffectError))
    }
  }
  const client = await pool.connect()
  let timedOut = false
  try {
    await client.query('SET statement_timeout=20')
    const ctx = context('a')
    const db: Queryable = { async query<T extends QueryResultRow>(sql: string, params?: readonly unknown[]) {
      if (sql.includes('FROM conversations WHERE id=$1')) {
        try { await client.query('SELECT pg_sleep(0.1)') }
        catch (error) { timedOut = (error as { code?: string }).code === '57014'; throw error }
      }
      return client.query<T>(sql, params ? [...params] : undefined)
    } }
    ctx.database = db
    await assert.rejects(self.execute(ctx, {}), (error: unknown) => error instanceof Error && !(error instanceof ForbiddenError))
    assert.equal(timedOut, true, 'a real PostgreSQL statement timeout must not become invisible metadata')
  } finally { await client.query('SET statement_timeout=60000'); client.release() }
})

test('native runtime finishes and accepts a following turn under both audiences', { timeout: 120000 }, async () => {
  const im = await installRecordingWukong()
  try {
    for (const audience of ['a', 'b'] as const) {
      for (const turn of [1, 2]) assert.equal((await runDirectoryTurn(audience, turn)).status, 'succeeded')
    }
  } finally { await im.close() }
})
