import { z } from 'zod'

export type TrustAudienceLevel = 'L2' | 'L3'

export interface TrustKpi {
  id: string
  label: string
  value: number
  threshold: number
  numerator: number
  denominator: number
  window: { from: string; to: string }
  source: string
  dataset: string
  release: string
  updatedAt: string
  evidenceId: string
}

export const createTrustSnapshotRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
}).strict()

export type CreateTrustSnapshotRequest = z.infer<typeof createTrustSnapshotRequestSchema>
