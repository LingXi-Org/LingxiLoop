import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { AdminApplication, AdminApplicationError } from '../modules/admin/application.js'

function adminDb(isAdmin: boolean): Queryable {
  return {
    async query() {
      return { rows: [{ is_admin: isAdmin }], rowCount: 1 } as never
    },
  }
}

function infrastructure(db: Queryable) {
  return {
    db,
    transaction: async <T>(work: (transactionDb: Queryable) => Promise<T>) => work(db),
    adminEmails: [] as string[],
    mirrorAvatar: async () => null,
    installStarterAgents: async () => false,
    finalizeStarterAgents: async () => undefined,
    sendWaitlistApprovedEmail: async () => undefined,
    auditInTransaction: async () => undefined,
  }
}

test('admin application rejects missing and non-admin identities explicitly', async () => {
  const db = adminDb(false)
  const application = new AdminApplication(infrastructure(db))
  await assert.rejects(application.authorize(undefined), (error: unknown) => {
    assert.ok(error instanceof AdminApplicationError)
    assert.equal(error.status, 401)
    return true
  })
  await assert.rejects(application.authorize('user-1'), (error: unknown) => {
    assert.ok(error instanceof AdminApplicationError)
    assert.equal(error.status, 403)
    return true
  })
})

test('admin application returns the trusted actor id after repository authorization', async () => {
  const db = adminDb(true)
  const application = new AdminApplication(infrastructure(db))
  assert.equal(await application.authorize('admin-1'), 'admin-1')
})

test('admin application prevents self-demotion before issuing a mutation', async () => {
  const db = adminDb(true)
  const application = new AdminApplication(infrastructure(db))
  await assert.rejects(
    application.patchUser('admin-1', 'admin-1', { isAdmin: false }),
    (error: unknown) => {
      assert.ok(error instanceof AdminApplicationError)
      assert.equal(error.status, 409)
      return true
    },
  )
})

test('admin security mutations and audit events share one application transaction', () => {
  const source = readFileSync(new URL('../modules/admin/application.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /infrastructure\.audit\(/)
  for (const kind of [
    'admin_settings_update', 'waitlist_approve', 'waitlist_reject',
    'user_admin_grant', 'user_suspend', 'user_unsuspend',
  ]) {
    assert.match(source, new RegExp(`auditInTransaction\\(db, \\{[\\s\\S]{0,120}kind: (?:[^\\n]*\\? )?'${kind}'`))
  }
})
