import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { materialQueryKey, type MaterialContext } from './data'

test('upload queue retains the original course/space, retries failures, and clears file state on auth teardown', async () => {
  let principal = { user: { id: 'student' }, activeCompanyId: 'org', authorizationEpoch: 1 }
  const pending: Array<{ projectId: string; binding: { companyId: string; userId: string; space: string; isCurrentIdentity(): boolean }; progress(percent: number): void; resolve(): void; reject(error: Error): void }> = []
  const invalidations: unknown[] = []
  const teardown: Array<() => void> = []
  mock.module('../knowledge/api.ts', { namedExports: { knowledgeApi: {
    uploadProjectMaterial: (projectId: string, _file: File, binding: typeof pending[number]['binding'], progress: (percent: number) => void) =>
      new Promise<void>((resolve, reject) => pending.push({ projectId, binding, progress, resolve, reject })),
  } } })
  mock.module('../../stores/auth.ts', { namedExports: { useAuth: { getState: () => principal } } })
  mock.module('../../stores/authTeardown.ts', { namedExports: { registerAuthTeardown: (callback: () => void) => teardown.push(callback) } })
  mock.module('./queries.ts', { namedExports: { materialsQueryClient: { invalidateQueries: async (options: { queryKey: unknown }) => { invalidations.push(options.queryKey) } } } })
  try {
    const { useMaterialUploads } = await import('./uploads')
    const original: MaterialContext = { companyId: 'org', userId: 'student', projectId: 'course-one', space: 'private' }
    const other: MaterialContext = { ...original, projectId: 'course-two', space: 'public' }
    useMaterialUploads.getState().add([new File(['a'], 'personal.txt')], original)
    const firstId = useMaterialUploads.getState().items[0].id
    useMaterialUploads.getState().add([new File(['b'], 'other.txt')], other)
    assert.equal(pending[0].projectId, 'course-one')
    assert.equal(pending[0].binding.space, 'private')
    pending[0].progress(37)
    assert.equal(useMaterialUploads.getState().items.find(item => item.id === firstId)?.progress, 37)
    pending[0].reject(new Error('network interrupted'))
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(useMaterialUploads.getState().items[0].status, 'failed')
    assert.deepEqual(invalidations[0], materialQueryKey(original))
    useMaterialUploads.getState().retry(firstId)
    assert.equal(pending[2].projectId, 'course-one')
    assert.equal(pending[2].binding.space, 'private', 'retry stays inside its original private space')
    pending[2].resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(useMaterialUploads.getState().items[0].status, 'saved')
    assert.deepEqual(invalidations[1], materialQueryKey(original))
    principal = { user: { id: 'other-student' }, activeCompanyId: 'org', authorizationEpoch: 2 }
    assert.equal(pending[1].binding.isCurrentIdentity(), false)
    for (const clear of teardown) clear()
    assert.deepEqual(useMaterialUploads.getState().items, [])
    pending[1].resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(useMaterialUploads.getState().items, [], 'late completion must not restore old-account state')
    assert.equal(invalidations.length, 2, 'late old-account upload must not invalidate new account cache')
  } finally { mock.restoreAll() }
})
