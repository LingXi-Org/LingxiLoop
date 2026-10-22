import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage, type NativeMessage } from '../../src/lib/nativeMessage'
import type { AgentRunSnapshot } from '../../src/lib/agentRunSnapshot'

export const origin = process.env.E2E_304_URL ?? 'http://127.0.0.1:53124'
export async function command(name: string, value: unknown = {}) {
  const response = await fetch(`${origin}/__fixture/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
  if (!response.ok) throw new Error(`Fixture ${name}: ${response.status}`)
}
export const annotation = (id: string, kind: string, extra: Record<string, unknown> = {}) => ({ providerMetadata: { lingxiloop: {
  activity: { version: 1, id, kind, label: id, requestVersion: 1, ...extra },
} } })
export const commentary = (index: number) => ({ type: 'text' as const, text: `公开过程 ${String(index).padStart(3, '0')}`, ...annotation(`activity-${index}`, 'commentary', { order: index, purpose: 'process' }) })
export function snapshot(content: NativeMessage['content'], options: { requestVersion?: number; seq?: number; custom?: Record<string, unknown>; status?: NativeMessage['status']; view?: Record<string, unknown> } = {}): AgentRunSnapshot {
  const requestVersion = options.requestVersion ?? 1
  return { message: createNativeMessage({ id: 'run-answer-first', role: 'assistant', createdAt: '2026-10-22T00:00:00.000Z', content,
    status: options.status ?? { type: 'running' }, custom: { runId: 'answer-first', activityPresentation: { version: 1 }, harnessControl: true,
      harness: { ...createRunView('answer-first'), requestVersion, fence: 1, messageFence: 1, lastSeq: options.seq ?? 100, lifecycle: 'leased', artifacts: [], ...options.view }, ...options.custom } }) }
}
export function mixed() {
  const tool = (id: string, name: string, result: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    type: 'tool-call' as const, toolCallId: id, toolName: name, args: {}, argsText: '{}', result,
    ...annotation(id, 'tool', { purpose: 'process', ...extra }),
  })
  return snapshot([
    commentary(1),
    tool('host:lookup/资料?one', 'fixture.lookup', { status: 'completed', display: { title: '普通资料查询', purpose: '核对资料', summary: '已核对合成资料' } }, { taskId: 'task-child' }),
    tool('memory-call', 'memory.search', { status: 'completed', memory: { chips: [{ id: 'memory-process', text: '过程学习偏好', version: 1, change: 'existing' }] } }),
    tool('knowledge-call', 'knowledge.search', { status: 'completed', display: { title: '检索知识资料', purpose: '核对课本', summary: '检索完成' } }),
    tool('research-call', 'research.search', { status: 'completed', sources: [
      { title: '资料甲（第一版）', url: 'https://example.com/reference?v=1', snippet: '第一版公开片段' },
      { title: '资料甲（第二版）', url: 'https://example.com/reference?v=2', snippet: '第二版公开片段' },
    ] }),
    { type: 'generative-ui', spec: { root: { component: 'agent-plan', props: { title: '合成执行计划', steps: [{ id: 'verify', label: '核对资料' }, { id: 'answer', label: '形成答复' }], activeIndex: 2 } } }, ...annotation('execution-plan', 'commentary', { purpose: 'process' }) },
    { type: 'text', text: '这是始终可读的实质答复。', ...annotation('answer', 'answer') },
    tool('requested-sources', 'research.search', { status: 'completed', sources: [{ title: '用户请求的资料', url: 'https://example.com/requested-source', snippet: '公开的最终资料' }] }, { purpose: 'result' }),
    { type: 'generative-ui', spec: { root: { component: 'memory-summary', props: { chips: [{ id: 'memory-fixture', text: '用户请求的记忆摘要', change: 'existing', version: 1 }] } } }, ...annotation('requested-memory', 'result', { purpose: 'result' }) },
    tool('requested-result', 'fixture.result', { status: 'completed', display: { title: '明确请求的查询成果', purpose: '呈现查询成果', summary: '查询成果已就绪' }, value: { title: '合成成果' } }, { purpose: 'result' }),
    { type: 'tool-call', toolCallId: 'legacy-result', toolName: 'fixture.legacy', args: {}, argsText: '{}', result: { status: 'completed', display: { title: '历史未分类成果', purpose: '查看已有成果', summary: '保留历史成果' }, value: { title: '不能误折叠' } } },
    { type: 'file', filename: '合成最终成果.pdf', mimeType: 'application/pdf', sourceType: 'url', data: 'https://example.com/synthetic-result.pdf' },
    { type: 'source', sourceType: 'url', id: 'final-citation', url: 'https://example.com/reference?v=1', title: '正文最终引用' },
  ] as NativeMessage['content'], { status: { type: 'complete', reason: 'stop' }, view: { lifecycle: 'succeeded', delivery: 'delivered' }, custom: { activityTasks: { version: 1, tasks: [
    { id: 'task-parent', label: '资料核对任务', status: 'complete' },
    { id: 'task-child', parentId: 'task-parent', label: '核对公开来源', status: 'complete' },
  ] }, runTrace: {
    version: 1, startedAt: 1792627200000, timingBasis: 'execution', truncated: false, limitations: [],
    root: { id: 'trace-root', name: '运行', kind: 'agent', status: 'complete', start: 0, end: 1200, durationMs: 1200, tokensIn: 100, tokensOut: 20, cost: null, costEstimated: false, children: [] },
  } } })
}
export function historyFixture() {
  const entries = Array.from({ length: 95 }, (_, index) => commentary(index))
  entries.push({ type: 'text', text: '已归档的公开答案前缀', ...annotation('accepted-prefix', 'commentary', { order: 95, purpose: 'process' }) })
  const answer = { type: 'text' as const, text: '当前有效答案不会被历史替换。', ...annotation('current-answer', 'answer') }
  const current = snapshot([...entries.slice(-40), answer], { custom: { activityHistory: { total: entries.length, attention: 0 } } })
  const pages: Record<string, { message: NativeMessage; total: number; nextOffset: number | null }> = {}
  for (let offset = 0; offset < entries.length; offset += 40) pages[offset] = {
    message: { ...current.message, content: entries.slice(offset, offset + 40) }, total: entries.length, nextOffset: offset + 40 < entries.length ? offset + 40 : null,
  }
  return { snapshot: current, pages, entries, answer }
}
