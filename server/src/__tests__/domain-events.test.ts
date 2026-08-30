import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  appendDomainEvent,
  commitDomainEvent,
  readDomainEventsAfter,
  type DomainEventEnvelope,
  type JsonObject,
} from '../modules/events/public.js'

const occurredAt = '2026-08-30T00:00:00.000Z'

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'event-1', company_id: 'company-1', project_id: 'project-1',
    aggregate_type: 'LEARNING_CASE', aggregate_id: 'case-1', sequence: 7,
    aggregate_sequence: 2, event_type: 'LEARNING_CASE.DETECTED', schema_version: 1,
    idempotency_key: 'case-1:detected', actor_type: 'USER', actor_id: 'teacher-1',
    payload: { caseId: 'case-1' }, occurred_at: occurredAt, ...overrides,
  }
}

const input = {
  companyId: 'company-1',
  projectId: 'project-1',
  aggregateType: 'LEARNING_CASE',
  aggregateId: 'case-1',
  idempotencyKey: 'case-1:detected',
  actor: { type: 'USER' as const, id: 'teacher-1' },
  event: {
    eventType: 'LEARNING_CASE.DETECTED' as const,
    schemaVersion: 1,
    payload: { caseId: 'case-1' },
  },
}

function transactionDb(existing?: ReturnType<typeof row>) {
  const calls: Array<{ text: string; params?: readonly unknown[] }> = []
  const db = {
    query: async <T>(text: string, params?: readonly unknown[]) => {
      calls.push({ text, params })
      if (text.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 }
      if (text.includes('WHERE company_id=$1 AND idempotency_key=$2')) {
        return { rows: (existing ? [existing] : []) as T[], rowCount: existing ? 1 : 0 }
      }
      if (text.includes('INSERT INTO domain_events')) return { rows: [row()] as T[], rowCount: 1 }
      if (text.includes('SELECT * FROM domain_events')) return { rows: [row()] as T[], rowCount: 1 }
      throw new Error(`unexpected query: ${text}`)
    },
  } as Queryable
  return { db, calls, transaction: <T>(work: (client: Queryable) => Promise<T>) => work(db) }
}

test('domain mutation and event append share one caller-owned transaction', async () => {
  const fixture = transactionDb()
  const order: string[] = []
  const result = await commitDomainEvent(fixture.transaction, async () => {
    order.push('mutation')
    return { caseId: 'case-1' }
  }, () => input)
  order.push('event')

  assert.deepEqual(result.result, { caseId: 'case-1' })
  assert.equal(result.event?.sequence, 7)
  assert.deepEqual(order, ['mutation', 'event'])
  assert.match(fixture.calls[0]!.text, /pg_advisory_xact_lock/)
  assert.match(fixture.calls[2]!.text, /COALESCE\(MAX\(prior\.aggregate_sequence\),0\)\+1/)
  assert.deepEqual(fixture.calls[2]!.params?.slice(1, 5), [
    'company-1', 'project-1', 'LEARNING_CASE', 'case-1',
  ])
})

test('an exact idempotent retry returns the original event without another insert', async () => {
  const fixture = transactionDb(row())
  const replay = await appendDomainEvent(fixture.transaction, input)

  assert.equal(replay.id, 'event-1')
  assert.equal(replay.aggregateSequence, 2)
  assert.equal(fixture.calls.filter((call) => call.text.includes('INSERT INTO domain_events')).length, 0)
})

test('idempotency key reuse with a changed typed payload is rejected', async () => {
  const fixture = transactionDb(row())
  await assert.rejects(
    appendDomainEvent(fixture.transaction, {
      ...input,
      event: { ...input.event, payload: { caseId: 'other-case' } },
    }),
    /idempotency key was reused/,
  )
})

test('payload and cursor bounds fail before persistence', async () => {
  const fixture = transactionDb()
  await assert.rejects(appendDomainEvent(fixture.transaction, {
    ...input,
    event: { ...input.event, payload: { text: 'x'.repeat(32_769) } },
  }), /payload exceeds/)
  assert.equal(fixture.calls.length, 0)

  await assert.rejects(readDomainEventsAfter(fixture.db, {
    companyId: 'company-1', limit: 101,
  }), /limit must be between 1 and 100/)
  assert.equal(fixture.calls.length, 0)
})

test('event cursor reads are tenant scoped, optional-Project scoped and bounded', async () => {
  const fixture = transactionDb()
  const events: DomainEventEnvelope<string, JsonObject>[] = await readDomainEventsAfter(fixture.db, {
    companyId: 'company-1', projectId: 'project-1', afterSequence: 6, limit: 20,
  })
  assert.equal(events[0]?.sequence, 7)
  assert.match(fixture.calls[0]!.text, /company_id=\$1 AND sequence>\$2/)
  assert.match(fixture.calls[0]!.text, /project_id=\$3/)
  assert.deepEqual(fixture.calls[0]!.params, ['company-1', 6, 'project-1', 20])
})

test('event repository has no mutation path for the append-only ledger', () => {
  const repository = readFileSync(new URL('../modules/events/repository.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(repository, /UPDATE domain_events|DELETE FROM domain_events/)
  assert.match(repository, /company_id=\$1 AND idempotency_key=\$2/)
})
