import { z } from 'zod'

const capabilitySchema = z.enum(['canvas', 'web', 'files', 'email', 'documents', 'calendar', 'knowledge', 'learning'])

export const createAgentRequestSchema = z.object({
  name: z.string().trim().min(1, 'name required').max(80),
  role: z.string().trim().max(160).default(''),
  systemPrompt: z.string().trim().min(10, 'systemPrompt required (at least 10 chars — describe the agent\'s style)').max(20_000),
  bio: z.string().max(2_000).default(''),
  capabilities: z.array(capabilitySchema).max(8).default(['canvas', 'web', 'files', 'email', 'documents']),
}).strict()

export const updateAgentRequestSchema = createAgentRequestSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'nothing to update',
)

export const preferencesRequestSchema = z.record(z.string(), z.unknown())
export const autonomyRequestSchema = z.object({ threshold: z.coerce.number().min(0).max(1) }).strict()

export type CreateAgentInput = z.infer<typeof createAgentRequestSchema>
export type UpdateAgentInput = z.infer<typeof updateAgentRequestSchema>
export interface AgentScope { userId: string; companyId: string }
export interface ParticipantScope extends AgentScope { projectId: string }
