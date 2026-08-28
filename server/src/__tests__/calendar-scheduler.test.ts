import assert from 'node:assert/strict'
import test from 'node:test'
import { nextOccurrenceOnOrAfter } from '../modules/calendar/scheduler.js'

test('calendar recurrence advances on the one authoritative scheduler path', () => {
  const seed = new Date('2026-08-24T09:00:00.000Z')
  assert.equal(
    nextOccurrenceOnOrAfter(seed, { freq: 'daily', interval: 2 }, new Date('2026-08-25T00:00:00.000Z'))
      ?.toISOString(),
    '2026-08-26T09:00:00.000Z',
  )
  assert.equal(
    nextOccurrenceOnOrAfter(
      seed,
      { freq: 'weekly', interval: 1, byweekday: [1, 3] },
      new Date('2026-08-25T00:00:00.000Z'),
    )?.toISOString(),
    '2026-08-26T09:00:00.000Z',
  )
})

test('calendar recurrence stops at count and until boundaries', () => {
  const seed = new Date('2026-08-24T09:00:00.000Z')
  assert.equal(
    nextOccurrenceOnOrAfter(
      seed,
      { freq: 'daily', interval: 1, count: 2 },
      new Date('2026-08-26T00:00:00.000Z'),
    ),
    null,
  )
  assert.equal(
    nextOccurrenceOnOrAfter(
      seed,
      { freq: 'daily', interval: 1, until: '2026-08-25T09:00:00.000Z' },
      new Date('2026-08-26T00:00:00.000Z'),
    ),
    null,
  )
})
