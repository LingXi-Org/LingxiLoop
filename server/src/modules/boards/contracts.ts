import { z } from 'zod'

export const createBoardRequestSchema = z.object({
  title: z.string().trim().min(1, 'title required').max(200),
  description: z.string().trim().max(4000).optional(),
}).strict()

export const updateBoardRequestSchema = z.object({
  title: z.string().trim().min(1, 'title required').max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
}).strict()

export const createColumnRequestSchema = z.object({
  title: z.string().trim().min(1, 'title required').max(100),
}).strict()

export const updateColumnRequestSchema = z.object({
  title: z.string().trim().min(1, 'title required').max(100).optional(),
  position: z.number().finite().optional(),
}).strict()

export const createCardRequestSchema = z.object({
  columnId: z.string().trim().min(1, 'columnId required').max(200),
  title: z.string().trim().min(1, 'title required').max(200),
  description: z.string().trim().max(8000).optional(),
  assigneeId: z.string().trim().min(1).max(200).nullable().optional(),
}).strict()

export const updateCardRequestSchema = z.object({
  title: z.string().trim().min(1, 'title required').max(200).optional(),
  description: z.string().trim().max(8000).nullable().optional(),
  position: z.number().finite().optional(),
  columnId: z.string().trim().min(1).max(200).optional(),
  assigneeId: z.string().trim().min(1).max(200).nullable().optional(),
}).strict()

export const createCommentRequestSchema = z.object({
  body: z.string().trim().min(1, 'body required').max(8000),
}).strict()

export type CreateBoardInput = z.infer<typeof createBoardRequestSchema>
export type UpdateBoardInput = z.infer<typeof updateBoardRequestSchema>
export type UpdateColumnInput = z.infer<typeof updateColumnRequestSchema>
export type CreateCardInput = z.infer<typeof createCardRequestSchema>
export type UpdateCardInput = z.infer<typeof updateCardRequestSchema>

export interface BoardScope {
  userId: string
  companyId: string
  projectId: string
}

export interface BoardEventInput {
  companyId: string
  workspaceId: string
  kind: 'board.created' | 'board.updated' | 'board.deleted'
    | 'column.created' | 'column.updated' | 'column.deleted'
    | 'card.created' | 'card.updated' | 'card.moved' | 'card.deleted'
    | 'comment.created' | 'comment.deleted'
  boardId: string
  cardId?: string
  columnId?: string
  commentId?: string
  mentions?: string[]
  actorId: string
}
