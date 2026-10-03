import { createNativeMessage } from '@/lib/nativeMessage'
import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { AssistantRuntimeProvider, ThreadPrimitive, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { renderToStaticMarkup } from 'react-dom/server'
import { convertEnvelope, projectMessageGroups } from '../runtime/converter'
import { getLingxiMessageMetadata } from '../runtime/model'
import { create } from 'zustand'
import type { Participant } from '@/types'
import { load } from 'cheerio'
mock.module('../../canvas/components/CanvasArtifactCard', { namedExports: { CanvasArtifactCard: () => null } })
mock.module('./ConversationComposer', { namedExports: { ConversationComposer: () => null } })
mock.module('../runtime/transport', { namedExports: { ChatTransport: class {}, chatTransport: {}, filterThreadMessages: (messages: ThreadMessage[]) => messages } })
mock.module('@/stores/auth', { namedExports: { useAuth: create(() => ({ user: null })), getMeId: () => null, getActiveCompanyId: () => null } })
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

// Failure cases: the real thread filters out v2 messages; settled tools spin forever;
// approvals disappear in collapsed groups; mixed content loses order or repeats its footer.
test('the real conversation thread displays native v2 messages', () => {
  function ThreadPreview() {
    const runtime = useExternalStoreRuntime({ messages: [message('1')], onNew: async () => {} })
    return <AssistantRuntimeProvider runtime={runtime}><ConversationThread conversationId="room" readOnly /></AssistantRuntimeProvider>
  }
  assert.match(renderToStaticMarkup(<ThreadPreview />), /正文1/)
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
    assert.equal($('time').length, 1)
  }
})

test('adjacent ordinary tools group in place while rich results stay visible', () => {
  const tool = (id: string) => ({ type: 'tool-call' as const, toolCallId: id, toolName: 'fixture.tool', args: {}, argsText: '{}', result: { ok: true } })
  const reply = { ...message('1'), content: [{ type: 'text', text: '开始正文' }, tool('one'), tool('two'),
    { type: 'tool-call', toolCallId: 'calendar', toolName: 'calendar.list', args: {}, argsText: '{}', result: { status: 'completed', value: { events: [], truncated: false } } },
    { type: 'text', text: '最后正文' }] } as ThreadMessage
  const $ = load(renderToStaticMarkup(<Preview messages={[reply]} />))
  assert.equal($('[data-slot="tool-group-root"]').length, 1)
  assert.match($.text(), /2 项工具调用/)
  assert.match($.text(), /暂无安排/)
  assert.equal($('time').length, 1)
  assert.match($('[data-agent-body]').last().text(), /最后正文/)
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
  assert.equal($('time').length, 1)
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
  assert.match(html, /正文1/)
})

test('text timestamps sit at the bottom right for every sender and attachments omit time', () => {
  for (const sender of ['agent', 'human', 'me']) {
    const html = renderToStaticMarkup(<Preview messages={[message('1', sender, true), message('2', sender)]} />)
    const $ = load(html)
    if (sender !== 'me') assert.equal((html.match(new RegExp(`class="font-medium">${participants[sender].name}`, 'g')) ?? []).length, 1)
    assert.equal($('time').length, 1)
    assert.equal($('[data-slot="attachment-card"] time').length, 0)
    assert.equal($(sender === 'agent' ? '[data-agent-body] time' : '[data-message-bubble] time').length, 1)
    assert.equal($('[data-message-footer][data-align="end"]').length, 1)
  }
})

test('attachments retain delivery feedback without a timestamp', () => {
  for (const delivery of ['sending', 'failed'] as const) {
    const attachment = message('1', 'me', true)
    attachment.metadata.custom.delivery = delivery
    const $ = load(renderToStaticMarkup(<Preview messages={[attachment]} />))
    assert.equal($('time').length, 0)
    assert.ok($('[data-slot="attachment-card"]').text().includes(delivery === 'sending' ? '发送中…' : '发送失败'))
  }
})

test('running replies reserve their footer and successful completion shows a timestamp without a completion label', () => {
  for (const running of [true, false]) {
    const reply = message('1')
    const harness = { ...createRunView('run'), artifacts: [], lifecycle: running ? 'leased' as const : 'succeeded' as const,
      goalOutcome: { status: 'satisfied' as const, requestVersion: 1, verification: 'passed' as const } }
    const messages = [{ ...reply, status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
      metadata: { ...reply.metadata, custom: { ...getLingxiMessageMetadata(reply), runId: 'run', harness } },
    } as ThreadMessage]
    const html = renderToStaticMarkup(<Preview messages={messages} />)
    assert.equal(html.includes('data-message-footer'), !running)
    assert.equal(html.includes('<time '), !running)
    assert.doesNotMatch(html, /已完成/)
  }
})

test('mixed content ends with one internal timestamp and missing timestamps remain hidden', () => {
  const attachment = message('1', 'agent', true)
  const mixed = { ...attachment, content: [...attachment.content, { type: 'text', text: '第一段\n\n最后一段' }] } as ThreadMessage
  let $ = load(renderToStaticMarkup(<Preview messages={[mixed]} />))
  assert.equal($('time').length, 1)
  assert.equal($('[data-agent-body]').last().find('time').length, 1)
  assert.equal($('[data-slot="attachment-card"] time').length, 0)
  const poll = { ...message('2'), content: [{ type: 'data', name: 'poll', data: { poll: { question: '投票', mode: 'single', options: [{ id: 'a',text: 'A' }] }, pollTallies: [] } }] } as ThreadMessage
  $ = load(renderToStaticMarkup(<Preview messages={[poll]} />))
  assert.equal($('[data-slot="poll-card"] time').length, 1)
  assert.equal($('time').length, 1)
  mixed.metadata.custom.timestampMissing = true
  $ = load(renderToStaticMarkup(<Preview messages={[mixed]} />))
  assert.equal($('time').length, 0)
  assert.ok($.text().includes('最后一段'))
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
      assert.match($('[data-agent-body]').attr('class') ?? '', /text-\[14px\]/)
    }
  }
})
