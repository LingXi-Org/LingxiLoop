import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../db/pool.js'
import {
  ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll,
} from './_helpers.js'
import { runCli } from '../agents/cli.js'

before(async () => {
  await ensureSchemaOnce()
})

beforeEach(async () => {
  await resetAllTables()
})

after(async () => {
  await teardownAll()
})

test('[integration] tasks add/set emit typed CLI side effects', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()

  const add = await runCli(['--as', agentId, 'tasks', 'add', 'Ship typed side effects'])
  assert.equal(add.ok, true, `tasks add failed: ${add.text}`)
  assert.equal(add.sideEffects?.length, 1)
  const taskId = String(add.sideEffects?.[0]?.taskId ?? '')
  assert.match(taskId, /^task-/)
  assert.deepEqual(add.sideEffects, [{
    event: 'task.created',
    command: 'tasks add',
    taskId,
    agentId,
    companyId,
    title: 'Ship typed side effects',
    status: 'open',
    visibleToUser: true,
  }])

  const set = await runCli(['--as', agentId, 'tasks', 'set', taskId, 'done'])
  assert.equal(set.ok, true, `tasks set failed: ${set.text}`)
  assert.deepEqual(set.sideEffects, [{
    event: 'task.status_changed',
    command: 'tasks set',
    taskId,
    agentId,
    companyId,
    status: 'done',
    visibleToUser: true,
  }])
})

test('[integration] calendar create/cancel/delete emit typed CLI side effects', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const runProjectCli = (args: string[]) => runCli(args, { projectId })
  const startAt = '2026-06-01T10:00:00.000Z'
  const targetConversationId = `co-${companyId}`
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,company_id,project_id)
     VALUES ($1,'group','Review room',$2::jsonb,$3,$4)`,
    [targetConversationId, JSON.stringify([agentId]), companyId, projectId],
  )

  const create = await runProjectCli([
    '--as', agentId,
    'calendar', 'create', 'Review harness',
    '--at', startAt,
    '--assignee', agentId,
    '--prompt', 'Run the review',
    '--kind', 'agent_task',
    '--in', targetConversationId,
    '--remind', '10',
    '--remind-channel', 'toast',
  ])
  assert.equal(create.ok, true, `calendar create failed: ${create.text}`)
  assert.equal(create.sideEffects?.length, 1)
  const calendarEventId = String(create.sideEffects?.[0]?.calendarEventId ?? '')
  assert.match(calendarEventId, /^ce-/)
  assert.deepEqual(create.sideEffects, [{
    event: 'calendar.event_created',
    command: 'calendar create',
    calendarEventId,
    actorId: agentId,
    companyId,
    title: 'Review harness',
    kind: 'agent_task',
    assigneeId: agentId,
    targetConversationId,
    startAt,
    recurrence: null,
    reminderMinutesBefore: 10,
    reminderChannel: 'toast',
    visibleToUser: true,
  }])

  const updatedAt = '2026-06-01T11:30:00.000Z'
  const update = await runProjectCli([
    '--as', agentId,
    'calendar', 'update', calendarEventId,
    '--title', 'Review harness deeply',
    '--at', updatedAt,
    '--status', 'active',
  ])
  assert.equal(update.ok, true, `calendar update failed: ${update.text}`)
  assert.deepEqual(update.sideEffects, [{
    event: 'calendar.event_updated',
    command: 'calendar update',
    calendarEventId,
    actorId: agentId,
    companyId,
    title: 'Review harness deeply',
    kind: 'agent_task',
    status: 'active',
    assigneeId: agentId,
    targetConversationId,
    startAt: updatedAt,
    visibleToUser: true,
  }])

  const cancel = await runProjectCli(['--as', agentId, 'calendar', 'cancel', calendarEventId])
  assert.equal(cancel.ok, true, `calendar cancel failed: ${cancel.text}`)
  assert.deepEqual(cancel.sideEffects, [{
    event: 'calendar.event_cancelled',
    command: 'calendar cancel',
    calendarEventId,
    actorId: agentId,
    companyId,
    visibleToUser: true,
  }])

  const del = await runProjectCli(['--as', agentId, 'calendar', 'delete', calendarEventId])
  assert.equal(del.ok, true, `calendar delete failed: ${del.text}`)
  assert.deepEqual(del.sideEffects, [{
    event: 'calendar.event_deleted',
    command: 'calendar delete',
    calendarEventId,
    actorId: agentId,
    companyId,
    visibleToUser: true,
  }])
})

test('[integration] doc delete emits typed CLI side effect and removes the document', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const runProjectCli = (args: string[]) => runCli(args, { projectId })

  const create = await runProjectCli(['--as', agentId, 'doc', 'create', 'Harness Notes'])
  assert.equal(create.ok, true, `doc create failed: ${create.text}`)
  const documentId = String(create.sideEffects?.[0]?.documentId ?? '')
  assert.match(documentId, /^doc_/)

  const del = await runProjectCli(['--as', agentId, 'doc', 'delete', documentId])
  assert.equal(del.ok, true, `doc delete failed: ${del.text}`)
  assert.deepEqual(del.sideEffects, [{
    event: 'document.deleted',
    command: 'doc delete',
    documentId,
    actorId: agentId,
    companyId,
    visibleToUser: true,
  }])

  const { rowCount } = await pool.query(`SELECT 1 FROM documents WHERE id = $1`, [documentId])
  assert.equal(rowCount, 0)
})
