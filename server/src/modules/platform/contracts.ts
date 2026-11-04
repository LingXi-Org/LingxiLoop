import { z } from 'zod'

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

export const presignUploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(200)
    .refine((name) => !/[\\/\u0000-\u001f\u007f]/.test(name), 'invalid file name'),
  mime: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  documentId: z.string().min(1).optional(),
  size: z.number().finite().positive().max(MAX_UPLOAD_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  idempotencyKey: z.string().uuid().optional(),
}).strict()
  .refine(value => Boolean(value.sha256) === Boolean(value.idempotencyKey), 'upload checksum and identity must be supplied together')

export const refreshUploadUrlRequestSchema = z.object({
  key: z.string().trim().min(1),
}).strict()

export interface UploadCapabilities {
  mode: 'r2'
  presignSupported: true
  maxBytes: number
  allowedMimes: string[]
}

export interface DependencyReadiness {
  database: boolean
  redis: boolean
  openNotebook: boolean
}
