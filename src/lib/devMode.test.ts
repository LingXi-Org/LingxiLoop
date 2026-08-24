import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldUseMockIm } from './devMode'

test('local IM mock mode is enabled for dev loopback hosts', () => {
  for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(shouldUseMockIm(true, hostname), true)
  }
})

test('local IM mock mode does not alter production or remote development hosts', () => {
  assert.equal(shouldUseMockIm(false, 'localhost'), false)
  assert.equal(shouldUseMockIm(true, 'app.example.com'), false)
})

test('local IM mock mode allows explicitly opting back into the real API', () => {
  assert.equal(shouldUseMockIm(true, 'localhost', '?api=1'), false)
})
