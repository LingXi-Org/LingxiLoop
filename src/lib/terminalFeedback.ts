import { z } from 'zod'

/** Product failure scope, derived from structured runtime state and delivery
 * receipts. Visible text alone never proves an answer was delivered. */
export const terminalScopeSchema = z.enum(['response', 'follow_up', 'delivery', 'finalization', 'unknown'])
export type TerminalScope = z.infer<typeof terminalScopeSchema>
export const terminalFeedbackScopeSchema = z.object({
  scopeVersion: z.literal(1), scope: terminalScopeSchema,
}).strict()
