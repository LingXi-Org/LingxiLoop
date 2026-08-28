import { randomUUID, } from 'node:crypto'
import { type Request, Router } from 'express'
import { enqueueAgentWork } from '../../agent-os/enqueue.js'
import type {
  AuthedRequest,
} from '../../auth.js'
import { pool } from '../../db/pool.js'
import { HttpError } from '../../http/errors.js'
import { requireCompanyArtifactContext, } from '../../http/request-context.js'

export const boardsRouter = Router()
const api = boardsRouter

/* ============== Kanban boards ==============
 *
 * AI-native: every endpoint here is just as useful from the desktop
 * client as it is from an agent's `lingxiloop board` / `lingxiloop card` CLI
 * subcommand. Auth + tenant scoping is the same shape as the rest of
 * this file — `requireCompany(req)` gates the caller into a single
 * workspace, and every row already carries `company_id` (boards) or is
 * reachable only through one (columns/cards/comments).
 *
 * Mentions: `@<participant_id>` or `@<display name>` tokens in card
 * title/description and comment bodies are parsed at write-time. The
 * deduped id list is stored on the row + echoed onto the broadcast event
 * so toasters can chime for the named recipients without re-parsing prose.
 * Both human ids and agent ids resolve identically — first-class for both.
 */

type MentionTarget = { id: string; name: string }

function mentionStartBoundary(text: string, index: number): boolean {
  if (index <= 0) return true
  return !/[\w@]/.test(text[index - 1])
}

function mentionEndBoundary(text: string, index: number): boolean {
  const next = text[index]
  return !next || !/[a-z0-9_-]/i.test(next)
}

function parseMentionTargets(text: string, targets: MentionTarget[]): string[] {
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()
  const candidates = targets
    .flatMap((p) => [
      { id: p.id, token: p.id },
      { id: p.id, token: p.name.trim() },
    ])
    .filter((candidate) => candidate.token.length > 0)
    .sort((a, b) => b.token.length - a.token.length)
  const lower = text.toLowerCase()

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@' || !mentionStartBoundary(text, i)) continue
    const rest = lower.slice(i + 1)
    const match = candidates.find((candidate) =>
      rest.startsWith(candidate.token.toLowerCase()) &&
      mentionEndBoundary(text, i + 1 + candidate.token.length)
    )
    if (!match) continue
    const id = match.id
    if (id === 'all') continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    i += match.token.length
  }
  return out
}

/** Extract mention ids from prose. Display-name mentions are resolved against
 *  active participants in the current company so the stored payload remains
 *  stable even though users see friendly names in the editor. */
async function parseMentions(companyId: string, text: string): Promise<string[]> {
  const { rows } = await pool.query<MentionTarget>(
    `SELECT id, name
       FROM participants
      WHERE company_id = $1
        AND departed_at IS NULL`,
    [companyId],
  )
  return parseMentionTargets(text, rows)
}

/** Resolve a board id → companyId after verifying the caller is in that
 *  company. Throws 404 if the board doesn't exist OR lives in another
 *  tenant — kept opaque so a probing client can't enumerate cross-tenant
 *  board ids. */
async function requireBoardAccess(req: Request & AuthedRequest, boardId: string, writable = false): Promise<{ userId: string; companyId: string; projectId: string }> {
  const { userId, companyId, projectId } = await requireCompanyArtifactContext(req, writable)
  const { rows } = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM boards WHERE id = $1 AND company_id = $2 AND project_id = $3 LIMIT 1`,
    [boardId, companyId, projectId],
  )
  if (!rows[0] || rows[0].company_id !== companyId) throw new HttpError(404, 'not found')
  return { userId, companyId, projectId }
}

async function publishBoardEvent(args: {
  companyId: string
  kind: import('../../redis.js').BoardEvent['kind']
  boardId: string
  cardId?: string
  columnId?: string
  commentId?: string
  mentions?: string[]
  actorId?: string
  workspaceId?: string
}): Promise<void> {
  const workspaceId = args.workspaceId ?? (await pool.query<{ project_id: string }>(
    `SELECT project_id FROM boards WHERE id=$1 AND company_id=$2 LIMIT 1`,
    [args.boardId, args.companyId],
  )).rows[0]?.project_id
  const { CH_BOARDS, publish } = await import('../../redis.js')
  await publish(CH_BOARDS, {
    type: 'board.changed',
    companyId: args.companyId,
    workspaceId,
    kind: args.kind,
    boardId: args.boardId,
    cardId: args.cardId,
    columnId: args.columnId,
    commentId: args.commentId,
    mentions: args.mentions,
    actorId: args.actorId,
  })
}

/** For each id in `mentions` that resolves to an agent participant in
 *  this workspace (and isn't the actor themselves), wake their pod. The
 *  human side of the @-list is left alone — humans pick up mentions via
 *  the WS event + the Boards UI chip. */
async function wakeMentionedAgents(args: {
  companyId: string
  mentions: string[] | undefined
  actorId: string
}): Promise<void> {
  if (!args.mentions || args.mentions.length === 0) return
  const targets = args.mentions.filter((id) => id !== args.actorId)
  if (targets.length === 0) return
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM participants
      WHERE kind = 'agent'
        AND company_id = $1
        AND id = ANY($2::text[])
        AND departed_at IS NULL`,
    [args.companyId, targets],
  )
  if (rows.length === 0) return
  for (const r of rows) {
    await enqueueAgentWork({ companyId: args.companyId, agentId: r.id, reason: 'mention' })
  }
}

/** GET /boards — list every board in the active workspace. */
api.get('/boards', async (req, res) => {
  const { companyId, projectId } = await requireCompanyArtifactContext(req)
  const { rows } = await pool.query<{
    id: string; title: string; description: string | null
    created_by: string; created_at: string; updated_at: string
  }>(
    `SELECT id, title, description, created_by, created_at, updated_at
       FROM boards WHERE company_id = $1 AND project_id = $2 ORDER BY updated_at DESC`,
    [companyId, projectId],
  )
  res.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })))
})

/** GET /cards/:id — resolve a card id back to its board + column. Agents
 *  often mention the card they just created, and the chat renderer needs
 *  this lookup to open the right board peek without forcing agents to also
 *  spell out the board id in prose. */
api.get('/cards/:id', async (req, res) => {
  const { companyId, projectId } = await requireCompanyArtifactContext(req)
  const cardId = req.params.id
  const { rows } = await pool.query<{
    id: string
    board_id: string
    column_id: string
    title: string
    description: string | null
    position: number
    assignee_id: string | null
    mentions: string[]
    created_by: string
    created_at: string
    updated_at: string
    board_title: string
    board_description: string | null
    board_created_by: string
    board_created_at: string
    board_updated_at: string
    column_title: string
    column_position: number
    column_created_at: string
    comment_count: number
  }>(
    `SELECT c.id, c.board_id, c.column_id, c.title, c.description, c.position,
            c.assignee_id, c.mentions, c.created_by, c.created_at, c.updated_at,
            b.title AS board_title, b.description AS board_description,
            b.created_by AS board_created_by, b.created_at AS board_created_at,
            b.updated_at AS board_updated_at,
            col.title AS column_title, col.position AS column_position,
            col.created_at AS column_created_at,
            (SELECT COUNT(*)::int FROM board_card_comments cc WHERE cc.card_id = c.id) AS comment_count
       FROM board_cards c
       JOIN boards b ON b.id = c.board_id
       JOIN board_columns col ON col.id = c.column_id
      WHERE c.id = $1 AND b.company_id = $2 AND b.project_id = $3
      LIMIT 1`,
    [cardId, companyId, projectId],
  )
  const r = rows[0]
  if (!r) throw new HttpError(404, 'not found')
  res.json({
    board: {
      id: r.board_id,
      title: r.board_title,
      description: r.board_description,
      createdBy: r.board_created_by,
      createdAt: r.board_created_at,
      updatedAt: r.board_updated_at,
    },
    column: {
      id: r.column_id,
      title: r.column_title,
      position: Number(r.column_position),
      createdAt: r.column_created_at,
    },
    card: {
      id: r.id,
      boardId: r.board_id,
      columnId: r.column_id,
      title: r.title,
      description: r.description,
      position: Number(r.position),
      assigneeId: r.assignee_id,
      mentions: Array.isArray(r.mentions) ? r.mentions : [],
      commentCount: r.comment_count,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  })
})

/** POST /boards — create a board. Auto-seeds the conventional "Todo /
 *  Doing / Done" columns so the new board is immediately usable. */
api.post('/boards', async (req, res) => {
  const { userId: me, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const title = String(req.body?.title ?? '').trim().slice(0, 200)
  const description = String(req.body?.description ?? '').trim().slice(0, 4000) || null
  if (!title) throw new HttpError(400, 'title required')
  const id = `board-${randomUUID().slice(0, 12)}`
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO boards (id, company_id, project_id, title, description, created_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, companyId, projectId, title, description, me],
    )
    const seeds = ['Todo', 'Doing', 'Done']
    for (let i = 0; i < seeds.length; i++) {
      await client.query(
        `INSERT INTO board_columns (id, board_id, title, position) VALUES ($1, $2, $3, $4)`,
        [`col-${randomUUID().slice(0, 12)}`, id, seeds[i], (i + 1) * 1000],
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { /* swallow */ })
    throw e
  } finally {
    client.release()
  }
  await publishBoardEvent({ companyId, kind: 'board.created', boardId: id, actorId: me })
  res.json({ id })
})

/** GET /boards/:id — full snapshot: board + columns (ordered) + cards
 *  (ordered within each column) + per-card recent comments count. The
 *  Boards view hydrates off this single call. */
api.get('/boards/:id', async (req, res) => {
  const boardId = req.params.id
  await requireBoardAccess(req, boardId)
  const board = await pool.query<{
    id: string; title: string; description: string | null
    created_by: string; created_at: string; updated_at: string
  }>(
    `SELECT id, title, description, created_by, created_at, updated_at
       FROM boards WHERE id = $1 LIMIT 1`,
    [boardId],
  )
  if (board.rows.length === 0) throw new HttpError(404, 'not found')
  const cols = await pool.query<{
    id: string; title: string; position: number; created_at: string
  }>(
    `SELECT id, title, position, created_at
       FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
    [boardId],
  )
  const cards = await pool.query<{
    id: string; column_id: string; title: string; description: string | null
    position: number; assignee_id: string | null; mentions: string[]
    created_by: string; created_at: string; updated_at: string
    comment_count: number
  }>(
    `SELECT c.id, c.column_id, c.title, c.description, c.position,
            c.assignee_id, c.mentions, c.created_by, c.created_at, c.updated_at,
            (SELECT COUNT(*)::int FROM board_card_comments cc WHERE cc.card_id = c.id) AS comment_count
       FROM board_cards c
      WHERE c.board_id = $1
      ORDER BY c.column_id, c.position ASC`,
    [boardId],
  )
  const b = board.rows[0]
  res.json({
    id: b.id,
    title: b.title,
    description: b.description,
    createdBy: b.created_by,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    columns: cols.rows.map((c) => ({
      id: c.id,
      title: c.title,
      position: Number(c.position),
      createdAt: c.created_at,
    })),
    cards: cards.rows.map((c) => ({
      id: c.id,
      boardId,
      columnId: c.column_id,
      title: c.title,
      description: c.description,
      position: Number(c.position),
      assigneeId: c.assignee_id,
      mentions: Array.isArray(c.mentions) ? c.mentions : [],
      commentCount: c.comment_count,
      createdBy: c.created_by,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
  })
})

/** PATCH /boards/:id — rename / re-describe. */
api.patch('/boards/:id', async (req, res) => {
  const boardId = req.params.id
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const patch: Record<string, unknown> = {}
  if (typeof req.body?.title === 'string') patch.title = req.body.title.trim().slice(0, 200)
  if (typeof req.body?.description === 'string') patch.description = req.body.description.trim().slice(0, 4000) || null
  if (Object.keys(patch).length === 0) { res.json({ ok: true }); return }
  const sets: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    params.push(v); sets.push(`${k} = $${params.length}`)
  }
  params.push(boardId)
  await pool.query(
    `UPDATE boards SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
    params,
  )
  await publishBoardEvent({ companyId, kind: 'board.updated', boardId, actorId: me })
  res.json({ ok: true })
})

/** DELETE /boards/:id — full drop, columns + cards + comments cascade. */
api.delete('/boards/:id', async (req, res) => {
  const boardId = req.params.id
  const { userId: me, companyId, projectId } = await requireBoardAccess(req, boardId, true)
  await pool.query(`DELETE FROM boards WHERE id = $1`, [boardId])
  await publishBoardEvent({ companyId, workspaceId: projectId, kind: 'board.deleted', boardId, actorId: me })
  res.json({ ok: true })
})

/** POST /boards/:id/columns — add a new column at the end. */
api.post('/boards/:id/columns', async (req, res) => {
  const boardId = req.params.id
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const title = String(req.body?.title ?? '').trim().slice(0, 100)
  if (!title) throw new HttpError(400, 'title required')
  const { rows: posRows } = await pool.query<{ max: number | null }>(
    `SELECT MAX(position) AS max FROM board_columns WHERE board_id = $1`, [boardId],
  )
  const position = (Number(posRows[0]?.max ?? 0)) + 1000
  const id = `col-${randomUUID().slice(0, 12)}`
  await pool.query(
    `INSERT INTO board_columns (id, board_id, title, position) VALUES ($1, $2, $3, $4)`,
    [id, boardId, title, position],
  )
  await publishBoardEvent({ companyId, kind: 'column.created', boardId, columnId: id, actorId: me })
  res.json({ id, position })
})

/** PATCH /boards/:bid/columns/:cid — rename, or reorder via `position`. */
api.patch('/boards/:bid/columns/:cid', async (req, res) => {
  const boardId = req.params.bid
  const columnId = req.params.cid
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const sets: string[] = []
  const params: unknown[] = []
  if (typeof req.body?.title === 'string') {
    params.push(req.body.title.trim().slice(0, 100)); sets.push(`title = $${params.length}`)
  }
  if (typeof req.body?.position === 'number') {
    params.push(req.body.position); sets.push(`position = $${params.length}`)
  }
  if (sets.length === 0) { res.json({ ok: true }); return }
  params.push(columnId); params.push(boardId)
  const r = await pool.query(
    `UPDATE board_columns SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND board_id = $${params.length}`,
    params,
  )
  if ((r.rowCount ?? 0) === 0) throw new HttpError(404, 'not found')
  await publishBoardEvent({ companyId, kind: 'column.updated', boardId, columnId, actorId: me })
  res.json({ ok: true })
})

/** DELETE /boards/:bid/columns/:cid — drops the column AND all its cards. */
api.delete('/boards/:bid/columns/:cid', async (req, res) => {
  const boardId = req.params.bid
  const columnId = req.params.cid
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const r = await pool.query(
    `DELETE FROM board_columns WHERE id = $1 AND board_id = $2`,
    [columnId, boardId],
  )
  if ((r.rowCount ?? 0) === 0) throw new HttpError(404, 'not found')
  await publishBoardEvent({ companyId, kind: 'column.deleted', boardId, columnId, actorId: me })
  res.json({ ok: true })
})

/** POST /boards/:id/cards — create a card. Position defaults to end of
 *  the destination column. Title/description parsed for @-mentions. */
api.post('/boards/:id/cards', async (req, res) => {
  const boardId = req.params.id
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const title = String(req.body?.title ?? '').trim().slice(0, 200)
  const description = String(req.body?.description ?? '').trim().slice(0, 8000) || null
  const columnId = String(req.body?.columnId ?? '').trim()
  const assigneeId = req.body?.assigneeId ? String(req.body.assigneeId).trim() : null
  if (!title) throw new HttpError(400, 'title required')
  if (!columnId) throw new HttpError(400, 'columnId required')
  // Confirm column lives in the board we're touching — otherwise a client
  // could slot a card into a column they shouldn't be able to reach.
  const colCheck = await pool.query(
    `SELECT 1 FROM board_columns WHERE id = $1 AND board_id = $2 LIMIT 1`,
    [columnId, boardId],
  )
  if (colCheck.rows.length === 0) throw new HttpError(404, 'column not found')
  const { rows: posRows } = await pool.query<{ max: number | null }>(
    `SELECT MAX(position) AS max FROM board_cards WHERE column_id = $1`, [columnId],
  )
  const position = (Number(posRows[0]?.max ?? 0)) + 1000
  const mentions = await parseMentions(companyId, `${title}\n${description ?? ''}`)
  const id = `card-${randomUUID().slice(0, 12)}`
  await pool.query(
    `INSERT INTO board_cards
       (id, board_id, column_id, title, description, position, assignee_id, mentions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [id, boardId, columnId, title, description, position, assigneeId, JSON.stringify(mentions), me],
  )
  await pool.query(`UPDATE boards SET updated_at = NOW() WHERE id = $1`, [boardId])
  await publishBoardEvent({
    companyId, kind: 'card.created', boardId, cardId: id, columnId, mentions, actorId: me,
  })
  await wakeMentionedAgents({ companyId, mentions, actorId: me })
  // Assignment counts as a mention even without an @-token in prose:
  // when you `assignee_id = someone`, that someone should know about it.
  if (assigneeId && assigneeId !== me) {
    await wakeMentionedAgents({ companyId, mentions: [assigneeId], actorId: me })
  }
  res.json({ id, position, mentions })
})

/** PATCH /boards/:bid/cards/:cid — rename / re-describe / reassign /
 *  move to a different column / reorder. Any subset of fields is fine. */
api.patch('/boards/:bid/cards/:cid', async (req, res) => {
  const boardId = req.params.bid
  const cardId = req.params.cid
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  // Load current row so we can parse mentions off (possibly partial) input
  // against the existing title/description and decide which broadcast kind
  // to publish (card.moved vs card.updated).
  const { rows: cur } = await pool.query<{
    title: string; description: string | null; column_id: string
  }>(
    `SELECT title, description, column_id FROM board_cards
      WHERE id = $1 AND board_id = $2 LIMIT 1`,
    [cardId, boardId],
  )
  if (cur.length === 0) throw new HttpError(404, 'not found')
  const sets: string[] = []
  const params: unknown[] = []
  let nextTitle = cur[0].title
  let nextDesc = cur[0].description
  let columnChanged = false
  if (typeof req.body?.title === 'string') {
    nextTitle = req.body.title.trim().slice(0, 200)
    params.push(nextTitle); sets.push(`title = $${params.length}`)
  }
  if (typeof req.body?.description === 'string') {
    nextDesc = req.body.description.trim().slice(0, 8000) || null
    params.push(nextDesc); sets.push(`description = $${params.length}`)
  }
  if (typeof req.body?.position === 'number') {
    params.push(req.body.position); sets.push(`position = $${params.length}`)
  }
  if (typeof req.body?.assigneeId === 'string' || req.body?.assigneeId === null) {
    const a = req.body.assigneeId == null ? null : String(req.body.assigneeId).trim() || null
    params.push(a); sets.push(`assignee_id = $${params.length}`)
  }
  if (typeof req.body?.columnId === 'string') {
    const newCol = req.body.columnId.trim()
    if (newCol !== cur[0].column_id) {
      const colCheck = await pool.query(
        `SELECT 1 FROM board_columns WHERE id = $1 AND board_id = $2 LIMIT 1`,
        [newCol, boardId],
      )
      if (colCheck.rows.length === 0) throw new HttpError(404, 'column not found')
      params.push(newCol); sets.push(`column_id = $${params.length}`)
      columnChanged = true
    }
  }
  // Mentions need re-parsing whenever prose was touched.
  const proseChanged = typeof req.body?.title === 'string' || typeof req.body?.description === 'string'
  let mentions: string[] | undefined
  if (proseChanged) {
    mentions = await parseMentions(companyId, `${nextTitle}\n${nextDesc ?? ''}`)
    params.push(JSON.stringify(mentions)); sets.push(`mentions = $${params.length}::jsonb`)
  }
  if (sets.length === 0) { res.json({ ok: true }); return }
  params.push(cardId); params.push(boardId)
  await pool.query(
    `UPDATE board_cards SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length - 1} AND board_id = $${params.length}`,
    params,
  )
  await pool.query(`UPDATE boards SET updated_at = NOW() WHERE id = $1`, [boardId])
  await publishBoardEvent({
    companyId,
    kind: columnChanged ? 'card.moved' : 'card.updated',
    boardId, cardId, mentions, actorId: me,
  })
  await wakeMentionedAgents({ companyId, mentions, actorId: me })
  // A re-assignment also wakes the new assignee.
  if (typeof req.body?.assigneeId === 'string') {
    const newAssignee = String(req.body.assigneeId).trim()
    if (newAssignee && newAssignee !== me) {
      await wakeMentionedAgents({ companyId, mentions: [newAssignee], actorId: me })
    }
  }
  res.json({ ok: true, mentions })
})

/** DELETE /boards/:bid/cards/:cid — drops the card + cascades its comments. */
api.delete('/boards/:bid/cards/:cid', async (req, res) => {
  const boardId = req.params.bid
  const cardId = req.params.cid
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const r = await pool.query(
    `DELETE FROM board_cards WHERE id = $1 AND board_id = $2`,
    [cardId, boardId],
  )
  if ((r.rowCount ?? 0) === 0) throw new HttpError(404, 'not found')
  await publishBoardEvent({ companyId, kind: 'card.deleted', boardId, cardId, actorId: me })
  res.json({ ok: true })
})

/** GET /boards/:bid/cards/:cid/comments — full ordered comment list. */
api.get('/boards/:bid/cards/:cid/comments', async (req, res) => {
  const boardId = req.params.bid
  const cardId = req.params.cid
  await requireBoardAccess(req, boardId)
  const card = await pool.query(
    `SELECT 1 FROM board_cards WHERE id = $1 AND board_id = $2 LIMIT 1`,
    [cardId, boardId],
  )
  if (card.rows.length === 0) throw new HttpError(404, 'not found')
  const { rows } = await pool.query<{
    id: string; author_id: string; body: string; mentions: string[]; created_at: string
  }>(
    `SELECT id, author_id, body, mentions, created_at
       FROM board_card_comments WHERE card_id = $1 ORDER BY created_at ASC`,
    [cardId],
  )
  res.json(rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    body: r.body,
    mentions: Array.isArray(r.mentions) ? r.mentions : [],
    createdAt: r.created_at,
  })))
})

/** POST /boards/:bid/cards/:cid/comments — append a comment. Mentions in
 *  the body are parsed at write time. */
api.post('/boards/:bid/cards/:cid/comments', async (req, res) => {
  const boardId = req.params.bid
  const cardId = req.params.cid
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const body = String(req.body?.body ?? '').trim().slice(0, 8000)
  if (!body) throw new HttpError(400, 'body required')
  const card = await pool.query(
    `SELECT 1 FROM board_cards WHERE id = $1 AND board_id = $2 LIMIT 1`,
    [cardId, boardId],
  )
  if (card.rows.length === 0) throw new HttpError(404, 'not found')
  const mentions = await parseMentions(companyId, body)
  const id = `cmt-${randomUUID().slice(0, 12)}`
  await pool.query(
    `INSERT INTO board_card_comments (id, card_id, author_id, body, mentions)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [id, cardId, me, body, JSON.stringify(mentions)],
  )
  await pool.query(`UPDATE board_cards SET updated_at = NOW() WHERE id = $1`, [cardId])
  await pool.query(`UPDATE boards SET updated_at = NOW() WHERE id = $1`, [boardId])
  await publishBoardEvent({
    companyId, kind: 'comment.created', boardId, cardId, commentId: id, mentions, actorId: me,
  })
  await wakeMentionedAgents({ companyId, mentions, actorId: me })
  res.json({ id, mentions })
})

/** DELETE /boards/:bid/cards/:cid/comments/:mid — author can delete
 *  their own comment. */
api.delete('/boards/:bid/cards/:cid/comments/:mid', async (req, res) => {
  const boardId = req.params.bid
  const cardId = req.params.cid
  const mid = req.params.mid
  const { userId: me, companyId } = await requireBoardAccess(req, boardId, true)
  const r = await pool.query(
    `DELETE FROM board_card_comments
       WHERE id = $1 AND card_id = $2 AND author_id = $3`,
    [mid, cardId, me],
  )
  if ((r.rowCount ?? 0) === 0) throw new HttpError(404, 'not found')
  await publishBoardEvent({
    companyId, kind: 'comment.deleted', boardId, cardId, commentId: mid, actorId: me,
  })
  res.json({ ok: true })
})
