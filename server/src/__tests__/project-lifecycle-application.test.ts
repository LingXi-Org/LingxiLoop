import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import type { ProjectStatus } from '../domain/public.js'
import { ProjectLifecycleApplication, ProjectLifecycleError } from '../modules/projects/public.js'

function lifecycleFixture(input: {
  status?: ProjectStatus
  updateSucceeds?: boolean
} = {}) {
  let status = input.status ?? 'READ_ONLY'
  let auditCount = 0
  let projectionCount = 0
  const db: Queryable = {
    query: async (sql, params) => {
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
    db,
    counts: () => ({ auditCount, projectionCount }),
  }
}

test('Project lifecycle rejects invalid jumps and concurrent conditional-update loss', async () => {
  const invalid = lifecycleFixture()
  await assert.rejects(
    () => invalid.application.executeSystemInTransaction(invalid.db, {
      actorUserId: 'owner', companyId: 'company', projectId: 'project', kind: 'TEACHING', status: 'ACTIVE', command: 'ARCHIVE',
    }),
    (error: unknown) => error instanceof ProjectLifecycleError && error.code === 'invalid_transition',
  )

  const concurrent = lifecycleFixture({ updateSucceeds: false })
  await assert.rejects(
    () => concurrent.application.executeSystemInTransaction(concurrent.db, {
      actorUserId: 'owner', companyId: 'company', projectId: 'project', kind: 'TEACHING', status: 'READ_ONLY', command: 'ARCHIVE',
    }),
    (error: unknown) => error instanceof ProjectLifecycleError && error.code === 'concurrent_change',
  )
  assert.deepEqual(concurrent.counts(), { auditCount: 0, projectionCount: 0 })
})
