import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'

type Route = (path: string, init?: RequestInit) => Promise<unknown>
let route: Route = async () => { throw new Error('Unexpected fixture request') }
let userId = 'student'
const companyId = 'school'
const calls: { kind: string; at: number }[] = []
let resourceDelay = 0
mock.module('@/api/core/http', { namedExports: { http: (path: string, init?: RequestInit) => route(path, init) } })
mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId, projectId: 'course' }) } })
mock.module('@/stores/auth', { namedExports: { getActiveCompanyId: () => companyId, useAuth: { getState: () => ({ user: { id: userId } }) } } })
mock.module('@/api/transport', { namedExports: { lingxiApiFetch: async (_path: string, init: RequestInit) => {
  calls.push({ kind: 'resource-start', at: performance.now() })
  await delay(resourceDelay, undefined, { signal: init.signal! })
  calls.push({ kind: 'resource-end', at: performance.now() })
  return new Response('fixed public runtime')
} } })
mock.module('./document', { namedExports: { buildWebShell: (html: string) => html,
  buildWebDocument: async (fragment: string, _state: unknown, resource: (name: string) => Promise<string>) => `${fragment}\n${await resource('gen-ui.js')}` } })
Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {} } })
Object.defineProperty(globalThis, 'document', { configurable: true, value: { visibilityState: 'visible' } })
Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined })
const realInterval = globalThis.setInterval
mock.method(globalThis, 'setInterval', (...args: Parameters<typeof setInterval>) => {
  const timer = realInterval(...args); timer.unref(); return timer
})

const { createWebServices, webPlatform } = await import('./host')
const target = { workspaceIdentity: 'school', workspacePath: 'course', sessionId: 'room', path: '/topology.html', instanceKey: 'card', sourceMessageId: 'source' }
let sequence = 0

test('prepare resources and the first authorized fresh state read in parallel before returning the page', async () => {
  const samples = []
  for (let sample = 0; sample < 3; sample++) {
    calls.length = 0; resourceDelay = 120
    route = async (path, init) => {
      if (init?.method === 'POST') return { pageId: `page-${++sequence}`, initId: 'fixture-capability', html: '<svg/>', state: null, stateRevision: 0 }
      if (init?.method === 'DELETE') return {}
      assert.ok(path.endsWith('/state'))
      assert.equal(new Headers(init?.headers).get('x-visualize-page-token'), 'fixture-capability')
      assert.equal(new Headers(init?.headers).get('x-company-id'), companyId)
      assert.equal(new Headers(init?.headers).get('x-project-id'), 'course')
      calls.push({ kind: 'state-start', at: performance.now() })
      await delay(120, undefined, { signal: init?.signal ?? undefined })
      calls.push({ kind: 'state-end', at: performance.now() })
      return { state: { modelContent: { addresses: 32 } }, revision: 1 }
    }
    const web = createWebServices(target)
    const start = performance.now()
    const handle = await web.service.prepareSandbox({ ...target, html: '', ownerWebContentsId: 0 }, new AbortController().signal)
    const state = await web.service.getState(target)
    assert.deepEqual(state, { modelContent: { addresses: 32 }, privateContent: null })
    const overlap = calls.find(call => call.kind === 'state-start')!.at < calls.find(call => call.kind === 'resource-end')!.at
    samples.push({ sample, elapsedMs: performance.now() - start, overlap, calls: calls.map(call => ({ ...call, at: call.at - start })) })
    await webPlatform.disposeSandbox(handle.sandboxId, handle.initId)
  }
  console.log('AUTHORIZED_PREPARATION_SAMPLES', JSON.stringify(samples))
  assert.ok(samples.every(sample => sample.overlap), 'the independent fresh state GET must not wait for resource preparation')
})

test('initial state keeps newer peer revisions and later reads still fetch fresh state', async () => {
  calls.length = 0; resourceDelay = 5
  let creates = 0, reads = 0
  route = async (path, init) => {
    if (init?.method === 'POST') return { pageId: `revision-${++creates}`, initId: `revision-token-${creates}`, html: '<svg/>', state: null, stateRevision: 0 }
    if (init?.method === 'DELETE') return {}
    assert.ok(path.endsWith('/state'))
    reads++
    const revision = reads === 1 ? 2 : reads === 2 ? 1 : 3
    return { state: { modelContent: { value: revision } }, revision }
  }
  const handles = []
  try {
    const first = createWebServices(target)
    handles.push(await first.service.prepareSandbox({ ...target, html: '', ownerWebContentsId: 0 }))
    const second = createWebServices(target)
    handles.push(await second.service.prepareSandbox({ ...target, html: '', ownerWebContentsId: 0 }))
    assert.deepEqual(await second.service.getState(target), { modelContent: { value: 2 }, privateContent: null },
      'the older parallel response cannot overwrite the newer same-scope revision')
    assert.equal(reads, 2, 'initialization consumes the fresh GET it already awaited')
    assert.deepEqual(await second.service.getState(target), { modelContent: { value: 3 }, privateContent: null })
    assert.equal(reads, 3, 'later getState calls retain their fresh GET')
  } finally { for (const handle of handles) await webPlatform.disposeSandbox(handle.sandboxId, handle.initId) }
})

test('a failed first state read aborts pending resource work and revokes the new page', async () => {
  calls.length = 0; resourceDelay = 1000
  let revoked = false
  route = async (path, init) => {
    if (init?.method === 'POST') return { pageId: 'state-failure', initId: 'state-failure-token', html: '<svg/>', state: null, stateRevision: 0 }
    if (init?.method === 'DELETE') { revoked = true; return {} }
    assert.ok(path.endsWith('/state'))
    throw new Error('fixture state denied (403)')
  }
  const web = createWebServices(target)
  let created: Awaited<ReturnType<typeof web.service.prepareSandbox>> | undefined
  try {
    await assert.rejects(web.service.prepareSandbox({ ...target, html: '', ownerWebContentsId: 0 }).then(handle => { created = handle; return handle }), /fixture state denied/)
    assert.equal(revoked, true)
    assert.equal(calls.some(call => call.kind === 'resource-end'), false, 'failed state must not wait for resources')
    await assert.rejects(web.service.getState(target), /Interactive view is not ready/)
  } finally { if (created) await webPlatform.disposeSandbox(created.sandboxId, created.initId) }
})

test('resource completion cannot expose a page before its authorized state request succeeds', async () => {
  calls.length = 0; resourceDelay = 5
  let stateStarted = false, returned = false
  let finishState!: (state: unknown) => void
  const stateReady = new Promise(resolve => { finishState = resolve })
  route = async (path, init) => {
    if (init?.method === 'POST') return { pageId: 'wait-for-state', initId: 'wait-token', html: '<svg/>', state: null, stateRevision: 0 }
    if (init?.method === 'DELETE') return {}
    assert.ok(path.endsWith('/state')); stateStarted = true
    return stateReady
  }
  const web = createWebServices(target)
  const pending = web.service.prepareSandbox({ ...target, html: '', ownerWebContentsId: 0 }).then(handle => { returned = true; return handle })
  try {
    await delay(20)
    assert.equal(calls.some(call => call.kind === 'resource-end'), true)
    assert.equal(stateStarted, true)
    assert.equal(returned, false, 'prepare must keep the mounting boundary closed while state is pending')
  } finally {
    finishState({ state: null, revision: 0 })
    const handle = await pending
    await webPlatform.disposeSandbox(handle.sandboxId, handle.initId)
  }
})

test('initialization cancellation reaches both resource and fresh state requests and releases the page', async () => {
  calls.length = 0; resourceDelay = 1000
  let stateAborted = false, revoked = false
  route = async (path, init) => {
    if (init?.method === 'POST') return { pageId: 'cancel-state', initId: 'cancel-state-token', html: '<svg/>', state: null, stateRevision: 0 }
    if (init?.method === 'DELETE') { revoked = true; return {} }
    assert.ok(path.endsWith('/state'))
    try { await delay(1000, undefined, { signal: init?.signal ?? undefined }) }
    finally { stateAborted = init?.signal?.aborted === true }
    return { state: null, revision: 0 }
  }
  const web = createWebServices(target), controller = new AbortController()
  const pending = web.service.prepareSandbox({ ...target, html: '', ownerWebContentsId: 0 }, controller.signal)
  const timer = setTimeout(() => controller.abort(), 10)
  try { await assert.rejects(pending, /abort/i) } finally { clearTimeout(timer) }
  assert.equal(stateAborted, true)
  assert.equal(revoked, true)
  assert.equal(calls.some(call => call.kind === 'resource-end'), false)
})

test('a scope change after the parallel state read cannot expose the prepared document', async () => {
  calls.length = 0; resourceDelay = 40
  let revoked = false, stateRead = false
  route = async (path, init) => {
    if (init?.method === 'POST') return { pageId: 'scope-change', initId: 'scope-token', html: '<svg/>', state: null, stateRevision: 0 }
    if (init?.method === 'DELETE') { revoked = true; return {} }
    assert.ok(path.endsWith('/state')); stateRead = true
    return { state: null, revision: 0 }
  }
  const web = createWebServices(target)
  const pending = web.service.prepareSandbox({ ...target, html: '', ownerWebContentsId: 0 })
  await delay(10)
  assert.equal(stateRead, true)
  userId = 'another-user'
  try {
    await assert.rejects(pending, /Interactive view session changed/)
    assert.equal(revoked, true)
    await assert.rejects(web.service.getState(target), /Interactive view is not ready/)
  } finally { userId = 'student' }
})

test('completed public bytes are reused while each page keeps its own HTML, capability and fresh state read', async () => {
  calls.length = 0; resourceDelay = 10
  let creates = 0, states = 0
  const resourceHashes = { 'gen-ui.js': createHash('sha256').update('fixed public runtime').digest('hex') }
  route = async (path, init) => {
    if (init?.method === 'POST') {
      creates++
      return { pageId:`cache-page-${creates}`,initId:`capability-${creates}`,html:`scoped document ${creates}`,state:null,stateRevision:0,resourceHashes }
    }
    if (init?.method === 'DELETE') return {}
    assert.ok(path.endsWith('/state'))
    states++
    return {state:{modelContent:{fresh:states}},revision:states}
  }
  const handles=[]
  try {
    for (const page of [1,2]) {
      const web=createWebServices({...target,instanceKey:`cache-${page}`})
      const handle=await web.service.prepareSandbox({...target,html:'',ownerWebContentsId:0},new AbortController().signal)
      handles.push(handle)
      assert.equal((handle as typeof handle&{html:string}).html,`scoped document ${page}\nfixed public runtime`)
      assert.deepEqual(await web.service.getState(target),{modelContent:{fresh:page},privateContent:null})
    }
    assert.equal(creates,2)
    assert.equal(states,2,'public cache never replaces current authorized personal state')
    assert.equal(calls.filter(call=>call.kind==='resource-start').length,1,'same immutable runtime bytes should not transfer again')
  } finally { for(const handle of handles)await webPlatform.disposeSandbox(handle.sandboxId,handle.initId) }
})
