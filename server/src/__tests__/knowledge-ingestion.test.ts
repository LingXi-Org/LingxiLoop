import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  claimIngestionJob,
  recordIngestionFailure,
  releaseDeferredWakeState,
  softDeleteTenantSource,
} from '../modules/knowledge/ingestion-repository.js'

function recordingDb(rowsByCall: unknown[][]) {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      return { rows: rowsByCall[calls.length - 1] ?? [], rowCount: 1 } as never
    },
  }
  return { db, calls }
}

test('ingestion claim locks one job and assigns its lease on the same repository port', async () => {
  const { db, calls } = recordingDb([[{ source_id: 'source-1', deadline_passed: true }], []])

  assert.deepEqual(await claimIngestionJob(db, 'worker-1', 120_000), {
    sourceId: 'source-1',
    deadlinePassed: true,
  })
  assert.equal(calls.length, 2)
  assert.match(calls[0]!.text, /FOR UPDATE SKIP LOCKED/)
  assert.match(calls[1]!.text, /leased_until=NOW\(\)\+\(\$2::int \* INTERVAL '1 millisecond'\)/)
  assert.deepEqual(calls[1]!.params, ['source-1', 120_000, 'worker-1'])
})

test('deferred wake is tenant-owned, idempotent, and records its terminal release', async () => {
  const { db, calls } = recordingDb([[
    {
      wake_recipients: [{ agentId: 'agent-1', reason: 'knowledge_ready' }],
      wake_channel_id: 'conversation-1',
      wake_trigger_client_msg_no: 'message-1',
      wake_thread_root_client_msg_no: null,
      wake_released_at: null,
      company_id: 'company-1',
    },
  ], [], []])

  assert.equal(await releaseDeferredWakeState(db, 'source-1'), 'ready')
  assert.match(calls[0]!.text, /JOIN knowledge_sources source ON source\.id=job\.source_id/)
  assert.match(calls[0]!.text, /FOR UPDATE OF job/)
  assert.deepEqual(calls[1]!.params.slice(1), [
    'company-1', 'agent-1', 'conversation-1', null, 'message-1', 'knowledge_ready',
  ])
  assert.match(calls[2]!.text, /wake_released_at=NOW\(\)/)

  const alreadyReleased = recordingDb([[
    {
      wake_recipients: [],
      wake_channel_id: 'conversation-1',
      wake_trigger_client_msg_no: 'message-1',
      wake_thread_root_client_msg_no: null,
      wake_released_at: '2026-01-01T00:00:00Z',
      company_id: 'company-1',
    },
  ]])
  assert.equal(await releaseDeferredWakeState(alreadyReleased.db, 'source-1'), 'none')
  assert.equal(alreadyReleased.calls.length, 1)
})

test('failure transition clears the lease and writes job/source retry state together', async () => {
  const { db, calls } = recordingDb([[
    { attempts: 2, external_source_id: 'external-1' },
  ], [], []])

  assert.deepEqual(await recordIngestionFailure(db, {
    sourceId: 'source-1',
    message: 'provider unavailable',
    maxAttempts: 5,
  }), { final: false, externalSourceId: 'external-1' })
  assert.match(calls[0]!.text, /leased_until=NULL, leased_by=NULL/)
  assert.deepEqual(calls[1]!.params, ['source-1', 'queued'])
  assert.deepEqual(calls[2]!.params, ['source-1', 'queued', 'retrying', 'provider unavailable'])
})

test('source deletion carries the trusted tenant and project predicates into the write', async () => {
  const { db, calls } = recordingDb([[]])

  assert.equal(await softDeleteTenantSource(db, {
    sourceId: 'source-1',
    companyId: 'company-1',
    projectId: 'project-1',
  }), true)
  assert.match(calls[0]!.text, /id=\$1 AND company_id=\$2 AND project_id=\$3/)
  assert.deepEqual(calls[0]!.params, ['source-1', 'company-1', 'project-1'])
})
