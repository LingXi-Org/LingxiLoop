import { createHash, randomUUID } from 'node:crypto'
import { enqueueAgentWork } from '../../agent-os/enqueue.js'
import { pool } from '../../db/pool.js'
import type { CliResult, CliSideEffect } from '../cli-result.js'
import { resolveAs } from '../cli-identity.js'
import { type ParsedArgs, unescapeChat } from '../cli-parse.js'

interface RunCliInternalContext {
  idempotencyKey?: string
  projectId?: string
  deferReadCursor?: boolean
}

interface BoardCommandDependencies {
  ok(text: string, sideEffects?: CliSideEffect[]): CliResult
  err(text: string, code?: number): CliResult
  agentCompany(agentId: string): Promise<string | null>
  resolveCliProjectId(companyId: string, requested?: string): Promise<string>
}

export function createBoardCommands(dependencies: BoardCommandDependencies) {
  const { ok, err, agentCompany, resolveCliProjectId } = dependencies
  type KanbanMentionTarget = { id: string; name: string }
  
  function cliMentionStartBoundary(text: string, index: number): boolean {
    if (index <= 0) return true
    return !/[\w@]/.test(text[index - 1])
  }
  
  function cliMentionEndBoundary(text: string, index: number): boolean {
    const next = text[index]
    return !next || !/[a-z0-9_-]/i.test(next)
  }
  
  function cliParseMentionTargets(text: string, targets: KanbanMentionTarget[]): string[] {
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
      if (text[i] !== '@' || !cliMentionStartBoundary(text, i)) continue
      const rest = lower.slice(i + 1)
      const match = candidates.find((candidate) =>
        rest.startsWith(candidate.token.toLowerCase()) &&
        cliMentionEndBoundary(text, i + 1 + candidate.token.length)
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
  
  /** Same parsing contract as the REST router uses — keep them aligned so an
   *  agent's `card add` and a human's card form parse mentions the same. */
  async function cliParseMentions(companyId: string, text: string): Promise<string[]> {
    const { rows } = await pool.query<KanbanMentionTarget>(
      `SELECT id, name
         FROM participants
        WHERE company_id = $1
          AND departed_at IS NULL`,
      [companyId],
    )
    return cliParseMentionTargets(text, rows)
  }
  
  async function publishBoardCli(args: {
    companyId: string
    kind:
      | 'board.created' | 'board.updated' | 'board.deleted'
      | 'column.created' | 'column.updated' | 'column.deleted'
      | 'card.created' | 'card.updated' | 'card.moved' | 'card.deleted'
      | 'comment.created' | 'comment.deleted'
    boardId: string
    cardId?: string
    columnId?: string
    commentId?: string
    mentions?: string[]
    actorId: string
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
  
  /** Wake every mentioned agent in the company except the actor. */
  async function wakeMentionedAgentsCli(args: {
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
    for (const r of rows) {
      await enqueueAgentWork({ companyId: args.companyId, agentId: r.id, reason: 'mention' })
    }
  }
  
  async function cmdBoard(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'ls'
    const me = resolveAs(parsed)
    const companyId = await agentCompany(me)
    if (!companyId) return err(`unknown agent ${me} (no company)`)
    const projectId = await resolveCliProjectId(companyId, internal.projectId)
  
    if (!['ls', 'list', 'create', 'new'].includes(op)) {
      const boardId = parsed.positional[1]
      if (boardId) {
        const access = await pool.query(
          `SELECT 1 FROM boards WHERE id=$1 AND company_id=$2 AND project_id=$3 LIMIT 1`,
          [boardId, companyId, projectId],
        )
        if (!access.rows[0]) return err(`board ${boardId} not found`)
      }
    }
  
    if (op === 'ls' || op === 'list') {
      const { rows } = await pool.query<{
        id: string; title: string; description: string | null; updated_at: string
      }>(
        `SELECT id, title, description, updated_at FROM boards
          WHERE company_id = $1 AND project_id = $2 ORDER BY updated_at DESC`,
        [companyId, projectId],
      )
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      if (rows.length === 0) return ok(`(no boards in this workspace)`)
      return ok([
        `${rows.length} board(s):`,
        '',
        ...rows.map((b) => `  ${b.id.padEnd(20)} ${b.title}`),
      ].join('\n'))
    }
  
    if (op === 'show' || op === 'view') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: kanban show <board_id>')
      const b = await pool.query<{
        id: string; title: string; description: string | null; company_id: string
      }>(`SELECT id, title, description, company_id FROM boards WHERE id = $1 LIMIT 1`, [boardId])
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const cols = await pool.query<{
        id: string; title: string; position: number
      }>(`SELECT id, title, position FROM board_columns WHERE board_id = $1 ORDER BY position ASC`, [boardId])
      const cards = await pool.query<{
        id: string; column_id: string; title: string; assignee_id: string | null
        mentions: string[]; position: number
      }>(
        `SELECT id, column_id, title, assignee_id, mentions, position
           FROM board_cards WHERE board_id = $1 ORDER BY column_id, position ASC`,
        [boardId],
      )
      if (parsed.flags.json) {
        return ok(JSON.stringify({
          board: b.rows[0], columns: cols.rows, cards: cards.rows,
        }, null, 2))
      }
      const cardsByCol = new Map<string, typeof cards.rows>()
      for (const c of cards.rows) {
        const arr = cardsByCol.get(c.column_id) ?? []
        arr.push(c); cardsByCol.set(c.column_id, arr)
      }
      const lines: string[] = [`# ${b.rows[0].title}  (${b.rows[0].id})`]
      if (b.rows[0].description) lines.push(b.rows[0].description)
      for (const col of cols.rows) {
        const list = cardsByCol.get(col.id) ?? []
        lines.push('', `## ${col.title}  (${col.id})  · ${list.length} card(s)`)
        for (const c of list) {
          const who = c.assignee_id ? `@${c.assignee_id}` : '(unassigned)'
          const mentions = Array.isArray(c.mentions) && c.mentions.length > 0
            ? `  · mentions: ${c.mentions.map((m) => '@' + m).join(' ')}`
            : ''
          lines.push(`  - ${c.id.padEnd(20)} ${who.padEnd(16)} ${c.title}${mentions}`)
        }
      }
      return ok(lines.join('\n'))
    }
  
    if (op === 'create' || op === 'new') {
      const title = parsed.positional.slice(1).join(' ').trim()
        || (typeof parsed.flags.title === 'string' ? parsed.flags.title : '')
      if (!title) return err('usage: kanban create "<title>" [--description "..."]')
      const stableBoardId = internal.idempotencyKey
        ? `board-agent-${createHash('sha256').update(internal.idempotencyKey).digest('hex').slice(0, 32)}`
        : null
      if (stableBoardId) {
        const { rows } = await pool.query(`SELECT 1 FROM boards WHERE id=$1 AND company_id=$2 AND project_id=$3`, [stableBoardId, companyId, projectId])
        if (rows[0]) return ok(`created board ${stableBoardId}: ${title} [replayed]`)
      }
      const description = typeof parsed.flags.description === 'string'
        ? unescapeChat(parsed.flags.description).slice(0, 4000) : null
      const id = stableBoardId ?? `board-${randomUUID().slice(0, 12)}`
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO boards (id, company_id, project_id, title, description, created_by) VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, companyId, projectId, title.slice(0, 200), description, me],
        )
        const seeds = ['Todo', 'Doing', 'Done']
        for (let i = 0; i < seeds.length; i++) {
          await client.query(
            `INSERT INTO board_columns (id, board_id, title, position) VALUES ($1, $2, $3, $4)`,
            [stableBoardId ? `col-agent-${createHash('sha256').update(`${internal.idempotencyKey}:${i}`).digest('hex').slice(0, 24)}` : `col-${randomUUID().slice(0, 12)}`, id, seeds[i], (i + 1) * 1000],
          )
        }
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK').catch(() => { /* swallow */ })
        throw e
      } finally {
        client.release()
      }
      await publishBoardCli({ companyId, kind: 'board.created', boardId: id, actorId: me })
      return ok(`created board ${id}: ${title}`, [{
        event: 'kanban.board_created',
        command: 'kanban create',
        boardId: id,
        actorId: me,
        companyId,
        title,
        visibleToUser: true,
      }])
    }
  
    if (op === 'rename' || op === 'edit' || op === 'update') {
      const boardId = parsed.positional[1]
      if (!boardId) return err(`usage: kanban ${op} <board_id> --title "..." [--description "..."]`)
      const b = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM boards WHERE id = $1 LIMIT 1`,
        [boardId],
      )
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const sets: string[] = []
      const params: unknown[] = []
      let nextTitle: string | undefined
      if (typeof parsed.flags.title === 'string' || parsed.positional.length > 2) {
        nextTitle = (typeof parsed.flags.title === 'string'
          ? unescapeChat(parsed.flags.title)
          : parsed.positional.slice(2).join(' ')).trim().slice(0, 200)
        if (!nextTitle) return err('--title cannot be empty')
        params.push(nextTitle); sets.push(`title = $${params.length}`)
      }
      let nextDescription: string | null | undefined
      if (typeof parsed.flags.description === 'string') {
        nextDescription = unescapeChat(parsed.flags.description).trim().slice(0, 4000) || null
        params.push(nextDescription); sets.push(`description = $${params.length}`)
      }
      if (sets.length === 0) return err('nothing to update — pass --title or --description')
      params.push(boardId, companyId)
      const { rows } = await pool.query<{ title: string; description: string | null }>(
        `UPDATE boards SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${params.length - 1} AND company_id = $${params.length}
          RETURNING title, description`,
        params,
      )
      if (rows.length === 0) return err(`board ${boardId} not found`)
      await publishBoardCli({ companyId, kind: 'board.updated', boardId, actorId: me })
      return ok(`updated board ${boardId}: ${rows[0].title}`, [{
        event: 'kanban.board_updated',
        command: `kanban ${op}`,
        boardId,
        actorId: me,
        companyId,
        title: rows[0].title,
        description: rows[0].description,
        visibleToUser: true,
      }])
    }
  
    if (op === 'columns' || op === 'cols') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: kanban columns <board_id>')
      const b = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM boards WHERE id = $1 LIMIT 1`, [boardId],
      )
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const { rows } = await pool.query<{ id: string; title: string }>(
        `SELECT id, title FROM board_columns WHERE board_id = $1 ORDER BY position ASC`,
        [boardId],
      )
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      return ok(rows.map((c) => `  ${c.id.padEnd(20)} ${c.title}`).join('\n') || '(no columns)')
    }
  
    if (op === 'add-column' || op === 'add-col') {
      const boardId = parsed.positional[1]
      const title = parsed.positional.slice(2).join(' ').trim()
      if (!boardId || !title) return err('usage: kanban add-column <board_id> "<title>"')
      const b = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM boards WHERE id = $1 LIMIT 1`, [boardId],
      )
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const { rows: posRows } = await pool.query<{ max: number | null }>(
        `SELECT MAX(position) AS max FROM board_columns WHERE board_id = $1`, [boardId],
      )
      const position = (Number(posRows[0]?.max ?? 0)) + 1000
      const id = `col-${randomUUID().slice(0, 12)}`
      await pool.query(
        `INSERT INTO board_columns (id, board_id, title, position) VALUES ($1, $2, $3, $4)`,
        [id, boardId, title.slice(0, 100), position],
      )
      await publishBoardCli({ companyId, kind: 'column.created', boardId, columnId: id, actorId: me })
      return ok(`added column ${id}: ${title}`, [{
        event: 'kanban.column_created',
        command: 'kanban add-column',
        boardId,
        columnId: id,
        actorId: me,
        companyId,
        title,
        visibleToUser: true,
      }])
    }
  
    if (op === 'edit-column' || op === 'rename-column' || op === 'update-column') {
      const boardId = parsed.positional[1]
      const columnId = parsed.positional[2]
      if (!boardId || !columnId) {
        return err(`usage: kanban ${op} <board_id> <column_id> [--title "..."] [--position N]`)
      }
      const b = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM boards WHERE id = $1 LIMIT 1`,
        [boardId],
      )
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const sets: string[] = []
      const params: unknown[] = []
      if (typeof parsed.flags.title === 'string' || parsed.positional.length > 3) {
        const title = (typeof parsed.flags.title === 'string'
          ? unescapeChat(parsed.flags.title)
          : parsed.positional.slice(3).join(' ')).trim().slice(0, 100)
        if (!title) return err('--title cannot be empty')
        params.push(title); sets.push(`title = $${params.length}`)
      }
      if (parsed.flags.position !== undefined) {
        const position = Number(parsed.flags.position)
        if (!Number.isFinite(position)) return err(`invalid --position: ${parsed.flags.position}`)
        params.push(position); sets.push(`position = $${params.length}`)
      }
      if (sets.length === 0) return err('nothing to update — pass --title or --position')
      params.push(columnId, boardId)
      const { rows } = await pool.query<{ title: string; position: number }>(
        `UPDATE board_columns SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND board_id = $${params.length}
          RETURNING title, position`,
        params,
      )
      if (rows.length === 0) return err(`column ${columnId} not in board ${boardId}`)
      await publishBoardCli({ companyId, kind: 'column.updated', boardId, columnId, actorId: me })
      return ok(`updated column ${columnId}: ${rows[0].title}`, [{
        event: 'kanban.column_updated',
        command: `kanban ${op}`,
        boardId,
        columnId,
        actorId: me,
        companyId,
        title: rows[0].title,
        position: rows[0].position,
        visibleToUser: true,
      }])
    }
  
    if (op === 'delete-column' || op === 'rm-column') {
      const boardId = parsed.positional[1]
      const columnId = parsed.positional[2]
      if (!boardId || !columnId) return err(`usage: kanban ${op} <board_id> <column_id>`)
      const b = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM boards WHERE id = $1 LIMIT 1`,
        [boardId],
      )
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const r = await pool.query(
        `DELETE FROM board_columns WHERE id = $1 AND board_id = $2`,
        [columnId, boardId],
      )
      if ((r.rowCount ?? 0) === 0) return err(`column ${columnId} not in board ${boardId}`)
      await publishBoardCli({ companyId, kind: 'column.deleted', boardId, columnId, actorId: me })
      return ok(`deleted column ${columnId}`, [{
        event: 'kanban.column_deleted',
        command: `kanban ${op}`,
        boardId,
        columnId,
        actorId: me,
        companyId,
        visibleToUser: true,
      }])
    }
  
    if (op === 'delete' || op === 'rm') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: kanban delete <board_id>')
      const r = await pool.query(
        `DELETE FROM boards WHERE id = $1 AND company_id = $2`,
        [boardId, companyId],
      )
      if ((r.rowCount ?? 0) === 0) return err(`board ${boardId} not found`)
      await publishBoardCli({ companyId, workspaceId: projectId, kind: 'board.deleted', boardId, actorId: me })
      return ok(`deleted board ${boardId}`, [{
        event: 'kanban.board_deleted',
        command: 'kanban delete',
        boardId,
        actorId: me,
        companyId,
        visibleToUser: true,
      }])
    }
  
    if (op === 'mentions') {
      // Who @-mentioned me on a kanban (cards + comments) since I last
      // checked? Reads the read-cursor in board_mention_reads, returns
      // the unread set, and (unless --peek) advances the cursor to NOW
      // so the next call only shows what's truly new.
      const peek = Boolean(parsed.flags.peek)
      const { rows: cur } = await pool.query<{ last_read_at: string }>(
        `SELECT last_read_at FROM board_mention_reads WHERE user_id = $1 LIMIT 1`,
        [me],
      )
      const since = cur[0]?.last_read_at ?? '1970-01-01T00:00:00Z'
      const cardsR = await pool.query<{
        id: string; board_id: string; column_id: string; title: string
        updated_at: string; created_by: string
        board_title: string
      }>(
        `SELECT c.id, c.board_id, c.column_id, c.title, c.updated_at, c.created_by,
                b.title AS board_title
           FROM board_cards c
           JOIN boards b ON b.id = c.board_id
          WHERE b.company_id = $1
            AND c.updated_at > $2
            AND c.mentions @> to_jsonb($3::text)
          ORDER BY c.updated_at DESC
          LIMIT 50`,
        [companyId, since, me],
      )
      const commentsR = await pool.query<{
        id: string; card_id: string; body: string; author_id: string
        created_at: string; board_id: string; card_title: string; board_title: string
      }>(
        `SELECT cm.id, cm.card_id, cm.body, cm.author_id, cm.created_at,
                c.board_id, c.title AS card_title, b.title AS board_title
           FROM board_card_comments cm
           JOIN board_cards c ON c.id = cm.card_id
           JOIN boards b ON b.id = c.board_id
          WHERE b.company_id = $1
            AND cm.created_at > $2
            AND cm.mentions @> to_jsonb($3::text)
          ORDER BY cm.created_at DESC
          LIMIT 50`,
        [companyId, since, me],
      )
  
      if (!peek) {
        await pool.query(
          `INSERT INTO board_mention_reads (user_id, last_read_at)
           VALUES ($1, NOW())
           ON CONFLICT (user_id) DO UPDATE SET last_read_at = NOW()`,
          [me],
        )
      }
  
      if (parsed.flags.json) {
        return ok(JSON.stringify({
          since, cards: cardsR.rows, comments: commentsR.rows,
        }, null, 2))
      }
      if (cardsR.rows.length === 0 && commentsR.rows.length === 0) {
        return ok(`(no new kanban @-mentions for ${me} since ${since})`)
      }
      const lines: string[] = [
        `${cardsR.rows.length + commentsR.rows.length} new kanban @-mention(s) for ${me}:`,
      ]
      if (cardsR.rows.length > 0) {
        lines.push('', '--- cards ---')
        for (const c of cardsR.rows) {
          lines.push(`  ${c.id}  [${c.board_title} / ${c.column_id}]  ${c.title}  · by ${c.created_by} at ${c.updated_at}`)
        }
      }
      if (commentsR.rows.length > 0) {
        lines.push('', '--- comments ---')
        for (const cm of commentsR.rows) {
          lines.push(`  ${cm.id}  on card ${cm.card_id} [${cm.board_title}]  · by ${cm.author_id} at ${cm.created_at}`)
          lines.push(`    "${cm.body.replace(/\n/g, ' ').slice(0, 200)}"`)
        }
      }
      if (!peek) lines.push('', `(read cursor advanced — next call shows only newer mentions; use --peek to keep it)`)
      return ok(lines.join('\n'))
    }
  
    return err(`usage: kanban <ls|show|create|rename|columns|add-column|edit-column|delete-column|delete|mentions> [...]`)
  }
  
  /** `lingxiloop claim "<unit of work>"` / `lingxiloop unclaim "..."` — the GENERIC, atomic,
   *  exclusive claim (the #1 primitive for
   *  non-divergent collaboration). Before doing any non-trivial unit a peer could
   *  also pick up — running an activity/game, producing a shared deliverable, taking
   *  a phase — CLAIM it. Exactly one agent wins (Redis HSETNX is the atomic gate);
   *  everyone else is told who holds it and to move on. Content-agnostic; coordinate
   *  by giving the SAME unit the SAME name. `--in <convo>` scopes it to a conversation
   *  (so the same name in different rooms doesn't collide); otherwise it's company-wide. */
  async function cmdClaim(parsed: ParsedArgs, mode: 'claim' | 'unclaim'): Promise<CliResult> {
    const me = resolveAs(parsed)
    const companyId = await agentCompany(me)
    if (!companyId) return err(`unknown agent ${me} (no company)`)
    const key = (parsed.positional[0] ?? '').trim()
    if (!key) return err(`usage: ${mode} "<what you're claiming>" [--in <conversation_id>]${mode === 'claim' ? ' [--ttl <seconds>]' : ''}`)
    const _convo = typeof parsed.flags['in'] === 'string' ? parsed.flags['in'] : null
    // The generic string-lock is GONE. A generic conversation/activity claim is
    // exactly what let agents reserve a counting slot ("claim count-8") and then
    // sleep-wait for it — both slow and wrong. The only claim that should exist
    // is a task-claim on a real unit of work. So claiming a
    // turn / game slot / activity no longer grants a lock: just post the real next
    // item; the server HOLDs your reply and shows you the newer messages if a peer
    // moved the room. For a shared DELIVERABLE a peer could duplicate (one doc, one
    // plan), use a board CARD (`lingxiloop card claim`). unclaim is a harmless no-op.
    if (mode === 'unclaim') {
      return ok(`ok — nothing to release. LingxiLoop no longer uses generic claims; just post, the server settles races.`)
    }
    return err(
      `Claiming a turn / game slot / activity is not a thing anymore. ` +
      `Do NOT reserve a position and wait for it. Read the latest posts and send the REAL next item (\`lingxiloop reply\`); ` +
      `if a peer moved the room while you composed, the reply comes back HELD with the newer messages — re-read and resend. ` +
      `That IS the coordination. The only claim that exists is for a genuine shared DELIVERABLE on the board: \`lingxiloop card claim <cardId>\`.`,
    )
  }
  
  async function cmdCard(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'ls'
    const me = resolveAs(parsed)
    const companyId = await agentCompany(me)
    if (!companyId) return err(`unknown agent ${me} (no company)`)
    const projectId = await resolveCliProjectId(companyId, internal.projectId)
  
    /** Look up the boardId behind a cardId AND verify it's in our tenant.
     *  Returns null if the card doesn't exist or is cross-tenant. */
    async function resolveCardBoard(cardId: string): Promise<{ boardId: string; columnId: string } | null> {
      const r = await pool.query<{ board_id: string; column_id: string; company_id: string }>(
        `SELECT c.board_id, c.column_id, b.company_id
           FROM board_cards c JOIN boards b ON b.id = c.board_id
          WHERE c.id = $1 AND b.project_id = $2 LIMIT 1`,
        [cardId, projectId],
      )
      if (r.rows.length === 0 || r.rows[0].company_id !== companyId) return null
      return { boardId: r.rows[0].board_id, columnId: r.rows[0].column_id }
    }
  
    if (op === 'ls' || op === 'list') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: card ls <board_id>')
      const b = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM boards WHERE id = $1 AND project_id = $2 LIMIT 1`, [boardId, projectId],
      )
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const { rows } = await pool.query<{
        id: string; column_id: string; title: string; assignee_id: string | null
        mentions: string[]
      }>(
        `SELECT id, column_id, title, assignee_id, mentions
           FROM board_cards WHERE board_id = $1 ORDER BY column_id, position ASC`,
        [boardId],
      )
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      if (rows.length === 0) return ok('(no cards)')
      return ok(rows.map((c) => {
        const who = c.assignee_id ? `@${c.assignee_id}` : '(unassigned)'
        return `  ${c.id.padEnd(20)} [${c.column_id.slice(0, 16).padEnd(16)}] ${who.padEnd(16)} ${c.title}`
      }).join('\n'))
    }
  
    if (op === 'show') {
      const cardId = parsed.positional[1]
      if (!cardId) return err('usage: card show <card_id>')
      const r = await pool.query<{
        id: string; board_id: string; column_id: string; title: string
        description: string | null; assignee_id: string | null; mentions: string[]
        created_by: string; created_at: string; updated_at: string; company_id: string
      }>(
        `SELECT c.id, c.board_id, c.column_id, c.title, c.description,
                c.assignee_id, c.mentions, c.created_by, c.created_at, c.updated_at,
                b.company_id
           FROM board_cards c JOIN boards b ON b.id = c.board_id
          WHERE c.id = $1 AND b.project_id = $2 LIMIT 1`,
        [cardId, projectId],
      )
      if (r.rows.length === 0 || r.rows[0].company_id !== companyId) return err(`card ${cardId} not found`)
      const c = r.rows[0]
      const comments = await pool.query<{
        id: string; author_id: string; body: string; created_at: string
      }>(
        `SELECT id, author_id, body, created_at
           FROM board_card_comments WHERE card_id = $1 ORDER BY created_at ASC`,
        [cardId],
      )
      if (parsed.flags.json) return ok(JSON.stringify({ card: c, comments: comments.rows }, null, 2))
      const lines = [
        `# ${c.title}  (${c.id})`,
        `  board:    ${c.board_id}`,
        `  column:   ${c.column_id}`,
        `  assignee: ${c.assignee_id ?? '(unassigned)'}`,
        `  created:  ${c.created_at}  by ${c.created_by}`,
      ]
      if (Array.isArray(c.mentions) && c.mentions.length > 0) {
        lines.push(`  mentions: ${c.mentions.map((m) => '@' + m).join(' ')}`)
      }
      if (c.description) lines.push('', c.description)
      if (comments.rows.length > 0) {
        lines.push('', `--- ${comments.rows.length} comment(s) ---`)
        for (const cm of comments.rows) {
          lines.push(`  ${cm.created_at}  ${cm.author_id}: ${cm.body}`)
        }
      }
      return ok(lines.join('\n'))
    }
  
    if (op === 'add' || op === 'create') {
      const boardId = parsed.positional[1]
      const title = parsed.positional.slice(2).join(' ').trim()
        || (typeof parsed.flags.title === 'string' ? parsed.flags.title : '')
      if (!boardId || !title) {
        return err('usage: card add <board_id> "<title>" --column <col_id> [--description "..."] [--assign <id>]')
      }
      const columnId = String(parsed.flags.column ?? parsed.flags.col ?? '').trim()
      if (!columnId) return err('--column <col_id> required (run `lingxiloop kanban columns <board_id>` to list)')
      const b = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM boards WHERE id = $1 AND project_id = $2 LIMIT 1`, [boardId, projectId],
      )
      if (b.rows.length === 0 || b.rows[0].company_id !== companyId) return err(`board ${boardId} not found`)
      const colCheck = await pool.query(
        `SELECT 1 FROM board_columns WHERE id = $1 AND board_id = $2 LIMIT 1`,
        [columnId, boardId],
      )
      if (colCheck.rows.length === 0) return err(`column ${columnId} not in board ${boardId}`)
      const description = typeof parsed.flags.description === 'string'
        ? unescapeChat(parsed.flags.description).slice(0, 8000) : null
      const assignee = typeof parsed.flags.assign === 'string'
        ? String(parsed.flags.assign).trim() : null
      const { rows: posRows } = await pool.query<{ max: number | null }>(
        `SELECT MAX(position) AS max FROM board_cards WHERE column_id = $1`, [columnId],
      )
      const position = (Number(posRows[0]?.max ?? 0)) + 1000
      const mentions = await cliParseMentions(companyId, `${title}\n${description ?? ''}`)
      const id = `card-${randomUUID().slice(0, 12)}`
      await pool.query(
        `INSERT INTO board_cards
           (id, board_id, column_id, title, description, position, assignee_id, mentions, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [id, boardId, columnId, title.slice(0, 200), description, position, assignee, JSON.stringify(mentions), me],
      )
      await pool.query(`UPDATE boards SET updated_at = NOW() WHERE id = $1`, [boardId])
      await publishBoardCli({
        companyId, kind: 'card.created', boardId, cardId: id, columnId, mentions, actorId: me,
      })
      await wakeMentionedAgentsCli({ companyId, mentions, actorId: me })
      if (assignee && assignee !== me) {
        await wakeMentionedAgentsCli({ companyId, mentions: [assignee], actorId: me })
      }
      return ok(`added card ${id}: ${title}${mentions.length > 0 ? `  · mentions: ${mentions.map((m) => '@' + m).join(' ')}` : ''}`, [{
        event: 'kanban.card_created',
        command: 'card add',
        boardId,
        cardId: id,
        columnId,
        actorId: me,
        companyId,
        assigneeId: assignee,
        mentions,
        title,
        visibleToUser: true,
      }])
    }
  
    if (op === 'move') {
      const cardId = parsed.positional[1]
      const toCol = String(parsed.flags.to ?? parsed.flags.column ?? parsed.flags.col ?? '').trim()
      if (!cardId || !toCol) return err('usage: card move <card_id> --to <column_id>')
      const home = await resolveCardBoard(cardId)
      if (!home) return err(`card ${cardId} not found`)
      const colCheck = await pool.query(
        `SELECT 1 FROM board_columns WHERE id = $1 AND board_id = $2 LIMIT 1`,
        [toCol, home.boardId],
      )
      if (colCheck.rows.length === 0) return err(`column ${toCol} not in board ${home.boardId}`)
      const { rows: posRows } = await pool.query<{ max: number | null }>(
        `SELECT MAX(position) AS max FROM board_cards WHERE column_id = $1`, [toCol],
      )
      const position = (Number(posRows[0]?.max ?? 0)) + 1000
      await pool.query(
        `UPDATE board_cards SET column_id = $1, position = $2, updated_at = NOW() WHERE id = $3`,
        [toCol, position, cardId],
      )
      await pool.query(`UPDATE boards SET updated_at = NOW() WHERE id = $1`, [home.boardId])
      await publishBoardCli({
        companyId, kind: 'card.moved', boardId: home.boardId, cardId, columnId: toCol, actorId: me,
      })
      return ok(`moved card ${cardId} → ${toCol}`, [{
        event: 'kanban.card_moved',
        command: 'card move',
        boardId: home.boardId,
        cardId,
        fromColumnId: home.columnId,
        columnId: toCol,
        actorId: me,
        companyId,
        visibleToUser: true,
      }])
    }
  
    if (op === 'assign') {
      const cardId = parsed.positional[1]
      const who = parsed.positional[2] // pass "null" or omit to unassign
      if (!cardId) return err('usage: card assign <card_id> <participant_id|null>')
      const home = await resolveCardBoard(cardId)
      if (!home) return err(`card ${cardId} not found`)
      const assignee = (!who || who.toLowerCase() === 'null' || who === '-') ? null : who.trim()
      await pool.query(
        `UPDATE board_cards SET assignee_id = $1, updated_at = NOW() WHERE id = $2`,
        [assignee, cardId],
      )
      await publishBoardCli({
        companyId, kind: 'card.updated', boardId: home.boardId, cardId, actorId: me,
      })
      if (assignee && assignee !== me) {
        await wakeMentionedAgentsCli({ companyId, mentions: [assignee], actorId: me })
      }
      return ok(assignee ? `assigned card ${cardId} → @${assignee}` : `unassigned card ${cardId}`, [{
        event: 'kanban.card_assigned',
        command: 'card assign',
        boardId: home.boardId,
        cardId,
        actorId: me,
        companyId,
        assigneeId: assignee,
        visibleToUser: true,
      }])
    }
  
    if (op === 'claim') {
      // ATOMIC EXCLUSIVE CLAIM (the single most
      // important primitive for non-divergent collaboration). Win ONLY if the card
      // is unclaimed, already yours, or its claim has gone STALE (the claimant likely
      // died / went idle ≥20min without touching it). The WHERE guard is the gate and
      // rowCount is the SINGLE SOURCE OF TRUTH, so two agents racing the same card can
      // NEVER both win — exactly one claims it; everyone else is told to move on.
      const cardId = parsed.positional[1]
      if (!cardId) return err('usage: card claim <card_id>')
      const home = await resolveCardBoard(cardId)
      if (!home) return err(`card ${cardId} not found`)
      const claimed = await pool.query<{ id: string }>(
        `UPDATE board_cards SET assignee_id = $1, updated_at = NOW()
           WHERE id = $2
             AND (assignee_id IS NULL OR assignee_id = $1
                  OR updated_at < NOW() - INTERVAL '20 minutes')
         RETURNING id`,
        [me, cardId],
      )
      if ((claimed.rowCount ?? 0) === 0) {
        const cur = await pool.query<{ assignee_id: string | null }>(
          `SELECT assignee_id FROM board_cards WHERE id = $1 LIMIT 1`, [cardId],
        )
        const holder = cur.rows[0]?.assignee_id
        return err(`claim failed: card ${cardId} is already being worked by @${holder ?? '?'} — move on to another task`)
      }
      await publishBoardCli({ companyId, kind: 'card.updated', boardId: home.boardId, cardId, actorId: me })
      return ok(`claimed card ${cardId} — it's yours. Do the work, post progress with \`card comment\`, move it with \`card move\`, and release with \`card assign ${cardId} null\` (or move to a done column) when finished.`, [{
        event: 'kanban.card_claimed',
        command: 'card claim',
        boardId: home.boardId,
        cardId,
        actorId: me,
        companyId,
        assigneeId: me,
        visibleToUser: true,
      }])
    }
  
    if (op === 'rename' || op === 'edit') {
      const cardId = parsed.positional[1]
      if (!cardId) return err('usage: card rename <card_id> --title "..." [--description "..."]')
      const home = await resolveCardBoard(cardId)
      if (!home) return err(`card ${cardId} not found`)
      const cur = await pool.query<{ title: string; description: string | null }>(
        `SELECT title, description FROM board_cards WHERE id = $1 LIMIT 1`, [cardId],
      )
      let nextTitle = cur.rows[0].title
      let nextDesc = cur.rows[0].description
      const sets: string[] = []
      const params: unknown[] = []
      if (typeof parsed.flags.title === 'string') {
        nextTitle = unescapeChat(parsed.flags.title).slice(0, 200)
        params.push(nextTitle); sets.push(`title = $${params.length}`)
      }
      if (typeof parsed.flags.description === 'string') {
        nextDesc = unescapeChat(parsed.flags.description).slice(0, 8000) || null
        params.push(nextDesc); sets.push(`description = $${params.length}`)
      }
      if (sets.length === 0) return err('nothing to update — pass --title or --description')
      const mentions = await cliParseMentions(companyId, `${nextTitle}\n${nextDesc ?? ''}`)
      params.push(JSON.stringify(mentions)); sets.push(`mentions = $${params.length}::jsonb`)
      params.push(cardId)
      await pool.query(
        `UPDATE board_cards SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
        params,
      )
      await publishBoardCli({
        companyId, kind: 'card.updated', boardId: home.boardId, cardId, mentions, actorId: me,
      })
      await wakeMentionedAgentsCli({ companyId, mentions, actorId: me })
      return ok(`updated card ${cardId}${mentions.length > 0 ? `  · mentions: ${mentions.map((m) => '@' + m).join(' ')}` : ''}`, [{
        event: 'kanban.card_updated',
        command: op === 'rename' ? 'card rename' : 'card edit',
        boardId: home.boardId,
        cardId,
        actorId: me,
        companyId,
        mentions,
        title: nextTitle,
        visibleToUser: true,
      }])
    }
  
    if (op === 'comment') {
      const cardId = parsed.positional[1]
      const body = parsed.positional.slice(2).join(' ').trim()
        || (typeof parsed.flags.body === 'string' ? unescapeChat(parsed.flags.body) : '')
      if (!cardId || !body) return err('usage: card comment <card_id> "<body>"')
      const home = await resolveCardBoard(cardId)
      if (!home) return err(`card ${cardId} not found`)
      const mentions = await cliParseMentions(companyId, body)
      const id = `cmt-${randomUUID().slice(0, 12)}`
      await pool.query(
        `INSERT INTO board_card_comments (id, card_id, author_id, body, mentions)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [id, cardId, me, body.slice(0, 8000), JSON.stringify(mentions)],
      )
      await pool.query(`UPDATE board_cards SET updated_at = NOW() WHERE id = $1`, [cardId])
      await pool.query(`UPDATE boards SET updated_at = NOW() WHERE id = $1`, [home.boardId])
      await publishBoardCli({
        companyId, kind: 'comment.created', boardId: home.boardId, cardId, commentId: id, mentions, actorId: me,
      })
      await wakeMentionedAgentsCli({ companyId, mentions, actorId: me })
      return ok(`commented on ${cardId}${mentions.length > 0 ? `  · mentions: ${mentions.map((m) => '@' + m).join(' ')}` : ''}`, [{
        event: 'kanban.comment_created',
        command: 'card comment',
        boardId: home.boardId,
        cardId,
        commentId: id,
        actorId: me,
        companyId,
        mentions,
        visibleToUser: true,
      }])
    }
  
    if (op === 'delete-comment' || op === 'rm-comment') {
      const cardId = parsed.positional[1]
      const commentId = parsed.positional[2]
      if (!cardId || !commentId) return err(`usage: card ${op} <card_id> <comment_id>`)
      const home = await resolveCardBoard(cardId)
      if (!home) return err(`card ${cardId} not found`)
      const r = await pool.query(
        `DELETE FROM board_card_comments
          WHERE id = $1 AND card_id = $2 AND author_id = $3`,
        [commentId, cardId, me],
      )
      if ((r.rowCount ?? 0) === 0) return err(`comment ${commentId} not found or not authored by ${me}`)
      await publishBoardCli({
        companyId, kind: 'comment.deleted', boardId: home.boardId, cardId, commentId, actorId: me,
      })
      return ok(`deleted comment ${commentId}`, [{
        event: 'kanban.comment_deleted',
        command: `card ${op}`,
        boardId: home.boardId,
        cardId,
        commentId,
        actorId: me,
        companyId,
        visibleToUser: true,
      }])
    }
  
    if (op === 'delete' || op === 'rm') {
      const cardId = parsed.positional[1]
      if (!cardId) return err('usage: card delete <card_id>')
      const home = await resolveCardBoard(cardId)
      if (!home) return err(`card ${cardId} not found`)
      await pool.query(`DELETE FROM board_cards WHERE id = $1`, [cardId])
      await publishBoardCli({
        companyId, kind: 'card.deleted', boardId: home.boardId, cardId, actorId: me,
      })
      return ok(`deleted card ${cardId}`, [{
        event: 'kanban.card_deleted',
        command: 'card delete',
        boardId: home.boardId,
        cardId,
        actorId: me,
        companyId,
        visibleToUser: true,
      }])
    }
  
    return err(`usage: card <ls|show|add|move|assign|rename|comment|delete-comment|delete> [...]`)
  }
  
  /* ============== action subcommands → executeTool() ============== */
  
  /**
   * Map (subcommand, parsed args) to the tool's expected argument shape.
   * Returns the JSON args for executeTool, or an error string.
   */
  return { cmdBoard, cmdClaim, cmdCard }
}
