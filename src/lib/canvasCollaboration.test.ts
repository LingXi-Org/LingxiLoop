import assert from 'node:assert/strict'
import test from 'node:test'
import type { CanvasActivity, CanvasAgentAssignment } from '@/types'
import { canvasActivityLabel, canvasAssignmentProgress, formatCanvasDuration, isCanvasAssignmentActive } from './canvasCollaboration'

function assignment(status: CanvasAgentAssignment['status']): CanvasAgentAssignment {
  return { id: status, canvasId: 'c', agentId: status, assignment: status, color: '#000', status, workArea: { x: 0, y: 0, width: 10, height: 10 }, activeFrameId: null, cursor: null, workId: null, dependsOnAgentIds: [], result: null, error: null, startedAt: null, completedAt: null, updatedAt: '2026-01-01T00:00:00.000Z' }
}

test('calculates useful progress for parallel work', () => {
  assert.equal(canvasAssignmentProgress([assignment('completed'), assignment('working'), assignment('blocked')]), 50)
})

test('distinguishes active and terminal assignments', () => {
  assert.equal(isCanvasAssignmentActive('waiting'), true)
  assert.equal(isCanvasAssignmentActive('failed'), false)
})

test('formats live and completed durations', () => {
  assert.equal(formatCanvasDuration('2026-01-01T00:00:00.000Z', null, Date.parse('2026-01-01T00:05:30.000Z')), '5分钟')
  assert.equal(formatCanvasDuration('2026-01-01T00:00:00.000Z', '2026-01-01T02:15:00.000Z'), '2小时 15分钟')
})

test('turns persisted activity into human narration', () => {
  const activity: CanvasActivity = { id: 'a', canvasId: 'c', frameId: null, actorId: 'agent', actorKind: 'agent', action: 'agent.status', detail: { status: '正在检查窄屏布局' }, createdAt: '2026-01-01T00:00:00.000Z' }
  assert.equal(canvasActivityLabel(activity), '状态更新：正在检查窄屏布局')
})
