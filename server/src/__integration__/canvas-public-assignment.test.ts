import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { pool } from '../db/pool.js'
import { startNativeEventWorker } from '../agents/native-event-worker.js'
import { ensureConversationCanvas, assignCanvasWorkspaceWork, stopCanvasAssignment } from '../modules/canvas/facade.js'
import { nativeText } from '../im/message-types.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { loadCanvasRunContext } from '../modules/canvas/runtime.js'
import { createCanvasTools } from '../modules/canvas/agent-tools.js'
import { createProductContext } from '../agent-runtime/context.js'
import { NoEffectError, type ActionContext } from '@lyyzka/lingxios'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure cases: hidden execution, stale queued assignments after replacement/stop,
// or a departed user's pending message surviving readmission.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await recording.close(); await teardownAll() })

test('human Canvas assignments publish only the current authorized ordinary group message', { timeout: 60000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(`UPDATE participants SET capabilities='["canvas"]'::jsonb WHERE id=$1`, [agentId])
  const channelId = 'human-assignment-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)`,
    [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  await ensureConversationCanvas(companyId, channelId, 'test-owner')
  const canvasId = (await pool.query('SELECT id FROM canvases WHERE conversation_id=$1', [channelId])).rows[0].id
  await pool.query("UPDATE canvases SET status='active' WHERE id=$1", [canvasId])
  const assign = (assignment: string) => assignCanvasWorkspaceWork({ companyId, canvasId, agentId, actorId: 'test-owner', actorKind: 'user', assignment })
  await assign('obsolete')
  await assign('current')
  assert.equal((await pool.query('SELECT 1 FROM agent_run_bindings')).rowCount, 0)
  async function flush() {
    const worker = startNativeEventWorker(), deadline = Date.now() + 12000
    try {
      while ((await pool.query('SELECT 1 FROM agent_native_event_outbox WHERE delivered_at IS NULL AND failed_at IS NULL')).rowCount) {
        assert.ok(Date.now() < deadline, 'native events did not drain')
        await delay(50)
      }
    } finally { await worker.stop() }
  }
  await flush()
  assert.equal(recording.messages.length, 1)
  const message = recording.messages[0]
  assert.equal(message.fromUid, 'test-owner')
  assert.equal(message.payload.role, 'user')
  assert.match(nativeText(message.payload), new RegExp('^@' + agentId + ' .*current$'))
  const accepted = await receiveAgentRequest({ companyId, agentId, channelId, clientMsgNo: message.clientMsgNo })
  assert.ok('runs' in accepted && accepted.runs.length === 1)
  const control = await lingxiOSControl()
  const work = await control.connectWorker({ workerId: 'canvas-delayed-claim', workKinds: ['turn'] }).claimWork()
  assert.ok(work)
  const tools = createCanvasTools(lingxiOSControl), context = createProductContext(tools)
  const methods = async () => (await context.capabilityResolver.resolve(work)).find(grant => grant.name === 'canvas')?.methods ?? []
  assert.ok((await methods()).includes('submit_report'))
  assert.ok(!(await methods()).includes('submit_verification'))
  const actionContext = (action: string) => ({ work,database: pool,signal: AbortSignal.timeout(10000),
    deadlineAt: new Date(Date.now()+10000).toISOString(),requestVersion: 1,
    action: { runId: work.id,cellId: 'role-preflight',callIndex: 0,idempotencyKey: 'role-preflight',action,args: {} } }) as unknown as ActionContext
  const ordinary = tools.find(tool => tool.action === 'canvas.submit_report')!
  const verification = tools.find(tool => tool.action === 'canvas.submit_verification')!
  const denied = (error: unknown) => error instanceof NoEffectError && error.code === 'forbidden'
  await ordinary.authorize(actionContext(ordinary.action),{})
  await assert.rejects(verification.authorize(actionContext(verification.action),{}),denied)
  await pool.query("UPDATE canvas_agent_assignments SET execution_role='verifier' WHERE work_id=$1",[work.id])
  await pool.query("UPDATE canvas_agent_runs SET execution_role='verifier' WHERE work_id=$1",[work.id])
  assert.ok(!(await methods()).includes('submit_report'))
  assert.ok((await methods()).includes('submit_verification'))
  await verification.authorize(actionContext(verification.action),{})
  await assert.rejects(ordinary.authorize(actionContext(ordinary.action),{}),denied)
  // Replacement and stop must also fence an already admitted, not yet bound turn.
  await assign('cancelled')
  await assert.rejects(loadCanvasRunContext(pool, work), /cancelled or replaced/)
  await stopCanvasAssignment({ companyId, canvasId, agentId })
  await assert.rejects(loadCanvasRunContext(pool, work), /cancelled or replaced/)
  await flush()
  assert.equal(recording.messages.length, 1)
  await assign('cancelled again')
  await stopCanvasAssignment({ companyId, canvasId, agentId })
  await flush()
  assert.equal(recording.messages.length, 1)
  await assign('revoked before readmission')
  await pool.query('UPDATE users SET access_revoked_at=NOW() WHERE id=$1', ['test-owner'])
  await flush()
  assert.equal(recording.messages.length, 1)
})
