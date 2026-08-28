import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { executeLearningAction } from '../agent-os/learning-actions.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'
import { handoffCanvasWork, stopCanvasAssignment } from '../modules/canvas/index.js'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { installFakeWukong(); await resetAllTables() })
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
  const { agentId: targetAgentId } = await seedCompanyWithAgent({ companyId, agentId: 'canvas-target' })
  const work: AgentWorkItem = {
    id: 'canvas-work', fence: 1, companyId, agentId, channelId: 'canvas-channel',
    triggerClientMsgNo: 'canvas-trigger', reason: 'message', executionRole:'coordinator',lane: 'learner', leaseToken: 'test-lease',
  }

  await pool.query(`UPDATE participants SET capabilities='["canvas"]'::jsonb WHERE id=ANY($1::text[]) AND company_id=$2`, [[agentId, targetAgentId], companyId])
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id) VALUES ($1,'group','Canvas test',$2::jsonb,$3)`,
    [work.channelId, JSON.stringify([agentId, targetAgentId]), companyId],
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

  const handedOff = await executeLearningAction(work, action(work, 'canvas.handoff', {
    canvasId,
    toAgentId: targetAgentId,
    task: 'Review the shared plan and add verification steps',
    context: 'The initial structure is complete; verify the assumptions.',
    frameIds: [frame.id],
  }, 7))
  assert.equal(handedOff.ok, true)
  const handoffValue = handedOff.value as {
    snapshot: { assignments: Array<{ agentId: string }>; activity: Array<{ action: string }> }
    activity: { action: string; detail: { fromAgentId: string; toAgentId: string; frameIds: string[] } }
  }
  assert.ok(handoffValue.snapshot.assignments.some((item) => item.agentId === targetAgentId))
  assert.equal(handoffValue.activity.action, 'handoff')
  assert.equal(handoffValue.activity.detail.fromAgentId, agentId)
  assert.equal(handoffValue.activity.detail.toAgentId, targetAgentId)
  assert.deepEqual(handoffValue.activity.detail.frameIds, [frame.id])

  const handedOffAgain = await executeLearningAction(work, action(work, 'canvas.handoff', {
    canvasId,
    toAgentId: targetAgentId,
    task: 'Review the shared plan and add verification steps',
    context: 'The initial structure is complete; verify the assumptions.',
    frameIds: [frame.id],
  }, 7))
  assert.equal((handedOffAgain.value as { activity: { id: string } }).activity.id, (handedOff.value as { activity: { id: string } }).activity.id)
  assert.equal((await pool.query(
    `SELECT 1 FROM agent_work_items WHERE canvas_id=$1 AND canvas_assignment_id=(
       SELECT id FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2
     )`, [canvasId, targetAgentId],
  )).rowCount, 1)
  const activeTargetHandoff = await handoffCanvasWork({
    companyId, canvasId, fromAgentId: agentId, toAgentId: targetAgentId,
    task: 'Validate the plan against the supplied sources',
    context: 'Use the acceptance criteria and surface any missing evidence.',
    frameIds: [frame.id], idempotencyKey: `${work.id}:canvas-active-target`,
  })
  assert.equal(activeTargetHandoff.activity.action, 'handoff')
  const { rows: steeredWork } = await pool.query<{ steer_inputs: Array<{ text: string }> }>(
    `SELECT steer_inputs FROM agent_work_items WHERE canvas_id=$1 AND agent_id=$2`, [canvasId, targetAgentId],
  )
  const deliveredSteer = steeredWork[0]?.steer_inputs.at(-1)?.text ?? ''
  assert.match(deliveredSteer, /acceptance criteria/)
  assert.match(deliveredSteer, new RegExp(frame.id))

  // A successful handoff may be retried after the workspace advances while
  // the caller has not received its original response.
  await pool.query(`UPDATE canvases SET status='completed' WHERE id=$1`, [canvasId])
  const replayed = await handoffCanvasWork({
    companyId, canvasId, fromAgentId: agentId, toAgentId: targetAgentId,
    task: 'Review the shared plan and add verification steps',
    context: 'The initial structure is complete; verify the assumptions.',
    frameIds: [frame.id], idempotencyKey: `${work.id}:canvas-cell:7`,
  })
  assert.equal(replayed.activity.id, (handedOff.value as { activity: { id: string } }).activity.id)
  await pool.query(`UPDATE canvases SET status='active' WHERE id=$1`, [canvasId])

  // Fail exactly at the durable activity write. A process crash at this
  // boundary has the same PostgreSQL outcome: the prior work/assignment
  // mutations must roll back with the transaction.
  await pool.query(`CREATE OR REPLACE FUNCTION test_canvas_stop_activity_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cancellation activity failure'; END $$`)
  await pool.query(`CREATE TRIGGER test_canvas_stop_activity_failure BEFORE INSERT ON canvas_activity FOR EACH ROW WHEN (NEW.action = 'task_cancelled') EXECUTE FUNCTION test_canvas_stop_activity_failure()`)
  try {
    await assert.rejects(stopCanvasAssignment({ companyId, canvasId, agentId: targetAgentId }), /test cancellation activity failure/)
    assert.equal((await pool.query(`SELECT status FROM agent_work_items WHERE canvas_id=$1 AND agent_id=$2`, [canvasId, targetAgentId])).rows[0]?.status, 'queued')
    assert.equal((await pool.query(`SELECT status FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2`, [canvasId, targetAgentId])).rows[0]?.status, 'queued')
  } finally {
    await pool.query(`DROP TRIGGER test_canvas_stop_activity_failure ON canvas_activity`)
    await pool.query(`DROP FUNCTION test_canvas_stop_activity_failure()`)
  }

  await stopCanvasAssignment({ companyId, canvasId, agentId: targetAgentId })
  assert.equal((await pool.query(
    `SELECT 1 FROM canvas_activity WHERE canvas_id=$1 AND actor_id=$2 AND action='task_cancelled'`,
    [canvasId, targetAgentId],
  )).rowCount, 1)

  const deleted = await executeLearningAction(work, action(work, 'canvas.delete_frame', { frameId: frame.id }, 8))
  assert.equal(deleted.ok, true)
  const afterDelete = await executeLearningAction(work, action(work, 'canvas.get', { canvasId }, 9))
  assert.deepEqual((afterDelete.value as { frames: unknown[] }).frames, [])
})
