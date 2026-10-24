import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('a failed product verification stays hidden throughout retry until the new product response is accepted', async () => {
  const key = JSON.stringify(['auth-teacher', 'session-a'])
  let failure: { key: string; message: string } | null = { key, message: 'retry verification' }
  let session = { data: { user: { id: 'auth-teacher' }, session: { id: 'session-a' } }, isPending: false, isRefetching: false, error: null, refetch: async () => {} }
  let resolve!: (value: unknown) => void
  const pending = new Promise(resolveValue => { resolve = resolveValue })
  const effects: Array<() => unknown> = []
  // Inject hook state/effect scheduling at the component boundary, without a DOM.
  // The actual two-context browser fixture is separate; this does not emulate it.
  mock.module('react', { namedExports: { ...React,
    useState: () => [failure, (next: typeof failure) => { failure = next }],
    useEffect: (effect: () => unknown) => { effects.push(effect) },
  } })
  const auth = { authenticated: true, ready: true, sessionKey: key, authorizationEpoch: 1, sessionRevalidationRequired: false,
    acceptSession() {}, clear() {} }
  const useAuth = Object.assign((select: (state: typeof auth) => unknown) => select(auth), { getState: () => auth })
  mock.module('@/api/core/http', { namedExports: { ApiError: class extends Error { status = 401 } } })
  mock.module('@/auth/api', { namedExports: { authClient: { useSession: () => session }, authApi: { verifySession: () => pending } } })
  mock.module('@/stores/auth', { namedExports: { useAuth } })
  mock.module('./AuthScreen', { namedExports: { AuthScreen: () => React.createElement('p', null, 'signed-out') } })
  mock.module('./WorkspaceSkeleton', { namedExports: { WorkspaceSkeleton: () => React.createElement('p', null, 'checking-session') } })
  const { AuthGate } = await import('./AuthGate')
  const render = () => renderToStaticMarkup(<AuthGate><p>teacher-private-draft</p></AuthGate>)
  assert.doesNotMatch(render(), /teacher-private-draft/)
  session = { ...session, isRefetching: true }
  assert.doesNotMatch(render(), /teacher-private-draft/, 'official retry cannot reveal an unverified old subtree')
  session = { ...session, isRefetching: false }
  render()
  const cleanups = effects.map(effect => effect())
  assert.ok(failure, 'starting the product verification must not clear its prior failure')
  assert.doesNotMatch(render(), /teacher-private-draft/)
  resolve({}); await Promise.resolve(); await Promise.resolve()
  assert.equal(failure, null, 'only a successful current product response clears quarantine')
  for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup()
})
