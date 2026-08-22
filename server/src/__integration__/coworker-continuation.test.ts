import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { createHandoff, requestApproval, updateHandoff } from '../agents/coworker.js'
import { resumeApprovedContinuation } from '../agents/turn.js'
import { pool } from '../db/pool.js'
import { CH_MESSAGE_NEW, redis } from '../redis.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

async function seedCoworkers() {
  const { companyId, agentId: source } = await seedCompanyWithAgent()
  const target = `a-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1,$2,'agent','Specialist','specialist','S','#abcdef','avail')`,
    [target, companyId],
  )
  const conversationId = `c-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, tag, company_id)
     VALUES ($1,'group','Hero Demo',$2::jsonb,'group',$3)`,
    [conversationId, JSON.stringify([source, target]), companyId],
  )
  return { companyId, source, target, conversationId }
}

test('[integration] Demo C approval resumes blocked plus remaining actions on the same run and restores lifecycle', async () => {
  const { companyId, source: agentId, conversationId } = await seedCoworkers()
  const runId = `run-${randomUUID()}`
  const inputScopeKey = `scope-${randomUUID()}`
  const blockedAction = { type: 'message.send', conversationId, body: 'approved side effect' }
  const remainingAction = { type: 'message.send', conversationId, body: 'continuation completed' }
  await pool.query(
    `INSERT INTO agent_runs (id, agent_id, company_id, trigger, status, stage)
     VALUES ($1,$2,$3,'{}'::jsonb,'waiting_for_human','waiting_for_human')`,
    [runId, agentId, companyId],
  )
  await pool.query(`UPDATE participants SET status = 'waiting' WHERE id = $1 AND company_id = $2`, [agentId, companyId])
  const approval = await requestApproval({
    companyId, agentId, conversationId, runId, actionKey: `action-${randomUUID()}`, actionIndex: 0,
    blockedAction, remainingActions: [remainingAction], inputScopeKey,
    kind: 'financial_or_irreversible_action', summary: 'Approve exact continuation',
    payload: { action: blockedAction },
  })
  await pool.query(`UPDATE agent_approvals SET status = 'approved', resolved_at = NOW() WHERE id = $1`, [approval.id])

  const resumed = await resumeApprovedContinuation(approval.id)
  assert.deepEqual(resumed, { resumed: true })
  const messages = await pool.query<{ body: string }>(
    `SELECT body FROM messages WHERE conversation_id = $1 AND body IN ($2,$3) ORDER BY sequence`,
    [conversationId, blockedAction.body, remainingAction.body],
  )
  assert.deepEqual(messages.rows.map((row) => row.body), [blockedAction.body, remainingAction.body])
  const run = await pool.query<{ status: string; finished_at: Date | null }>(`SELECT status, finished_at FROM agent_runs WHERE id = $1`, [runId])
  assert.equal(run.rows[0].status, 'completed')
  assert.ok(run.rows[0].finished_at)
  const participant = await pool.query<{ status: string }>(
    `SELECT status FROM participants WHERE id = $1 AND company_id = $2`, [agentId, companyId],
  )
  assert.equal(participant.rows[0].status, 'avail')
})

test('[integration] Demo A terminal handoff creates one durable result and triggers the source owner', async () => {
  const { companyId, source, target, conversationId } = await seedCoworkers()
  const subscriber = redis.duplicate()
  const delivered: Array<Record<string, unknown>> = []
  await subscriber.subscribe(CH_MESSAGE_NEW)
  subscriber.on('message', (_channel, raw) => delivered.push(JSON.parse(raw) as Record<string, unknown>))
  try {
    const idempotencyKey = `handoff-${randomUUID()}`
    const handoff = await createHandoff({
      companyId, conversationId, fromAgentId: source, toAgentId: target,
      title: 'Research competitor', idempotencyKey,
    })
    const duplicateMentionWake = await createHandoff({
      companyId, conversationId, fromAgentId: source, toAgentId: target,
      title: 'Research competitor', idempotencyKey,
    })
    assert.equal(duplicateMentionWake.sourceMessageId, handoff.sourceMessageId)
    const sourceRows = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM messages WHERE id = $1`, [handoff.sourceMessageId],
    )
    assert.equal(sourceRows.rows[0].count, '1', 'handoff + duplicate mention must persist one activation message')
    const first = await updateHandoff({ companyId, handoffId: handoff.id, actorAgentId: target, status: 'completed', note: 'done' })
    const replay = await updateHandoff({ companyId, handoffId: handoff.id, actorAgentId: target, status: 'completed', note: 'done' })
    assert.equal(replay.resultMessageId, first.resultMessageId)
    const rows = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM messages WHERE id = $1`, [first.resultMessageId],
    )
    assert.equal(rows.rows[0].count, '1')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const terminalEvents = delivered.filter((event) => {
      const message = event.message as Record<string, unknown> | undefined
      return message?.id === first.resultMessageId
    })
    assert.ok(terminalEvents.length >= 1)
    for (const event of terminalEvents) {
      const message = event.message as Record<string, unknown>
      assert.equal(message.activation, 'trigger')
      assert.deepEqual(message.mentionedIds, [source])
    }
    assert.equal(new Set(terminalEvents.map((event) => (event.message as Record<string, unknown>).id)).size, 1)
  } finally {
    subscriber.disconnect()
  }
})
