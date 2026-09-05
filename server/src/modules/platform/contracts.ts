import { z } from 'zod'

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

export const presignUploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(200)
    .refine((name) => !/[\\/\u0000-\u001f\u007f]/.test(name), 'invalid file name'),
  mime: z.string().trim().min(1).transform((value) => value.toLowerCase()),
  size: z.number().finite().positive().max(MAX_UPLOAD_BYTES),
}).strict()

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
  agentOs: boolean
  openNotebook: boolean
}
