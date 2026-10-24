import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash } from 'node:crypto'

type Route = (path: string, init?: RequestInit) => Promise<unknown>
let route: Route = async () => { throw new Error('Unexpected fixture request') }
const userId = 'student'
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

test('record the current authorized-page resource/state critical path', async () => {
  const samples = []
  for (let sample = 0; sample < 3; sample++) {
    calls.length = 0; resourceDelay = 120
    route = async (path, init) => {
      if (init?.method === 'POST') return { pageId: `page-${++sequence}`, initId: 'fixture-capability', html: '<svg/>', state: null, stateRevision: 0 }
      if (init?.method === 'DELETE') return {}
      assert.ok(path.endsWith('/state'))
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
    samples.push({ sample, elapsedMs: performance.now() - start, calls: calls.map(call => ({ ...call, at: call.at - start })) })
    await webPlatform.disposeSandbox(handle.sandboxId, handle.initId)
  }
  console.log('AUTHORIZED_PREPARATION_SAMPLES', JSON.stringify(samples))
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
