import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantRuntimeProvider, ThreadPrimitive, useAuiState, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage } from '@/lib/nativeMessage'
import { load } from 'cheerio'
import { convertEnvelope, projectMessageGroups } from '../runtime/converter'
import type { LingxiMessageMetadata } from '../runtime/model'
import type { Participant } from '@/types'

mock.module('@/components/Avatar', { namedExports: { Avatar: ({ p, animated }: { p: Participant; animated: boolean }) =>
  <svg role="img" aria-label={p.name} data-avatar-motion={animated ? 'active' : 'static'} /> } })
const { ConversationMessageAvatar, isMessageAvatarActive } = await import('./ConversationMessageAvatar')
const agent: Participant = { id: 'agent', kind: 'agent', name: '测试助手', initial: '助', avatarBg: 'transparent', status: 'working' }
function message(id: string, lifecycle: 'leased' | 'succeeded' | 'queued' | 'waiting' = 'succeeded', extra = {}): ThreadMessage {
  const initial = convertEnvelope({ channelId: 'room', channelType: 2, fromUid: 'agent', clientMsgNo: id, messageId: id,
    messageSeq: Number(id), timestamp: 1_767_225_600 + Number(id), payload: createNativeMessage({ id, role: 'assistant', content: [{ type: 'text', text: '合成正文' }] }) },
  { participants: { agent }, meId: 'human' })
  const runId = `run-${id}`
  return { ...initial, status: lifecycle === 'succeeded' ? { type: 'complete', reason: 'stop' } : { type: 'running' },
    metadata: { ...initial.metadata, custom: { ...initial.metadata.custom, runId,
      harness: { ...createRunView(runId), lifecycle, artifacts: [] }, ...extra } } } as ThreadMessage
}
function Row() {
  const metadata = useAuiState(state => state.message.metadata.custom) as LingxiMessageMetadata
  return <ConversationMessageAvatar participant={agent} isMobile={false} isMine={false} groupStart={metadata.groupStart} groupEnd={metadata.groupEnd} />
}
function Preview({ messages }: { messages: ThreadMessage[] }) {
  const runtime = useExternalStoreRuntime({ messages, onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message: Row }} /></AssistantRuntimeProvider>
}

test('historical and unconfirmed states stay static despite global participant working presence', () => {
  for (const lifecycle of ['succeeded', 'queued', 'waiting'] as const) {
    assert.equal(isMessageAvatarActive([message('1', lifecycle)], 0), false)
  }
  for (const runConnection of ['checking', 'released', 'inaccessible', 'missing', 'unauthenticated'] as const) {
    assert.equal(isMessageAvatarActive([message('1', 'leased', { runConnection })], 0), false)
  }
  assert.equal(isMessageAvatarActive([message('1', 'leased', { runId: 'different-run' })], 0), false)
  assert.equal(isMessageAvatarActive([message('1', 'leased', { harness: undefined })], 0), false)
  const $ = load(renderToStaticMarkup(<Preview messages={[message('1')]} />))
  assert.equal($('[data-avatar-motion="static"]').length, 1)
  assert.equal($('.bloub-activity-working').length, 0)
})
test('a real running reply keeps the existing same-group anchor active, then settles it', () => {
  const messages = projectMessageGroups([message('1'), message('2', 'leased')])
  assert.equal(messages[1].metadata.custom.groupStart, false, 'the existing grouping is preserved')
  assert.equal(isMessageAvatarActive(messages, 0), true)
  const $ = load(renderToStaticMarkup(<Preview messages={messages} />))
  assert.equal($('[data-avatar-motion="active"]').length, 1)
  assert.equal($('.bloub-activity-working').length, 1)
  assert.equal($('[role="img"]').attr('aria-label'), agent.name)
  assert.equal(isMessageAvatarActive(projectMessageGroups([message('1'), message('2')]), 0), false)
})
test('an unrelated later group cannot animate history or scan beyond its boundary', () => {
  const first = message('1')
  const later = message('2', 'leased')
  const messages = [first, later]
  assert.equal(first.metadata.custom.groupEnd, true)
  assert.equal(isMessageAvatarActive(messages, 0), false)
  assert.equal(isMessageAvatarActive(messages, 1), true)
})
