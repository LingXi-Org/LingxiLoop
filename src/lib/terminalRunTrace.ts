import { z } from 'zod'

export const terminalRunTraceReferenceSchema = z.object({ version: z.literal(1), runId: z.string().min(1).max(512),
  requestVersion: z.number().int().positive(), fence: z.number().int().nonnegative().optional(),
  feedbackId: z.string().min(1).max(512) }).strict()
export type TerminalRunTraceReference = z.infer<typeof terminalRunTraceReferenceSchema>

/** Old terminal receipts can recover only while the exact feedback is current.
 * A missing fence is resolved by the authorized server, never guessed here. */
export function terminalRunTraceReference(custom: Record<string, unknown>): TerminalRunTraceReference | undefined {
  if (!['failed','cancelled'].includes(String(custom.terminalStatus))) return undefined
  const parsed = terminalRunTraceReferenceSchema.safeParse(custom.runTraceReference ?? { version: 1,
    runId: custom.runId, requestVersion: custom.requestVersion, feedbackId: custom.terminalFeedbackId })
  if (!parsed.success || parsed.data.runId !== custom.runId || parsed.data.requestVersion !== custom.requestVersion
    || parsed.data.feedbackId !== custom.terminalFeedbackId) return undefined
  return parsed.data
}
