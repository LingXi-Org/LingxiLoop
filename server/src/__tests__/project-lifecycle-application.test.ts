import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import type { ProjectKind, ProjectStatus } from '../domain/public.js'
import { ProjectLifecycleApplication, ProjectLifecycleError } from '../modules/projects/public.js'

function lifecycleFixture(input: {
  kind?: ProjectKind
  status?: ProjectStatus
  updateSucceeds?: boolean
} = {}) {
  let status = input.status ?? 'ACTIVE'
  let auditCount = 0
  let projectionCount = 0
  const db: Queryable = {
    query: async (sql, params) => {
      if (/FROM users WHERE/.test(sql)) {
        return { rows: [{ id: 'owner', deleted_at: null, suspended_at: null }], rowCount: 1 } as never
      }
      if (/FROM projects WHERE/.test(sql)) {
        return { rows: [{
          id: 'project', company_id: 'company', kind: input.kind ?? 'PERSONAL_LEARNING',
          plan_id: null, status,
        }], rowCount: 1 } as never
      }
      if (/FROM companies WHERE/.test(sql)) {
        return { rows: [{ id: 'company', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan' }], rowCount: 1 } as never
      }
      if (/FROM company_memberships/.test(sql)) {
        return { rows: [{ role: 'OWNER', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM project_memberships/.test(sql)) {
        return { rows: [{ role: 'OWNER', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plans WHERE/.test(sql)) {
        return { rows: [{ id: 'plan', code: 'PERSONAL_FREE', status: 'ACTIVE' }], rowCount: 1 } as never
      }
      if (/FROM plan_entitlements/.test(sql)) {
        return { rows: [{ code: 'project.core', value: true }], rowCount: 1 } as never
      }
      if (/UPDATE projects/.test(sql)) {
        if (input.updateSucceeds === false) return { rows: [], rowCount: 0 } as never
        assert.deepEqual(params, ['project', 'company', status, 'ARCHIVED'])
        status = 'ARCHIVED'
        return { rows: [], rowCount: 1 } as never
      }
      throw new Error(`unexpected lifecycle query: ${sql}`)
    },
  }
  const application = new ProjectLifecycleApplication({
    transaction: (work) => work(db),
    auditInTransaction: async () => { auditCount += 1 },
    projectLifecycleProjection: async () => { projectionCount += 1 },
  })
  return {
    application,
    counts: () => ({ auditCount, projectionCount }),
  }
}

test('Project lifecycle applies once and repeated commands have no duplicate effects', async () => {
  const fixture = lifecycleFixture()
  const command = { actorUserId: 'owner', companyId: 'company', projectId: 'project', command: 'ARCHIVE' as const }
  assert.deepEqual(await fixture.application.execute(command), { ok: true, status: 'ARCHIVED', applied: true })
  assert.deepEqual(await fixture.application.execute(command), { ok: true, status: 'ARCHIVED', applied: false })
  assert.deepEqual(fixture.counts(), { auditCount: 1, projectionCount: 1 })
})

test('Project lifecycle rejects invalid jumps and concurrent conditional-update loss', async () => {
  const invalid = lifecycleFixture({ kind: 'TEACHING' })
  await assert.rejects(
    () => invalid.application.execute({
      actorUserId: 'owner', companyId: 'company', projectId: 'project', command: 'ARCHIVE',
    }),
    (error: unknown) => error instanceof ProjectLifecycleError && error.code === 'invalid_transition',
  )

  const concurrent = lifecycleFixture({ updateSucceeds: false })
  await assert.rejects(
    () => concurrent.application.execute({
      actorUserId: 'owner', companyId: 'company', projectId: 'project', command: 'ARCHIVE',
    }),
    (error: unknown) => error instanceof ProjectLifecycleError && error.code === 'concurrent_change',
  )
  assert.deepEqual(concurrent.counts(), { auditCount: 0, projectionCount: 0 })
})
