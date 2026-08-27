import assert from 'node:assert/strict'
import test from 'node:test'
import {
  armNativeOAuth,
  clearNativeOAuthForTest,
  consumeNativeOAuthCallback,
} from './nativeOAuthState'

test.afterEach(clearNativeOAuthForTest)

test('mobile OAuth callback requires and consumes the armed nonce', () => {
  const nonce = armNativeOAuth(1_000)
  const callback = `lingxiloop://auth?n=${nonce}#token=session-token&companyId=co-1`

  assert.deepEqual(consumeNativeOAuthCallback(callback, 2_000), {
    hash: '#token=session-token&companyId=co-1',
  })
  assert.equal(consumeNativeOAuthCallback(callback, 2_001), null, 'matched callback is single-use')
})

test('mobile OAuth callback rejects missing, mismatched, expired, and spoofed callbacks', () => {
  const nonce = armNativeOAuth(1_000)
  assert.equal(consumeNativeOAuthCallback('lingxiloop://auth#token=session-token', 2_000), null)
  assert.equal(consumeNativeOAuthCallback('lingxiloop://auth?n=wrong#token=session-token', 2_000), null)
  assert.equal(consumeNativeOAuthCallback('lingxiloop://auth.evil?n=' + nonce + '#token=session-token', 2_000), null)
  assert.equal(consumeNativeOAuthCallback(`lingxiloop://auth?n=${nonce}#token=session-token`, 601_001), null)
})

test('mismatched callback does not consume the legitimate pending attempt', () => {
  const nonce = armNativeOAuth(1_000)
  assert.equal(consumeNativeOAuthCallback('lingxiloop://auth?n=wrong#token=attacker-token', 2_000), null)
  assert.equal(consumeNativeOAuthCallback(`lingxiloop://auth?n=${nonce}`, 2_000), null)
  assert.deepEqual(
    consumeNativeOAuthCallback(`lingxiloop://auth?n=${nonce}#token=real-token`, 2_001),
    { hash: '#token=real-token' },
  )
})

test('arming a new mobile OAuth attempt supersedes the prior nonce', () => {
  const oldNonce = armNativeOAuth(1_000)
  const newNonce = armNativeOAuth(2_000)
  assert.notEqual(newNonce, oldNonce)
  assert.equal(consumeNativeOAuthCallback(`lingxiloop://auth?n=${oldNonce}#token=old-token`, 3_000), null)
  assert.deepEqual(
    consumeNativeOAuthCallback(`lingxiloop://auth?n=${newNonce}#token=new-token`, 3_000),
    { hash: '#token=new-token' },
  )
})
