import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ApprovalSnapshot } from '@lyyzka/lingxios'
import { approvalView } from '../agent-runtime/approval-public-view.js'

const approval = (patch: Partial<ApprovalSnapshot> = {}): ApprovalSnapshot => ({ approvalId: 'a', runId: 'r', agentId: 'agent', tenantId: 't',
  sessionId: 's', principalId: 'p', requestVersion: 3, actionKey: 'key', toolContractHash: null,
  action: 'documents.delete', args: { secret: 'PRIVATE' }, preview: { title: '拓扑方案', revision: 4, bodySha256: 'PRIVATE' },
  decision: null, createdAt: '2026-10-24', decidedAt: null, result: null, ...patch })

test('approval public view separates granted decisions from execution and strips raw runtime data', () => {
  assert.equal(approvalView(approval()).status, 'PENDING')
  assert.equal(approvalView(approval({ decision: false })).status, 'REJECTED')
  assert.equal(approvalView(approval({ decision: true })).status, 'APPROVED')
  for (const [result, status] of [[{ ok: false, executionState: 'unknown' }, 'UNKNOWN'], [{ ok: true }, 'EXECUTED'],
    [{ ok: false, executionState: 'awaiting_approval' }, 'APPROVED'], [{ ok: false }, 'FAILED']] as const) {
    assert.equal(approvalView(approval({ decision: true, result: result as ApprovalSnapshot['result'] })).status, status)
  }
  const view = approvalView(approval())
  assert.deepEqual(view.context, [{ label: '文档', value: '拓扑方案' }, { label: '核准版本', value: '4' }, { label: '具体变化', value: '删除这份文档' }])
  assert.equal(view.runId, 'r'); assert.equal(view.scope.requestVersion, 3)
  assert.doesNotMatch(JSON.stringify(view), /PRIVATE|args|bodySha256|principalId/)
})

test('reviewed producers publish scope and effect without inventing unknown business fields', () => {
  const source = approvalView(approval({ action: 'knowledge.set_source_enabled', preview: { enabled: false,
    source: { title: '网络资料', visibility_scope: 'PROJECT', external_source_id: 'PRIVATE' } } }))
  assert.deepEqual(source.context.map(item => item.value), ['网络资料', '当前课程共享资料', '在当前对话中停用资料'])
  const routine = approvalView(approval({ action: 'routines.create', preview: { title: '复习', schedule: { time: '08:00' },
    timezone: 'Asia/Shanghai', instructions: 'PRIVATE', principalId: 'PRIVATE' } }))
  assert.match(JSON.stringify(routine.context), /暂停状态/)
  assert.doesNotMatch(JSON.stringify(routine), /PRIVATE/)
  assert.deepEqual(approvalView(approval({ action: 'future.tool', preview: { title: 'PRIVATE', count: 99 } })).context, [])
  assert.doesNotMatch(JSON.stringify(approvalView(approval({ preview: { title: '<analysis>PRIVATE</analysis>' } }))), /PRIVATE/)
})
