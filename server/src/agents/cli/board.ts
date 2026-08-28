import {
  addAgentBoardCardComment,
  addAgentBoardColumn,
  claimAgentBoardCard,
  createAgentBoard,
  createAgentBoardCard,
  deleteAgentBoard,
  deleteAgentBoardCard,
  deleteAgentBoardCardComment,
  deleteAgentBoardColumn,
  getAgentBoard,
  getAgentBoardCard,
  getAgentBoardMentionInbox,
  isBoardNotFound,
  listAgentBoardCardComments,
  listAgentBoards,
  moveAgentBoardCard,
  updateAgentBoard,
  updateAgentBoardCard,
  updateAgentBoardColumn,
} from '../../modules/boards/public.js'
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

type AgentBoardScope = { userId: string; companyId: string; projectId: string }

export function createBoardCommands(dependencies: BoardCommandDependencies) {
  const { ok, err, agentCompany, resolveCliProjectId } = dependencies

  async function resolveScope(
    parsed: ParsedArgs,
    internal: RunCliInternalContext,
  ): Promise<{ ok: true; scope: AgentBoardScope } | { ok: false; result: CliResult }> {
    const userId = resolveAs(parsed)
    const companyId = await agentCompany(userId)
    if (!companyId) return { ok: false, result: err(`unknown agent ${userId} (no company)`) }
    const projectId = await resolveCliProjectId(companyId, internal.projectId)
    return { ok: true, scope: { userId, companyId, projectId } }
  }

  async function captureNotFound<T>(work: () => Promise<T>): Promise<T | null> {
    try {
      return await work()
    } catch (error) {
      if (isBoardNotFound(error)) return null
      throw error
    }
  }

  async function cmdBoard(
    parsed: ParsedArgs,
    internal: RunCliInternalContext = {},
  ): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'ls'
    const resolved = await resolveScope(parsed, internal)
    if (!resolved.ok) return resolved.result
    const { scope } = resolved

    if (op === 'ls' || op === 'list') {
      const boards = await listAgentBoards(scope)
      const rows = boards.map((board) => ({
        id: board.id,
        title: board.title,
        description: board.description,
        updated_at: board.updatedAt,
      }))
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      if (rows.length === 0) return ok('(no boards in this workspace)')
      return ok([
        `${rows.length} board(s):`,
        '',
        ...rows.map((board) => `  ${board.id.padEnd(20)} ${board.title}`),
      ].join('\n'))
    }

    if (op === 'show' || op === 'view') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: kanban show <board_id>')
      const snapshot = await captureNotFound(() => getAgentBoard(scope, boardId))
      if (!snapshot) return err(`board ${boardId} not found`)
      if (parsed.flags.json) return ok(JSON.stringify({
        board: {
          id: snapshot.id,
          title: snapshot.title,
          description: snapshot.description,
          company_id: scope.companyId,
        },
        columns: snapshot.columns.map((column) => ({
          id: column.id, title: column.title, position: column.position,
        })),
        cards: snapshot.cards.map((card) => ({
          id: card.id,
          column_id: card.columnId,
          title: card.title,
          assignee_id: card.assigneeId,
          mentions: card.mentions,
          position: card.position,
        })),
      }, null, 2))
      const cardsByColumn = new Map<string, typeof snapshot.cards>()
      for (const card of snapshot.cards) {
        const cards = cardsByColumn.get(card.columnId) ?? []
        cards.push(card)
        cardsByColumn.set(card.columnId, cards)
      }
      const lines = [`# ${snapshot.title}  (${snapshot.id})`]
      if (snapshot.description) lines.push(snapshot.description)
      for (const column of snapshot.columns) {
        const cards = cardsByColumn.get(column.id) ?? []
        lines.push('', `## ${column.title}  (${column.id})  · ${cards.length} card(s)`)
        for (const card of cards) {
          const assignee = card.assigneeId ? `@${card.assigneeId}` : '(unassigned)'
          const mentions = card.mentions.length > 0
            ? `  · mentions: ${card.mentions.map((id) => `@${id}`).join(' ')}`
            : ''
          lines.push(`  - ${card.id.padEnd(20)} ${assignee.padEnd(16)} ${card.title}${mentions}`)
        }
      }
      return ok(lines.join('\n'))
    }

    if (op === 'create' || op === 'new') {
      const title = parsed.positional.slice(1).join(' ').trim()
        || (typeof parsed.flags.title === 'string' ? parsed.flags.title.trim() : '')
      if (!title) return err('usage: kanban create "<title>" [--description "..."]')
      const description = typeof parsed.flags.description === 'string'
        ? unescapeChat(parsed.flags.description).trim().slice(0, 4000) || undefined
        : undefined
      const created = await createAgentBoard(
        scope,
        { title: title.slice(0, 200), ...(description ? { description } : {}) },
        { idempotencyKey: internal.idempotencyKey },
      )
      if (created.replayed) return ok(`created board ${created.id}: ${title} [replayed]`)
      return ok(`created board ${created.id}: ${title}`, [{
        event: 'kanban.board_created',
        command: 'kanban create',
        boardId: created.id,
        actorId: scope.userId,
        companyId: scope.companyId,
        title,
        visibleToUser: true,
      }])
    }

    if (op === 'rename' || op === 'edit' || op === 'update') {
      const boardId = parsed.positional[1]
      if (!boardId) return err(`usage: kanban ${op} <board_id> --title "..." [--description "..."]`)
      const patch: { title?: string; description?: string | null } = {}
      if (typeof parsed.flags.title === 'string' || parsed.positional.length > 2) {
        const title = (typeof parsed.flags.title === 'string'
          ? unescapeChat(parsed.flags.title)
          : parsed.positional.slice(2).join(' ')).trim().slice(0, 200)
        if (!title) return err('--title cannot be empty')
        patch.title = title
      }
      if (typeof parsed.flags.description === 'string') {
        patch.description = unescapeChat(parsed.flags.description).trim().slice(0, 4000) || null
      }
      if (Object.keys(patch).length === 0) return err('nothing to update — pass --title or --description')
      const updated = await captureNotFound(async () => {
        await updateAgentBoard(scope, boardId, patch)
        return getAgentBoard(scope, boardId)
      })
      if (!updated) return err(`board ${boardId} not found`)
      return ok(`updated board ${boardId}: ${updated.title}`, [{
        event: 'kanban.board_updated',
        command: `kanban ${op}`,
        boardId,
        actorId: scope.userId,
        companyId: scope.companyId,
        title: updated.title,
        description: updated.description,
        visibleToUser: true,
      }])
    }

    if (op === 'columns' || op === 'cols') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: kanban columns <board_id>')
      const snapshot = await captureNotFound(() => getAgentBoard(scope, boardId))
      if (!snapshot) return err(`board ${boardId} not found`)
      const rows = snapshot.columns.map((column) => ({ id: column.id, title: column.title }))
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      return ok(rows.map((column) => `  ${column.id.padEnd(20)} ${column.title}`).join('\n') || '(no columns)')
    }

    if (op === 'add-column' || op === 'add-col') {
      const boardId = parsed.positional[1]
      const title = parsed.positional.slice(2).join(' ').trim()
      if (!boardId || !title) return err('usage: kanban add-column <board_id> "<title>"')
      const created = await captureNotFound(() => addAgentBoardColumn(scope, boardId, title.slice(0, 100)))
      if (!created) return err(`board ${boardId} not found`)
      return ok(`added column ${created.id}: ${title}`, [{
        event: 'kanban.column_created',
        command: 'kanban add-column',
        boardId,
        columnId: created.id,
        actorId: scope.userId,
        companyId: scope.companyId,
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
      const patch: { title?: string; position?: number } = {}
      if (typeof parsed.flags.title === 'string' || parsed.positional.length > 3) {
        const title = (typeof parsed.flags.title === 'string'
          ? unescapeChat(parsed.flags.title)
          : parsed.positional.slice(3).join(' ')).trim().slice(0, 100)
        if (!title) return err('--title cannot be empty')
        patch.title = title
      }
      if (parsed.flags.position !== undefined) {
        const position = Number(parsed.flags.position)
        if (!Number.isFinite(position)) return err(`invalid --position: ${parsed.flags.position}`)
        patch.position = position
      }
      if (Object.keys(patch).length === 0) return err('nothing to update — pass --title or --position')
      const column = await captureNotFound(async () => {
        await updateAgentBoardColumn(scope, boardId, columnId, patch)
        const snapshot = await getAgentBoard(scope, boardId)
        return snapshot.columns.find((candidate) => candidate.id === columnId) ?? null
      })
      if (!column) return err(`column ${columnId} not in board ${boardId}`)
      return ok(`updated column ${columnId}: ${column.title}`, [{
        event: 'kanban.column_updated',
        command: `kanban ${op}`,
        boardId,
        columnId,
        actorId: scope.userId,
        companyId: scope.companyId,
        title: column.title,
        position: column.position,
        visibleToUser: true,
      }])
    }

    if (op === 'delete-column' || op === 'rm-column') {
      const boardId = parsed.positional[1]
      const columnId = parsed.positional[2]
      if (!boardId || !columnId) return err(`usage: kanban ${op} <board_id> <column_id>`)
      const removed = await captureNotFound(() => deleteAgentBoardColumn(scope, boardId, columnId))
      if (!removed) return err(`column ${columnId} not in board ${boardId}`)
      return ok(`deleted column ${columnId}`, [{
        event: 'kanban.column_deleted',
        command: `kanban ${op}`,
        boardId,
        columnId,
        actorId: scope.userId,
        companyId: scope.companyId,
        visibleToUser: true,
      }])
    }

    if (op === 'delete' || op === 'rm') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: kanban delete <board_id>')
      const removed = await captureNotFound(() => deleteAgentBoard(scope, boardId))
      if (!removed) return err(`board ${boardId} not found`)
      return ok(`deleted board ${boardId}`, [{
        event: 'kanban.board_deleted',
        command: 'kanban delete',
        boardId,
        actorId: scope.userId,
        companyId: scope.companyId,
        visibleToUser: true,
      }])
    }

    if (op === 'mentions') {
      const peek = Boolean(parsed.flags.peek)
      const inbox = await getAgentBoardMentionInbox(scope, peek)
      if (parsed.flags.json) return ok(JSON.stringify({
        since: inbox.since,
        cards: inbox.cards.map((card) => ({
          id: card.id,
          board_id: card.boardId,
          column_id: card.columnId,
          title: card.title,
          updated_at: card.updatedAt,
          created_by: card.createdBy,
          board_title: card.boardTitle,
        })),
        comments: inbox.comments.map((comment) => ({
          id: comment.id,
          card_id: comment.cardId,
          body: comment.body,
          author_id: comment.authorId,
          created_at: comment.createdAt,
          board_id: comment.boardId,
          card_title: comment.cardTitle,
          board_title: comment.boardTitle,
        })),
      }, null, 2))
      if (inbox.cards.length === 0 && inbox.comments.length === 0) {
        return ok(`(no new kanban @-mentions for ${scope.userId} since ${inbox.since})`)
      }
      const lines = [`${inbox.cards.length + inbox.comments.length} new kanban @-mention(s) for ${scope.userId}:`]
      if (inbox.cards.length > 0) {
        lines.push('', '--- cards ---')
        for (const card of inbox.cards) {
          lines.push(`  ${card.id}  [${card.boardTitle} / ${card.columnId}]  ${card.title}  · by ${card.createdBy} at ${card.updatedAt}`)
        }
      }
      if (inbox.comments.length > 0) {
        lines.push('', '--- comments ---')
        for (const comment of inbox.comments) {
          lines.push(`  ${comment.id}  on card ${comment.cardId} [${comment.boardTitle}]  · by ${comment.authorId} at ${comment.createdAt}`)
          lines.push(`    "${comment.body.replace(/\n/g, ' ').slice(0, 200)}"`)
        }
      }
      if (!peek) lines.push('', '(read cursor advanced — next call shows only newer mentions; use --peek to keep it)')
      return ok(lines.join('\n'))
    }

    return err('usage: kanban <ls|show|create|rename|columns|add-column|edit-column|delete-column|delete|mentions> [...]')
  }

  async function cmdClaim(parsed: ParsedArgs, mode: 'claim' | 'unclaim'): Promise<CliResult> {
    const userId = resolveAs(parsed)
    const companyId = await agentCompany(userId)
    if (!companyId) return err(`unknown agent ${userId} (no company)`)
    const key = (parsed.positional[0] ?? '').trim()
    if (!key) {
      return err(`usage: ${mode} "<what you're claiming>" [--in <conversation_id>]${mode === 'claim' ? ' [--ttl <seconds>]' : ''}`)
    }
    if (mode === 'unclaim') {
      return ok('ok — nothing to release. LingxiLoop no longer uses generic claims; just post, the server settles races.')
    }
    return err(
      'Claiming a turn / game slot / activity is not a thing anymore. '
      + 'Do NOT reserve a position and wait for it. Read the latest posts and send the REAL next item (`lingxiloop reply`); '
      + 'if a peer moved the room while you composed, the reply comes back HELD with the newer messages — re-read and resend. '
      + 'That IS the coordination. The only claim that exists is for a genuine shared DELIVERABLE on the board: '
      + '`lingxiloop card claim <cardId>`.',
    )
  }

  async function cmdCard(
    parsed: ParsedArgs,
    internal: RunCliInternalContext = {},
  ): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'ls'
    const resolved = await resolveScope(parsed, internal)
    if (!resolved.ok) return resolved.result
    const { scope } = resolved

    if (op === 'ls' || op === 'list') {
      const boardId = parsed.positional[1]
      if (!boardId) return err('usage: card ls <board_id>')
      const snapshot = await captureNotFound(() => getAgentBoard(scope, boardId))
      if (!snapshot) return err(`board ${boardId} not found`)
      const rows = snapshot.cards.map((card) => ({
        id: card.id,
        column_id: card.columnId,
        title: card.title,
        assignee_id: card.assigneeId,
        mentions: card.mentions,
      }))
      if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
      if (rows.length === 0) return ok('(no cards)')
      return ok(rows.map((card) => {
        const assignee = card.assignee_id ? `@${card.assignee_id}` : '(unassigned)'
        return `  ${card.id.padEnd(20)} [${card.column_id.slice(0, 16).padEnd(16)}] ${assignee.padEnd(16)} ${card.title}`
      }).join('\n'))
    }

    const cardId = parsed.positional[1]
    if (!cardId) return err(`usage: card ${op} <card_id> [...]`)
    const detail = await captureNotFound(() => getAgentBoardCard(scope, cardId))
    if (!detail) return err(`card ${cardId} not found`)
    const boardId = detail.board.id

    if (op === 'show') {
      const comments = await listAgentBoardCardComments(scope, boardId, cardId)
      if (parsed.flags.json) return ok(JSON.stringify({
        card: {
          id: detail.card.id,
          board_id: detail.card.boardId,
          column_id: detail.card.columnId,
          title: detail.card.title,
          description: detail.card.description,
          assignee_id: detail.card.assigneeId,
          mentions: detail.card.mentions,
          created_by: detail.card.createdBy,
          created_at: detail.card.createdAt,
          updated_at: detail.card.updatedAt,
          company_id: scope.companyId,
        },
        comments: comments.map((comment) => ({
          id: comment.id,
          author_id: comment.authorId,
          body: comment.body,
          created_at: comment.createdAt,
        })),
      }, null, 2))
      const lines = [
        `# ${detail.card.title}  (${detail.card.id})`,
        `  board:    ${detail.card.boardId}`,
        `  column:   ${detail.card.columnId}`,
        `  assignee: ${detail.card.assigneeId ?? '(unassigned)'}`,
        `  created:  ${detail.card.createdAt}  by ${detail.card.createdBy}`,
      ]
      if (detail.card.mentions.length > 0) {
        lines.push(`  mentions: ${detail.card.mentions.map((id) => `@${id}`).join(' ')}`)
      }
      if (detail.card.description) lines.push('', detail.card.description)
      if (comments.length > 0) {
        lines.push('', `--- ${comments.length} comment(s) ---`)
        for (const comment of comments) {
          lines.push(`  ${comment.createdAt}  ${comment.authorId}: ${comment.body}`)
        }
      }
      return ok(lines.join('\n'))
    }

    if (op === 'add' || op === 'create') {
      return err('usage: card add <board_id> "<title>" --column <col_id> [--description "..."] [--assign <id>]')
    }

    if (op === 'move') {
      const columnId = String(parsed.flags.to ?? parsed.flags.column ?? parsed.flags.col ?? '').trim()
      if (!columnId) return err('usage: card move <card_id> --to <column_id>')
      const moved = await captureNotFound(() => moveAgentBoardCard(scope, boardId, cardId, columnId))
      if (!moved) return err(`column ${columnId} not in board ${boardId}`)
      return ok(`moved card ${cardId} → ${columnId}`, [{
        event: 'kanban.card_moved',
        command: 'card move',
        boardId,
        cardId,
        fromColumnId: moved.fromColumnId,
        columnId,
        actorId: scope.userId,
        companyId: scope.companyId,
        visibleToUser: true,
      }])
    }

    if (op === 'assign') {
      const rawAssignee = parsed.positional[2]
      const assigneeId = !rawAssignee || rawAssignee.toLowerCase() === 'null' || rawAssignee === '-'
        ? null
        : rawAssignee.trim()
      const updated = await captureNotFound(() => updateAgentBoardCard(
        scope, boardId, cardId, { assigneeId }, { idempotencyKey: internal.idempotencyKey },
      ))
      if (!updated) return err(`card ${cardId} not found`)
      return ok(assigneeId ? `assigned card ${cardId} → @${assigneeId}` : `unassigned card ${cardId}`, [{
        event: 'kanban.card_assigned',
        command: 'card assign',
        boardId,
        cardId,
        actorId: scope.userId,
        companyId: scope.companyId,
        assigneeId,
        visibleToUser: true,
      }])
    }

    if (op === 'claim') {
      const claimed = await claimAgentBoardCard(scope, boardId, cardId)
      if (claimed.outcome === 'held') {
        return err(`claim failed: card ${cardId} is already being worked by @${claimed.holder ?? '?'} — move on to another task`)
      }
      return ok(`claimed card ${cardId} — it's yours. Do the work, post progress with \`card comment\`, move it with \`card move\`, and release with \`card assign ${cardId} null\` (or move to a done column) when finished.`, [{
        event: 'kanban.card_claimed',
        command: 'card claim',
        boardId,
        cardId,
        actorId: scope.userId,
        companyId: scope.companyId,
        assigneeId: scope.userId,
        visibleToUser: true,
      }])
    }

    if (op === 'rename' || op === 'edit') {
      const patch: { title?: string; description?: string | null } = {}
      if (typeof parsed.flags.title === 'string') {
        patch.title = unescapeChat(parsed.flags.title).slice(0, 200)
      }
      if (typeof parsed.flags.description === 'string') {
        patch.description = unescapeChat(parsed.flags.description).slice(0, 8000) || null
      }
      if (Object.keys(patch).length === 0) return err('nothing to update — pass --title or --description')
      const result = await updateAgentBoardCard(
        scope, boardId, cardId, patch, { idempotencyKey: internal.idempotencyKey },
      )
      const updated = await getAgentBoardCard(scope, cardId)
      return ok(`updated card ${cardId}${result.mentions?.length ? `  · mentions: ${result.mentions.map((id) => `@${id}`).join(' ')}` : ''}`, [{
        event: 'kanban.card_updated',
        command: op === 'rename' ? 'card rename' : 'card edit',
        boardId,
        cardId,
        actorId: scope.userId,
        companyId: scope.companyId,
        mentions: result.mentions,
        title: updated.card.title,
        visibleToUser: true,
      }])
    }

    if (op === 'comment') {
      const body = parsed.positional.slice(2).join(' ').trim()
        || (typeof parsed.flags.body === 'string' ? unescapeChat(parsed.flags.body) : '')
      if (!body) return err('usage: card comment <card_id> "<body>"')
      const created = await addAgentBoardCardComment(
        scope,
        boardId,
        cardId,
        body.slice(0, 8000),
        { idempotencyKey: internal.idempotencyKey },
      )
      if (created.replayed) return ok(`commented on ${cardId} [replayed]`)
      return ok(`commented on ${cardId}${created.mentions.length > 0 ? `  · mentions: ${created.mentions.map((id) => `@${id}`).join(' ')}` : ''}`, [{
        event: 'kanban.comment_created',
        command: 'card comment',
        boardId,
        cardId,
        commentId: created.id,
        actorId: scope.userId,
        companyId: scope.companyId,
        mentions: created.mentions,
        visibleToUser: true,
      }])
    }

    if (op === 'delete-comment' || op === 'rm-comment') {
      const commentId = parsed.positional[2]
      if (!commentId) return err(`usage: card ${op} <card_id> <comment_id>`)
      const removed = await captureNotFound(() => deleteAgentBoardCardComment(
        scope, boardId, cardId, commentId,
      ))
      if (!removed) return err(`comment ${commentId} not found or not authored by ${scope.userId}`)
      return ok(`deleted comment ${commentId}`, [{
        event: 'kanban.comment_deleted',
        command: `card ${op}`,
        boardId,
        cardId,
        commentId,
        actorId: scope.userId,
        companyId: scope.companyId,
        visibleToUser: true,
      }])
    }

    if (op === 'delete' || op === 'rm') {
      const removed = await captureNotFound(() => deleteAgentBoardCard(scope, boardId, cardId))
      if (!removed) return err(`card ${cardId} not found`)
      return ok(`deleted card ${cardId}`, [{
        event: 'kanban.card_deleted',
        command: 'card delete',
        boardId,
        cardId,
        actorId: scope.userId,
        companyId: scope.companyId,
        visibleToUser: true,
      }])
    }

    return err('usage: card <ls|show|add|move|assign|claim|rename|comment|delete-comment|delete> [...]')
  }

  async function cmdCardWithCreate(
    parsed: ParsedArgs,
    internal: RunCliInternalContext = {},
  ): Promise<CliResult> {
    const op = parsed.positional[0] ?? 'ls'
    if (op !== 'add' && op !== 'create') return cmdCard(parsed, internal)
    const resolved = await resolveScope(parsed, internal)
    if (!resolved.ok) return resolved.result
    const { scope } = resolved
    const boardId = parsed.positional[1]
    const title = parsed.positional.slice(2).join(' ').trim()
      || (typeof parsed.flags.title === 'string' ? parsed.flags.title.trim() : '')
    if (!boardId || !title) {
      return err('usage: card add <board_id> "<title>" --column <col_id> [--description "..."] [--assign <id>]')
    }
    const columnId = String(parsed.flags.column ?? parsed.flags.col ?? '').trim()
    if (!columnId) return err('--column <col_id> required (run `lingxiloop kanban columns <board_id>` to list)')
    const description = typeof parsed.flags.description === 'string'
      ? unescapeChat(parsed.flags.description).slice(0, 8000) || undefined
      : undefined
    const assigneeId = typeof parsed.flags.assign === 'string'
      ? String(parsed.flags.assign).trim() || undefined
      : undefined
    const created = await captureNotFound(() => createAgentBoardCard(
      scope,
      boardId,
      {
        columnId,
        title: title.slice(0, 200),
        ...(description !== undefined ? { description } : {}),
        ...(assigneeId !== undefined ? { assigneeId } : {}),
      },
      { idempotencyKey: internal.idempotencyKey },
    ))
    if (!created) return err(`column ${columnId} not in board ${boardId}`)
    if (created.replayed) return ok(`added card ${created.id}: ${title} [replayed]`)
    return ok(`added card ${created.id}: ${title}${created.mentions.length > 0 ? `  · mentions: ${created.mentions.map((id) => `@${id}`).join(' ')}` : ''}`, [{
      event: 'kanban.card_created',
      command: 'card add',
      boardId,
      cardId: created.id,
      columnId,
      actorId: scope.userId,
      companyId: scope.companyId,
      assigneeId: assigneeId ?? null,
      mentions: created.mentions,
      title,
      visibleToUser: true,
    }])
  }

  return { cmdBoard, cmdClaim, cmdCard: cmdCardWithCreate }
}
