import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { AdminApplication, AdminApplicationError } from '../modules/admin/application.js'

const infrastructure = {
  suspendUser: async () => undefined,
  unsuspendUser: async () => undefined,
}

function adminDb(isAdmin: boolean): Queryable {
  return {
    async query() {
      return { rows: [{ is_admin: isAdmin }], rowCount: 1 } as never
    },
  }
}

test('admin application rejects missing and non-admin identities explicitly', async () => {
  const application = new AdminApplication(adminDb(false), infrastructure)
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
  const application = new AdminApplication(adminDb(true), infrastructure)
  assert.equal(await application.authorize('admin-1'), 'admin-1')
})

test('admin application prevents self-demotion before issuing a mutation', async () => {
  const application = new AdminApplication(adminDb(true), infrastructure)
  await assert.rejects(
    application.patchUser('admin-1', 'admin-1', { isAdmin: false }),
    (error: unknown) => {
      assert.ok(error instanceof AdminApplicationError)
      assert.equal(error.status, 409)
      return true
    },
  )
})
