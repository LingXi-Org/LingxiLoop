import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createHash } from 'node:crypto'

const flush = async () => { for (let i = 0; i < 80; i++) await Promise.resolve() }
const turn = () => new Promise<void>(resolve => setImmediate(resolve))

test('the real host releases stalled optional readers and cache ownership before preparation completes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
  const previous = Object.fromEntries(['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperties(globalThis, { window: { configurable: true, value: new EventTarget() }, document: { configurable: true, value: { visibilityState: 'hidden' } } })
  t.after(() => { for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) } })
  let pageId = 0, stalled = true
  const math = '/* exact fixture math */', digest = (text: string) => createHash('sha256').update(text).digest('hex')
  const hashes = Object.fromEntries(['capture.js', 'kit-tooltip.js', 'kit-carousel.js', 'kit-tabs.js', 'kit-icons.js', 'vendor/lucide-1.17.0.js', 'kit.css', 'gen-ui.js'].map(name => [name, digest('')]))
  hashes['math.js'] = digest(math)
  hashes['visualize.html'] = '42d9c7d924174a23545ad2ffc31ec0692ca589b3999c2ffdc21c1d358f4185bf'
  const reads: { route: string; signal: AbortSignal; finish(): void }[] = []
  mock.module('@/stores/auth', { namedExports: { getActiveCompanyId: () => 'company', useAuth: { getState: () => ({ user: { id: 'user' } }) } } })
  mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company', projectId: 'project' }) } })
  mock.module('@/api/core/http', { namedExports: { http: async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return { pageId: String(++pageId), initId: 'fixture', html: '<p>\\(x^2\\)</p>', state: null, stateRevision: 0, resourceHashes: hashes }
    if (url.endsWith('/state')) return { state: null, revision: 0 }
    return {}
  } } })
  mock.module('@/api/transport', { namedExports: { lingxiApiFetch: async (url: string, init: RequestInit) => {
    if (!url.includes(hashes['math.js']) && !url.endsWith('name=math.js')) return new Response('')
    const signal = init.signal as AbortSignal
    return new Promise<Response>((resolve, reject) => {
      const finish = () => resolve(new Response(math))
      reads.push({ route: url, signal, finish })
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      if (!stalled) finish()
    })
  } } })
  const { createWebServices, webPlatform } = await import('./host.js')
  const target = { workspaceIdentity: 'company', workspacePath: 'project', sessionId: 'room', instanceKey: 'fixture', path: '/fixture.html' }
  const input = { ...target, html: '', ownerWebContentsId: 0 }
  const progress: string[][] = []
  const first = createWebServices(target).service.prepareSandbox(input, undefined, value => { if (value.stage === 'resources') progress.push(value.pending) })
  await flush(); await turn()
  assert.equal(reads.length, 1)
  t.mock.timers.tick(5000); await flush()
  t.mock.timers.tick(250); await flush()
  assert.equal(reads.length, 2, 'one public read and one authorized recovery')
  assert.equal(reads.filter(read => !read.signal.aborted).length, 2)
  t.mock.timers.tick(2750); await flush(); await turn()
  const ready = await first
  assert.equal(reads.filter(read => !read.signal.aborted).length, 0, 'ready cannot leave either network reader alive')
  assert.deepEqual(progress.at(-1), [])
  await webPlatform.disposeSandbox(ready.sandboxId, ready.initId)

  // The timed-out owner must be removed from the shared pending registry.
  // A new page immediately starts its own request, without the five-second wait.
  stalled = false
  const retry = createWebServices(target).service.prepareSandbox(input)
  await flush(); await turn()
  assert.equal(reads.length, 3)
  const recovered = await retry
  assert.equal(reads.filter(read => !read.signal.aborted).length, 0)
  await webPlatform.disposeSandbox(recovered.sandboxId, recovered.initId)

  // A cancelled follower only stops its wait; it cannot cancel another page's
  // in-flight owner. A fresh hash avoids the completed cache from above.
  hashes['math.js'] = digest(math + '2'); stalled = true
  const owner = createWebServices(target).service.prepareSandbox(input)
  await flush(); await turn()
  const ownerRead = reads.at(-1)!
  const cancel = new AbortController()
  const follower = createWebServices(target).service.prepareSandbox(input, cancel.signal)
  const rejected = assert.rejects(follower, /closed/)
  await flush(); cancel.abort(new Error('closed')); await rejected
  assert.equal(reads.at(-1), ownerRead, 'follower shares without another fetch')
  assert.equal(ownerRead.signal.aborted, false, 'another page retains its owner')
  t.mock.timers.tick(5000); await flush(); t.mock.timers.tick(250); await flush()
  t.mock.timers.tick(2750); await flush(); await turn()
  const last = await owner
  assert.equal(reads.filter(read => !read.signal.aborted).length, 0)
  await webPlatform.disposeSandbox(last.sandboxId, last.initId)
})
