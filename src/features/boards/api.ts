
import { http } from '@/api/core/http'
import type {
  BoardCardComment,
  BoardCardLookup,
  BoardSnapshot,
  BoardSummary,
} from './contracts'

export const boardsApi = {
  listBoards: () => http<BoardSummary[]>('/boards'),
  getBoard: (id: string) => http<BoardSnapshot>(`/boards/${encodeURIComponent(id)}`),
  getBoardCard: (id: string) => http<BoardCardLookup>(`/cards/${encodeURIComponent(id)}`),
  createBoard: (input: { title: string; description?: string }) =>
    http<{ id: string }>('/boards', { method: 'POST', body: JSON.stringify(input) }),
  updateBoard: (id: string, input: { title?: string; description?: string }) =>
    http<{ ok: boolean }>(`/boards/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(input),
    }),
  deleteBoard: (id: string) =>
    http<{ ok: boolean }>(`/boards/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addBoardColumn: (boardId: string, title: string) =>
    http<{ id: string; position: number }>(
      `/boards/${encodeURIComponent(boardId)}/columns`,
      { method: 'POST', body: JSON.stringify({ title }) },
    ),
  updateBoardColumn: (boardId: string, columnId: string, input: { title?: string; position?: number }) =>
    http<{ ok: boolean }>(
      `/boards/${encodeURIComponent(boardId)}/columns/${encodeURIComponent(columnId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  deleteBoardColumn: (boardId: string, columnId: string) =>
    http<{ ok: boolean }>(
      `/boards/${encodeURIComponent(boardId)}/columns/${encodeURIComponent(columnId)}`,
      { method: 'DELETE' },
    ),
  createCard: (boardId: string, input: {
    columnId: string; title: string; description?: string; assigneeId?: string | null
  }) =>
    http<{ id: string; position: number; mentions: string[] }>(
      `/boards/${encodeURIComponent(boardId)}/cards`,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  updateCard: (boardId: string, cardId: string, input: {
    title?: string; description?: string; position?: number
    columnId?: string; assigneeId?: string | null
  }) =>
    http<{ ok: boolean; mentions?: string[] }>(
      `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  deleteCard: (boardId: string, cardId: string) =>
    http<{ ok: boolean }>(
      `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}`,
      { method: 'DELETE' },
    ),
  listCardComments: (boardId: string, cardId: string) =>
    http<BoardCardComment[]>(
      `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/comments`,
    ),
  addCardComment: (boardId: string, cardId: string, body: string) =>
    http<{ id: string; mentions: string[] }>(
      `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/comments`,
      { method: 'POST', body: JSON.stringify({ body }) },
    ),
  deleteCardComment: (boardId: string, cardId: string, commentId: string) =>
    http<{ ok: boolean }>(
      `/boards/${encodeURIComponent(boardId)}/cards/${encodeURIComponent(cardId)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' },
    )
}
