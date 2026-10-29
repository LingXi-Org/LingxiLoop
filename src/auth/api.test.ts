import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

test('invitation login falls back only to an authorized existing workspace', async () => {
  const signedIn = { data: { user: { id: 'user' } }, error: null }
  let result: { data: unknown; error: { message: string } | null } = signedIn
  const signIn = mock.fn(async () => result)
  mock.module('better-auth/react', { namedExports: { createAuthClient: () => ({ signIn: { email: signIn } }) } })
  mock.module('@/api/core/http', { namedExports: { API: '/api', http: () => {}, ApiError: class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message) } } } })
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://example.com' } })
  try {
    const { authApi } = await import('./api')
    const { RegistrationApiError } = await import('./registration')
    const me = { user: {} as never, activeCompanyId: 'company', companies: [{ id: 'company' } as never], serverCapabilities: { invitationEmail: true } }
    const session = mock.method(authApi, 'me', async () => me)
    const accept = mock.method(authApi, 'acceptInvitation', async () => {})
    const login = () => authApi.signIn('user@example.com', 'password', 'captcha', { token: 'invite', kind: 'project' })

    assert.equal(await login(), signedIn)
    assert.deepEqual(accept.mock.calls[0].arguments, ['invite', 'project'])
    assert.equal(session.mock.callCount(), 0)
    assert.deepEqual(signIn.mock.calls[0].arguments, [{ email: 'user@example.com', password: 'password', fetchOptions: { headers: { 'x-captcha-response': 'captcha' } } }])

    for (let attempt = 0; attempt < 4; attempt++) {
      accept.mock.mockImplementation(async () => { throw new RegistrationApiError(410, 'INVITATION_REJECTED') })
      assert.equal(await login(), signedIn)
    }
    session.mock.mockImplementation(async () => { throw new Error('active company membership required') })
    await assert.rejects(login, /active company membership required/)
    session.mock.mockImplementation(async () => ({ ...me, companies: [] }))
    await assert.rejects(login, /邀请无效/)
    session.mock.mockImplementation(async () => me)
    const checked = session.mock.callCount()
    accept.mock.mockImplementation(async () => { throw new Error('network unavailable') })
    await assert.rejects(login, /network unavailable/)
    assert.equal(session.mock.callCount(), checked)

    const accepted = accept.mock.callCount()
    assert.equal(await authApi.signIn('user@example.com', 'password', 'captcha'), signedIn)
    result = { data: null, error: { message: 'invalid password' } }
    assert.equal(await login(), result)
    assert.equal(accept.mock.callCount(), accepted)
  } finally {
    mock.restoreAll()
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation)
    else Reflect.deleteProperty(globalThis, 'location')
  }
})
