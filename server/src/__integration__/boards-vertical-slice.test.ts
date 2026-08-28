import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { BoardApplication, BoardApplicationError } from '../modules/boards/application.js'
import type { BoardEventInput } from '../modules/boards/contracts.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const USER = 'u-board-slice'
const COMPANY = 'co-board-slice'
const PROJECT = 'project-board-slice'
const OTHER_COMPANY = 'co-board-other'
const OTHER_PROJECT = 'project-board-other'
const AGENT = 'agent-board-slice'
const FOREIGN_AGENT = 'agent-board-foreign'

const events: BoardEventInput[] = []
const wakes: string[] = []
const application = new BoardApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  publish: async (event) => { events.push(event) },
  enqueueAgent: async (work) => { wakes.push(work.agentId) },
})

const scope = { userId: USER, companyId: COMPANY, projectId: PROJECT }

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => {
  await resetAllTables()
  events.length = 0
  wakes.length = 0
  await pool.query(
    `INSERT INTO users (id,email,display_name) VALUES ($1,'board@example.com','Board Owner')`,
    [USER],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug,owner_user_id) VALUES
       ($1,'Board Slice','board-slice',$3),($2,'Board Other','board-other',$3)`,
    [COMPANY, OTHER_COMPANY, USER],
  )
  await pool.query(
    `INSERT INTO company_members (company_id,user_id,role) VALUES ($1,$3,'owner'),($2,$3,'owner')`,
    [COMPANY, OTHER_COMPANY, USER],
  )
  await pool.query(
    `INSERT INTO projects (id,company_id,name,color,created_by,is_general) VALUES
       ($1,$2,'Board Project','#000',$5,FALSE),($3,$4,'Other Project','#111',$5,FALSE)`,
    [PROJECT, COMPANY, OTHER_PROJECT, OTHER_COMPANY, USER],
  )
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,initial,avatar_bg,status) VALUES
       ($1,$2,'human','Board Owner','B','#000','avail'),
       ($3,$2,'agent','Agent Board','A','#111','avail'),
       ($4,$5,'agent','Foreign Agent','F','#222','avail')`,
    [USER, COMPANY, AGENT, FOREIGN_AGENT, OTHER_COMPANY],
  )
})
after(async () => { await teardownAll() })

test('[integration] board creation is atomic and concurrent card appends keep ordered positions', async () => {
  const board = await application.createBoard(scope, { title: 'Strict Board' })
  const snapshot = await application.snapshot(scope, board.id)
  assert.deepEqual(snapshot.columns.map((column) => column.title), ['Todo', 'Doing', 'Done'])
  const columnId = snapshot.columns[0].id
  const cards = await Promise.all([
    application.createCard(scope, board.id, {
      columnId, title: 'Ask @Agent Board', assigneeId: AGENT,
    }),
    application.createCard(scope, board.id, { columnId, title: 'Second card' }),
  ])
  assert.deepEqual(cards.map((card) => card.position).sort((left, right) => left - right), [1000, 2000])
  assert.deepEqual(cards[0].mentions, [AGENT])
  assert.equal(wakes.includes(AGENT), true)
  const persisted = await application.snapshot(scope, board.id)
  assert.equal(persisted.cards.length, 2)
})

test('[integration] board and card lookup never cross company/project ownership', async () => {
  const board = await application.createBoard(scope, { title: 'Tenant Board' })
  const snapshot = await application.snapshot(scope, board.id)
  const card = await application.createCard(scope, board.id, {
    columnId: snapshot.columns[0].id, title: 'Tenant Card',
  })
  const foreignScope = { userId: USER, companyId: OTHER_COMPANY, projectId: OTHER_PROJECT }
  await assert.rejects(
    application.snapshot(foreignScope, board.id),
    (error) => error instanceof BoardApplicationError && error.code === 'not_found',
  )
  await assert.rejects(
    application.card(foreignScope, card.id),
    (error) => error instanceof BoardApplicationError && error.code === 'not_found',
  )
})

test('[integration] card assignee and mentions stay inside the owning company', async () => {
  const board = await application.createBoard(scope, { title: 'Assignee Board' })
  const snapshot = await application.snapshot(scope, board.id)
  await assert.rejects(
    application.createCard(scope, board.id, {
      columnId: snapshot.columns[0].id,
      title: `Do not wake @${FOREIGN_AGENT}`,
      assigneeId: FOREIGN_AGENT,
    }),
    (error) => error instanceof BoardApplicationError && error.code === 'not_found',
  )
  assert.equal(wakes.includes(FOREIGN_AGENT), false)
  assert.equal((await application.snapshot(scope, board.id)).cards.length, 0)
})

test('[integration] comment creation persists mentions and publishes one typed event', async () => {
  const board = await application.createBoard(scope, { title: 'Comment Board' })
  const snapshot = await application.snapshot(scope, board.id)
  const card = await application.createCard(scope, board.id, {
    columnId: snapshot.columns[0].id, title: 'Discuss',
  })
  events.length = 0
  wakes.length = 0
  const comment = await application.addComment(scope, board.id, card.id, 'Please review @Agent Board')
  assert.deepEqual(comment.mentions, [AGENT])
  assert.deepEqual((await application.comments(scope, board.id, card.id)).map((row) => row.id), [comment.id])
  assert.equal(events.length, 1)
  assert.equal(events[0]?.kind, 'comment.created')
  assert.deepEqual(wakes, [AGENT])
})
