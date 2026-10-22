import assert from 'node:assert/strict'
import test from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import { buildRunTrace,buildNativeRunTrace,nativeTraceMatchesState } from '../agent-runtime/run-trace.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'

// Protocol follow-up for the formally published 3.8.1 reader. These fixtures
// model public trace wire data only, never internal runtime tables/events.
for (const state of ['partial','blocked'] as const) test(`known ${state} execution remains truthful with its real end`,()=>{
  const wire = JSON.parse(JSON.stringify({ version: 1,runId: 'run',rootSpanId: 'root',requestVersion: 1,fence: 1,seq: 1,
    revision: 'terminal',queuedAt: 900,origin: 1000,truncated: false,spans: [{ spanId: 'root',parentSpanId: null,runId: 'run',kind: 'agent',
      state,startedAt: 1000,completedAt: 1500,timingBasis: 'run-execution',seq: 1,revision: 'terminal',requestVersion: null,fence: null,attemptId: null }] }))
  const view = { ...createRunView('run'),requestVersion: 1,fence: 1,lifecycle: state }
  assert.equal(nativeTraceMatchesState(wire,view),true)
  const trace = runTraceSchema.parse(buildNativeRunTrace(wire))
  assert.equal(trace.root.status,state)
  assert.equal(trace.root.start,0);assert.equal(trace.root.end,500);assert.equal(trace.root.durationMs,500)
  const fallback = buildRunTrace({ runId: 'run',createdAt: new Date(900).toISOString(),lifecycle: state,tools: [
    { type: 'tool-call',toolCallId: 'unresolved-tool',toolName: 'documents.read',args: {},argsText: '{}' },
  ],llm: [] })
  assert.equal(fallback.root.status,state);assert.equal(fallback.root.start,null);assert.equal(fallback.root.end,null)
  assert.equal(fallback.root.children[0]!.status,'unknown','run outcome does not establish an unresolved tool outcome')
  const unknown = { ...wire,spans: [{ ...wire.spans[0],state: 'unknown' }] }
  assert.equal(buildNativeRunTrace(unknown).root.status,'unknown','genuinely unavailable state is not inferred')
})
