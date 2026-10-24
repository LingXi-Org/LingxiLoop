import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { AuthMeResponse } from '@/auth/contracts'

// All identities and storage here are synthetic. No API or socket is opened.
test('accepted session atomically changes principal and invalidates same-user authorization, not ordinary refresh', async () => {
  const storage = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } })
  mock.module('@/api/core/realtime', { namedExports: { ws: { reconnect() {}, close() {} } } })
  mock.module('@/lib/avatarCache', { namedExports: { clearAvatarCache() {} } })
  mock.module('@/features/documents/state', { namedExports: { useDocuments: { getState: () => ({ reset() {} }) } } })
  const { useAuth } = await import('./auth')
  const { registerAuthTeardown } = await import('./authTeardown')
  let teardowns = 0
  const unregister = registerAuthTeardown(() => { teardowns++ })
  const teacher: AuthMeResponse = { user: { id: 'synthetic-teacher', name: 'Teacher', email: 'teacher@example.invalid', emailVerified: true, providers: [] }, companies: [{ id: 'same-company', name: 'Class', slug: 'class', role: 'teacher', isAdmin: true, status: 'ACTIVE' }], activeCompanyId: 'same-company', serverCapabilities: { invitationEmail: false } }
  try {
    useAuth.getState().acceptSession(teacher, 'session-a')
    const first = useAuth.getState().authorizationEpoch
    const before = teardowns
    const snapshots: Array<{ user: string | undefined; role: string | undefined }> = []
    const unsubscribe = useAuth.subscribe(value => snapshots.push({ user: value.user?.id, role: value.companies[0]?.role }))
    useAuth.getState().acceptSession(structuredClone(teacher), 'session-a')
    assert.equal(useAuth.getState().authorizationEpoch, first)
    assert.equal(teardowns, before, 'unchanged focus refresh preserves drafts')
    const demoted = { ...teacher, companies: [{ ...teacher.companies[0], role: 'student' as const, isAdmin: false }] }
    useAuth.getState().acceptSession(demoted, 'session-a')
    assert.equal(useAuth.getState().authorizationEpoch, first + 1)
    assert.equal(teardowns, before + 1)
    const student = { ...demoted, user: { ...teacher.user, id: 'synthetic-student' } }
    useAuth.getState().acceptSession(student, 'session-b')
    assert.deepEqual(snapshots.at(-1), { user: 'synthetic-student', role: 'student' })
    assert.equal(useAuth.getState().sessionKey, 'session-b')
    assert.equal(useAuth.getState().authorizationEpoch, first + 2)
    unsubscribe()
    useAuth.getState().clear()
    assert.equal(useAuth.getState().sessionKey, null)
    assert.equal(useAuth.getState().serverCapabilities, null)
  } finally { unregister() }
})
