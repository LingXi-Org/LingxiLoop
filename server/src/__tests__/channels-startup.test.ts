import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { Queryable } from '../db/queryable.js'
import { ImChannelsApplication } from '../im/channels-application.js'

// Failure model: independent DB/IM reads serialize startup, or parallel IM
// results bypass the authorized channel rows used to shape the response.
test('channel projection overlaps independent reads and only emits authorized rows', async () => {
  let finishRows!: (value: { rows: unknown[] }) => void
  let imStarted = false
  const rows = new Promise<{ rows: unknown[] }>(resolve => { finishRows = resolve })
  const application = new ImChannelsApplication({
    db: { query: () => rows } as unknown as Queryable,
    listConversations: async () => {
      imStarted = true
      return [{ channelId: 'foreign', channelType: 2, unread: 99 }]
    },
  })
  const listing = application.list({ companyId: 'tenant', projectId: 'project', userId: 'human' })
  await setImmediate()
  assert.equal(imStarted, true, 'IM summaries must start before the independent DB rows complete')
  finishRows({ rows: [] })
  assert.deepEqual(await listing, [], 'IM entries alone never establish channel membership')
})
