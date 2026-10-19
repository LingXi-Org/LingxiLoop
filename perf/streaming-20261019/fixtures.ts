import type { RunState, RunStreamEvent } from '@lyyzka/lingxios/ui'

export function state(body?: string): RunState {
  const goalOutcome = { status: 'satisfied' as const, verification: 'passed' as const, requestVersion: 1 }
  return {
    run: { id: 'run', status: body === undefined ? 'leased' : 'succeeded', fence: 1, requestVersion: 1,
      resultId: body === undefined ? null : 'result', resultFence: body === undefined ? null : 1,
      kind: 'turn', attempts: 1, createdAt: '2026-10-02T00:00:00Z', availableAt: '', heartbeatAt: null,
      lastProgressAt: null, goalOutcome: body === undefined ? null : goalOutcome, error: null },
    message: body === undefined ? null : { version: 2, runId: 'run', agentId: 'agent', sessionId: 'session', body,
      envelope: { version: 1, requestVersion: 1, body, evidenceSnapshotId: 'evidence', goalOutcome, citations: [], artifacts: [] } },
    delivery: body === undefined ? null : 'delivered',
  }
}

export function fixture(kind: 'short' | 'long') {
  const count = kind === 'short' ? 40 : 400
  const text = '合成性能测试：保留每段正文、中文和 emoji 😀。'.repeat(kind === 'short' ? 1 : 8)
  const events: RunStreamEvent[] = [{ type: 'state', state: state() }, { type: 'preview', preview: {
    kind: 'snapshot', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', seq: 1, draft: text,
  } }]
  for (let index = 2; index <= count; index++) events.push({ type: 'preview', preview: {
    kind: 'delta', runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', fromSeq: index - 1, seq: index, delta: text,
  } })
  events.push({ type: 'state', state: state(text.repeat(count)) })
  return { events, body: text.repeat(count) }
}

export function frames(events: RunStreamEvent[]): Uint8Array[] {
  return events.map(event => new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`))
}

export function stream(bytes: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream({ pull(controller) {
    if (index < bytes.length) controller.enqueue(bytes[index++])
    else controller.close()
  } })
}
