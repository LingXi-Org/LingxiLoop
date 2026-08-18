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
  const { companyId, agentId } = await seedCompanyWithAgent()
  const startAt = '2026-06-01T10:00:00.000Z'

  const create = await runCli([
    '--as', agentId,
    'calendar', 'create', 'Review harness',
    '--at', startAt,
    '--assignee', agentId,
    '--prompt', 'Run the review',
    '--kind', 'agent_task',
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
    targetConversationId: null,
    startAt,
    recurrence: null,
    reminderMinutesBefore: 10,
    reminderChannel: 'toast',
    visibleToUser: true,
  }])

  const updatedAt = '2026-06-01T11:30:00.000Z'
  const update = await runCli([
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
    targetConversationId: null,
    startAt: updatedAt,
    visibleToUser: true,
  }])

  const cancel = await runCli(['--as', agentId, 'calendar', 'cancel', calendarEventId])
  assert.equal(cancel.ok, true, `calendar cancel failed: ${cancel.text}`)
  assert.deepEqual(cancel.sideEffects, [{
    event: 'calendar.event_cancelled',
    command: 'calendar cancel',
    calendarEventId,
    actorId: agentId,
    companyId,
    visibleToUser: true,
  }])

  const del = await runCli(['--as', agentId, 'calendar', 'delete', calendarEventId])
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
  const { companyId, agentId } = await seedCompanyWithAgent()

  const create = await runCli(['--as', agentId, 'doc', 'create', 'Harness Notes'])
  assert.equal(create.ok, true, `doc create failed: ${create.text}`)
  const documentId = String(create.sideEffects?.[0]?.documentId ?? '')
  assert.match(documentId, /^doc_/)

  const del = await runCli(['--as', agentId, 'doc', 'delete', documentId])
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

test('[integration] kanban board/column/comment parity emits typed CLI side effects', async () => {
  const { companyId, agentId } = await seedCompanyWithAgent()

  const create = await runCli(['--as', agentId, 'kanban', 'create', 'Ops Board', '--description', 'Initial'])
  assert.equal(create.ok, true, `kanban create failed: ${create.text}`)
  const boardId = String(create.sideEffects?.[0]?.boardId ?? '')
  assert.match(boardId, /^board-/)

  const rename = await runCli([
    '--as', agentId,
    'kanban', 'rename', boardId,
    '--title', 'Ops Board v2',
    '--description', 'Updated',
  ])
  assert.equal(rename.ok, true, `kanban rename failed: ${rename.text}`)
  assert.deepEqual(rename.sideEffects, [{
    event: 'kanban.board_updated',
    command: 'kanban rename',
    boardId,
    actorId: agentId,
    companyId,
    title: 'Ops Board v2',
    description: 'Updated',
    visibleToUser: true,
  }])

  const addColumn = await runCli(['--as', agentId, 'kanban', 'add-column', boardId, 'Review'])
  assert.equal(addColumn.ok, true, `kanban add-column failed: ${addColumn.text}`)
  const columnId = String(addColumn.sideEffects?.[0]?.columnId ?? '')
  assert.match(columnId, /^col-/)

  const editColumn = await runCli([
    '--as', agentId,
    'kanban', 'edit-column', boardId, columnId,
    '--title', 'QA',
    '--position', '2500',
  ])
  assert.equal(editColumn.ok, true, `kanban edit-column failed: ${editColumn.text}`)
  assert.deepEqual(editColumn.sideEffects, [{
    event: 'kanban.column_updated',
    command: 'kanban edit-column',
    boardId,
    columnId,
    actorId: agentId,
    companyId,
    title: 'QA',
    position: 2500,
    visibleToUser: true,
  }])

  const addCard = await runCli(['--as', agentId, 'card', 'add', boardId, 'Check harness', '--column', columnId])
  assert.equal(addCard.ok, true, `card add failed: ${addCard.text}`)
  const cardId = String(addCard.sideEffects?.[0]?.cardId ?? '')
  assert.match(cardId, /^card-/)

  const comment = await runCli(['--as', agentId, 'card', 'comment', cardId, 'Looks good'])
  assert.equal(comment.ok, true, `card comment failed: ${comment.text}`)
  const commentId = String(comment.sideEffects?.[0]?.commentId ?? '')
  assert.match(commentId, /^cmt-/)

  const deleteComment = await runCli(['--as', agentId, 'card', 'delete-comment', cardId, commentId])
  assert.equal(deleteComment.ok, true, `card delete-comment failed: ${deleteComment.text}`)
  assert.deepEqual(deleteComment.sideEffects, [{
    event: 'kanban.comment_deleted',
    command: 'card delete-comment',
    boardId,
    cardId,
    commentId,
    actorId: agentId,
    companyId,
    visibleToUser: true,
  }])

  const deleteColumn = await runCli(['--as', agentId, 'kanban', 'delete-column', boardId, columnId])
  assert.equal(deleteColumn.ok, true, `kanban delete-column failed: ${deleteColumn.text}`)
  assert.deepEqual(deleteColumn.sideEffects, [{
    event: 'kanban.column_deleted',
    command: 'kanban delete-column',
    boardId,
    columnId,
    actorId: agentId,
    companyId,
    visibleToUser: true,
  }])
})
