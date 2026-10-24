import { createNativeMessage } from '@/lib/nativeMessage'
import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImEnvelope } from '@/lib/im/wukong'
import { canvasProgress, knowledgeSourceState } from './task-progress'
import { convertEnvelope, convertEnvelopeBatch } from './converter'
import { mergeCanonicalMessages } from './store'
import { getLingxiMessageMetadata } from './model'

import { harnessToolParts } from '../../../../server/src/agent-runtime/message-projection'

const names = { nova: { name: '司南' }, sage: { name: '明理' }, trace: { name: '溯源' } }
const at = '2026-09-21T08:00:00.000Z'

test('official ToolUI renders persisted Canvas outcomes', () => {
  const canvas = canvasProgress({ id: 'canvas', status: 'summarizing', coordinatorAgentId: 'nova',
    assignments: [{ id: 'builder',agentId: 'sage',task: '验证概念',status: 'completed' },
      { id: 'verifier',agentId: 'trace',task: '复核',status: 'failed',executionRole: 'verifier' }] }, names)
  assert.deepEqual(canvas.steps.map(step => step.status), ['completed','failed','in-progress'])
})

test('reordered and repeated business snapshots restore one current message with its IM anchor', () => {
  for (const kind of ['handoff','learning-mission','canvas'] as const) {
    const event = (version: number, sequence: number): ImEnvelope => ({ channelId: 'room',channelType: 2,fromUid: 'nova',
      messageId: `im-${sequence}`, clientMsgNo: `nonce-${sequence}`,messageSeq: sequence,timestamp: Date.parse(at),
      payload: createNativeMessage({ id: `${kind}:business`, role: 'assistant', createdAt: at, custom: { progressVersion: version, refs: { handoffId: 'business' } }, content: [{ type: 'data', name: kind, data: {
        id: 'business',missionId: 'business',canvasId: 'business',progressVersion: version,goal: `v${version}`,title: `v${version}`,
        fromAgentId: 'nova',toAgentId: 'sage',assignments: [],status: version === 3 ? 'completed' : 'working',
      } }] }) })
    const context = { participants: {},meId: null }, first = event(1,10), latest = event(3,12), stale = event(2,15)
    const batch = convertEnvelopeBatch([latest,first,stale,latest],context)
    const live = mergeCanonicalMessages([convertEnvelope(first,context)], [convertEnvelope(latest,context),convertEnvelope(stale,context)])
    for (const result of [batch,live,mergeCanonicalMessages(live,batch)]) {
      assert.equal(result.length,1)
      assert.equal(result[0].id,`${kind}:business`)
      assert.equal(getLingxiMessageMetadata(result[0]).clientMessageId,'nonce-10')
      assert.equal(getLingxiMessageMetadata(result[0]).sequence,10)
      assert.equal(getLingxiMessageMetadata(result[0]).progress?.version,3)
      const toolIdentities = (message: typeof result[0]) => message.content.flatMap(part => part.type === 'tool-call'
        ? [{ toolCallId: part.toolCallId,id: part.args.id }] : [])
      assert.deepEqual(toolIdentities(result[0]),toolIdentities(convertEnvelope(first,context)))
      assert.match(JSON.stringify(result[0].content),/v3/)
    }
  }
})

test('retrieval progress replays real host events without storing source contents', () => {
  const events = [
    { runId: 'run',seq: 1,kind: 'tool.started',stage: 'started' as const,visibility: 'user' as const,data: { toolCallId: 'host:search',name: 'knowledge.search' } },
    { runId: 'run',seq: 2,kind: 'tool.completed',stage: 'completed' as const,visibility: 'user' as const,data: {
      toolCallId: 'host:search',result: { status: 'completed',value: { status: 'no_matches',secretSourceText: 'never retain' } } } },
  ]
  const live = harnessToolParts('run',events.slice(0,1))
  assert.equal(knowledgeSourceState(live[0].toolName,live[0].result),undefined)
  const restored = harnessToolParts('run',events)
  assert.equal(JSON.stringify(restored).includes('never retain'),false)
  assert.deepEqual(harnessToolParts('run',[...events].reverse()),restored)
  assert.deepEqual(harnessToolParts('run',[{ ...events[1],seq: 1,data: { ...events[1].data,result: { status: 'failed' } } }],restored),restored)
  const replayed = harnessToolParts('run',events,restored)
  assert.deepEqual(knowledgeSourceState(restored[0].toolName,restored[0].result),knowledgeSourceState(replayed[0].toolName,replayed[0].result))
  assert.deepEqual(knowledgeSourceState(restored[0].toolName,restored[0].result),{ status: 'no_matches',label: '没有匹配资料' })
  assert.equal(knowledgeSourceState('fixture.tool',{ sourceStatus: 'ready' }),undefined)
  assert.equal(knowledgeSourceState('knowledge.search',{ sourceStatus: '__proto__' }),undefined)
})
