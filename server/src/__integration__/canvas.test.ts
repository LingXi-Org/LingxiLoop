import { after, before, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'
import { executeLearningAction } from '../agent-os/learning-actions.js'
import { pool } from '../db/pool.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

function action(work: AgentWorkItem, name: string, args: Record<string, unknown>, index: number): HostAction {
  return {
    runId: work.id,
    cellId: 'canvas-cell',
    callIndex: index,
    action: name,
    args,
    idempotencyKey: `${work.id}:canvas-cell:${index}`,
  }
}

test('[integration] canvas.* shares durable frames without sharing Agent execution state', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent({ agentId: 'canvas-agent' })
  const work: AgentWorkItem = {
    id: 'canvas-work', fence: 1, companyId, agentId, channelId: 'canvas-channel',
    triggerClientMsgNo: 'canvas-trigger', reason: 'message', leaseToken: 'test-lease',
  }

  await pool.query(`UPDATE participants SET capabilities='["canvas"]'::jsonb WHERE id=$1 AND company_id=$2`, [agentId, companyId])
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id) VALUES ($1,'direct','Canvas test',$2::jsonb,$3)`,
    [work.channelId, JSON.stringify([agentId]), companyId],
  )
  const started = await executeLearningAction(work, action(work, 'canvas.start_workspace', {
    title: 'Shared learning task', goal: 'Build and revise a durable shared plan',
    members: [{ agentId, assignment: 'Create the shared plan' }],
  }, 0))
  assert.equal(started.ok, true)
  const canvasId = (started.value as { id: string }).id

  const empty = await executeLearningAction(work, action(work, 'canvas.get', { canvasId }, 1))
  assert.equal(empty.ok, true)
  assert.deepEqual((empty.value as { frames: unknown[] }).frames, [])

  const created = await executeLearningAction(work, action(work, 'canvas.create_frame', {
    canvasId,
    type: 'markdown', title: 'Plan', x: 120, y: 80, width: 480, height: 300,
    content: '# Shared plan', data: { source: 'agent' },
  }, 2))
  assert.equal(created.ok, true)
  const frame = created.value as { id: string; revision: number; content: string }
  assert.match(frame.id, /^frame-/)
  assert.equal(frame.revision, 1)

  const updated = await executeLearningAction(work, action(work, 'canvas.update_frame', {
    frameId: frame.id, x: 260, y: 180, width: 520,
  }, 3))
  assert.equal(updated.ok, true)
  assert.equal((updated.value as { x: number }).x, 260)

  const appended = await executeLearningAction(work, action(work, 'canvas.append_content', {
    frameId: frame.id, content: '\n\nAgent B can see this.',
  }, 4))
  assert.equal(appended.ok, true)
  assert.match((appended.value as { content: string }).content, /Agent B can see this/)

  const status = await executeLearningAction(work, action(work, 'canvas.set_status', {
    canvasId, status: 'working on the plan', frameId: frame.id,
  }, 5))
  assert.equal(status.ok, true)
  assert.equal((status.value as { participantId: string }).participantId, agentId)

  const snapshot = await executeLearningAction(work, action(work, 'canvas.get', { canvasId }, 6))
  assert.equal(snapshot.ok, true)
  const shared = snapshot.value as { frames: Array<{ id: string }>; presence: Array<{ participantId: string }>; activity: unknown[] }
  assert.equal(shared.frames[0]?.id, frame.id)
  assert.equal(shared.presence[0]?.participantId, agentId)
  assert.ok(shared.activity.length >= 3)

  const deleted = await executeLearningAction(work, action(work, 'canvas.delete_frame', { frameId: frame.id }, 7))
  assert.equal(deleted.ok, true)
  const afterDelete = await executeLearningAction(work, action(work, 'canvas.get', { canvasId }, 8))
  assert.deepEqual((afterDelete.value as { frames: unknown[] }).frames, [])
})
