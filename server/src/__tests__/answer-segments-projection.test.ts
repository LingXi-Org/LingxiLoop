import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AssistantMessage, RunEvent, RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { RunStreamProjection, assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import { publicRunEvent } from '../agent-runtime/public-events.js'
import { activityAnnotation, isAnswerRevision } from '../../../src/lib/runActivity.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'

// Written before implementation: docs/evidence/issue-366/PRODUCT-FAILURE-MODEL.md.
const A = 'Gather collects the available inputs.'
const B = '\n\nCheck compares those inputs with the stated goal.'
const REPLACEMENT = 'Gather records the approved inputs.'
const COMMENTARY = 'Checking the stored resource.'
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const target = (runId: string) => ({ conversationId: 'synthetic-react-room', agentId: 'synthetic-agent', runId })
const answers = (frame: AgentRunSnapshot) => frame.message.content.filter(part => activityAnnotation(part)?.kind === 'answer')
const answerIds = (frame: AgentRunSnapshot) => answers(frame).map(part => activityAnnotation(part)!.id)
const state = (runId: string, status: RunState['run']['status'] = 'leased'): RunState => ({
  run: { id: runId, status, fence: 1, requestVersion: 1, resultId: null, resultFence: null,
    kind: 'turn', attempts: 1, createdAt: '2026-10-23T00:00:00Z', availableAt: '', heartbeatAt: null,
    lastProgressAt: null, goalOutcome: null, error: null }, message: null, delivery: null,
})
function fixture(name: string) {
  const runId = `synthetic-${name}`, projection = new RunStreamProjection(runId, false, { agentId: target(runId).agentId })
  const initial = state(runId), items: RunStreamEvent[] = [{ type: 'state', state: initial }]
  projection.advance(items[0]!)
  const frames: { checkpoint: string; target: ReturnType<typeof target>; snapshot: AgentRunSnapshot }[] = []
  let seq = 0
  function push(kind: string, data: RunEvent['data']) {
    const event: RunEvent = { runId, seq: ++seq, kind, visibility: 'user',
      stage: kind.endsWith('delta') ? 'delta' : kind.endsWith('started') ? 'started' : 'completed', data }
    const item: RunStreamEvent = { type: 'event', event }
    items.push(item); projection.advance(item)
    return item
  }
  const identity = (name: string, operation: 'append' | 'replace' = 'append', supersedes: string[] = []) => ({
    version: 3, purpose: 'answer', requestVersion: 1, fence: 1, attemptId: name,
    partId: `${name}:answer`, partIndex: 0, messageId: `answer:${runId}:v1`, segmentId: operation === 'replace' ? supersedes[0]! : `${name}:answer`, operation, supersedes,
  })
  const checkpoint = (checkpoint: string) => { frames.push({ checkpoint, target: target(runId), snapshot: copy(projection.snapshot) }) }
  function segment(name: string, text: string, operation: 'append' | 'replace' = 'append', supersedes: string[] = [], seal = true) {
    const source = identity(name, operation, supersedes)
    push('public.text.operation', source)
    push('public.text.delta', { ...source, chunkIndex: 0, text })
    push('public.text.ended', { ...source, chunkCount: 1, reason: seal ? 'completed' : 'failed' })
    if (seal) push('public.text.sealed', { ...source, chunkCount: 1, bodyHash: hash(text) })
    return { segmentId: source.segmentId, partId: source.partId, bodyHash: hash(text), text }
  }
  function tool(name: string, complete = false) {
    const identity = { requestVersion: 1, fence: 1, attemptId: name, toolCallId: `host:${name}`, partIndex: 0 }
    if (!complete) push('tool.started', { ...identity, name: 'documents.list' })
    else push('tool.completed', { ...identity, isError: false, result: { status: 'completed' } })
  }
  function commentary() {
    const id = { version: 2, purpose: 'commentary', requestVersion: 1, fence: 1, attemptId: 'commentary', partId: 'commentary', partIndex: 0 }
    push('public.text.delta', { ...id, chunkIndex: 0, text: COMMENTARY })
    push('public.text.ended', { ...id, chunkCount: 1, reason: 'tool' })
  }
  function commit(sources: { segmentId: string; partId: string; bodyHash: string; text: string }[], checkpointName = 'final', outcome: 'satisfied'|'partial' = 'satisfied') {
    const raw = sources.map(source => source.text).join(''), body = raw.trim(), left = raw.length - raw.trimStart().length
    let offset = 0
    const publicTextSources = { version: 3 as const, messageId: `answer:${runId}:v1`, bodyHash: hash(body), segments: sources.map(source => {
      const start = Math.max(0, Math.min(body.length, offset - left)); offset += source.text.length
      return { segmentId: source.segmentId, partId: source.partId, bodyHash: source.bodyHash, start, end: Math.max(start, Math.min(body.length, offset - left)) }
    }) }
    const goalOutcome = { status: outcome, verification: outcome === 'satisfied' ? 'passed' as const : 'inconclusive' as const, requestVersion: 1 }
    const message = { version: 2 as const, runId, agentId: target(runId).agentId, sessionId: 'synthetic-session', body, publicTextSources,
      envelope: { version: 1 as const, requestVersion: 1, body, evidenceSnapshotId: 'synthetic-evidence', citations: [], artifacts: [], goalOutcome } }
    push('response.committed', { requestVersion: 1, resultId: 'synthetic-result', publicTextSources })
    checkpoint(checkpointName === 'replacement-committed' ? checkpointName : 'commit-pending')
    const final: RunState = { ...state(runId, outcome === 'satisfied' ? 'succeeded' : 'partial'), run: { ...state(runId, outcome === 'satisfied' ? 'succeeded' : 'partial').run,
      resultId: 'synthetic-result', resultFence: 1, goalOutcome }, message, delivery: 'delivered' }
    const item: RunStreamEvent = { type: 'state', state: final }
    items.push(item); projection.advance(item); checkpoint('final')
    const restored = new RunStreamProjection(runId, false, { agentId: target(runId).agentId })
    restored.advance(item)
    // Message-first hydration must retain exact segment boundaries without old events.
    const history = copy(restored.snapshot)
    for (const item of items.slice(1)) if (item.type === 'event') restored.advance(item)
    return { message: message as AssistantMessage, history, hydratedReplay: copy(restored.snapshot), final }
  }
  function stop(lifecycle:'cancelled'|'failed') {
    const item: RunStreamEvent = {type:'state',state:state(runId,lifecycle)}
    items.push(item);projection.advance(item);checkpoint(lifecycle)
    const restored=new RunStreamProjection(runId,false,{agentId:target(runId).agentId})
    for(const item of items)restored.advance(item)
    return {history:copy(restored.snapshot)}
  }
  return { runId, projection, items, frames, push, identity, checkpoint, segment, tool, commentary, commit,stop }
}

function appendScenario(name = 'append') {
  const f = fixture(name), a = f.segment('a', A)
  f.checkpoint('answer-a'); f.tool('slow'); f.checkpoint('first-tool-held')
  f.commentary(); f.checkpoint('commentary'); f.tool('slow', true); f.tool('second'); f.checkpoint('second-tool-held');f.tool('second', true)
  const b = f.segment('b', B); f.checkpoint('answer-b')
  const accepted = f.commit([a,b])
  for (const item of f.items.slice(1)) if (item.type === 'event') f.projection.advance(item)
  f.checkpoint('replay')
  return { ...f, ...accepted }
}

test('v3 substantive segments survive tools and commentary, append once and hydrate with stable identities', () => {
  const s = appendScenario()
  const first = s.frames[0]!.snapshot, firstId = answerIds(first)[0]
  assert.equal(nativeText(first.message), A)
  for (const frame of s.frames) {
    const firstAnswer = answers(frame.snapshot)[0]
    assert.equal(answerIds(frame.snapshot)[0], firstId, frame.checkpoint)
    assert.equal(firstAnswer?.type === 'text' && firstAnswer.text, A, frame.checkpoint)
    assert.equal(frame.snapshot.message.content.filter(isAnswerRevision).length, 0, 'later attempts do not demote sealed answers')
  }
  const beforeCommit = s.frames.find(frame => frame.checkpoint === 'answer-b')!.snapshot
  assert.equal(answers(beforeCommit).length, 2)
  assert.deepEqual(answerIds(s.history), answerIds(beforeCommit))
  assert.deepEqual(answers(s.history), answers(s.frames.find(frame => frame.checkpoint === 'final')!.snapshot))
  assert.deepEqual(answers(s.hydratedReplay), answers(s.history))
  assert.deepEqual(answers(s.projection.snapshot), answers(s.history))
  assert.equal(s.projection.activityPage(0).message.content.some(part => activityAnnotation(part)?.kind === 'answer' || isAnswerRevision(part)), false)
})

test('only committed explicit replacement replaces sources; failed replacement retains the original', () => {
  for (const success of [false,true]) {
    const f = fixture(success ? 'replacement-committed' : 'replacement-failed'), a = f.segment('a', A)
    f.checkpoint('a-visible')
    const replacement = f.segment('replacement', REPLACEMENT, 'replace', [a.segmentId], success)
    f.checkpoint('replacement-pending')
    assert.equal(nativeText(f.projection.snapshot.message), A, 'uncommitted candidate cannot retract or append over the original')
    const accepted = success ? f.commit([replacement],'replacement-committed') : f.stop('failed')
    assert.equal(nativeText(accepted.history.message), success ? REPLACEMENT : A)
    assert.deepEqual(answers(accepted.history), answers(f.projection.snapshot))
    assert.equal(answers(f.projection.snapshot).length, 1)
  }
})

test('protocol-failed drafts remain auditable without leaking full text into final, history or replay', t => {
  const f = fixture('protocol-correction-515')
  const failed = 'FAILED_SYNTHETIC_DRAFT_515 '.repeat(15)
  f.segment('model:1', failed, 'append', [], false)
  f.segment('model:2', failed + 'Second attempt.', 'append', [], false)
  const final = f.segment('model:3', 'The corrected answer.')
  const accepted = f.commit([final])
  const page = f.projection.activityPage(0)
  for (const message of [f.projection.snapshot.message, accepted.history.message, accepted.hydratedReplay.message, page.message]) {
    assert.doesNotMatch(JSON.stringify(message.content), /FAILED_SYNTHETIC_DRAFT_515/)
  }
  assert.equal(nativeText(f.projection.snapshot.message), final.text)
  assert.equal(page.message.content.filter(isAnswerRevision).length, 2)
  assert.ok(page.message.content.filter(isAnswerRevision).every(part => part.type === 'text' && part.text === activityAnnotation(part)?.label))
  assert.equal(f.items.filter(item => item.type === 'event' && item.event.kind === 'public.text.ended' && item.event.data.reason === 'failed').length, 2)
  assert.ok(JSON.stringify(f.items).includes(failed), 'original event audit remains intact')
  const beforeReplay = copy(f.projection.snapshot)
  for (const item of f.items) f.projection.advance(item)
  assert.deepEqual(f.projection.snapshot.message.content, beforeReplay.message.content)
  t.diagnostic(JSON.stringify({ scenario: 'B-synthetic', attempts: ['model:1 failed', 'model:2 failed', 'model:3 completed'],
    committedSources: accepted.message.publicTextSources, finalText: nativeText(f.projection.snapshot.message),
    revisions: page.message.content.filter(isAnswerRevision).map(part => ({ id: activityAnnotation(part)?.id, label: activityAnnotation(part)?.label })), replayStable: true }))
})

test('explicit replacements expose lifecycle summaries while preserving the valid source until commit', () => {
  const f = fixture('replacement-summary-515'), original = f.segment('original', A)
  const replacement = f.segment('replacement', REPLACEMENT, 'replace', [original.segmentId])
  assert.equal(nativeText(f.projection.snapshot.message), A)
  const pending = f.projection.activityPage(0).message.content.filter(isAnswerRevision)
  assert.ok(pending.every(part => part.type === 'text' && part.text === activityAnnotation(part)?.label))
  f.commit([replacement])
  assert.equal(nativeText(f.projection.snapshot.message), REPLACEMENT)
  assert.doesNotMatch(JSON.stringify(f.projection.activityPage(0).message.content), /Gather collects the available inputs/)
})

test('a partial committed answer keeps truthful status and useful text without its failed draft', () => {
  const f = fixture('partial-after-save-518')
  f.segment('failed-explanation', 'FAILED_EXPLANATION_518', 'append', [], false)
  const answer = f.segment('saved-explanation', 'The saved result remains available; final verification is incomplete.')
  const accepted = f.commit([answer], 'final', 'partial')
  for (const snapshot of [f.projection.snapshot, accepted.history, accepted.hydratedReplay]) {
    assert.equal(nativeText(snapshot.message), answer.text)
    assert.deepEqual(snapshot.message.status, { type: 'incomplete', reason: 'other' })
    assert.doesNotMatch(JSON.stringify(snapshot.message.content), /FAILED_EXPLANATION_518/)
  }
  assert.equal(accepted.message.envelope.goalOutcome.status, 'partial')
})

test('cancellation retains shown answer and genuine incomplete status; equal text in other runs has distinct identity', () => {
  const ids = []
  for (const lifecycle of ['cancelled','failed'] as const) {
    const f = fixture(lifecycle); f.segment('a', A); f.tool('slow')
    f.projection.advance({ type: 'state', state: state(f.runId,lifecycle) })
    const snapshot = f.projection.snapshot
    assert.equal(nativeText(snapshot.message), A)
    assert.deepEqual(snapshot.message.status, { type: 'incomplete', reason: lifecycle === 'cancelled' ? 'cancelled' : 'error' })
    ids.push(answerIds(snapshot)[0])
  }
  assert.notEqual(ids[0], ids[1], 'run identity scopes equal segment names and equal text')
})

test('v3 events preserve only the public operation, source identity and seal allowlist', () => {
  const f = fixture('allowlist')
  for (const [kind, suffix] of [
    ['public.text.operation', {}], ['public.text.delta', { chunkIndex: 0, text: A }],
    ['public.text.ended', { chunkCount: 1, reason: 'completed' }], ['public.text.sealed', { chunkCount: 1, bodyHash: hash(A) }],
  ] as const) {
    const event: RunEvent = { runId: f.runId, seq: 1, kind, stage: 'completed', visibility: 'user',
      data: { ...f.identity('a'), ...suffix, privateReasoning: 'SECRET' } }
    const projected = publicRunEvent(event)
    assert.equal(projected.data.segmentId, 'a:answer')
    assert.equal(projected.data.operation, 'append')
    assert.doesNotMatch(JSON.stringify(projected), /SECRET|privateReasoning/)
  }
})

test('real assistant transport preserves every segment checkpoint without native-event leakage', async () => {
  const s = appendScenario('transport')
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    for (const item of s.items) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(item)}\n\n`))
    controller.close()
  } })
  const response = assistantRunResponse(body, new RunStreamProjection(s.runId, false, { agentId: target(s.runId).agentId }))
  const tracker = new AssistantTransportDeltaTracker(), snapshots: AgentRunSnapshot[] = []
  for await (const chunk of AssistantStream.fromResponse(response, new AssistantTransportDecoder())) {
    assert.equal(chunk.type, 'update-state')
    if (chunk.type === 'update-state') { tracker.append(chunk.operations); snapshots.push(copy(tracker.state as unknown as AgentRunSnapshot)) }
  }
  const visible = snapshots.filter(snapshot => answers(snapshot).length)
  assert.ok(visible.length)
  const firstId = answerIds(visible[0]!)[0]
  assert.ok(visible.every(snapshot => answerIds(snapshot)[0] === firstId))
  assert.deepEqual(answers(visible.at(-1)!), answers(s.history))
  if (process.env.ISSUE366_SNAPSHOTS) {
    const toScenario = (name:string,scenario:{runId:string;frames:typeof s.frames;history:AgentRunSnapshot})=>({
      name,targets:[target(scenario.runId)],frames:scenario.frames,history:[{target:target(scenario.runId),snapshot:scenario.history}],
    })
    const scenarios=[toScenario('append',s)]
    for(const success of [false,true]){
      const name=success?'replacement-committed':'replacement-failed',f=fixture(name),a=f.segment('a',A)
      f.checkpoint('answer-a')
      const replacement=f.segment('replacement',REPLACEMENT,'replace',[a.partId],success)
      f.checkpoint('replacement-pending')
      const ended=success?f.commit([replacement],'replacement-committed'):f.stop('failed')
      scenarios.push(toScenario(name,{...f,...ended}))
    }
    const cancelled=fixture('cancelled');cancelled.segment('a',A);cancelled.checkpoint('answer-a');cancelled.tool('slow');cancelled.checkpoint('first-tool-held')
    scenarios.push(toScenario('cancelled',{...cancelled,...cancelled.stop('cancelled')}))
    scenarios.push(toScenario('stale-reconnect',appendScenario('stale-reconnect')))
    const left=fixture('same-left'),right=fixture('same-right'),a=left.segment('a',A),b=right.segment('a',A)
    left.checkpoint('answer-a');right.checkpoint('answer-a')
    const leftFinal=left.commit([a]),rightFinal=right.commit([b])
    scenarios.push({name:'same-text-distinct-runs',targets:[target(left.runId),target(right.runId)],
      frames:[...left.frames,...right.frames],history:[{target:target(left.runId),snapshot:leftFinal.history},{target:target(right.runId),snapshot:rightFinal.history}]})
    mkdirSync(dirname(process.env.ISSUE366_SNAPSHOTS), { recursive: true })
    writeFileSync(process.env.ISSUE366_SNAPSHOTS, JSON.stringify({ version: 1, provenance: { producer: 'native-event-projection-fixture',
      qualification: process.env.ISSUE366_QUALIFICATION ?? 'installed-package',
      ...(process.env.ISSUE366_UI_SOURCE_SHA256 ? { uiSourceSha256:process.env.ISSUE366_UI_SOURCE_SHA256 } : {}),
      commit: process.env.ISSUE366_COMMIT ?? 'working-tree' }, scenarios }, null, 2))
  }
})
