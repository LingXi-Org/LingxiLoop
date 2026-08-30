import { z } from 'zod'

export const createEducationCompanyRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  planId: z.string().trim().min(1).max(200),
  contract: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    seatLimit: z.number().int().positive(),
    config: z.record(z.string(), z.unknown()).default({}),
  }).strict(),
  idempotencyKey: z.string().trim().min(1).max(160),
}).strict().refine((value) => Date.parse(value.contract.endsAt) > Date.parse(value.contract.startsAt), {
  message: 'contract endsAt must be after startsAt', path: ['contract', 'endsAt'],
}).refine((value) => JSON.stringify(value.contract.config).length <= 32_768, {
  message: 'contract config exceeds 32768 characters', path: ['contract', 'config'],
})

export type CreateEducationCompanyInput = z.infer<typeof createEducationCompanyRequestSchema>
