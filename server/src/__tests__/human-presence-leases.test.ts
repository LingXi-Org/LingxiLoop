import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HUMAN_PRESENCE_LEASE_MS,
  HumanPresenceLeaseCoordinator,
  type HumanPresenceClaim,
  type HumanPresenceLeaseStore,
  type HumanPresenceStatus,
} from '../modules/agents/human-presence-leases.js'

interface UserState {
  leases: Map<string, number>
  desired: HumanPresenceStatus
  applied: HumanPresenceStatus
  generation: number
  claim: HumanPresenceClaim | null
}

class FakeLeaseStore implements HumanPresenceLeaseStore {
  now = 0
  private sequence = 0
  private readonly users = new Map<string, UserState>()

  upsert(userId: string, connectionId: string): Promise<HumanPresenceClaim | null> {
    return Promise.resolve(this.mutate(userId, (state) => {
      state.leases.set(connectionId, this.now + HUMAN_PRESENCE_LEASE_MS)
    }))
  }

  remove(userId: string, connectionId: string): Promise<HumanPresenceClaim | null> {
    return Promise.resolve(this.mutate(userId, (state) => { state.leases.delete(connectionId) }))
  }

  sweepUser(userId: string): Promise<HumanPresenceClaim | null> {
    return Promise.resolve(this.mutate(userId))
  }

  scanTracked(): Promise<{ cursor: string; userIds: string[] }> {
    return Promise.resolve({ cursor: '0', userIds: [...this.users.keys()] })
  }

  acknowledge(claim: HumanPresenceClaim): Promise<HumanPresenceClaim | null> {
    const state = this.users.get(claim.userId)
    if (!state || state.claim?.token !== claim.token) return Promise.resolve(null)
    state.applied = claim.status
    state.claim = null
    return Promise.resolve(this.settle(claim.userId, state))
  }

  release(claim: HumanPresenceClaim): Promise<void> {
    const state = this.users.get(claim.userId)
    if (state?.claim?.token === claim.token) state.claim = null
    if (state) this.clean(claim.userId, state)
    return Promise.resolve()
  }

  private mutate(userId: string, change?: (state: UserState) => void): HumanPresenceClaim | null {
    const state = this.users.get(userId) ?? {
      leases: new Map(), desired: 'resting', applied: 'resting', generation: 0, claim: null,
    } satisfies UserState
    this.users.set(userId, state)
    for (const [connectionId, expiresAt] of state.leases) {
      if (expiresAt <= this.now) state.leases.delete(connectionId)
    }
    change?.(state)
    return this.settle(userId, state)
  }

  private settle(userId: string, state: UserState): HumanPresenceClaim | null {
    const desired = state.leases.size > 0 ? 'avail' : 'resting'
    if (desired !== state.desired) state.generation += 1
    state.desired = desired
    if (!state.claim && state.applied !== desired) {
      state.claim = { userId, status: desired, generation: state.generation, token: `claim-${++this.sequence}` }
      return state.claim
    }
    this.clean(userId, state)
    return null
  }

  private clean(userId: string, state: UserState): void {
    if (state.leases.size === 0 && state.applied === state.desired && !state.claim) this.users.delete(userId)
  }
}

test('two replicas coalesce connections and expire only the final global lease', async () => {
  const store = new FakeLeaseStore()
  const transitions: HumanPresenceStatus[] = []
  const apply = async (_userId: string, status: HumanPresenceStatus) => { transitions.push(status) }
  const first = new HumanPresenceLeaseCoordinator(store, apply)
  const second = new HumanPresenceLeaseCoordinator(store, apply)

  await Promise.all([first.connect('user-1', 'instance-a:tab-1'), second.connect('user-1', 'instance-b:tab-2')])
  assert.deepEqual(transitions, ['avail'])

  await first.disconnect('user-1', 'instance-a:tab-1')
  assert.deepEqual(transitions, ['avail'])
  await second.disconnect('user-1', 'instance-b:tab-2')
  assert.deepEqual(transitions, ['avail', 'resting'])

  await first.connect('user-1', 'instance-a:tab-3')
  store.now += HUMAN_PRESENCE_LEASE_MS - 1
  await first.renew('user-1', 'instance-a:tab-3')
  store.now += 2
  await second.sweep()
  assert.deepEqual(transitions, ['avail', 'resting', 'avail'])
  store.now += HUMAN_PRESENCE_LEASE_MS + 1
  await second.sweep()
  assert.deepEqual(transitions, ['avail', 'resting', 'avail', 'resting'])
})

test('a failed persisted transition is released for another replica to retry', async () => {
  const store = new FakeLeaseStore()
  let attempts = 0
  const transitions: HumanPresenceStatus[] = []
  const apply = async (_userId: string, status: HumanPresenceStatus) => {
    attempts += 1
    if (attempts === 1) throw new Error('publish unavailable')
    transitions.push(status)
  }
  const first = new HumanPresenceLeaseCoordinator(store, apply)
  const second = new HumanPresenceLeaseCoordinator(store, apply)

  await assert.rejects(first.connect('user-2', 'instance-a:tab-1'), /publish unavailable/)
  await second.sweep()

  assert.equal(attempts, 2)
  assert.deepEqual(transitions, ['avail'])
})
