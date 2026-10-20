import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import type { DeliveryPort, ModelCallObservation, WorkItem } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { recordModelCall } from '../agent-runtime/runtime.js'
import { createProductDelivery } from '../agent-runtime/delivery.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

const monitor = new Pool({ connectionString: process.env.INTEGRATION_DATABASE_URL, max: 2 })
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); recording = await installRecordingWukong() })
after(async () => { await monitor.end(); await teardownAll(); await recording.close() })
const context = (signal: AbortSignal) => ({ signal, deadlineAt: new Date(Date.now() + 2000).toISOString() })
async function until(check: () => Promise<boolean>, message: string) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await delay(10) }
  assert.fail(message)
}
async function fixture(room: string) {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const principalId = `human-${room}`
  await seedUserMembership(principalId, companyId, { role: 'STUDENT', isAdmin: false })
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'STUDENT')", [projectId,companyId,principalId])
  const members = [principalId,agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Callback test',$4::jsonb)", [room,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room,companyId,JSON.stringify({ channelType: 2,members })])
  const work = { id: `run-${room}`,tenantId: companyId,agentId,principalId,sessionId: room,requestVersion: 1,createdAt: new Date().toISOString(),
    fence: 1,homeEpoch: 1,kind: 'turn',lane: 'interactive',leaseToken: 'fixture',triggerRef: 'fixture',text: 'Ready.',
    conversation: { conversationId: room,policyVersion: 1,source: { messageId: 'fixture',version: 1 },internal: false,
      audience: { visibility: 'participants',participantIds: members } } } as WorkItem
  const feedback = { id: `feedback-${room}`,requestVersion: 1,status: 'cancelled',reason: 'cancelled',createdAt: new Date().toISOString(),
    rootWorkId: work.id,failedCount: 0,cancelledCount: 1,suppressAgentWake: true,
    notStartedCount: 0,notStartedAgentIds: [] } as Parameters<NonNullable<DeliveryPort['deliverTerminal']>>[1]
  const delivery = createProductDelivery(async () => ({ readTerminal: async () => ({ feedback }),readRun: async () => ({ requestVersion: 1 }) }) as never)
  const observation: ModelCallObservation = { callId: `call-${room}`,purpose: 'agent-turn',workId: work.id,tenantId: companyId,
    agentId,sessionId: room,model: 'synthetic-callback',latencyMs: 1,status: 'succeeded',usage: { available: true,inputTokens: 1,outputTokens: 1 },
    cost: { amountMicros: 1,usage: 'measured',pricing: { version: 'test',currency: 'USD',inputMicrosPerMillion: 1,outputMicrosPerMillion: 1 } } }
  return { companyId,projectId,agentId,principalId,work,feedback,delivery,observation }
}

test('usage, terminal and result callbacks share admission and release real blocked SQL after cancellation', async () => {
  const fixture = await fixtureForMixed()
  const blocker = await monitor.connect(), abort = new AbortController()
  await blocker.query('BEGIN'); await blocker.query('LOCK TABLE agent_run_bindings,participants IN ACCESS EXCLUSIVE MODE')
  const waiting = async () => (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
    WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`)).rows[0].n
  const tasks = [
    ...Array.from({ length: 4 }, () => recordModelCall(fixture.observation,context(abort.signal))),
    ...Array.from({ length: 2 }, () => fixture.delivery.deliverTerminal!(fixture.work,fixture.feedback,context(abort.signal))),
    ...Array.from({ length: 2 }, () => fixture.delivery.deliverMessage(fixture.work,{ body: 'Ready.' } as never,
      { ...context(abort.signal),commit: { resultId: 'result-fixture',fence: 1 } })),
  ]
  const settled = Promise.allSettled(tasks)
  try {
    await until(async () => await waiting() >= 2, 'callbacks never entered blocked SQL')
    await delay(50)
    assert.equal(await waiting(), 2, 'all callback types must share the same gate')
    assert.equal((await pool.query('SELECT 1 AS n')).rows[0].n, 1)
    abort.abort(new Error('callback fixture cancellation'))
    assert.ok((await settled).every(result => result.status === 'rejected'))
    await until(async () => await waiting() === 0, 'cancelled PostgreSQL statements survived')
    assert.equal(recording.messages.length, 0)
  } finally { abort.abort(); await blocker.query('ROLLBACK'); blocker.release(); await settled }
  await recordModelCall(fixture.observation)
  await recordModelCall(fixture.observation)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM llm_calls WHERE id=$1', [`lingxios-${fixture.observation.callId}`])).rows[0].n, 1)
})

async function fixtureForMixed() { return fixture('mixed-callbacks') }

test('deep permission lookup obeys deadline; revoked authorization remains strict; later delivery succeeds once', async () => {
  const f = await fixture('callback-permission'), blocker = await monitor.connect(), abort = new AbortController()
  await blocker.query('BEGIN'); await blocker.query('LOCK TABLE project_memberships IN ACCESS EXCLUSIVE MODE')
  const task = f.delivery.deliverTerminal!(f.work,f.feedback,context(abort.signal))
  const rejected = assert.rejects(task)
  try {
    await until(async () => (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%project_memberships%'`)).rows[0].n > 0,
    'deep permission query did not reach PostgreSQL')
    abort.abort(); await rejected
    await until(async () => (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'`)).rows[0].n === 0, 'permission SQL remained blocked')
  } finally { abort.abort(); await blocker.query('ROLLBACK'); blocker.release(); await rejected }
  await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [f.projectId,f.principalId])
  await assert.rejects(f.delivery.deliverTerminal!(f.work,f.feedback,context(new AbortController().signal)))
  assert.equal(recording.messages.length, 0)
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'STUDENT')", [f.projectId,f.companyId,f.principalId])
  await f.delivery.deliverTerminal!(f.work,f.feedback,context(new AbortController().signal))
  await f.delivery.deliverTerminal!(f.work,f.feedback,context(new AbortController().signal))
  assert.equal(recording.messages.length, 1)
})

test('cancelled IM acceptance write never sends and retry uses the same terminal nonce', async () => {
  const f = await fixture('callback-im-write'), blocker = await monitor.connect(), abort = new AbortController()
  // SHARE permits the earlier receipt SELECT but blocks INSERT/UPDATE.
  await blocker.query('BEGIN'); await blocker.query('LOCK TABLE im_send_acceptances IN SHARE MODE')
  const task = f.delivery.deliverTerminal!(f.work,f.feedback,context(abort.signal))
  const rejected = assert.rejects(task), before = recording.messages.length
  try {
    await until(async () => (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname=current_database()
      AND wait_event_type='Lock' AND query LIKE '%INSERT INTO im_send_acceptances%'`)).rows[0].n > 0, 'IM write never entered PostgreSQL')
    abort.abort(); await rejected
    await until(async () => (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'`)).rows[0].n === 0, 'cancelled IM write survived')
    assert.equal(recording.messages.length, before)
  } finally { abort.abort(); await blocker.query('ROLLBACK'); blocker.release(); await rejected }
  await f.delivery.deliverTerminal!(f.work,f.feedback,context(new AbortController().signal))
  await f.delivery.deliverTerminal!(f.work,f.feedback,context(new AbortController().signal))
  assert.equal(recording.messages.length, before + 1)
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM im_send_acceptances WHERE client_nonce=$1', [`terminal-${f.feedback.id}`])).rows[0].n, 1)
})

test('an IM send committed before cancellation reconciles its durable nonce without sending again', async () => {
  const f = await fixture('callback-im-unknown'), blocker = await monitor.connect(), abort = new AbortController()
  await monitor.query(`CREATE FUNCTION callback_block_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.status='accepted' THEN PERFORM pg_advisory_xact_lock(153162); END IF; RETURN NEW; END $$`)
  await monitor.query('CREATE TRIGGER callback_block_receipt BEFORE UPDATE ON im_send_acceptances FOR EACH ROW EXECUTE FUNCTION callback_block_receipt()')
  await blocker.query('SELECT pg_advisory_lock(153162)')
  const before = recording.messages.length
  const task = f.delivery.deliverTerminal!(f.work,f.feedback,context(abort.signal)), rejected = assert.rejects(task)
  try {
    await until(async () => recording.messages.length === before + 1 && (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%UPDATE im_send_acceptances%'`)).rows[0].n > 0,
    'send was not durably accepted before the receipt write blocked')
    abort.abort(); await rejected
    await until(async () => (await monitor.query(`SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname=current_database() AND wait_event_type='Lock'`)).rows[0].n === 0, 'receipt backend did not release')
    const stored = (await pool.query('SELECT status,error FROM im_send_acceptances WHERE client_nonce=$1', [`terminal-${f.feedback.id}`])).rows[0]
    assert.equal(stored.status, 'pending')
    assert.match(stored.error, /dispatch/i, 'pre-dispatch marker must survive the cancelled receipt update')
  } finally {
    abort.abort(); await blocker.query('SELECT pg_advisory_unlock_all()'); blocker.release(); await rejected
    await monitor.query('DROP TRIGGER callback_block_receipt ON im_send_acceptances'); await monitor.query('DROP FUNCTION callback_block_receipt()')
  }
  await f.delivery.deliverTerminal!(f.work,f.feedback,context(new AbortController().signal))
  await f.delivery.deliverTerminal!(f.work,f.feedback,context(new AbortController().signal))
  assert.equal(recording.messages.length, before + 1)
  assert.equal((await pool.query('SELECT status FROM im_send_acceptances WHERE client_nonce=$1', [`terminal-${f.feedback.id}`])).rows[0].status, 'accepted')
})
