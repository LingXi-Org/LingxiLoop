import assert from 'node:assert/strict'
import { after,beforeEach,mock,test } from 'node:test'
import type { RunIdentity } from '@lyyzka/lingxios'
import type { RunState } from '@lyyzka/lingxios/ui'
import type { readOptionalTraceActivity } from '../agent-runtime/tool-activity.js'
import type { PublicLlmTrace } from '../agent-runtime/run-trace.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'

// Failure model is written first in docs/evidence/issue-283-trace/README.md.
// This exercises the same projection through successive real async refresh calls;
// only the optional presentation I/O boundary is replaced, without DB/provider.
type Presentation = Awaited<ReturnType<typeof readOptionalTraceActivity>>
let reads: Promise<Presentation>[] = []
let calls = 0
mock.module('../agent-runtime/tool-activity.js',{ namedExports: {
  readOptionalTraceActivity: async () => {
    calls++
    assert.ok(reads.length,'the test must provide every optional read result')
    return reads.shift()!
  },
} })
const { RunStreamProjection } = await import('../agent-runtime/assistant-transport.js')
after(() => mock.restoreAll())
beforeEach(() => { reads=[]; calls=0 })
const identity: RunIdentity = { tenantId: 'fixture-tenant',principalId: 'fixture-principal',agentId: 'fixture-agent',sessionId: 'fixture-session',runId: 'run' }
const first: PublicLlmTrace = { id: 'first',model: 'fixture',status: 'complete',durationMs: 100,tokensIn: 100,tokensOut: 20,cost: 0.01,costEstimated: true }
const second: PublicLlmTrace = { ...first,id: 'second',tokensIn: 50,tokensOut: 10,cost: 0.02 }
const result = (llm: PublicLlmTrace[]): Presentation => ({ tools: [],llm })
function state(status: RunState['run']['status'] = 'leased',requestVersion = 1,fence = 1): RunState {
  return { run: { id: 'run',status,requestVersion,fence,resultId: null,resultFence: null,kind: 'turn',attempts: 1,
    createdAt: '2026-10-02T00:00:00Z',availableAt: '',heartbeatAt: null,lastProgressAt: null,goalOutcome: null,error: null },message: null,delivery: null }
}
function projection() { const value = new RunStreamProjection('run',false); value.apply({ type: 'state',state: state() }); return value }
const trace = (value: InstanceType<typeof RunStreamProjection>) => runTraceSchema.parse(value.snapshot.message.metadata.custom.runTrace)
async function refresh(value: InstanceType<typeof RunStreamProjection>,response: Presentation) {
  reads.push(Promise.resolve(response)); await value.syncPresentation(identity)
}
function unknownTotals(value: InstanceType<typeof RunStreamProjection>) {
  const current = trace(value)
  assert.deepEqual([current.root.tokensIn,current.root.tokensOut,current.root.cost],[null,null,null])
  assert.ok(current.limitations.includes('presentation-unavailable'))
  assert.equal(current.root.children[0]!.tokensIn,100,'confirmed prior span is retained')
  assert.equal(current.root.children[0]!.cost,0.01)
}
function completeTotals(value: InstanceType<typeof RunStreamProjection>) {
  const current = trace(value)
  assert.equal(current.root.tokensIn,150); assert.equal(current.root.tokensOut,30)
  assert.ok(Math.abs(current.root.cost!-0.03)<1e-12)
  assert.ok(!current.limitations.includes('presentation-unavailable'))
  assert.equal(current.root.children.length,2)
}
function deferred() {
  let resolve!: (value: Presentation) => void
  const promise = new Promise<Presentation>(settle => { resolve=settle })
  return { promise,resolve }
}

for (const lifecycle of ['leased','succeeded','failed','cancelled'] as const) test(`current ${lifecycle} failed refresh hides totals, retains spans, and later success restores coverage`,async () => {
  const value = projection()
  await refresh(value,result([first]))
  assert.equal(trace(value).root.tokensIn,100)
  value.apply({ type: 'state',state: state(lifecycle) })
  await refresh(value,null)
  unknownTotals(value)
  await refresh(value,result([first,second]))
  completeTotals(value)
})

test('an older concurrent failed refresh cannot invalidate a newer same-revision success',async () => {
  const value = projection()
  await refresh(value,result([first]))
  const old = deferred(); reads.push(old.promise)
  const pending = value.syncPresentation(identity)
  await refresh(value,result([first,second]))
  old.resolve(null); await pending
  completeTotals(value)
})

test('an older concurrent success cannot promote coverage after a newer failed refresh',async () => {
  const value = projection()
  await refresh(value,result([first]))
  const old = deferred(); reads.push(old.promise)
  const pending = value.syncPresentation(identity)
  await refresh(value,null)
  unknownTotals(value)
  old.resolve(result([first,second])); await pending
  unknownTotals(value)
})

for (const changed of ['request','fence','lifecycle'] as const) test(`superseded ${changed} refresh failure leaves the newer success intact`,async () => {
  const value = projection()
  await refresh(value,result([first]))
  const old = deferred(); reads.push(old.promise)
  const pending = value.syncPresentation(identity)
  value.apply({ type: 'state',state: state(changed === 'lifecycle' ? 'cancelled' : 'leased',changed === 'request' ? 2 : 1,changed === 'fence' ? 2 : 1) })
  await refresh(value,result([first,second]))
  const before = value.snapshot
  old.resolve(null); await pending
  assert.deepEqual(value.snapshot,before)
  completeTotals(value)
})

test('aborting a refresh leaves confirmed coverage intact, including an already-aborted entry',async () => {
  const value = projection()
  await refresh(value,result([first,second]))
  const before = value.snapshot,old = deferred(),abort = new AbortController()
  reads.push(old.promise)
  const pending = value.syncPresentation(identity,abort.signal)
  abort.abort(); old.resolve(null); await pending
  assert.deepEqual(value.snapshot,before)
  const count = calls
  await value.syncPresentation(identity,abort.signal)
  assert.equal(calls,count,'already-aborted calls do not read or change coverage')
  completeTotals(value)
})
