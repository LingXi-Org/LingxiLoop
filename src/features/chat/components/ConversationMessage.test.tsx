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
import { PollCard } from '@/components/assistant-ui/elements/poll-card'
mock.module('./ToolRenderers', { namedExports: { CHAT_TOOL_RENDERERS: { by_name: {
  'poll-form': () => <PollCard title="投票" options={[{ value: 'a', label: 'A' }]} multiple={false} submitted={false} closed={false} value={[]} onChange={() => {}} onSubmit={() => {}} />,
} }, isVisibleChatPart: (part: { type: string; toolName?: string }) => part.type === 'text' || part.type === 'source' || part.toolName === 'poll-form' } })
mock.module('../runtime/transport', { namedExports: { ChatTransport: class {}, chatTransport: {}, filterThreadMessages: (messages: ThreadMessage[]) => messages } })
mock.module('@/stores/auth', { namedExports: { useAuth: create(() => ({ user: null })), getMeId: () => null, getActiveCompanyId: () => null } })
const { useParticipants } = await import('@/features/agents/state')
const { ConversationMessage } = await import('./ConversationMessage')

const participants: Record<string, Participant> = {
  agent: { id: 'agent', kind: 'agent', name: '测试助手', initial: '助', avatarBg: 'transparent', status: 'avail' },
  human: { id: 'human', kind: 'human', name: '其他成员', initial: '人', avatarBg: 'transparent', status: 'avail' },
}
useParticipants.setState({ byId: participants })

function message(id: string, sender = 'agent', attachment = false) {
  return convertEnvelope({ channelId: 'room', channelType: 2, fromUid: sender, clientMsgNo: id,
    messageId: id, messageSeq: Number(id), timestamp: 1_767_225_600 + Number(id),
    payload: { version: 1, kind: attachment ? 'attachment' : 'text', clientMsgNo: id, body: attachment ? '' : `正文${id}`,
      ...(attachment ? { data: { name: '报告.pdf', url: 'https://example.com/report.pdf', kind: 'pdf', mime: 'application/pdf' } } : {}) },
  }, { participants, meId: 'me' })
}

function Preview({ messages }: { messages: ThreadMessage[] }) {
  const runtime = useExternalStoreRuntime({ messages: projectMessageGroups(messages),
    isRunning: messages.some(message => message.status?.type === 'running'), onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message: ConversationMessage }} /></AssistantRuntimeProvider>
}

test('memory metadata does not expose summaries in conversation messages', () => {
  const reply = message('1')
  const metadata = getLingxiMessageMetadata(reply)
  metadata.runId = 'run'
  metadata.harness = { ...createRunView('run'), lifecycle: 'succeeded' }
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
    assert.equal($(sender === 'me' ? '[data-message-bubble="user"] time' : '.im-markdown-bubble time').length, 1)
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
    const harness = { ...createRunView('run'), lifecycle: running ? 'leased' as const : 'succeeded' as const,
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
  assert.equal($('.im-markdown-bubble').last().find('time').length, 1)
  assert.equal($('[data-slot="attachment-card"] time').length, 0)
  const poll = { ...message('2'), content: [{ type: 'tool-call', toolCallId: 'poll', toolName: 'poll-form', args: {}, argsText: '{}' }] } as ThreadMessage
  $ = load(renderToStaticMarkup(<Preview messages={[poll]} />))
  assert.equal($('[data-slot="poll-card"] time').length, 1)
  assert.equal($('time').length, 1)
  mixed.metadata.custom.timestampMissing = true
  $ = load(renderToStaticMarkup(<Preview messages={[mixed]} />))
  assert.equal($('time').length, 0)
  assert.ok($.text().includes('最后一段'))
})
