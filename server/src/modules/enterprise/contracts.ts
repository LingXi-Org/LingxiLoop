import { z } from 'zod'

export const governancePolicyKindSchema = z.enum([
  'PROVISIONING', 'RETENTION', 'RESIDENCY', 'REGION', 'SLA',
])
export type GovernancePolicyKind = z.infer<typeof governancePolicyKindSchema>

export const createOrganizationUnitRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentUnitId: z.string().trim().min(1).max(200).nullish().transform((value) => value ?? null),
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict()

const policyConfigSchema = z.record(z.string().trim().min(1).max(100), z.json())
  .refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 16_384, 'config exceeds 16 KiB')

export const putGovernancePolicyRequestSchema = z.object({
  policyVersion: z.string().trim().min(1).max(100),
  config: policyConfigSchema,
  expectedRevision: z.number().int().min(0),
}).strict()

export type CreateOrganizationUnitRequest = z.infer<typeof createOrganizationUnitRequestSchema>
export type PutGovernancePolicyRequest = z.infer<typeof putGovernancePolicyRequestSchema>
