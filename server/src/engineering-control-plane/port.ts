import { z } from 'zod'

export const ENGINEERING_L4_SOURCES = [
  'AGENT_RUN',
  'TOOL_CALL',
  'RAG_TRACE',
  'LLM_LEDGER',
  'EVAL',
  'SAFETY',
  'METRIC',
  'LOG',
] as const

export type EngineeringL4Source = typeof ENGINEERING_L4_SOURCES[number]

export const engineeringControlPlaneIdentitySchema = z.object({
  audience: z.literal('ENGINEERING_CONTROL_PLANE'),
  deploymentId: z.string().trim().min(1).max(200),
}).strict()

export const engineeringL4ReadRequestSchema = z.object({
  sources: z.array(z.enum(ENGINEERING_L4_SOURCES)).min(1).max(ENGINEERING_L4_SOURCES.length),
  companyId: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.number().int().min(1).max(100),
}).strict()

export type EngineeringControlPlaneIdentity = z.infer<typeof engineeringControlPlaneIdentitySchema>
export type EngineeringL4ReadRequest = z.infer<typeof engineeringL4ReadRequestSchema>

export interface EngineeringL4Record {
  source: EngineeringL4Source
  recordId: string
  companyId: string | null
  occurredAt: string
  payload: unknown
}

export interface EngineeringL4Page {
  records: EngineeringL4Record[]
  nextCursor: string | null
}

/**
 * Boundary implemented only by the independently deployed Engineering Control Plane.
 * Transport authentication establishes the deployment identity before this port is called;
 * product identities and product permissions never authorize L4 reads.
 */
export interface EngineeringControlPlanePort {
  readPage(
    identity: EngineeringControlPlaneIdentity,
    request: EngineeringL4ReadRequest,
  ): Promise<EngineeringL4Page>
}
