import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { env } from '../env.js'
import { verifyGatewayAssertion } from '../auth.js'

test('gateway assertion binds identity, method, path and freshness', () => {
  const now = Date.now()
  const assertion = { appUserId: 'u-1', authUserId: 'auth-1', method: 'POST', path: '/api/messages', timestamp: now, nonce: '11111111-1111-4111-8111-111111111111' }
  const payload = Buffer.from(JSON.stringify(assertion)).toString('base64url')
  const signature = createHmac('sha256', env.GATEWAY_HMAC_SECRET).update(payload).digest('base64url')
  const header = `${payload}.${signature}`
  assert.deepEqual(verifyGatewayAssertion(header, 'POST', '/api/messages', now), assertion)
  assert.equal(verifyGatewayAssertion(header, 'GET', '/api/messages', now), null)
  assert.equal(verifyGatewayAssertion(header, 'POST', '/api/messages', now + 30_001), null)
})
