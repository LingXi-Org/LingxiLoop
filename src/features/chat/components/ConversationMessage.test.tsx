import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { AssistantRuntimeProvider, ThreadPrimitive, type ThreadMessage, useExternalStoreRuntime } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { renderToStaticMarkup } from 'react-dom/server'
import { convertEnvelope, projectMessageGroups } from '../runtime/converter'
import { getLingxiMessageMetadata } from '../runtime/model'
import { create } from 'zustand'
import type { Participant } from '@/types'
mock.module('./ToolRenderers', { namedExports: { CHAT_TOOL_RENDERERS: {} } })
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

test('other senders keep one top avatar/name and one bottom timestamp across attachment and text clusters', () => {
  for (const sender of ['agent', 'human']) {
    const html = renderToStaticMarkup(<Preview messages={[message('1', sender, true), message('2', sender)]} />)
    assert.equal((html.match(new RegExp(`class="font-medium">${participants[sender].name}`, 'g')) ?? []).length, 1)
    assert.equal((html.match(/<time /g) ?? []).length, 1)
    assert.ok(html.indexOf('<time ') > html.indexOf('正文2'))
    assert.match(html, /shrink-0 w-10 items-start/)
    assert.doesNotMatch(html, /items-end pb-5|data-chat-agent-status/)
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
    assert.match(html, /data-message-footer/)
    assert.equal(html.includes('<time '), !running)
    assert.doesNotMatch(html, /已完成/)
  }
})
