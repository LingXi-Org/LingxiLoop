import type { Queryable } from '../../db/queryable.js'
import type { CreateCardInput, UpdateBoardInput, UpdateCardInput, UpdateColumnInput } from './contracts.js'

export async function boardExists(
  db: Queryable,
  companyId: string,
  projectId: string,
  boardId: string,
  lock = false,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM boards WHERE id=$1 AND company_id=$2 AND project_id=$3${lock ? ' FOR UPDATE' : ''}`,
    [boardId, companyId, projectId],
  )
  return Boolean(rows[0])
}

export async function listBoards(db: Queryable, companyId: string, projectId: string) {
  const { rows } = await db.query<{
    id: string; title: string; description: string | null; created_by: string; created_at: string; updated_at: string
  }>(
    `SELECT id,title,description,created_by,created_at,updated_at
       FROM boards WHERE company_id=$1 AND project_id=$2 ORDER BY updated_at DESC`,
    [companyId, projectId],
  )
  return rows.map((row) => ({
    id: row.id, title: row.title, description: row.description, createdBy: row.created_by,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }))
}

export async function findCard(db: Queryable, companyId: string, projectId: string, cardId: string) {
  const { rows } = await db.query<{
    id: string; board_id: string; column_id: string; title: string; description: string | null
    position: number; assignee_id: string | null; mentions: string[]; created_by: string
    created_at: string; updated_at: string; board_title: string; board_description: string | null
    board_created_by: string; board_created_at: string; board_updated_at: string
    column_title: string; column_position: number; column_created_at: string; comment_count: number
  }>(
    `SELECT card.id,card.board_id,card.column_id,card.title,card.description,card.position,
            card.assignee_id,card.mentions,card.created_by,card.created_at,card.updated_at,
            board.title AS board_title,board.description AS board_description,
            board.created_by AS board_created_by,board.created_at AS board_created_at,
            board.updated_at AS board_updated_at,column_row.title AS column_title,
            column_row.position AS column_position,column_row.created_at AS column_created_at,
            (SELECT COUNT(*)::int FROM board_card_comments comment WHERE comment.card_id=card.id) AS comment_count
       FROM board_cards card
       JOIN boards board ON board.id=card.board_id
       JOIN board_columns column_row ON column_row.id=card.column_id AND column_row.board_id=board.id
      WHERE card.id=$1 AND board.company_id=$2 AND board.project_id=$3 LIMIT 1`,
    [cardId, companyId, projectId],
  )
  const row = rows[0]
  if (!row) return null
  return {
    board: {
      id: row.board_id, title: row.board_title, description: row.board_description,
      createdBy: row.board_created_by, createdAt: row.board_created_at, updatedAt: row.board_updated_at,
    },
    column: {
      id: row.column_id, title: row.column_title, position: Number(row.column_position), createdAt: row.column_created_at,
    },
    card: {
      id: row.id, boardId: row.board_id, columnId: row.column_id, title: row.title,
      description: row.description, position: Number(row.position), assigneeId: row.assignee_id,
      mentions: Array.isArray(row.mentions) ? row.mentions : [], commentCount: row.comment_count,
      createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
    },
  }
}

export async function insertBoard(db: Queryable, args: {
  id: string; companyId: string; projectId: string; title: string; description: string | null
  createdBy: string; columns: Array<{ id: string; title: string; position: number }>
}): Promise<boolean> {
  const inserted = await db.query(
    `INSERT INTO boards (id,company_id,project_id,title,description,created_by)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING RETURNING id`,
    [args.id, args.companyId, args.projectId, args.title, args.description, args.createdBy],
  )
  if ((inserted.rowCount ?? 0) === 0) return false
  for (const column of args.columns) {
    await db.query(
      `INSERT INTO board_columns (id,board_id,title,position) VALUES ($1,$2,$3,$4)`,
      [column.id, args.id, column.title, column.position],
    )
  }
  return true
}

export async function boardSnapshot(db: Queryable, companyId: string, projectId: string, boardId: string) {
  const { rows: boards } = await db.query<{
    id: string; title: string; description: string | null; created_by: string; created_at: string; updated_at: string
  }>(
    `SELECT id,title,description,created_by,created_at,updated_at
       FROM boards WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [boardId, companyId, projectId],
  )
  const board = boards[0]
  if (!board) return null
  const { rows: columns } = await db.query<{ id: string; title: string; position: number; created_at: string }>(
    `SELECT column_row.id,column_row.title,column_row.position,column_row.created_at
       FROM board_columns column_row JOIN boards board ON board.id=column_row.board_id
      WHERE column_row.board_id=$1 AND board.company_id=$2 AND board.project_id=$3
      ORDER BY column_row.position`,
    [boardId, companyId, projectId],
  )
  const { rows: cards } = await db.query<{
    id: string; column_id: string; title: string; description: string | null; position: number
    assignee_id: string | null; mentions: string[]; created_by: string; created_at: string
    updated_at: string; comment_count: number
  }>(
    `SELECT card.id,card.column_id,card.title,card.description,card.position,card.assignee_id,
            card.mentions,card.created_by,card.created_at,card.updated_at,
            (SELECT COUNT(*)::int FROM board_card_comments comment WHERE comment.card_id=card.id) AS comment_count
       FROM board_cards card JOIN boards board ON board.id=card.board_id
      WHERE card.board_id=$1 AND board.company_id=$2 AND board.project_id=$3
      ORDER BY card.column_id,card.position`,
    [boardId, companyId, projectId],
  )
  return {
    id: board.id, title: board.title, description: board.description, createdBy: board.created_by,
    createdAt: board.created_at, updatedAt: board.updated_at,
    columns: columns.map((column) => ({
      id: column.id, title: column.title, position: Number(column.position), createdAt: column.created_at,
    })),
    cards: cards.map((card) => ({
      id: card.id, boardId, columnId: card.column_id, title: card.title, description: card.description,
      position: Number(card.position), assigneeId: card.assignee_id,
      mentions: Array.isArray(card.mentions) ? card.mentions : [], commentCount: card.comment_count,
      createdBy: card.created_by, createdAt: card.created_at, updatedAt: card.updated_at,
    })),
  }
}

export async function updateBoard(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; patch: UpdateBoardInput
}): Promise<boolean> {
  const values: unknown[] = []
  const sets: string[] = []
  if (args.patch.title !== undefined) { values.push(args.patch.title); sets.push(`title=$${values.length}`) }
  if (args.patch.description !== undefined) {
    values.push(args.patch.description || null); sets.push(`description=$${values.length}`)
  }
  if (sets.length === 0) return boardExists(db, args.companyId, args.projectId, args.boardId)
  values.push(args.boardId, args.companyId, args.projectId)
  const result = await db.query(
    `UPDATE boards SET ${sets.join(',')},updated_at=NOW()
      WHERE id=$${values.length - 2} AND company_id=$${values.length - 1} AND project_id=$${values.length}`,
    values,
  )
  return (result.rowCount ?? 0) > 0
}

export async function deleteBoard(db: Queryable, companyId: string, projectId: string, boardId: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM boards WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [boardId, companyId, projectId],
  )
  return (result.rowCount ?? 0) > 0
}

export async function appendColumn(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; id: string; title: string
}): Promise<number | null> {
  if (!await boardExists(db, args.companyId, args.projectId, args.boardId, true)) return null
  const { rows } = await db.query<{ max: number | null }>(
    `SELECT MAX(column_row.position) AS max FROM board_columns column_row
       JOIN boards board ON board.id=column_row.board_id
      WHERE column_row.board_id=$1 AND board.company_id=$2 AND board.project_id=$3`,
    [args.boardId, args.companyId, args.projectId],
  )
  const position = Number(rows[0]?.max ?? 0) + 1000
  await db.query(
    `INSERT INTO board_columns (id,board_id,title,position) VALUES ($1,$2,$3,$4)`,
    [args.id, args.boardId, args.title, position],
  )
  return position
}

export async function updateColumn(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; columnId: string; patch: UpdateColumnInput
}): Promise<boolean> {
  const values: unknown[] = []
  const sets: string[] = []
  if (args.patch.title !== undefined) { values.push(args.patch.title); sets.push(`title=$${values.length}`) }
  if (args.patch.position !== undefined) { values.push(args.patch.position); sets.push(`position=$${values.length}`) }
  if (sets.length === 0) return columnExists(db, args.companyId, args.projectId, args.boardId, args.columnId)
  values.push(args.columnId, args.boardId, args.companyId, args.projectId)
  const result = await db.query(
    `UPDATE board_columns column_row SET ${sets.join(',')}
      FROM boards board
      WHERE column_row.id=$${values.length - 3} AND column_row.board_id=$${values.length - 2}
        AND board.id=column_row.board_id AND board.company_id=$${values.length - 1} AND board.project_id=$${values.length}`,
    values,
  )
  return (result.rowCount ?? 0) > 0
}

export async function deleteColumn(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; columnId: string
}): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM board_columns column_row USING boards board
      WHERE column_row.id=$1 AND column_row.board_id=$2 AND board.id=column_row.board_id
        AND board.company_id=$3 AND board.project_id=$4`,
    [args.columnId, args.boardId, args.companyId, args.projectId],
  )
  return (result.rowCount ?? 0) > 0
}

export async function columnExists(
  db: Queryable,
  companyId: string,
  projectId: string,
  boardId: string,
  columnId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM board_columns column_row JOIN boards board ON board.id=column_row.board_id
      WHERE column_row.id=$1 AND column_row.board_id=$2 AND board.company_id=$3 AND board.project_id=$4`,
    [columnId, boardId, companyId, projectId],
  )
  return Boolean(rows[0])
}

export async function appendCard(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; id: string; userId: string
  input: CreateCardInput; mentions: string[]
}): Promise<{ position: number; created: boolean } | null> {
  if (!await boardExists(db, args.companyId, args.projectId, args.boardId, true)) return null
  if (!await columnExists(db, args.companyId, args.projectId, args.boardId, args.input.columnId)) return null
  const { rows } = await db.query<{ max: number | null }>(
    `SELECT MAX(card.position) AS max FROM board_cards card
       JOIN boards board ON board.id=card.board_id
      WHERE card.column_id=$1 AND card.board_id=$2 AND board.company_id=$3 AND board.project_id=$4`,
    [args.input.columnId, args.boardId, args.companyId, args.projectId],
  )
  const position = Number(rows[0]?.max ?? 0) + 1000
  const inserted = await db.query(
    `INSERT INTO board_cards
       (id,board_id,column_id,title,description,position,assignee_id,mentions,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     ON CONFLICT(id) DO NOTHING RETURNING id`,
    [args.id, args.boardId, args.input.columnId, args.input.title, args.input.description || null,
      position, args.input.assigneeId ?? null, JSON.stringify(args.mentions), args.userId],
  )
  if ((inserted.rowCount ?? 0) === 0) {
    const replay = await findCard(db, args.companyId, args.projectId, args.id)
    return replay?.card.boardId === args.boardId
      ? { position: replay.card.position, created: false }
      : null
  }
  await touchBoard(db, args.companyId, args.projectId, args.boardId)
  return { position, created: true }
}

export async function currentCard(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string
}) {
  const { rows } = await db.query<{ title: string; description: string | null; column_id: string }>(
    `SELECT card.title,card.description,card.column_id FROM board_cards card
       JOIN boards board ON board.id=card.board_id
      WHERE card.id=$1 AND card.board_id=$2 AND board.company_id=$3 AND board.project_id=$4`,
    [args.cardId, args.boardId, args.companyId, args.projectId],
  )
  return rows[0] ?? null
}

export async function updateCard(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string
  patch: UpdateCardInput; mentions?: string[]
}): Promise<boolean> {
  const values: unknown[] = []
  const sets: string[] = []
  for (const [field, column] of [
    ['title', 'title'], ['description', 'description'], ['position', 'position'],
    ['assigneeId', 'assignee_id'], ['columnId', 'column_id'],
  ] as const) {
    if (!Object.hasOwn(args.patch, field)) continue
    values.push(args.patch[field] === '' ? null : args.patch[field])
    sets.push(`${column}=$${values.length}`)
  }
  if (args.mentions !== undefined) {
    values.push(JSON.stringify(args.mentions)); sets.push(`mentions=$${values.length}::jsonb`)
  }
  if (sets.length === 0) return true
  values.push(args.cardId, args.boardId, args.companyId, args.projectId)
  const result = await db.query(
    `UPDATE board_cards card SET ${sets.join(',')},updated_at=NOW()
      FROM boards board
      WHERE card.id=$${values.length - 3} AND card.board_id=$${values.length - 2}
        AND board.id=card.board_id AND board.company_id=$${values.length - 1} AND board.project_id=$${values.length}`,
    values,
  )
  if ((result.rowCount ?? 0) > 0) await touchBoard(db, args.companyId, args.projectId, args.boardId)
  return (result.rowCount ?? 0) > 0
}

export async function deleteCard(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string
}): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM board_cards card USING boards board
      WHERE card.id=$1 AND card.board_id=$2 AND board.id=card.board_id
        AND board.company_id=$3 AND board.project_id=$4`,
    [args.cardId, args.boardId, args.companyId, args.projectId],
  )
  if ((result.rowCount ?? 0) > 0) await touchBoard(db, args.companyId, args.projectId, args.boardId)
  return (result.rowCount ?? 0) > 0
}

export async function listComments(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string
}) {
  const { rows } = await db.query<{
    id: string; author_id: string; body: string; mentions: string[]; created_at: string
  }>(
    `SELECT comment.id,comment.author_id,comment.body,comment.mentions,comment.created_at
       FROM board_card_comments comment
       JOIN board_cards card ON card.id=comment.card_id
       JOIN boards board ON board.id=card.board_id
      WHERE comment.card_id=$1 AND card.board_id=$2 AND board.company_id=$3 AND board.project_id=$4
      ORDER BY comment.created_at`,
    [args.cardId, args.boardId, args.companyId, args.projectId],
  )
  return rows.map((row) => ({
    id: row.id, authorId: row.author_id, body: row.body,
    mentions: Array.isArray(row.mentions) ? row.mentions : [], createdAt: row.created_at,
  }))
}

export async function appendComment(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string
  id: string; userId: string; body: string; mentions: string[]
}): Promise<'created' | 'replayed' | 'not_found'> {
  const result = await db.query(
    `INSERT INTO board_card_comments (id,card_id,author_id,body,mentions)
     SELECT $1,card.id,$2,$3,$4::jsonb FROM board_cards card
     JOIN boards board ON board.id=card.board_id
      WHERE card.id=$5 AND card.board_id=$6 AND board.company_id=$7 AND board.project_id=$8
     ON CONFLICT(id) DO NOTHING RETURNING id`,
    [args.id, args.userId, args.body, JSON.stringify(args.mentions), args.cardId, args.boardId,
      args.companyId, args.projectId],
  )
  if ((result.rowCount ?? 0) === 0) {
    const { rows } = await db.query(
      `SELECT 1 FROM board_card_comments comment
       JOIN board_cards card ON card.id=comment.card_id
       JOIN boards board ON board.id=card.board_id
       WHERE comment.id=$1 AND comment.card_id=$2 AND comment.author_id=$3
         AND card.board_id=$4 AND board.company_id=$5 AND board.project_id=$6`,
      [args.id, args.cardId, args.userId, args.boardId, args.companyId, args.projectId],
    )
    return rows[0] ? 'replayed' : 'not_found'
  }
  await db.query(
    `UPDATE board_cards card SET updated_at=NOW() FROM boards board
      WHERE card.id=$1 AND board.id=card.board_id AND board.id=$2 AND board.company_id=$3 AND board.project_id=$4`,
    [args.cardId, args.boardId, args.companyId, args.projectId],
  )
  await touchBoard(db, args.companyId, args.projectId, args.boardId)
  return 'created'
}

export async function moveCardToColumn(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string; columnId: string
}): Promise<number | null> {
  if (!await boardExists(db, args.companyId, args.projectId, args.boardId, true)) return null
  if (!await columnExists(db, args.companyId, args.projectId, args.boardId, args.columnId)) return null
  const { rows } = await db.query<{ max: number | null }>(
    `SELECT MAX(card.position) AS max FROM board_cards card
     JOIN boards board ON board.id=card.board_id
     WHERE card.column_id=$1 AND card.board_id=$2 AND board.company_id=$3 AND board.project_id=$4`,
    [args.columnId, args.boardId, args.companyId, args.projectId],
  )
  const position = Number(rows[0]?.max ?? 0) + 1000
  const moved = await db.query(
    `UPDATE board_cards card SET column_id=$1,position=$2,updated_at=NOW()
     FROM boards board WHERE card.id=$3 AND card.board_id=$4 AND board.id=card.board_id
       AND board.company_id=$5 AND board.project_id=$6`,
    [args.columnId, position, args.cardId, args.boardId, args.companyId, args.projectId],
  )
  if ((moved.rowCount ?? 0) === 0) return null
  await touchBoard(db, args.companyId, args.projectId, args.boardId)
  return position
}

export async function claimCardForAgent(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string; agentId: string
}): Promise<{ outcome: 'claimed' | 'held' | 'not_found'; holder: string | null }> {
  const claimed = await db.query(
    `UPDATE board_cards card SET assignee_id=$1,updated_at=NOW()
     FROM boards board
     WHERE card.id=$2 AND card.board_id=$3 AND board.id=card.board_id
       AND board.company_id=$4 AND board.project_id=$5
       AND (card.assignee_id IS NULL OR card.assignee_id=$1
         OR card.updated_at<NOW()-INTERVAL '20 minutes')
     RETURNING card.id`,
    [args.agentId, args.cardId, args.boardId, args.companyId, args.projectId],
  )
  if ((claimed.rowCount ?? 0) > 0) {
    await touchBoard(db, args.companyId, args.projectId, args.boardId)
    return { outcome: 'claimed', holder: args.agentId }
  }
  const { rows } = await db.query<{ assignee_id: string | null }>(
    `SELECT card.assignee_id FROM board_cards card
     JOIN boards board ON board.id=card.board_id
     WHERE card.id=$1 AND card.board_id=$2 AND board.company_id=$3 AND board.project_id=$4`,
    [args.cardId, args.boardId, args.companyId, args.projectId],
  )
  return rows[0]
    ? { outcome: 'held', holder: rows[0].assignee_id }
    : { outcome: 'not_found', holder: null }
}

export async function lockBoardMentionWindow(
  db: Queryable,
  userId: string,
): Promise<{ since: string; until: string }> {
  await db.query(
    `INSERT INTO board_mention_reads(user_id,last_read_at)
     VALUES($1,TIMESTAMPTZ 'epoch') ON CONFLICT(user_id) DO NOTHING`,
    [userId],
  )
  const { rows } = await db.query<{ since: string; until: string }>(
    `SELECT cursor.last_read_at::text AS since,NOW()::text AS until
     FROM board_mention_reads cursor WHERE cursor.user_id=$1 FOR UPDATE`,
    [userId],
  )
  return rows[0]
}

export async function readBoardMentionWindow(
  db: Queryable,
  userId: string,
): Promise<{ since: string; until: string }> {
  const { rows } = await db.query<{ since: string; until: string }>(
    `SELECT COALESCE(
       (SELECT cursor.last_read_at FROM board_mention_reads cursor WHERE cursor.user_id=$1),
       TIMESTAMPTZ 'epoch'
     )::text AS since,NOW()::text AS until`,
    [userId],
  )
  return rows[0]
}

export async function listBoardMentionCards(db: Queryable, args: {
  companyId: string; userId: string; since: string; until: string
}) {
  const { rows } = await db.query<{
    id: string; board_id: string; column_id: string; title: string; updated_at: string
    created_by: string; board_title: string
  }>(
    `SELECT card.id,card.board_id,card.column_id,card.title,card.updated_at,card.created_by,
            board.title AS board_title
     FROM board_cards card JOIN boards board ON board.id=card.board_id
     WHERE board.company_id=$1 AND card.updated_at>$2 AND card.updated_at<=$3
       AND card.mentions @> to_jsonb($4::text)
     ORDER BY card.updated_at DESC LIMIT 50`,
    [args.companyId, args.since, args.until, args.userId],
  )
  return rows.map((row) => ({
    id: row.id, boardId: row.board_id, columnId: row.column_id, title: row.title,
    updatedAt: row.updated_at, createdBy: row.created_by, boardTitle: row.board_title,
  }))
}

export async function listBoardMentionComments(db: Queryable, args: {
  companyId: string; userId: string; since: string; until: string
}) {
  const { rows } = await db.query<{
    id: string; card_id: string; body: string; author_id: string; created_at: string
    board_id: string; card_title: string; board_title: string
  }>(
    `SELECT comment.id,comment.card_id,comment.body,comment.author_id,comment.created_at,
            card.board_id,card.title AS card_title,board.title AS board_title
     FROM board_card_comments comment
     JOIN board_cards card ON card.id=comment.card_id
     JOIN boards board ON board.id=card.board_id
     WHERE board.company_id=$1 AND comment.created_at>$2 AND comment.created_at<=$3
       AND comment.mentions @> to_jsonb($4::text)
     ORDER BY comment.created_at DESC LIMIT 50`,
    [args.companyId, args.since, args.until, args.userId],
  )
  return rows.map((row) => ({
    id: row.id, cardId: row.card_id, body: row.body, authorId: row.author_id,
    createdAt: row.created_at, boardId: row.board_id, cardTitle: row.card_title,
    boardTitle: row.board_title,
  }))
}

export async function advanceBoardMentionCursor(db: Queryable, userId: string, until: string): Promise<void> {
  await db.query(
    `UPDATE board_mention_reads SET last_read_at=$2 WHERE user_id=$1`,
    [userId, until],
  )
}

export async function deleteComment(db: Queryable, args: {
  companyId: string; projectId: string; boardId: string; cardId: string; commentId: string; userId: string
}): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM board_card_comments comment USING board_cards card,boards board
      WHERE comment.id=$1 AND comment.card_id=$2 AND comment.author_id=$3
        AND card.id=comment.card_id AND card.board_id=$4 AND board.id=card.board_id
        AND board.company_id=$5 AND board.project_id=$6`,
    [args.commentId, args.cardId, args.userId, args.boardId, args.companyId, args.projectId],
  )
  return (result.rowCount ?? 0) > 0
}

export async function mentionTargets(db: Queryable, companyId: string) {
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id,name FROM participants WHERE company_id=$1 AND departed_at IS NULL`,
    [companyId],
  )
  return rows
}

export async function mentionedAgents(db: Queryable, companyId: string, participantIds: string[]) {
  if (participantIds.length === 0) return []
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM participants
      WHERE kind='agent' AND company_id=$1 AND id=ANY($2::text[]) AND departed_at IS NULL`,
    [companyId, participantIds],
  )
  return rows.map((row) => row.id)
}

export async function participantExists(db: Queryable, companyId: string, participantId: string): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM participants WHERE company_id=$1 AND id=$2 AND departed_at IS NULL`,
    [companyId, participantId],
  )
  return Boolean(rows[0])
}

async function touchBoard(db: Queryable, companyId: string, projectId: string, boardId: string): Promise<void> {
  await db.query(
    `UPDATE boards SET updated_at=NOW() WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [boardId, companyId, projectId],
  )
}
