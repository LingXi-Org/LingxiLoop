import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  claimIngestionJob,
  completeIngestion,
  markExternalSource,
  recordIngestionFailure,
  releaseDeferredWakeState,
  renewIngestionLease,
  requeueIngestion,
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

  const claim = await claimIngestionJob(db, 'worker-1', 120_000)
  assert.ok(claim)
  assert.deepEqual({ sourceId: claim.sourceId, deadlinePassed: claim.deadlinePassed }, {
    sourceId: 'source-1',
    deadlinePassed: true,
  })
  assert.match(claim.leaseToken, /^worker-1:[0-9a-f-]{36}$/)
  assert.equal(calls.length, 2)
  assert.match(calls[0]!.text, /FOR UPDATE SKIP LOCKED/)
  assert.match(calls[1]!.text, /leased_until=NOW\(\)\+\(\$2::int \* INTERVAL '1 millisecond'\)/)
  assert.deepEqual(calls[1]!.params, ['source-1', 120_000, claim.leaseToken])
})

test('lease renewal requires the unique unexpired claim token', async () => {
  const current = recordingDb([[{ source_id: 'source-1' }]])
  assert.equal(await renewIngestionLease(current.db, {
    sourceId: 'source-1', leaseToken: 'worker-1:token', leaseMs: 120_000,
  }), true)
  assert.match(current.calls[0]!.text, /leased_by=\$2 AND leased_until>=NOW\(\)/)
  assert.deepEqual(current.calls[0]!.params, ['source-1', 'worker-1:token', 120_000])

  const expired = recordingDb([[]])
  assert.equal(await renewIngestionLease(expired.db, {
    sourceId: 'source-1', leaseToken: 'worker-1:expired', leaseMs: 120_000,
  }), false)
})

test('an expired worker cannot bind, complete, requeue, or fail a reclaimed job', async () => {
  const staleBind = recordingDb([[]])
  assert.equal(await markExternalSource(staleBind.db, {
    sourceId: 'source-1',
    leaseToken: 'worker-old:token',
    externalSourceId: 'external-old',
    externalCommandId: null,
  }), false)
  assert.match(staleBind.calls[0]!.text, /WITH valid_claim/)
  assert.match(staleBind.calls[0]!.text, /FOR UPDATE/)

  const progress = {
    sourceId: 'source-1',
    leaseToken: 'worker-old:token',
    status: 'processing' as const,
    stage: 'processing',
    error: null,
    chunkCount: 0,
    externalCommandId: null,
  }
  const staleComplete = recordingDb([[]])
  assert.equal(await completeIngestion(staleComplete.db, { ...progress, clearStorageKey: false }), false)
  assert.equal(staleComplete.calls.length, 1)

  const staleRequeue = recordingDb([[]])
  assert.equal(await requeueIngestion(staleRequeue.db, { ...progress, delayMs: 5_000 }), false)
  assert.equal(staleRequeue.calls.length, 1)

  const staleFailure = recordingDb([[]])
  assert.equal(await recordIngestionFailure(staleFailure.db, {
    sourceId: 'source-1',
    leaseToken: 'worker-old:token',
    message: 'stale failure',
    maxAttempts: 5,
  }), null)
  assert.equal(staleFailure.calls.length, 1)
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
      authorization_user_id: 'human-1',
    },
  ], [], []])

  assert.equal(await releaseDeferredWakeState(db, 'source-1'), 'ready')
  assert.match(calls[0]!.text, /JOIN knowledge_sources source ON source\.id=job\.source_id/)
  assert.match(calls[0]!.text, /FOR UPDATE OF job/)
  assert.deepEqual(calls[1]!.params.slice(1), [
    'company-1', 'human-1', 'agent-1', 'conversation-1', null, 'message-1', 'knowledge_ready',
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
      authorization_user_id: 'human-1',
    },
  ]])
  assert.equal(await releaseDeferredWakeState(alreadyReleased.db, 'source-1'), 'none')
  assert.equal(alreadyReleased.calls.length, 1)
})

test('failure transition clears the lease and writes job/source retry state together', async () => {
  const { db, calls } = recordingDb([[
    { final: false, external_source_id: 'external-1' },
  ], []])

  assert.deepEqual(await recordIngestionFailure(db, {
    sourceId: 'source-1',
    leaseToken: 'worker-1:token',
    message: 'provider unavailable',
    maxAttempts: 5,
  }), { final: false, externalSourceId: 'external-1' })
  assert.match(calls[0]!.text, /leased_until=NULL, leased_by=NULL/)
  assert.match(calls[0]!.text, /leased_by=\$4\s+AND job\.leased_until>=NOW\(\)/)
  assert.deepEqual(calls[0]!.params, ['source-1', 'provider unavailable', 5, 'worker-1:token'])
  assert.deepEqual(calls[1]!.params, ['source-1', 'queued', 'retrying', 'provider unavailable'])
})

test('source deletion carries the trusted tenant and project predicates into the write', async () => {
  const { db, calls } = recordingDb([[]])

  assert.equal(await softDeleteTenantSource(db, {
    sourceId: 'source-1',
    companyId: 'company-1',
    projectId: 'project-1',
    userId: 'user-1',
  }), true)
  assert.match(calls[0]!.text, /id=\$1 AND company_id=\$2 AND project_id=\$3/)
  assert.match(calls[0]!.text, /visibility_scope='PRIVATE' AND owner_user_id=\$4/)
  assert.deepEqual(calls[0]!.params, ['source-1', 'company-1', 'project-1', 'user-1'])
})
