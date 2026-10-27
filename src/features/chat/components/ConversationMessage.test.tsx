import { createNativeMessage } from '@/lib/nativeMessage'
import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { AssistantRuntimeProvider, ThreadPrimitive, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { renderToStaticMarkup } from 'react-dom/server'
import { convertEnvelope, projectMessageGroups } from '../runtime/converter'
import { getLingxiMessageMetadata } from '../runtime/model'
import { projectReplyBranches } from '../runtime/reply-branches'
import { create } from 'zustand'
import type { Participant } from '@/types'
import { load } from 'cheerio'
import { TooltipProvider } from '@/components/ui/tooltip'
mock.module('../../canvas/components/CanvasArtifactCard', { namedExports: { CanvasArtifactCard: () => null } })
mock.module('../visualize/VisualizeText', { namedExports: { VisualizeText: ({ Text }: { Text: React.ComponentType }) => <Text /> } })
mock.module('./ConversationComposer', { namedExports: { ConversationComposer: () => null } })
mock.module('../runtime/transport', { namedExports: { ChatTransport: class {}, chatTransport: {}, filterThreadMessages: (messages: ThreadMessage[]) => messages } })
mock.module('@/stores/auth', { namedExports: { useAuth: create(() => ({ user: null })), getMeId: () => null, getActiveCompanyId: () => null } })
const actualPresentation = await import('./message-presentation')
let presentationCalls = 0
mock.module('./message-presentation', { namedExports: { ...actualPresentation,
  messagePresentation: (...args: Parameters<typeof actualPresentation.messagePresentation>) => {
    presentationCalls++
    return actualPresentation.messagePresentation(...args)
  },
} })
const { useParticipants } = await import('@/features/agents/state')
const { ConversationMessage } = await import('./ConversationMessage')
const { ConversationThread } = await import('./ConversationThread')

const participants: Record<string, Participant> = {
  agent: { id: 'agent', kind: 'agent', name: '测试助手', initial: '助', avatarBg: 'transparent', status: 'avail' },
  human: { id: 'human', kind: 'human', name: '其他成员', initial: '人', avatarBg: 'transparent', status: 'avail' },
}
useParticipants.setState({ byId: participants })

function message(id: string, sender = 'agent', attachment = false) {
  return convertEnvelope({ channelId: 'room', channelType: 2, fromUid: sender, clientMsgNo: id,
    messageId: id, messageSeq: Number(id), timestamp: 1_767_225_600 + Number(id),
    payload: createNativeMessage({ id,role: sender === 'agent' ? 'assistant' : 'user', createdAt: new Date((1_767_225_600 + Number(id)) * 1000).toISOString(),
      content: attachment ? [{ type: 'file', data: 'https://example.com/report.pdf',filename: '报告.pdf',mimeType: 'application/pdf',sourceType: 'url' }] : [{ type: 'text',text: `正文${id}` }] }),
  }, { participants, meId: 'me' })
}

function Preview({ messages }: { messages: ThreadMessage[] }) {
  const runtime = useExternalStoreRuntime({ messages: projectMessageGroups(messages),
    isRunning: messages.some(message => message.status?.type === 'running'), onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message: ConversationMessage }} /></AssistantRuntimeProvider>
}

test('connection recovery keeps reply text and exposes no diagnostic card', () => {
  for (const connection of ['checking', 'released', 'inaccessible'] as const) {
    const original = message('1')
    const reply = { ...original, metadata: { ...original.metadata, custom: { ...getLingxiMessageMetadata(original), runId: 'run', runConnection: connection,
      harness: { ...createRunView('run'), lifecycle: 'leased' as const, artifacts: [] } } } } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
    assert.match($.text(), /正文1/)
    assert.doesNotMatch($.text(), /连接任务失败|核对任务状态|状态待确认|已停止本地等待|权限可能已变化/)
    assert.equal($('button').filter((_, el) => $(el).text().includes('恢复连接')).length, connection === 'released' ? 1 : 0)
  }
})

// Failure cases: the real thread filters out v2 messages; settled tools spin forever;
// approvals disappear in collapsed groups; mixed content loses order or repeats its footer.
test('the real conversation thread displays native v2 messages', () => {
  function ThreadPreview() {
    const runtime = useExternalStoreRuntime({ messages: [message('1')], onNew: async () => {} })
    return <AssistantRuntimeProvider runtime={runtime}><TooltipProvider><ConversationThread conversationId="room" readOnly /></TooltipProvider></AssistantRuntimeProvider>
  }
  assert.match(load(renderToStaticMarkup(<ThreadPreview />)).text(), /正文1/)
})

test('tool terminal and approval states are visible without requiring a result', () => {
  for (const [status, extra, label] of [
    [{ type: 'incomplete', reason: 'cancelled' }, {}, '已取消'],
    [{ type: 'incomplete', reason: 'error' }, {}, '执行失败'],
    [{ type: 'complete', reason: 'stop' }, {}, '未完成'],
    [{ type: 'requires-action', reason: 'tool-calls' }, { approval: { id: 'gate' } }, '等待审批'],
    [{ type: 'complete', reason: 'stop' }, { approval: { id: 'gate', resolution: 'expired' } }, '审批已过期'],
  ] as const) {
    const reply = { ...message('1'), status, content: [{ type: 'tool-call', toolCallId: 'call', toolName: 'fixture.tool', args: {}, argsText: '{', ...extra }] } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
    assert.ok($.text().includes(label), `${label}: ${$.text()}`)
    assert.doesNotMatch($.text(), /执行中/)
    assert.equal($('[data-slot="tool-group-root"]').length, 0)
    assert.equal($('time').length, 0)
  }
})

test('unclassified legacy tools and retired records stay visible', () => {
  const tool = (id: string) => ({ type: 'tool-call' as const, toolCallId: id, toolName: 'fixture.tool', args: {}, argsText: '{}', result: { ok: true } })
  const reply = { ...message('1'), content: [{ type: 'text', text: '开始正文' }, tool('one'), tool('two'),
    { type: 'tool-call', toolCallId: 'calendar', toolName: 'calendar.list', args: {}, argsText: '{}', result: { status: 'completed', value: { events: [], truncated: false } } },
    { type: 'text', text: '最后正文' }] } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.equal($('[data-slot="tool-group-root"]').length, 0)
  assert.equal($('[data-native-part="tool-call"]').length, 3)
  assert.match($.text(), /此记录仅供查看/)
  assert.equal($('time').length, 0)
  assert.match($('[data-agent-body]').last().text(), /最后正文/)
})

// Failure cases: a run's tools appear twice or in multiple disclosures; answers or
// decisions get hidden; failed/cancelled runs are presented as successful.
test('native run parts have one process disclosure while answers and current decisions stay outside', () => {
  const tool = (id: string) => ({ type: 'tool-call' as const, toolCallId: id, toolName: `fixture.${id}`, args: {}, argsText: '{}', result: { ok: true }, providerMetadata: { lingxiloop: { activity: { version: 1,id,kind: 'tool',label: '处理任务' } } } })
  const reply = { ...message('1'), status: { type: 'requires-action', reason: 'tool-calls' }, content: [
    { type: 'text',text: 'Synthetic public process.',providerMetadata: { lingxiloop: { activity: { version: 1,id: 'process',kind: 'commentary',label: '公开过程' } } } },
    tool('one'), { type: 'text', text: '公开答复' },
    { ...tool('approval'), result: undefined, approval: { id: 'gate' } }, tool('two'),
    { ...tool('error'), isError: true },
  ], metadata: { custom: { ...getLingxiMessageMetadata(message('1')), activityPresentation: { version: 1 },runId: 'run',
    harness: { ...createRunView('run'), lifecycle: 'waiting', artifacts: [] } } },
  } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.equal($('[data-slot="run-activity"]').length, 1)
  assert.equal($('[data-slot="tool-group-root"]').length, 0)
  assert.equal($.text().split('公开答复').length - 1, 1)
  for (const label of ['等待有权限的成员审批。', '这一步未完成，请重试。']) assert.ok($.text().includes(label), label)
  assert.doesNotMatch($('[data-slot="run-activity"]').text(), /公开答复|等待有权限的成员审批|这一步未完成/)
  assert.equal($('[data-native-part="tool-call"]').length, 2, 'ordinary tools are inside the initially collapsed process')
  assert.equal($('[data-message-region="body"]').text(), '公开答复')
  assert.equal($('[data-message-region="attention"] [data-native-part="tool-call"]').length, 2)
})

test('run activity retains cancelled, error and incomplete outcomes', () => {
  for (const [status] of [
    [{ type: 'running' }, 'running'],
    [{ type: 'complete', reason: 'stop' }, 'complete'],
    [{ type: 'incomplete', reason: 'cancelled' }, 'cancelled'],
    [{ type: 'incomplete', reason: 'error' }, 'error'],
    [{ type: 'incomplete', reason: 'other' }, 'incomplete'],
  ] as const) {
    const reply = { ...message('1'), status, content: [
      { type: 'tool-call', toolCallId: 'call', toolName: 'fixture.tool', args: {}, argsText: '{}', result: { ok: true } },
      { type: 'text', text: '保留的答复' },
    ], metadata: { custom: { ...getLingxiMessageMetadata(message('1')), activityPresentation: { version: 1 },runId: 'run',
      harness: { ...createRunView('run'), artifacts: [] } } },
    } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
    assert.equal($('[data-slot="run-activity"]').length, 0)
    assert.equal($.text().split('保留的答复').length - 1, 1)
    assert.equal($('time').length, 0)
  }
})

test('existing data names render descriptive cards without dumping JSON', () => {
  const reply = { ...message('1'), content: [
    { type: 'data', name: 'document-reference', data: { title: '证据文档', pages: 3, anchors: [{ page: 2, quote: '可核对的证据' }], activePage: 2 } },
    { type: 'data', name: 'email', data: { id: 'mail', from: 'a@example.com', to: ['b@example.com'], cc: [], subject: '研究总结', body: '邮件正文', outcome: 'sent' } },
    { type: 'data', name: 'tool-activity', data: { title: '整理资料', status: 'completed' } },
  ] } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  for (const label of ['证据文档', '可核对的证据', '研究总结', '邮件正文', '整理资料']) assert.ok($.text().includes(label), label)
  assert.equal($('pre').length, 0)
  assert.equal($('time').length, 0)
  assert.equal($('button').filter((_, node) => /发送邮件|批准|加入安排/.test($(node).text())).length, 0)
})

test('memory metadata does not expose summaries in conversation messages', () => {
  const reply = message('1')
  const metadata = getLingxiMessageMetadata(reply)
  metadata.runId = 'run'
  metadata.harness = { ...createRunView('run'), lifecycle: 'succeeded',artifacts: [] }
  metadata.memory = { chips: [{ id: 'memory', text: '隐藏的记忆摘要' }], calls: {}, revision: 1 }
  const html = renderToStaticMarkup(<Preview messages={[reply]} />)
  assert.doesNotMatch(html, /隐藏的记忆摘要|memory-chips|已记住/)
  assert.match(load(html).text(), /正文1/)
})

test('all senders omit bubble timestamps and only outgoing messages show delivery', () => {
  for (const sender of ['agent', 'human', 'me']) {
    const html = renderToStaticMarkup(<Preview messages={[message('1', sender, true), message('2', sender)]} />)
    const $ = load(html)
    if (sender !== 'me') assert.equal((html.match(new RegExp(`class="font-medium">${participants[sender].name}`, 'g')) ?? []).length, 1)
    assert.equal($('time').length, 0)
    assert.equal($('[data-slot="attachment-card"] time').length, 0)
    assert.equal($(sender === 'agent' ? '[data-agent-body] time' : '[data-message-bubble] time').length, 0)
    assert.equal($('[data-message-footer][data-align="end"]').length, sender === 'me' ? 2 : 0)
    if (sender === 'me') assert.equal($('[role="status"][aria-label="已送达"]').length, 2)
  }
})

test('attachments retain delivery feedback without a timestamp', () => {
  for (const delivery of ['sending', 'sent', 'failed'] as const) {
    const attachment = message('1', 'me', true)
    attachment.metadata.custom.delivery = delivery
    const $ = load(renderToStaticMarkup(<Preview messages={[attachment]} />))
    assert.equal($('time').length, 0)
    assert.equal($('[data-slot="attachment-card"] [role="status"]').attr('aria-label'), delivery === 'sending' ? '发送中' : delivery === 'sent' ? '已送达' : '发送失败')
  }
})

test('running and completed replies omit timestamps and completion labels', () => {
  for (const running of [true, false]) {
    const reply = message('1')
    const harness = { ...createRunView('run'), artifacts: [], lifecycle: running ? 'leased' as const : 'succeeded' as const,
      goalOutcome: { status: 'satisfied' as const, requestVersion: 1, verification: 'passed' as const } }
    const messages = [{ ...reply, status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
      metadata: { ...reply.metadata, custom: { ...getLingxiMessageMetadata(reply), runId: 'run', harness } },
    } as ThreadMessage]
    const html = renderToStaticMarkup(<Preview messages={messages} />)
    assert.equal(html.includes('data-message-footer'), false)
    assert.equal(html.includes('<time '), false)
    assert.doesNotMatch(html, /已完成/)
  }
})

test('mixed content and cards omit timestamps', () => {
  const attachment = message('1', 'agent', true)
  const mixed = { ...attachment, content: [...attachment.content, { type: 'text', text: '第一段\n\n最后一段' }] } as ThreadMessage
  let $ = load(renderToStaticMarkup(<Preview messages={[mixed]} />))
  assert.equal($('time').length, 0)
  assert.equal($('[data-agent-body]').last().find('time').length, 0)
  assert.equal($('[data-slot="attachment-card"] time').length, 0)
  const poll = { ...message('2'), content: [{ type: 'data', name: 'poll', data: { poll: { question: '投票', mode: 'single', options: [{ id: 'a',text: 'A' }] }, pollTallies: [] } }] } as ThreadMessage
  $ = load(renderToStaticMarkup(<Preview messages={[poll]} />))
  assert.equal($('[data-slot="poll-card"] time').length, 0)
  assert.equal($('time').length, 0)
  mixed.metadata.custom.timestampMissing = true
  $ = load(renderToStaticMarkup(<Preview messages={[mixed]} />))
  assert.equal($('time').length, 0)
  assert.ok($.text().includes('最后一段'))
})

test('agent replies have one complete action row after all message parts', () => {
  const reply = { ...message('1'), content: [{ type: 'text', text: '开始正文' },
    { type: 'data', name: 'tool-activity', data: { title: '整理资料', status: 'completed' } },
    { type: 'text', text: '最后正文' }] } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply, message('2', 'human')]} />))
  const actions = $('[data-slot="message-actions"]')
  assert.equal(actions.length, 1)
  assert.deepEqual(actions.find('button').map((_, node) => $(node).attr('aria-label')).get(),
    ['复制回复', '评价为有帮助', '评价为无帮助', '重新生成回复', '更多回复操作'])
  assert.equal(actions.prevAll('.native-message-content').length, 1)
  assert.equal($('[data-agent-body] [role="toolbar"]').length, 0)
})

test('failed streamed replies retain prose and show the official error banner with retry', () => {
  const reply = { ...message('1'), status: { type: 'incomplete', reason: 'error' }, metadata: { custom: {
    ...getLingxiMessageMetadata(message('1')), sequence: null, sourceRef: 'original-question',
    harnessError: 'The operation was aborted due to timeout',
  } } } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.match($.text(), /正文1/)
  const error = $('[data-slot="error-state"][role="alert"]')
  assert.match(error.text(), /回复未完成.*超时/)
  assert.equal(error.find('button').text(), '重新生成回复')
  assert.match(error.attr('class') ?? '', /rounded-2xl.*bg-red-500/)
})

test('terminal feedback shares the run error or cancellation display and retains retry context', () => {
  for (const lifecycle of ['failed', 'cancelled'] as const) {
    const detail = lifecycle === 'failed' ? '模型服务暂时不可用，已完成的操作会保留。' : '这次任务已取消，已完成的操作会保留。'
    const reply = { ...message('1'), id: 'run-run', status: { type: 'incomplete', reason: lifecycle === 'failed' ? 'error' : 'cancelled' }, metadata: { custom: {
      ...getLingxiMessageMetadata(message('1')), sequence: null, sourceRef: 'original-question', runId: 'run',
      harness: { ...createRunView('run'), lifecycle, requestVersion: 1, fence: 1, artifacts: [] },
    } } } as ThreadMessage
    const feedback = convertEnvelope({ channelId: 'room', channelType: 2, fromUid: 'agent', clientMsgNo: 'terminal-feedback',
      messageId: 'terminal-feedback', messageSeq: 2, timestamp: 2,
      payload: createNativeMessage({ id: 'terminal-feedback', role: 'system', content: [{ type: 'text', text: detail }],
        custom: { runId: 'run', requestVersion: 1, terminalFeedbackId: 'feedback', terminalStatus: lifecycle } }),
    }, { participants, meId: 'me' })
    const projected = projectReplyBranches([reply, feedback], {})
    const $ = load(renderToStaticMarkup(<Preview messages={projected} />))
    assert.equal(projected.length, 1)
    assert.equal($.text().split(detail).length - 1, 1, 'one readable terminal explanation')
    assert.match($.text(), /正文1/)
    assert.equal(getLingxiMessageMetadata(projected[0]).sourceRef, 'original-question')
    if (lifecycle === 'failed') {
      assert.equal($('[data-slot="error-state"]').length, 1)
      assert.equal($('[data-slot="error-state"] button').text(), '刷新进度')
    } else assert.equal($('[data-slot="error-state"]').length, 0)
  }
})

test('structured terminal scopes keep the answer and agree on process, failure and recovery labels', () => {
  for (const [scope, title, label] of [
    ['follow_up', '回答已生成，后续协作未完成', '后续协作未完成'],
    ['finalization', '答复已发送，收尾未完成', '收尾未完成'],
    ['delivery', '答复投递未完成', '投递未完成'],
    ['unknown', '本轮执行未完成', '执行未完成'],
  ] as const) {
    const reply = { ...message('1'), id: 'run-run', status: { type: 'incomplete', reason: 'error' },
      content: [{ type: 'text', text: '已展示的任务清单' }, { type: 'text', text: '已查询任务',
        providerMetadata: { lingxiloop: { activity: { version: 1, id: 'lookup', kind: 'commentary', label: '查询任务' } } } }],
      metadata: { custom: { ...getLingxiMessageMetadata(message('1')), runId: 'run', sourceRef: 'question',
        harness: { ...createRunView('run'), lifecycle: 'failed', requestVersion: 1, fence: 1, artifacts: [] },
        terminalFeedback: { id: 'feedback', requestVersion: 1, status: 'failed', delivery: 'delivered', scopeVersion: 1, scope,
          text: '对应步骤未完成，已完成的操作会保留。' },
      } } } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
    assert.match($.text(), /已展示的任务清单/)
    assert.equal($('[data-slot="error-state"] p').first().text(), title)
    assert.match($('[data-slot="run-activity"]').text(), new RegExp(label))
    assert.doesNotMatch($('[data-slot="run-activity"]').text(), /处理失败/)
    const retry = $('[data-slot="error-state"] button')
    assert.equal(retry.text(), scope === 'delivery' ? '' : '刷新进度')
    assert.doesNotMatch($('[data-slot="error-state"]').text(), /回复生成失败/)
    assert.equal($('[aria-label="重新生成回复"]').length, 1, 'whole-answer regeneration stays a separate action')
  }
})

test('cancelled follow-up remains visible when the main run itself succeeded', () => {
  const detail = '已有答复已发送，后续协作已取消。'
  const reply = { ...message('1'), id: 'run-run', status: { type: 'incomplete', reason: 'cancelled' }, metadata: { custom: {
    ...getLingxiMessageMetadata(message('1')), runId: 'run',
    harness: { ...createRunView('run'), lifecycle: 'succeeded', requestVersion: 1, artifacts: [] },
    terminalFeedback: { id: 'feedback', requestVersion: 1, status: 'cancelled', scopeVersion: 1, scope: 'follow_up', text: detail },
  } } } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.match($.text(), /正文1/)
  assert.match($.text(), new RegExp(detail))
  assert.equal($('[data-slot="error-state"]').length, 0)
})

// Failure cases: incoming humans mistaken for agents; long replies center avatars;
// streaming chrome persists on history; compact typography leaks into human bubbles.
test('sender kind owns bubble chrome and agent avatars align at the top', () => {
  for (const sender of ['agent', 'human', 'me']) {
    const $ = load(renderToStaticMarkup(<Preview messages={[message('1', sender)]} />))
    assert.equal($('[data-message-bubble]').length, sender === 'agent' ? 0 : 1)
    assert.equal($('[data-agent-body]').length, sender === 'agent' ? 1 : 0)
    if (sender === 'agent') {
      assert.match($('[data-message-avatar]').attr('class') ?? '', /self-start/)
      assert.doesNotMatch($('[data-agent-body]').attr('class') ?? '', /bg-|rounded-|border-/)
      assert.match($('[data-agent-body]').attr('class') ?? '', /text-base/)
    }
  }
})

// #275 replaces flat explicit process text with RunActivity; the removed
// aggregate history controls must still never return from legacy metadata.
test('explicit public process uses RunActivity across memory tools without legacy history controls', () => {
  for (const count of [7, 110, 1100]) {
    const commentary = (id: string, text: string) => ({ type: 'text' as const, text,
      providerMetadata: { lingxiloop: { activity: { version: 1, id, kind: 'commentary', label: '公开说明' } } } })
    const reply = { ...message('1'), status: { type: 'running' }, content: [
      commentary('before', '我先查看你授权的记忆。'),
      { type: 'tool-call', toolCallId: 'memory', toolName: 'memory.list', args: {}, argsText: '', result: { status: 'completed' } },
      commentary('after', '已查到目录，正在核对相关条目。'),
    ], metadata: { custom: { ...getLingxiMessageMetadata(message('1')), activityPresentation: { version: 1 },
      activityHistory: { total: count, attention: 1 }, runId: 'run' } } } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
    assert.equal($('[data-slot="run-activity"]').length, 1)
    assert.doesNotMatch($.text(), /查看全部活动|查看需要注意的记录|显示更多活动|工具执行记录/)
    const text = $.text()
    assert.ok(text.includes('已查到目录，正在核对相关条目。'))
    assert.equal($('[data-agent-body]').length, 0, 'explicit process is not rendered as answer body')
    assert.equal($('[data-native-part="tool-call"]').length, 1)
  }
})

// #275: explicit process belongs to RunActivity; live answers and recovery stay outside it.
test('RunActivity contains process on both sides of a streaming answer without hiding the answer or restoring old controls', () => {
  const part = (id: string, kind: 'commentary' | 'answer', text: string) => ({ type: 'text' as const,text,
    providerMetadata: { lingxiloop: { activity: { version: 1,id,kind,label: kind === 'commentary' ? '公开过程' : '答复' } } } })
  const reply = { ...message('1'),status: { type: 'running' },content: [
    part('before','commentary','Synthetic process before.'),part('answer','answer','Synthetic answer still streaming.'),part('after','commentary','Synthetic process after.'),
  ],metadata: { custom: { ...getLingxiMessageMetadata(message('1')),runId: 'run',activityPresentation: { version: 1 },activityHistory: { total: 120,attention: 1 } } } } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.equal($('[data-slot="run-activity"]').length,1)
  assert.equal($('[data-agent-body]').text(),'Synthetic answer still streaming.')
  assert.doesNotMatch($('[data-agent-body]').text(),/process before|process after/)
  assert.doesNotMatch($.text(),/查看全部活动|查看需要注意的记录|显示更多活动/)
})

// #304: the supported native-unbound shape has one current input owner.
test('interrupt and awaiting_input share one form and read-only history has none', () => {
  const base = message('1')
  const content = [{ type: 'tool-call' as const, toolCallId: 'ask', toolName: 'chat.ask', args: {}, argsText: '',
    interrupt: { type: 'human' as const, payload: { prompt: '请补充信息' } } }]
  const custom = { ...getLingxiMessageMetadata(base), runId: 'run', harnessControl: true,
    harness: { ...createRunView('run'), lifecycle: 'waiting', requestVersion: 1,
      goalOutcome: { status: 'awaiting_input', question: '请补充信息' }, artifacts: [] } }
  const waiting = { ...base, status: { type: 'requires-action', reason: 'interrupt' }, content, metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom } } as ThreadMessage
  let $ = load(renderToStaticMarkup(<Preview messages={[waiting]} />))
  assert.equal($('input').length, 1, 'only the owning tool has a generic input')
  assert.equal($('button').filter((_, node) => /提交/.test($(node).text())).length, 1)
  const settled = { ...waiting, status: { type: 'complete', reason: 'stop' }, metadata: { custom: { ...custom,
    harness: { ...custom.harness, lifecycle: 'succeeded' } } } } as ThreadMessage
  $ = load(renderToStaticMarkup(<Preview messages={[settled]} />))
  assert.equal($('input').length, 0, 'settled replay never restores an input')
})

test('legacy unclassified content stays visible and the answer region is stable across ordering', () => {
  const answer = { type: 'text', text: '首字', providerMetadata: { lingxiloop: { activity: { version: 1, id: 'accepted-logical-id', kind: 'answer', label: '答复' } } } }
  const tool = { type: 'tool-call', toolCallId: 'ordinary', toolName: 'fixture.tool', args: {}, argsText: '', result: { status: 'completed' },
    providerMetadata: { lingxiloop: { activity: { version: 1, id: 'ordinary', kind: 'tool', label: '执行步骤' } } } }
  const legacy = { type: 'text', text: '历史可见正文' }
  for (const content of [[tool, answer, legacy], [answer, tool, legacy]]) {
    const reply = { ...message('1'), status: { type: 'running' }, content } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
    assert.equal($('[data-message-region="body"]').text(), '首字历史可见正文')
    assert.equal($('[data-slot="run-activity"]').length, 1)
    assert.equal($('[data-message-region="body"] [data-native-part="tool-call"]').length, 0)
  }
})

// #304 review: strict data parts cannot carry activity annotations. A delivered
// artifact is still a result; citation metadata/process alone is not one.
test('partial and blocked replies retain delivered results and always expose one recovery status', () => {
  for (const outcome of ['partial', 'blocked'] as const) {
    for (const lifecycle of [outcome, 'succeeded'] as const) {
      for (const delivered of ['presentation', 'artifact', 'citations', 'process', 'text', 'empty'] as const) {
        const base = message('1')
        const content = delivered === 'presentation'
          ? [{ type: 'data', name: 'presentation-artifact', data: { artifactId: 'deck-304', artifactKind: 'lecture_deck_html', title: '已交付的演示稿' } }]
          : delivered === 'citations' ? [{ type: 'data', name: 'citation-claims', data: { claims: [] } }]
          : delivered === 'process' ? [{ type: 'text', text: '公开过程', providerMetadata: { lingxiloop: { activity: { version: 1, id: 'process-304', kind: 'commentary', label: '公开过程' } } } }]
          : delivered === 'text' ? [{ type: 'text', text: '保留的部分答复。' }] : []
        const harness = { ...createRunView('run'), lifecycle, requestVersion: 1,
          goalOutcome: { status: outcome, requestVersion: 1 },
          artifacts: delivered === 'artifact' ? [{ path: '/workspace/已交付.pdf', mime: 'application/pdf', size: 100, sha256: 'a'.repeat(64) }] : [] }
        const reply = { ...base, content: [...content, ...(delivered === 'empty' ? [] : [{ type: 'text', text: '过程记录', providerMetadata: { lingxiloop: { activity: { version: 1, id: 'process-status-304', kind: 'commentary', label: '过程记录' } } } }])], status: { type: 'incomplete', reason: 'other' },
          metadata: { ...base.metadata, custom: { ...getLingxiMessageMetadata(base), sequence: null, sourceRef: 'source-question', runId: 'run', harness } } } as ThreadMessage
        const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
        if (delivered === 'presentation' || delivered === 'artifact') {
          assert.match($.text(), /已交付/, `${outcome}/${delivered}`)
        }
        if (delivered === 'text') assert.match($('[data-message-region="body"]').text(), /保留的部分答复/)
        assert.equal($('[data-run-outcome]').length, 1, `${lifecycle}/${outcome}/${delivered}`)
        assert.equal($('[data-run-outcome]').attr('data-run-outcome'), outcome)
        assert.equal($('[data-run-outcome]').attr('role'), 'status')
        assert.equal($('[data-run-outcome][data-slot="error-state"]').length, 0)
        assert.match($('[data-run-outcome]').text(), /答复尚未完成/)
        assert.equal($('[data-run-outcome] button').text(), '重试')
      }
    }
  }
})

test('incomplete recovery honors lifecycle and version protections', () => {
  const base = message('1')
  const harness = { ...createRunView('run'), lifecycle: 'partial', requestVersion: 1, artifacts: [],
    goalOutcome: { status: 'partial', requestVersion: 1 } }
  const reply = { ...base, content: [], status: { type: 'incomplete', reason: 'other' },
    metadata: { ...base.metadata, custom: { ...getLingxiMessageMetadata(base), sequence: null, sourceRef: 'source-question', runId: 'run', harness } } } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.equal($('[data-run-outcome]').length, 1)
  for (const [lifecycle, status, version] of [
    ['cancelled', { type: 'incomplete', reason: 'cancelled' }, 1],
    ['failed', { type: 'incomplete', reason: 'error' }, 1],
    ['leased', { type: 'running' }, 1],
    ['waiting', { type: 'requires-action', reason: 'tool-calls' }, 1],
    ['succeeded', { type: 'complete', reason: 'stop' }, 1],
    ['partial', { type: 'incomplete', reason: 'other' }, 2],
    ['succeeded', { type: 'incomplete', reason: 'other' }, 2],
  ] as const) {
    const guarded = { ...reply, status, metadata: { ...reply.metadata, custom: { ...reply.metadata.custom,
      harness: { ...harness, lifecycle, requestVersion: version } } } } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[guarded]} />))
    assert.equal($('[data-run-outcome]').length, 0, `${lifecycle}/${version}`)
  }
})

// #353 failure model: duplicate knowledge status card, lost source outcomes,
// alias mismatch, stale ready overriding cancellation/unknown, or hidden reply.
test('knowledge results use one compact tool row while preserving source and terminal states', () => {
  for (const [sourceStatus, resultStatus, label] of [
    ['ready', 'completed', '已读取原文'], ['no_matches', 'completed', '没有匹配资料'],
    ['empty', 'completed', '资料没有可读正文'], ['processing', 'completed', '资料处理中'],
    ['unavailable', 'completed', '检索服务不可用'], ['ready', 'failed', '执行失败'],
    ['ready', 'cancelled', '已取消'], ['ready', 'unknown', '结果待核对'],
  ]) {
    const reply = { ...message('1'), content: [{ type: 'tool-call', toolCallId: 'reading', toolName: 'knowledge__read_source', args: {}, argsText: '',
      result: { status: resultStatus, sourceStatus, secretSourceText: 'PRIVATE_SOURCE_CANARY' } },
      { type: 'text', text: '正文及引用仍保留' }] } as ThreadMessage
    const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
    assert.equal($('[data-slot="tool-call"]').length, 1)
    assert.equal($('[data-slot="progress-tracker"]').length, 0)
    assert.match($('[data-slot="tool-call"] button').text(), new RegExp(label))
    assert.match($.text(), /正文及引用仍保留/)
    assert.doesNotMatch($.text(), /PRIVATE_SOURCE_CANARY/)
    if (sourceStatus === 'unavailable' || resultStatus === 'failed') assert.match($('[role="alert"]').text(), /这一步未完成/)
  }
})


test('each message render classifies its parts once and still places exactly one final footer', () => {
  const original = message('1', 'me')
  const reply = { ...original, content: Array.from({ length: 80 }, (_, index) => ({ type: 'text' as const, text: `part ${index}` })) } as ThreadMessage
  presentationCalls = 0
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.equal($('[data-native-part="text"]').length, 80)
  assert.equal($('[data-message-footer]').length, 1)
  assert.equal(presentationCalls, 1, 'footer consumers reuse their message owner classification')
})


test('latest streamed public observation is outside collapsed activity exactly once and survives replay', () => {
  const part = (id: string, text: string, order: number) => ({ type: 'text' as const, text,
    providerMetadata: { lingxiloop: { activity: { version: 1, id, kind: 'commentary', label: '公开说明', requestVersion: 1, order } } } })
  for (const status of [{ type: 'running' }, { type: 'requires-action', reason: 'tool-calls' }, { type: 'incomplete', reason: 'cancelled' }]) {
    const reply = { ...message('1'), status, content: [part('first', '已读取第一项。', 1),
      { type: 'text', text: 'TCP 提供有序可靠字节流；UDP 发送独立数据报。' }, part('latest', '两项读取均已完成，接下来保存演示。', 5)],
      metadata: { custom: { ...getLingxiMessageMetadata(message('1')), runId: 'run', activityPresentation: { version: 1 },
        harness: { ...createRunView('run'), requestVersion: 1, artifacts: [] } } } } as ThreadMessage
    const render = () => load(renderToStaticMarkup(<Preview messages={[reply]} />))
    for (const $ of [render(), render()]) {
      assert.equal($('[data-message-region="commentary"]').text(), '两项读取均已完成，接下来保存演示。')
      assert.doesNotMatch($('[data-slot="run-activity"]').text(), /两项读取均已完成/)
      assert.equal($.text().split('两项读取均已完成，接下来保存演示。').length - 1, 1)
      assert.equal($('[data-message-region="body"]').text(), 'TCP 提供有序可靠字节流；UDP 发送独立数据报。')
    }
  }
})
