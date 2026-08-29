import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Queryable } from '../db/queryable.js'
import type { DocumentMentionEvent } from '../modules/documents/contracts.js'
import { DocumentMentionApplication } from '../modules/documents/mention-application.js'

interface RecordedCall { text: string; params: readonly unknown[] }

function mentionDb(delivery?: { attempts?: number }) {
  const calls: RecordedCall[] = []
  const db: Queryable = {
    query: async (text, params = []) => {
      calls.push({ text, params })
      if (/SELECT document\.title AS document_title/.test(text)) {
        return { rows: [{
          document_title: 'Launch notes', project_id: 'project-1', mentioner_name: 'Lee',
        }], rowCount: 1 } as never
      }
      if (/SELECT participant\.id,participant\.kind,participant\.name/.test(text)) {
        return { rows: [
          { id: 'human-2', kind: 'human', name: 'Rui' },
          { id: 'agent-1', kind: 'agent', name: 'Sage' },
        ], rowCount: 2 } as never
      }
      if (/FROM document_mention_deliveries/.test(text) && /FOR UPDATE SKIP LOCKED/.test(text)) {
        return { rows: [{
          id: 'delivery-1', company_id: 'company-1', document_id: 'document-1',
          project_id: 'project-1', mentioner_id: 'human-1', mentioner_name: 'Lee',
          document_title: 'Launch notes',
          recipients: [{ id: 'human-2', kind: 'human', name: 'Rui' }, { id: 'agent-1', kind: 'agent', name: 'Sage' }],
          attempts: delivery?.attempts ?? 0,
        }], rowCount: 1 } as never
      }
      return { rows: [], rowCount: 1 } as never
    },
  }
  return { db, calls }
}

test('document mention writes deduped records and one durable delivery before side effects', async () => {
  const { db, calls } = mentionDb()
  let transactions = 0
  const published: DocumentMentionEvent[] = []
  const wakes: string[] = []
  const application = new DocumentMentionApplication({
    transaction: async (work) => { transactions++; return work(db) },
    publish: async (event) => { published.push(event) },
    wakeAgent: async ({ agentId }) => { wakes.push(agentId) },
    metric: () => undefined,
  })

  const result = await application.notify({
    documentId: 'document-1', companyId: 'company-1', mentionerId: 'human-1',
    requestedIds: ['human-1', 'human-2', 'agent-1', 'agent-1'],
  })

  assert.equal(transactions, 1)
  assert.ok(result.deliveryId?.startsWith('dmd_'))
  assert.deepEqual(result.mentionedIds, ['human-2', 'agent-1'])
  assert.deepEqual(published, [])
  assert.deepEqual(wakes, [])
  const participantLookup = calls.find((call) => /SELECT participant\.id,participant\.kind,participant\.name/.test(call.text))
  assert.deepEqual(participantLookup?.params[1], ['human-2', 'agent-1'])
  const advisoryLocks = calls.filter((call) => /pg_advisory_xact_lock/.test(call.text))
  assert.equal(advisoryLocks.length, 2)
  assert.equal(advisoryLocks[0]?.params[0], '["company-1","document-1","human-1","human-2"]')
  assert.equal(calls.filter((call) => /INSERT INTO document_mentions/.test(call.text)).length, 2)
  assert.equal(calls.filter((call) => /INSERT INTO agent_log/.test(call.text)).length, 1)
  assert.equal(calls.filter((call) => /INSERT INTO document_mention_deliveries/.test(call.text)).length, 1)
})

test('document mention delivery publishes once and wakes agents with the durable delivery id', async () => {
  const { db, calls } = mentionDb()
  const published: DocumentMentionEvent[] = []
  const wakes: Array<{ deliveryId: string; agentId: string }> = []
  const application = new DocumentMentionApplication({
    transaction: (work) => work(db),
    publish: async (event) => { published.push(event) },
    wakeAgent: async ({ deliveryId, agentId }) => { wakes.push({ deliveryId, agentId }) },
    metric: () => undefined,
  })

  assert.equal(await application.deliverOnce('worker-1'), true)
  assert.equal(published[0]?.deliveryId, 'delivery-1')
  assert.deepEqual(published[0]?.mentionedIds, ['human-2', 'agent-1'])
  assert.deepEqual(wakes, [{ deliveryId: 'delivery-1', agentId: 'agent-1' }])
  assert.match(calls[0]!.text, /FOR UPDATE SKIP LOCKED/)
  assert.ok(calls.some((call) => /status='completed'/.test(call.text)))
})

test('failed document mention delivery releases its lease into durable retry state', async () => {
  const { db, calls } = mentionDb({ attempts: 1 })
  const application = new DocumentMentionApplication({
    transaction: (work) => work(db),
    publish: async () => { throw new Error('redis unavailable') },
    wakeAgent: async () => undefined,
    metric: () => undefined,
  })

  assert.equal(await application.deliverOnce('worker-1'), true)
  const retry = calls.find((call) => /SET status=\$4,last_error=\$5/.test(call.text))
  assert.ok(retry)
  assert.deepEqual(retry.params.slice(0, 5), ['delivery-1', 'worker-1', 2, 'queued', 'redis unavailable'])
  assert.match(retry.text, /leased_until=NULL,leased_by=NULL/)
})
