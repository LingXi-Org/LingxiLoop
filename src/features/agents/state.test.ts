import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import type { ApiParticipant } from './contracts'
import { runAuthTeardown } from '@/stores/authTeardown'

test('roster avatar updates reject stale refreshes and clear on workspace reset', async () => {
  const agent: ApiParticipant = { id: 'nova', kind: 'agent', name: '司南', role: '', initial: '司', avatarBg: 'transparent', status: 'avail', bio: null, tools: [], capabilities: [] }
  let fetchRows: () => Promise<ApiParticipant[]> = async () => [{ ...agent, personalAvatar: { seed: 'saved' } }]
  mock.module('./api', { namedExports: { agentsApi: { getParticipants: () => fetchRows() } } })
  mock.module('@/api/core/realtime', { namedExports: { ws: {} } })
  mock.module('@/lib/avatarCache', { namedExports: { clearAvatarCache: () => {} } })
  try {
    const { useParticipants } = await import('./state')
    await useParticipants.getState().load()
    assert.deepEqual(useParticipants.getState().byId.nova.personalAvatar, { seed: 'saved' })
    let resolve!: (rows: ApiParticipant[]) => void
    fetchRows = () => new Promise(done => { resolve = done })
    const staleRefresh = useParticipants.getState().refresh()
    useParticipants.getState().setAvatar('nova', { seed: 'new' })
    resolve([agent]); await staleRefresh
    assert.deepEqual(useParticipants.getState().byId.nova.personalAvatar, { seed: 'new' })
    const oldWorkspace = useParticipants.getState().refresh()
    useParticipants.getState().reset()
    resolve([{ ...agent, personalAvatar: { seed: 'old-workspace' } }]); await oldWorkspace
    assert.deepEqual(useParticipants.getState().byId, {})
    fetchRows = async () => { throw new Error('offline') }
    await useParticipants.getState().load()
    assert.equal(useParticipants.getState().loaded, true)
    assert.ok(useParticipants.getState().error)
    fetchRows = async () => [agent]
    await useParticipants.getState().load()
    assert.equal(useParticipants.getState().error, null)
    assert.equal(useParticipants.getState().byId.nova.personalAvatar, null)
    runAuthTeardown()
    assert.deepEqual(useParticipants.getState().byId, {})
  } finally { mock.restoreAll() }
})
