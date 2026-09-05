import assert from 'node:assert/strict'
import test from 'node:test'
import type { Response } from 'express'
import { errorHandler } from './errors.js'

test('preserves status-bearing route errors', () => {
  let actual: { status: number; body: unknown } | undefined
  const response = {
    status(status: number) {
      return {
        json(body: unknown) { actual = { status, body } },
      }
    },
  } as unknown as Response

  errorHandler(Object.assign(new Error('authentication required'), { status: 401 }), {} as never, response, () => undefined)

  assert.deepEqual(actual, { status: 401, body: { error: 'authentication required' } })
})
