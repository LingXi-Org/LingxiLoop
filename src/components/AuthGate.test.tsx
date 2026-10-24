import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

test('session observations gate old authorized content before effects can reconcile application state', async () => {
  const key = JSON.stringify(['auth-teacher', 'session-a'])
  let session: { data: { user: { id: string }; session: { id: string } } | null; isPending: boolean; isRefetching: boolean; error: Error | null; refetch(): Promise<void> } = {
    data: { user: { id: 'auth-teacher' }, session: { id: 'session-a' } }, isPending: false, isRefetching: false, error: null, refetch: async () => {},
  }
  const auth = { authenticated: true, ready: true, sessionKey: key, setAuthenticated() {}, setMe() {}, setServerCapabilities() {}, clear() {} }
  mock.module('@/auth/api', { namedExports: { authClient: { useSession: () => session }, authApi: { me: async () => { throw new Error('SSR must not read sessions') } } } })
  mock.module('@/stores/auth', { namedExports: { useAuth: (select: (state: typeof auth) => unknown) => select(auth) } })
  mock.module('./AuthScreen', { namedExports: { AuthScreen: () => createElement('p', null, 'signed-out') } })
  mock.module('./WorkspaceSkeleton', { namedExports: { WorkspaceSkeleton: () => createElement('p', null, 'checking-session') } })
  const { AuthGate } = await import('./AuthGate')
  const render = () => renderToStaticMarkup(createElement(AuthGate, { children: createElement('p', null, 'teacher-private-draft') }))
  assert.match(render(), /teacher-private-draft/, 'accepted identity is visible')
  session = { ...session, data: null }
  assert.doesNotMatch(render(), /teacher-private-draft/, 'a signed-out observation hides the old subtree immediately')
  assert.match(render(), /signed-out/)
  session = { ...session, data: { user: { id: 'auth-student' }, session: { id: 'session-b' } } }
  assert.doesNotMatch(render(), /teacher-private-draft/, 'same-company new user waits for their product session')
  assert.match(render(), /checking-session/)
  session = { ...session, data: { user: { id: 'auth-teacher' }, session: { id: 'session-a' } }, isPending: true }
  assert.doesNotMatch(render(), /teacher-private-draft/, 'unknown initial identity is not authorized')
  session = { ...session, isPending: false, error: new Error('offline') }
  assert.doesNotMatch(render(), /teacher-private-draft/, 'failed verification does not preserve a visible old subtree')
})
