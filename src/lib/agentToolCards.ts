import { z } from 'zod'
const evaluation = z.object({ evaluationId: z.string().max(500), status: z.enum(['ACCEPTED','PENDING','REJECTED']), display: z.object({ demonstratedLevel: z.number().min(0).max(4),
  rubricResults: z.array(z.object({ label: z.string().max(500), score: z.number().min(0).max(4), weight: z.number().positive(), note: z.string().max(4000).optional() })).min(1).max(100) }) })
const homeworkDraft = z.object({ result: z.object({ homeworkId: z.string().min(1).max(200), courseId: z.string().min(1).max(200), revision: z.number().int().min(1) }) })
export const CARD_RESULT_ACTIONS = ['learning.propose_evaluation', 'teacher.draft_homework'] as const
/** Explicit public fields only; strips mail, private notes and unrelated provider data. */
export function toolCardResult(action: string, value: unknown): unknown {
  const schema = action === 'learning.propose_evaluation' ? evaluation : action === 'teacher.draft_homework' ? homeworkDraft : undefined
  const result = schema?.safeParse(action === 'learning.propose_evaluation' && value && typeof value === 'object' ? Reflect.get(value, 'result') : value)
  return result?.success ? result.data : undefined
}
