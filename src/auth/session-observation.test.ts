import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'

test('the installed Better Auth session subscription observes shared-cookie identity changes without polling', async () => {
  const names = ['window', 'document', 'navigator', 'localStorage', 'fetch'] as const
  const previous = names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  const win = new EventTarget(), doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const storage = new Map<string, string>()
  let principal = 'synthetic-teacher', requests = 0
  const session = () => ({ session: { id: `session-${principal}`, userId: principal, expiresAt: '2030-01-01T00:00:00Z' }, user: { id: principal, email: `${principal}@example.invalid`, name: principal } })
  const globals = { window: win, document: doc, navigator: { onLine: true },
    localStorage: { setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key) ?? null },
    fetch: async () => { requests++; return Response.json(session()) },
  }
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })
  const broadcast = () => win.dispatchEvent(Object.assign(new Event('storage'), { key: 'better-auth.message', newValue: JSON.stringify({ event: 'session', data: { trigger: 'signout' } }) }))
  let unsubscribe: (() => void) | undefined
  try {
    const { createAuthClient } = await import('better-auth/react')
    const client = createAuthClient({ baseURL: 'https://synthetic.invalid', basePath: '/api/auth' })
    broadcast(); doc.dispatchEvent(new Event('visibilitychange')); await delay(25)
    assert.equal(requests, 0, 'constructing a client alone does not mount its session refresh lifecycle')
    const observed: string[] = []
    // useSession subscribes to this same official atom via useSyncExternalStore.
    unsubscribe = client.$store.atoms.session.subscribe(value => { if (value.data) observed.push(value.data.user.id) })
    const until = async (identity: string) => { for (let i = 0; i < 50 && observed.at(-1) !== identity; i++) await delay(10); assert.equal(observed.at(-1), identity) }
    await until(principal)
    principal = 'synthetic-student'; broadcast(); await until(principal)
    principal = 'synthetic-teacher-returned'; broadcast(); await until(principal)
    assert.equal(requests, 3, 'one request per observation, no polling loop')
  } finally {
    unsubscribe?.()
    // Nanostores delays the final onMount cleanup; leave its synthetic DOM alive.
    await delay(1100)
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
