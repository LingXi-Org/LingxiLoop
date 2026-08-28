import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  findNotificationPreferences,
  upsertNotificationPreferences,
} from '../modules/learning/repository.js'

function queryable(
  handler: (text: string, params: readonly unknown[] | undefined) => unknown[],
): Queryable {
  return {
    query: async (text, params) => ({ rows: handler(text, params) } as never),
  }
}

test('notification preference lookup keeps tenant and optional course scope explicit', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return []
  })

  const result = await findNotificationPreferences(db, 'company-1', 'user-1', 'course-1')

  assert.equal(result, null)
  assert.deepEqual(values, ['company-1', 'user-1', 'course-1'])
  assert.match(statement, /company_id=\$1 AND user_id=\$2/)
  assert.match(statement, /course_id IS NOT DISTINCT FROM \$3/)
  assert.doesNotMatch(statement, /SELECT \*/)
})

test('course preference upsert carries the trusted tenant scope in one authoritative write', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return []
  })

  await upsertNotificationPreferences(db, {
    id: 'preference-1', companyId: 'company-1', userId: 'user-1', courseId: 'course-1',
    inAppEnabled: true, emailEnabled: false, timezone: 'Asia/Shanghai', preferredTime: '19:00',
  })

  assert.deepEqual(values?.slice(0, 4), ['preference-1', 'company-1', 'user-1', 'course-1'])
  assert.match(statement, /ON CONFLICT\(company_id,user_id,course_id\)/)
  assert.match(statement, /updated_at=NOW\(\)/)
})
