import { BoardApplicationError } from './application.js'
import type {
  BoardCommandIdentity,
  BoardScope,
  CreateBoardInput,
  CreateCardInput,
  UpdateBoardInput,
  UpdateCardInput,
  UpdateColumnInput,
} from './contracts.js'
import { boardApplication } from './facade.js'

type BoardReadScope = Omit<BoardScope, 'userId'>

export function isBoardNotFound(error: unknown): error is BoardApplicationError {
  return error instanceof BoardApplicationError && error.code === 'not_found'
}

export function listAgentBoards(scope: BoardReadScope) {
  return boardApplication.boards(scope)
}

export function getAgentBoard(scope: BoardReadScope, boardId: string) {
  return boardApplication.snapshot(scope, boardId)
}

export function createAgentBoard(
  scope: BoardScope,
  input: CreateBoardInput,
  identity: BoardCommandIdentity,
) {
  return boardApplication.createBoard(scope, input, identity)
}

export function updateAgentBoard(scope: BoardScope, boardId: string, patch: UpdateBoardInput) {
  return boardApplication.editBoard(scope, boardId, patch)
}

export function deleteAgentBoard(scope: BoardScope, boardId: string) {
  return boardApplication.removeBoard(scope, boardId)
}

export function addAgentBoardColumn(scope: BoardScope, boardId: string, title: string) {
  return boardApplication.addColumn(scope, boardId, title)
}

export function updateAgentBoardColumn(
  scope: BoardScope,
  boardId: string,
  columnId: string,
  patch: UpdateColumnInput,
) {
  return boardApplication.editColumn(scope, boardId, columnId, patch)
}

export function deleteAgentBoardColumn(scope: BoardScope, boardId: string, columnId: string) {
  return boardApplication.removeColumn(scope, boardId, columnId)
}

export function getAgentBoardCard(scope: BoardReadScope, cardId: string) {
  return boardApplication.card(scope, cardId)
}

export function listAgentBoardCardComments(
  scope: BoardReadScope,
  boardId: string,
  cardId: string,
) {
  return boardApplication.comments(scope, boardId, cardId)
}

export function createAgentBoardCard(
  scope: BoardScope,
  boardId: string,
  input: CreateCardInput,
  identity: BoardCommandIdentity,
) {
  return boardApplication.createCard(scope, boardId, input, identity)
}

export function updateAgentBoardCard(
  scope: BoardScope,
  boardId: string,
  cardId: string,
  patch: UpdateCardInput,
  identity: BoardCommandIdentity = {},
) {
  return boardApplication.editCard(scope, boardId, cardId, patch, identity)
}

export function moveAgentBoardCard(
  scope: BoardScope,
  boardId: string,
  cardId: string,
  columnId: string,
) {
  return boardApplication.moveCard(scope, boardId, cardId, columnId)
}

export function claimAgentBoardCard(scope: BoardScope, boardId: string, cardId: string) {
  return boardApplication.claimCard(scope, boardId, cardId)
}

export function deleteAgentBoardCard(scope: BoardScope, boardId: string, cardId: string) {
  return boardApplication.removeCard(scope, boardId, cardId)
}

export function addAgentBoardCardComment(
  scope: BoardScope,
  boardId: string,
  cardId: string,
  body: string,
  identity: BoardCommandIdentity,
) {
  return boardApplication.addComment(scope, boardId, cardId, body, identity)
}

export function deleteAgentBoardCardComment(
  scope: BoardScope,
  boardId: string,
  cardId: string,
  commentId: string,
) {
  return boardApplication.removeComment(scope, boardId, cardId, commentId)
}

export function getAgentBoardMentionInbox(
  scope: Pick<BoardScope, 'companyId' | 'userId'>,
  peek: boolean,
) {
  return boardApplication.mentionInbox(scope, peek)
}
