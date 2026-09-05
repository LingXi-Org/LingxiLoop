import { z } from 'zod'

const idempotencyKey = z.string().trim().min(1).max(160)

export const requestProjectTransferSchema = z.object({
  targetCompanyId: z.string().trim().min(1).max(200),
  idempotencyKey,
}).strict()

export const confirmProjectTransferSchema = z.object({ idempotencyKey }).strict()

export const resolveProjectTransferSchema = z.object({
  reason: z.string().trim().min(1).max(500),
  idempotencyKey,
}).strict()

export type RequestProjectTransferInput = z.infer<typeof requestProjectTransferSchema>
export type ConfirmProjectTransferInput = z.infer<typeof confirmProjectTransferSchema>
export type ResolveProjectTransferInput = z.infer<typeof resolveProjectTransferSchema>
