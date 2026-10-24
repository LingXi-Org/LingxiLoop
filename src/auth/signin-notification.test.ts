import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { mock, test } from 'node:test'

test('successful sign-in wakes an always-visible peer through the official credential-free session channel', async () => {
  const previous = ['window', 'document', 'navigator', 'localStorage', 'location', 'fetch'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  const receiver = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const notifications: Record<string, unknown>[] = []
  let principal = 'teacher', sessionReads = 0, failSignIn = false
  const globals = {
    window: receiver, document: doc, navigator: { onLine: true }, location: { origin: 'https://synthetic.invalid' },
    localStorage: { setItem: (key: string, value: string) => {
      notifications.push(JSON.parse(value))
      // Model only delivery to the other tab; no focus/visibility event is sent.
      receiver.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: value }))
    } },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname
      if (path === '/api/auth/sign-in/email') {
        if (failSignIn) return Response.json({ message: 'invalid credentials' }, { status: 401 })
        principal = JSON.parse(String(init?.body)).email.split('@')[0]
        return Response.json({ user: { id: principal }, redirect: false })
      }
      assert.equal(path, '/api/auth/get-session')
      sessionReads++
      return Response.json({ session: { id: `session-${principal}`, userId: principal, expiresAt: '2030-01-01T00:00:00Z' }, user: { id: principal, name: principal, email: `${principal}@example.invalid` } })
    },
  }
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })
  mock.module('@/api/core/http', { namedExports: { API: '/api', http: () => { throw new Error('This probe does not use the product API') } } })
  let unsubscribe: (() => void) | undefined
  try {
    const { createAuthClient } = await import('better-auth/react')
    const peer = createAuthClient({ baseURL: 'https://synthetic.invalid', basePath: '/api/auth' })
    const observed: string[] = []
    unsubscribe = peer.$store.atoms.session.subscribe(value => { if (value.data) observed.push(value.data.user.id) })
    const until = async (id: string) => { for (let i = 0; i < 50 && observed.at(-1) !== id; i++) await delay(10); assert.equal(observed.at(-1), id) }
    await until('teacher')
    const { authApi } = await import('./api')
    await authApi.signIn('student@example.invalid', 'synthetic-password', 'synthetic-captcha')
    await until('student')
    assert.equal(sessionReads, 2, 'the visible peer fetched its own trusted session after login')
    assert.equal(notifications.length, 1)
    assert.deepEqual(Object.keys(notifications[0]).sort(), ['clientId', 'data', 'event', 'timestamp'])
    assert.deepEqual(notifications[0].data, { trigger: 'getSession' })
    assert.equal(notifications[0].event, 'session')
    assert.doesNotMatch(JSON.stringify(notifications), /student|teacher|password|captcha|token|example.invalid/)
    failSignIn = true
    const failure = await authApi.signIn('other@example.invalid', 'wrong', 'synthetic-captcha')
    assert.ok(failure.error)
    assert.equal(notifications.length, 1, 'failed login does not announce a session change')
    failSignIn = false
    await authApi.signIn('teacher@example.invalid', 'synthetic-password', 'synthetic-captcha')
    await until('teacher')
    assert.equal(sessionReads, 3)
    assert.notEqual(notifications[0].clientId, notifications[1].clientId, 'same-second updates have distinct delivery identities')
  } finally {
    unsubscribe?.(); await delay(1100)
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
