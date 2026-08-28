import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type {
  BoardEventInput,
  BoardScope,
  CreateBoardInput,
  CreateCardInput,
  UpdateBoardInput,
  UpdateCardInput,
  UpdateColumnInput,
} from './contracts.js'
import {
  appendCard,
  appendColumn,
  appendComment,
  boardExists,
  boardSnapshot,
  columnExists,
  currentCard,
  deleteBoard,
  deleteCard,
  deleteColumn,
  deleteComment,
  findCard,
  insertBoard,
  listBoards,
  listComments,
  mentionedAgents,
  mentionTargets,
  participantExists,
  updateBoard,
  updateCard,
  updateColumn,
} from './repository.js'

export class BoardApplicationError extends Error {
  constructor(readonly code: 'not_found', message: string) { super(message) }
}

export interface BoardInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  publish(event: BoardEventInput): Promise<void>
  enqueueAgent(args: { companyId: string; agentId: string; reason: 'mention' }): Promise<void>
}

type MentionTarget = { id: string; name: string }

function mentionStartBoundary(text: string, index: number): boolean {
  return index <= 0 || !/[\w@]/.test(text[index - 1])
}

function mentionEndBoundary(text: string, index: number): boolean {
  const next = text[index]
  return !next || !/[a-z0-9_-]/i.test(next)
}

export function parseBoardMentions(text: string, targets: MentionTarget[]): string[] {
  if (!text) return []
  const out: string[] = []
  const seen = new Set<string>()
  const candidates = targets.flatMap((participant) => [
    { id: participant.id, token: participant.id },
    { id: participant.id, token: participant.name.trim() },
  ]).filter((candidate) => candidate.token.length > 0)
    .sort((left, right) => right.token.length - left.token.length)
  const lower = text.toLowerCase()
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '@' || !mentionStartBoundary(text, index)) continue
    const rest = lower.slice(index + 1)
    const match = candidates.find((candidate) =>
      rest.startsWith(candidate.token.toLowerCase())
      && mentionEndBoundary(text, index + 1 + candidate.token.length))
    if (!match || match.id === 'all' || seen.has(match.id)) continue
    seen.add(match.id)
    out.push(match.id)
    index += match.token.length
  }
  return out
}

export class BoardApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: BoardInfrastructure) {}

  boards(scope: Omit<BoardScope, 'userId'>) { return listBoards(this.db, scope.companyId, scope.projectId) }

  async card(scope: Omit<BoardScope, 'userId'>, cardId: string) {
    const card = await findCard(this.db, scope.companyId, scope.projectId, cardId)
    if (!card) throw new BoardApplicationError('not_found', 'not found')
    return card
  }

  async createBoard(scope: BoardScope, input: CreateBoardInput) {
    const id = `board-${randomUUID().slice(0, 12)}`
    const columns = ['Todo', 'Doing', 'Done'].map((title, index) => ({
      id: `col-${randomUUID().slice(0, 12)}`, title, position: (index + 1) * 1000,
    }))
    await this.infrastructure.transaction((db) => insertBoard(db, {
      id, ...scope, title: input.title, description: input.description || null,
      createdBy: scope.userId, columns,
    }))
    await this.publish(scope, { kind: 'board.created', boardId: id })
    return { id }
  }

  async snapshot(scope: Omit<BoardScope, 'userId'>, boardId: string) {
    const snapshot = await boardSnapshot(this.db, scope.companyId, scope.projectId, boardId)
    if (!snapshot) throw new BoardApplicationError('not_found', 'not found')
    return snapshot
  }

  async editBoard(scope: BoardScope, boardId: string, patch: UpdateBoardInput) {
    if (!await updateBoard(this.db, { ...scope, boardId, patch })) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    if (Object.keys(patch).length > 0) await this.publish(scope, { kind: 'board.updated', boardId })
    return { ok: true as const }
  }

  async removeBoard(scope: BoardScope, boardId: string) {
    if (!await deleteBoard(this.db, scope.companyId, scope.projectId, boardId)) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    await this.publish(scope, { kind: 'board.deleted', boardId })
    return { ok: true as const }
  }

  async addColumn(scope: BoardScope, boardId: string, title: string) {
    const id = `col-${randomUUID().slice(0, 12)}`
    const position = await this.infrastructure.transaction((db) => appendColumn(db, { ...scope, boardId, id, title }))
    if (position === null) throw new BoardApplicationError('not_found', 'not found')
    await this.publish(scope, { kind: 'column.created', boardId, columnId: id })
    return { id, position }
  }

  async editColumn(scope: BoardScope, boardId: string, columnId: string, patch: UpdateColumnInput) {
    if (!await updateColumn(this.db, { ...scope, boardId, columnId, patch })) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    if (Object.keys(patch).length > 0) {
      await this.publish(scope, { kind: 'column.updated', boardId, columnId })
    }
    return { ok: true as const }
  }

  async removeColumn(scope: BoardScope, boardId: string, columnId: string) {
    if (!await deleteColumn(this.db, { ...scope, boardId, columnId })) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    await this.publish(scope, { kind: 'column.deleted', boardId, columnId })
    return { ok: true as const }
  }

  async createCard(scope: BoardScope, boardId: string, input: CreateCardInput) {
    if (input.assigneeId && !await participantExists(this.db, scope.companyId, input.assigneeId)) {
      throw new BoardApplicationError('not_found', 'assignee not found')
    }
    const mentions = await this.mentions(scope.companyId, `${input.title}\n${input.description ?? ''}`)
    const id = `card-${randomUUID().slice(0, 12)}`
    const position = await this.infrastructure.transaction((db) => appendCard(db, {
      ...scope, boardId, id, input, mentions,
    }))
    if (position === null) throw new BoardApplicationError('not_found', 'column not found')
    await this.publish(scope, {
      kind: 'card.created', boardId, cardId: id, columnId: input.columnId, mentions,
    })
    await this.wake(scope.companyId, scope.userId, mentions)
    if (input.assigneeId) await this.wake(scope.companyId, scope.userId, [input.assigneeId])
    return { id, position, mentions }
  }

  async editCard(scope: BoardScope, boardId: string, cardId: string, patch: UpdateCardInput) {
    const current = await currentCard(this.db, { ...scope, boardId, cardId })
    if (!current) throw new BoardApplicationError('not_found', 'not found')
    const columnChanged = patch.columnId !== undefined && patch.columnId !== current.column_id
    if (columnChanged && !await columnExists(this.db, scope.companyId, scope.projectId, boardId, patch.columnId!)) {
      throw new BoardApplicationError('not_found', 'column not found')
    }
    if (patch.assigneeId && !await participantExists(this.db, scope.companyId, patch.assigneeId)) {
      throw new BoardApplicationError('not_found', 'assignee not found')
    }
    const proseChanged = patch.title !== undefined || patch.description !== undefined
    const nextTitle = patch.title === undefined ? current.title : patch.title
    const nextDescription = Object.hasOwn(patch, 'description') ? patch.description : current.description
    const mentions = proseChanged
      ? await this.mentions(scope.companyId, `${nextTitle}\n${nextDescription ?? ''}`)
      : undefined
    if (!await this.infrastructure.transaction((db) => updateCard(db, {
      ...scope, boardId, cardId, patch, mentions,
    }))) throw new BoardApplicationError('not_found', 'not found')
    if (Object.keys(patch).length > 0) {
      await this.publish(scope, {
        kind: columnChanged ? 'card.moved' : 'card.updated', boardId, cardId, mentions,
      })
      await this.wake(scope.companyId, scope.userId, mentions)
      if (patch.assigneeId) await this.wake(scope.companyId, scope.userId, [patch.assigneeId])
    }
    return { ok: true as const, mentions }
  }

  async removeCard(scope: BoardScope, boardId: string, cardId: string) {
    if (!await deleteCard(this.db, { ...scope, boardId, cardId })) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    await this.publish(scope, { kind: 'card.deleted', boardId, cardId })
    return { ok: true as const }
  }

  async comments(scope: Omit<BoardScope, 'userId'>, boardId: string, cardId: string) {
    if (!await boardExists(this.db, scope.companyId, scope.projectId, boardId)) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    const comments = await listComments(this.db, { ...scope, boardId, cardId })
    if (!await currentCard(this.db, { ...scope, boardId, cardId })) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    return comments
  }

  async addComment(scope: BoardScope, boardId: string, cardId: string, body: string) {
    const mentions = await this.mentions(scope.companyId, body)
    const id = `cmt-${randomUUID().slice(0, 12)}`
    if (!await this.infrastructure.transaction((db) => appendComment(db, {
      ...scope, boardId, cardId, id, body, mentions,
    }))) throw new BoardApplicationError('not_found', 'not found')
    await this.publish(scope, { kind: 'comment.created', boardId, cardId, commentId: id, mentions })
    await this.wake(scope.companyId, scope.userId, mentions)
    return { id, mentions }
  }

  async removeComment(scope: BoardScope, boardId: string, cardId: string, commentId: string) {
    if (!await deleteComment(this.db, { ...scope, boardId, cardId, commentId })) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    await this.publish(scope, { kind: 'comment.deleted', boardId, cardId, commentId })
    return { ok: true as const }
  }

  private async mentions(companyId: string, text: string): Promise<string[]> {
    return parseBoardMentions(text, await mentionTargets(this.db, companyId))
  }

  private async wake(companyId: string, actorId: string, participants: string[] | undefined): Promise<void> {
    const targets = [...new Set((participants ?? []).filter((id) => id !== actorId))]
    const agents = await mentionedAgents(this.db, companyId, targets)
    await Promise.allSettled(agents.map((agentId) => (
      this.infrastructure.enqueueAgent({ companyId, agentId, reason: 'mention' })
    )))
  }

  private publish(scope: BoardScope, event: Omit<BoardEventInput, 'companyId' | 'workspaceId' | 'actorId'>) {
    return this.infrastructure.publish({
      ...event, companyId: scope.companyId, workspaceId: scope.projectId, actorId: scope.userId,
    }).catch(() => undefined)
  }
}
