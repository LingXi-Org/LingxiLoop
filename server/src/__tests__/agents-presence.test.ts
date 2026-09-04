import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ParticipantPresenceApplication } from '../modules/agents/presence-application.js'
import { updateHumanPresence } from '../modules/agents/repository.js'

test('human presence persistence requires explicit tenant ids and active human ownership', async () => {
  let sql = ''
  let values: readonly unknown[] | undefined
  const db: Queryable = {
    async query(text, params) {
      sql = text
      values = params
      return { rows: [], rowCount: 0 } as never
    },
  }

  await updateHumanPresence(db, ['co-a'], 'user-a', 'resting')

  assert.match(sql, /company_id=ANY\(\$1::text\[\]\) AND id=\$2/)
  assert.match(sql, /kind='human' AND departed_at IS NULL/)
  assert.deepEqual(values, [['co-a'], 'user-a', 'resting'])
})

test('presence application deduplicates tenant scope and publishes only persisted rows', async () => {
  let values: readonly unknown[] | undefined
  const published: unknown[] = []
  const application = new ParticipantPresenceApplication({
    async query(_text, params) {
      values = params
      return { rows: [{ id: 'user-a', company_id: 'co-a', status_updated_at: new Date(0) }], rowCount: 1 } as never
    },
  }, {
    publish: async (event) => { published.push(event) },
  })

  const updated = await application.setHumanPresence({
    companyIds: ['co-a', 'co-a'], participantId: 'user-a', status: 'avail',
  })

  assert.equal(updated, 1)
  assert.deepEqual(values?.[0], ['co-a'])
  assert.deepEqual(published, [{
    type: 'participants.status',
    companyId: 'co-a',
    participantId: 'user-a',
    status: 'avail',
    statusUpdatedAt: '1970-01-01T00:00:00.000Z',
  }])
})
