import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { ActionContext, ActionResult, RunIdentity } from '@lyyzka/lingxios'
import { knowledgeSearchLabels } from '../../../src/lib/knowledgeSearch.js'
import { toolDisplay } from '../../../src/lib/runActivity.js'
import { buildNativeRunTrace, buildRunTrace } from '../agent-runtime/run-trace.js'
import type { RunTraceSnapshot } from '@lyyzka/lingxios'

// A completed tool invocation can still return an unavailable search/read.
// Exercise the saved display and its authorized replay, not a copy-only helper.
test('knowledge activity saves observed source outcomes and restores the same summary', async () => {
  let saved: unknown
  const query = mock.fn(async (sql: string, values: unknown[]) => {
    if (sql.startsWith('UPDATE agent_public_tool_activity')) {
      saved = JSON.parse(String(values[3]))
      return { rows: [] }
    }
    assert.match(sql, /JOIN agent_run_bindings/)
    return { rows: [{ tool_call_id: 'host:call', display: saved, started_at: new Date(1), completed_at: new Date(2) }] }
  })
  mock.module('../db/pool.js', { namedExports: { pool: { query }, presentationPool: {} } })
  const { finishPublicToolActivity, readPublicToolActivity } = await import('../agent-runtime/tool-activity.js')
  const context = (action: string) => ({ work: { tenantId: 'company', id: 'run' }, action: { action, idempotencyKey: 'call' } }) as ActionContext
  const check = async (action: string, result: ActionResult | undefined, expected: string) => {
    await finishPublicToolActivity(context(action), toolDisplay(action), result)
    const [restored] = await readPublicToolActivity({ tenantId: 'company', runId: 'run', agentId: 'agent', principalId: 'user', sessionId: 'session' } as RunIdentity)
    assert.equal(restored.display.summary, expected)
  }
  try {
    for (const status of ['matched', 'no_matches', 'no_sources', 'processing', 'not_applicable', 'unavailable', 'unexpected']) {
      const expected = knowledgeSearchLabels[status === 'unavailable' ? 'failed' : status === 'unexpected' ? 'unknown' : status as keyof typeof knowledgeSearchLabels]
      await check('knowledge.search', { ok: true, value: { status } }, expected)
    }
    for (const status of ['unavailable', 'processing', 'empty']) {
      await check('knowledge.read_source', { ok: true, value: { status, textAvailable: false } },
        status === 'processing' ? '课程资料仍在处理，尚未读取原文。' : status === 'empty' ? '课程资料没有可读取的原文。' : '课程原文暂时不可用，未完成读取。')
    }
    await check('knowledge.read_source', { ok: true, value: { status: 'ready', text: '第 2 页：导读' } }, '已阅读课程原文，引用依据会在答复中注明。')
    await check('knowledge.read_source', { ok: true, value: { status: 'ready', text: '' } }, '课程资料没有可读取的原文。')
    await check('knowledge.search', undefined, '这一步未完成，请重试。')
    await check('knowledge.search', { ok: false, error: 'private' }, '这一步未完成，请重试。')
    await check('knowledge.search', { ok: false, error: 'private', executionState: 'unknown' }, '操作结果尚未确认，请先核对结果，避免重复执行。')
    assert.doesNotMatch(JSON.stringify(saved), /private/)
  } finally { mock.restoreAll() }
})

test('all trace readers use actual search receipts instead of obsolete or generic summaries', () => {
  const root = { spanId: 'root', parentSpanId: null, runId: 'run', requestVersion: 1, fence: 1, attemptId: null,
    kind: 'agent' as const, state: 'complete' as const, startedAt: 1, completedAt: 3, timingBasis: 'run-execution' as const, seq: 2, revision: 'r' }
  const snapshot: RunTraceSnapshot = { version: 1, seq: 2, revision: 'r', runId: 'run', requestVersion: 1, fence: 1,
    rootSpanId: 'root', queuedAt: 1, origin: 1, spans: [root], truncated: false }
  for (const sourceStatus of ['unavailable', 'matched', 'no_matches'] as const) {
    const tool = { type: 'tool-call' as const, toolCallId: 'host:search', toolName: 'knowledge.search', args: {}, argsText: '{}', eventSeq: 2,
      activityIdentity: { requestVersion: 1, fence: 1, attemptId: 'attempt' },
      result: { status: 'completed', sourceStatus }, display: { title: '检索课程资料', purpose: '查找依据。', summary: '检索已完成，可在下方查看资料结果。' } }
    const expected = knowledgeSearchLabels[sourceStatus === 'unavailable' ? 'failed' : sourceStatus]
    const creationTrace = buildRunTrace({ runId: 'run', createdAt: new Date(1).toISOString(), lifecycle: 'succeeded', tools: [tool], llm: [] })
    assert.equal(creationTrace.root.children[0].output, expected)
    assert.equal(buildNativeRunTrace(snapshot, [tool]).root.children[0].output, expected)
    const native = { ...snapshot, spans: [root, { ...root, spanId: 'search', parentSpanId: 'root', kind: 'tool' as const,
      timingBasis: 'host-action' as const, toolCallId: tool.toolCallId, name: tool.toolName }] }
    assert.equal(buildNativeRunTrace(native, [tool]).root.children[0].output, expected)
  }
})
