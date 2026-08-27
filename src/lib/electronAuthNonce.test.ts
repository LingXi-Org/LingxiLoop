import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createAuthNonceGuard } = require('../../electron/authNonce.cjs') as {
  createAuthNonceGuard: (options: {
    randomBytes: () => Buffer
    timingSafeEqual: (left: Buffer, right: Buffer) => boolean
    now: () => number
    ttlMs: number
  }) => { arm: () => string; consume: (nonce: unknown) => boolean }
}

test('invalid Electron callbacks preserve the active nonce until a valid match', () => {
  const guard = createAuthNonceGuard({
    randomBytes: () => Buffer.from('00112233445566778899aabbccddeeff', 'hex'),
    timingSafeEqual: (left, right) => left.equals(right),
    now: () => 1_000,
    ttlMs: 10_000,
  })
  const nonce = guard.arm()
  assert.equal(guard.consume(null), false)
  assert.equal(guard.consume('short'), false)
  assert.equal(guard.consume('ffffffffffffffffffffffffffffffff'), false)
  assert.equal(guard.consume(nonce), true)
  assert.equal(guard.consume(nonce), false, 'a successful match remains single-use')
})

test('expired Electron nonce is cleared', () => {
  let now = 1_000
  const guard = createAuthNonceGuard({
    randomBytes: () => Buffer.alloc(16, 1),
    timingSafeEqual: (left, right) => left.equals(right),
    now: () => now,
    ttlMs: 100,
  })
  const nonce = guard.arm()
  now = 1_101
  assert.equal(guard.consume(nonce), false)
  assert.equal(guard.consume(nonce), false)
})
