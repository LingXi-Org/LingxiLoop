import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { preferencesRequestSchema } from '../modules/agents/contracts.js'
import { agentAvatarKey, savePersonalAgentAvatar } from '../modules/agents/personal-avatar.js'

test('personal avatar saves require a visible active agent and preserve user/tenant keys', async () => {
  let visible = true
  const writes: unknown[][] = []
  const db = { query: async (sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO user_preferences')) { writes.push(params); return { rows: [] } }
    return { rows: visible ? [{ id: 'nova', kind: 'agent', departedAt: null }] : [] }
  } } as unknown as Queryable
  const scope = { userId: 'user-a', companyId: 'tenant-a', projectId: 'project-a' }
  assert.deepEqual(await savePersonalAgentAvatar(db, scope, 'nova', { seed: 'seed-one' }), { avatar: { seed: 'seed-one' } })
  assert.deepEqual(writes[0], ['user-a', JSON.stringify({ [agentAvatarKey('tenant-a', 'nova')]: { seed: 'seed-one' } }), agentAvatarKey('tenant-a', 'nova')])
  assert.notEqual(agentAvatarKey('tenant-a', 'nova'), agentAvatarKey('tenant-b', 'nova'))
  assert.deepEqual(await savePersonalAgentAvatar(db, scope, 'nova', null), { avatar: null })
  assert.deepEqual(writes[1], ['user-a', '{}', agentAvatarKey('tenant-a', 'nova')])
  visible = false
  await assert.rejects(savePersonalAgentAvatar(db, scope, 'pulse', { seed: 'not-allowed' }), { status: 404 })
  await assert.rejects(savePersonalAgentAvatar(db, scope, 'pulse', null), { status: 404 })
  assert.equal(writes.length, 2)
  assert.equal(preferencesRequestSchema.safeParse({ agentAvatars: {} }).success, false)
  assert.equal(preferencesRequestSchema.safeParse({ theme: 'dark' }).success, true)
})
