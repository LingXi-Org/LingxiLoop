import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type {
  BoardEventInput,
  BoardCommandIdentity,
  BoardScope,
  CreateBoardInput,
  CreateCardInput,
  UpdateBoardInput,
  UpdateCardInput,
  UpdateColumnInput,
} from './contracts.js'
import {
  advanceBoardMentionCursor,
  appendCard,
  appendColumn,
  appendComment,
  boardExists,
  boardSnapshot,
  claimCardForAgent,
  columnExists,
  currentCard,
  deleteBoard,
  deleteCard,
  deleteColumn,
  deleteComment,
  findCard,
  insertBoard,
  listBoards,
  listBoardMentionCards,
  listBoardMentionComments,
  listComments,
  lockBoardMentionWindow,
  mentionedAgents,
  mentionTargets,
  moveCardToColumn,
  participantExists,
  readBoardMentionWindow,
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
  enqueueAgent(args: {
    companyId: string; agentId: string; reason: 'mention'; triggerClientMsgNo: string
  }): Promise<void>
  reportPublishFailure(event: BoardEventInput, error: unknown): void
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

  async createBoard(scope: BoardScope, input: CreateBoardInput, identity: BoardCommandIdentity = {}) {
    const id = identity.idempotencyKey
      ? stableBoardId('board-agent', identity.idempotencyKey)
      : `board-${randomUUID().slice(0, 12)}`
    const columns = ['Todo', 'Doing', 'Done'].map((title, index) => ({
      id: identity.idempotencyKey
        ? stableBoardId('col-agent', `${identity.idempotencyKey}:${index}`, 24)
        : `col-${randomUUID().slice(0, 12)}`,
      title,
      position: (index + 1) * 1000,
    }))
    const created = await this.infrastructure.transaction((db) => insertBoard(db, {
      id, ...scope, title: input.title, description: input.description || null,
      createdBy: scope.userId, columns,
    }))
    if (!created && !await boardExists(this.db, scope.companyId, scope.projectId, id)) {
      throw new BoardApplicationError('not_found', 'idempotent board is outside this workspace')
    }
    if (created) await this.publish(scope, { kind: 'board.created', boardId: id })
    return identity.idempotencyKey ? { id, replayed: !created } : { id }
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

  async createCard(
    scope: BoardScope,
    boardId: string,
    input: CreateCardInput,
    identity: BoardCommandIdentity = {},
  ) {
    if (input.assigneeId && !await participantExists(this.db, scope.companyId, input.assigneeId)) {
      throw new BoardApplicationError('not_found', 'assignee not found')
    }
    const mentions = await this.mentions(scope.companyId, `${input.title}\n${input.description ?? ''}`)
    const id = identity.idempotencyKey
      ? stableBoardId('card-agent', identity.idempotencyKey)
      : `card-${randomUUID().slice(0, 12)}`
    const appended = await this.infrastructure.transaction((db) => appendCard(db, {
      ...scope, boardId, id, input, mentions,
    }))
    if (appended === null) throw new BoardApplicationError('not_found', 'column not found')
    const replayedCard = appended.created
      ? null
      : await findCard(this.db, scope.companyId, scope.projectId, id)
    const effectiveMentions = appended.created
      ? mentions
      : replayedCard?.card.mentions ?? []
    if (appended.created) {
      await this.publish(scope, {
        kind: 'card.created', boardId, cardId: id, columnId: input.columnId, mentions,
      })
    }
    const wakeTrigger = boardWakeTrigger(identity, `card:${id}:created`)
    await this.wake(scope.companyId, scope.userId, effectiveMentions, wakeTrigger)
    const assigneeId = appended.created ? input.assigneeId : replayedCard?.card.assigneeId
    if (assigneeId) await this.wake(scope.companyId, scope.userId, [assigneeId], wakeTrigger)
    return {
      id,
      position: appended.position,
      mentions: effectiveMentions,
      ...(identity.idempotencyKey ? { replayed: !appended.created } : {}),
    }
  }

  async editCard(
    scope: BoardScope,
    boardId: string,
    cardId: string,
    patch: UpdateCardInput,
    identity: BoardCommandIdentity = {},
  ) {
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
      const wakeTrigger = boardWakeTrigger(identity, `card:${cardId}:updated`)
      await this.wake(scope.companyId, scope.userId, mentions, wakeTrigger)
      if (patch.assigneeId) {
        await this.wake(scope.companyId, scope.userId, [patch.assigneeId], wakeTrigger)
      }
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

  async moveCard(scope: BoardScope, boardId: string, cardId: string, columnId: string) {
    const current = await currentCard(this.db, { ...scope, boardId, cardId })
    if (!current) throw new BoardApplicationError('not_found', 'not found')
    const position = await this.infrastructure.transaction((db) => moveCardToColumn(db, {
      ...scope, boardId, cardId, columnId,
    }))
    if (position === null) throw new BoardApplicationError('not_found', 'column not found')
    await this.publish(scope, { kind: 'card.moved', boardId, cardId, columnId })
    return { fromColumnId: current.column_id, columnId, position }
  }

  async claimCard(scope: BoardScope, boardId: string, cardId: string) {
    const result = await this.infrastructure.transaction((db) => claimCardForAgent(db, {
      ...scope, boardId, cardId, agentId: scope.userId,
    }))
    if (result.outcome === 'not_found') throw new BoardApplicationError('not_found', 'not found')
    if (result.outcome === 'claimed') {
      await this.publish(scope, { kind: 'card.updated', boardId, cardId })
    }
    return result
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

  async addComment(
    scope: BoardScope,
    boardId: string,
    cardId: string,
    body: string,
    identity: BoardCommandIdentity = {},
  ) {
    const mentions = await this.mentions(scope.companyId, body)
    const id = identity.idempotencyKey
      ? stableBoardId('cmt-agent', identity.idempotencyKey)
      : `cmt-${randomUUID().slice(0, 12)}`
    const outcome = await this.infrastructure.transaction((db) => appendComment(db, {
      ...scope, boardId, cardId, id, body, mentions,
    }))
    if (outcome === 'not_found') throw new BoardApplicationError('not_found', 'not found')
    let effectiveMentions = mentions
    if (outcome === 'replayed') {
      effectiveMentions = (await listComments(this.db, { ...scope, boardId, cardId }))
        .find((comment) => comment.id === id)?.mentions ?? []
    }
    if (outcome === 'created') {
      await this.publish(scope, { kind: 'comment.created', boardId, cardId, commentId: id, mentions })
    }
    await this.wake(
      scope.companyId,
      scope.userId,
      effectiveMentions,
      boardWakeTrigger(identity, `comment:${id}:created`),
    )
    return {
      id,
      mentions: effectiveMentions,
      ...(identity.idempotencyKey ? { replayed: outcome === 'replayed' } : {}),
    }
  }

  async removeComment(scope: BoardScope, boardId: string, cardId: string, commentId: string) {
    if (!await deleteComment(this.db, { ...scope, boardId, cardId, commentId })) {
      throw new BoardApplicationError('not_found', 'not found')
    }
    await this.publish(scope, { kind: 'comment.deleted', boardId, cardId, commentId })
    return { ok: true as const }
  }

  async mentionInbox(scope: Pick<BoardScope, 'companyId' | 'userId'>, peek: boolean) {
    return this.infrastructure.transaction(async (db) => {
      const window = peek
        ? await readBoardMentionWindow(db, scope.userId)
        : await lockBoardMentionWindow(db, scope.userId)
      const [cards, comments] = await Promise.all([
        listBoardMentionCards(db, { ...scope, ...window }),
        listBoardMentionComments(db, { ...scope, ...window }),
      ])
      if (!peek) await advanceBoardMentionCursor(db, scope.userId, window.until)
      return { since: window.since, until: window.until, cards, comments }
    })
  }

  private async mentions(companyId: string, text: string): Promise<string[]> {
    return parseBoardMentions(text, await mentionTargets(this.db, companyId))
  }

  private async wake(
    companyId: string,
    actorId: string,
    participants: string[] | undefined,
    triggerClientMsgNo: string,
  ): Promise<void> {
    const targets = [...new Set((participants ?? []).filter((id) => id !== actorId))]
    const agents = await mentionedAgents(this.db, companyId, targets)
    await Promise.all(agents.map((agentId) => (
      this.infrastructure.enqueueAgent({ companyId, agentId, reason: 'mention', triggerClientMsgNo })
    )))
  }

  private async publish(
    scope: BoardScope,
    event: Omit<BoardEventInput, 'companyId' | 'workspaceId' | 'actorId'>,
  ): Promise<void> {
    const published = {
      ...event, companyId: scope.companyId, workspaceId: scope.projectId, actorId: scope.userId,
    }
    try {
      await this.infrastructure.publish(published)
    } catch (error) {
      this.infrastructure.reportPublishFailure(published, error)
    }
  }
}

function stableBoardId(prefix: string, idempotencyKey: string, length = 32): string {
  return `${prefix}-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, length)}`
}

function boardWakeTrigger(identity: BoardCommandIdentity, fallback: string): string {
  return identity.idempotencyKey
    ? `board-action:${createHash('sha256').update(identity.idempotencyKey).digest('hex').slice(0, 32)}`
    : `${fallback}:${randomUUID()}`
}
