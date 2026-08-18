/**
 * Unit tests for the email-attachment GC reconciliation.
 *
 * pickOrphans is the load-bearing decision: given a storage listing + the
 * set of DB-referenced keys + a wall-clock, decide which keys to delete.
 * A bug here would either:
 *   - delete keys that ARE referenced (irretrievable data loss), or
 *   - delete keys that just arrived (race with an in-flight inbound).
 * Both failure modes are easy to verify in isolation, so do it here
 * rather than waiting for production to catch them.
 *
 * Run: npm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickOrphans } from '../email-gc.js'

const NOW = 1_700_000_000_000  // arbitrary fixed wall-clock
const HOUR = 60 * 60_000

test('pickOrphans returns empty when storage and db agree', () => {
  const keys = ['email-attachments/a', 'email-attachments/b']
  const inStorage = keys.map((k) => ({ key: k, sizeBytes: 100, lastModifiedMs: NOW - 10 * HOUR }))
  const result = pickOrphans({ inStorage, inDb: new Set(keys), nowMs: NOW })
  assert.deepEqual(result, [])
})

test('pickOrphans flags storage objects with no DB row (when old enough)', () => {
  const result = pickOrphans({
    inStorage: [
      { key: 'email-attachments/orphan', sizeBytes: 100, lastModifiedMs: NOW - 10 * HOUR },
      { key: 'email-attachments/keep',   sizeBytes: 100, lastModifiedMs: NOW - 10 * HOUR },
    ],
    inDb: new Set(['email-attachments/keep']),
    nowMs: NOW,
  })
  assert.deepEqual(result, ['email-attachments/orphan'])
})

test('pickOrphans spares fresh uploads even if no DB row exists yet', () => {
  // The classic upload-then-persist race: bytes are in storage, the
  // email_attachments INSERT is in flight. Default safety = 1h.
  const result = pickOrphans({
    inStorage: [
      { key: 'email-attachments/just-uploaded', sizeBytes: 100, lastModifiedMs: NOW - 30 * 60_000 }, // 30m ago
    ],
    inDb: new Set(),
    nowMs: NOW,
  })
  assert.deepEqual(result, [], 'fresh upload (30m) must NOT be deleted under 1h safety')
})

test('pickOrphans respects a custom safety threshold', () => {
  // With safetyAgeMs=0 the threshold collapses and every unreferenced
  // key is fair game — useful for ad-hoc cleanup but dangerous as a
  // default.
  const inStorage = [
    { key: 'email-attachments/just-uploaded', sizeBytes: 100, lastModifiedMs: NOW - 10 },
  ]
  assert.deepEqual(
    pickOrphans({ inStorage, inDb: new Set(), nowMs: NOW, safetyAgeMs: 0 }),
    ['email-attachments/just-uploaded'],
  )
})

test('pickOrphans ignores DB-only ghosts (key in DB, not in storage)', () => {
  // A storage_key referenced by a row that the storage backend doesn't
  // have any object for is harmless from a "delete bytes" perspective —
  // there are no bytes to delete. pickOrphans should NOT surface it.
  const result = pickOrphans({
    inStorage: [],
    inDb: new Set(['email-attachments/ghost']),
    nowMs: NOW,
  })
  assert.deepEqual(result, [])
})

test('pickOrphans handles a mix of all three states', () => {
  const result = pickOrphans({
    inStorage: [
      { key: 'email-attachments/live',  sizeBytes: 100, lastModifiedMs: NOW - 24 * HOUR }, // KEEP (in db)
      { key: 'email-attachments/old',   sizeBytes: 100, lastModifiedMs: NOW - 24 * HOUR }, // DELETE (orphan, old)
      { key: 'email-attachments/fresh', sizeBytes: 100, lastModifiedMs: NOW - 5 * 60_000 }, // KEEP (orphan but fresh)
    ],
    inDb: new Set(['email-attachments/live']),
    nowMs: NOW,
  })
  assert.deepEqual(result, ['email-attachments/old'])
})

test('pickOrphans treats lastModifiedMs of 0 as ancient (deletable)', () => {
  // Some backends omit LastModified for newly-listed objects. Treat the
  // fall-through 0 as "very old" so we don't leak forever on those.
  const result = pickOrphans({
    inStorage: [{ key: 'email-attachments/no-mtime', sizeBytes: 100, lastModifiedMs: 0 }],
    inDb: new Set(),
    nowMs: NOW,
  })
  assert.deepEqual(result, ['email-attachments/no-mtime'])
})
