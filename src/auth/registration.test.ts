import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
mock.module('@/api/core/http', { namedExports: { ApiError: class ApiError extends Error { constructor(message: string, public status: number, public code?: string, public requestId?: string) { super(message) } } } })
const { publicRegistrationError, readPendingVerification, registrationResponse, verificationContext, verificationError } = await import('./registration')

test('registration errors retain safe status/correlation without exposing raw response bodies', async () => {
  for (const [body, status, code] of [
    ['<html>private SQL token</html>', 503, undefined], ['', 502, undefined], ['private SQL', 403, undefined],
    [JSON.stringify({ code: 'INVITATION_REJECTED', error: 'private SQL' }), 410, 'INVITATION_REJECTED'],
    [JSON.stringify({ code: 'RATE_LIMITED' }), 429, 'RATE_LIMITED'],
  ] as const) {
    await assert.rejects(() => registrationResponse(new Response(body, { status, headers: { 'x-request-id': 'safe-request' } })), (error: unknown) => {
      const e = error as Error & { status: number; code?: string; requestId?: string }
      assert.equal(e.status, status); assert.equal(e.code, code); assert.equal(e.requestId, 'safe-request')
      assert.doesNotMatch(e.message, /html|SQL|token/)
      return true
    })
  }
  await assert.rejects(() => registrationResponse(new Response('', { status: 503 })), error => {
    assert.equal((error as { requestId?: string }).requestId, undefined); return true
  })
  await assert.rejects(() => registrationResponse(new Response('<html>private SQL</html>', { status: 200 })), /服务暂时不可用/)
  const { ApiError } = await import('@/api/core/http')
  assert.doesNotMatch(publicRegistrationError(new ApiError('<html>private SQL</html>', 503, undefined, 'safe-request')).message, /html|SQL/)
  assert.equal(publicRegistrationError(new ApiError('private SQL', 409, 'REGISTRATION_INCOMPLETE')).code, 'REGISTRATION_INCOMPLETE')
  assert.doesNotMatch(verificationError({ code: 'INVALID_OTP', requestId: '<html>private SQL' }).message, /html|SQL/)
  assert.match(verificationError({ code: 'OTP_EXPIRED' }).message, /重新发送/)
  assert.match(verificationError({ code: 'INVALID_OTP' }).message, /不正确/)
  assert.match(verificationError({ status: 429 }).message, /稍后/)
})
test('pending verification expires, isolates invitation contexts, and contains only navigation hints', async () => {
  const context = await verificationContext('synthetic-invitation', 'project')
  assert.doesNotMatch(context, /synthetic-invitation/)
  const value = { email: 'synthetic@example.com', context, expiresAt: 2000 }
  let current: string | null = JSON.stringify(value)
  const storage = { getItem: () => current, removeItem: () => { current = null } }
  assert.deepEqual(readPendingVerification(context, storage, 1000), value)
  assert.equal(readPendingVerification('another-invitation', storage, 1000), null)
  assert.equal(current, null)
  current = JSON.stringify(value)
  assert.equal(readPendingVerification(context, storage, 2001), null)
  assert.equal(readPendingVerification(context, { getItem: () => { throw new Error('denied') }, removeItem: () => {} }), null)
})
