import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AuthMeResponse } from './contracts'
import { synchronizeProductSession } from './session-sync'

const me = (id: string): AuthMeResponse => ({ user: { id, name: id, email: `${id}@example.invalid`, emailVerified: true, providers: [] }, companies: [{ id: 'company', name: 'Synthetic', slug: 'synthetic', role: 'student', isAdmin: false, status: 'ACTIVE' }], activeCompanyId: 'company', serverCapabilities: { invitationEmail: false } })
const deferred = () => { let resolve!: (value: AuthMeResponse) => void; let reject!: (reason: Error) => void; const promise = new Promise<AuthMeResponse>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

test('two observed tabs switch teacher → student → teacher without accepting old session responses', async () => {
  const requests: ReturnType<typeof deferred>[] = [], signals: AbortSignal[] = [], accepted: string[] = [], cleared: string[] = [], errors: Error[] = []
  let currentKey: string | null = 'teacher-session-1'
  const sync = (key: string | null) => synchronizeProductSession(key, {
    currentKey: () => currentKey,
    read: signal => { signals.push(signal); const request = deferred(); requests.push(request); return request.promise },
    clear: () => { cleared.push(currentKey ?? 'none'); currentKey = null },
    accept: (value, nextKey) => { currentKey = nextKey; accepted.push(`${nextKey}:${value.user.id}`) },
    failed: error => errors.push(error),
  })
  const cancelTeacher = sync('teacher-session-1')
  cancelTeacher()
  const cancelStudent = sync('student-session')
  assert.equal(currentKey, null, 'known changed identity clears old authorized state before fetching')
  cancelStudent()
  const cancelNextTeacher = sync('teacher-session-2')
  requests[1].resolve(me('student')); requests[0].resolve(me('teacher'))
  await flush()
  assert.deepEqual(accepted, [], 'canceled transports cannot commit, even if they ignore AbortSignal')
  requests[2].resolve(me('teacher')); await flush()
  assert.deepEqual(accepted, ['teacher-session-2:teacher'])
  assert.deepEqual(signals.map(signal => signal.aborted), [true, true, false])
  cancelNextTeacher(); sync(null)
  assert.equal(currentKey, null)
  assert.deepEqual(errors, [])
  assert.ok(cleared.length >= 2)
})

test('same-session product permissions are refreshed; ordinary failures do not clear identity', async () => {
  const requests: ReturnType<typeof deferred>[] = [], accepted: AuthMeResponse[] = [], errors: Error[] = []
  let clears = 0
  const sync = () => synchronizeProductSession('same-session', {
    currentKey: () => 'same-session', read: () => { const request = deferred(); requests.push(request); return request.promise },
    clear: () => { clears++ }, accept: value => accepted.push(value), failed: error => errors.push(error),
  })
  sync(); requests[0].resolve(me('same-user')); await flush()
  assert.equal(accepted[0].companies[0].role, 'student')
  sync(); requests[1].reject(new Error('ordinary permission denial (403)')); await flush()
  assert.equal(clears, 0)
  assert.equal(errors.length, 1)
})

test('unmount and superseded errors cannot mutate the current session', async () => {
  const request = deferred(); let writes = 0
  const cancel = synchronizeProductSession('existing', {
    currentKey: () => 'existing', read: () => request.promise,
    clear: () => { writes++ }, accept: () => { writes++ }, failed: () => { writes++ },
  })
  cancel(); request.reject(new Error('old network error')); await flush()
  assert.equal(writes, 0)
})
