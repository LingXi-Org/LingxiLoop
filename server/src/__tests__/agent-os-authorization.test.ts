import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertHostActionPermission } from '../agent-os/authorization.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'
import type { Queryable } from '../db/queryable.js'
import { ForbiddenError } from '../modules/access/public.js'

const work: AgentWorkItem = {
  id: 'work',
  companyId: 'company',
  authorizationUserId: 'human',
  agentId: 'agent',
  channelId: 'conversation',
  triggerClientMsgNo: 'trigger',
  reason: 'message',
  lane: 'learner',
  fence: 1,
  leaseToken: 'lease',
  executionRole: 'coordinator',
}

const action: HostAction = {
  runId: 'run',
  cellId: 'cell',
  callIndex: 0,
  action: 'chat.history',
  args: {},
  idempotencyKey: 'key',
}

function accessDb(projectMembership = true): { db: Queryable; calls: string[] } {
  const calls: string[] = []
  const db: Queryable = {
    query: async (sql) => {
      calls.push(sql)
      if (/FROM users WHERE/.test(sql)) {
        return { rows: [{ id: 'human', deleted_at: null, suspended_at: null }], rowCount: 1 } as never
      }
      if (/FROM conversations WHERE id=\$1/.test(sql)) {
        return { rows: [{
          company_id: 'company', project_id: 'project', created_by: null,
          conversation_members: ['human', 'agent'], leader_id: 'agent', resource_status: null,
        }], rowCount: 1 } as never
      }
      if (/FROM projects WHERE id=\$1/.test(sql)) {
        return { rows: [{
          id: 'project', company_id: 'company', kind: 'PERSONAL_LEARNING',
          plan_id: null, status: 'ACTIVE',
        }], rowCount: 1 } as never
      }
      if (/FROM companies WHERE id=\$1/.test(sql)) {
        return { rows: [{ id: 'company', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan' }], rowCount: 1 } as never
      }
      if (/FROM company_memberships/.test(sql)) {
        return { rows: [{ role: 'MEMBER', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM project_memberships/.test(sql)) {
        return { rows: projectMembership ? [{ role: 'STUDENT', status: 'ACTIVE' }] : [], rowCount: projectMembership ? 1 : 0 } as never
      }
      if (/FROM plans WHERE id=\$1/.test(sql)) {
        return { rows: [{ id: 'plan', code: 'PERSONAL_FREE', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plan_entitlements/.test(sql)) {
        return {
          rows: [
            { code: 'conversation.core', value: true },
            { code: 'agent.core', value: true },
          ],
          rowCount: 2,
        } as never
      }
      throw new Error(`unexpected access query: ${sql}`)
    },
  }
  return { db, calls }
}

test('Host Action rejects work without a persisted human principal before querying', async () => {
  const { db, calls } = accessDb()
  await assert.rejects(assertHostActionPermission(db, { ...work, authorizationUserId: undefined }, action), /human authorization principal/)
  assert.deepEqual(calls, [])
})

test('Host Action uses the delegated human Project membership', async () => {
  const { db, calls } = accessDb()
  await assertHostActionPermission(db, work, action)
  assert.equal(calls.some((sql) => /FROM project_memberships/.test(sql)), true)
})

test('Host Action fails closed when delegated Project membership was revoked', async () => {
  const { db } = accessDb(false)
  await assert.rejects(
    assertHostActionPermission(db, work, action),
    (error) => error instanceof ForbiddenError && error.reason === 'PROJECT_MEMBERSHIP_REQUIRED',
  )
})

test('ordinary members retain scoped Agent OS memory recall and note permissions', async () => {
  const { db } = accessDb()
  for (const memoryAction of ['memory.recall', 'memory.note']) {
    await assert.doesNotReject(assertHostActionPermission(db, work, {
      ...action,
      action: memoryAction,
    }))
  }
})
