import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Plan } from '@/components/tool-ui/plan'
import { ProgressTracker } from '@/components/tool-ui/progress-tracker'
import type { ImEnvelope } from '@/lib/im/wukong'
import { canvasProgress, handoffProgress, knowledgeProgress, missionPlan } from './task-progress'
import { convertEnvelope, convertEnvelopeBatch } from './converter'
import { mergeCanonicalMessages } from './store'
import { getLingxiMessageMetadata } from './model'
import { harnessToolParts } from './harness'

const names = { nova: { name: '司南' }, sage: { name: '明理' }, trace: { name: '溯源' } }
const at = '2026-09-21T08:00:00.000Z'

test('official ToolUI renders persisted Mission steps and actual handoff outcomes', () => {
  const plan = missionPlan({ id: 'mission', goal: '完成实践', coordinatorAgentId: 'nova', status: 'ACTIVE',
    steps: [{ id: 'check', description: '检查产出', successCriteria: '可复现', status: 'IN_PROGRESS' },
      { id: 'reflect', description: '反思', status: 'OPEN' }] }, names)
  assert.deepEqual(plan.todos.map(todo => todo.status), ['in_progress','pending'])
  assert.match(renderToStaticMarkup(<Plan {...plan} />), /data-tool-ui-id="mission"/)
  const handoff = { id: 'handoff', fromAgentId: 'nova', toAgentId: 'sage', title: '验证概念', updatedAt: at }
  const accepted = handoffProgress({ ...handoff,status: 'accepted' }, names)
  assert.equal(accepted.steps[0].status, 'pending')
  assert.equal(accepted.choice, undefined)
  for (const [status,outcome] of [['completed','success'],['failed','failed'],['cancelled','cancelled']] as const) {
    const progress = handoffProgress({ ...handoff,status }, names)
    assert.equal(progress.choice?.outcome,outcome)
    assert.match(renderToStaticMarkup(<ProgressTracker {...progress} />), /data-receipt="true"/)
  }
  const canvas = canvasProgress({ id: 'canvas', status: 'summarizing', coordinatorAgentId: 'nova',
    assignments: [{ id: 'builder',agentId: 'sage',task: '验证概念',status: 'completed' },
      { id: 'verifier',agentId: 'trace',task: '复核',status: 'failed',executionRole: 'verifier' }] }, names)
  assert.deepEqual(canvas.steps.map(step => step.status), ['completed','failed','in-progress'])
})

test('reordered and repeated business snapshots restore one current message with its IM anchor', () => {
  for (const kind of ['handoff','learning_mission','canvas'] as const) {
    const event = (version: number, sequence: number): ImEnvelope => ({ channelId: 'room',channelType: 2,fromUid: 'nova',
      messageId: `im-${sequence}`, clientMsgNo: `nonce-${sequence}`,messageSeq: sequence,timestamp: Date.parse(at),
      payload: { version: 1,kind,clientMsgNo: `nonce-${sequence}`,refs: { handoffId: 'business' },data: {
        id: 'business',missionId: 'business',canvasId: 'business',progressVersion: version,goal: `v${version}`,title: `v${version}`,
        fromAgentId: 'nova',toAgentId: 'sage',assignments: [],status: version === 3 ? 'completed' : 'working',
      } } })
    const context = { participants: {},meId: null }, first = event(1,10), latest = event(3,12), stale = event(2,15)
    const batch = convertEnvelopeBatch([latest,first,stale,latest],context)
    const live = mergeCanonicalMessages([convertEnvelope(first,context)], [convertEnvelope(latest,context),convertEnvelope(stale,context)])
    for (const result of [batch,live,mergeCanonicalMessages(live,batch)]) {
      assert.equal(result.length,1)
      assert.equal(result[0].id,'im-10')
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
  assert.equal(knowledgeProgress('run',live,'leased','寻知')?.steps[0].status,'in-progress')
  const restored = harnessToolParts('run',events)
  assert.equal(JSON.stringify(restored).includes('never retain'),false)
  assert.deepEqual(harnessToolParts('run',[...events].reverse()),restored)
  assert.deepEqual(harnessToolParts('run',[{ ...events[1],seq: 1,data: { ...events[1].data,result: { status: 'failed' } } }],restored),restored)
  assert.deepEqual(knowledgeProgress('run',restored,'succeeded','寻知'),knowledgeProgress('run',harnessToolParts('run',events,restored),'succeeded','寻知'))
  const progress = knowledgeProgress('run',restored,'succeeded','寻知')!
  assert.match(renderToStaticMarkup(<ProgressTracker {...progress} />),/没有匹配资料/)
})
